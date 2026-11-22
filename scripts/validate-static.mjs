import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HtmlValidate } from 'html-validate';
import stylelint from 'stylelint';

const root = process.cwd();
const htmlvalidate = new HtmlValidate({
  extends: ['html-validate:recommended'],
  elements: ['html5'],
  rules: {
    'doctype-style': 'off',
    'void-style': 'off',
    'no-inline-style': 'off',
  },
});

function htmlFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(abs, found);
    else if (entry.name.endsWith('.html')) found.push(abs);
  }
  return found;
}

function extract(html, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return [...html.matchAll(re)];
}

let failed = false;

for (const file of htmlFiles(root)) {
  const rel = path.relative(root, file);
  const html = readFileSync(file, 'utf8');
  const report = await htmlvalidate.validateString(html, file);
  if (!report.valid) {
    failed = true;
    for (const message of report.results.flatMap((result) => result.messages)) {
      console.error(`${rel}:${message.line}:${message.column} ${message.ruleId} ${message.message}`);
    }
  }

  const css = extract(html, 'style').map((match) => match[2]).join('\n');
  if (css.trim()) {
    const linted = await stylelint.lint({
      code: css,
      codeFilename: `${rel}.css`,
      config: { rules: {} },
    });
    if (linted.errored) {
      failed = true;
      for (const warning of linted.results.flatMap((result) => result.warnings)) {
        console.error(`${rel} CSS:${warning.line}:${warning.column} ${warning.text}`);
      }
    }
  }

  for (const match of extract(html, 'script')) {
    const attrs = match[1] || '';
    const code = match[2] || '';
    if (/\bsrc\s*=/.test(attrs) && !code.trim()) continue;
    if (/type\s*=\s*["'](?:application\/(?:ld\+)?json|importmap)["']/i.test(attrs)) continue;
    if (!code.trim()) continue;
    const dir = mkdtempSync(path.join(tmpdir(), 'html-js-'));
    const script = path.join(dir, 'inline.js');
    try {
      writeFileSync(script, code);
      execFileSync(process.execPath, ['--check', script], { stdio: 'pipe' });
    } catch (error) {
      failed = true;
      const detail = error.stderr?.toString() || error.message;
      console.error(`${rel} inline script 語法錯誤\n${detail}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

if (failed) process.exit(1);
console.log(`HTML/CSS/JS 檢查通過（${htmlFiles(root).length} 個頁面）。`);
