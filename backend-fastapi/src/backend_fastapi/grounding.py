"""Fail-closed verification for answers generated from retrieved clauses."""

from __future__ import annotations

import re
from collections.abc import Iterable


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def verify_grounding(
    exact_quote: str,
    cited_clause_ids: Iterable[str],
    retrieved_clause_ids: Iterable[str],
    context: str,
) -> bool:
    """Accept only answers with a substantive quote and retrieved citations."""
    citations = {str(clause_id) for clause_id in cited_clause_ids if clause_id}
    retrieved = {str(clause_id) for clause_id in retrieved_clause_ids if clause_id}
    quote = _normalize(exact_quote or "")

    return bool(
        len(quote) >= 6
        and citations
        and citations.issubset(retrieved)
        and quote in _normalize(context)
    )
