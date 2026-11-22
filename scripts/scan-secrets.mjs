import { scanTree } from './policy-lib.mjs';

const { hits, oversized } = scanTree(process.cwd());
for (const hit of hits) console.error(`${hit.file}:${hit.line} ${hit.name}`);
for (const file of oversized) console.error(`${file} 超過 1MB，沒有掃描`);
if (hits.length > 0 || oversized.length > 0) process.exit(1);
console.log('沒有發現秘密。');
