import asyncio
import os
from celery import Celery
from app.core.config import settings

celery_app = Celery("audiobook", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_serializer = "json"


@celery_app.task(bind=True, name="tasks.generate_audio")
def generate_audio_task(self, audio_book_id: str):
    """Background task: generate TTS audio for an AudioBook record."""
    from app.database import SessionLocal
    from app.models import AudioBook
    from app.services.tts_service import generate_audiobook
    from pathlib import Path

    db = SessionLocal()
    try:
        book = db.query(AudioBook).filter(AudioBook.id == audio_book_id).first()
        if not book:
            return

        doc = book.document
        text_path = doc.path + ".txt"
        if not os.path.exists(text_path):
            from app.services.document_service import extract_text
            text, _, _ = extract_text(doc.path, doc.type)
            Path(text_path).write_text(text, encoding="utf-8")
        else:
            text = Path(text_path).read_text(encoding="utf-8")

        out_path = os.path.join(settings.audio_dir, f"{audio_book_id}.mp3")
        rate  = f"{int((book.speed - 1) * 100):+d}%"
        pitch = f"{book.pitch:+d}Hz"

        duration, sentences = asyncio.run(
            generate_audiobook(text, book.voice, rate, pitch, out_path)
        )

        book.audio_path = out_path
        book.duration   = duration
        book.sentences  = sentences
        book.status     = "ready"
        db.commit()

    except Exception as exc:
        book = db.query(AudioBook).filter(AudioBook.id == audio_book_id).first()
        if book:
            book.status = "error"
            db.commit()
        raise self.retry(exc=exc, countdown=10, max_retries=2)
    finally:
        db.close()
