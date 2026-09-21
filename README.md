# LexPilot

**LexPilot** is a GenAI-powered legal document copilot that helps non-lawyers understand, analyze, compare, and navigate legal documents in plain language. It aims to reduce the comprehension gap by turning complicated legal documents into understandable information, evidence-backed insights, and actionable next steps — without replacing professional legal judgment.

---

## 🎯 Key Features

- **Single Document Understanding**: Upload a PDF or DOCX file to get a parsed, easy-to-read summary of clauses in plain English.
- **Risk & Obligation Detection**: Identify unusual or risky clauses before you sign, with a clear reasoning (🔴/🟡/🟢) attached to every flagged risk.
- **Grounded Q&A**: Ask specific questions about your document and get answers backed directly by citations to the source clauses. Zero unsupported claims.
- **Document Comparison**: Compare two versions of a document side-by-side to easily spot what’s the same, different, or missing.
- **Actionable Output**: Generate a downloadable checklist of key points and specific questions to take to a lawyer.
- **Key-Date Tracking**: Automatically highlight important deadlines, renewals, and expiration dates.

---

## 🏗 Architecture & Tech Stack

LexPilot uses a dual-backend architecture to leverage the best tools for the job:

- **Frontend**: React (Vite, TypeScript, TailwindCSS) for a fast and interactive UI.
- **Web Backend**: Node.js & Express for authentication, session management, and document metadata.
- **AI Backend**: Python & FastAPI (with LangGraph/LangChain) for document parsing, segmentation, embeddings, and complex LLM orchestrations.
- **Database**: MongoDB Atlas with Vector Search. Stores users, document metadata, structured extractions, and vector embeddings all in one place.
- **AI Model**: Google Gemini (gemini-flash-latest) via LangChain.

### Why two backends?
Express owns auth and user state, ensuring a solid foundation in the MERN stack. FastAPI handles the heavy lifting of the AI pipeline (parsing, extraction, LLM calls) leveraging the Python-native AI ecosystem. Communication between the two is handled securely via a shared internal secret.

---

## 🚀 Getting Started

Follow these instructions to set up the project locally.

### Prerequisites

- Node.js (v18+)
- Python (v3.10+)
- [uv](https://github.com/astral-sh/uv) (for Python dependency management)
- MongoDB running locally or a MongoDB Atlas cluster URI.
- A Gemini API Key

### 1. Clone the repository

```bash
git clone git@github.com:Samyak9109/LexPilot.git
cd LexPilot
```

### 2. Environment Setup

Copy `.env.example` to `.env` in the root directory:

```bash
cp .env.example .env
```
Fill in the variables in your `.env` file, especially your `GEMINI_API_KEY` and `MONGODB_URI`.

### 3. Start the Express Backend

```bash
cd backend-express
npm install
node index.js
```
The Express server will run on `http://localhost:3000`.

### 4. Start the FastAPI AI Service

Open a new terminal window:
```bash
cd backend-fastapi
# Create a virtual environment and install dependencies using uv
uv venv
source .venv/bin/activate # or .venv\Scripts\activate on Windows
uv pip install -r requirements.txt # (or sync via uv)

# Run the server
uvicorn main:app --reload --port 8000
```
FastAPI will run on `http://localhost:8000`.

### 5. Start the React Frontend

Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
The React frontend will be available at `http://localhost:5173`.

---

## 🛡️ Security & Privacy Principles

- **Fail-Closed AI**: Every generated claim is verified against a cited source clause. If the system can't ground an answer in your document, it explicitly refuses to guess.
- **No Training on User Data**: User documents are passed to the LLM via API only for analysis; they are not used for model training.
- **Strict Boundary**: Your documents belong to your authenticated session. User data isolation is handled firmly at the query layer.

## 📜 License

This project is open-source. Please see the LICENSE file for details.
