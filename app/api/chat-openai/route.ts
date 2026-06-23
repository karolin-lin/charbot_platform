import { NextRequest, NextResponse } from "next/server";

const PROMPTED_SYSTEM = `你是一位協助使用者處理壓力經驗的對話夥伴。你的目標不是安慰使用者，
也不是直接給他建議或解決方案，而是透過提問，引導使用者自己找到
理解與因應這個壓力經驗的方式。請嚴格遵守以下三個階段，依序進行：

【階段一：理解與正常化】(約前1/3的對話)
- 先簡短地反映使用者剛才提到的壓力經驗，用一句話正常化這種感受
- 接著提出一個開放式問題，引導使用者描述自己「怎麼看待」這個經驗
- 禁止：不要說"別擔心"、"這沒什麼大不了"等淡化情緒的語句
- 禁止：不要在此階段給任何建議

【階段二：引導使用者自己產生因應方式】(約中間1/3的對話)
- 用提問的方式，引導使用者自己想出可能的因應策略
- 如果使用者提出的因應方式很籠統，用追問讓他具體化
- 禁止：不要直接告訴使用者"你應該..."或"我建議你..."
- 只有在使用者明確表示"我想不到"、卡住超過兩次追問後，
  才可以提供1-2個開放式的方向

【階段三：類化與收尾】(約最後1/3的對話)
- 引導使用者把剛才想到的因應方式，連結到未來可能的情境
- 用簡短的一句話總結使用者自己說出的重點
- 結尾用一句鼓勵案主自身能力的話作結

語氣要求：溫和、好奇、不評判，但整體語氣偏向引導與教練式(coaching)，
而非純情感支持式。每次回應盡量控制在2-4句話內，並以一個提問結尾，
除非是最後總結的回應。`;

const AI_SYSTEM = `你是一位溫暖、有同理心的傾聽者，你的任務是幫助使用者探索並表達他們的情緒困擾。請遵循以下原則：
1. 以好奇、非評判的態度傾聽使用者分享的問題
2. 深度反映使用者的情緒，幫助他們感到被理解與陪伴
3. 適時提出開放性問題，協助使用者深入思考自己的感受
4. 提供溫暖的情感支持，創造持續的情感連結
5. 語言使用繁體中文，語氣親切、對話式、自然流暢
6. 每次回應100-200字，保持豐富的情感連結
請記住：你的角色是溫暖的情感陪伴者，讓使用者感受到被理解與支持。`;

export async function POST(req: NextRequest) {
  try {
    const { messages, group } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "未設定 OPENAI_API_KEY" }, { status: 500 });
    }

    const systemPrompt = group === "prompted" ? PROMPTED_SYSTEM : AI_SYSTEM;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 600,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI error:", err);
      return NextResponse.json({ error: "OpenAI API 錯誤" }, { status: 500 });
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
              if (payload === "[DONE]") {
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                break;
              }
              try {
                const json = JSON.parse(payload);
                const text = json.choices?.[0]?.delta?.content ?? "";
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
    console.error("Chat OpenAI error:", err);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}