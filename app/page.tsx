"use client";

import { useState } from "react";

export default function Home() {
    const [count, setCount] = useState(0);

    return (
        <main
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "24px",
                backgroundColor: "#f0fdf4",
            }}
        >
            <h1>クリックカウンター</h1>
            <p>ボタンを押した回数</p>
            <h2>{count} 回</h2>
            <button
                onClick={() => {
                    console.log("ボタンが押されました");
                    setCount((prev) => prev + 1);
                }}
                style={{
                    padding: "16px 32px",
                    backgroundColor: "#15803d",
                    color: "white",
                    borderRadius: "30px",
                    cursor: "pointer",
                }}
            >
                クリックしてね！
            </button>
            <button onClick={() => setCount(0)}>リセット</button>
        </main>
    );
}
