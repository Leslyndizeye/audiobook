import os
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Document
from app.schemas import DocumentOut
from app.services.document_service import extract_text
from app.services.analysis_service import analyze_document
from app.core.config import settings

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "application/rtf": "rtf",
    "application/vnd.oasis.opendocument.text": "odt",
}


@router.post("/upload", response_model=DocumentOut)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # Validate
    ext = Path(file.filename or "").suffix.lower().lstrip(".")
    ct  = file.content_type or ""
    file_type = ALLOWED_TYPES.get(ct) or ext
    if file_type not in ALLOWED_TYPES.values():
        raise HTTPException(400, f"Unsupported file type: {ext}")

    # Size check
    contents = await file.read()
    if len(contents) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, "File too large")

    # Save
    import uuid
    doc_id   = str(uuid.uuid4())
    save_dir = Path(settings.upload_dir) / doc_id
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / (file.filename or f"document.{file_type}")
    save_path.write_bytes(contents)

    # Extract text + metadata
    text = ""
    page_count = word_count = None
    try:
        text, page_count, word_count = extract_text(str(save_path), file_type)
    except Exception:
        pass

    # Analyze document content
    analysis = None
    if text.strip():
        try:
            analysis = analyze_document(text)
        except Exception:
            pass

    doc = Document(
        id=doc_id, name=file.filename or "document",
        type=file_type, size=len(contents),
        path=str(save_path), page_count=page_count,
        word_count=word_count, status="ready",
        analysis=analysis,
    )
    db.add(doc); db.commit(); db.refresh(doc)
    return DocumentOut.from_model(doc)


@router.get("", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db)):
    docs = db.query(Document).order_by(Document.created_at.desc()).all()
    return [DocumentOut.from_model(d) for d in docs]


@router.delete("/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Not found")
    # Remove files
    try:
        shutil.rmtree(Path(doc.path).parent, ignore_errors=True)
    except Exception:
        pass
    db.delete(doc); db.commit()
    return {"ok": True}


@router.post("/{doc_id}/analyze", response_model=DocumentOut)
def analyze_doc(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Not found")
    try:
        text, page_count, word_count = extract_text(doc.path, doc.type)
    except Exception as e:
        raise HTTPException(500, f"Could not read document: {e}")
    if not text.strip():
        raise HTTPException(422, "Document has no extractable text")
    doc.analysis   = analyze_document(text)
    doc.page_count = page_count
    doc.word_count = word_count
    db.commit(); db.refresh(doc)
    return DocumentOut.from_model(doc)


@router.get("/{doc_id}/to-word")
def convert_to_word(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Not found")
    if doc.type == "docx":
        return FileResponse(doc.path, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename=Path(doc.path).stem + ".docx")
    # Convert PDF → DOCX via text extraction
    from docx import Document as DocxDoc
    text, _, _ = extract_text(doc.path, doc.type)
    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
    d = DocxDoc()
    for para in text.split("\n\n"):
        if para.strip():
            d.add_paragraph(para.strip())
    d.save(tmp.name)
    return FileResponse(tmp.name, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename=Path(doc.name).stem + ".docx")
