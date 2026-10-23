/** npm run solve – chạy solver cho mọi level trong level-data/levels, ghi goal vào file (và bản copy trong collection), in báo cáo. */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { solveLevel, estimateDifficulty } from '../src/core/solver';
import { validateLevel } from '../src/core/levelUtil';

const root = resolve(process.cwd(), 'level-data');
const dir = resolve(root, 'levels');
// bản copy trong collection: collections/<Tên>/NNN_<id>.json
const copies: string[] = [];
const cdir = resolve(root, 'collections');
if (existsSync(cdir)) for (const c of readdirSync(cdir)) for (const f of readdirSync(resolve(cdir, c))) copies.push(resolve(cdir, c, f));

for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort((a, b) => parseInt(a) - parseInt(b))) {
  const p = resolve(dir, f);
  const lv = JSON.parse(readFileSync(p, 'utf8'));
  const issues = validateLevel(lv).filter((i) => i.level !== 'info');
  const r = solveLevel(lv, 30000, 15000);
  const d = estimateDifficulty(lv, 60);
  if (r.status === 'solved' && lv.goal !== r.goal) {
    lv.goal = r.goal;
    const txt = JSON.stringify(lv, null, 1) + '\n';
    writeFileSync(p, txt);
    for (const c of copies) if (c.endsWith(`_${lv.id}.json`)) writeFileSync(c, txt);
  }
  console.log(
    `${f}  ${r.status.padEnd(10)} goal=${r.goal}  taps=${r.moves.filter((m) => m >= 0).length}  time=${r.seconds}s  nodes=${r.nodes}  random-win=${Math.round(d.winRate * 100)}%` +
      (issues.length ? '  ⚠ ' + issues.map((i) => i.msg).join('; ') : ''),
  );
}
