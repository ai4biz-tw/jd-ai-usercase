import { appendFileSync } from 'node:fs';
import {
  fetchPull,
  gh,
  listCheckRuns,
  listPullFiles,
  lookupIssues,
} from './github.mjs';
import {
  blockers,
  classifyFiles,
  hardFailures,
  isBinaryPath,
  isSecretFilename,
  issueNumbers,
  requiredCheckState,
  scanText,
  scanTree,
} from './policy-lib.mjs';

const MARKER = '<!-- automerge-status -->';
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const mode = process.env.MODE === 'merge' ? 'merge' : 'report';

function out(markdown) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

function encodedPath(file) {
  return file.split('/').map(encodeURIComponent).join('/');
}

async function scanChangedFiles(files, ref) {
  const hits = [];
  const unscanned = [];
  const oversized = [];
  for (const file of files) {
    if (file.status === 'removed') continue;
    if (isSecretFilename(file.filename)) {
      hits.push({ file: file.filename, line: 1, name: '敏感檔名' });
    }
    if (isBinaryPath(file.filename)) continue;
    const res = await gh(
      token,
      `/repos/${repo}/contents/${encodedPath(file.filename)}?ref=${encodeURIComponent(ref)}`,
    );
    if (res.status !== 200 || !res.data || Array.isArray(res.data) || typeof res.data.content !== 'string') {
      unscanned.push(file.filename);
      continue;
    }
    if ((res.data.size || 0) > 1_000_000) {
      oversized.push(file.filename);
      continue;
    }
    const text = Buffer.from(res.data.content, 'base64').toString('utf8');
    if (text.includes('\0')) continue;
    hits.push(...scanText(file.filename, text).filter((hit) => hit.name !== '敏感檔名'));
  }
  return { hits, unscanned, oversized };
}

async function resolveNumbers() {
  const numbers = new Set();
  if (process.env.PR_NUMBER) numbers.add(Number(process.env.PR_NUMBER));
  for (const part of (process.env.PR_NUMBERS || '').split(',')) {
    if (part.trim()) numbers.add(Number(part.trim()));
  }
  const ready = [...numbers].filter((number) => Number.isInteger(number) && number > 0);
  if (ready.length > 0) return ready;
  if (!process.env.HEAD_SHA) return [];
  const res = await gh(token, `/repos/${repo}/commits/${process.env.HEAD_SHA}/pulls`);
  if (res.status !== 200 || !Array.isArray(res.data)) return [];
  return res.data.filter((pull) => pull.state === 'open').map((pull) => pull.number);
}

async function commentList(number) {
  const listed = await gh(token, `/repos/${repo}/issues/${number}/comments?per_page=100`);
  return Array.isArray(listed.data) ? listed.data : [];
}

async function upsertComment(number, reasons) {
  const body = [
    MARKER,
    '這支 PR **不會自動合併**。必要檢查全綠之後，仍要 Jon 手動 squash merge。',
    '',
    ...reasons.map((reason) => `- ${reason}`),
  ].join('\n');
  const found = (await commentList(number)).find((comment) => comment.body?.includes(MARKER));
  if (!found) {
    const created = await gh(token, `/repos/${repo}/issues/${number}/comments`, {
      method: 'POST',
      body: { body },
    });
    if (created.status !== 201) {
      console.log(`::warning::無法留下自動合併說明（HTTP ${created.status}）`);
    }
    return;
  }
  if (found.body === body) return;
  const updated = await gh(token, `/repos/${repo}/issues/comments/${found.id}`, {
    method: 'PATCH',
    body: { body },
  });
  if (updated.status !== 200) {
    console.log(`::warning::無法更新自動合併說明（HTTP ${updated.status}）`);
  }
}

async function clearComment(number) {
  const found = (await commentList(number)).find((comment) => comment.body?.includes(MARKER));
  if (!found) return;
  const body = `${MARKER}\n先前擋住自動合併的條件已經解除。必要檢查全綠後會 squash merge。`;
  if (found.body === body) return;
  await gh(token, `/repos/${repo}/issues/comments/${found.id}`, {
    method: 'PATCH',
    body: { body },
  });
}

async function deleteBranch(pull) {
  if (!pull.head.repo || pull.head.repo.full_name !== repo) {
    out('head 在別的 repo，不刪那個分支。');
    return;
  }
  if (pull.head.ref === pull.base.ref) return;
  const ref = encodedPath(pull.head.ref);
  const res = await gh(token, `/repos/${repo}/git/refs/heads/${ref}`, { method: 'DELETE' });
  if (res.status === 204 || res.status === 404) {
    out(`已刪除分支 \`${pull.head.ref}\`。`);
    return;
  }
  console.log(`::warning::合併成功，但刪除分支失敗（HTTP ${res.status}）`);
}

