import { useState, useEffect, useRef, useCallback } from "react";

const API = "http://localhost:8000";
const POLL_INTERVAL = 2500;

const G = {
  green50: "#EAF3DE", green100: "#C0DD97", green600: "#3B6D11", green800: "#27500A",
  red50: "#FCEBEB", red100: "#F7C1C1", red400: "#E24B4A", red800: "#791F1F",
  amber50: "#FAEEDA", amber600: "#854F0B",
  gray50: "#F1EFE8", gray100: "#D3D1C7", gray400: "#888780", gray600: "#5F5E5A",
  bg: "#f5f2ed", card: "#ffffff", border: "#e8e3dc",
};

function Badge({ healthy }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
      padding: "3px 9px", borderRadius: 999,
      background: healthy ? G.green50 : G.red50,
      color: healthy ? G.green600 : G.red800,
      border: `1px solid ${healthy ? G.green100 : G.red100}`,
    }}>
      {healthy ? "Healthy" : "Disease"}
    </span>
  );
}

function ConfBar({ pct, healthy }) {
  return (
    <div style={{ height: 5, background: G.gray100, borderRadius: 99, overflow: "hidden", marginTop: 4 }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: 99,
        background: healthy ? G.green600 : G.red400,
        transition: "width 0.6s ease",
      }} />
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: G.card, border: `1px solid ${G.border}`, borderRadius: 12,
      padding: "16px 20px", borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, color: G.gray400, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#1a1a1a", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: G.gray600, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function LiveFeed({ live, robotConnected }) {
  return (
    <div style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${G.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: robotConnected ? "#3B6D11" : G.gray400,
            boxShadow: robotConnected ? "0 0 0 3px #C0DD97" : "none",
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>Robot live feed</span>
        </div>
        <span style={{ fontSize: 12, color: G.gray400 }}>
          {robotConnected ? "streaming" : "waiting for robot…"}
        </span>
      </div>

      <div style={{
        height: 240, background: "#0f1a0f", display: "flex",
        alignItems: "center", justifyContent: "center", position: "relative",
      }}>
        {live?.frame ? (
          <>
            <img src={live.frame} alt="Live robot frame"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {live.result && (
              <div style={{
                position: "absolute", bottom: 10, left: 10, right: 10,
                background: "rgba(0,0,0,0.72)", borderRadius: 8,
                padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                    {live.result.plant} — {live.result.condition}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                    {live.timestamp ? new Date(live.timestamp).toLocaleTimeString() : ""}
                  </div>
                </div>
                <Badge healthy={live.result.is_healthy} />
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No frame received yet</div>
          </div>
        )}
      </div>
    </div>
  );
}

function LogRow({ entry, i }) {
  const isDisease = !entry.is_healthy;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "32px 1fr auto auto",
      alignItems: "center", gap: 12, padding: "10px 16px",
      borderBottom: `1px solid ${G.border}`,
      background: isDisease && i === 0 ? G.red50 : "transparent",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 6, overflow: "hidden", background: G.gray50,
        flexShrink: 0,
      }}>
        {entry.thumbnail
          ? <img src={entry.thumbnail.startsWith("data:") ? entry.thumbnail : `data:image/jpeg;base64,${entry.thumbnail}`}
            alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🌿</div>
        }
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
          {entry.plant} — {entry.condition}
        </div>
        <div style={{ fontSize: 11, color: G.gray400 }}>
          {new Date(entry.timestamp).toLocaleTimeString()} · {entry.source}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: isDisease ? G.red400 : G.green600 }}>
        {entry.confidence.toFixed(1)}%
      </div>
      <Badge healthy={entry.is_healthy} />
    </div>
  );
}

