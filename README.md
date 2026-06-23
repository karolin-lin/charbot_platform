# 情緒卸載研究實驗平台

與AI聊天機器人對話的情緒卸載研究（7天縱貫研究）實驗平台。

## 功能

- 參與者編號登入，系統自動分配 AI 組 / 日記書寫組
- 每日任務流程：mPANAS（前）→ 任務 → mPANAS（後）→ NASA-TLX → SAM → 歸因滑桿
- AI 組：串流 AI 對話介面，10 分鐘計時器
- 日記組：書寫介面，10 分鐘計時器 + 最低 100 字
- 資料儲存於本機 localStorage
- 完成後可匯出 CSV 資料

---

## 部署到 Vercel

### 步驟一：設定環境變數

在 Vercel 專案的 Settings → Environment Variables 新增：

| 變數名稱 | 說明 |
|---------|------|
| `ANTHROPIC_API_KEY` | 你的 Anthropic API Key（必填） |

### 步驟二：推送到 GitHub

```bash
git init
git add .
git commit -m "init experiment platform"
git remote add origin https://github.com/karolin-lin/chat-experiment-next.git
git push -u origin main
```

### 步驟三：在 Vercel 匯入

1. 前往 [vercel.com](https://vercel.com)
2. 點 "Add New Project" → 選擇 GitHub repo
3. 設定好 `ANTHROPIC_API_KEY` 環境變數
4. 點 Deploy

---

## 本地開發

```bash
# 1. 安裝套件
npm install

# 2. 設定環境變數
cp .env.example .env.local
# 編輯 .env.local，填入你的 ANTHROPIC_API_KEY

# 3. 啟動開發伺服器
npm run dev

# 4. 開啟瀏覽器
open http://localhost:3000
```

---

## 資料說明

### 儲存方式
每位參與者的資料以 `exp_{pid}` 為 key 儲存在 **localStorage**，資料只存在於使用者的裝置上。

### 研究人員取得資料
請提醒參與者在每次完成任務後，使用完成頁面的「**匯出我的資料 (CSV)**」按鈕下載 CSV 檔案，再寄給研究人員。

或者在研究結束後，統一請參與者到研究室，研究人員直接在參與者裝置上操作匯出。

### CSV 欄位說明

| 欄位 | 說明 |
|------|------|
| pid | 參與者編號 |
| group | ai 或 diary |
| date | 日期（YYYY-MM-DD） |
| dayNum | 第幾天（1-7） |
| pre_pos | 任務前正向情緒平均（mPANAS） |
| pre_neg | 任務前負向情緒平均（mPANAS） |
| post_pos | 任務後正向情緒平均（mPANAS） |
| post_neg | 任務後負向情緒平均（mPANAS） |
| affect_delta | 正向情緒改善幅度（post_pos - pre_pos） |
| nasa_demand | NASA-TLX 心智需求（0-100） |
| nasa_effort | NASA-TLX 努力程度（0-100） |
| sam_threat | SAM 威脅評價（1-7） |
| sam_challenge | SAM 挑戰評價（1-7） |
| sam_controllable | SAM 可控性評價（1-7） |
| attribution | 歸因滑桿分數（0=完全靠自己，100=完全靠外部） |
| task_elapsed | 任務時間（秒） |
| task_words | 字數（日記組）或訊息則數（AI組） |
| completedAt | 完成時間（ISO timestamp） |

---

## 技術架構

- **框架**：Next.js 14（App Router）
- **AI**：Anthropic Claude API（claude-sonnet-4-6），透過 Next.js API Route 代理，API Key 只在伺服器端
- **資料儲存**：localStorage（客戶端）
- **部署**：Vercel
