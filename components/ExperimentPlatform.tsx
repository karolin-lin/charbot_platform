"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

type Group = "prompted" | "ai" | "control";
type Screen = "login" | "confirm" | "safety" | "chat" | "post" | "done";

function hashGroup(pid: string): Group {
  const num = parseInt(pid.replace(/\D/g, ""), 10);
  if (num <= 40) return "prompted";
  if (num <= 80) return "ai";
  return "control";
}

function today() { return new Date().toISOString().slice(0, 10); }
function fmtTime(s: number) { return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`; }

function loadData(pid: string) {
  try { return JSON.parse(localStorage.getItem(`exp_${pid}`) || "null"); } catch { return null; }
}
function saveData(pid: string, data: object) {
  try { localStorage.setItem(`exp_${pid}`, JSON.stringify(data)); } catch { }
}
function apiRoute(_g: Group) {
  return "/api/chat-openai";
}

interface Message { role: "user" | "assistant"; content: string; }
interface PostData {
  emotion: number;
  mental_demand: number;
  effort: number;
  control: number;
  attribution: number;
}

// ── Export ────────────────────────────────────────────────────

function exportToExcel(pid: string) {
  const saved = loadData(pid);
  if (!saved || !saved.sessions?.length) { alert("尚無資料可匯出"); return; }
  const wb = XLSX.utils.book_new();
  const summaryRows = saved.sessions.map((s: {
    date: string; dayNum: number; elapsed: number; distress?: number;
    post?: PostData; messages?: Message[]; text?: string; word_count?: number;
  }) => ({
    參與者編號: pid, 組別: saved.group, 日期: s.date, 第幾天: s.dayNum,
    任務前困擾程度: s.distress ?? "",
    任務時間_秒: s.elapsed ?? "",
    任務後情緒: s.post?.emotion ?? "",
    心智需求: s.post?.mental_demand ?? "",
    努力程度: s.post?.effort ?? "",
    主觀掌控: s.post?.control ?? "",
    改善歸因: s.post?.attribution ?? "",
    訊息則數_AI組: s.messages ? s.messages.filter((m: Message) => m.role === "user").length : "",
    字數_日記組: s.word_count ?? "",
  }));
  const ws1 = XLSX.utils.json_to_sheet(summaryRows);
  ws1["!cols"] = [14,10,12,8,14,12,12,10,10,10,10,14,12].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, "每日摘要");
  const msgRows: object[] = [];
  saved.sessions.forEach((s: { date: string; dayNum: number; messages?: Message[] }) => {
    if (!s.messages) return;
    s.messages.forEach((m: Message, idx: number) => {
      msgRows.push({ 參與者編號: pid, 組別: saved.group, 日期: s.date, 第幾天: s.dayNum, 訊息序號: idx+1, 角色: m.role === "user" ? "受試者" : "AI", 內容: m.content });
    });
  });
  if (msgRows.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(msgRows);
    ws2["!cols"] = [14,10,12,8,8,8,60].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, "對話紀錄");
  }
  XLSX.writeFile(wb, `experiment_${pid}_${today()}.xlsx`);
}

// ── Main ──────────────────────────────────────────────────────

export default function ExperimentPlatform() {
  const [screen, setScreen]     = useState<Screen>("login");
  const [pid, setPid]           = useState("");
  const [inputPid, setInputPid] = useState("");
  const [group, setGroup]       = useState<Group>("prompted"); // 佔位值，handleConfirm 時會覆蓋為實際組別
  const [dayNum, setDayNum]     = useState(1);
  const [error, setError]       = useState("");
  const [distress, setDistress] = useState(30);
  const [safetyChecked, setSafetyChecked] = useState(false);
  const [taskData, setTaskData] = useState<object>({});
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
    const trimmed = inputPid.trim();
    if (!trimmed) { setError("請輸入研究編號"); return; }
    if (trimmed.length < 2) { setError("編號格式不正確"); return; }
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
    // 所有組別（含 control）都走相同流程：任務 → 問卷 → 完成頁
    setScreen("chat");
  }

  function handleTaskDone(data: object) {
    setTaskData(data);
    setScreen("post");
  }

  function handleTaskStop() {
    setScreen("done");
  }

  async function handlePostDone(postData: PostData) {
    const newSession = { date: today(), dayNum, ...taskData, distress, post: postData };
    const saved = loadData(pid) ?? { pid, group, sessions: [] };
    saved.sessions = [
      ...(saved.sessions ?? []).filter((s: { date: string }) => s.date !== today()),
      newSession
    ];
    saveData(pid, saved);
    try {
      await fetch("/api/save-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid, group, session: newSession }),
      });
    } catch (e) { console.error("Sheets 失敗", e); }
    setScreen("done");
  }

  const sessions = (() => {
    const trimmed = inputPid.trim();
    if (!trimmed) return 0;
    return loadData(trimmed)?.sessions?.length ?? 0;
  })();

  // ── Screens ──

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
            onKeyDown={e => {
              if (e.key === "Enter" && !doneToday) {
                e.preventDefault();
                handleLogin();
              }
            }}
            placeholder="請輸入研究人員提供的編號"
            style={{ marginBottom: error ? "0.5rem" : "1.25rem" }}
          />
          {error && <p style={{ fontSize:12, color:"var(--text-danger)", marginBottom:"1rem" }}>⚠ {error}</p>}

          <div style={{ display:"flex", gap:8 }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleLogin();
              }}
              disabled={doneToday}
              className="primary"
              style={{ flex:2, padding:"0.625rem", cursor: doneToday ? "not-allowed" : "pointer" }}
            >
              {doneToday ? "今日已完成" : `開始今日任務（第 ${sessions+1} 天）`}
            </button>
            <button
              type="button"
              onClick={() => setShowSupport(s => !s)}
              style={{ flex:1, padding:"0.625rem", fontSize:12 }}
            >
              聯絡資訊
            </button>
          </div>

          {showSupport && (
            <div style={{ marginTop:"1.25rem", background:"var(--bg-secondary)", borderRadius:"var(--radius)", padding:"0.875rem 1rem", fontSize:13, color:"var(--text-secondary)", lineHeight:1.7 }}>
              <strong style={{ color:"var(--text)", display:"block", marginBottom:4 }}>研究聯絡資訊</strong>
              研究人員：林冠妤<br/>
              Email：carol921011@gmail.com<br/>
              電話：0978-260-566<br/>
              <br/>
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
            請向 AI 分享與任務相關的內容及感受。請盡可能詳細地描述這段經驗，並沉浸在其中。請自由地表達你對這個經驗所產生的任何情緒與想法，不論是什麼都可以。請與 AI 進行對話至少 10 分鐘。<br/><br/>
            請<strong>避免</strong>涉及：創傷事件、急性心理危機、或可辨識他人的個人資料（姓名、學號、電話、地址等）。<br/><br/>
            若在任務過程中感到不適，可隨時停止並查看支持資源。
          </div>

          <label style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:"1.75rem", cursor:"pointer" }}>
            <input
              type="checkbox"
              checked={safetyChecked}
              onChange={e => setSafetyChecked(e.target.checked)}
              style={{ marginTop:2, flexShrink:0, width:16, height:16 }}
            />
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

          <button
            onClick={handleSafetyNext}
            disabled={!safetyChecked}
            className="primary" style={{ width:"100%", padding:"0.625rem" }}
          >
            {safetyChecked ? "開始今日任務 →" : "請先勾選確認事項"}
          </button>
        </div>
      </div>
    </div>
  );

  if (screen === "chat") return group === "control"
    ? <ControlTask onDone={handleTaskDone} />
    : <ChatTask dayNum={dayNum} group={group} onDone={handleTaskDone} onStop={handleTaskStop} />;

  if (screen === "post") return <PostQuestionnaire group={group} onDone={handlePostDone} />;

  if (screen === "done") return <DoneScreen dayNum={dayNum} pid={pid} onLogout={() => { setInputPid(""); setPid(""); setScreen("login"); }} />;

  return null;
}

// ── Screen 3: Chat ────────────────────────────────────────────

function ChatTask({ dayNum, group, onDone, onStop }: {
  dayNum: number; group: Group;
  onDone: (d: object) => void;
  onStop: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: `你好，請你分享你今天遇到的問題與困擾，以及你的感受和想法是什麼，可以盡量描述細節等等。` }
  ]);
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const [elapsed, setElapsed]     = useState(0);
  const [started, setStarted]     = useState(false);
  const [composing, setComposing] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MIN = 600;

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
      const res = await fetch(apiRoute(group), {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ messages: next, group }),
      });
      if (!res.ok) throw new Error();
      const reader = res.body!.getReader();
      const dec = new TextDecoder(); let reply = "";
      setMessages(p => [...p, { role:"assistant", content:"" }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6); if (payload === "[DONE]") break;
          try { reply += JSON.parse(payload).text; setMessages(p => [...p.slice(0,-1), { role:"assistant", content:reply }]); } catch { }
        }
      }
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
        <textarea
          ref={textareaRef} value={input}
          onChange={e => setInput(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey && !composing) { e.preventDefault(); send(); } }}
          placeholder="輸入訊息⋯請勿輸入姓名、學號、電話、地址或 Email（Enter 送出）"
          rows={3} style={{ flex:1, resize:"none", fontSize:13 }}
        />
        <button onClick={send} disabled={streaming || !input.trim()} style={{ alignSelf:"flex-end", padding:"0.5rem 1rem" }}>送出</button>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:"0.5rem" }}>
        <button onClick={() => { if (confirm("確定要停止今日任務嗎？")) onStop(); }} style={{ flex:1, fontSize:13, padding:"0.5rem", color:"var(--text-danger)", borderColor:"var(--border-danger)" }}>停止今日任務</button>
      </div>

      <button onClick={() => onDone({ messages, elapsed })} disabled={!canFinish} className="primary" style={{ width:"100%", padding:"0.625rem" }}>
        {canFinish ? "完成對話，填寫問卷 →" : `請繼續對話（${fmtTime(remaining)} / 至少 2 則訊息）`}
      </button>
    </div>
  );
}

function ControlTask({ onDone }: { onDone: (d: object) => void }) {
  const [elapsed, setElapsed] = useState(0);
  const MIN = 600;

  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const canFinish = elapsed >= MIN;
  const remaining = Math.max(0, MIN - elapsed);

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:640, margin:"0 auto", padding:"1.5rem 1rem" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
        <p style={{ fontSize:18, fontWeight:500, margin:0 }}>休息時間</p>
        <div style={{ fontSize:13, padding:"4px 12px", borderRadius:"var(--radius)", background: elapsed >= MIN ? "var(--bg-success)" : "var(--bg-secondary)", color: elapsed >= MIN ? "var(--text-success)" : "var(--text-secondary)", border:`0.5px solid ${elapsed >= MIN ? "var(--border-success)" : "var(--border)"}` }}>
          {elapsed >= MIN ? "✓ 完成" : fmtTime(remaining)}
        </div>
      </div>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"1.5rem" }}>
        <div style={{ width:64, height:64, borderRadius:"50%", background:"var(--bg-secondary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>
          🕐
        </div>
        <p style={{ fontSize:15, color:"var(--text-secondary)", textAlign:"center", lineHeight:1.7, maxWidth:320 }}>
          請靜待 10 分鐘。<br/>你可以放鬆休息，不需要做任何事。
        </p>
        {!canFinish && (
          <p style={{ fontSize:13, color:"var(--text-tertiary)" }}>
            剩餘 {fmtTime(remaining)}
          </p>
        )}
      </div>
      <button
        onClick={() => onDone({ elapsed })}
        disabled={!canFinish}
        className="primary"
        style={{ width:"100%", padding:"0.625rem" }}
      >
        {canFinish ? "繼續 →" : `請等待（${fmtTime(remaining)}）`}
      </button>
    </div>
  );
}

// ── Screen 4: Post Questionnaire ──────────────────────────────

function PostQuestionnaire({ group, onDone }: { group: Group; onDone: (d: PostData) => void }) {
  const [emotion,       setEmotion]      = useState(50);
  const [mentalDemand,  setMentalDemand] = useState(50);
  const [effort,        setEffort]       = useState(50);
  const [control,       setControl]      = useState(50);
  const [attribution,   setAttribution]  = useState(50);

  const isAI = group !== "control";

  const sliders = [
    { label:"任務後情緒狀態", desc:"完成任務後，你目前的整體情緒感受如何？", val:emotion, set:setEmotion, lo:"非常負向", hi:"非常正向" },
    { label:"心智需求", desc:"這個任務需要多少心理與認知上的努力（如思考、整理、表達）？", val:mentalDemand, set:setMentalDemand, lo:"非常低", hi:"非常高" },
    { label:"努力程度", desc:"你在這個任務中需要付出多少努力才能完成？", val:effort, set:setEffort, lo:"非常低", hi:"非常高" },
    { label:"主觀掌控感", desc:"在這個過程中，你感覺自己對情緒狀態的掌控程度如何？", val:control, set:setControl, lo:"完全沒有掌控", hi:"完全掌控" },
  ];

  return (
    <div style={{ maxWidth:600, margin:"0 auto", padding:"1.5rem 1rem" }}>
      <p style={{ fontSize:18, fontWeight:500, marginBottom:"0.25rem" }}>任務後問卷</p>
      <p style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:"2rem" }}>請根據剛才的任務經驗作答，每題都請填寫。</p>

      {sliders.map(s => (
        <div key={s.label} style={{ background:"var(--bg)", border:"0.5px solid var(--border)", borderRadius:"var(--radius)", padding:"1.25rem", marginBottom:"1rem" }}>
          <p style={{ fontWeight:500, marginBottom:"0.25rem" }}>{s.label}</p>
          <p style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:"1.25rem" }}>{s.desc}</p>
          <input type="range" min="0" max="100" step="1" value={s.val} onChange={e => s.set(Number(e.target.value))} style={{ width:"100%" }} />
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-tertiary)", marginTop:6 }}>
            <span>{s.lo}</span>
            <span style={{ fontWeight:500, color:"var(--text)", fontSize:15 }}>{s.val}</span>
            <span>{s.hi}</span>
          </div>
        </div>
      ))}

      <div style={{ background:"var(--bg)", border:"0.5px solid var(--border)", borderRadius:"var(--radius)", padding:"1.25rem", marginBottom:"1.5rem" }}>
        <p style={{ fontWeight:500, marginBottom:"0.25rem" }}>情緒改善歸因</p>
        <p style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:"1.25rem" }}>
          針對你情緒狀態的改善（若有），你認為主要是因為什麼？
        </p>
        <input type="range" min="0" max="100" step="1" value={attribution} onChange={e => setAttribution(Number(e.target.value))} style={{ width:"100%", marginBottom:"1rem" }} />
        <div style={{ display:"flex", gap:10 }}>
          {[
            { label:"0", desc:"完全靠自己（自己想通、轉念或安撫自己）", hi:false },
            { label:"100", desc: isAI ? "完全靠 AI（AI 的回應直接幫助了我）" : "完全靠這段時間本身（休息本身幫助了我）", hi:true }
          ].map(({ label, desc, hi }) => (
            <div key={label} style={{ flex:1, background: hi ? (attribution > 60 ? "var(--bg-info)" : "var(--bg-secondary)") : (attribution < 40 ? "var(--bg-success)" : "var(--bg-secondary)"), border:`0.5px solid ${hi ? (attribution > 60 ? "var(--border-info)" : "var(--border)") : (attribution < 40 ? "var(--border-success)" : "var(--border)")}`, borderRadius:"var(--radius)", padding:"0.75rem", fontSize:12, color: hi ? (attribution > 60 ? "var(--text-info)" : "var(--text-secondary)") : (attribution < 40 ? "var(--text-success)" : "var(--text-secondary)"), transition:"all 0.2s" }}>
              <strong style={{ display:"block", marginBottom:4 }}>{label}</strong>{desc}
            </div>
          ))}
        </div>
        <p style={{ textAlign:"center", fontSize:20, fontWeight:500, margin:"1rem 0 0.25rem" }}>{attribution}</p>
      </div>

      <button
        onClick={() => onDone({ emotion, mental_demand: mentalDemand, effort, control, attribution })}
        className="primary" style={{ width:"100%", padding:"0.625rem" }}
      >
        完成並送出 ✓
      </button>
    </div>
  );
}

// ── Screen 5: Done ────────────────────────────────────────────

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