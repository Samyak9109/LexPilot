"""Fail-closed verification for answers generated from retrieved clauses."""

from __future__ import annotations

import re
from collections.abc import Iterable
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


async def verify_grounding(
    exact_quote: str,
    cited_clause_ids: Iterable[str],
    retrieved_clause_ids: Iterable[str],
    context: str,
    db: AsyncIOMotorDatabase,
) -> bool:
    """
    Accept only answers with a substantive quote that exists in the ORIGINAL document text
    (via source_span in document_clauses), not just in the retrieved chunk text.
    """
    citations = {str(clause_id) for clause_id in cited_clause_ids if clause_id}
    retrieved = {str(clause_id) for clause_id in retrieved_clause_ids if clause_id}
    quote = _normalize(exact_quote or "")

    if not (len(quote) >= 6 and citations and citations.issubset(retrieved)):
        return False

    # Verify quote exists in the ORIGINAL document text via source_span
    # This is the architecture.md §6.3 requirement: "every cited source_span is
    # programmatically verified to exist (substring/fuzzy match) in the retrieved source chunk"
    for clause_id in citations:
        clause = await db.documentclauses.find_one({"_id": ObjectId(clause_id)})
        if not clause:
            return False
        original_text = clause.get("originalText", "")
        if quote not in _normalize(original_text):
            return False

    return True
