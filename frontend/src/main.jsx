import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Upload, Database, Send, Trash2, FileText, Bot, CheckCircle, AlertCircle } from "lucide-react";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

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

  const showStatus = (message, type = "info") => {
    setStatus(message);
    setStatusType(type);
  };

  const handleFileChange = (event) => {
    setSelectedFiles(Array.from(event.target.files || []));
  };

  const uploadFiles = async () => {
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
    try {
      setIsBuilding(true);
      showStatus("Building vector index. First run may take time because the embedding model downloads locally...", "info");

      const response = await fetch(`${API_BASE_URL}/build-index`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Index build failed.");
      }

      showStatus(`${data.message} Files: ${data.files_processed}, Chunks: ${data.chunks_created}`, "success");
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      setIsBuilding(false);
    }
  };

  const askQuestion = async () => {
    if (!question.trim()) {
      showStatus("Please enter a question.", "error");
      return;
    }

    const userMessage = {
      role: "user",
      text: question,
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");

    try {
      setIsChatting(true);

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question,
          provider: "gemini"
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
    try {
      const response = await fetch(`${API_BASE_URL}/reset`, {
        method: "DELETE",
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
            Upload PDFs, build a vector index, and ask document-grounded questions using FastAPI,
            LangChain, FAISS, local embeddings, and Gemini.
          </p>
        </div>
        <div className="hero-card">
          <Bot size={38} />
          <span>Source-grounded answers</span>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <h2><Upload size={20} /> Upload PDF</h2>
          <p className="helper">Choose one or more PDF files for the knowledge base.</p>

          <input
            className="file-input"
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFileChange}
          />

          <button className="primary-btn" onClick={uploadFiles} disabled={isUploading}>
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

          <h2><Database size={20} /> Build Index</h2>
          <p className="helper">
            Creates local HuggingFace embeddings and stores them in FAISS.
          </p>

          <button className="secondary-btn" onClick={buildIndex} disabled={isBuilding}>
            {isBuilding ? "Building..." : "Build Vector Index"}
          </button>

          <button className="danger-btn" onClick={resetKnowledgeBase}>
            <Trash2 size={16} /> Reset Knowledge Base
          </button>

          {status && (
            <div className={`status ${statusType}`}>
              {statusType === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              <span>{status}</span>
            </div>
          )}
        </section>

        <section className="chat-panel">
          <div className="chat-header">
            <div>
              <h2>Chat with your PDF</h2>
              <p>Ask questions from the uploaded document.</p>
            </div>
            <span className="pill">Gemini + FAISS</span>
          </div>

          <div className="messages">
            {messages.length === 0 ? (
              <div className="empty-state">
                <Bot size={44} />
                <h3>No messages yet</h3>
                <p>Try: “What are the main skills in this resume?”</p>
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
                          <summary>{source.file} — Page {source.page}</summary>
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
              placeholder="Ask a question from your PDF..."
              onKeyDown={(e) => {
                if (e.key === "Enter") askQuestion();
              }}
            />
            <button onClick={askQuestion} disabled={isChatting}>
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
