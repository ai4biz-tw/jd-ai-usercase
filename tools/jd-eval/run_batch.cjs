// 用法：node run_batch.cjs <jd2md.js> <all.jsonl> <out.json>
const fs = require('fs');
const [, , libPath, dataPath, outPath] = process.argv;
const holder = { exports: {} };
new Function('module', fs.readFileSync(libPath, 'utf8'))(holder);
const JD2MD = holder.exports;

const rows = fs.readFileSync(dataPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const out = [];
for (const r of rows) {
  let res;
  let err = null;
  const text = (r.title + '\n\n' + r.text).slice(0, JD2MD.MAX_CHARS);
  try {
    res = JD2MD.convert(text);
  } catch (e) {
    err = String(e && e.message);
    res = { modules: [], human: [], families: [] };
  }
  const parsed = JD2MD.parseJD(text);
  out.push({
    co: r.co, title: r.title, dept: r.dept, zh: r.zh, n: r.n, truncated: (r.title.length + 2 + r.text.length) > JD2MD.MAX_CHARS,
    err, error: res.error || null,
    families: res.families || [],
    nResp: parsed.responsibilities.length,
    modules: (res.modules || []).map((m) => ({ id: m.id, name: m.name, level: m.level, bullets: (m.bullets || []).map(String) })),
    human: (res.human || []).map((h) => ({ text: h.text, reason: /關係、協調/.test(h.reason) ? 'soft' : 'nomatch' })),
    resp: parsed.responsibilities,
  });
}
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('ran', out.length);
