var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var { execFileSync } = require('child_process');
var JD2MD = require('./jd2md.js');

var SECTIONS = [
  '## 這個模組在做什麼',
  '## 可取代程度',
  '## 輸入',
  '## 步驟',
  '## 交付物與驗收',
  '## 風險與人工把關',
  '## 給 AI 的指令（可直接貼）'
];

function sample(id) {
  return JD2MD.SAMPLES.find(function (item) { return item.id === id; }).text;
}

function names(result) {
  return result.modules.map(function (item) { return item.name; }).join('、') || '(沒有模組)';
}

function findModule(result, re) {
  var found = result.modules.find(function (item) { return re.test(item.name); });
  assert.ok(found, names(result) + ' 裡沒有 ' + re);
  return found;
}

function assertNo(result, re) {
  result.modules.forEach(function (item) {
    assert.ok(!re.test(item.name), item.name + ' 不該出現');
    assert.ok(!re.test(item.markdown), item.name + ' 的內文不該出現 ' + re);
  });
}

function assertShape(result) {
  assert.ok(result.ok, result.error);
  assert.ok(result.modules.length >= 1 && result.modules.length <= 6, names(result));
  result.modules.forEach(function (item) {
    assert.ok(['AUTO', 'AUG', 'HUMAN-LEAD'].indexOf(item.level) !== -1, item.level);
    SECTIONS.forEach(function (heading) {
      assert.ok(item.markdown.indexOf(heading) !== -1, item.name + ' 缺少 ' + heading);
    });
    assert.ok(/AI 做|人核准|人做/.test(item.markdown), item.name + ' 步驟沒有標執行者');
    item.bullets.forEach(function (bullet) {
      assert.ok(item.markdown.indexOf(bullet) !== -1, item.name + ' 沒引用原文');
    });
    assert.ok(item.prompt.indexOf(item.name) !== -1);
  });
  assert.ok(result.markdown.indexOf(result.title) === 2 || result.markdown.indexOf(result.title) > 0);
  assert.strictEqual(result.files.length, result.modules.length + (result.human.length ? 1 : 0));
}

var finance = JD2MD.convert(sample('finance'));
assertShape(finance);
assert.deepStrictEqual(finance.families, ['finance']);
findModule(finance, /預算|月結/);
findModule(finance, /差異|管理報告/);
findModule(finance, /產業|專案/);
findModule(finance, /自助|例行財務/);
assertNo(finance, /工程|護理|報價到收款|新客戶/);
assert.ok(finance.markdown.indexOf('5+ years') === -1, '任職條件不該進模組');
assert.ok(finance.markdown.indexOf('Tableau') === -1);
var planning = findModule(finance, /預算|月結/);
assert.ok(planning.bullets.some(function (bullet) { return /month-end|forecast|budget/i.test(bullet); }));
assert.ok(!planning.bullets.some(function (bullet) { return /variance analysis/i.test(bullet); }));

var sales = JD2MD.convert(sample('sales'));
assertShape(sales);
assert.deepStrictEqual(sales.families, ['sales']);
var q2c = findModule(sales, /報價到收款/);
assert.ok(q2c.bullets.some(function (bullet) { return /報價單/.test(bullet) && /收款/.test(bullet); }));
var prospect = findModule(sales, /新客戶開發/);
assert.ok(prospect.bullets.some(function (bullet) { return /開發新客戶/.test(bullet); }));
assert.ok(prospect.bullets.some(function (bullet) { return /展會/.test(bullet); }));
findModule(sales, /銷售預測/);
assertNo(sales, /工程|程式|護理|預算|管理報告/);
assert.ok(sales.human.some(function (item) { return /跨部門/.test(item.text); }));
assert.ok(!sales.modules.some(function (item) { return item.bullets.some(function (bullet) { return /跨部門/.test(bullet); }); }));

var nurse = JD2MD.convert(sample('nurse'));
assertShape(nurse);
assert.deepStrictEqual(nurse.families, ['clinical']);
assert.strictEqual(findModule(nurse, /給藥/).level, 'HUMAN-LEAD');
findModule(nurse, /護理評估/);
findModule(nurse, /護理紀錄/);
findModule(nurse, /交班/);
findModule(nurse, /衛教/);
assertNo(nurse, /預算|管理報告|差異說明|工程|報價/);
assert.ok(nurse.human.some(function (item) { return /護病關係/.test(item.text); }));
assert.ok(nurse.markdown.indexOf('護理師執照') === -1);