function UploadPanel({ onResult }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const ref = useRef();

  const handleFile = (f) => {
    if (!f) return;
    setFile(f); setResult(null); setError(null);
    const r = new FileReader();
    r.onload = (e) => setPreview(e.target.result);
    r.readAsDataURL(f);
  };

  const predict = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/predict`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      setResult(data);
      onResult && onResult();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${G.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>Manual upload</span>
      </div>
      <div style={{ padding: 16 }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => !preview && ref.current.click()}
          style={{
            border: `2px dashed ${dragging ? G.green600 : G.border}`, borderRadius: 10,
            background: dragging ? G.green50 : G.gray50, cursor: preview ? "default" : "pointer",
            overflow: "hidden", minHeight: preview ? "auto" : 100,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {preview ? (
            <div style={{ position: "relative" }}>
              <img src={preview} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }} />
              <button onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); setResult(null); }}
                style={{
                  position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)",
                  color: "#fff", border: "none", borderRadius: 99, width: 24, height: 24,
                  cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                }}>×</button>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ fontSize: 24 }}>🌿</div>
              <div style={{ fontSize: 12, color: G.gray400, marginTop: 4 }}>Drop or click to upload</div>
            </div>
          )}
        </div>
        <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files[0])} />

        {preview && (
          <button onClick={predict} disabled={loading}
            style={{
              width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 8,
              background: loading ? G.gray100 : G.green600, color: loading ? G.gray400 : "#fff",
              border: "none", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}>
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        )}

        {error && (
          <div style={{ marginTop: 10, padding: 10, background: G.red50, borderRadius: 8, fontSize: 13, color: G.red800 }}>
            {error}
          </div>
        )}

        {result && !loading && (
          <div style={{
            marginTop: 10, padding: 12, background: result.is_healthy ? G.green50 : G.red50,
            borderRadius: 8, border: `1px solid ${result.is_healthy ? G.green100 : G.red100}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: result.is_healthy ? G.green800 : G.red800 }}>
                {result.plant}
              </div>
              <Badge healthy={result.is_healthy} />
            </div>
            <div style={{ fontSize: 12, color: result.is_healthy ? G.green600 : G.red400 }}>{result.condition}</div>
            <ConfBar pct={result.confidence} healthy={result.is_healthy} />
            <div style={{ fontSize: 11, color: G.gray600, marginTop: 4, textAlign: "right" }}>{result.confidence.toFixed(1)}% confidence</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [live, setLive] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ total: 0, diseases: 0, healthy: 0, avgConf: 0 });
  const [robotConnected, setRobotConnected] = useState(false);
  const lastFrameTs = useRef(null);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch(`${API}/robot/live`);
      const data = await res.json();
      if (data.frame) {
        setLive(data);
        if (data.timestamp !== lastFrameTs.current) {
          lastFrameTs.current = data.timestamp;
          setRobotConnected(true);
        }
      }
    } catch { }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/history?limit=50`);
      const data = await res.json();
      const dets = data.detections || [];
      setHistory(dets);
      if (dets.length > 0) {
        const diseases = dets.filter(d => !d.is_healthy).length;
        const avgConf = dets.reduce((s, d) => s + d.confidence, 0) / dets.length;
        setStats({ total: dets.length, diseases, healthy: dets.length - diseases, avgConf });
      }
    } catch { }
  }, []);

  const clearHistory = async () => {
    await fetch(`${API}/history`, { method: "DELETE" });
    setHistory([]); setLive(null); setRobotConnected(false);
    setStats({ total: 0, diseases: 0, healthy: 0, avgConf: 0 });
  };

  useEffect(() => {
    fetchLive(); fetchHistory();
    const id = setInterval(() => { fetchLive(); fetchHistory(); }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchLive, fetchHistory]);

  return (
    <div style={{ minHeight: "100vh", background: G.bg, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&display=swap" rel="stylesheet" />

      <header style={{ background: G.card, borderBottom: `1px solid ${G.border}`, padding: "0 28px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: G.green600, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 15, color: "#fff" }}>✦</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: "#1a1a1a" }}>PlantGuard</span>
            <span style={{ fontSize: 11, color: G.gray400, background: G.gray50, padding: "2px 8px", borderRadius: 99, border: `1px solid ${G.border}`, marginLeft: 4 }}>
              Robot Dashboard
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: robotConnected ? G.green600 : G.gray400,
            }} />
            <span style={{ fontSize: 12, color: G.gray600 }}>
              {robotConnected ? "Robot online" : "Robot offline"}
            </span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard label="Total scans" value={stats.total} sub="all time" accent={G.green600} />
          <StatCard label="Diseases found" value={stats.diseases}
            sub={stats.total ? `${((stats.diseases / stats.total) * 100).toFixed(0)}% of scans` : "—"}
            accent={G.red400} />
          <StatCard label="Healthy plants" value={stats.healthy}
            sub={stats.total ? `${((stats.healthy / stats.total) * 100).toFixed(0)}% of scans` : "—"}
            accent="#97C459" />
          <StatCard label="Avg confidence" value={stats.total ? `${stats.avgConf.toFixed(1)}%` : "—"} sub="model certainty" accent={G.amber600} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <LiveFeed live={live} robotConnected={robotConnected} />
            <div style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{
                padding: "12px 16px", borderBottom: `1px solid ${G.border}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>Detection log</span>
                {history.length > 0 && (
                  <button onClick={clearHistory} style={{
                    fontSize: 12, color: G.red400, background: "none", border: "none",
                    cursor: "pointer", fontFamily: "inherit",
                  }}>Clear all</button>
                )}
              </div>
              {history.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: G.gray400, fontSize: 13 }}>
                  No detections yet — start the robot or upload an image
                </div>
              ) : (
                history.slice(0, 20).map((e, i) => <LogRow key={e.id} entry={e} i={i} />)
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <UploadPanel onResult={fetchHistory} />
            <div style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 12 }}>Robot setup</div>
              <div style={{ fontSize: 12, color: G.gray600, lineHeight: 1.7 }}>
                Run <code style={{ background: G.gray50, padding: "1px 5px", borderRadius: 4, fontFamily: "monospace" }}>robot_client.py</code> on your robot board.
                Set <code style={{ background: G.gray50, padding: "1px 5px", borderRadius: 4, fontFamily: "monospace" }}>API_URL</code> to your PC's local IP.
              </div>
              <div style={{ marginTop: 12, padding: 10, background: G.gray50, borderRadius: 8, fontFamily: "monospace", fontSize: 11, color: G.gray600 }}>
                POST /robot/frame → auto-detect<br />
                GET  /robot/live  → latest frame<br />
                GET  /history     → detection log
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}