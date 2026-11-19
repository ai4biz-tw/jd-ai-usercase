# JD AI User Case 與 JD2MD

兩個靜態頁，都不用後端，開檔或放到 GitHub Pages 就能用。

## JD2MD 簡單版

開 `jd2md.html`。貼上職缺全文，或試著讀一個連結；若網站擋住跨站讀取，改貼全文。頁面會把相關職責收成 1–6 份工作模組 Markdown，對不上的留在「仍然需要你本人」。可逐份複製、整包複製，或下載 `.md`、`.zip`。

這是簡單版：在瀏覽器裡用職責句型歸併，不呼叫模型，也不發官號。產品決定見 `docs/jd2md-proposal.md`。

## JD AI User Case 規劃工具

貼上 JD 連結或全文，自動產出 AI 導入 user case 分析。這不是 JD2MD。

## 用法

直接開啟 `index.html`（或部署到 GitHub Pages），在頁面上方貼上 JD 連結，
頁面會自動嘗試抓取並解析職缺內容，成功後在下方產生完整分析：

- 3–5 個具體 use case（痛點、Before/After、Workflow/Agent 選擇）
- 引用的 Anthropic 官方 Claude 認證框架
- 人工把關設計、評估指標、優缺點、導入步驟
- 影響 × 可行性優先序矩陣、四週至季度導入路線圖

若目標網站阻擋跨站抓取，頁面會說明原因並自動展開「貼 JD 全文」備援輸入。

## 分析框架來源

分析邏輯依據 Anthropic 四張官方 Claude 認證課程中的 46 個框架
（Claude Certified Associate / Developer / Architect Foundations、
Architect Professional），整理自官方考試指南與公開課程內容。
