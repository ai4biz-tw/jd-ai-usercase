# PR 審查與自動合併

這份文件是 `main` 的合併規則。`.github/workflows/` 和 `scripts/policy-lib.mjs` 用同一套判斷，說明和機器做的事要一致。

## 不靠人核准

GitHub 不讓 PR 作者核准自己的 PR。Cursor 雲端 agent 開的 PR，作者是 Jon，所以如果規定要人核准，這些 PR 會全部卡住。這裡不要求核准。能進 `main` 的條件是檢查全綠、沒有衝突，而且沒有被下面的阻擋條件擋下。

## 合併進 main 必須成立

`pr-policy` 沒過就不能合。分支保護會把下列檢查設成必要：

1. PR **說明**（body，不是標題）引用這個 repo 已經存在的 issue 或舊 PR。寫法是 `Refs #2`，或完整網址。`#` 前面要是空白或括號。只寫自己這支 PR 的編號不算。`Fixes`、`Closes`、`Resolves` 會在合併時關掉那個 issue；不想關就寫 `Refs`。
2. 沒有秘密。檢查的形狀包含私鑰、GitHub 權杖、AWS 存取金鑰、Slack、Google API、OpenAI、npm 權杖，以及被追蹤的 `.env`（`.env.example` 除外）和 `id_rsa`、`.pem`。記錄只寫檔名和行號，不把秘密印出來。
3. 和 base 沒有合併衝突。
4. 超過 1MB 的文字檔不放行，因為掃不完。
5. CI 的 `actionlint`、`html`、`markdown`、`links`、`smoke` 都成功。

這些檢查跑在每個 PR 上，也跑在 push 到 `main` 的 CI。`pr-policy` 在 push 到 `main` 時只跑單元測試，因為那時候已經沒有 PR 可以查。

## 自動合併

目標分支是 `main`、上一節的必要條件都通過、必要檢查都成功、而且沒有下一節的阻擋條件時，`Auto-merge` workflow 會 squash merge，並刪掉同一個 repo 裡的 head 分支。不需要額外標籤來開啟。fork 的分支不刪。

按下合併的是**已經在 `main` 上**的 workflow，不執行 PR 裡的程式。兩個檔案都只 checkout `main` 上的 `scripts/auto-merge.mjs`，再用 GitHub API 讀 PR：

- `.github/workflows/auto-merge.yml`：`CI` 或 `PR policy` 成功結束之後（`workflow_run`）
- `.github/workflows/auto-merge-pr.yml`：開 PR、推新 commit、改說明、標成可審查、加上或拿掉標籤（`pull_request_target`）

這支 PR 自己還不會觸發它們，因為這兩個檔案還沒在 `main` 上。

squash 之後，workflow 會再 `workflow_dispatch` 一次 `main` 的 CI。用 `GITHUB_TOKEN` 呼叫合併 API 時，產生的 push 常常不會再觸發別的 workflow；補這一次，CI 成功才會進到部署。

## 不會自動合併

下面這些**不會**把 `pr-policy` 打紅。檢查全綠之後，Jon 仍可以手動 squash merge，不必用管理員身分硬合。

- 標籤 `do-not-merge` 或 `needs-human`
- PR 還是草稿
- 改到閘門定義：`.github/`（含 `.github/workflows/`）、`scripts/`、`.lychee.toml`、`.markdownlint-cli2.jsonc`、`.htmlvalidate.json`。改 workflow 必須由 Jon 合併。`scripts/` 和這些設定檔也算，避免 PR 先把檢查放鬆再把自己合進去
- 刪除 `main` 上已經存在的檔案。靜態站刪檔就是把頁面或文件下線，包含 PR 說明沒提到的刪除
- 變更行數（新增＋刪除，不含 `package-lock.json`、`npm-shrinkwrap.json`、`yarn.lock`、`pnpm-lock.yaml`）超過 800
- 變更檔案數超過 30
- 有變更檔案從 API 讀不到內容，沒辦法掃秘密

條件解除（例如拿掉標籤）後，`pull_request_target` 會再看一次。若檢查還在跑，就等下一次 `workflow_run`。

## 每個檢查在做什麼

| 檢查 | Workflow | 守什麼 |
| --- | --- | --- |
| `actionlint` | CI | workflow YAML。runner 上有 shellcheck 時一併看 `run` 裡的 shell |
| `html` | CI | HTML 結構（html-validate recommended；關掉和現有頁面衝突的 doctype 大小寫、void 結尾、行內 style）、`<style>` 能被 CSS parser 解析、內嵌 script 通過 `node --check` |
| `markdown` | CI | markdownlint 預設規則。中文文件不限 80 字（MD013 關） |
| `links` | CI | lychee 查 HTML 和 Markdown 連結，跟隨重新導向，失敗重試 3 次。`data:` 略過，429 不當成壞連結 |
| `smoke` | CI | headless Chromium 打開每個 HTML。不能有未捕捉例外或 console error（Google Fonts 載入失敗除外）。至少一個工具頁要跑完核心流程 |
| `pr-policy` | PR policy | issue 引用、秘密、合併衝突，以及上面的自動合併阻擋條件（只報告，不因此失敗） |
| `auto-merge` | Auto-merge、Auto-merge PR | 條件齊了就 squash merge。這項不設成必要檢查 |
| `deploy` | Deploy | 不是 PR 檢查。只在 `main` 的 CI 成功之後發布 |

`auto-merge` 在這支 PR 上不會出現：GitHub 用預設分支上的 workflow 來跑 `pull_request_target` 和 `workflow_run`，而這兩個檔案還沒進 `main`。`actionlint` 仍會檢查這兩個 YAML。

