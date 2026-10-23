import { Sim, FIXED_DT } from './sim';
import { COLORS, type LevelDef } from './types';

export interface SolveResult {
  status: 'solved' | 'unsolvable' | 'unknown';
  /** chuỗi thao tác: số ≥ 0 = tap xe; -1 = chờ tới khi có nấc vào xe (hoặc hết 1 vòng); -2 = chờ hết 1 vòng không có nấc nào vào xe */
  moves: number[];
  /** số xe hoàn thành khi thắng (dùng làm goal) */
  goal: number;
  /** thời gian chơi của lời giải (giây, theo mô phỏng) */
  seconds: number;
  nodes: number;
  ms: number;
}

/** mã 1 ký tự cho mỗi màu (khoá trạng thái của solver) */
const CI = Object.fromEntries(COLORS.map((c, i) => [c, 'abcdefghijklmnopqrstuvwxyz'[i]])) as Record<string, string>;

export const WAIT_SHORT = -1;
export const WAIT_LOOP = -2;

const stackSig = (sim: Sim) => sim.completed * 1000 + sim.buses.reduce((a, b) => a + b.stack.length, 0);

/** sau khi tap: mô phỏng tới khi hàng chờ xả hết */
export function settlePending(sim: Sim) {
  let guard = 0;
  const max = Math.ceil((sim.loopTime * 2) / FIXED_DT);
  while (sim.status === 'playing' && sim.pendingTotal() > 0 && guard++ < max) sim.step(FIXED_DT);
}

/** chờ ngắn: tới khi có nấc vào xe, hoặc hết 1 vòng ống không có gì xảy ra; true nếu có thay đổi */
export function waitShort(sim: Sim): boolean {
  const loopSteps = Math.ceil(sim.loopTime / FIXED_DT);
  const before = stackSig(sim);
  for (let i = 0; i < loopSteps && sim.status === 'playing'; i++) {
    sim.step(FIXED_DT);
    if (stackSig(sim) !== before) return true;
  }
  return sim.status !== 'playing';
}

/** chờ dài: tới khi qua 1 vòng không có nấc nào vào xe; true nếu có thay đổi */
export function waitLoop(sim: Sim): boolean {
  let quiet = 0, changed = false, guard = 0;
  const loopSteps = Math.ceil(sim.loopTime / FIXED_DT);
  while (sim.status === 'playing' && quiet < loopSteps && guard++ < loopSteps * 20) {
    const before = stackSig(sim);
    sim.step(FIXED_DT);
    if (stackSig(sim) !== before) {
      quiet = 0;
      changed = true;
    } else quiet++;
  }
  return changed;
}

/** áp 1 thao tác của lời giải lên sim */
export function applyMove(sim: Sim, m: number) {
  if (m >= 0) {
    sim.tap(m);
    settlePending(sim);
  } else if (m === WAIT_SHORT) waitShort(sim);
  else waitLoop(sim);
}

/** số nấc chưa nằm trong xe đã ✓ (ước lượng việc còn lại) */
function remaining(sim: Sim) {
  let n = 0;
  for (const b of sim.buses) if (!b.done) n += b.stack.length + b.pending.length;
  for (const s of sim.slots) if (s.color) n++;
  return n;
}

