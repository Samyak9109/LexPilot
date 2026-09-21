"""Structure-aware document segmentation that preserves source offsets."""

from __future__ import annotations

import re


_PARAGRAPH_BREAK = re.compile(r"\n[ \t]*\n")


def _is_short_heading(text: str) -> bool:
    normalized = " ".join(text.split())
    return (
        "\n" not in text
        and len(normalized) <= 100
        and (
            bool(re.match(r"^(?:\d+(?:\.\d+)*[.)]?|[A-Z][A-Z\s]{2,})", normalized))
            or normalized.endswith(":")
        )
    )


def segment_document(text: str) -> list[dict[str, object]]:
    """Split on paragraph boundaries while keeping a heading with its section text."""
    raw_segments = []
    cursor = 0
    for part in re.split(r"(\n[ \t]*\n)", text):
        if _PARAGRAPH_BREAK.fullmatch(part):
            cursor += len(part)
            continue
        leading_whitespace = len(part) - len(part.lstrip())
        trailing_whitespace = len(part) - len(part.rstrip())
        content = part.strip()
        if content:
            start = cursor + leading_whitespace
            end = cursor + len(part) - trailing_whitespace
            raw_segments.append({"text": content, "source_span": (start, end)})
        cursor += len(part)
    segments: list[dict[str, object]] = []
    index = 0
    while index < len(raw_segments):
        current = raw_segments[index]
        if _is_short_heading(str(current["text"])) and index + 1 < len(raw_segments):
            following = raw_segments[index + 1]
            start = current["source_span"][0]  # type: ignore[index]
            end = following["source_span"][1]  # type: ignore[index]
            segments.append({"text": text[start:end], "source_span": (start, end)})
            index += 2
        else:
            segments.append(current)
            index += 1
    return segments
