import os
import shutil
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

from langchain_google_genai import ChatGoogleGenerativeAI

from datetime import timedelta
from app.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from fastapi import Depends
from sqlalchemy.orm import Session
from app.database import Base, engine, get_db
from app.models import User, ChatMessage

load_dotenv()

app = FastAPI(
    title="Full-Stack RAG PDF Chatbot API",
    description="FastAPI backend for a PDF RAG chatbot using LangChain, FAISS, HuggingFace embeddings, and Gemini.",
    version="2.0.0",
)
@app.on_event("startup")
def create_database_tables():
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables verified successfully.")
    except Exception as error:
        print(f"Database connection failed during startup: {error}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
INDEX_DIR = DATA_DIR / "faiss_index"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
INDEX_DIR.mkdir(parents=True, exist_ok=True)


class ChatRequest(BaseModel):
    question: str
    provider: str = "gemini"


class Source(BaseModel):
    file: str
    page: int | str
    preview: str


class ChatResponse(BaseModel):
    answer: str
    sources: List[Source]


class BuildIndexResponse(BaseModel):
    message: str
    files_processed: int
    chunks_created: int

class ChatHistoryResponse(BaseModel):
    id: int
    role: str
    message: str

    class Config:
        from_attributes = True


def get_embeddings():
    """
    Uses local embeddings to avoid paid embedding API quota issues.
    """
    return HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )


def get_llm(provider: str):
    provider = provider.lower().strip()

    if provider != "gemini":
        raise HTTPException(
            status_code=400,
            detail="This full-stack version uses Gemini for the final LLM response. Use provider='gemini'."
        )

    api_key = os.getenv("GOOGLE_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_API_KEY is missing. Add it to backend/.env."
        )

    return ChatGoogleGenerativeAI(
        model=os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash"),
        temperature=0.2,
        google_api_key=api_key,
    )


def load_pdf_documents():
    pdf_files = list(UPLOAD_DIR.glob("*.pdf"))

    if not pdf_files:
        raise HTTPException(
            status_code=400,
            detail="No PDF files found. Upload at least one PDF first."
        )

    documents = []

    for pdf_file in pdf_files:
        loader = PyPDFLoader(str(pdf_file))
        documents.extend(loader.load())

    return documents


def split_documents(documents):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )
    return splitter.split_documents(documents)


def get_index_dir():
    provider_index_dir = INDEX_DIR / "local"
    provider_index_dir.mkdir(parents=True, exist_ok=True)
    return provider_index_dir


def save_faiss_index(chunks):
    embeddings = get_embeddings()
    vectorstore = FAISS.from_documents(chunks, embeddings)

    provider_index_dir = get_index_dir()
    vectorstore.save_local(str(provider_index_dir))


def load_faiss_index():
    provider_index_dir = get_index_dir()

    if not provider_index_dir.exists() or not any(provider_index_dir.iterdir()):
        raise HTTPException(
            status_code=400,
            detail="No vector index found. Build the index first."
        )

    embeddings = get_embeddings()

    return FAISS.load_local(
        str(provider_index_dir),
        embeddings,
        allow_dangerous_deserialization=True,
    )


def format_docs(docs):
    formatted_docs = []

    for i, doc in enumerate(docs, start=1):
        source = Path(doc.metadata.get("source", "uploaded_pdf")).name
        page = doc.metadata.get("page", "N/A")

        formatted_docs.append(
            f"[Source {i}] File: {source}, Page: {page}\n{doc.page_content}"
        )

    return "\n\n".join(formatted_docs)


def build_rag_chain(provider: str):
    vectorstore = load_faiss_index()

    retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": 4},
    )

    prompt = ChatPromptTemplate.from_template(
        """
You are a helpful RAG assistant. Answer the user's question using ONLY the uploaded PDF context.

Rules:
- If the answer is not found in the context, say: "I could not find this in the uploaded PDF knowledge base."
- Do not make up facts.
- Keep the answer clear and practical.
- Mention source file and page numbers when useful.

Context:
{context}

Question:
{question}

Answer:
"""
    )

    llm = get_llm(provider)

    chain = (
        {
            "context": retriever | format_docs,
            "question": RunnablePassthrough(),
        }
        | prompt
        | llm
        | StrOutputParser()
    )

    return chain, retriever


@app.get("/")
def root():
    return {
        "message": "Full-stack RAG PDF Chatbot API is running.",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/auth/register", response_model=UserResponse)
def register_user(
    request: RegisterRequest,
    db: Session = Depends(get_db),
):
    existing_user = db.query(User).filter(User.email == request.email).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered.")

    new_user = User(
        email=request.email,
        hashed_password=hash_password(request.password),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return UserResponse(email=new_user.email)


@app.post("/auth/login", response_model=TokenResponse)
def login_user(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == request.email).first()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return TokenResponse(access_token=access_token)


@app.get("/auth/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(email=current_user.email)

@app.get("/files")
def list_uploaded_files():
    files = [
        {
            "name": file.name,
            "size_kb": round(file.stat().st_size / 1024, 2),
        }
        for file in UPLOAD_DIR.glob("*.pdf")
    ]
    return {"files": files}


@app.post("/upload")
async def upload_pdfs(
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    saved_files = []

    for uploaded_file in files:
        if not uploaded_file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"{uploaded_file.filename} is not a PDF file.",
            )

        destination = UPLOAD_DIR / uploaded_file.filename

        with open(destination, "wb") as buffer:
            shutil.copyfileobj(uploaded_file.file, buffer)

        saved_files.append(uploaded_file.filename)

    return {
        "message": "PDF files uploaded successfully.",
        "files": saved_files,
    }


@app.post("/build-index", response_model=BuildIndexResponse)
def build_index(current_user: dict = Depends(get_current_user)):
    documents = load_pdf_documents()
    chunks = split_documents(documents)
    save_faiss_index(chunks)

    return BuildIndexResponse(
        message="Vector index built successfully using local HuggingFace embeddings.",
        files_processed=len(list(UPLOAD_DIR.glob("*.pdf"))),
        chunks_created=len(chunks),
    )


@app.post("/chat", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    chain, retriever = build_rag_chain(request.provider)

    answer = chain.invoke(request.question)
    user_message = ChatMessage(
        user_id=current_user.id,
        role="user",
        message=request.question,
    )

    assistant_message = ChatMessage(
        user_id=current_user.id,
        role="assistant",
        message=answer,
    )

    db.add(user_message)
    db.add(assistant_message)
    db.commit()
    retrieved_docs = retriever.invoke(request.question)

    sources = []
    for doc in retrieved_docs:
        sources.append(
            Source(
                file=Path(doc.metadata.get("source", "uploaded_pdf")).name,
                page=doc.metadata.get("page", "N/A"),
                preview=doc.page_content[:400],
            )
        )

    return ChatResponse(answer=answer, sources=sources)

@app.get("/chat-history", response_model=list[ChatHistoryResponse])
def get_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )

    return messages


@app.delete("/reset")
def reset_knowledge_base(current_user: dict = Depends(get_current_user)):
    if DATA_DIR.exists():
        shutil.rmtree(DATA_DIR)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_DIR.mkdir(parents=True, exist_ok=True)

    return {"message": "Uploaded PDFs and vector indexes deleted successfully."}
