"use client";

import { useState, useEffect, useRef } from "react";

// ── 型別 ──────────────────────────────────────────────────────────
// 三組：intervention（MI+第三視角）、control（無操弄AI）、diary（日記書寫）
type Group = "intervention" | "control" | "diary";
type Screen = "login" | "confirm" | "safety" | "pre_panas" | "chat" | "post_panas" | "done";

// ── 分組邏輯：根據編號開頭字母 ──────────────────────────────────
// E 開頭 → intervention（AI 實驗組）
// C 開頭 → control（AI 對照組）
// D 開頭 → diary（日記書寫組）
function hashGroup(pid: string): Group {
  const prefix = pid.trim().toUpperCase()[0];
  if (prefix === "E") return "intervention";
  if (prefix === "C") return "control";
  if (prefix === "D") return "diary";
  return "diary";
}

function groupLabel(g: Group): string {
  if (g === "intervention") return "AI 對話組（實驗）";
  if (g === "control") return "AI 對話組（對照）";
  return "日記書寫組";
}

// ── 編號格式驗證：E/C/D 開頭 + 至少一個數字，例如 E001 ──────────
function validatePid(pid: string): string | null {
  if (!pid.trim()) return "請輸入研究編號";
  if (!/^[ECDecd]\d+$/.test(pid.trim())) return "編號格式不正確（應為 E001、C001 或 D001）";
  return null;
}

