"""Extract text from PDF, DOCX, TXT, RTF, ODT documents."""

import math
import re
from pathlib import Path

# Average words per printed page (used for non-PDF formats and PDF sanity check)
_WORDS_PER_PAGE = 300


def _est_pages(word_count: int) -> int:
    """Estimate page count from word count."""
    return max(1, math.ceil(word_count / _WORDS_PER_PAGE))


def extract_text(file_path: str, file_type: str) -> tuple[str, int, int]:
    """Returns (text, page_count, word_count)."""
    path = Path(file_path)

    if file_type == 'pdf':
        return _pdf(path)
    elif file_type == 'docx':
        return _docx(path)
    elif file_type == 'txt':
        return _txt(path)
    elif file_type == 'rtf':
        return _rtf(path)
    elif file_type == 'odt':
        return _odt(path)
    raise ValueError(f"Unsupported type: {file_type}")


def _pdf(path: Path):
    import fitz
    doc = fitz.open(str(path))
    pages = [page.get_text() for page in doc]
    text = "\n\n".join(pages)
    word_count = len(text.split())
    fitz_pages = len(doc)
    # Sanity-check the fitz page count against content.
    # If fitz reports far more pages than the word count suggests
    # (e.g. scanned / image-only PDF), fall back to word-count estimate.
    estimated = _est_pages(word_count)
    page_count = fitz_pages if fitz_pages <= estimated * 4 else estimated
    return text, page_count, word_count


def _docx(path: Path):
    from docx import Document
    doc = Document(str(path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    text = "\n\n".join(paragraphs)
    word_count = len(text.split())
    return text, _est_pages(word_count), word_count


def _txt(path: Path):
    text = path.read_text(encoding='utf-8', errors='replace')
    word_count = len(text.split())
    return text, _est_pages(word_count), word_count


def _rtf(path: Path):
    from striprtf.striprtf import rtf_to_text
    raw = path.read_text(encoding='utf-8', errors='replace')
    text = rtf_to_text(raw)
    word_count = len(text.split())
    return text, _est_pages(word_count), word_count


def _odt(path: Path):
    from odf.opendocument import load
    from odf.text import P
    doc = load(str(path))
    paragraphs = []
    for p in doc.getElementsByType(P):
        content = "".join(
            node.data for node in p.childNodes
            if hasattr(node, 'data')
        )
        if content.strip():
            paragraphs.append(content)
    text = "\n\n".join(paragraphs)
    word_count = len(text.split())
    return text, _est_pages(word_count), word_count


def split_sentences(text: str) -> list[str]:
    """Simple sentence splitter."""
    sentences = re.split(r'(?<=[.!?…])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip() and len(s.strip()) > 3]
