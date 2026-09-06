"""TTS generation using edge-tts with word boundary timing."""

import asyncio
import os
import re
import tempfile
from pathlib import Path
from app.core.config import settings


async def generate_audiobook(
    text: str,
    voice: str,
    rate: str,
    pitch: str,
    output_path: str,
) -> tuple[float, list[dict]]:
    """Generate MP3 and return (duration_seconds, sentences_with_timing)."""
    import edge_tts

    sentences = _split_sentences(text)
    all_audio = bytearray()
    sentence_timing: list[dict] = []
    current_ms = 0.0

    for idx, sentence in enumerate(sentences):
        if not sentence.strip():
            continue
        comm = edge_tts.Communicate(sentence, voice, rate=rate, pitch=pitch)
        chunk_audio = bytearray()
        chunk_boundaries: list[dict] = []

        async for msg in comm.stream():
            if msg["type"] == "audio":
                chunk_audio.extend(msg["data"])
            elif msg["type"] == "WordBoundary":
                chunk_boundaries.append({
                    "offset_ms": msg["offset"] / 10_000,
                    "word": msg["text"],
                })

        if not chunk_audio:
            continue

        # Estimate duration from audio size (MP3 ~128kbps ≈ 16000 bytes/sec)
        chunk_duration_ms = len(chunk_audio) / 16.0

        sentence_timing.append({
            "index": idx,
            "text": sentence,
            "startTime": current_ms / 1000,
            "endTime": (current_ms + chunk_duration_ms) / 1000,
        })
        current_ms += chunk_duration_ms
        all_audio.extend(chunk_audio)

    # Write combined audio
    Path(output_path).write_bytes(bytes(all_audio))

    total_duration = current_ms / 1000
    return total_duration, sentence_timing


def _split_sentences(text: str) -> list[str]:  # also importable as public
    sentences = re.split(r'(?<=[.!?…])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip() and len(s.strip()) > 3]


async def list_voices() -> list[str]:
    import edge_tts
    voices = await edge_tts.list_voices()
    return [v["ShortName"] for v in voices if v["Locale"].startswith("en")]