## 工具頁的 smoke 約定

每個 `*.html` 都會被打開（略過 `node_modules`）。現在的工具頁是 `index.html`。

- 頁面若有 `#jdText`、`#analyzeTextBtn`、`#output`，測試會打開全文輸入、貼上一段中文 JD、按「分析貼上的全文」，並確認 `#output` 出現、標題含「AI 導入藍圖」、至少一個 use case。
- 之後的工具頁（例如 JD2MD）可以改放 `data-smoke-input`、`data-smoke-run`、`data-smoke-output`。測試會填同一段 JD、點執行，並確認輸出看得到而且有文字。三個屬性都在時，優先用這組，不再用上面的 id。
- 沒有這些控制項的頁面只做載入和 console 檢查。
- 整個 repo 至少要有一個頁面跑到核心流程，否則 `smoke` 失敗。

## 部署

網站是 GitHub Pages，網址是 [https://ai4biz-tw.github.io/jd-ai-usercase/](https://ai4biz-tw.github.io/jd-ai-usercase/)。現在的來源是 legacy：`main` 分支的 `/`，每次 push 到 `main` 就發布，**不會**等 CI。

`Deploy` 使用官方 Pages actions，而且只在 CI 於 `main` 成功之後跑（push，或自動合併補上的 `workflow_dispatch`）。它**不會**自己把 Pages 來源改成 Actions：若切換後部署失敗，站會空一段。來源仍是 legacy 時，這個 workflow 會失敗並停下，站繼續走原本的分支發布。

Jon 合併這支 PR、確認 `main` 上的 CI 是綠的之後，再執行：

```bash
gh api -X PUT repos/ai4biz-tw/jd-ai-usercase/pages --input - <<'EOF'
{"build_type":"workflow"}
EOF
gh workflow run deploy.yml --ref main
```

切換之後，legacy 不再發布，只有 CI 成功才會更新網站。手動 `workflow_dispatch` Deploy 是復原用的，不會再查一次 CI。

## 分支保護

目前 `main` 沒有分支保護，也沒有 ruleset。需要 repo admin。規則是：必須用 PR、核准人數 0、必要檢查全綠、禁止刪除 `main`、禁止 force push、允許 squash / merge commit / rebase。自動合併這件事由 workflow 呼叫合併 API，另外把 repo 的 auto-merge 打開，Jon 也可以用畫面上的按鈕。

先看有沒有同名 ruleset：

```bash
gh api repos/ai4biz-tw/jd-ai-usercase/rulesets
```

沒有的話建立：

```bash
gh api -X POST repos/ai4biz-tw/jd-ai-usercase/rulesets --input - <<'EOF'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "actionlint" },
          { "context": "html" },
          { "context": "links" },
          { "context": "markdown" },
          { "context": "pr-policy" },
          { "context": "smoke" }
        ]
      }
    }
  ]
}
EOF
```

Repo 設定（允許 squash、打開 auto-merge、合併後刪分支）：

```bash
gh api -X PATCH repos/ai4biz-tw/jd-ai-usercase --input - <<'EOF'
{
  "allow_squash_merge": true,
  "allow_auto_merge": true,
  "delete_branch_on_merge": true
}
EOF
```

標籤（沒有人貼過就不影響；workflow 只認名字）：

```bash
gh label create do-not-merge --repo ai4biz-tw/jd-ai-usercase \
  --color b60205 --description "阻止自動合併，要人處理" --force
gh label create needs-human --repo ai4biz-tw/jd-ai-usercase \
  --color d93f0b --description "需要 Jon 看過才能合併" --force
```

組織若把 Actions 的 `GITHUB_TOKEN` 預設成唯讀，要允許 workflow 取得它在檔案裡宣告的 `contents: write` 和 `pull-requests: write`，否則自動合併會 403。這支 PR 的說明會寫這次有沒有套用成功。

## 雲端 agent 開 PR 時

- 說明寫 `Refs #議題編號`，不要用會關掉議題的關鍵字，除非這支 PR 真的做完那個議題
- 不要改 `.github/` 或 `scripts/`，除非這次任務就是在改閘門
- 不要刪既有檔案，除非要人看
- 不要把權杖、私鑰、`.env` 放進 commit 或 PR 說明
- 檢查綠了、也沒有阻擋條件，就會被 squash，不必找人核准
- 想暫停自動合併，加 `do-not-merge` 或 `needs-human`，或先維持草稿

## 限制

- 改 `.github/workflows/` 的 PR 可以換成自己的 workflow，並用 `GITHUB_TOKEN` 呼叫合併 API。正規的自動合併只看 `main` 上的腳本，而且看到閘門路徑就會拒絕；這擋得住一般的雲端 agent，擋不住刻意改 workflow 來自我合併。這種 PR 要 Jon 看檔案清單。
- 必要檢查的名字是 Actions job 的 `name`。惡意 PR 若改了 CI workflow，可以做出同名且直接成功的 job。因為這種 PR 改到 `.github/`，自動合併會拒絕，但仍要人看，不能只看綠燈。
- 在 Pages 來源改成 Actions 之前，push 到 `main` 仍會由 legacy 發布，CI 失敗也擋不住那一次發布。
- 外部連結有重試，對方網站若持續 5xx 或擋住自動化請求，`links` 還是會紅。
- `npm audit` 的 devDependency 公告沒有做成必要檢查，避免和這個靜態站無關的公告把合併卡住。
- 不要求核准，所以沒有第二個人看內容品質。大改動、刪檔、改閘門會停下來等人；小改動靠檢查。
