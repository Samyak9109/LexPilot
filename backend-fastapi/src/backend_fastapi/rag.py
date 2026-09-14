from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
from bson import ObjectId
import re
import os

llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)

class QAResponse(BaseModel):
    answer: str = Field(description="The answer to the user's question, or an explicit refusal if the document doesn't address it.")
    cited_clause_ids: list[str] = Field(description="A list of clause IDs that you are citing to support your answer.")
    exact_quote: str = Field(description="The exact substring from the source document you are relying on.")

async def answer_question(document_id: str, question: str, db, embeddings_model) -> dict:
    # 1. Embed the user's question
    query_vector = embeddings_model.embed_query(question)
    
    # 2. Vector Search (MongoDB Atlas)
    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index", # Must be configured in Atlas
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 50,
                "limit": 5,
                "filter": { "documentId": ObjectId(document_id) }
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
        chunks = await db.document_chunks.find({"documentId": ObjectId(document_id)}).limit(5).to_list(length=5)
        results = chunks
    
    if not results:
        return {"answer": "I couldn't find any relevant text in the document.", "citations": []}
        
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
    
    qa_chain = llm.with_structured_output(QAResponse)
    try:
        llm_res = qa_chain.invoke(prompt)
    except Exception as e:
        return {"answer": "Sorry, I couldn't process the answer at this time.", "citations": []}
    
    # 4. Post-hoc Grounding Verification (architecture.md 6.3)
    answer = llm_res.answer
    exact_quote = llm_res.exact_quote
    cited_ids = llm_res.cited_clause_ids
    
    # Verify quote exists in the retrieved context
    if exact_quote and len(exact_quote) > 5:
        # Normalize whitespace for fuzzy check
        norm_quote = re.sub(r'\s+', ' ', exact_quote.strip().lower())
        norm_context = re.sub(r'\s+', ' ', context_text.lower())
        
        if norm_quote not in norm_context:
            answer = "I could not confidently ground my answer in the text. (Failed Grounding Verification)"
            cited_ids = []
            
    return {
        "answer": answer,
        "citations": cited_ids
    }
