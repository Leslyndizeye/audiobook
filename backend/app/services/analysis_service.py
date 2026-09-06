"""Analyze document content: type detection, chapter detection, metadata extraction."""

import re
import statistics
from collections import Counter, defaultdict
from typing import Optional

# ─────────────────────────────────────────────────────────────────────────────
# Shared vocabulary
# ─────────────────────────────────────────────────────────────────────────────

_ORDINALS = (
    r'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|'
    r'eleventh|twelfth|thirteenth|fourteenth|fifteenth|'
    r'sixteenth|seventeenth|eighteenth|nineteenth|twentieth'
)
_NUMBERS = (
    r'\d+|[ivxlcdmIVXLCDM]+|'
    r'one|two|three|four|five|six|seven|eight|nine|ten|'
    r'eleven|twelve|thirteen|fourteen|fifteen|'
    r'sixteen|seventeen|eighteen|nineteen|twenty|'
    r'twenty[\s-]one|twenty[\s-]two|twenty[\s-]three|'
    r'thirty|forty|fifty'
)

# ─────────────────────────────────────────────────────────────────────────────
# Chapter pattern tiers  (lower tier number = higher confidence)
# All patterns are matched case-insensitively.
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# Architecture notes (drives pattern design)
#
# Dostoevsky / Russian-literature structure (e.g. White Nights):
#   FIRST NIGHT / SECOND NIGHT / NASTENKA'S HISTORY / THIRD NIGHT /
#   FOURTH NIGHT / MORNING  — all-caps, no Roman sub-sections.
#
# "Nastenka's History" reveals two needs:
#   (a) apostrophes inside ALL-CAPS titles (NASTENKA'S) must not block matching
#   (b) character-possessive embedded narratives ("[Name]'s [Story/History]")
#       are recognised as structural sections, not sub-headings
#
# "MORNING" reveals that standalone time-of-day words used as closing /
# opening sections must be Tier-2, not missed because they are single words.
#
# General episodic literature (Dickens, Tolstoy, Dostoevsky, Hardy …) tends to
# use: ordinal + unit (First Night), plain number (Night 1), standalone time
# word (Morning), or ALL-CAPS title with apostrophes.
# ─────────────────────────────────────────────────────────────────────────────

