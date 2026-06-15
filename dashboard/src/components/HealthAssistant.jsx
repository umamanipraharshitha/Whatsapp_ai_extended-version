import React, { useState, useEffect } from "react";
import "./HealthAssistant.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getUserId() {
  let id = localStorage.getItem("health_user_id");
  if (!id) {
    id = `web_${Date.now()}`;
    localStorage.setItem("health_user_id", id);
  }
  return id;
}

const HealthAssistant = () => {
  const [mode, setMode] = useState("ingest");
  const [ingestText, setIngestText] = useState("");
  const [question, setQuestion] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiOk, setApiOk] = useState(null);
  const userId = getUserId();

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((r) => r.json())
      .then((d) => setApiOk(d.ok))
      .catch(() => setApiOk(false));
  }, []);

  const handleIngest = async (e) => {
    e.preventDefault();
    if (!ingestText.trim()) return;
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ingestText, userId }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus(`✅ ${data.message}`);
        setIngestText("");
      } else {
        setStatus(`❌ ${data.error || "Ingestion failed"}`);
      }
    } catch (err) {
      setStatus(`❌ Cannot reach backend at ${API_BASE}. Run: node index.js`);
    }
    setLoading(false);
  };

  const handleQuery = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    const q = question;
    setQuestion("");
    try {
      const res = await fetch(`${API_BASE}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, userId }),
      });
      const data = await res.json();
      const reply = data.ok
        ? data.answer
        : data.message || data.error || "No answer found.";
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "❌ Backend unreachable. Start the server with: node index.js" },
      ]);
    }
    setLoading(false);
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", text: chatMessage }]);
    const msg = chatMessage;
    setChatMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.ok ? data.answer : data.error },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "❌ Backend unreachable." },
      ]);
    }
    setLoading(false);
  };

  return (
    <div className="health-assistant">
      <header className="ha-header">
        <div>
          <h1>Health AI Assistant</h1>
          <p className="ha-subtitle">
            Web interface — no Twilio needed. Ingest docs, ask questions, chat with Gemini.
          </p>
        </div>
        <div className={`ha-status ${apiOk ? "online" : "offline"}`}>
          {apiOk === null ? "Checking..." : apiOk ? "● Backend online" : "● Backend offline"}
        </div>
      </header>

      <nav className="ha-tabs">
        {[
          { id: "ingest", label: "1 · Ingest Documents" },
          { id: "query", label: "2 · Document Q&A" },
          { id: "chat", label: "3 · General Chat" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={mode === tab.id ? "active" : ""}
            onClick={() => { setMode(tab.id); setMessages([]); setStatus(""); }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="ha-main">
        {mode === "ingest" && (
          <section className="ha-panel">
            <h2>Ingest Medical Documents</h2>
            <p>Paste text from prescriptions, notes, or health articles. It will be chunked and stored in Qdrant.</p>
            <form onSubmit={handleIngest}>
              <textarea
                value={ingestText}
                onChange={(e) => setIngestText(e.target.value)}
                placeholder="Paste your medical text here..."
                rows={12}
              />
              <button type="submit" disabled={loading || !ingestText.trim()}>
                {loading ? "Ingesting..." : "Ingest Document"}
              </button>
            </form>
            {status && <p className="ha-feedback">{status}</p>}
          </section>
        )}

        {mode === "query" && (
          <section className="ha-panel">
            <h2>Ask Questions About Your Documents</h2>
            <div className="ha-chat">
              {messages.length === 0 && (
                <p className="ha-hint">Ask something like: "What are the side effects of Paracetamol?"</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`ha-bubble ${m.role}`}>
                  {m.text}
                </div>
              ))}
            </div>
            <form onSubmit={handleQuery} className="ha-input-row">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Your question..."
                disabled={loading}
              />
              <button type="submit" disabled={loading || !question.trim()}>Ask</button>
            </form>
          </section>
        )}

        {mode === "chat" && (
          <section className="ha-panel">
            <h2>General Health Chat</h2>
            <div className="ha-chat">
              {messages.length === 0 && (
                <p className="ha-hint">Ask any general health question — powered by Gemini.</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`ha-bubble ${m.role}`}>
                  {m.text}
                </div>
              ))}
            </div>
            <form onSubmit={handleChat} className="ha-input-row">
              <input
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Your message..."
                disabled={loading}
              />
              <button type="submit" disabled={loading || !chatMessage.trim()}>Send</button>
            </form>
          </section>
        )}
      </main>

      <footer className="ha-footer">
        User session: <code>{userId}</code>
      </footer>
    </div>
  );
};

export default HealthAssistant;
