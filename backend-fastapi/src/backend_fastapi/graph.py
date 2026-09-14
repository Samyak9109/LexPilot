from typing import Annotated, TypedDict, List, Dict, Any
from langgraph.graph import StateGraph, START, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel, Field
import os
from dotenv import load_dotenv

load_dotenv()

# We need the API key for Gemini (GEMINI_API_KEY)
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)

class ClauseState(TypedDict):
    original_text: str
    source_span: tuple[int, int]
    clause_type: str | None
    entities: Dict[str, Any] | None
    simple_explanation: str | None
    risk_tier: str | None
    risk_reasoning: str | None

class DocumentState(TypedDict):
    document_id: str
    text: str
    segments: List[str]
    clauses: List[ClauseState]

# Pydantic Schemas for Structured Output
class ExtractedEntities(BaseModel):
    has_meaningful_content: bool = Field(description="Is this a meaningful legal clause (true) or just boilerplate/page numbers (false)?")
    parties: List[str] = Field(default=[], description="Any parties mentioned")

class ClauseClassification(BaseModel):
    clause_type: str = Field(description="One of: parties, effective_date, payment_terms, termination_conditions, confidentiality, liability, dispute_resolution, general")

class ClauseExplanation(BaseModel):
    simple_explanation: str = Field(description="A one-sentence plain English explanation of this clause")

class RiskAssessment(BaseModel):
    risk_tier: str = Field(description="One of: green, yellow, red")
    risk_reasoning: str = Field(description="Why this risk tier was assigned")

def parse_and_segment(state: DocumentState) -> DocumentState:
    # Structure-aware chunking approximation (by double newlines/paragraphs)
    raw_segments = [s.strip() for s in state["text"].split('\n\n') if s.strip()]
    segments = []
    # Combine very short segments with the next one
    current_seg = ""
    for seg in raw_segments:
        if len(current_seg) < 100:
            current_seg += " " + seg
        else:
            segments.append(current_seg.strip())
            current_seg = seg
    if current_seg:
        segments.append(current_seg.strip())
    return {"segments": segments, "clauses": []}

def extract_entities(state: DocumentState) -> DocumentState:
    clauses = []
    extractor = llm.with_structured_output(ExtractedEntities)
    
    for i, seg in enumerate(state["segments"]):
        try:
            # Fake a source span for now (MVP)
            res = extractor.invoke(f"Extract entities from this clause: {seg}")
            if res.has_meaningful_content:
                clauses.append({
                    "original_text": seg,
                    "source_span": (0, len(seg)),
                    "clause_type": None,
                    "entities": res.model_dump(),
                    "simple_explanation": None,
                    "risk_tier": None,
                    "risk_reasoning": None
                })
        except Exception:
            pass
    return {"clauses": clauses}

def classify_clauses(state: DocumentState) -> DocumentState:
    clauses = state.get("clauses", [])
    classifier = llm.with_structured_output(ClauseClassification)
    
    for c in clauses:
        try:
            res = classifier.invoke(f"Classify this clause into one of the allowed types: {c['original_text']}")
            c["clause_type"] = res.clause_type
        except Exception:
            c["clause_type"] = "general"
    return {"clauses": clauses}

def generate_explanations(state: DocumentState) -> DocumentState:
    clauses = state.get("clauses", [])
    explainer = llm.with_structured_output(ClauseExplanation)
    
    for c in clauses:
        try:
            res = explainer.invoke(f"Explain this legal clause simply to a non-lawyer: {c['original_text']}")
            c["simple_explanation"] = res.simple_explanation
        except Exception:
            c["simple_explanation"] = "Explanation generation failed."
    return {"clauses": clauses}

def risk_score(state: DocumentState) -> DocumentState:
    clauses = state.get("clauses", [])
    risker = llm.with_structured_output(RiskAssessment)
    
    for c in clauses:
        try:
            res = risker.invoke(f"Assess the risk of this clause (green/yellow/red) and provide reasoning: {c['original_text']}")
            c["risk_tier"] = res.risk_tier
            c["risk_reasoning"] = res.risk_reasoning
        except Exception:
            c["risk_tier"] = "yellow"
            c["risk_reasoning"] = "Could not assess risk automatically."
    return {"clauses": clauses}

workflow = StateGraph(DocumentState)

# Add nodes
workflow.add_node("parse", parse_and_segment)
workflow.add_node("extract", extract_entities)
workflow.add_node("classify", classify_clauses)
workflow.add_node("risk_score", risk_score)
workflow.add_node("explain", generate_explanations)

# Edges
workflow.add_edge(START, "parse")
workflow.add_edge("parse", "extract")
workflow.add_edge("extract", "classify")
workflow.add_edge("classify", "risk_score")
workflow.add_edge("risk_score", "explain")
workflow.add_edge("explain", END)

# Compile
app_graph = workflow.compile()
