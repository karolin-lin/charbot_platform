export type Group = "gpt4o" | "gemini" | "diary";

export interface DaySession {
  date: string;
  dayNum: number;
  group: Group;
  pre_panas: Record<string, number>;
  post_panas: Record<string, number>;
  task: {
    messages?: Array<{ role: string; content: string }>;
    elapsed?: number;
    text?: string;
    word_count?: number;
    connection_check?: number;
  };
  nasa: { demand: number; effort: number };
  sam: Record<string, number>;
  attribution: { value: number };
  completedAt: string;
}

export interface ParticipantData {
  pid: string;
  group: Group;
  createdAt: string;
  sessions: DaySession[];
}

export function loadParticipant(pid: string): ParticipantData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`exp_${pid}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveParticipant(data: ParticipantData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`exp_${data.pid}`, JSON.stringify(data));
  } catch (e) { console.error("Storage error:", e); }
}

export function hashGroup(pid: string): Group {
  let h = 0;
  for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) & 0xffffffff;
  const groups: Group[] = ["gpt4o", "gemini", "diary"];
  return groups[Math.abs(h) % 3];
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function groupLabel(g: Group): string {
  return g === "gpt4o" ? "GPT-4o 組" : g === "gemini" ? "Gemini 組" : "日記書寫組";
}

export function apiRoute(g: Group): string {
  return g === "gpt4o" ? "/api/chat-openai" : "/api/chat-gemini";
}

export function exportCSV(data: ParticipantData): string {
  const headers = [
    "pid","group","date","dayNum",
    "pre_pos","pre_neg","post_pos","post_neg","affect_delta",
    "nasa_demand","nasa_effort",
    "sam_threat","sam_challenge","sam_controllable",
    "attribution","connection_check",
    "task_elapsed","task_words","completedAt"
  ];
  const posItems = ["interested","excited","strong","enthusiastic","proud","alert","inspired","determined","attentive","active"];
  const negItems = ["distressed","upset","guilty","scared","hostile","irritable","ashamed","nervous","jittery","afraid"];
  const avg = (items: string[], panas: Record<string, number>) =>
    (items.reduce((acc, k) => acc + (panas[k] || 0), 0) / items.length).toFixed(2);

  const rows = data.sessions.map(s => {
    const prePosAvg = avg(posItems, s.pre_panas);
    const preNegAvg = avg(negItems, s.pre_panas);
    const postPosAvg = avg(posItems, s.post_panas);
    const postNegAvg = avg(negItems, s.post_panas);
    const delta = (parseFloat(postPosAvg) - parseFloat(prePosAvg)).toFixed(2);
    return [
      data.pid, data.group, s.date, s.dayNum,
      prePosAvg, preNegAvg, postPosAvg, postNegAvg, delta,
      s.nasa?.demand, s.nasa?.effort,
      s.sam?.threat, s.sam?.challenge, s.sam?.controllable,
      s.attribution?.value,
      s.task?.connection_check ?? "",
      s.task?.elapsed,
      s.task?.word_count ?? s.task?.messages?.filter(m => m.role === "user").length ?? "",
      s.completedAt
    ].join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}
