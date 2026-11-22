import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const REQUIRED_CHECKS = ['actionlint', 'html', 'links', 'markdown', 'pr-policy', 'smoke'];

export const BLOCK_LABELS = ['do-not-merge', 'needs-human'];

export const LIMITS = { lines: 800, files: 30 };

const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.woff', '.woff2',
]);

const SECRET_PATTERNS = [
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/ },
  { name: 'GitHub PAT', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: 'Private key', re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'OpenAI key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/ },
  { name: 'npm token', re: /\bnpm_[A-Za-z0-9]{36,}\b/ },
  { name: 'AWS secret key', re: /aws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{30,}/i },
];

const SKIP_DIRS = new Set(['.git', 'node_modules', 'playwright-report', 'test-results']);

export function isBinaryPath(file) {
  return BINARY_EXT.has(path.posix.extname(file.replace(/\\/g, '/')).toLowerCase());
}

export function isSecretFilename(file) {
  const base = path.posix.basename(file.replace(/\\/g, '/'));
  if (base === '.env.example') return false;
  if (base === '.env' || base.startsWith('.env.')) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return true;
  return /\.(pem|p12|pfx)$/i.test(base);
}

export function isGatePath(file) {
  const name = file.replace(/\\/g, '/');
  return name.startsWith('.github/')
    || name.startsWith('scripts/')
    || name === '.lychee.toml'
    || name === '.markdownlint-cli2.jsonc'
    || name === '.htmlvalidate.json';
}

export function issueNumbers(text, repo, selfNumber) {
  const found = new Set();
  if (!text) return [];
  const escaped = String(repo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const urlRe = new RegExp(`https://github\\.com/${escaped}/(?:issues|pull)/(\\d+)\\b`, 'g');
  const hashRe = /(?:^|[\s(\[])#(\d+)\b/g;
  for (const re of [urlRe, hashRe]) {
    let match;
    while ((match = re.exec(text))) found.add(Number(match[1]));
  }
  if (selfNumber) found.delete(Number(selfNumber));
  return [...found];
}

export function scanText(file, text) {
  const hits = [];
  if (isSecretFilename(file)) hits.push({ file, line: 1, name: '敏感檔名' });
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.re.test(lines[i])) hits.push({ file, line: i + 1, name: pattern.name });
    }
  }
  return hits;
}

export function scanTree(root) {
  const hits = [];
  const oversized = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(root, abs).replace(/\\/g, '/');
      const ext = path.extname(rel).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      const size = statSync(abs).size;
      if (size > 1_000_000) {
        oversized.push(rel);
        continue;
      }
      const buf = readFileSync(abs);
      if (buf.includes(0)) continue;
      hits.push(...scanText(rel, buf.toString('utf8')));
    }
  }
  walk(root);
  return { hits, oversized };
}

export function classifyFiles(files) {
  const deleted = [];
  let lines = 0;
  let gate = false;
  for (const file of files) {
    const names = [file.filename, file.previous_filename].filter(Boolean);
    if (names.some(isGatePath)) gate = true;
    if (file.status === 'removed') deleted.push(file.filename);
    const lock = names.some((name) => LOCKFILES.has(path.posix.basename(name)));
    if (!lock) lines += (file.additions || 0) + (file.deletions || 0);
  }
  return { gate, deleted, lines, fileCount: files.length };
}

export function hardFailures({ body, existingNumbers, missingNumbers, mergeable, secretHits, oversized }) {
  const failures = [];
  if (!body || !String(body).trim()) failures.push('PR 說明是空的。');
  if (!existingNumbers || existingNumbers.length === 0) {
    failures.push('PR 說明要引用這個 repo 已經存在的 issue，例如 `Refs #2`。只寫自己這支 PR 的編號不算。');
  }
  if (missingNumbers && missingNumbers.length > 0) {
    failures.push(`這些編號在這個 repo 不存在：${missingNumbers.map((n) => `#${n}`).join('、')}`);
  }
  if (mergeable === false) failures.push('和 base 有合併衝突，請先解消。');
  else if (mergeable == null) failures.push('GitHub 還沒算出這支 PR 能不能合併，請重跑 pr-policy。');
  if (secretHits && secretHits.length > 0) {
    const where = secretHits.map((hit) => `${hit.file}:${hit.line} ${hit.name}`).join('；');
    failures.push(`發現疑似秘密（沒有把內容印出來）：${where}`);
  }
  if (oversized && oversized.length > 0) {
    failures.push(`這些檔案超過 1MB，沒辦法確認裡面沒有秘密：${oversized.join('、')}`);
  }
  return failures;
}

// A branch can only be pushed to this repository by someone with write
// access, so "head is in the same repository" is the authorisation check.
// A missing head repo (deleted fork) counts as outside.
export function isSameRepoHead(pull, repo) {
  const head = pull?.head?.repo?.full_name;
  return typeof head === 'string' && head.toLowerCase() === String(repo).toLowerCase();
}

export function blockers({ draft, labels, classified, unscanned, sameRepo }) {
  const reasons = [];
  if (sameRepo !== true) {
    reasons.push('head 分支不在這個 repo（來自 fork）。外部來的 PR 一律要 Jon 看過再手動合併');
  }
  const present = new Set((labels || []).map((label) => String(label).toLowerCase()));
  for (const label of BLOCK_LABELS) {
    if (present.has(label)) reasons.push(`有標籤 \`${label}\``);
  }
  if (draft) reasons.push('PR 還是草稿');
  if (classified.gate) {
    reasons.push('改到閘門定義（`.github/`、`scripts/` 或檢查設定檔）。`.github/workflows/` 在這裡面，要 Jon 合併');
  }
  if (classified.deleted.length > 0) {
    reasons.push(`刪除既有檔案：${classified.deleted.join('、')}`);
  }
  if (classified.lines > LIMITS.lines) {
    reasons.push(`變更行數 ${classified.lines} 超過 ${LIMITS.lines}（不含 lockfile）`);
  }
  if (classified.fileCount > LIMITS.files) {
    reasons.push(`變更檔案數 ${classified.fileCount} 超過 ${LIMITS.files}`);
  }
  if (unscanned && unscanned.length > 0) {
    reasons.push(`這些檔案讀不到內容，沒辦法掃秘密，不自動合併：${unscanned.join('、')}`);
  }
  return reasons;
}

export function requiredCheckState(runs) {
  const latest = new Map();
  for (const run of runs) {
    const prev = latest.get(run.name);
    if (!prev || run.id > prev.id) latest.set(run.name, run);
  }
  const pending = [];
  const failed = [];
  for (const name of REQUIRED_CHECKS) {
    const run = latest.get(name);
    if (!run || run.status !== 'completed') pending.push(name);
    else if (run.conclusion !== 'success') failed.push(`${name}=${run.conclusion}`);
  }
  return { pending, failed, ready: pending.length === 0 && failed.length === 0 };
}
