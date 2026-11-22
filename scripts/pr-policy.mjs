import { appendFileSync } from 'node:fs';
import { fetchPull, listPullFiles, lookupIssues } from './github.mjs';
import {
  blockers,
  classifyFiles,
  hardFailures,
  isSameRepoHead,
  issueNumbers,
  scanText,
  scanTree,
} from './policy-lib.mjs';

function out(markdown) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const prNumber = process.env.PR_NUMBER;

if (!token || !repo || !prNumber) {
  console.error('缺少 GITHUB_TOKEN、GITHUB_REPOSITORY 或 PR_NUMBER');
  process.exit(1);
}

const pull = await fetchPull(token, repo, prNumber);
const files = await listPullFiles(token, repo, prNumber);
const scanned = scanTree(process.cwd());
const secretHits = [
  ...scanned.hits,
  ...scanText('PR 標題', pull.title || ''),
  ...scanText('PR 說明', pull.body || ''),
];
const numbers = issueNumbers(pull.body || '', repo, pull.number);
const issues = await lookupIssues(token, repo, numbers);
const failures = hardFailures({
  body: pull.body,
  existingNumbers: issues.existing,
  missingNumbers: issues.missing,
  mergeable: pull.mergeable,
  secretHits,
  oversized: scanned.oversized,
});
const reasons = blockers({
  draft: pull.draft,
  labels: (pull.labels || []).map((label) => label.name),
  classified: classifyFiles(files),
  unscanned: [],
  sameRepo: isSameRepoHead(pull, repo),
});

out('## pr-policy');
out('');
if (failures.length === 0) {
  out('必要條件通過。');
} else {
  out('必要條件沒過：');
  out('');
  for (const failure of failures) {
    out(`- ${failure}`);
    console.log(`::error::${failure}`);
  }
}
out('');
if (reasons.length === 0) {
  out('沒有自動合併的阻擋條件。檢查全綠後可以由 main 上的 workflow squash merge。');
} else {
  out('不會自動合併（檢查全綠後仍要 Jon 手動合）：');
  out('');
  for (const reason of reasons) out(`- ${reason}`);
}

if (failures.length > 0) process.exit(1);
