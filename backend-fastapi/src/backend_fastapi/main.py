from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
import pdfplumber
import io
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from .graph import app_graph
from .rag import answer_question
from .checklist import generate_actionable_checklist

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

class ChecklistRequest(BaseModel):
    documentId: str

@app.post("/internal/generate_checklist")
async def api_generate_checklist(request: ChecklistRequest, _ = Depends(verify_secret)):
    return await generate_actionable_checklist(request.documentId, db)

async def process_pdf_background(document_id: str, text: str, jurisdiction: str = "Global/Agnostic", language: str = "English"):
    try:
        initial_state = {"document_id": document_id, "text": text, "segments": [], "clauses": [], "jurisdiction": jurisdiction, "language": language}
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
            
        await db.documents.update_one({"_id": ObjectId(document_id)}, {"$set": {"status": "processed"}})
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
    text = ""
    if file.filename.endswith(".pdf"):
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                text += (page.extract_text() or "") + "\n"
    
    background_tasks.add_task(process_pdf_background, documentId, text, jurisdiction, language)
    
    return {"status": "processing", "documentId": documentId}

@app.get("/health")
async def health():
    return {"status": "ok"}

