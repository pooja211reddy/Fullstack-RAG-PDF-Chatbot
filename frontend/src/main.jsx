import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Upload,
  Database,
  Send,
  Trash2,
  FileText,
  Bot,
  CheckCircle,
  AlertCircle,
  LogIn,
  UserPlus,
  LogOut,
  History,
} from "lucide-react";
import "./styles.css";

const API_BASE_URL =
  "https://fullstack-rag-pdf-chatbot-production.up.railway.app";

function App() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info");

  const [isUploading, setIsUploading] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isChatting, setIsChatting] = useState(false);

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);

  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [token, setToken] = useState(
    () => localStorage.getItem("rag_token") || ""
  );
  const [userEmail, setUserEmail] = useState(
    () => localStorage.getItem("rag_user") || ""
  );

  const isLoggedIn = Boolean(token);

  const showStatus = (message, type = "info") => {
    setStatus(message);
    setStatusType(type);
  };

  const authHeaders = (authToken = token) => ({
    Authorization: `Bearer ${authToken}`,
  });

  const parseResponse = async (response, fallbackMessage) => {
    const responseText = await response.text();

    let data = {};

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(responseText || fallbackMessage);
    }

    if (!response.ok) {
      throw new Error(data.detail || fallbackMessage);
    }

    return data;
  };

  const loadChatHistory = async (authToken = token) => {
    if (!authToken) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/chat-history`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await parseResponse(response, "Failed to load chat history.");

      const formattedMessages = data.map((item) => ({
        role: item.role,
        text: item.message,
        sources: [],
      }));

      setMessages(formattedMessages);
      showStatus("Chat history loaded successfully.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    }
  };

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      showStatus("Please enter email and password.", "error");
      return;
    }

    try {
      const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await parseResponse(response, "Authentication failed.");

      if (authMode === "register") {
        showStatus("Account created successfully. Please sign in.", "success");
        setAuthMode("login");
        setPassword("");
        return;
      }

      localStorage.setItem("rag_token", data.access_token);
      localStorage.setItem("rag_user", email);

      setToken(data.access_token);
      setUserEmail(email);
      setPassword("");

      showStatus("Signed in successfully. Loading chat history...", "success");

      await loadChatHistory(data.access_token);
    } catch (error) {
      showStatus(error.message, "error");
    }
  };

  const logout = () => {
    localStorage.removeItem("rag_token");
    localStorage.removeItem("rag_user");

    setToken("");
    setUserEmail("");
    setMessages([]);
    setUploadedFiles([]);
    setSelectedFiles([]);
    setQuestion("");

    showStatus("Logged out successfully.", "success");
  };

  const handleFileChange = (event) => {
    setSelectedFiles(Array.from(event.target.files || []));
  };

  const uploadFiles = async () => {
    if (!isLoggedIn) {
      showStatus("Please sign in before uploading PDFs.", "error");
      return;
    }

    if (!selectedFiles.length) {
      showStatus("Please select at least one PDF file.", "error");
      return;
    }

    const formData = new FormData();

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      setIsUploading(true);
      showStatus("Uploading your knowledge base...", "info");

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        headers: {
          ...authHeaders(),
        },
        body: formData,
      });

      const data = await parseResponse(response, "Upload failed.");

      setUploadedFiles(data.files || []);
      showStatus("Knowledge base uploaded successfully.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const buildIndex = async () => {
    if (!isLoggedIn) {
      showStatus("Please sign in before building the AI index.", "error");
      return;
    }

    try {
      setIsBuilding(true);
      showStatus(
        "Building AI index. First run may take time while embeddings are prepared...",
        "info"
      );

      const response = await fetch(`${API_BASE_URL}/build-index`, {
        method: "POST",
        headers: {
          ...authHeaders(),
        },
      });

      const data = await parseResponse(response, "Index build failed.");

      showStatus(
        `${data.message} Files: ${data.files_processed}, Chunks: ${data.chunks_created}`,
        "success"
      );
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      setIsBuilding(false);
    }
  };

  const askQuestion = async () => {
    if (!isLoggedIn) {
      showStatus("Please sign in before chatting with your PDF.", "error");
      return;
    }

    if (!question.trim()) {
      showStatus("Please enter a question.", "error");
      return;
    }

    const currentQuestion = question;

    const userMessage = {
      role: "user",
      text: currentQuestion,
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");

    try {
      setIsChatting(true);

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          question: currentQuestion,
          provider: "gemini",
        }),
      });

      const data = await parseResponse(response, "Chat request failed.");

      const assistantMessage = {
        role: "assistant",
        text: data.answer,
        sources: data.sources || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);

      await loadChatHistory();
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Error: ${error.message}`,
          sources: [],
        },
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  const resetKnowledgeBase = async () => {
    if (!isLoggedIn) {
      showStatus("Please sign in before clearing the workspace.", "error");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/reset`, {
        method: "DELETE",
        headers: {
          ...authHeaders(),
        },
      });

      const data = await parseResponse(response, "Reset failed.");

      setMessages([]);
      setUploadedFiles([]);
      setSelectedFiles([]);
      showStatus(data.message, "success");
    } catch (error) {
      showStatus(error.message, "error");
    }
  };

  return (
    <div className="app">
      <header className="hero">
        <nav className="top-nav">
          <div className="brand">
            <div className="brand-icon">D</div>
            <div>
              <strong>DocuMind AI</strong>
              <span>RAG Document Intelligence</span>
            </div>
          </div>

          <div className="nav-badge">
            Secure PDF Q&A • JWT • PostgreSQL • CI/CD
          </div>
        </nav>

        <section className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow">Production-Ready GenAI Platform</p>

            <h1>
              Turn PDFs into a secure
              <span> AI knowledge assistant.</span>
            </h1>

            <p className="subtitle">
              Upload documents, build a vector index, and ask source-grounded
              questions through a full-stack RAG workflow powered by FastAPI,
              LangChain, FAISS, Gemini, JWT authentication, PostgreSQL, Docker,
              and CI/CD.
            </p>

            <div className="hero-actions">
              <a href="#workspace" className="hero-primary">
                Start Chatting
              </a>
              <a href="#architecture" className="hero-secondary">
                View Architecture
              </a>
            </div>

            <div className="trust-row">
              <span>JWT Auth</span>
              <span>PostgreSQL</span>
              <span>Dockerized</span>
              <span>Railway Deployed</span>
            </div>
          </div>

          <div className="hero-showcase">
            <div className="showcase-card">
              <div className="showcase-header">
                <span className="dot green"></span>
                <span className="dot yellow"></span>
                <span className="dot red"></span>
              </div>

              <div className="mini-message user-mini">
                What are the candidate&apos;s strongest skills?
              </div>

              <div className="mini-message ai-mini">
                Based on the uploaded PDF, the strongest skills include Python,
                SQL, Machine Learning, NLP, FastAPI, Docker, and Power BI.
              </div>

              <div className="source-chip">Source: Resume.pdf • Page 1</div>
            </div>
          </div>
        </section>
      </header>

      <main className="layout" id="workspace">
        <section className="panel">
          <h2>
            {authMode === "login" ? (
              <LogIn size={20} />
            ) : (
              <UserPlus size={20} />
            )}
            {authMode === "login" ? " Sign In" : " Create Account"}
          </h2>

          <p className="helper">
            Sign in to create a secure workspace for uploading PDFs, building AI
            indexes, and saving chat history.
          </p>

          {isLoggedIn ? (
            <div className="auth-box success-auth">
              <p>
                Signed in as <strong>{userEmail}</strong>
              </p>

              <button className="secondary-btn" onClick={() => loadChatHistory()}>
                <History size={16} /> Load Conversation History
              </button>

              <button className="danger-btn" onClick={logout}>
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          ) : (
            <div className="auth-box">
              <input
                className="text-input"
                type="email"
                placeholder="Work email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                className="text-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button className="primary-btn" onClick={handleAuth}>
                {authMode === "login" ? "Sign In" : "Create Account"}
              </button>

              <button
                className="link-btn"
                onClick={() =>
                  setAuthMode(authMode === "login" ? "register" : "login")
                }
              >
                {authMode === "login"
                  ? "New here? Create your workspace"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          )}

          <div className="divider" />

          <h2>
            <Upload size={20} /> Upload Knowledge Base
          </h2>

          <p className="helper">
            Add one or more PDF files that DocuMind AI should use as the source
            of truth.
          </p>

          <input
            className="file-input"
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFileChange}
            disabled={!isLoggedIn}
          />

          <button
            className="primary-btn"
            onClick={uploadFiles}
            disabled={isUploading || !isLoggedIn}
          >
            {isUploading ? "Uploading..." : "Upload Knowledge Base"}
          </button>

          {uploadedFiles.length > 0 && (
            <div className="file-list">
              <h3>Uploaded Files</h3>
              {uploadedFiles.map((file) => (
                <div className="file-row" key={file}>
                  <FileText size={16} />
                  <span>{file}</span>
                </div>
              ))}
            </div>
          )}

          <div className="divider" />

          <h2>
            <Database size={20} /> Build AI Index
          </h2>

          <p className="helper">
            Convert PDF text into searchable vector embeddings for retrieval
            augmented generation.
          </p>

          <button
            className="secondary-btn"
            onClick={buildIndex}
            disabled={isBuilding || !isLoggedIn}
          >
            {isBuilding ? "Building..." : "Build AI Index"}
          </button>

          <button
            className="danger-btn"
            onClick={resetKnowledgeBase}
            disabled={!isLoggedIn}
          >
            <Trash2 size={16} /> Clear Workspace
          </button>

          {status && (
            <div className={`status ${statusType}`}>
              {statusType === "success" ? (
                <CheckCircle size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span>{status}</span>
            </div>
          )}
        </section>

        <section className="chat-panel">
          <div className="chat-header">
            <div>
              <h2>Chat with your knowledge base</h2>
              <p>
                {isLoggedIn
                  ? "Ask questions and receive source-grounded answers from your uploaded PDFs."
                  : "Sign in first to upload documents and start a secure chat session."}
              </p>
            </div>

            <span className="pill">Gemini + FAISS</span>
          </div>

          <div className="messages">
            {messages.length === 0 ? (
              <div className="empty-state">
                <Bot size={44} />
                <h3>No conversation yet</h3>
                <p>
                  Sign in to load your saved chat history, or ask: “What are the
                  main skills in this resume?”
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div className={`message ${message.role}`} key={index}>
                  <div className="bubble">
                    <strong>{message.role === "user" ? "You" : "DocuMind AI"}</strong>
                    <p>{message.text}</p>
                  </div>

                  {message.sources?.length > 0 && (
                    <div className="sources">
                      <h4>Sources</h4>
                      {message.sources.map((source, idx) => (
                        <details key={idx}>
                          <summary>
                            {source.file} — Page {source.page}
                          </summary>
                          <p>{source.preview}</p>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="chat-input">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                isLoggedIn
                  ? "Ask a question from your uploaded PDFs..."
                  : "Sign in to ask questions..."
              }
              disabled={!isLoggedIn}
              onKeyDown={(e) => {
                if (e.key === "Enter") askQuestion();
              }}
            />

            <button onClick={askQuestion} disabled={isChatting || !isLoggedIn}>
              <Send size={18} />
              {isChatting ? "Thinking..." : "Ask AI"}
            </button>
          </div>
        </section>
      </main>

      <section className="architecture-section" id="architecture">
        <div className="architecture-card">
          <p className="eyebrow dark-eyebrow">System Architecture</p>
          <h2>Built like a real AI product, not just a demo.</h2>
          <p>
            DocuMind AI uses a full-stack RAG architecture with JWT security,
            PostgreSQL-backed users and chat history, local embeddings, FAISS
            retrieval, Gemini response generation, Dockerized services, and
            GitHub Actions CI/CD.
          </p>

          <div className="architecture-grid">
            <span>React Frontend</span>
            <span>FastAPI Backend</span>
            <span>JWT Auth</span>
            <span>PostgreSQL</span>
            <span>PDF Processing</span>
            <span>FAISS Vector Search</span>
            <span>Gemini LLM</span>
            <span>Railway Deployment</span>
          </div>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);