async function dispatchCi(defaultBranch) {
  const res = await gh(token, `/repos/${repo}/actions/workflows/ci.yml/dispatches`, {
    method: 'POST',
    body: { ref: defaultBranch },
  });
  if (res.status !== 204) {
    console.log(`::warning::已合併，但觸發 main 的 CI 失敗（HTTP ${res.status}）。若 GITHUB_TOKEN 的 push 不會再觸發 workflow，Deploy 就不會接著跑。`);
    return;
  }
  out(`已觸發 \`${defaultBranch}\` 的 CI。CI 成功後才部署。`);
}

async function squashMerge(pull, defaultBranch) {
  const res = await gh(token, `/repos/${repo}/pulls/${pull.number}/merge`, {
    method: 'PUT',
    body: {
      merge_method: 'squash',
      sha: pull.head.sha,
      commit_title: pull.title,
      commit_message: pull.body || '',
    },
  });
  if (res.status === 200 && res.data?.merged) {
    out(`已 squash merge #${pull.number}（${res.data.sha}）。`);
    await deleteBranch(pull);
    await dispatchCi(defaultBranch);
    return;
  }
  if (res.status === 409) {
    out(`#${pull.number} 的 head 在檢查之後又動了，這次不合併。`);
    return;
  }
  const again = await gh(token, `/repos/${repo}/pulls/${pull.number}`);
  if (again.status === 200 && (again.data.merged || again.data.state !== 'open')) {
    out(`#${pull.number} 已經合併。`);
    return;
  }
  const message = res.data?.message || JSON.stringify(res.data);
  console.error(`合併 #${pull.number} 失敗（HTTP ${res.status}）：${message}`);
  process.exitCode = 1;
}

async function evaluate(number) {
  const pull = await fetchPull(token, repo, number);
  const defaultBranch = process.env.DEFAULT_BRANCH || pull.base.repo?.default_branch || 'main';
  if (pull.state !== 'open') {
    out(`#${number} 不是開放中的 PR，不合併。`);
    return;
  }
  if (pull.base.ref !== defaultBranch) {
    out(`#${number} 的目標是 \`${pull.base.ref}\`，不是 \`${defaultBranch}\`，不自動合併。`);
    return;
  }

  const files = await listPullFiles(token, repo, number);
  const classified = classifyFiles(files);
  let secretHits;
  let unscanned = [];
  let oversized = [];
  if (mode === 'merge') {
    const scanned = await scanChangedFiles(files, pull.head.sha);
    secretHits = scanned.hits;
    unscanned = scanned.unscanned;
    oversized = scanned.oversized;
  } else {
    const scanned = scanTree(process.cwd());
    secretHits = scanned.hits;
    oversized = scanned.oversized;
  }
  secretHits = [
    ...secretHits,
    ...scanText('PR 標題', pull.title || ''),
    ...scanText('PR 說明', pull.body || ''),
  ];
  const issues = await lookupIssues(token, repo, issueNumbers(pull.body || '', repo, pull.number));
  const failures = hardFailures({
    body: pull.body,
    existingNumbers: issues.existing,
    missingNumbers: issues.missing,
    mergeable: pull.mergeable,
    secretHits,
    oversized,
  });
  const reasons = blockers({
    draft: pull.draft,
    labels: (pull.labels || []).map((label) => label.name),
    classified,
    unscanned,
  });

  out(`## #${number}（${mode}）`);
  out('');
  out(failures.length ? `必要條件沒過：${failures.join(' ')}` : '必要條件通過。');
  out(reasons.length ? `不自動合併：${reasons.join(' ')}` : '沒有自動合併的阻擋條件。');

  if (mode !== 'merge') return;

  if (reasons.length > 0) await upsertComment(number, reasons);
  else await clearComment(number);
  if (failures.length > 0 || reasons.length > 0) return;

  const state = requiredCheckState(await listCheckRuns(token, repo, pull.head.sha));
  if (!state.ready) {
    out(`檢查還沒齊。等待：${state.pending.join('、') || '無'}。失敗：${state.failed.join('、') || '無'}。`);
    return;
  }
  await squashMerge(pull, defaultBranch);
}

if (!token || !repo) {
  console.error('缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY');
  process.exit(1);
}

const numbers = await resolveNumbers();
if (numbers.length === 0) {
  out('沒有對應的開放 PR（多半是 main 上的 CI），不合併。');
} else {
  for (const number of numbers) await evaluate(number);
}
if (process.exitCode) process.exit(process.exitCode);
