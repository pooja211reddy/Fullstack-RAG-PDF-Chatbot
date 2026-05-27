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
} from "lucide-react";
import "./styles.css";

const API_BASE_URL = "https://fullstack-rag-pdf-chatbot-production.up.railway.app";

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

  const [token, setToken] = useState(() => localStorage.getItem("rag_token") || "");
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("rag_user") || "");

  const isLoggedIn = Boolean(token);

  const showStatus = (message, type = "info") => {
    setStatus(message);
    setStatusType(type);
  };

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
  });

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

      const responseText = await response.text();
      let data = [];

      try {
        data = responseText ? JSON.parse(responseText) : [];
      } catch {
        throw new Error(responseText || "Failed to load chat history.");
      }

      if (!response.ok) {
        throw new Error(data.detail || "Failed to load chat history.");
      }

      const formattedMessages = data.map((item) => ({
        role: item.role,
        text: item.message,
        sources: [],
      }));

      setMessages(formattedMessages);
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

      const responseText = await response.text();
      let data = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(responseText || "Backend returned a non-JSON error.");
      }

      if (!response.ok) {
        throw new Error(data.detail || responseText || "Authentication failed.");
      }

      if (authMode === "register") {
        showStatus("Registration successful. Now login.", "success");
        setAuthMode("login");
        return;
      }

      localStorage.setItem("rag_token", data.access_token);
      localStorage.setItem("rag_user", email);

      setToken(data.access_token);
      setUserEmail(email);
      setPassword("");

      showStatus("Login successful. Click 'Load Chat History' to view previous chats.", "success");

      showStatus("Login successful.", "success");
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

    showStatus("Logged out successfully.", "success");
  };

  const handleFileChange = (event) => {
    setSelectedFiles(Array.from(event.target.files || []));
  };

  const uploadFiles = async () => {
    if (!isLoggedIn) {
      showStatus("Please login before uploading PDFs.", "error");
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
      showStatus("Uploading PDF files...", "info");

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        headers: {
          ...authHeaders(),
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed.");
      }

      setUploadedFiles(data.files || []);
      showStatus("PDF uploaded successfully.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const buildIndex = async () => {
    if (!isLoggedIn) {
      showStatus("Please login before building the vector index.", "error");
      return;
    }

    try {
      setIsBuilding(true);
      showStatus(
        "Building vector index. First run may take time because the embedding model downloads locally...",
        "info"
      );

      const response = await fetch(`${API_BASE_URL}/build-index`, {
        method: "POST",
        headers: {
          ...authHeaders(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Index build failed.");
      }

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
      showStatus("Please login before chatting with the PDF.", "error");
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Chat request failed.");
      }

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
      showStatus("Please login before resetting the knowledge base.", "error");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/reset`, {
        method: "DELETE",
        headers: {
          ...authHeaders(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Reset failed.");
      }

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
        <div>
          <p className="eyebrow">Full-Stack GenAI Project</p>
          <h1>RAG PDF Chatbot</h1>
          <p className="subtitle">
            Upload PDFs, build a vector index, and ask document-grounded
            questions using FastAPI, LangChain, FAISS, local embeddings, and
            Gemini.
          </p>
        </div>

        <div className="hero-card">
          <Bot size={38} />
          <span>Source-grounded answers</span>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <h2>{authMode === "login" ? <LogIn size={20} /> : <UserPlus size={20} />}
            {authMode === "login" ? " Login" : " Register"}
          </h2>

          <p className="helper">
            Login to upload PDFs, build indexes, and chat securely.
          </p>

          {isLoggedIn ? (
            <div className="auth-box success-auth">
              <p>
                Logged in as <strong>{userEmail}</strong>
              </p>

              <button className="secondary-btn" onClick={() => loadChatHistory()}>
                Load Chat History
              </button>

              <button className="danger-btn" onClick={logout}>
                <LogOut size={16} /> Logout
              </button>
            </div>
          ) : (
            <div className="auth-box">
              <input
                className="text-input"
                type="email"
                placeholder="Email"
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
                {authMode === "login" ? "Login" : "Register"}
              </button>

              <button
                className="link-btn"
                onClick={() =>
                  setAuthMode(authMode === "login" ? "register" : "login")
                }
              >
                {authMode === "login"
                  ? "New user? Register here"
                  : "Already registered? Login here"}
              </button>
            </div>
          )}

          <div className="divider" />

          <h2>
            <Upload size={20} /> Upload PDF
          </h2>

          <p className="helper">Choose one or more PDF files for the knowledge base.</p>

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
            {isUploading ? "Uploading..." : "Upload PDFs"}
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
            <Database size={20} /> Build Index
          </h2>

          <p className="helper">
            Creates local HuggingFace embeddings and stores them in FAISS.
          </p>

          <button
            className="secondary-btn"
            onClick={buildIndex}
            disabled={isBuilding || !isLoggedIn}
          >
            {isBuilding ? "Building..." : "Build Vector Index"}
          </button>

          <button
            className="danger-btn"
            onClick={resetKnowledgeBase}
            disabled={!isLoggedIn}
          >
            <Trash2 size={16} /> Reset Knowledge Base
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
              <h2>Chat with your PDF</h2>
              <p>
                {isLoggedIn
                  ? "Ask questions from the uploaded document."
                  : "Login first to start chatting."}
              </p>
            </div>
            <span className="pill">Gemini + FAISS</span>
          </div>

          <div className="messages">
            {messages.length === 0 ? (
              <div className="empty-state">
                <Bot size={44} />
                <h3>No messages yet</h3>
                <p>
                  Login to load your saved chat history, or ask: “What are the main skills in this resume?”
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div className={`message ${message.role}`} key={index}>
                  <div className="bubble">
                    <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
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
                  ? "Ask a question from your PDF..."
                  : "Login to ask questions..."
              }
              disabled={!isLoggedIn}
              onKeyDown={(e) => {
                if (e.key === "Enter") askQuestion();
              }}
            />

            <button onClick={askQuestion} disabled={isChatting || !isLoggedIn}>
              <Send size={18} />
              {isChatting ? "Thinking..." : "Send"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);