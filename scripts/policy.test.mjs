import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  REQUIRED_CHECKS,
  blockers,
  classifyFiles,
  hardFailures,
  isGatePath,
  isSecretFilename,
  issueNumbers,
  requiredCheckState,
  scanText,
  scanTree,
} from './policy-lib.mjs';

const repo = 'ai4biz-tw/jd-ai-usercase';

test('issue references ignore the PR itself and HTML entities', () => {
  assert.deepEqual(
    issueNumbers('Refs #2\nhttps://github.com/ai4biz-tw/jd-ai-usercase/issues/1', repo, 8),
    [1, 2],
  );
  assert.deepEqual(issueNumbers('只寫自己 #8', repo, 8), []);
  assert.deepEqual(issueNumbers('&#39; 不是 issue', repo, 8), []);
  assert.deepEqual(
    issueNumbers('https://github.com/ai4biz-tw/jd-ai-usercase/pull/5', repo, 9),
    [5],
  );
});

test('secret patterns match constructed samples and ignore prose', () => {
  const samples = [
    ['AWS access key', `AKIA${'IOSFODNN7EXAMPLE'}`],
    ['GitHub token', `ghp_${'a'.repeat(36)}`],
    ['GitHub PAT', `github_pat_${'A'.repeat(22)}`],
    ['Private key', `-----BEGIN ${'PRIVATE KEY-----'}`],
    ['Slack token', `xoxb-${'1'.repeat(12)}-abcdef`],
    ['Google API key', `AIza${'a'.repeat(35)}`],
    ['OpenAI key', `sk-${'a'.repeat(24)}`],
    ['npm token', `npm_${'a'.repeat(36)}`],
  ];
  for (const [name, value] of samples) {
    const hits = scanText('src/demo.txt', `token=${value}`);
    assert.ok(hits.some((hit) => hit.name === name), name);
  }
  assert.equal(scanText('README.md', 'Refs #2 and ghp_short').length, 0);
});

test('secret filenames', () => {
  assert.equal(isSecretFilename('.env'), true);
  assert.equal(isSecretFilename('.env.local'), true);
  assert.equal(isSecretFilename('.env.example'), false);
  assert.equal(isSecretFilename('keys/id_rsa'), true);
  assert.equal(isSecretFilename('cert.pem'), true);
  assert.equal(isSecretFilename('index.html'), false);
});

test('gate paths cover workflows and the scripts that decide merge', () => {
  assert.equal(isGatePath('.github/workflows/ci.yml'), true);
  assert.equal(isGatePath('scripts/smoke.mjs'), true);
  assert.equal(isGatePath('.lychee.toml'), true);
  assert.equal(isGatePath('index.html'), false);
  assert.equal(isGatePath('docs/pr-review-policy.md'), false);
});

test('classify files ignores lockfile lines and does not treat renames as deletions', () => {
  const small = classifyFiles([
    { filename: 'index.html', status: 'modified', additions: 10, deletions: 2 },
    { filename: 'package-lock.json', status: 'modified', additions: 5000, deletions: 10 },
  ]);
  assert.equal(small.lines, 12);
  assert.equal(small.fileCount, 2);
  assert.equal(small.gate, false);
  assert.deepEqual(small.deleted, []);

  const removed = classifyFiles([
    { filename: 'old.html', status: 'removed', additions: 0, deletions: 3 },
  ]);
  assert.deepEqual(removed.deleted, ['old.html']);

  const renamed = classifyFiles([
    { filename: 'a.html', previous_filename: 'b.html', status: 'renamed', additions: 1, deletions: 1 },
  ]);
  assert.deepEqual(renamed.deleted, []);

  const movedWorkflow = classifyFiles([{
    filename: 'docs/x.md',
    previous_filename: '.github/workflows/ci.yml',
    status: 'renamed',
    additions: 0,
    deletions: 0,
  }]);
  assert.equal(movedWorkflow.gate, true);
});

test('hard failures and auto-merge blockers stay separate', () => {
  assert.equal(hardFailures({
    body: 'Refs #2',
    existingNumbers: [2],
    missingNumbers: [],
    mergeable: true,
    secretHits: [],
    oversized: [],
  }).length, 0);
  const blocked = hardFailures({
    body: '',
    existingNumbers: [],
    missingNumbers: [404],
    mergeable: false,
    secretHits: [{ file: 'a.txt', line: 3, name: 'GitHub token' }],
    oversized: ['big.js'],
  });
  assert.ok(blocked.length >= 4);

  const reasons = blockers({
    draft: true,
    labels: ['needs-human'],
    classified: { gate: true, deleted: ['index.html'], lines: 900, fileCount: 31 },
    unscanned: ['huge.bin'],
  });
  assert.ok(reasons.some((reason) => reason.includes('needs-human')));
  assert.ok(reasons.some((reason) => reason.includes('草稿')));
  assert.ok(reasons.some((reason) => reason.includes('閘門')));
  assert.ok(reasons.some((reason) => reason.includes('index.html')));
  assert.ok(reasons.some((reason) => reason.includes('900')));
  assert.ok(reasons.some((reason) => reason.includes('31')));
  assert.equal(blockers({
    draft: false,
    labels: [],
    classified: { gate: false, deleted: [], lines: 10, fileCount: 1 },
    unscanned: [],
  }).length, 0);
});

test('required checks use the latest run and ignore unrelated names', () => {
  const runs = REQUIRED_CHECKS.map((name, index) => ({
    id: index + 1,
    name,
    status: 'completed',
    conclusion: 'success',
  }));
  assert.equal(requiredCheckState(runs).ready, true);
  runs.push({ id: 99, name: 'html', status: 'in_progress', conclusion: null });
  const pending = requiredCheckState(runs);
  assert.equal(pending.ready, false);
  assert.deepEqual(pending.pending, ['html']);
  assert.equal(requiredCheckState([
    ...REQUIRED_CHECKS.filter((name) => name !== 'smoke').map((name, index) => ({
      id: index + 1,
      name,
      status: 'completed',
      conclusion: 'success',
    })),
    { id: 50, name: 'smoke', status: 'completed', conclusion: 'failure' },
  ]).failed[0], 'smoke=failure');
});

test('this checkout has no secret hits', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { hits, oversized } = scanTree(root);
  assert.deepEqual(hits, []);
  assert.deepEqual(oversized, []);
});