function today() { return new Date().toISOString().slice(0, 10); }
function fmtTime(s: number) { return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`; }

function loadData(pid: string) {
  try { return JSON.parse(localStorage.getItem(`exp_${pid}`) || "null"); } catch { return null; }
}
function saveData(pid: string, data: object) {
  try { localStorage.setItem(`exp_${pid}`, JSON.stringify(data)); } catch { }
}

interface Message { role: "user" | "assistant"; content: string; }
// ── Main ──────────────────────────────────────────────────────────
export default function ExperimentPlatform() {
  const [screen, setScreen]     = useState<Screen>("login");
  const [pid, setPid]           = useState("");
  const [inputPid, setInputPid] = useState("");
  const [group, setGroup]       = useState<Group>("diary");
  const [dayNum, setDayNum]     = useState(1);
  const [error, setError]       = useState("");
  const [distress, setDistress] = useState(30);
  const [safetyChecked, setSafetyChecked] = useState(false);
  const [taskData, setTaskData] = useState<object>({});
  const [prePanas, setPrePanas] = useState<Record<string, number>>({});
  const [postPanas, setPostPanas] = useState<Record<string, number>>({});
  const [showSupport, setShowSupport] = useState(false);

  const doneToday = (() => {
    const trimmed = inputPid.trim();
    if (!trimmed || trimmed.length < 2) return false;
    try {
      const saved = loadData(trimmed);
      return saved?.sessions?.some((s: { date: string }) => s.date === today()) ?? false;
    } catch { return false; }
  })();

  function handleLogin() {
    const trimmed = inputPid.trim().toUpperCase();
    const err = validatePid(trimmed);
    if (err) { setError(err); return; }
    setPid(trimmed); setError(""); setScreen("confirm");
  }

  function handleConfirm() {
    const saved = loadData(pid);
    const g: Group = saved?.group ?? hashGroup(pid);
    const day = Math.min((saved?.sessions?.length ?? 0) + 1, 7);
    setGroup(g); setDayNum(day);
    if (!saved) saveData(pid, { pid, group: g, sessions: [] });
    setSafetyChecked(false);
    setDistress(30);
    setScreen("safety");
  }

  function handleSafetyNext() {
    if (!safetyChecked) return;
    setScreen("pre_panas");
  }

  function handleTaskDone(data: object) {
    setTaskData(data);
    setScreen("post_panas");
  }

  function handleTaskStop() {
    setScreen("done");
  }

  async function handlePostDone(postPanasData: Record<string, number>) {
    const newSession = { date: today(), dayNum, ...taskData, distress, pre_panas: prePanas, post_panas: postPanasData };
    const saved = loadData(pid) ?? { pid, group, sessions: [] };
    saved.sessions = [
      ...(saved.sessions ?? []).filter((s: { date: string }) => s.date !== today()),
      newSession
    ];
    saveData(pid, saved);

    // ── 上傳 Google Sheets ──────────────────────────────────────
    try {
      const td = taskData as { messages?: Message[]; text?: string; word_count?: number; elapsed?: number };
      await fetch("/api/save-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pid, group,
          dayNum,
          date: today(),
          elapsed: td.elapsed ?? 0,
          messages: td.messages ?? [],
          text: td.text ?? "",
          word_count: td.word_count ?? 0,
          distress,
          pre_panas: prePanas,
          post_panas: postPanasData,
        }),
      });
    } catch (e) { console.error("Sheets 失敗", e); }

    // ── 跳轉 Qualtrics ──────────────────────────────────────────
    window.location.href =
      `https://tassel.syd1.qualtrics.com/jfe/form/SV_3C7St6TVaubaUgS?participant_id=${encodeURIComponent(pid)}&group=${group}&day=${dayNum}`;
  }

  const sessions = (() => {
    const trimmed = inputPid.trim();
    if (!trimmed) return 0;
    return loadData(trimmed)?.sessions?.length ?? 0;
  })();

  // ── Screens ──────────────────────────────────────────────────

  if (screen === "login") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem", background:"var(--bg-tertiary)" }}>
      <div style={{ width:"100%", maxWidth:440 }}>
        <div style={{ background:"var(--bg)", border:"0.5px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"2rem" }}>
          <p style={{ fontSize:22, fontWeight:500, marginBottom:"0.25rem" }}>AI互動與情緒書寫研究</p>
          <p style={{ fontSize:14, color:"var(--text-secondary)", marginBottom:"2rem" }}>每日任務・預估時間 15–20 分鐘</p>

          {doneToday && (
            <div style={{ background:"var(--bg-success)", border:"0.5px solid var(--border-success)", borderRadius:"var(--radius)", padding:"0.75rem 1rem", marginBottom:"1.5rem", fontSize:13, color:"var(--text-success)" }}>
              ✓ 你今天已完成任務，請明天再回來。
            </div>
          )}

          {sessions > 0 && (
            <div style={{ marginBottom:"1.5rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-secondary)", marginBottom:6 }}>
                <span>研究進度</span><span>{sessions} / 7 天完成</span>
              </div>
              <div style={{ height:6, background:"var(--bg-secondary)", borderRadius:3, marginBottom:8 }}>
                <div style={{ height:6, background:"var(--text-success)", borderRadius:3, width:`${(sessions/7)*100}%`, transition:"width 0.4s" }} />
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                {[1,2,3,4,5,6,7].map(d => (
                  <div key={d} style={{ width:20, height:20, borderRadius:"50%", background: d <= sessions ? "var(--text-success)" : "var(--bg-secondary)", border:`1.5px solid ${d <= sessions ? "var(--text-success)" : "var(--border)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color: d <= sessions ? "white" : "var(--text-tertiary)", fontWeight:500 }}>
                    {d <= sessions ? "✓" : d}
                  </div>
                ))}
              </div>
            </div>
          )}

          <label style={{ fontSize:13, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>研究編號</label>
          <input
            type="text" value={inputPid}
            onChange={e => { setInputPid(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter" && !doneToday) { e.preventDefault(); handleLogin(); } }}
            placeholder="請輸入研究人員提供的編號"
            style={{ marginBottom: error ? "0.5rem" : "1.25rem" }}
          />
          {error && <p style={{ fontSize:12, color:"var(--text-danger)", marginBottom:"1rem" }}>⚠ {error}</p>}

          <div style={{ display:"flex", gap:8 }}>
            <button type="button" onClick={handleLogin} disabled={doneToday} className="primary"
              style={{ flex:2, padding:"0.625rem", cursor: doneToday ? "not-allowed" : "pointer" }}>
              {doneToday ? "今日已完成" : `開始今日任務（第 ${sessions+1} 天）`}
            </button>
            <button type="button" onClick={() => setShowSupport(s => !s)}
              style={{ flex:1, padding:"0.625rem", fontSize:12 }}>
              聯絡資訊
            </button>
          </div>

          {showSupport && (
            <div style={{ marginTop:"1.25rem", background:"var(--bg-secondary)", borderRadius:"var(--radius)", padding:"0.875rem 1rem", fontSize:13, color:"var(--text-secondary)", lineHeight:1.7 }}>
              <strong style={{ color:"var(--text)", display:"block", marginBottom:4 }}>研究聯絡資訊</strong>
              研究人員：林冠妤<br/>
              Email：carol921011@gmail.com<br/>
              電話：0978-260-566<br/><br/>
              <strong style={{ color:"var(--text)", display:"block", marginBottom:2 }}>心理支持資源</strong>
              安心專線：1925（24小時）<br/>
              張老師專線：1980<br/>
              學校諮商中心：請洽各校官網
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (screen === "confirm") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem", background:"var(--bg-tertiary)" }}>
      <div style={{ width:"100%", maxWidth:440 }}>
        <div style={{ background:"var(--bg)", border:"0.5px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"2rem" }}>
          <p style={{ fontSize:18, fontWeight:500, marginBottom:"1.5rem" }}>確認研究編號</p>
          <div style={{ background:"var(--bg-secondary)", borderRadius:"var(--radius)", padding:"1rem 1.25rem", marginBottom:"1.5rem" }}>
            <p style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:4 }}>你的編號</p>
            <p style={{ fontSize:22, fontWeight:600, letterSpacing:"0.05em" }}>{pid}</p>
          </div>
          <p style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:"1.5rem", lineHeight:1.7 }}>
            請確認編號正確無誤。研究期間將固定使用同一組別。
          </p>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => { setInputPid(""); setScreen("login"); }} style={{ flex:1, padding:"0.625rem" }}>← 返回</button>
            <button onClick={handleConfirm} className="primary" style={{ flex:2, padding:"0.625rem" }}>確認，繼續</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (screen === "safety") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem", background:"var(--bg-tertiary)" }}>
      <div style={{ width:"100%", maxWidth:480 }}>
        <div style={{ background:"var(--bg)", border:"0.5px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"2rem" }}>
          <p style={{ fontSize:18, fontWeight:500, marginBottom:"1.5rem" }}>第 {dayNum} 天・任務前說明</p>

          <div style={{ background:"var(--bg-warning)", border:"0.5px solid var(--border-warning)", borderRadius:"var(--radius)", padding:"1rem 1.25rem", marginBottom:"1.5rem", fontSize:13, color:"var(--text-warning)", lineHeight:1.8 }}>
            <strong style={{ display:"block", marginBottom:6 }}>請注意</strong>
            {group === "diary"
              ? "請書寫與任務相關的內容及感受。請盡可能詳細地描述這段經驗，並沉浸在其中。請自由地表達你對這個經驗所產生的任何情緒與想法。書寫時間為 10 分鐘。"
              : "請向 AI 分享與任務相關的內容及感受。請盡可能詳細地描述這段經驗，並沉浸在其中。請自由地表達你對這個經驗所產生的任何情緒與想法，不論是什麼都可以。請與 AI 進行對話至少 10 分鐘。"
            }<br/><br/>
            請<strong>避免</strong>涉及：創傷事件、急性心理危機、或可辨識他人的個人資料（姓名、學號、電話、地址等）。<br/><br/>
            若在任務過程中感到不適，可隨時停止並查看支持資源。
          </div>

          <label style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:"1.75rem", cursor:"pointer" }}>
            <input type="checkbox" checked={safetyChecked} onChange={e => setSafetyChecked(e.target.checked)}
              style={{ marginTop:2, flexShrink:0, width:16, height:16 }} />
            <span style={{ fontSize:14, lineHeight:1.6 }}>我已閱讀並了解上述說明，今日將書寫適當範疇的困擾。</span>
          </label>

          <div style={{ background:"var(--bg)", border:"0.5px solid var(--border)", borderRadius:"var(--radius)", padding:"1.25rem", marginBottom:"1.5rem" }}>
            <p style={{ fontSize:14, fontWeight:500, marginBottom:"0.5rem" }}>任務前・今日困擾程度</p>
            <p style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:"1rem" }}>你目前對今天打算分享的問題，感受到多大的困擾？</p>
            <input type="range" min="0" max="100" step="1" value={distress} onChange={e => setDistress(Number(e.target.value))} style={{ width:"100%" }} />
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-tertiary)", marginTop:6 }}>
              <span>完全不困擾</span>
              <span style={{ fontWeight:500, color:"var(--text)", fontSize:15 }}>{distress}</span>
              <span>非常困擾</span>
            </div>
          </div>

          <button onClick={handleSafetyNext} disabled={!safetyChecked} className="primary" style={{ width:"100%", padding:"0.625rem" }}>
            {safetyChecked ? "開始今日任務 →" : "請先勾選確認事項"}
          </button>
        </div>
      </div>
    </div>
  );

  if (screen === "pre_panas") return (
    <PanasScreen
      timing="pre"
      onDone={(data) => { setPrePanas(data); setScreen("chat"); }}
    />
  );

  if (screen === "chat") return group === "diary"
    ? <DiaryTask onDone={handleTaskDone} onStop={handleTaskStop} />
    : <ChatTask dayNum={dayNum} group={group} onDone={handleTaskDone} onStop={handleTaskStop} />;

  if (screen === "post_panas") return (
    <PanasScreen
      timing="post"
      onDone={(data) => { setPostPanas(data); handlePostDone(data); }}
    />
  );

  if (screen === "done") return <DoneScreen dayNum={dayNum} pid={pid} onLogout={() => { setInputPid(""); setPid(""); setScreen("login"); }} />;

  return null;
}

// ── ChatTask（AI 兩組共用）───────────────────────────────────────
function ChatTask({ dayNum, group, onDone, onStop }: {
  dayNum: number; group: Group;
  onDone: (d: object) => void;
  onStop: () => void;
}) {
  // 開場白依組別不同
  const opening = group === "intervention"
    ? "你好，很高興你願意花時間和我說說話。今天有什麼事情想和我分享嗎？"
    : "您好！我是這裡的 AI 助理。請隨時跟我分享您最近遇到的困擾或壓力。";

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: opening }
  ]);
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const [elapsed, setElapsed]     = useState(0);
  const [started, setStarted]     = useState(false);
  const [composing, setComposing] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  // phase 追蹤三個引導問題的進度（只有 intervention 組使用）
  // 0=尚未觸發, 1=第一問已問, 2=第二問已問, 3=第三問已問, 4=全部完成
  const [phase, setPhase] = useState(0);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MIN = 600; // 10 分鐘

  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [started]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, streaming]);

  async function send() {
    if (!input.trim() || streaming) return;
    if (!started) setStarted(true);
    const userMsg: Message = { role:"user", content:input.trim() };
    const next = [...messages, userMsg];
    setMessages(next); setInput("");
    textareaRef.current?.focus();
    setStreaming(true);
    try {
      const res = await fetch("/api/chat-openai", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ messages: next, group, elapsed, phase }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const reply = data.reply ?? "（無法取得回應）";
      // 更新 phase（只有 intervention 組的 API 會回傳 nextPhase）
      if (data.nextPhase !== undefined) setPhase(data.nextPhase);
      setMessages(p => [...p, { role: "assistant", content: reply }]);
    } catch { setMessages(p => [...p, { role:"assistant", content:"（連線發生問題，請稍後再試）" }]); }
    setStreaming(false); textareaRef.current?.focus();
  }

  const userCount = messages.filter(m => m.role === "user").length;
  const canFinish = elapsed >= MIN && userCount >= 2;
  const remaining = Math.max(0, MIN - elapsed);

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:640, margin:"0 auto", padding:"1.5rem 1rem" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.75rem" }}>
        <p style={{ fontSize:18, fontWeight:500, margin:0 }}>今日對話・第 {dayNum} 天</p>
        <div style={{ fontSize:13, padding:"4px 12px", borderRadius:"var(--radius)", background: elapsed >= MIN ? "var(--bg-success)" : "var(--bg-secondary)", color: elapsed >= MIN ? "var(--text-success)" : "var(--text-secondary)", border:`0.5px solid ${elapsed >= MIN ? "var(--border-success)" : "var(--border)"}` }}>
          {elapsed >= MIN ? "✓ 已達最低時間" : started ? `剩餘 ${fmtTime(remaining)}` : "尚未開始"}
        </div>
      </div>

      {showDisclaimer && (
        <div style={{ background:"var(--bg-secondary)", border:"0.5px solid var(--border)", borderRadius:"var(--radius)", padding:"0.75rem 1rem", marginBottom:"0.75rem", fontSize:12, color:"var(--text-secondary)", lineHeight:1.7, display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
          <span>今日對話為獨立工作階段，不會讀取前幾日內容。AI 回覆僅供參考，不能取代心理或醫療專業協助。</span>
          <button onClick={() => setShowDisclaimer(false)} style={{ padding:"2px 8px", fontSize:11, flexShrink:0 }}>收起</button>
        </div>
      )}

      <div style={{ flex:1, background:"var(--bg)", border:"0.5px solid var(--border)", borderRadius:"var(--radius-lg)", overflowY:"auto", padding:"1rem", marginBottom:"0.75rem", display:"flex", flexDirection:"column", gap:12, minHeight:320 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", flexDirection: m.role==="user" ? "row-reverse" : "row", gap:8, alignItems:"flex-start" }}>
            <div style={{ width:28, height:28, borderRadius:"50%", background: m.role==="user" ? "var(--bg-info)" : "var(--bg-secondary)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:11, fontWeight:500, color: m.role==="user" ? "var(--text-info)" : "var(--text-secondary)" }}>
              {m.role==="user" ? "我" : "AI"}
            </div>
            <div style={{ maxWidth:"78%", background: m.role==="user" ? "var(--bg-info)" : "var(--bg-secondary)", borderRadius:"var(--radius)", padding:"0.6rem 0.9rem", fontSize:14, lineHeight:1.7, color: m.role==="user" ? "var(--text-info)" : "var(--text)", whiteSpace:"pre-wrap" }}>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:"0.75rem" }}>
        <textarea ref={textareaRef} value={input}
          onChange={e => setInput(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey && !composing) { e.preventDefault(); send(); } }}
          placeholder="輸入訊息⋯（Enter 送出，Shift+Enter 換行）"
          rows={3} style={{ flex:1, resize:"none", fontSize:13 }}
        />
        <button onClick={send} disabled={streaming || !input.trim()} style={{ alignSelf:"flex-end", padding:"0.5rem 1rem" }}>送出</button>
      </div>

      <button onClick={() => onDone({ messages, elapsed })} disabled={!canFinish} className="primary" style={{ width:"100%", padding:"0.625rem" }}>
        {canFinish ? "完成對話，填寫問卷 →" : `請繼續對話（${fmtTime(remaining)} / 至少 2 則訊息）`}
      </button>
    </div>
  );
}

// ── DiaryTask（日記書寫組）───────────────────────────────────────
function DiaryTask({ onDone, onStop }: {
  onDone: (d: object) => void;
  onStop: () => void;
}) {
  const [text, setText]       = useState("");
  const [elapsed, setElapsed] = useState(0);
  const MIN = 600; // 10 分鐘
  const MIN_WORDS = 100;

  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const wordCount = text.trim().length;
  const remaining = Math.max(0, MIN - elapsed);
  const canFinish = elapsed >= MIN && wordCount >= MIN_WORDS;

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:640, margin:"0 auto", padding:"1.5rem 1rem" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.75rem" }}>
        <p style={{ fontSize:18, fontWeight:500, margin:0 }}>今日書寫</p>
        <div style={{ fontSize:13, padding:"4px 12px", borderRadius:"var(--radius)", background: elapsed >= MIN ? "var(--bg-success)" : "var(--bg-secondary)", color: elapsed >= MIN ? "var(--text-success)" : "var(--text-secondary)", border:`0.5px solid ${elapsed >= MIN ? "var(--border-success)" : "var(--border)"}` }}>
          {elapsed >= MIN ? "✓ 已達最低時間" : `剩餘 ${fmtTime(remaining)}`}
        </div>
      </div>

      <div style={{ background:"var(--bg-secondary)", border:"0.5px solid var(--border)", borderRadius:"var(--radius)", padding:"0.75rem 1rem", marginBottom:"0.75rem", fontSize:12, color:"var(--text-secondary)", lineHeight:1.7 }}>
        請書寫今天讓你感到困擾或壓力的事件，以及你的想法和感受。請盡量詳細描述，至少 {MIN_WORDS} 字。
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="請在這裡書寫你的困擾或壓力經驗⋯"
        style={{ flex:1, resize:"none", fontSize:14, lineHeight:1.8, minHeight:360, marginBottom:"0.75rem", padding:"1rem" }}
      />

      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-secondary)", marginBottom:"0.75rem" }}>
        <span>已輸入 {wordCount} 字{wordCount < MIN_WORDS ? `（至少需要 ${MIN_WORDS} 字）` : " ✓"}</span>
      </div>

      <button
        onClick={() => onDone({ text, word_count: wordCount, elapsed })}
        disabled={!canFinish}
        className="primary"
        style={{ width:"100%", padding:"0.625rem" }}
      >
        {canFinish ? "完成書寫，填寫問卷 →" : `請繼續書寫（${wordCount < MIN_WORDS ? `還需 ${MIN_WORDS - wordCount} 字` : fmtTime(remaining)}）`}
      </button>
    </div>
  );
}

// ── PostQuestionnaire ─────────────────────────────────────────────

// ── DoneScreen ────────────────────────────────────────────────────
function DoneScreen({ dayNum, pid, onLogout }: { dayNum: number; pid: string; onLogout: () => void }) {
  const [showSupport, setShowSupport] = useState(false);
  const remaining = 7 - dayNum;

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem", background:"var(--bg-tertiary)" }}>
      <div style={{ width:"100%", maxWidth:440 }}>
        <div style={{ background:"var(--bg)", border:"0.5px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"2rem", textAlign:"center" }}>
          <div style={{ width:52, height:52, borderRadius:"50%", background:"var(--bg-success)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 1.25rem", fontSize:24 }}>✓</div>
          <p style={{ fontSize:20, fontWeight:500, marginBottom:"0.5rem" }}>今日任務已完成！</p>
          {remaining <= 0 && (
            <p style={{ fontSize:14, color:"var(--text-secondary)", marginBottom:"0.75rem", lineHeight:1.7 }}>
              你已完成所有 7 天！感謝你的參與，研究人員將與你聯繫。
            </p>
          )}
          <p style={{ fontSize:13, color:"var(--text-tertiary)", marginBottom:"1.5rem" }}>
            若任務後持續感到不舒服，歡迎查看支持資源。
          </p>
          <div style={{ background:"var(--bg-secondary)", borderRadius:"var(--radius)", padding:"0.75rem 1rem", marginBottom:"1.5rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-secondary)", marginBottom:6 }}>
              <span>研究進度</span><span>{dayNum} / 7 天</span>
            </div>
            <div style={{ height:4, background:"var(--bg-tertiary)", borderRadius:2 }}>
              <div style={{ height:4, background:"var(--text-success)", borderRadius:2, width:`${(dayNum/7)*100}%` }} />
            </div>
          </div>

          {showSupport && (
            <div style={{ background:"var(--bg-secondary)", borderRadius:"var(--radius)", padding:"1rem", marginBottom:"1.25rem", fontSize:13, color:"var(--text-secondary)", lineHeight:1.8, textAlign:"left" }}>
              <strong style={{ color:"var(--text)", display:"block", marginBottom:6 }}>心理支持資源</strong>
              安心專線：<strong>1925</strong>（24小時免費）<br/>
              張老師專線：<strong>1980</strong><br/>
              生命線：<strong>1995</strong><br/>
              研究人員：carol921011@gmail.com
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button onClick={() => setShowSupport(s => !s)} style={{ width:"100%", padding:"0.5rem", fontSize:13 }}>
              {showSupport ? "收起支持資源" : "查看支持資源"}
            </button>
            <button onClick={onLogout} className="primary" style={{ width:"100%", padding:"0.625rem" }}>完成並離開</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PanasScreen（mPANAS 前後測）────────────────────────────────────
const PANAS_ITEMS = [
  { id: "p01", label: "感興趣的" },
  { id: "p02", label: "悲傷的" },
  { id: "p03", label: "興奮的" },
  { id: "p04", label: "沮喪的" },
  { id: "p05", label: "堅強的" },
  { id: "p06", label: "內疚的" },
  { id: "p07", label: "驚嚇的" },
  { id: "p08", label: "懷有敵意的" },
  { id: "p09", label: "熱衷的" },
  { id: "p10", label: "驕傲的" },
  { id: "p11", label: "煩躁的" },
  { id: "p12", label: "機警的" },
  { id: "p13", label: "羞愧的" },
  { id: "p14", label: "受到鼓舞的" },
  { id: "p15", label: "緊張的" },
  { id: "p16", label: "果決的" },
  { id: "p17", label: "專注的" },
  { id: "p18", label: "不安的" },
  { id: "p19", label: "積極的" },
  { id: "p20", label: "恐懼的" },
  { id: "p21", label: "愉悅的" },
  { id: "p22", label: "冷靜的" },
  { id: "p23", label: "憂鬱的" },
  { id: "p24", label: "沮喪的" },
  { id: "p25", label: "失望的" },
  { id: "p26", label: "快樂的" },
  { id: "p27", label: "放鬆的" },
  { id: "p28", label: "寬慰的" },
  { id: "p29", label: "滿足的" },
  { id: "p30", label: "好奇的" },
  { id: "p31", label: "滿意的" },
  { id: "p32", label: "驚訝的" },
  { id: "p33", label: "生氣的" },
  { id: "p34", label: "焦慮的" },
  { id: "p35", label: "氣餒的" },
  { id: "p36", label: "厭惡的" },
  { id: "p37", label: "傷心的" },
  { id: "p38", label: "疲倦的" },
] as const;

const PANAS_LABELS = ["非常輕微\n或完全沒有", "一點點", "中等程度", "相當多", "極度強烈"];

function PanasScreen({
  timing,
  onDone,
}: {
  timing: "pre" | "post";
  onDone: (data: Record<string, number>) => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(PANAS_ITEMS.map(item => [item.id, 0]))
  );

  const allAnswered = Object.values(scores).every(v => v > 0);

  const title = timing === "pre" ? "任務前・情緒狀態" : "任務後・情緒狀態";
  const desc = timing === "pre"
    ? "在開始今日任務之前，請評估你現在的感受程度。"
    : "完成今日任務之後，請評估你現在的感受程度。";

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <p style={{ fontSize: 18, fontWeight: 500, marginBottom: "0.25rem" }}>{title}</p>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>{desc}</p>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: "1.5rem" }}>
        請針對每個詞語，選擇最符合你<strong>此刻</strong>感受的程度。
      </p>

      {/* 標題列 */}
      <div style={{ display: "grid", gridTemplateColumns: "120px repeat(5, 1fr)", gap: 4, marginBottom: "0.5rem", paddingLeft: "0.5rem" }}>
        <div />
        {PANAS_LABELS.map((label, i) => (
          <div key={i} style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.3, whiteSpace: "pre-line" }}>
            {label}
          </div>
        ))}
      </div>

      {PANAS_ITEMS.map(item => (
        <div key={item.id} style={{
          display: "grid",
          gridTemplateColumns: "120px repeat(5, 1fr)",
          gap: 4,
          alignItems: "center",
          padding: "0.4rem 0.5rem",
          borderRadius: "var(--radius)",
          background: scores[item.id] > 0 ? "var(--bg-secondary)" : "var(--bg)",
          border: "0.5px solid var(--border)",
          marginBottom: 4,
        }}>
          <span style={{ fontSize: 14, fontWeight: scores[item.id] > 0 ? 500 : 400 }}>
            {item.label}
          </span>
          {[1, 2, 3, 4, 5].map(val => (
            <label key={val} style={{ display: "flex", justifyContent: "center", cursor: "pointer" }}>
              <input
                type="radio"
                name={item.id}
                value={val}
                checked={scores[item.id] === val}
                onChange={() => setScores(prev => ({ ...prev, [item.id]: val }))}
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
            </label>
          ))}
        </div>
      ))}

      <div style={{ marginTop: "1.5rem", marginBottom: "0.5rem", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
        {allAnswered ? "✓ 全部填寫完畢" : `還有 ${Object.values(scores).filter(v => v === 0).length} 題未填寫`}
      </div>

      <button
        onClick={() => onDone(scores)}
        disabled={!allAnswered}
        className="primary"
        style={{ width: "100%", padding: "0.625rem" }}
      >
        {allAnswered ? (timing === "pre" ? "開始今日任務 →" : "繼續填寫問卷 →") : "請完成所有題目"}
      </button>
    </div>
  );
}