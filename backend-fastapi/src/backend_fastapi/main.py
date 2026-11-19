from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Header, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
import json
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI

from .graph import app_graph
from .rag import answer_question, answer_question_stream
from .checklist import generate_actionable_checklist
from .document_parser import extract_document_text

load_dotenv()

app = FastAPI()

INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "internal-secret-token")
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/lexpilot")

client = AsyncIOMotorClient(MONGODB_URI)
db = client.get_default_database()
embeddings_model = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

def verify_secret(x_internal_secret: str = Header(None)):
    if x_internal_secret != INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

class ProcessRequest(BaseModel):
    documentId: str
    jurisdiction: str = None

class AskRequest(BaseModel):
    documentId: str
    question: str

@app.post("/internal/ask")
async def ask_document(request: AskRequest, _ = Depends(verify_secret)):
    return await answer_question(request.documentId, request.question, db, embeddings_model)

@app.post("/internal/ask_stream")
async def ask_document_stream(request: AskRequest, _ = Depends(verify_secret)):
    async def event_generator():
        async for chunk in answer_question_stream(request.documentId, request.question, db, embeddings_model):
            yield json.dumps(chunk) + "\n"
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

class ChecklistRequest(BaseModel):
    documentId: str

@app.post("/internal/generate_checklist")
async def api_generate_checklist(request: ChecklistRequest, _ = Depends(verify_secret)):
    return await generate_actionable_checklist(request.documentId, db)


class CompareRequest(BaseModel):
    documentIdA: str
    documentIdB: str


@app.post("/internal/compare")
async def compare_documents(request: CompareRequest, _ = Depends(verify_secret)):
    """
    Semantic clause alignment for document comparison.
    Returns aligned table with clause types present in at least one document.
    """
    try:
        doc_id_a = ObjectId(request.documentIdA)
        doc_id_b = ObjectId(request.documentIdB)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid documentId format: {e}")

    clauses_a = await db.documentclauses.find({"documentId": doc_id_a}).to_list(length=100)
    clauses_b = await db.documentclauses.find({"documentId": doc_id_b}).to_list(length=100)

    if not clauses_a and not clauses_b:
        return {"comparison": [], "doc1": {}, "doc2": {}}

    # Get document info
    doc_a = await db.documents.find_one({"_id": doc_id_a})
    doc_b = await db.documents.find_one({"_id": doc_id_b})

    # Group by clauseType
    from collections import defaultdict
    type_to_clauses_a = defaultdict(list)
    type_to_clauses_b = defaultdict(list)

    for c in clauses_a:
        t = c.get("clauseType") or "general"
        type_to_clauses_a[t].append(c)
    for c in clauses_b:
        t = c.get("clauseType") or "general"
        type_to_clauses_b[t].append(c)

    all_types = set(type_to_clauses_a.keys()) | set(type_to_clauses_b.keys())

    # Structural similarity check (architecture.md FR-007)
    if all_types:
        overlap = len(set(type_to_clauses_a.keys()) & set(type_to_clauses_b.keys()))
        if overlap / len(all_types) < 0.2:
            raise HTTPException(
                status_code=400,
                detail="Cannot meaningfully compare structurally dissimilar documents."
            )

    comparison = []
    for clause_type in sorted(all_types):
        comparison.append({
            "clauseType": clause_type,
            "doc1Clauses": type_to_clauses_a.get(clause_type, []),
            "doc2Clauses": type_to_clauses_b.get(clause_type, []),
        })

    return {
        "doc1": {"id": str(doc_id_a), "filename": doc_a.get("filename") if doc_a else ""},
        "doc2": {"id": str(doc_id_b), "filename": doc_b.get("filename") if doc_b else ""},
        "comparison": comparison,
    }

