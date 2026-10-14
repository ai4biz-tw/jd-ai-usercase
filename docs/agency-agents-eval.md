# agency-agents 導入評估

> 對應 ai4biz-tw/jd-ai-usercase#4。2026-10-14 Opus-5.5 撰寫。
> 資料來源：GitHub API 與 repo 本體（https://github.com/msitarzewski/agency-agents ，2026-10-14 clone 的 main），數字皆為當天實測。

## 結論（先講）

| 問題 | 結論 |
|---|---|
| ai4biz.tw 團隊要不要整包導入當日常 agent 庫？ | **不導入。** |
| JD2MD 能不能拿它當模組分類骨架？ | **不能直接用，只借格式。** |
| 有沒有值得拿的東西？ | 有兩樣：①每個 agent 的固定章節格式，可當 JD2MD 輸出 MD 的範本參考；②個別幾支（例如 sales、finance）可以單挑來讀，當寫 prompt 的參考。 |

## 1. 它到底是什麼（實測）

- 星數 159,951、fork 25,870、MIT 授權；2025-10-13 建立，2026-10-13 仍在更新
- **282 支** agent（有 frontmatter 的 .md），分在 19 個部門：engineering 65、specialized 59、marketing 37、game-development 21、gis 13、security 12、design 10、sales 9、testing 9…；finance 只有 5 支、healthcare 3 支
- 每支是一份 **人設 prompt**：名字（例如 Controller 叫 Dana、13 年經驗）、信念、硬規則、交付物清單、工作流程、成功指標。中位數約 1,900 英文字（約 2,500 token），最長約 4,700 字
- 本身**不含工具、不含程式**。`scripts/convert.sh` 把同一份 .md 轉成 Claude Code、Cursor、Codex、Gemini CLI、OpenClaw 等 18 種工具的格式；另有桌面 App 一鍵安裝

一句話：它是一個**寫得很完整的角色 prompt 圖書館**，不是一套會自己做事的系統。

## 2. 為什麼不整包導入

1. **我們的瓶頸不是缺角色。** ai4biz 的工作卡在「發佈前的審核閘」（ai4biz-tw/ig-cards#5、ai4biz-tw/muse-ai-taiwan#2 這類規範）、帳號與憑證、台灣在地內容。agency-agents 每支 agent 都是通用美國企業視角，沒有一支懂這些。
2. **人設 prompt 會跟我們的規範打架。** 我們的 skill 是「硬規則＋可驗收」寫法（例如 threads-post-judge 有 rubric 和 eval 數字）。agency-agents 的 agent 有強烈個性與自己的一套規則（"GAAP compliance is the baseline"），疊上去容易互相覆蓋，出錯時也很難追是哪一層造成。
3. **成本。** 一支 2,500 token 的人設，每次呼叫都要帶；同時掛幾十支在 Claude Code 裡，光讀 agent 清單就吃 context。我們日常用不到 282 支裡的大多數。
4. **維護。** repo 每天在動（10/13 還有 push），裝進去等於跟著別人的節奏更新；不更新就是一份會過期的副本。

## 3. JD2MD 適配度

JD2MD 的方向（ai4biz-tw/jd-ai-usercase#3）是「一份 JD → 多個可被 AI 接手的工作模組 MD」。逐點比對：

| JD2MD 需要的 | agency-agents 有沒有 | 評語 |
|---|---|---|
| 把 JD 切成工作模組 | 沒有 | 它的單位是「職能人設」（一個人），不是「工作模組」（一件事）。一份財務分析師 JD 會拆成好幾個模組，而 agency-agents 只會給你一個 Financial Analyst 人設 |
| 模組分類骨架 | 部分 | 19 個部門偏科技公司（game-development 21 支、gis 13 支），一般台灣職缺最多的行政、業務、餐飲、製造、醫護幾乎沒有。拿來當分類會系統性漏掉主流職業 |
| 每個模組的交接文件格式 | **有，值得借** | 「身分 → 任務 → 硬規則 → 交付物 → 流程 → 成功指標」這套章節，和 JD2MD 每份 MD 要的「做什麼 → 輸入 → 步驟 → 交付物與驗收 → 風險」高度重疊。已寫進 `docs/jd2md-proposal.md` 第 4 節 |
| 模組執行層（把 MD 交給 agent 跑） | 理論上可以 | 讀者拿到 JD2MD 的 MD 後，若想找「現成的專家 agent 幫忙做」，可以在結果頁附一個「相關 agency-agents 角色」連結。這是錦上添花，不是核心 |

**適配度：低到中。** 能借格式、能當延伸閱讀，不能當骨架。

## 4. 和我們自建 skill 的差異

| | agency-agents | 我們的 skill（threads-post-judge、jd-usercase-planner 等） |
|---|---|---|
| 寫法 | 人設＋原則 | 任務規格＋硬規則＋驗收 |
| 有沒有驗證 | 沒有 eval 數字 | threads-post-judge 有 69 篇盲評、召回率／誤報率 |
| 在地化 | 無 | 台灣平台、繁中、我們的發佈閘 |
| 適合 | 冷啟動一個陌生領域時，當第一版 prompt 的草稿 | 長期、重複、要對結果負責的工作 |

增量價值只在「冷啟動」：要進一個新領域（例如之後做醫療業客戶）時，先讀對應那支 agent 當草稿，再改寫成我們格式的 skill。

## 5. 建議動作

- [ ] 不安裝整包到任何人的 Claude Code／Codex
- [ ] JD2MD 的 MD 格式參考它的章節（已併入 `docs/jd2md-proposal.md`）
- [ ] （可選）JD2MD 結果頁加「延伸：相關的開源專家 agent」連結，連到對應的 agency-agents 檔案；MIT 授權可引用，需標出處

## 6. 授權備註

MIT：可商用、可改、可再散布，需保留版權與授權聲明。若 JD2MD 直接摘錄它的文字進產品，要在頁面或 MD 內標出處與 MIT 聲明；只借「章節格式」這種想法層面的東西不受著作權限制。
