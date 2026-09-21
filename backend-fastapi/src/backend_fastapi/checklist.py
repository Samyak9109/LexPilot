from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv()

llm = ChatGoogleGenerativeAI(model="gemini-flash-latest", temperature=0.2)

class ChecklistItem(BaseModel):
    action_item: str = Field(description="Actionable advice or a specific question to ask a lawyer.")
    cited_clause_id: str = Field(description="The exact clause ID that this item refers to.")

class ChecklistResponse(BaseModel):
    items: list[ChecklistItem] = Field(description="List of actionable items")
    summary: str = Field(description="A brief one-sentence summary of the overall risk profile.")

async def generate_actionable_checklist(document_id: str, db) -> dict:
    try:
        doc_object_id = ObjectId(document_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid documentId format: '{document_id}'")

    # Fetch all clauses for the document that are not 'green'
    clauses = await db.documentclauses.find({
        "documentId": doc_object_id
    }).to_list(length=100)
    
    risky_clauses = [c for c in clauses if c.get("riskTier") in ["red", "yellow"]]
    
    if not risky_clauses:
        return {
            "summary": "No significant risks flagged in this document.",
            "items": []
        }
        
    context_text = "\n\n".join([
        f"Clause ID: {str(c['_id'])}\nType: {c.get('clauseType')}\nRisk Tier: {c.get('riskTier')}\nRisk Reasoning: {c.get('riskReasoning')}\nText: {c.get('originalText')}"
        for c in risky_clauses
    ])
    
    prompt = f"""
You are an expert legal assistant. Based on the following risky clauses extracted from a contract, generate a checklist of actionable questions or negotiation points that the user should discuss with their lawyer.
Each item must explicitly cite the Clause ID it refers to.

Risky Clauses:
{context_text}
"""
    
    checklist_chain = llm.with_structured_output(ChecklistResponse)
    try:
        res = checklist_chain.invoke(prompt)
        # Verify cited_clause_ids exist — LLMs hallucinate ObjectIds
        valid_ids = {str(c['_id']) for c in risky_clauses}
        verified_items = [
            {"action_item": item.action_item, "cited_clause_id": item.cited_clause_id}
            for item in res.items
            if item.cited_clause_id in valid_ids
        ]
        return {
            "summary": res.summary,
            "items": verified_items
        }
    except Exception as e:
        return {
            "summary": "Failed to generate checklist due to an internal error.",
            "items": []
        }