/** hàng đợi ưu tiên nhỏ nhất (binary heap) */
class Heap<T> {
  private a: { f: number; v: T }[] = [];
  get size() {
    return this.a.length;
  }
  push(f: number, v: T) {
    const a = this.a;
    a.push({ f, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0].v;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Solver trên các "điểm quyết định" (sau mỗi lần tap mô phỏng tới khi hàng chờ xả hết).
 * 1) Tìm theo ưu tiên (best-first): luôn mở rộng nhánh có (thời gian đã chơi + 4 giây × số nấc còn phải xếp; gộp trạng thái chỉ lệch pha ống)
 *    nhỏ nhất → lời giải ngắn về thời gian, ít tap thừa. Hành động: tap 1 xe, hoặc chờ tới khi có nấc vào xe.
 * 2) Nếu hết ngân sách mà chưa ra: DFS cũ (ưu tiên xe nhiều nấc, chờ hết vòng) với phần ngân sách còn lại.
 * Không dùng booster. Kết quả là "đủ điều kiện": tìm ra lời giải thì màn chắc chắn giải được.
 */
export function solveLevel(level: LevelDef, maxNodes = 4000, timeLimitMs = 4000, weight = 4): SolveResult {
  const t0 = performance.now();
  const lv: LevelDef = { ...level, goal: 999 };
  const root = new Sim(lv);
  const shared = root.path;
  let nodes = 0;
  const over = (limitNodes: number, limitMs: number) => nodes > limitNodes || performance.now() - t0 > limitMs;

  const key = (sim: Sim) => {
    const st = sim.buses.map((b) => b.stack.join(',')).join('|');
    const pos = Math.floor(sim.offset / sim.S);
    const pipe = sim.slots.map((s) => (s.color ? CI[s.color] : '.')).join('');
    return st + '#' + pipe + '#' + pos;
  };
  // khoá thô cho best-first: bỏ vị trí ống (gộp trạng thái chỉ lệch pha ống) – lời giải vẫn được mô phỏng lại đầy đủ
  const coarseKey = (sim: Sim) => {
    const st = sim.buses.map((b) => b.stack.join(',')).join('|');
    const pipe = sim.slots.filter((x) => x.color).map((x) => CI[x.color!]).sort().join('');
    return st + '#' + pipe;
  };
  const clone = (sim: Sim) => {
    const s = new Sim(lv, shared);
    s.restore(sim.snapshot());
    return s;
  };

  // ---- 1) best-first
  const W = weight;
  const heap = new Heap<{ sim: Sim; path: number[] }>();
  const best = new Map<string, number>();
  heap.push(W * remaining(root), { sim: root, path: [] });
  let found: number[] | null = null;
  let exhausted = false;
  const bfNodes = Math.floor(maxNodes * 0.7), bfMs = timeLimitMs * 0.7;
  for (;;) {
    const cur = heap.pop();
    if (!cur) {
      exhausted = true;
      break;
    }
    const { sim, path } = cur;
    if (sim.status === 'won') {
      found = path;
      break;
    }
    if (sim.status === 'lost') continue;
    if (++nodes > bfNodes || performance.now() - t0 > bfMs) break;
    const push = (n: Sim, m: number) => {
      if (n.status === 'lost') return;
      const k = coarseKey(n);
      const g = n.time;
      const prev = best.get(k);
      if (prev !== undefined && prev <= g) return;
      best.set(k, g);
      heap.push(g + W * remaining(n), { sim: n, path: [...path, m] });
    };
    if (sim.freeCapacity() > 0) {
      for (const b of sim.buses) {
        if (!sim.isTappable(b)) continue;
        const n = clone(sim);
        if (!n.tap(b.id)) continue;
        settlePending(n);
        push(n, b.id);
      }
    }
    const w = clone(sim);
    if (waitShort(w)) push(w, WAIT_SHORT);
  }

  // ---- 2) DFS dự phòng
  let aborted = false;
  if (!found && !exhausted) {
    const seen = new Set<string>();
    const path: number[] = [];
    const dfs = (sim: Sim, depth: number): boolean => {
      if (sim.status === 'won') return true;
      if (sim.status === 'lost' || depth > 80) return false;
      nodes++;
      if (over(maxNodes, timeLimitMs)) {
        aborted = true;
        return false;
      }
      const k = key(sim);
      if (seen.has(k)) return false;
      seen.add(k);
      const order = sim.buses
        .filter((b) => sim.isTappable(b))
        .sort((a, b) => b.stack.length - a.stack.length)
        .map((b) => b.id);
      if (sim.freeCapacity() > 0) {
        for (const id of order) {
          const n = clone(sim);
          if (!n.tap(id)) continue;
          settlePending(n);
          path.push(id);
          if (dfs(n, depth + 1)) return true;
          path.pop();
          if (aborted) return false;
        }
      }
      const w = clone(sim);
      const changed = waitLoop(w);
      if (changed || w.status !== 'playing') {
        path.push(WAIT_LOOP);
        if (dfs(w, depth + 1)) return true;
        path.pop();
      }
      return false;
    };
    if (dfs(root, 0)) found = [...path];
  } else if (!found) aborted = false;

  // đếm số xe hoàn thành + thời gian bằng cách chạy lại lời giải
  let goal = 0, seconds = 0;
  if (found) {
    const replay = new Sim(lv);
    for (const m of found) applyMove(replay, m);
    waitLoop(replay);
    goal = replay.completed;
    seconds = Math.round(replay.time);
  }
  return {
    status: found ? 'solved' : aborted || !exhausted ? 'unknown' : 'unsolvable',
    moves: found ?? [],
    goal,
    seconds,
    nodes,
    ms: Math.round(performance.now() - t0),
  };
}

/**
 * Ước lượng độ khó: cho "người chơi ngẫu nhiên" chơi N lần (chọn ngẫu nhiên xe để tap
 * tại mỗi điểm quyết định). Tỉ lệ thắng càng thấp → màn càng khó.
 */
export function estimateDifficulty(level: LevelDef, trials = 40, seed = 7): { winRate: number; avgMoves: number } {
  const lv: LevelDef = { ...level, goal: 999 };
  const base = new Sim(lv);
  let st = seed >>> 0;
  const rnd = () => {
    st = (st * 1664525 + 1013904223) >>> 0;
    return st / 4294967296;
  };
  let wins = 0, moves = 0;
  // giới hạn số quyết định ~ người chơi thật sẽ bỏ cuộc nếu loay hoay quá lâu
  const units = level.buses.reduce((a, b) => a + b.stack.length, 0);
  const maxDecisions = Math.max(12, units * 2);
  for (let t = 0; t < trials; t++) {
    const s = new Sim(lv, base.path);
    let guard = 0;
    while (s.status === 'playing' && guard++ < maxDecisions) {
      const opts = s.buses.filter((b) => s.isTappable(b)).map((b) => b.id);
      // 25% chờ, còn lại tap ngẫu nhiên
      if (opts.length && s.freeCapacity() > 0 && rnd() > 0.25) {
        s.tap(opts[Math.floor(rnd() * opts.length)]);
        const max = Math.ceil((s.loopTime * 2) / FIXED_DT);
        for (let i = 0; i < max && s.pendingTotal() > 0 && s.status === 'playing'; i++) s.step(FIXED_DT);
      } else {
        const n = Math.ceil(s.loopTime / FIXED_DT / 2);
        for (let i = 0; i < n && s.status === 'playing'; i++) s.step(FIXED_DT);
      }
    }
    if (s.status === 'won') {
      wins++;
      moves += s.moves;
    }
  }
  return { winRate: wins / trials, avgMoves: wins ? moves / wins : 0 };
}

export interface TimelineTap {
  bus: number;
  /** số bước mô phỏng (60Hz) tính từ đầu màn tại thời điểm tap */
  step: number;
}

/**
 * Dựng lời giải của solver thành mốc thời gian để "tự chơi" trong game (bàn tay tap theo từng bước).
 * Giữa 2 lần tap cách nhau ít nhất `minGap` giây cho kịp hoạt cảnh bàn tay; thử giảm dần khoảng cách
 * nếu chờ lâu làm hỏng lời giải. Mô phỏng chạy đúng như trong game nên tap đúng bước là chắc chắn thắng.
 */
export function planTimeline(level: LevelDef, moves: number[], gaps = [0.7, 0.45, 0.25, 0]): { taps: TimelineTap[]; won: boolean } {
  for (const minGap of gaps) {
    const sim = new Sim(level);
    const gapSteps = Math.round(minGap / FIXED_DT);
    const taps: TimelineTap[] = [];
    let step = 0, last = -Infinity;
    const run = (n: number) => {
      for (let i = 0; i < n && sim.status === 'playing'; i++, step++) sim.step(FIXED_DT);
    };
    const loopSteps = Math.ceil(sim.loopTime / FIXED_DT);
    let ok = true;
    for (const m of moves) {
      if (sim.status !== 'playing') break;
      if (m >= 0) {
        run(Math.max(0, last + gapSteps - step));
        if (!sim.tap(m)) {
          ok = false;
          break;
        }
        taps.push({ bus: m, step });
        last = step;
        let guard = 0;
        while (sim.pendingTotal() > 0 && sim.status === 'playing' && guard++ < loopSteps * 2) run(1);
      } else {
        // chờ giống hệt solver (bước tay mô phỏng để đếm số bước)
        const loop = m === WAIT_LOOP;
        let quiet = 0, guard = 0;
        const before0 = stackSig(sim);
        while (sim.status === 'playing' && guard++ < loopSteps * 20) {
          const before = stackSig(sim);
          run(1);
          const changedNow = stackSig(sim) !== before;
          if (!loop) {
            if (stackSig(sim) !== before0 || ++quiet >= loopSteps) break;
          } else if (changedNow) quiet = 0;
          else if (++quiet >= loopSteps) break;
        }
      }
    }
    if (ok) run(loopSteps * 3);
    if (ok && sim.status === 'won') return { taps, won: true };
  }
  return { taps: [], won: false };
}
