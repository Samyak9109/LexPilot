#!/usr/bin/env python3
"""
eval/retrieval_eval.py — LexPilot Phase 3: Retrieval Metrics
=============================================================
Computes Precision@k, Recall@k, MRR, Hit Rate at k = 3, 5, 10.
Compares: base vector search  vs.  CrossEncoder reranker.

Run from repo root (requires uv env):
    cd backend-fastapi
    uv run python ../eval/retrieval_eval.py --doc-id <mongoDocumentId>

Or set EVAL_DOC_ID in .env and run without --doc-id.

Dependencies beyond main app:
    uv pip install sentence-transformers   (reranker comparison)
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from langchain_google_genai import GoogleGenerativeAIEmbeddings

try:
    from sentence_transformers import CrossEncoder
    _RERANKER_AVAILABLE = True
except ImportError:
    _RERANKER_AVAILABLE = False

# ---------------------------------------------------------------------------
# Paths & config
# ---------------------------------------------------------------------------
EVAL_DIR   = Path(__file__).parent
RESULTS_DIR = EVAL_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)

load_dotenv(EVAL_DIR.parent / "backend-fastapi" / ".env")
load_dotenv(EVAL_DIR.parent / ".env")

K_VALUES       = [3, 5, 10]
CANDIDATES     = 50
RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
MONGODB_URI    = os.getenv("MONGODB_URI", "mongodb://localhost:27017/lexpilot")
EVAL_DOC_ID    = os.getenv("EVAL_DOC_ID", "")


# ---------------------------------------------------------------------------
# Metric helpers
# ---------------------------------------------------------------------------

def precision_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    top = retrieved[:k]
    return sum(1 for r in top if r in relevant) / k if top else 0.0


def recall_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    if not relevant:
        return 0.0
    hits = sum(1 for r in retrieved[:k] if r in relevant)
    return hits / len(relevant)


def reciprocal_rank(retrieved: list[str], relevant: set[str]) -> float:
    for i, r in enumerate(retrieved, 1):
        if r in relevant:
            return 1.0 / i
    return 0.0


def hit_rate_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    return 1.0 if any(r in relevant for r in retrieved[:k]) else 0.0


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

def load_annotated_questions(doc_id: str) -> list[dict]:
    """Return only questions with real (non-placeholder) chunk IDs."""
    path = EVAL_DIR / "dataset.json"
    with open(path) as f:
        data = json.load(f)

    annotated, skip_placeholder, skip_unanswerable = [], 0, 0

    for q in data["questions"]:
        if q["category"] == "unanswerable":
            skip_unanswerable += 1
            continue
        ids = q.get("relevant_chunk_ids", [])
        if not ids or any(cid.startswith("CHUNK_") for cid in ids):
            skip_placeholder += 1
            continue
        q["_eval_doc_id"] = doc_id
        annotated.append(q)

    total = len(data["questions"])
    print(f"Dataset        : {total} total")
    print(f"  Annotated    : {len(annotated)}  ← will be evaluated")
    print(f"  Unanswerable : {skip_unanswerable}  ← skipped (refusal test, not retrieval)")
    print(f"  Needs annot. : {skip_placeholder}  ← populate eval/dataset.json chunk IDs first")

    if not annotated:
        print()
        print("No annotated questions. See eval/README.md for annotation instructions.")

    return annotated


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

async def vector_search(
    db,
    embeddings_model: GoogleGenerativeAIEmbeddings,
    question: str,
    doc_id: str,
    limit: int = 10,
) -> tuple[list[dict[str, Any]], float]:
    """Atlas $vectorSearch → list of {clauseId, chunkText, score} + latency ms."""
    t0 = time.perf_counter()
    query_vector = embeddings_model.embed_query(question)
    embed_ms = (time.perf_counter() - t0) * 1000

    doc_object_id = ObjectId(doc_id)
    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": CANDIDATES,
                "limit": limit,
                "filter": {"documentId": doc_object_id},
            }
        },
        {
            "$project": {
                "_id": 0,
                "clauseId": 1,
                "chunkText": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]

    t1 = time.perf_counter()
    try:
        results = await db.document_chunks.aggregate(pipeline).to_list(length=limit)
    except Exception as exc:
        print(f"    [WARN] Atlas search failed ({exc}); falling back to scan")
        results = await db.document_chunks.find(
            {"documentId": doc_object_id}
        ).limit(limit).to_list(length=limit)
    search_ms = (time.perf_counter() - t1) * 1000

    return results, embed_ms + search_ms


def rerank_results(
    results: list[dict[str, Any]],
    question: str,
    reranker: "CrossEncoder",
) -> tuple[list[dict[str, Any]], float]:
    """CrossEncoder rerank → sorted results + latency ms."""
    if not results:
        return results, 0.0
    pairs = [(question, r["chunkText"]) for r in results]
    t0 = time.perf_counter()
    scores = reranker.predict(pairs)
    rerank_ms = (time.perf_counter() - t0) * 1000
    for r, s in zip(results, scores):
        r["rerank_score"] = float(s)
    return sorted(results, key=lambda x: x["rerank_score"], reverse=True), rerank_ms


# ---------------------------------------------------------------------------
# Evaluation loop
# ---------------------------------------------------------------------------

async def run_eval(doc_id: str) -> dict:
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client.get_default_database()
    embeddings_model = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

    reranker = None
    if _RERANKER_AVAILABLE:
        print(f"\nLoading reranker : {RERANKER_MODEL}")
        reranker = CrossEncoder(RERANKER_MODEL)
        print("Reranker ready\n")
    else:
        print(
            "\n[WARN] sentence-transformers not installed — reranker column will show 'pending'."
            "\n       Install: uv pip install sentence-transformers\n"
        )

    questions = load_annotated_questions(doc_id)
    if not questions:
        client.close()
        return {}

    print(f"\nRunning {len(questions)} queries against doc {doc_id}\n")
    rows = []

    for i, q in enumerate(questions, 1):
        qid   = q["id"]
        qtext = q["question"]
        relevant = set(q["relevant_chunk_ids"])
        qdoc_id  = q.get("_eval_doc_id") or doc_id

        print(f"[{i:02d}/{len(questions)}] {qid}: {qtext[:70]}...")

        raw_results, retrieval_ms = await vector_search(
            db, embeddings_model, qtext, qdoc_id, limit=10
        )
        base_ids = [str(r["clauseId"]) for r in raw_results]

        reranked_ids = base_ids
        rerank_ms = 0.0
        if reranker and raw_results:
            reranked_results, rerank_ms = rerank_results(raw_results, qtext, reranker)
            reranked_ids = [str(r["clauseId"]) for r in reranked_results]

        row: dict[str, Any] = {
            "id"          : qid,
            "category"    : q["category"],
            "retrieval_ms": round(retrieval_ms, 2),
            "rerank_ms"   : round(rerank_ms, 2),
        }
        for k in K_VALUES:
            row[f"base_p@{k}"]     = round(precision_at_k(base_ids,     relevant, k), 4)
            row[f"base_r@{k}"]     = round(recall_at_k(base_ids,        relevant, k), 4)
            row[f"base_hit@{k}"]   = round(hit_rate_at_k(base_ids,      relevant, k), 4)
            row[f"rerank_p@{k}"]   = round(precision_at_k(reranked_ids, relevant, k), 4)
            row[f"rerank_r@{k}"]   = round(recall_at_k(reranked_ids,    relevant, k), 4)
            row[f"rerank_hit@{k}"] = round(hit_rate_at_k(reranked_ids,  relevant, k), 4)
        row["base_mrr"]   = round(reciprocal_rank(base_ids,     relevant), 4)
        row["rerank_mrr"] = round(reciprocal_rank(reranked_ids, relevant), 4)

        rows.append(row)

    client.close()
    return {"questions": rows}


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def aggregate(rows: list[dict]) -> dict[str, float]:
    if not rows:
        return {}
    keys = [k for k in rows[0] if k not in ("id", "category")]
    agg: dict[str, float] = {}
    for k in keys:
        vals = [r[k] for r in rows if isinstance(r.get(k), (int, float))]
        agg[k] = round(sum(vals) / len(vals), 4) if vals else 0.0
    return agg


def aggregate_by_category(rows: list[dict]) -> dict[str, dict[str, float]]:
    cats: dict[str, list[dict]] = {}
    for r in rows:
        cats.setdefault(r["category"], []).append(r)
    return {cat: aggregate(cat_rows) for cat, cat_rows in cats.items()}


# ---------------------------------------------------------------------------
# Markdown renderer
# ---------------------------------------------------------------------------

def render_markdown(agg: dict, by_cat: dict, n: int) -> str:
    has_rr = _RERANKER_AVAILABLE

    def fmtv(v: float | None, pending_msg: str = "pending") -> str:
        return f"{v:.3f}" if (v is not None and has_rr) else pending_msg

    def delta(base_key: str, rr_key: str) -> str:
        if not has_rr:
            return "—"
        d = agg.get(rr_key, 0.0) - agg.get(base_key, 0.0)
        return f"{d:+.3f}"

    lines = [
        "## LexPilot — Retrieval Evaluation Results",
        "",
        f"| Config | Value |",
        f"|--------|-------|",
        f"| Questions evaluated | {n} |",
        f"| k values | {K_VALUES} |",
        f"| Embedding model | `gemini-embedding-001` |",
        f"| Vector DB | MongoDB Atlas Vector Search (`numCandidates={CANDIDATES}`) |",
        f"| Chunk strategy | structure-aware (heading+paragraph boundary) |",
        f"| Reranker | `{RERANKER_MODEL}` |",
        "",
        "### Overall Metrics",
        "",
        "| Metric | Base (vector only) | + CrossEncoder reranker | Δ |",
        "|--------|--------------------|------------------------|---|",
    ]

    metric_rows = [
        ("Precision@3",  "base_p@3",   "rerank_p@3"),
        ("Precision@5",  "base_p@5",   "rerank_p@5"),
        ("Precision@10", "base_p@10",  "rerank_p@10"),
        ("Recall@3",     "base_r@3",   "rerank_r@3"),
        ("Recall@5",     "base_r@5",   "rerank_r@5"),
        ("Recall@10",    "base_r@10",  "rerank_r@10"),
        ("Hit Rate@3",   "base_hit@3",  "rerank_hit@3"),
        ("Hit Rate@5",   "base_hit@5",  "rerank_hit@5"),
        ("Hit Rate@10",  "base_hit@10", "rerank_hit@10"),
        ("MRR",          "base_mrr",    "rerank_mrr"),
    ]
    for label, bk, rk in metric_rows:
        bv  = agg.get(bk, 0.0)
        rv  = agg.get(rk, 0.0)
        rr  = fmtv(rv)
        d   = delta(bk, rk)
        lines.append(f"| {label} | {bv:.3f} | {rr} | {d} |")

    lines += [
        "",
        "### Latency",
        "",
        "| Step | Avg (ms) |",
        "|------|---------|",
        f"| Embed + vector search | {agg.get('retrieval_ms', 0):.1f} |",
        f"| CrossEncoder rerank   | {agg.get('rerank_ms', 0):.1f} |",
        f"| Total (base)          | {agg.get('retrieval_ms', 0):.1f} |",
        f"| Total (+ reranker)    | {agg.get('retrieval_ms', 0) + agg.get('rerank_ms', 0):.1f} |",
    ]

    if by_cat:
        lines += ["", "### Breakdown by Question Category", ""]
        lines.append("| Category | n | P@5 (base) | R@5 (base) | MRR (base) | Hit@5 (base) |")
        lines.append("|----------|---|-----------|-----------|-----------|-------------|")
        for cat, cat_agg in by_cat.items():
            n_cat = sum(1 for r in [cat_agg] if cat_agg)
            lines.append(
                f"| {cat} | — "
                f"| {cat_agg.get('base_p@5', 0):.3f} "
                f"| {cat_agg.get('base_r@5', 0):.3f} "
                f"| {cat_agg.get('base_mrr', 0):.3f} "
                f"| {cat_agg.get('base_hit@5', 0):.3f} |"
            )

    lines += [
        "",
        "### Notes",
        "",
        "- **Fixed-token chunk comparison**: pending — requires re-ingesting documents with token-window splitter and a second Atlas index.",
        "- **Alternative embedding comparison**: pending — requires running `text-embedding-004` or `sentence-transformers/all-MiniLM-L6-v2` and re-indexing.",
        "- Reranker column is `pending` if `sentence-transformers` is not installed (`uv pip install sentence-transformers`).",
        "",
        f"_Generated: {datetime.date.today().isoformat()}_",
    ]

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="LexPilot retrieval evaluation (Phase 3)")
    p.add_argument("--doc-id", default=EVAL_DOC_ID,
                   help="MongoDB documentId (or set EVAL_DOC_ID in .env)")
    p.add_argument("--out-json", default=str(RESULTS_DIR / "retrieval_latest.json"))
    p.add_argument("--out-md",   default=str(RESULTS_DIR / "retrieval_latest.md"))
    return p.parse_args()


async def main() -> None:
    args = parse_args()

    if not args.doc_id:
        print("ERROR: --doc-id is required (or set EVAL_DOC_ID in .env)")
        print("       Upload a contract through LexPilot and copy the documentId from MongoDB.")
        sys.exit(1)

    print("=" * 60)
    print("  LexPilot Retrieval Evaluation — Phase 3")
    print("=" * 60)
    print(f"Document ID : {args.doc_id}")
    print(f"k values    : {K_VALUES}")
    print()

    result = await run_eval(args.doc_id)
    if not result:
        sys.exit(0)

    rows   = result["questions"]
    agg    = aggregate(rows)
    by_cat = aggregate_by_category(rows)

    # Save JSON
    date_str    = datetime.date.today().isoformat()
    dated_json  = RESULTS_DIR / f"retrieval_{date_str}.json"
    payload = {
        "date"            : date_str,
        "doc_id"          : args.doc_id,
        "n_questions"     : len(rows),
        "k_values"        : K_VALUES,
        "embedding_model" : "models/gemini-embedding-001",
        "reranker"        : RERANKER_MODEL if _RERANKER_AVAILABLE else None,
        "aggregate"       : agg,
        "by_category"     : by_cat,
        "per_question"    : rows,
    }
    for path in (args.out_json, str(dated_json)):
        with open(path, "w") as f:
            json.dump(payload, f, indent=2)

    # Save + print markdown
    md = render_markdown(agg, by_cat, len(rows))
    dated_md = RESULTS_DIR / f"retrieval_{date_str}.md"
    for path in (args.out_md, str(dated_md)):
        with open(path, "w") as f:
            f.write(md)

    print()
    print(md)
    print()
    print(f"JSON  → {dated_json}")
    print(f"MD    → {dated_md}")


if __name__ == "__main__":
    asyncio.run(main())
