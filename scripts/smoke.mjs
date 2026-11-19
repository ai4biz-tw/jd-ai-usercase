import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const SAMPLE_JD = [
  '財務分析師',
  '',
  '工作內容：',
  '- 負責年度預算規劃與每月差異分析',
  '- 製作管理報告並向主管說明數字',
  '- 支援跨部門的例行對帳流程',
  '',
  '條件要求：',
  '- 兩年以上財務分析經驗',
].join('\n');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

async function htmlFiles(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await htmlFiles(abs, found);
    else if (entry.name.endsWith('.html')) found.push(abs);
  }
  return found;
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.normalize(path.join(root, pathname));
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403);
        response.end();
        return;
      }
      const body = await readFile(file);
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      response.writeHead(200, { 'content-type': type });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function ignoreConsole(text) {
  return /fonts\.(googleapis|gstatic)\.com/.test(text);
}

async function runFlow(page) {
  const generic = await page.locator('[data-smoke-input]').count() > 0
    && await page.locator('[data-smoke-run]').count() > 0
    && await page.locator('[data-smoke-output]').count() > 0;
  if (generic) {
    await page.locator('[data-smoke-input]').fill(SAMPLE_JD);
    await page.locator('[data-smoke-run]').click();
    const output = page.locator('[data-smoke-output]');
    await output.waitFor({ state: 'visible', timeout: 5000 });
    const text = (await output.innerText()).trim();
    if (text.length < 20) throw new Error('data-smoke-output 沒有足夠的產出文字');
    return 'generic';
  }

  const jd = await page.locator('#jdText').count() > 0
    && await page.locator('#analyzeTextBtn').count() > 0
    && await page.locator('#output').count() > 0;
  if (!jd) return null;

  if (await page.locator('#fallbackToggle').count()) {
    await page.locator('#fallbackToggle').click();
  }
  await page.locator('#jdText').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#jdText').fill(SAMPLE_JD);
  await page.locator('#analyzeTextBtn').click();
  await page.locator('#output.show').waitFor({ state: 'visible', timeout: 5000 });
  const title = await page.locator('#roleTitle').innerText();
  if (!title.includes('AI 導入藍圖')) throw new Error(`分析標題不對：${title}`);
  const cases = await page.locator('#caseContainer .case').count();
  if (cases < 1) throw new Error('沒有產生 use case');
  const meta = await page.locator('#resultMeta').innerText();
  if (!meta.includes('use case')) throw new Error(`結果摘要不對：${meta}`);
  return 'jd';
}

const files = (await htmlFiles(root)).sort();
if (files.length === 0) {
  console.error('找不到 HTML 頁面');
  process.exit(1);
}

const { server, port } = await startServer();
const browser = await chromium.launch({ headless: true });
let flows = 0;
try {
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (ignoreConsole(text)) return;
      errors.push(`console: ${text}`);
    });
    const response = await page.goto(`http://127.0.0.1:${port}/${rel}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    if (!response || response.status() !== 200) {
      throw new Error(`${rel} HTTP ${response ? response.status() : 'no response'}`);
    }
    const title = await page.title();
    if (!title.trim()) throw new Error(`${rel} 沒有 <title>`);
    const flow = await runFlow(page);
    if (flow) flows += 1;
    if (errors.length > 0) {
      throw new Error(`${rel} 有瀏覽器錯誤\n${errors.join('\n')}`);
    }
    console.log(`${rel}：載入正常${flow ? `，核心流程 ${flow}` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (flows === 0) {
  console.error('沒有任何工具頁跑到「貼上 JD → 產出出現」');
  process.exit(1);
}
console.log(`smoke 通過：${files.length} 個頁面，${flows} 個跑了核心流程。`);
