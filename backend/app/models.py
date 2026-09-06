from sqlalchemy import Column, String, Integer, Float, DateTime, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Document(Base):
    __tablename__ = "documents"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String, nullable=False)
    type        = Column(String, nullable=False)          # pdf/docx/txt/rtf/odt
    size        = Column(Integer, nullable=False)
    path        = Column(String, nullable=False)
    page_count  = Column(Integer, nullable=True)
    word_count  = Column(Integer, nullable=True)
    status      = Column(String, default="ready")
    analysis    = Column(JSON, nullable=True)
    created_at  = Column(DateTime(timezone=True), default=utcnow)

    audio_books = relationship("AudioBook", back_populates="document", cascade="all, delete")


class AudioBook(Base):
    __tablename__ = "audio_books"

    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id   = Column(String, ForeignKey("documents.id"), nullable=False)
    voice         = Column(String, nullable=False)
    speed         = Column(Float, default=1.0)
    pitch         = Column(Integer, default=0)
    duration      = Column(Float, default=0)
    audio_path    = Column(String, nullable=True)
    sentences     = Column(JSON, default=list)
    status        = Column(String, default="generating")  # generating/ready/error
    created_at    = Column(DateTime(timezone=True), default=utcnow)

    document      = relationship("Document", back_populates="audio_books")
    history_items = relationship("HistoryItem", back_populates="audio_book", cascade="all, delete")


class HistoryItem(Base):
    __tablename__ = "history_items"

    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    audio_book_id   = Column(String, ForeignKey("audio_books.id"), nullable=False)
    progress        = Column(Float, default=0)
    last_played     = Column(DateTime(timezone=True), default=utcnow)
    completed       = Column(String, default="false")   # "true"/"false" — SQLite safe
    resume_sentence = Column(Integer, default=0, nullable=True)

    audio_book      = relationship("AudioBook", back_populates="history_items")
