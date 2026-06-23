import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `你是一位提供資訊支持的助理。當使用者分享他們的問題時，請遵循以下原則：
1. 提供清晰、有條理的回應
2. 幫助使用者梳理問題的各個面向
3. 提供實用的觀點或資訊
4. 語言使用繁體中文，語氣清楚、條理分明
5. 每次回應80-120字，保持簡潔明確
請記住：你的角色是提供有用的資訊與觀點，幫助使用者理解自己的處境。`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json({ error: "未設定 GOOGLE_API_KEY" }, { status: 500 });
    }

    const geminiMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:streamGenerateContent?alt=sse&key=${process.env.GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: geminiMessages,
          generationConfig: { maxOutputTokens: 400 },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini error:", err);
      return NextResponse.json({ error: "Gemini API 錯誤" }, { status: 500 });
    }

    const readable = new ReadableStream({
      async start(controller) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              const payload = line.slice(6).trim();
              try {
                const json = JSON.parse(payload);
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
                if (text) {
                  controller.enqueue(
                    new TextEncoder().encode(
                      `data: ${JSON.stringify({ text })}\n\n`
                    )
                  );
                }
              } catch { /* ignore */ }
            }
          }
        }
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat Gemini error:", err);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
