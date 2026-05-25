# Full-Stack RAG PDF Chatbot

A production-style full-stack Retrieval-Augmented Generation chatbot that lets users upload PDF files, build a vector index, and ask source-grounded questions from the uploaded document knowledge base.

## Tech Stack

### Backend
- FastAPI
- LangChain
- FAISS
- HuggingFace local embeddings
- Gemini API for final LLM answer
- PyPDFLoader
- Pytest

### Frontend
- React
- Vite
- CSS
- Fetch API
- Lucide icons

### DevOps
- Docker
- Docker Compose
- GitHub Actions CI/CD

## Architecture

```text
React Frontend
   ↓
FastAPI Backend
   ↓
PDF Upload
   ↓
PyPDFLoader
   ↓
Text Chunking
   ↓
HuggingFace Local Embeddings
   ↓
FAISS Vector Store
   ↓
Retriever
   ↓
Gemini LLM
   ↓
Answer + Source Chunks
```

## Local Setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Add your Gemini key in `backend/.env`:

```env
GOOGLE_API_KEY=your_new_gemini_api_key_here
GEMINI_CHAT_MODEL=gemini-2.5-flash
```

Run backend:

```bash
python -m uvicorn app.main:app --reload
```

Open API docs:

```text
http://127.0.0.1:8000/docs
```

### Frontend

Open a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open frontend:

```text
http://127.0.0.1:5173
```

## Docker Compose Setup

From the root folder:

```bash
cp backend/.env.example backend/.env
```

Add your Gemini key in `backend/.env`.

Then run:

```bash
docker compose up --build
```

Open:

```text
http://127.0.0.1:5173
```

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/upload` | Upload PDF files |
| POST | `/build-index` | Build FAISS vector index |
| POST | `/chat` | Ask questions from PDFs |
| GET | `/files` | List uploaded files |
| DELETE | `/reset` | Clear uploaded files and index |

## CI/CD

The GitHub Actions workflow does:

- Backend dependency installation
- Backend tests with Pytest
- Frontend dependency installation
- Frontend production build
- Docker image build for backend and frontend

## Resume Bullet

Built a full-stack RAG PDF chatbot using React, FastAPI, LangChain, FAISS, HuggingFace embeddings, Gemini API, Docker, and GitHub Actions, enabling PDF upload, vector indexing, source-grounded question answering, frontend chat interaction, and automated CI/CD validation.

## Future Improvements

- Add user authentication with JWT
- Add PostgreSQL for chat history
- Add Qdrant or pgvector for production vector storage
- Add RAG evaluation with RAGAS or DeepEval
- Deploy backend to Render/Railway/AWS and frontend to Vercel