_CHAPTER_TIERS: list[tuple[int, str]] = [

    # ── Tier 1 — Explicit chapter/part/act/book keyword (most unambiguous) ──
    (1, rf'^(?:chapter|ch\.?)\s+(?:{_NUMBERS})(?:\s*[.:\-—]\s*.+)?$'),
    (1, rf'^part\s+(?:{_NUMBERS})(?:\s*[.:\-—]\s*.+)?$'),
    (1, rf'^(?:volume|book|tome)\s+(?:{_NUMBERS})(?:\s*[.:\-—]\s*.+)?$'),
    (1, rf'^act\s+(?:{_NUMBERS})(?:\s*[.:\-—]\s*.+)?$'),

    # ── Tier 2 — Named structural sections ───────────────────────────────────
    # Standard front/back matter
    (2, r'^(?:prologue|epilogue|introduction|preface|foreword|afterword|'
        r'interlude|intermission|coda|appendix|conclusion|postscript|'
        r'acknowledgements?|dedication|overture)\.?$'),

    # Standalone time-of-day chapter titles common in episodic literature.
    # "MORNING" closes White Nights; "DAWN", "DUSK", "MIDNIGHT" open/close
    # sections in Dickens, Hardy, Tolstoy etc.
    # NOTE: "night" and "day" are intentionally excluded — they are too
    # generic and collide with "FIRST NIGHT / SECOND NIGHT" running headers.
    (2, r'^(?:morning|evening|dawn|dusk|noon|midnight|'
        r'sunrise|sunset|twilight|daybreak|nightfall)\.?$'),

    # Ordinal + unit headings: "First Night", "SECOND DAY", "Third Chapter" …
    (2, rf'^(?:the\s+)?(?:{_ORDINALS})\s+'
        rf'(?:night|day|book|part|letter|tale|chapter|dream|'
        rf'evening|morning|week|year|act|scene|section|story|episode)\b'
        rf'(?:\s*[.:\-—]\s*.+)?$'),

    # Numbered unit headings: "Night 1", "Day 2", "Letter 3"
    # (These require a number so "Night" alone never matches here)
    (2, r'^(?:night|day|letter|tale|dream|evening|morning)\s+\d+\b'),

    # Character-possessive embedded narrative sections common in 19th-century
    # Russian and European fiction: "Nastenka's History", "Ivan's Confession",
    # "The Prince's Tale" — structural sub-narratives within a chapter
    # (Tier 2 so they appear alongside nights, not below them)
    (2, r"^[A-Z][A-Za-z']{1,20}'s\s+(?:history|story|tale|confession|"
        r"letter|dream|night|day|account|narrative|memoir|diary)\b"),
    # ALL-CAPS variant: "NASTENKA'S HISTORY" — apostrophe-safe version
    (2, r"^[A-Z][A-Z']{1,20}'S\s+(?:[A-Z]{2,}\s?)+$"),

    # ── Tier 3 — Standalone Roman numerals (sub-chapters inside novels) ─────
    (3, r'^[IVXLCDM]{1,6}\.?\s*$'),

    # ── Tier 4 — Standalone small Arabic numbers (sub-sections) ─────────────
    (4, r'^\d{1,2}\.\s*$'),

    # ── Tier 5 — ALL-CAPS titles (Gutenberg-style headings) ─────────────────
    # Multi-word: "FIRST NIGHT", "THE MEETING", "DARK NIGHT OF THE SOUL"
    (5, r'^[A-Z]{2,}(?:\s+[A-Z]{2,}){1,4}\s*$'),
    # Single word ≥ 5 letters (avoids matching short abbreviations like "OK"):
    # "MORNING", "PROLOGUE", "EPILOGUE" when written in all-caps
    (5, r'^[A-Z]{5,20}\s*$'),

    # ── Tier 6 — Title-case "The/A …" headings (weakest) ────────────────────
    (6, r'^(?:the|a)\s+[A-Z][a-z]{1,}(?:\s+[A-Za-z]{2,}){0,4}$'),
]

# Structural section words always kept alongside Tier-1 chapters
# (expands to include time-of-day closing sections)
_STRUCTURAL_RE = re.compile(
    r'^(?:prologue|epilogue|introduction|preface|foreword|afterword|'
    r'interlude|intermission|coda|appendix|conclusion|postscript|'
    r'acknowledgements?|dedication|overture|'
    r'morning|evening|dawn|dusk|noon|midnight|sunrise|sunset|'
    r'twilight|daybreak|nightfall)\.?$',
    re.IGNORECASE,
)

# Lines that are document noise — skip them entirely
_NOISE_PATTERNS = [
    r'^project gutenberg',
    r'^this (e-?book|book) may',
    r'^copyright',
    r'^isbn|issn',
    r'^published by',
    r'^printed in',
    r'^all rights reserved',
    r'^\*[\s\*]*\*\s*$',       # decorative * * *
    r'^[_\-=\*~]{3,}\s*$',    # decorative rule lines
    r'^\[?(end|start|beginning)\s+of',   # Gutenberg markers
    r'^end of (the\s+)?project',
]

# TOC entries look like: "First Night ........ 5" or "Chapter 1\t12"
_TOC_SUFFIX_RE = re.compile(r'[\.\s]{4,}\s*\d+\s*$|\t\s*\d+\s*$|\s{4,}\d{1,4}\s*$')

# ─────────────────────────────────────────────────────────────────────────────
# CV sections (used for document type detection)
# ─────────────────────────────────────────────────────────────────────────────