var soft = JD2MD.convert('客戶成功\n\n工作內容：\n- 維繫客戶關係\n- 跨部門溝通協調');
assert.strictEqual(soft.modules.length, 0);
assert.strictEqual(soft.human.length, 2);

var dev = JD2MD.convert('業務專員\n\n工作內容：\n- 開發新客戶');
assert.ok(!dev.modules.some(function (item) { return /程式|工程|系統設計/.test(item.name); }), names(dev));
assert.ok(findModule(dev, /新客戶/));

var engineer = JD2MD.convert('後端工程師\n\n工作內容：\n1. 負責後端 API 開發與程式碼撰寫\n2. 撰寫測試並參與 code review\n3. 與產品討論系統設計');
assertShape(engineer);
assert.deepStrictEqual(engineer.families, ['engineering']);
findModule(engineer, /程式變更|功能實作/);
findModule(engineer, /程式審查|測試/);
findModule(engineer, /系統設計/);
assertNo(engineer, /報價|護理|預算/);

assert.strictEqual(JD2MD.convert('').ok, false);
assert.strictEqual(JD2MD.convert('x'.repeat(12001)).ok, false);

var accounting = JD2MD.convert([
  '3P Revenue Accounting & Reporting',
  '',
  'Responsibilities:',
  '- Lead the revenue close for cloud service provider Marketplace within a listed company timeline.',
  '- Prepare and review revenue, revenue-share, reserve journal entries, accruals and true-ups.',
  '- Own balance sheet reconciliations, reserves, and the usage-to-invoice-to-cash bridge.',
  '- Perform monthly and quarterly flux analysis and prepare flux decks for leadership.',
  '- Own monthly and quarterly 3P revenue reporting for leadership and FP&A.',
  '- Serve as the primary contact for external auditors.',
  '- Partner with FP&A, Treasury, AR and business teams on forecasts, cash and partner disputes.'
].join('\n'));
assertShape(accounting);
assert.ok(accounting.families.indexOf('finance') !== -1, accounting.families.join(','));
findModule(accounting, /關帳|對帳|分錄/);
findModule(accounting, /差異|管理報告/);
findModule(accounting, /預算|月結|規劃/);
assertNo(accounting, /工程|護理|報價|新客戶/);
assert.ok(accounting.human.some(function (item) { return /auditors/.test(item.text); }));

var ae = JD2MD.convert([
  'Account Executive, AI Native',
  '',
  'Responsibilities:',
  '- Win new business and own the full sales cycle with prospective customers.',
  '- Design sales strategies to meet and exceed revenue quotas.',
  '- Pinpoint new customer segments and collaborate cross-functionally.',
  '- Gather customer feedback and inform product roadmaps.'
].join('\n'));
assertShape(ae);
assert.deepStrictEqual(ae.families, ['sales']);
findModule(ae, /新客戶/);
findModule(ae, /預測|業績/);
assertNo(ae, /工程|程式|護理|預算|關帳/);
assert.ok(ae.human.some(function (item) { return /product roadmaps/.test(item.text); }));

var zipPath = path.join(os.tmpdir(), 'jd2md-test.zip');
fs.writeFileSync(zipPath, Buffer.from(JD2MD.buildZip(sales.files)));
execFileSync('unzip', ['-t', zipPath], { stdio: 'pipe' });
var listing = execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print("\\n".join(i.filename for i in z.infolist()))', zipPath], { encoding: 'utf8' });
assert.ok(listing.indexOf('報價到收款') !== -1, listing);
assert.ok(listing.indexOf('仍然需要你本人') !== -1, listing);

console.log('jd2md.test.js ok');
console.log('finance:', names(finance));
console.log('sales:', names(sales), 'human:', sales.human.map(function (item) { return item.text; }).join(' / '));
console.log('nurse:', names(nurse), 'human:', nurse.human.map(function (item) { return item.text; }).join(' / '));
