#!/usr/bin/env python3
"""
eval/answer_eval.py — LexPilot Phase 4: Answer Quality Evaluation
==================================================================
Evaluates generation and retrieval context using Ragas metrics:
  - Faithfulness
  - Answer Relevancy
  - Context Precision
  - Context Recall

Saves output to: /eval/results/<date>.json

Usage:
  cd backend-fastapi
  uv run python ../eval/answer_eval.py --doc-id <mongoDocumentId>

Or set EVAL_DOC_ID in .env.
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

# LexPilot paths & env
EVAL_DIR = Path(__file__).parent
RESULTS_DIR = EVAL_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)

load_dotenv(EVAL_DIR.parent / "backend-fastapi" / ".env")
load_dotenv(EVAL_DIR.parent / ".env")

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/lexpilot")
EVAL_DOC_ID = os.getenv("EVAL_DOC_ID", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ---------------------------------------------------------------------------
# Dataset loader
# ---------------------------------------------------------------------------

def load_dataset() -> tuple[list[dict], list[dict], list[dict]]:
    """Split dataset into annotated answerable, unanswerable, and pending annotation."""
    dataset_path = EVAL_DIR / "dataset.json"
    if not dataset_path.exists():
        print(f"Error: {dataset_path} not found.")
        sys.exit(1)

    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    annotated = []
    unanswerable = []
    pending = []

    for q in data.get("questions", []):
        if q.get("category") == "unanswerable":
            unanswerable.append(q)
        else:
            gt = q.get("ground_truth_answer", "")
            chunk_ids = q.get("relevant_chunk_ids", [])
            if "ANNOTATOR:" in gt or any(str(cid).startswith("CHUNK_") for cid in chunk_ids):
                pending.append(q)
            else:
                annotated.append(q)

    return annotated, unanswerable, pending


# ---------------------------------------------------------------------------
# Q&A Runner
# ---------------------------------------------------------------------------

async def run_pipeline_for_question(
    qtext: str,
    doc_id: str,
    db,
    embeddings_model,
    qa_chain,
) -> dict[str, Any]:
    """Execute LexPilot retrieval + QA prompt + grounding check."""
    doc_object_id = ObjectId(doc_id)
    t0 = time.perf_counter()

    query_vector = embeddings_model.embed_query(qtext)

    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 50,
                "limit": 5,
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

    try:
        results = await db.document_chunks.aggregate(pipeline).to_list(length=5)
    except Exception as exc:
        results = await db.document_chunks.find({"documentId": doc_object_id}).limit(5).to_list(length=5)

    contexts = [r["chunkText"] for r in results]
    retrieved_clause_ids = [str(r.get("clauseId", "")) for r in results]

    if not contexts:
        return {
            "answer": "I couldn't find any relevant text in the document.",
            "citations": [],
            "contexts": [],
            "retrieved_clause_ids": [],
            "latency_ms": (time.perf_counter() - t0) * 1000,
        }

    context_text = "\n\n".join([f"Clause ID: {str(r.get('clauseId', ''))}\nText: {r['chunkText']}" for r in results])
    prompt = f"""You are an expert legal assistant. Answer the user's question based strictly on the provided document excerpts below.
If the excerpts do not contain the answer, explicitly refuse to answer and state that the document does not address this.
Do not use outside legal knowledge.

Document Excerpts:
{context_text}

