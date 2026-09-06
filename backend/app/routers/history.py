from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.models import HistoryItem
from app.schemas import HistoryOut, ProgressUpdate

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=list[HistoryOut])
def list_history(request: Request, db: Session = Depends(get_db)):
    items = (
        db.query(HistoryItem)
        .order_by(HistoryItem.last_played.desc())
        .limit(50)
        .all()
    )
    base = str(request.base_url).rstrip("/")
    return [HistoryOut.from_model(i, base) for i in items]


@router.patch("/{item_id}")
def update_history_item(item_id: str, body: ProgressUpdate, db: Session = Depends(get_db)):
    item = db.query(HistoryItem).filter(HistoryItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    if body.progress is not None:
        item.progress = body.progress
    if body.resume_sentence is not None:
        item.resume_sentence = body.resume_sentence
    if body.completed is not None:
        item.completed = "true" if body.completed else "false"
    item.last_played = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.delete("/{item_id}")
def delete_history_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(HistoryItem).filter(HistoryItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/{item_id}/reset-resume")
def reset_resume(item_id: str, db: Session = Depends(get_db)):
    item = db.query(HistoryItem).filter(HistoryItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    item.resume_sentence = 0
    item.progress        = 0
    item.completed       = "false"
    item.last_played     = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
