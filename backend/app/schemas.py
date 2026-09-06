from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str; name: str; type: str; size: int
    page_count: Optional[int]; word_count: Optional[int]
    status: str; uploadedAt: Optional[datetime] = None
    analysis: Optional[Any] = None

    @classmethod
    def from_model(cls, m):
        return cls(
            id=m.id, name=m.name, type=m.type, size=m.size,
            page_count=m.page_count, word_count=m.word_count,
            status=m.status, uploadedAt=m.created_at,
            analysis=m.analysis,
        )


class SentenceOut(BaseModel):
    index: int; text: str; startTime: float; endTime: float


class AudioBookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str; documentId: str; documentName: str
    voice: str; speed: float; pitch: int
    duration: float; audioUrl: str
    sentences: list[SentenceOut]; status: str
    createdAt: Optional[datetime] = None

    @classmethod
    def from_model(cls, m, base_url: str):
        return cls(
            id=m.id, documentId=m.document_id,
            documentName=m.document.name if m.document else "",
            voice=m.voice, speed=m.speed, pitch=m.pitch,
            duration=m.duration,
            audioUrl=f"{base_url}/audio/{m.id}/stream",
            sentences=[SentenceOut(**s) for s in (m.sentences or [])],
            status=m.status, createdAt=m.created_at,
        )


class GenerateRequest(BaseModel):
    documentId: str; voice: str = "en-US-JennyNeural"
    speed: float = 1.0; pitch: int = 0


class HistoryOut(BaseModel):
    id: str; documentName: str; voice: str
    duration: float; progress: float
    lastPlayedAt: datetime; audioUrl: str
    completed: bool; resumeSentence: int
    audiobookId: str
    totalPages: Optional[int] = None
    totalSentences: int = 0
    stopChapterTitle: Optional[str] = None
    chapterCount: int = 0

    @classmethod
    def from_model(cls, m, base_url: str):
        ab = m.audio_book
        doc = ab.document
        sentences = ab.sentences or []
        total_sentences = len(sentences)
        resume = m.resume_sentence or 0
        total_pages = doc.page_count if doc else None

        # Determine which chapter the user stopped at.
        # Use fraction-based mapping (mirrors handleChapterJump in the frontend):
        #   resume / total_sentences  →  position fraction in the book
        #   chapter.wordOffset / totalWords  →  start fraction of that chapter
        stop_chapter = None
        chapter_count = 0
        if doc and doc.analysis:
            chapters = doc.analysis.get("chapters", [])
            chapter_count = len(chapters)
            if chapters and total_sentences > 0:
                meta = doc.analysis.get("metadata", {})
                total_words = meta.get("wordCount") or doc.word_count or 1
                resume_fraction = resume / total_sentences
                for ch in reversed(chapters):
                    ch_fraction = ch.get("wordOffset", 0) / total_words
                    if resume_fraction >= ch_fraction:
                        stop_chapter = ch.get("title")
                        break

        return cls(
            id=m.id, documentName=ab.document.name if ab.document else "",
            voice=ab.voice, duration=ab.duration, progress=m.progress,
            lastPlayedAt=m.last_played,
            audioUrl=f"{base_url}/audio/{ab.id}/stream",
            completed=(m.completed == "true"),
            resumeSentence=resume,
            audiobookId=ab.id,
            totalPages=total_pages,
            totalSentences=total_sentences,
            stopChapterTitle=stop_chapter,
            chapterCount=chapter_count,
        )


class ProgressUpdate(BaseModel):
    progress: Optional[float] = None
    resume_sentence: Optional[int] = None
    completed: Optional[bool] = None
