"""Local document text extraction with explicit, user-facing failures."""

from __future__ import annotations

from io import BytesIO
from pathlib import PurePath
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

import pdfplumber
from fastapi import HTTPException


DOCX_TEXT_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"


def extract_document_text(filename: str, content: bytes) -> str:
    """Extract text from a PDF or DOCX, rejecting unusable uploads explicitly."""
    suffix = PurePath(filename or "").suffix.lower()
    try:
        if suffix == ".pdf":
            with pdfplumber.open(BytesIO(content)) as pdf:
                text = "\n".join((page.extract_text() or "") for page in pdf.pages)
        elif suffix == ".docx":
            with ZipFile(BytesIO(content)) as archive:
                document_xml = archive.read("word/document.xml")
            root = ElementTree.fromstring(document_xml)
            text = "\n".join(
                "".join(node.text or "" for node in paragraph.iter(DOCX_TEXT_NS)).strip()
                for paragraph in root.iter()
                if paragraph.tag.endswith("}p")
            )
        else:
            raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="The document could not be read. Please upload a valid PDF or DOCX file.") from exc

    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail="No readable text was found. This may be a scanned document and needs OCR support.",
        )
    return text.strip()
