"use client";

import { useState } from "react";

export default function Home() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const max = 280;
  const remaining = max - text.length;

  async function post() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStatus({ ok: true, url: data.url });
      setText("");
    } catch (err) {
      setStatus({ ok: false, msg: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 560,
        margin: "60px auto",
        padding: "0 20px",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Post to X</h1>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening?"
        rows={5}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: 14,
          fontSize: 18,
          borderRadius: 12,
          border: "1px solid #2f3336",
          background: "#000",
          color: "#e7e9ea",
          resize: "vertical",
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <span style={{ color: remaining < 0 ? "#f4212e" : "#71767b" }}>
          {remaining}
        </span>
        <button
          onClick={post}
          disabled={loading || !text.trim() || remaining < 0}
          style={{
            padding: "10px 24px",
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 9999,
            border: "none",
            background: "#1d9bf0",
            color: "#fff",
            cursor: "pointer",
            opacity: loading || !text.trim() || remaining < 0 ? 0.5 : 1,
          }}
        >
          {loading ? "Posting…" : "Post"}
        </button>
      </div>

      {status && (
        <div style={{ marginTop: 20 }}>
          {status.ok ? (
            <p style={{ color: "#00ba7c" }}>
              Posted!{" "}
              <a href={status.url} target="_blank" rel="noreferrer" style={{ color: "#1d9bf0" }}>
                View tweet
              </a>
            </p>
          ) : (
            <p style={{ color: "#f4212e" }}>Error: {status.msg}</p>
          )}
        </div>
      )}
    </main>
  );
}
