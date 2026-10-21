"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCount() {
      try {
        const response = await fetch("/api/count", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Load failed");
        const data = await response.json();
        if (active) setCount(data.count);
      } catch {
        if (active) setError("数字を読み込めませんでした");
      } finally {
        if (active) setBusy(false);
      }
    }

    void loadCount();
    return () => {
      active = false;
    };
  }, []);

  async function changeCount(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/count", { method });
      if (!response.ok) throw new Error("Save failed");
      const data = await response.json();
      setCount(data.count);
    } catch {
      setError("保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        backgroundColor: "#EAF3FF",
      }}
    >
      <h1>クリックカウンター</h1>
      <p>ボタンを押した回数</p>
      <h2>{busy ? "..." : count} 回</h2>

      <button
        disabled={busy}
        onClick={() => void changeCount("POST")}
        style={{
          padding: "16px 32px",
          backgroundColor: "#2457BA",
          color: "white",
          borderRadius: "30px",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        1回カウントする
      </button>

      <button
        disabled={busy}
        onClick={() => void changeCount("DELETE")}
      >
        リセット
      </button>

      {error && <p role="alert">{error}</p>}
    </main>
  );
}
