import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: SCOPES,
  });
}

export async function POST(req: NextRequest) {
  console.log("SHEET_ID:", process.env.GOOGLE_SHEET_ID);  // 加這行
  console.log("EMAIL:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);  // 加這行
  try {
    const { pid, group, dayNum, date, elapsed, messages, text, word_count } = await req.json();

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const sheetId = process.env.GOOGLE_SHEET_ID!;

    // ── Sheet 1: 每日摘要 ──
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "每日摘要!A:H",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          pid,
          group,
          date,
          dayNum,
          elapsed ?? "",
          messages ? messages.filter((m: { role: string }) => m.role === "user").length : "",
          word_count ?? "",
          new Date().toISOString(),
        ]],
      },
    });

    // ── Sheet 2: 對話紀錄（AI 組）──
    if (messages && messages.length > 0) {
      const msgRows = messages.map((m: { role: string; content: string }, idx: number) => [
        pid,
        group,
        date,
        dayNum,
        idx + 1,
        m.role === "user" ? "受試者" : "AI",
        m.content,
      ]);
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: "對話紀錄!A:G",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: msgRows },
      });
    }

    // ── Sheet 3: 日記內容（日記組）──
    if (text) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: "日記內容!A:E",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[pid, group, date, dayNum, text]],
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Sheets error detail:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
    return NextResponse.json({ error: "儲存失敗", detail: JSON.stringify(err, Object.getOwnPropertyNames(err)) }, { status: 500 });
  }
}