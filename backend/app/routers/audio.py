import base64
import json
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database import get_db, SessionLocal
from app.models import AudioBook, Document, HistoryItem
from app.schemas import AudioBookOut, GenerateRequest
from app.services.tts_service import list_voices

router = APIRouter(prefix="/audio", tags=["audio"])


@router.get("/voices")
async def get_voices():
    return await list_voices()


# ── Streaming generation ───────────────────────────────────────────────────
# NOTE: event_gen() runs AFTER the endpoint returns, so we must NOT use the
# dependency-injected `db` session (it gets closed on return).  We open a
# fresh session inside the generator instead.

@router.post("/generate-stream")
async def generate_stream(req: GenerateRequest, request: Request, db: Session = Depends(get_db)):
    # Validate document while the dep-injected session is still open
    doc = db.query(Document).filter(Document.id == req.documentId).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    # Snapshot everything we need — avoid touching `db` inside the generator
    doc_id    = doc.id
    doc_name  = doc.name
    doc_path  = doc.path
    doc_type  = doc.type
    book_id   = str(uuid.uuid4())
    out_path  = os.path.join(settings.audio_dir, f"{book_id}.mp3")
    rate      = f"{int((req.speed - 1) * 100):+d}%"
    pitch_str = f"{req.pitch:+d}Hz"
    base      = str(request.base_url).rstrip("/")

    async def event_gen():
        import edge_tts
        from app.services.document_service import extract_text
        from app.services.tts_service import _split_sentences

        stream_db  = SessionLocal()
        book       = None
        hist       = None
        all_audio: list[bytes] = []
        timing:    list[dict]  = []
        current_ms = 0.0

        try:
            book = AudioBook(
                id=book_id,
                document_id=doc_id,
                voice=req.voice,
                speed=req.speed,
                pitch=req.pitch,
                status="generating",
            )
            stream_db.add(book)

            # Create history item NOW — it will be saved even if generation is aborted.
            hist = HistoryItem(
                id=str(uuid.uuid4()),
                audio_book_id=book_id,
                progress=0,
            )
            stream_db.add(hist)
            stream_db.commit()

            def _sse(data: dict) -> str:
                return f"data: {json.dumps(data)}\n\n"

            text, _, _ = extract_text(doc_path, doc_type)
            sentences  = _split_sentences(text)
            total      = len(sentences)

            # Send historyItemId in start so the frontend knows it immediately.
            yield _sse({
                "type": "start", "total": total,
                "audiobookId": book_id, "historyItemId": hist.id,
                "document": doc_name,
            })

            for idx, sentence in enumerate(sentences):
                if not sentence.strip():
                    continue
                comm  = edge_tts.Communicate(sentence, req.voice, rate=rate, pitch=pitch_str)
                chunk = bytearray()
                async for msg in comm.stream():
                    if msg["type"] == "audio":
                        chunk.extend(msg["data"])

                if not chunk:
                    continue

                chunk_bytes = bytes(chunk)
                chunk_ms    = len(chunk_bytes) / 16.0
                timing.append({
                    "index":     idx,
                    "text":      sentence,
                    "startTime": current_ms / 1000,
                    "endTime":   (current_ms + chunk_ms) / 1000,
                })
                current_ms += chunk_ms
                all_audio.append(chunk_bytes)

                pct = round(((idx + 1) / total) * 100, 1)
                yield _sse({
                    "type":             "progress",
                    "index":            idx,
                    "total":            total,
                    "pct":              pct,
                    "sentence":         sentence[:120],
                    "sentenceAudioB64": base64.b64encode(chunk_bytes).decode("ascii"),
                })

            # Full generation complete — save combined MP3.
            Path(out_path).write_bytes(b"".join(all_audio))
            book.audio_path = out_path
            book.duration   = current_ms / 1000
            book.sentences  = timing
            book.status     = "ready"
            stream_db.commit()

            yield _sse({
                "type":          "done",
                "audiobookId":   book_id,
                "historyItemId": hist.id,
                "audioUrl":      f"{base}/audio/{book_id}/stream",
                "duration":      current_ms / 1000,
            })

        except Exception as exc:
            # Non-abort exception: report it (partial save happens in finally).
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

        finally:
            # Always runs — even on client abort (GeneratorExit) or exception.
            # If we generated any audio before stopping, save it so history is usable.
            if book and book.status == "generating":
                try:
                    if all_audio:
                        Path(out_path).write_bytes(b"".join(all_audio))
                        book.audio_path = out_path
                        book.duration   = current_ms / 1000
                        book.sentences  = timing
                        book.status     = "ready"   # partial but playable
                    else:
                        book.status = "error"
                    stream_db.commit()
                except Exception:
                    pass
            stream_db.close()

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Legacy blocking generate ───────────────────────────────────────────────

@router.post("/generate", response_model=AudioBookOut)
async def generate_audio(req: GenerateRequest, request: Request, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == req.documentId).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    book = AudioBook(
        id=str(uuid.uuid4()), document_id=doc.id,
        voice=req.voice, speed=req.speed, pitch=req.pitch, status="generating",
    )
    db.add(book); db.commit(); db.refresh(book)

    try:
        from app.services.celery_tasks import generate_audio_task
        generate_audio_task.delay(book.id)
    except Exception:
        await _generate_sync(book, doc, db)

    db.refresh(book)
    return AudioBookOut.from_model(book, str(request.base_url).rstrip("/"))


async def _generate_sync(book: AudioBook, doc: Document, db: Session):
    from app.services.document_service import extract_text
    from app.services.tts_service import generate_audiobook

    text, _, _ = extract_text(doc.path, doc.type)
    out_path   = os.path.join(settings.audio_dir, f"{book.id}.mp3")
    duration, sentences = await generate_audiobook(
        text, book.voice,
        f"{int((book.speed - 1) * 100):+d}%",
        f"{book.pitch:+d}Hz",
        out_path,
    )
    book.audio_path = out_path
    book.duration   = duration
    book.sentences  = sentences
    book.status     = "ready"
    db.commit()

    hist = HistoryItem(id=str(uuid.uuid4()), audio_book_id=book.id, progress=0)
    db.add(hist); db.commit()


@router.get("/{book_id}", response_model=AudioBookOut)
def get_audio(book_id: str, request: Request, db: Session = Depends(get_db)):
    book = db.query(AudioBook).filter(AudioBook.id == book_id).first()
    if not book:
        raise HTTPException(404, "Not found")
    return AudioBookOut.from_model(book, str(request.base_url).rstrip("/"))


@router.get("/{book_id}/stream")
def stream_audio(book_id: str, db: Session = Depends(get_db)):
    book = db.query(AudioBook).filter(AudioBook.id == book_id).first()
    if not book or not book.audio_path or not os.path.exists(book.audio_path):
        raise HTTPException(404, "Audio not ready")
    return FileResponse(
        book.audio_path,
        media_type="application/octet-stream",
        headers={"Accept-Ranges": "bytes", "Content-Disposition": "inline"},
    )
