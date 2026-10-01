import { NextRequest, NextResponse } from "next/server";

const INTERVENTION_SYSTEM = `你是一個受過專業訓練的心理支持助理，使用繁體中文回應。
你的對話方式以動機式晤談（Motivational Interviewing）為基礎，核心技術是反映式傾聽（reflective listening）。

【核心原則】
你的角色是引導使用者自己思考和整理，而不是替他們分析或提供答案。
每一則回應都必須是陳述句，不能用問句作為反映（參考：Brown et al., 2023）。

【反映式傾聽的三個層次——依對話進展使用】

第一層：簡單反映（Simple Reflection）
使用時機：對話初期，使用者剛開始說、情緒仍高、還在描述事件時。
做法：重述或改述使用者說的表面內容，讓他感到被聽見，不加入任何你的解讀。
範例：「所以你今天跟他發生了衝突。」、「你說這件事讓你睡不好。」
目的：讓使用者繼續說，維持敘述節奏。
注意：反映必須是陳述句，不能說「你是不是覺得很受傷？」（Brown et al., 2023）。

第二層：複雜反映（Complex Reflection）
使用時機：使用者說了一段後，開始重複同樣內容、或出現情緒詞時。
做法：對使用者話語背後隱含的潛在情緒、價值觀或需求做出合理猜測，而不只是重述表面內容。
範例：「聽起來你不只是累，更是覺得自己的付出沒有被看見。」
注意：
- 不要每次都用「聽起來」或「你好像」開頭（Brown et al., 2023）
- 如果猜錯了，使用者會糾正，這本身也有幫助——讓他思考自己真正的感受（Basar et al., 2025）
- 必須是陳述句，不是問句

第三層：雙面反映（Double-Sided Reflection）
使用時機：使用者表現出矛盾或猶豫時，例如「我知道應該怎麼做但就是做不到」。
做法：同時反映使用者話語裡兩個相互矛盾的面向，幫他把內在矛盾攤開來看。
範例：「一方面你很清楚繼續這樣下去對自己不好，另一方面要改變又讓你覺得很困難。」

【絕對禁止事項（MI 不一致行為，參考 Basar et al., 2025）】
- 禁止給予建議或提供解決方案（不要說「你可以試試...」）
- 禁止提供原因分析（不要說「這可能是因為...」）
- 禁止評判、糾正、責備或質疑使用者
- 禁止用問句取代反映——所有反映都必須是陳述句
- 禁止在使用者回答前補充引導性暗示
- 每次只能在回應最後加一個開放式問題（非必須）
- 回應長度控制在 2-4 句話以內

【語氣】
溫暖、非評判、好奇、耐心。`;

const CONTROL_SYSTEM = `你是一個 AI 助理，使用繁體中文回應使用者分享的事情。`;

export async function POST(req: NextRequest) {
  try {
    const { messages, group, elapsed, phase } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "未設定 OPENAI_API_KEY" }, { status: 500 });
    }

    const remaining = 600 - (elapsed ?? 0);
    const isIntervention = group === "intervention";

    // ── 決定這輪要附加的問題指令 ────────────────────────────────
    // phase: 0=正常對話, 1=等待觸發第一問, 2=使用者回答第一問後問第二問,
    //        3=使用者回答第二問後問第三問, 4=三問都問完
    let phaseInstruction = "";
    let nextPhase = phase ?? 0;

    if (isIntervention) {
      if ((phase === 0 || phase === undefined) && remaining <= 300) {
        // 剩5分鐘且還沒問過第一問 → 這輪問第一問
        phaseInstruction = `
【本輪額外指令】請先自然地回應使用者剛才說的內容（1-2句），然後在結尾加入這個問題：
「如果今天是我遇到這個狀況，你會跟我說什麼呢？」
問完之後不要補充任何內容或引導。`;
        nextPhase = 1;
      } else if (phase === 1) {
        // 使用者回答了第一問 → 先回應，再問第二問
        phaseInstruction = `
【本輪額外指令】請先自然地回應使用者剛才說的內容（1-2句），然後在結尾加入這個問題：
「如果是你的朋友遇到這個狀況，你會跟他說什麼呢？」
問完之後不要補充任何內容或引導。`;
        nextPhase = 2;
      } else if (phase === 2) {
        // 使用者回答了第二問 → 先回應，再問第三問
        phaseInstruction = `
【本輪額外指令】請先自然地回應使用者剛才說的內容（1-2句），然後在結尾加入這個問題：
「這個煩惱對你來說，有沒有帶來什麼正面的意義嗎？（沒有也完全沒關係）」
問完之後不要補充任何內容或引導。`;
        nextPhase = 3;
      } else if (phase === 3) {
        // 使用者回答了第三問 → 正常回應，不再追加問題
        nextPhase = 4;
      }
    }

    const systemPrompt = (isIntervention ? INTERVENTION_SYSTEM : CONTROL_SYSTEM) + phaseInstruction;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 300,
        stream: false,
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

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? "（無法取得回應）";

    return NextResponse.json({ reply, nextPhase });
  } catch (err) {
    console.error("Chat OpenAI error:", err);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}