async def process_pdf_background(document_id: str, text: str, jurisdiction: str = "Global/Agnostic", language: str = "English"):
    try:
        initial_state = {
            "document_id": document_id,
            "text": text,
            "segments": [],
            "clauses": [],
            "jurisdiction": jurisdiction,
            "language": language,
            "key_dates": [],
            "glossary": {}
        }
        final_state = app_graph.invoke(initial_state)

        # Save results to MongoDB document_clauses
        clauses = final_state.get("clauses", [])

        for c in clauses:
            doc_clause = {
                "documentId": ObjectId(document_id),
                "clauseType": c.get("clause_type"),
                "originalText": c.get("original_text"),
                "sourceSpan": c.get("source_span"),
                "simpleExplanation": c.get("simple_explanation"),
                "detailedExplanation": None,
                "riskTier": c.get("risk_tier"),
                "riskReasoning": c.get("risk_reasoning"),
                "marketBenchmark": c.get("market_benchmark", ""),
                "keyDates": c.get("entities", {}).get("key_dates", []),
                "glossary": c.get("entities", {}).get("glossary", {}),
                "confidence": 1.0
            }
            res = await db.documentclauses.insert_one(doc_clause)

            # Embed the clause and store in document_chunks
            vector = embeddings_model.embed_query(c.get("original_text"))
            chunk_doc = {
                "documentId": ObjectId(document_id),
                "clauseId": res.inserted_id,
                "chunkText": c.get("original_text"),
                "clauseType": c.get("clause_type"),
                "embedding": vector
            }
            await db.document_chunks.insert_one(chunk_doc)

        # Store document-level key_dates and glossary (from new graph nodes)
        key_dates = final_state.get("key_dates", [])
        glossary = final_state.get("glossary", {})
        await db.documents.update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {
                "status": "processed",
                "keyDates": key_dates,
                "glossary": glossary
            }}
        )
    except Exception as e:
        await db.documents.update_one({"_id": ObjectId(document_id)}, {"$set": {"status": "failed", "error": str(e)}})


@app.post("/internal/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    documentId: str = Form(...),
    jurisdiction: str = Form("Global/Agnostic"),
    language: str = Form("English"),
    _ = Depends(verify_secret)
):
    content = await file.read()
    text = extract_document_text(file.filename or "", content)
    
    background_tasks.add_task(process_pdf_background, documentId, text, jurisdiction, language)
    
    return {"status": "processing", "documentId": documentId}

@app.get("/health")
async def health():
    return {"status": "ok"}


class RedlineRequest(BaseModel):
    documentIdA: str
    documentIdB: str


@app.post("/internal/redline")
async def redline_documents(request: RedlineRequest, _ = Depends(verify_secret)):
    """
    Redline/version-compare: semantic diff between two drafts of the same document.
    Returns aligned clauses with diff markers (added/removed/changed).
    """
    try:
        doc_id_a = ObjectId(request.documentIdA)
        doc_id_b = ObjectId(request.documentIdB)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid documentId format: {e}")

    clauses_a = await db.documentclauses.find({"documentId": doc_id_a}).to_list(length=100)
    clauses_b = await db.documentclauses.find({"documentId": doc_id_b}).to_list(length=100)

    if not clauses_a and not clauses_b:
        return {"redline": [], "doc1": {}, "doc2": {}}

    doc_a = await db.documents.find_one({"_id": doc_id_a})
    doc_b = await db.documents.find_one({"_id": doc_id_b})

    # Build a simple text diff by clause type
    from collections import defaultdict
    type_to_clauses_a = defaultdict(list)
    type_to_clauses_b = defaultdict(list)

    for c in clauses_a:
        t = c.get("clauseType") or "general"
        type_to_clauses_a[t].append(c)
    for c in clauses_b:
        t = c.get("clauseType") or "general"
        type_to_clauses_b[t].append(c)

    all_types = set(type_to_clauses_a.keys()) | set(type_to_clauses_b.keys())

    redline = []
    for clause_type in sorted(all_types):
        text_a = " ".join(c.get("originalText", "") for c in type_to_clauses_a.get(clause_type, []))
        text_b = " ".join(c.get("originalText", "") for c in type_to_clauses_b.get(clause_type, []))

        if text_a and not text_b:
            redline.append({
                "clauseType": clause_type,
                "change": "removed",
                "text": text_a,
                "clauseIds": [str(c["_id"]) for c in type_to_clauses_a[clause_type]]
            })
        elif text_b and not text_a:
            redline.append({
                "clauseType": clause_type,
                "change": "added",
                "text": text_b,
                "clauseIds": [str(c["_id"]) for c in type_to_clauses_b[clause_type]]
            })
        elif text_a != text_b:
            redline.append({
                "clauseType": clause_type,
                "change": "changed",
                "text": text_b,
                "clauseIds": [str(c["_id"]) for c in type_to_clauses_b[clause_type]],
                "previousText": text_a,
                "previousClauseIds": [str(c["_id"]) for c in type_to_clauses_a[clause_type]]
            })
        else:
            redline.append({
                "clauseType": clause_type,
                "change": "unchanged",
                "text": text_a,
                "clauseIds": [str(c["_id"]) for c in type_to_clauses_b[clause_type]]
            })

    return {
        "doc1": {"id": str(doc_id_a), "filename": doc_a.get("filename") if doc_a else ""},
        "doc2": {"id": str(doc_id_b), "filename": doc_b.get("filename") if doc_b else ""},
        "redline": redline,
    }