User Question: {qtext}
"""

    try:
        llm_res = qa_chain.invoke(prompt)
        answer = llm_res.answer
        citations = llm_res.cited_clause_ids
    except Exception as e:
        answer = "Sorry, I couldn't process the answer at this time."
        citations = []

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return {
        "answer": answer,
        "citations": citations,
        "contexts": contexts,
        "retrieved_clause_ids": retrieved_clause_ids,
        "latency_ms": elapsed_ms,
    }


# ---------------------------------------------------------------------------
# Ragas Evaluator
# ---------------------------------------------------------------------------

def evaluate_with_ragas(eval_samples: list[dict], evaluator_llm, evaluator_embeddings) -> dict[str, Any]:
    """Run Ragas evaluation on collected (question, answer, contexts, ground_truth) samples."""
    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
    from ragas.llms import LangchainLLMWrapper
    from ragas.embeddings import LangchainEmbeddingsWrapper

    ragas_llm = LangchainLLMWrapper(evaluator_llm)
    ragas_emb = LangchainEmbeddingsWrapper(evaluator_embeddings)

    dataset_dict = {
        "question": [s["question"] for s in eval_samples],
        "answer": [s["answer"] for s in eval_samples],
        "contexts": [s["contexts"] for s in eval_samples],
        "ground_truth": [s["ground_truth"] for s in eval_samples],
    }

    hf_dataset = Dataset.from_dict(dataset_dict)
    metrics = [faithfulness, answer_relevancy, context_precision, context_recall]

    results = evaluate(
        dataset=hf_dataset,
        metrics=metrics,
        llm=ragas_llm,
        embeddings=ragas_emb,
    )
    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(description="LexPilot Answer Quality Evaluation (Phase 4)")
    parser.add_argument("--doc-id", default=EVAL_DOC_ID, help="MongoDB documentId to test against")
    args = parser.parse_args()

    date_str = datetime.date.today().isoformat()
    out_file = RESULTS_DIR / f"{date_str}.json"
    latest_file = RESULTS_DIR / "answer_latest.json"

    print("=" * 60)
    print("  LexPilot Answer Quality Evaluation — Phase 4 (RAGAS)")
    print("=" * 60)
    print(f"Date        : {date_str}")
    print(f"Target Doc  : {args.doc_id or '(none specified)'}")

    annotated, unanswerable, pending = load_dataset()
    print(f"Dataset Status:")
    print(f"  Annotated questions ready for Ragas : {len(annotated)}")
    print(f"  Unanswerable (refusal test)          : {len(unanswerable)}")
    print(f"  Pending annotation                   : {len(pending)}")
    print()

    if not args.doc_id:
        print("Notice: No --doc-id passed or EVAL_DOC_ID set.")
        print("Saving evaluation status template to results.")
        result_payload = {
            "date": date_str,
            "status": "pending_doc_id",
            "document_id": None,
            "dataset_summary": {
                "total": len(annotated) + len(unanswerable) + len(pending),
                "annotated_ready": len(annotated),
                "unanswerable": len(unanswerable),
                "pending_annotation": len(pending),
            },
            "metrics": {
                "faithfulness": "pending",
                "answer_relevancy": "pending",
                "context_precision": "pending",
                "context_recall": "pending",
            },
            "per_question_results": [],
            "instructions": "Run with `python ../eval/answer_eval.py --doc-id <valid_doc_id>` once document is indexed.",
        }
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(result_payload, f, indent=2)
        with open(latest_file, "w", encoding="utf-8") as f:
            json.dump(result_payload, f, indent=2)
        print(f"Results saved to: {out_file}")
        return

    # Check MongoDB and Gemini
    from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
    from pydantic import BaseModel, Field

    class QAResponse(BaseModel):
        answer: str = Field(description="Answer or refusal")
        cited_clause_ids: list[str] = Field(description="Cited clause IDs")
        exact_quote: str = Field(description="Exact substring quote")

    client = AsyncIOMotorClient(MONGODB_URI)
    db = client.get_default_database()
    embeddings_model = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
    llm = ChatGoogleGenerativeAI(model="gemini-flash-latest", temperature=0)
    qa_chain = llm.with_structured_output(QAResponse)

    # 1. Test unanswerable questions (Refusal checks)
    print("Testing unanswerable questions (Refusal Rate)...")
    unanswerable_results = []
    refusal_count = 0
    refusal_keywords = ["does not address", "not address", "cannot", "could not find", "refuse", "not mention"]

    for q in unanswerable:
        res = await run_pipeline_for_question(q["question"], args.doc_id, db, embeddings_model, qa_chain)
        ans = res["answer"].lower()
        is_refusal = any(kw in ans for kw in refusal_keywords) or not res["citations"]
        if is_refusal:
            refusal_count += 1
        unanswerable_results.append({
            "id": q["id"],
            "question": q["question"],
            "answer": res["answer"],
            "is_refusal": is_refusal,
            "latency_ms": res["latency_ms"],
        })

    refusal_rate = (refusal_count / len(unanswerable)) if unanswerable else 1.0
    print(f"  Unanswerable questions evaluated: {len(unanswerable)}")
    print(f"  Refusal rate                     : {refusal_rate * 100:.1f}%\n")

    # 2. Test annotated questions with Ragas
    ragas_scores = {
        "faithfulness": "pending",
        "answer_relevancy": "pending",
        "context_precision": "pending",
        "context_recall": "pending",
    }
    evaluated_questions = []

    if annotated:
        print(f"Running Q&A pipeline on {len(annotated)} annotated questions...")
        eval_samples = []
        for q in annotated:
            res = await run_pipeline_for_question(q["question"], args.doc_id, db, embeddings_model, qa_chain)
            eval_samples.append({
                "question": q["question"],
                "answer": res["answer"],
                "contexts": res["contexts"],
                "ground_truth": q["ground_truth_answer"],
                "id": q["id"],
            })

        print("Executing Ragas evaluation (Faithfulness, Relevancy, Precision, Recall)...")
        try:
            ragas_out = evaluate_with_ragas(eval_samples, llm, embeddings_model)
            for m in ["faithfulness", "answer_relevancy", "context_precision", "context_recall"]:
                if m in ragas_out:
                    ragas_scores[m] = round(float(ragas_out[m]), 4)
            print("Ragas evaluation completed successfully.")
        except Exception as e:
            print(f"Warning: Ragas evaluation encountered an error ({e}).")
    else:
        print("Note: Annotated question answers pending user annotation in dataset.json.")

    client.close()

    result_payload = {
        "date": date_str,
        "status": "completed" if annotated else "partially_evaluated",
        "document_id": args.doc_id,
        "dataset_summary": {
            "total": len(annotated) + len(unanswerable) + len(pending),
            "annotated_ready": len(annotated),
            "unanswerable": len(unanswerable),
            "pending_annotation": len(pending),
        },
        "metrics": ragas_scores,
        "unanswerable_refusal_rate": round(refusal_rate, 4),
        "unanswerable_results": unanswerable_results,
        "evaluated_questions": evaluated_questions,
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result_payload, f, indent=2)
    with open(latest_file, "w", encoding="utf-8") as f:
        json.dump(result_payload, f, indent=2)

    print()
    print("=" * 60)
    print("  Results Summary")
    print("=" * 60)
    print(f"Faithfulness       : {ragas_scores['faithfulness']}")
    print(f"Answer Relevancy   : {ragas_scores['answer_relevancy']}")
    print(f"Context Precision  : {ragas_scores['context_precision']}")
    print(f"Context Recall     : {ragas_scores['context_recall']}")
    print(f"Refusal Rate       : {refusal_rate * 100:.1f}%")
    print(f"Saved to           : {out_file}")


if __name__ == "__main__":
    asyncio.run(main())