CV_SECTIONS = [
    'education', 'experience', 'work experience', 'professional experience',
    'employment', 'skills', 'technical skills', 'core competencies', 'competencies',
    'objective', 'career objective', 'summary', 'professional summary',
    'certifications', 'certificates', 'qualifications', 'references',
    'languages', 'publications', 'awards', 'honors', 'projects', 'internship',
    'volunteer', 'activities', 'profile',
]


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def analyze_document(text: str) -> dict:
    doc_type, subtype, confidence = _detect_type(text)
    NO_CHAPTERS = {"resume", "letter", "poetry", "script"}
    chapters = _detect_chapters(text) if doc_type not in NO_CHAPTERS else []
    metadata = _extract_metadata(text, doc_type)
    return {
        "type": doc_type,
        "subtype": subtype,
        "confidence": confidence,
        "chapters": chapters,
        "metadata": metadata,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Document type detection
# ─────────────────────────────────────────────────────────────────────────────

def _detect_type(text: str) -> tuple[str, str, float]:
    text_lower = text.lower()
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    first_300   = text[:300].lower()
    first_2000  = text[:2000].lower()
    last_600    = text[-600:].lower()
    word_count  = len(text.split())
    scores: dict[str, float] = {}

    # ── Resume / CV ─────────────────────────────────────────────────────────
    cv_section_count = sum(1 for s in CV_SECTIONS if re.search(rf'\b{re.escape(s)}\b', text_lower))
    cv_score = 0.0
    if cv_section_count >= 3:
        cv_score += 0.55 + (cv_section_count - 3) * 0.04
    if re.search(r'[\w.+-]+@[\w-]+\.[a-z]{2,}', text[:1500]):
        cv_score += 0.12
    if re.search(r'\+?[\d][\d\s\-\(\)]{7,}\d', text[:1500]):
        cv_score += 0.08
    if re.search(r'\b(linkedin|github|portfolio|orcid)\b', text_lower[:1500]):
        cv_score += 0.08
    if re.search(r'\b(20\d\d\s*[-–]\s*(20\d\d|present|current))\b', text_lower):
        cv_score += 0.08
    if cv_score >= 0.5:
        scores["resume"] = min(cv_score, 0.97)

    # ── Book ─────────────────────────────────────────────────────────────────
    chapter_count = len(_detect_chapters(text))
    book_score = 0.0
    if chapter_count >= 3:
        book_score = min(0.55 + chapter_count * 0.05, 0.97)
    elif chapter_count >= 1:
        book_score = 0.55
    if word_count > 20000:
        book_score = max(book_score, 0.70)
    elif word_count > 10000:
        book_score = max(book_score, 0.58)
    elif word_count > 5000:
        book_score = max(book_score, 0.45)
    if book_score > 0:
        scores["book"] = book_score

    # ── Letter ───────────────────────────────────────────────────────────────
    letter_score = 0.0
    has_greeting = bool(
        re.search(r'\bdear\s+\w', first_300) or
        re.search(r'\bto whom it may concern\b', first_300)
    )
    has_closing = bool(re.search(
        r'\b(sincerely|yours truly|best regards|warm regards|kind regards|'
        r'with regards|faithfully|affectionately|love,|cheers,)\b', last_600
    ))
    if has_greeting and has_closing:
        letter_score = 0.75
    elif has_greeting:
        letter_score = 0.35
    elif has_closing:
        letter_score = 0.25
    if letter_score and word_count < 3000:
        scores["letter"] = min(letter_score, 0.95)

    # ── Academic ─────────────────────────────────────────────────────────────
    academic = 0.0
    if re.search(r'\babstract\b', first_2000):
        academic += 0.3
    if re.search(r'\b(references|bibliography)\b', last_600):
        academic += 0.25
    if re.search(r'\b(et al\.|ibid|doi:|issn|isbn)\b', text_lower):
        academic += 0.25
    if re.search(r'\b(methodology|hypothesis|findings|results|discussion)\b', text_lower):
        academic += 0.12
    if academic:
        scores["academic"] = min(academic, 0.95)

    # ── Legal ────────────────────────────────────────────────────────────────
    legal = 0.0
    if re.search(r'\b(whereas|hereinafter|notwithstanding|pursuant to|hereby)\b', text_lower):
        legal += 0.35
    if re.search(r'\b(agreement|contract|party|parties|clause|provision)\b', text_lower):
        legal += 0.2
    if re.search(r'\b(court|plaintiff|defendant|jurisdiction|statute)\b', text_lower):
        legal += 0.2
    if legal:
        scores["legal"] = min(legal, 0.95)

    # ── Poetry ───────────────────────────────────────────────────────────────
    poetry = 0.0
    short_lines = sum(1 for l in lines if len(l) < 50)
    if lines and short_lines / len(lines) > 0.65 and word_count < 5000:
        poetry += 0.35
    if text.count('\n\n') > 5 and word_count < 3000:
        poetry += 0.2
    if poetry:
        scores["poetry"] = min(poetry, 0.9)

    # ── Script / Screenplay ──────────────────────────────────────────────────
    script = 0.0
    if re.search(r'\b(int\.|ext\.)\s', first_2000):
        script += 0.5
    if re.search(r'^\s{20,}\w', text, re.MULTILINE):
        script += 0.2
    if re.search(r'^(FADE IN:|FADE OUT:|CUT TO:)', text, re.MULTILINE):
        script += 0.25
    if script:
        scores["script"] = min(script, 0.95)

    # ── Report ───────────────────────────────────────────────────────────────
    report = 0.0
    if re.search(r'\b(executive summary|introduction|recommendations|conclusion|appendix)\b', first_2000):
        report += 0.3
    numbered = sum(1 for l in lines[:30] if re.match(r'^\d+\.\s+[A-Z]', l))
    if numbered >= 3:
        report += 0.2
    if report:
        scores["report"] = min(report, 0.9)

    # ── Article ──────────────────────────────────────────────────────────────
    article = 0.0
    if 300 < word_count < 8000:
        article += 0.25
    if re.search(r'\b(published|journalist|editor|columnist|reporter)\b', text_lower[:500]):
        article += 0.2
    if article:
        scores["article"] = article

    if not scores:
        return ("other", "general", 0.4)

    best = max(scores, key=scores.get)  # type: ignore[arg-type]
    subtype = _subtype(best, text_lower, word_count)
    return (best, subtype, round(scores[best], 2))


def _subtype(doc_type: str, text_lower: str, word_count: int = 0) -> str:
    subtypes: dict[str, dict[str, str]] = {
        "book": {
            "novel":      r'\b(she said|he said|whispered|murmured|replied|i thought|i walked|i felt|cried out)\b',
            "biography":  r'\b(was born|were born|born in \d{4}|died in \d{4}|autobiography|memoir|life of [A-Z])\b',
            "self-help":  r'\b(you can achieve|believe in yourself|success habits|mindset shift|this book will)\b',
            "non-fiction":r'\b(according to|research shows|studies show|data suggests|the author argues)\b',
        },
        "resume": {
            "academic cv":      r'\b(publications|research interests|phd|doctorate|thesis)\b',
            "technical resume": r'\b(github|programming|software|developer|engineer|python|javascript)\b',
            "resume":           r'\b(experience|skills|objective)\b',
        },
        "academic": {
            "thesis":         r'\b(thesis|dissertation|submitted to)\b',
            "essay":          r'\b(argue|contend|this essay|in conclusion)\b',
            "research paper": r'\b(abstract|methodology|results|discussion)\b',
        },
        "legal": {
            "contract":       r'\b(agreement|contract|party|parties)\b',
            "legislation":    r'\b(act|bill|statute|section)\b',
            "court document": r'\b(plaintiff|defendant|court|ruling)\b',
        },
        "letter": {
            "email":          r'\b(from:|to:|subject:|cc:)\b',
            "formal letter":  r'\b(dear sir|dear madam|to whom it may concern)\b',
            "personal letter": r'\b(love,|affectionately|miss you)\b',
        },
    }
    for sub, pattern in subtypes.get(doc_type, {}).items():
        if re.search(pattern, text_lower):
            return sub
    defaults = {
        "book": "novel" if word_count > 3000 else "short story",
        "resume": "resume", "academic": "paper", "legal": "document",
        "letter": "letter", "report": "report", "article": "article",
        "poetry": "poem", "script": "screenplay", "other": "general",
    }
    return defaults.get(doc_type, "general")


# ─────────────────────────────────────────────────────────────────────────────
# Chapter detection — multi-pass hierarchical engine
# ─────────────────────────────────────────────────────────────────────────────

def _detect_chapters(text: str) -> list[dict]:
    """
    Detect chapters with five passes:

    1. Collect raw candidates from every line, classified by tier.
       Skip noise lines and table-of-contents entries (dots+pagenumber).
    2. Remove TOC clusters: a dense group of matches near the document
       start whose titles reappear in the body is the table of contents.
    3. Remove running headers: the same title at near-uniform word
       intervals is a page header/footer, not a chapter boundary.
    4. Hierarchy reduction: keep only the highest-confidence tier.
       Roman-numeral sub-sections inside Tier-2 nights are dropped.
    5. Spacing filter: two chapters < min_gap words apart are either
       duplicates or sub-headings; the second is dropped.

    Each output chapter includes wordCount (words from this chapter
    start to the next) for estimated per-chapter listening time.
    """
    lines = text.split('\n')
    total_words = len(text.split())

    # ── Pass 1: raw candidate collection ──────────────────────────────────
    candidates: list[dict] = []
    char_pos = 0
    word_pos = 0

    for line in lines:
        stripped = line.strip()
        if stripped and 1 < len(stripped) < 120:
            if not _is_noise(stripped) and not _is_toc_entry(stripped):
                for tier, pattern in _CHAPTER_TIERS:
                    if re.match(pattern, stripped, re.IGNORECASE):
                        candidates.append({
                            'title':      stripped,
                            'tier':       tier,
                            'charOffset': char_pos,
                            'wordOffset': word_pos,
                        })
                        break
        char_pos += len(line) + 1
        word_pos  += len(line.split())

    if not candidates:
        return _contextual_chapters(lines, total_words)

    # ── Pass 2: remove TOC cluster ────────────────────────────────────────
    candidates = _remove_toc_cluster(candidates, total_words)

    # ── Pass 3: remove running headers ────────────────────────────────────
    candidates = _deduplicate_running_headers(candidates)

    # ── Pass 4: hierarchy reduction ───────────────────────────────────────
    candidates = _select_primary_tier(candidates)

    # ── Pass 5: spacing filter ────────────────────────────────────────────
    candidates = _filter_by_spacing(candidates, total_words)

    if not candidates:
        return _contextual_chapters(lines, total_words)

    # Sort final list
    candidates.sort(key=lambda c: c['charOffset'])

    # ── Compute per-chapter word count ────────────────────────────────────
    chapters = []
    for i, c in enumerate(candidates):
        next_word = candidates[i + 1]['wordOffset'] if i + 1 < len(candidates) else total_words
        chapters.append({
            'title':      c['title'],
            'charOffset': c['charOffset'],
            'wordOffset': c['wordOffset'],
            'wordCount':  max(0, next_word - c['wordOffset']),
        })

    return chapters


# ── Helpers ──────────────────────────────────────────────────────────────────

def _is_noise(line: str) -> bool:
    return any(re.match(p, line, re.IGNORECASE) for p in _NOISE_PATTERNS)


def _is_toc_entry(line: str) -> bool:
    """Lines like 'First Night .......... 15' or 'Chapter 1    15'."""
    return bool(_TOC_SUFFIX_RE.search(line))


def _remove_toc_cluster(candidates: list[dict], total_words: int) -> list[dict]:
    """
    Find and remove Table of Contents false positives.

    The percentage-based approach (first 10 %) fails when front matter is
    long (title page + translator note + dedication can push the TOC past
    the 10 % mark).  Instead we use cluster detection:

    A TOC is a tight group of 3+ candidates that all appear within
    MAX_TOC_SPAN words of each other AND whose normalised titles reappear
    later in the body.  This is position-independent and catches cases like
    White Nights where the TOC sits at ~12–15 % of the document.

    Safety: the cluster is only removed if titles genuinely overlap with
    later candidates — so short books with many closely-spaced genuine
    chapters are never incorrectly trimmed.
    """
    if len(candidates) < 6:          # need ≥ 3 TOC + ≥ 3 body candidates
        return candidates

    sorted_c = sorted(candidates, key=lambda c: c['wordOffset'])

    def norm(t: str) -> str:
        return re.sub(r'\s+', ' ', t.lower().strip())

    # TOC chapter titles are on consecutive lines → very tight word-offset cluster.
    # 1 000 words is generous even for a 30-chapter table of contents.
    MAX_TOC_SPAN = 1000

    # Find the tightest cluster of 3+ candidates in the first half of the doc
    best: list[int] = []
    for i in range(len(sorted_c)):
        if sorted_c[i]['wordOffset'] > total_words * 0.5:
            break                    # TOC never appears in the second half
        group = [i]
        for j in range(i + 1, len(sorted_c)):
            span = sorted_c[j]['wordOffset'] - sorted_c[i]['wordOffset']
            if span <= MAX_TOC_SPAN:
                group.append(j)
            else:
                break
        if len(group) >= 3 and len(group) > len(best):
            best = group

    if len(best) < 3:
        return candidates

    cluster_idx = set(best)
    cluster = [sorted_c[i] for i in best]
    rest    = [sorted_c[i] for i in range(len(sorted_c)) if i not in cluster_idx]

    if not rest:
        return candidates

    # Only strip the cluster when its titles reappear in the body.
    # No overlap = short book with genuine close-together chapters → keep all.
    cluster_titles = {norm(c['title']) for c in cluster}
    rest_titles    = {norm(c['title']) for c in rest}

    if cluster_titles & rest_titles:
        return rest

    return candidates


def _deduplicate_running_headers(candidates: list[dict]) -> list[dict]:
    """
    Group candidates by their *normalised* (lowercased) title so that
    'FIRST NIGHT' and 'First Night' are treated as the same heading.

    Rules per group:
    - 1 occurrence              → keep as-is
    - 2 occurrences, one ALL-CAPS and one title-case
        → the ALL-CAPS line is the actual chapter heading;
          the title-case line is the running page header — drop it
    - 3+ occurrences            → check for uniformly-spaced running header;
          if uniform: keep only the ALL-CAPS occurrence if one exists,
          otherwise keep the first occurrence
    - 2 occurrences, same case  → keep the first (earlier = actual heading)
    """
    by_norm: dict[str, list[dict]] = defaultdict(list)
    for c in candidates:
        key = re.sub(r'\s+', ' ', c['title'].lower().strip())
        by_norm[key].append(c)

    result: list[dict] = []
    for key, group in by_norm.items():
        group_sorted = sorted(group, key=lambda c: c['wordOffset'])

        if len(group_sorted) == 1:
            result.extend(group_sorted)
            continue

        all_caps  = [c for c in group_sorted if c['title'] == c['title'].upper()
                     and c['title'].replace(' ', '').isalpha()]
        non_caps  = [c for c in group_sorted if c not in all_caps]

        if len(group_sorted) == 2:
            if all_caps and non_caps:
                # ALL-CAPS = chapter heading; title-case = running header
                result.extend(all_caps)
            else:
                # Same casing twice → keep first (earlier = actual heading)
                result.append(group_sorted[0])
            continue

        # 3+ occurrences — check uniform spacing (classic running header)
        offsets = [c['wordOffset'] for c in group_sorted]
        gaps    = [offsets[i + 1] - offsets[i] for i in range(len(offsets) - 1)]
        avg_gap = sum(gaps) / len(gaps) if gaps else 0
        if avg_gap == 0:
            best = all_caps[0] if all_caps else group_sorted[0]
            result.append(best)
            continue
        cv = statistics.stdev(gaps) / avg_gap if len(gaps) > 1 else 1.0
        if cv < 0.35:
            best = all_caps[0] if all_caps else group_sorted[0]
            result.append(best)
        else:
            result.extend(group_sorted)

    return sorted(result, key=lambda c: c['charOffset'])


def _select_primary_tier(candidates: list[dict]) -> list[dict]:
    """
    Keep only the most-confident (lowest-numbered) tier that has >= 2
    occurrences, plus any standalone structural keywords (Prologue,
    Epilogue, …) from Tier 2 regardless of primary tier.

    Example: if 'First Night / Second Night / Third Night' (Tier 2) and
    'I. / II. / III.' (Tier 3 sub-sections) are both detected, Tier 2
    is primary and Tier 3 items are dropped.
    """
    if not candidates:
        return candidates

    tier_counts = Counter(c['tier'] for c in candidates)

    primary_tier: Optional[int] = None
    for tier in sorted(tier_counts.keys()):
        if tier_counts[tier] >= 2:
            primary_tier = tier
            break
    if primary_tier is None:
        primary_tier = min(tier_counts.keys())

    def keep(c: dict) -> bool:
        if c['tier'] <= primary_tier:           # type: ignore[operator]
            return True
        if _STRUCTURAL_RE.match(c['title']):    # always keep Prologue/Epilogue etc.
            return True
        return False

    return [c for c in candidates if keep(c)]


def _filter_by_spacing(candidates: list[dict], total_words: int) -> list[dict]:
    """
    Drop chapters that are fewer than min_gap words after the previous
    accepted chapter.  These are typically sub-headings or TOC leftovers.

    min_gap scales with document size:
      - Short novella (≤ 25 000 words): at least 200 words between chapters
      - Full novel (≤ 100 000 words):   at least total_words / 120
      - Epic (> 100 000 words):         at least total_words / 200

    White Nights (~21 000 words, 5 chapters): min_gap ≈ 200 words ✓
    """
    if len(candidates) <= 1:
        return candidates

    if total_words <= 25_000:
        min_gap = 200
    elif total_words <= 100_000:
        min_gap = max(200, total_words / 120)
    else:
        min_gap = max(200, total_words / 200)

    sorted_c = sorted(candidates, key=lambda c: c['wordOffset'])
    result = [sorted_c[0]]
    for c in sorted_c[1:]:
        if c['wordOffset'] - result[-1]['wordOffset'] >= min_gap:
            result.append(c)

    return result


def _contextual_chapters(lines: list[str], total_words: int) -> list[dict]:
    """
    Fallback when no pattern-based chapters are found.
    Detects short, blank-line-surrounded, capitalised lines that don't
    end with sentence-terminal punctuation.
    """
    blank = {i for i, l in enumerate(lines) if not l.strip()}
    candidates: list[dict] = []
    char_pos = 0
    word_pos = 0

    for i, line in enumerate(lines):
        stripped = line.strip()
        if (stripped and 3 < len(stripped) <= 60
                and stripped[0].isupper()
                and not re.match(r'^\d+$', stripped)
                and not re.search(r'[.!?,;:]$', stripped)):
            prev_blank = (i == 0) or ((i - 1) in blank)
            next_blank = (i == len(lines) - 1) or ((i + 1) in blank)
            if prev_blank and next_blank:
                candidates.append({
                    'title':      stripped,
                    'tier':       9,
                    'charOffset': char_pos,
                    'wordOffset': word_pos,
                })
        char_pos += len(line) + 1
        word_pos  += len(line.split())

    candidates = _filter_by_spacing(candidates, total_words)

    if not (2 <= len(candidates) <= 120):
        return []

    chapters = []
    for i, c in enumerate(candidates):
        next_word = candidates[i + 1]['wordOffset'] if i + 1 < len(candidates) else total_words
        chapters.append({
            'title':      c['title'],
            'charOffset': c['charOffset'],
            'wordOffset': c['wordOffset'],
            'wordCount':  max(0, next_word - c['wordOffset']),
        })
    return chapters


def _count_chapters(text: str) -> int:
    return len(_detect_chapters(text))


# ─────────────────────────────────────────────────────────────────────────────
# Metadata extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_metadata(text: str, doc_type: str) -> dict:
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    word_count = len(text.split())
    return {
        "title":  _guess_title(lines),
        "author": _guess_author(text, lines),
        "wordCount":                    word_count,
        "estimatedReadingMinutes":      max(1, round(word_count / 250)),
        "estimatedListeningMinutes":    max(1, round(word_count / 130)),
    }


def _guess_title(lines: list[str]) -> Optional[str]:
    for line in lines[:6]:
        if 3 < len(line) < 120 and not line[0].islower():
            if not re.match(r'^(chapter|part|section)\s+', line, re.IGNORECASE):
                return line
    return lines[0] if lines else None


def _guess_author(text: str, lines: list[str]) -> Optional[str]:
    for line in lines[:10]:
        m = re.match(r'^by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})$', line)
        if m:
            return m.group(1)
    m = re.search(r'author[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})', text[:500])
    if m:
        return m.group(1)
    return None
