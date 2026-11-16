from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from dotenv import load_dotenv
import os
import time
from typing import AsyncGenerator, Any
from .grounding import verify_grounding

try:
    from langfuse import observe
except ImportError:
    def observe(*args, **kwargs):
        def decorator(f):
            return f
        return decorator

load_dotenv()

llm = ChatGoogleGenerativeAI(model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"))

class QAResponse(BaseModel):
    answer: str = Field(description="The answer to the user's question, or an explicit refusal if the document doesn't address it.")
    cited_clause_ids: list[str] = Field(description="A list of clause IDs that you are citing to support your answer.")
    exact_quote: str = Field(description="The exact substring from the source document you are relying on.")

@observe(name="rag_answer_question")
async def answer_question(document_id: str, question: str, db, embeddings_model) -> dict:
    t_start = time.perf_counter()

    # Validate inputs
    if not question or not question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    try:
        doc_object_id = ObjectId(document_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid documentId format: '{document_id}'")

    # 1. Embed the user's question and perform Vector Search (MongoDB Atlas)
    t_retrieval_start = time.perf_counter()
    query_vector = embeddings_model.embed_query(question)
    
    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index", # Must be configured in Atlas
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 50,
                "limit": 5,
                "filter": { "documentId": doc_object_id }
            }
        },
        {
            "$project": {
                "_id": 0,
                "clauseId": 1,
                "chunkText": 1,
                "score": { "$meta": "vectorSearchScore" }
            }
        }
    ]
    
    try:
        results = await db.document_chunks.aggregate(pipeline).to_list(length=5)
    except Exception as e:
        # Fallback if vector index isn't created yet or fails (for MVP ease of testing without Atlas config)
        print("Vector search failed, falling back to basic text retrieval:", str(e))
        chunks = await db.document_chunks.find({"documentId": doc_object_id}).limit(5).to_list(length=5)
        results = chunks
    
    retrieval_ms = (time.perf_counter() - t_retrieval_start) * 1000
    rerank_ms = 0.0

    if not results:
        total_ms = (time.perf_counter() - t_start) * 1000
        return {
            "answer": "I couldn't find any relevant text in the document.",
            "citations": [],
            "latency": {
                "retrieval_ms": round(retrieval_ms, 2),
                "rerank_ms": round(rerank_ms, 2),
                "llm_ms": 0.0,
                "total_ms": round(total_ms, 2)
            }
        }
        
    context_text = "\n\n".join([f"Clause ID: {str(r['clauseId'])}\nText: {r['chunkText']}" for r in results])
    
    # 3. Citation-or-refuse Generation
    prompt = f"""
You are an expert legal assistant. Answer the user's question based strictly on the provided document excerpts below.
If the excerpts do not contain the answer, explicitly refuse to answer and state that the document does not address this.
Do not use outside legal knowledge.

Document Excerpts:
{context_text}

User Question: {question}
"""
    
    t_llm_start = time.perf_counter()
    qa_chain = llm.with_structured_output(QAResponse)
    try:
        llm_res = qa_chain.invoke(prompt)
    except Exception as e:
        total_ms = (time.perf_counter() - t_start) * 1000
        return {
            "answer": "Sorry, I couldn't process the answer at this time.",
            "citations": [],
            "latency": {
                "retrieval_ms": round(retrieval_ms, 2),
                "rerank_ms": round(rerank_ms, 2),
                "llm_ms": round((time.perf_counter() - t_llm_start) * 1000, 2),
                "total_ms": round(total_ms, 2)
            }
        }
    
    llm_ms = (time.perf_counter() - t_llm_start) * 1000

    # 4. Post-hoc Grounding Verification (architecture.md 6.3)
    answer = llm_res.answer
    exact_quote = llm_res.exact_quote
    cited_ids = llm_res.cited_clause_ids
    
    retrieved_ids = [str(result["clauseId"]) for result in results]
    if not verify_grounding(exact_quote, cited_ids, retrieved_ids, context_text):
        answer = "I could not confidently answer from the text you uploaded. Please rephrase or review the cited clauses directly."
        cited_ids = []
            
    total_ms = (time.perf_counter() - t_start) * 1000
    return {
        "answer": answer,
        "citations": cited_ids,
        "latency": {
            "retrieval_ms": round(retrieval_ms, 2),
            "rerank_ms": round(rerank_ms, 2),
            "llm_ms": round(llm_ms, 2),
            "total_ms": round(total_ms, 2)
        }
    }


@observe(name="rag_answer_question_stream")
async def answer_question_stream(document_id: str, question: str, db, embeddings_model) -> AsyncGenerator[dict[str, Any], None]:
    """Streams tokens from the LLM, measuring time-to-first-token (TTFT)."""
    t_start = time.perf_counter()
    if not question or not question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    doc_object_id = ObjectId(document_id)

    # Retrieval
    t_retrieval_start = time.perf_counter()
    query_vector = embeddings_model.embed_query(question)
    try:
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 50,
                    "limit": 5,
                    "filter": { "documentId": doc_object_id }
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "clauseId": 1,
                    "chunkText": 1,
                    "score": { "$meta": "vectorSearchScore" }
                }
            }
        ]
        results = await db.document_chunks.aggregate(pipeline).to_list(length=5)
    except Exception:
        results = await db.document_chunks.find({"documentId": doc_object_id}).limit(5).to_list(length=5)

    retrieval_ms = (time.perf_counter() - t_retrieval_start) * 1000

    context_text = "\n\n".join([f"Clause ID: {str(r.get('clauseId', ''))}\nText: {r.get('chunkText', '')}" for r in results])
    prompt = f"""You are an expert legal assistant. Answer the user's question based strictly on the provided document excerpts below.
If the excerpts do not contain the answer, explicitly refuse to answer.

Document Excerpts:
{context_text}

User Question: {question}
"""

    t_llm_start = time.perf_counter()
    ttft_ms = None
    accumulated_text = ""

    for chunk in llm.stream(prompt):
        if ttft_ms is None:
            ttft_ms = (time.perf_counter() - t_llm_start) * 1000
        token = chunk.content if hasattr(chunk, "content") else str(chunk)
        accumulated_text += token
        yield {
            "type": "token",
            "content": token,
            "ttft_ms": round(ttft_ms, 2) if ttft_ms is not None else None,
        }

    total_llm_ms = (time.perf_counter() - t_llm_start) * 1000
    total_ms = (time.perf_counter() - t_start) * 1000

    yield {
        "type": "done",
        "answer": accumulated_text,
        "latency": {
            "retrieval_ms": round(retrieval_ms, 2),
            "rerank_ms": 0.0,
            "ttft_ms": round(ttft_ms, 2) if ttft_ms is not None else 0.0,
            "llm_ms": round(total_llm_ms, 2),
            "total_ms": round(total_ms, 2)
        }
    }
