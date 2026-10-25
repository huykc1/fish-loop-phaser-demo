import { PipePath, autoPortS, rayPortS } from './path';
import { busComplete } from './sim';
import { BUS_H, busLength, busTail } from './geometry';
import { COLORS, type BusDef, type FishColor, type LevelDef } from './types';
import { rngNext } from './rng';

export interface Issue {
  level: 'error' | 'warn' | 'info';
  msg: string;
}

export function colorCounts(level: LevelDef): Map<FishColor, number> {
  const m = new Map<FishColor, number>();
  for (const b of level.buses) for (const c of b.stack) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

function corners(b: { x: number; y: number; rot: number; capacity: number }, scale = 1) {
  const L = (busLength(b.capacity) / 2) * scale, H = (BUS_H / 2) * scale;
  const r = (b.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [[-L, -H], [L, -H], [L, H], [-L, H]].map(([x, y]) => ({ x: b.x + x * c - y * s, y: b.y + x * s + y * c }));
}

/** kiểm tra 2 hình chữ nhật xoay giao nhau (SAT) */
export function busesOverlap(a: BusDef | { x: number; y: number; rot: number; capacity: number }, b: typeof a, scale = 1): boolean {
  const A = corners(a, scale), B = corners(b, scale);
  for (const poly of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i], q = poly[(i + 1) % 4];
      const nx = q.y - p.y, ny = p.x - q.x;
      const pa = A.map((v) => v.x * nx + v.y * ny), pb = B.map((v) => v.x * nx + v.y * ny);
      if (Math.max(...pa) <= Math.min(...pb) + 1 || Math.max(...pb) <= Math.min(...pa) + 1) return false;
    }
  }
  return true;
}

function subsetSum(caps: number[], target: number): boolean {
  const ok = new Set([0]);
  for (const c of caps) for (const v of [...ok]) ok.add(v + c);
  return ok.has(target);
}

export function validateLevel(level: LevelDef): Issue[] {
  const out: Issue[] = [];
  let path: PipePath | null = null;
  try {
    path = new PipePath(level.pipe);
  } catch (e) {
    out.push({ level: 'error', msg: 'Ống không hợp lệ: ' + String(e) });
  }
  if (!level.buses.length) out.push({ level: 'error', msg: 'Chưa có xe nào' });
  const counts = colorCounts(level);
  const caps = level.buses.map((b) => b.capacity);
  let units = 0;
  for (const [c, n] of counts) {
    units += n;
    if (!subsetSum(caps, n)) out.push({ level: 'error', msg: `Màu ${c}: ${n} nấc không khớp tổng sức chứa của bất kỳ nhóm xe nào` });
  }
  const totalCap = caps.reduce((a, b) => a + b, 0);
  if (path) {
    const C = Math.floor(path.length / level.slotLength);
    if (units > totalCap) out.push({ level: 'error', msg: `Tổng nấc (${units}) lớn hơn tổng chỗ trên xe (${totalCap})` });
    if (C < 2) out.push({ level: 'error', msg: 'Ống quá ngắn (sức chứa < 2 nấc)' });
    if ((level.pipeLimit ?? 5) > C) out.push({ level: 'error', msg: `N = ${level.pipeLimit ?? 5} lớn hơn sức chứa ống (${C} nấc)` });
    if (level.pipeSpeed / 60 >= level.slotLength) out.push({ level: 'error', msg: 'pipeSpeed quá lớn so với slotLength' });
  }
  level.buses.forEach((b, i) => {
    if (path && busHitsPipe(path, b, level.busScale ?? 1)) out.push({ level: 'error', msg: `Xe #${i + 1} đè lên ống nước` });
    if (b.stack.length > b.capacity) out.push({ level: 'error', msg: `Xe #${i + 1}: số nấc vượt sức chứa` });
    if (busComplete(b)) out.push({ level: 'warn', msg: `Xe #${i + 1} đã hoàn thành ngay từ đầu` });
    level.buses.forEach((o, j) => {
      if (j > i && busesOverlap(b, o, level.busScale ?? 1)) out.push({ level: 'warn', msg: `Xe #${i + 1} chồng lên xe #${j + 1}` });
    });
  });
  if (!level.goal) out.push({ level: 'info', msg: 'Chưa có goal – bấm "Kiểm tra giải" để tự tính' });
  if (!(level.spareSlots?.length)) out.push({ level: 'error', msg: 'Chưa có vị trí xe dự phòng (booster Thêm xe cần ít nhất 1)' });
  (level.spareSlots ?? []).forEach((sp, i) => {
    const s = { ...sp, capacity: 4 };
    level.buses.forEach((b, j) => {
      if (busesOverlap(s, b, level.busScale ?? 1)) out.push({ level: 'warn', msg: `Vị trí dự phòng ${i + 1} chồng lên xe #${j + 1}` });
    });
    if (path && busHitsPipe(path, sp, level.busScale ?? 1)) out.push({ level: 'error', msg: `Vị trí dự phòng ${i + 1} đè lên ống nước` });
    if (path && (sp.portS === null || sp.portS === undefined)) {
      const others = [...level.buses, ...(level.spareSlots ?? []).filter((o) => o !== sp).map((o) => ({ ...o, capacity: 4 }))];
      if (straightPortDist(path, s, level.busScale ?? 1, others) < 0)
        out.push({ level: 'error', msg: `Vị trí dự phòng ${i + 1} không nối thẳng vào ống (đuôi xe phải hướng ra ống, không bị xe khác chắn)` });
    }
  });
  if ((level.boosters.addBus ?? 0) > (level.spareSlots?.length ?? 0))
    out.push({ level: 'warn', msg: 'Số booster Thêm xe lớn hơn số vị trí xe dự phòng' });
  return out;
}

/**
 * Sinh ngẫu nhiên màu cho các xe hiện có:
 * `colorsUsed` màu × capacity nấc mỗi màu, rải ngẫu nhiên vào các xe (trừ `emptyBuses` xe cuối để trống).
 */
export function randomizeStacks(level: LevelDef, colorsUsed: number, emptyBuses: number, seed: number): LevelDef {
  const st = { seed };
  const lv: LevelDef = structuredClone(level);
  const fill = lv.buses.slice(0, Math.max(0, lv.buses.length - emptyBuses));
  const capTotal = fill.reduce((a, b) => a + b.capacity, 0);
  const k = Math.min(colorsUsed, COLORS.length);
  // mỗi màu đúng 4 nấc (hoặc ít hơn nếu thiếu chỗ)
  const units: FishColor[] = [];
  for (let i = 0; i < k; i++) for (let j = 0; j < 4; j++) units.push(COLORS[i]);
  units.length = Math.min(units.length, capTotal);
  for (let i = units.length - 1; i > 0; i--) {
    const j = Math.floor(rngNext(st) * (i + 1));
    [units[i], units[j]] = [units[j], units[i]];
  }
  lv.buses.forEach((b) => (b.stack = []));
  let u = 0;
  for (const b of fill) while (b.stack.length < b.capacity && u < units.length) b.stack.push(units[u++]);
  // tránh xe hoàn thành sẵn: đổi chỗ 1 nấc với xe khác
  for (const b of fill) {
    if (busComplete(b)) {
      const other = fill.find((o) => o !== b && o.stack.length && o.stack[0] !== b.stack[0]);
      if (other) [b.stack[0], other.stack[0]] = [other.stack[0], b.stack[0]];
    }
  }
  lv.seed = seed;
  delete lv.goal;
  return lv;
}

/** xếp xe thành cột giữa vùng bên trong ống */
export function autoArrange(level: LevelDef): LevelDef {
  const lv: LevelDef = structuredClone(level);
  const xs = lv.pipe.points.map((p) => p[0]), ys = lv.pipe.points.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const top = Math.min(...ys) + 150, bot = Math.max(...ys) - 150;
  const n = lv.buses.length;
  lv.buses.forEach((b, i) => {
    b.rot = 0;
    b.x = Math.round(cx);
    b.y = Math.round(n === 1 ? (top + bot) / 2 : top + ((bot - top) * i) / (n - 1));
    b.portS = null;
  });
  return lv;
}

export const PIPE_PRESETS: Record<string, { points: [number, number][]; cornerRadius: number; open?: boolean }> = {
  'Chữ nhật': { points: [[100, 330], [980, 330], [980, 1600], [100, 1600]], cornerRadius: 150 },
  'Chữ nhật nhỏ': { points: [[180, 450], [900, 450], [900, 1450], [180, 1450]], cornerRadius: 130 },
  'Chữ L': { points: [[100, 330], [980, 330], [980, 1000], [640, 1000], [640, 1600], [100, 1600]], cornerRadius: 110 },
  'Chữ U': { points: [[100, 330], [400, 330], [400, 1150], [680, 1150], [680, 330], [980, 330], [980, 1600], [100, 1600]], cornerRadius: 90 },
  'Chữ T ngược': { points: [[340, 330], [740, 330], [740, 1050], [980, 1050], [980, 1600], [100, 1600], [100, 1050], [340, 1050]], cornerRadius: 90 },
  'Lục giác': { points: [[300, 330], [780, 330], [990, 960], [780, 1600], [300, 1600], [90, 960]], cornerRadius: 120 },
  'Chữ U hở 2 cổng': { points: [[120, 430], [960, 430], [960, 1500], [120, 1500]], cornerRadius: 150, open: true },
};

export function newLevel(id: number): LevelDef {
  return {
    id,
    name: `Màn ${id}`,
    status: 'WIP',
    category: '',
    pipe: { ...structuredClone(PIPE_PRESETS['Chữ nhật']), inlet: { s: 0 }, outlet: { s: 0.6 } },
    pipeSpeed: 265,
    slotLength: 95,
    fishPerUnit: 5,
    pipeLimit: 5,
    buses: [
      { x: 540, y: 600, rot: 0, capacity: 4, stack: ['red', 'red', 'blue', 'blue'], portS: null },
      { x: 540, y: 960, rot: 0, capacity: 4, stack: ['blue', 'blue', 'red', 'red'], portS: null },
      { x: 540, y: 1320, rot: 0, capacity: 4, stack: [], portS: null },
    ],
    spareSlots: [{ x: 540, y: 1460, rot: 0 }],
    boosters: { undo: 3, shuffle: 2, addBus: 1 },
    seed: id * 977,
  };
}

// ---------------- Xe chồng lên ống ----------------
/** khoảng hở tối thiểu giữa thân xe và mép ống (px) */
const PIPE_CLEAR = 12;
/** ảnh xe dọc dài hơn BUS_W một chút (đèn, cản) */
const VERT_EXTRA = 24;

/** xe (cỡ k) có đè lên ống không: lấy mẫu dọc viền thân xe, đo khoảng cách tới đường tâm ống */
export function busHitsPipe(path: PipePath, b: { x: number; y: number; rot: number }, k: number): boolean {
  const r = ((b.rot % 360) + 360) % 360;
  const v = r % 180 !== 0;
  const hw = ((v ? BUS_H : busLength(4)) / 2) * k;
  const hh = (((v ? busLength(4) + VERT_EXTRA * 2 : BUS_H)) / 2) * k;
  const lim = PIPE_HALF + PIPE_CLEAR;
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const xs = -hw + 2 * hw * t, ys = -hh + 2 * hh * t;
    const edge = [[xs, -hh], [xs, hh], [-hw, ys], [hw, ys]];
    for (const [dx, dy] of edge) if (distToPath(b.x + dx, b.y + dy, path.pts) < lim) return true;
  }
  return false;
}

// ---------------- Vị trí xe dự phòng tự động ----------------
type Box = { x: number; y: number; rot: number; capacity: number };

/** điểm (px,py) có nằm trong thân xe b (cỡ k) không */
function insideBus(px: number, py: number, b: Box, k: number) {
  const r = (b.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const dx = px - b.x, dy = py - b.y;
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  return Math.abs(lx) <= (busLength(4) / 2) * k && Math.abs(ly) <= (BUS_H / 2) * k;
}

/**
 * Xe (hoặc chỗ dự phòng) có nối thẳng được vào ống không: đi thẳng từ đuôi phải gặp ống,
 * không có xe khác chắn giữa, và không xa quá `maxDist`. Trả về khoảng cách đuôi → cổng, hoặc -1.
 */
export function straightPortDist(path: PipePath, cand: Box, k: number, others: Box[], maxDist = Infinity): number {
  const s = rayPortS(path, cand.x, cand.y, cand.rot, 4, k);
  if (s < 0) return -1;
  if (path.open && (s < 120 || s > path.length - 120)) return -1;
  const t = busTail(cand.x, cand.y, cand.rot, 4, k);
  const p = path.at(s);
  const d = Math.hypot(p.x - t.x, p.y - t.y);
  if (d > maxDist) return -1;
  for (let u = 8; u < d; u += 10) {
    const qx = t.x + ((p.x - t.x) * u) / d, qy = t.y + ((p.y - t.y) * u) / d;
    if (others.some((o) => o !== cand && insideBus(qx, qy, o, k))) return -1;
  }
  return d;
}
const PIPE_HALF = 50;

function pointInPoly(x: number, y: number, pts: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToPath(x: number, y: number, pts: { x: number; y: number }[]) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Tự tìm chỗ đỗ cho xe dự phòng (booster Thêm xe): nằm trong bãi, không đè lên ống / xe / chỗ dự phòng khác,
 * đuôi xe cách ống gần bằng các xe đang có, ưu tiên cùng chiều xoay với đa số xe. Trả về tối đa `count` chỗ.
 */
export function autoSpareSlots(level: LevelDef, count = 1): { x: number; y: number; rot: number }[] {
  const path = new PipePath(level.pipe);
  const pts = path.pts;
  const k = level.busScale ?? 1;
  const others: { x: number; y: number; rot: number; capacity: number }[] = [...level.buses, ...(level.spareSlots ?? []).map((s) => ({ ...s, capacity: 4 }))];
  // khoảng cách đuôi xe – ống "chuẩn" của level (trung vị các xe hiện có)
  const tails = level.buses.map((b) => {
    const t = busTail(b.x, b.y, b.rot, 4, k);
    const p = path.at(b.portS ?? autoPortS(path, b.x, b.y, b.rot, 4, k));
    return Math.hypot(p.x - t.x, p.y - t.y);
  }).sort((a, b) => a - b);
  const want = tails.length ? tails[Math.floor(tails.length / 2)] : 90;
  const rotCount = new Map<number, number>();
  for (const b of level.buses) rotCount.set(((b.rot % 360) + 360) % 360, (rotCount.get(((b.rot % 360) + 360) % 360) ?? 0) + 1);
  const mainRot = [...rotCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  // thẳng hàng với cột / hàng xe cùng chiều xoay (trung vị toạ độ)
  const median = (a: number[]) => (a.length ? [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)] : NaN);
  const align = (rot: number) => {
    const same = level.buses.filter((b) => ((b.rot % 360) + 360) % 360 === rot);
    return { x: median(same.map((b) => b.x)), y: median(same.map((b) => b.y)) };
  };
  const out: { x: number; y: number; rot: number }[] = [];
  for (let n = 0; n < count; n++) {
    let best: { x: number; y: number; rot: number; cost: number } | null = null;
    for (const rot of [mainRot, 0, 90, 270, 180].filter((r, i, a) => a.indexOf(r) === i)) {
      const vertical = rot % 180 !== 0;
      const hw = ((vertical ? BUS_H : busLength(4)) / 2) * k, hh = ((vertical ? busLength(4) : BUS_H) / 2) * k;
      for (let y = Math.min(...ys) + hh; y <= Math.max(...ys) - hh; y += 15) {
        for (let x = Math.min(...xs) + hw; x <= Math.max(...xs) - hw; x += 15) {
          const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh], [0, -hh], [0, hh], [-hw, 0], [hw, 0]];
          if (!corners.every(([dx, dy]) => pointInPoly(x + dx, y + dy, pts) && distToPath(x + dx, y + dy, pts) > PIPE_HALF + 14)) continue;
          const cand = { x, y, rot, capacity: 4 };
          if (others.some((o) => busesOverlap(cand, o, k * 1.08))) continue;
          if (busHitsPipe(path, cand, k)) continue;
          // phải nối thẳng được vào ống (không xe nào chắn, không xa hơn các xe khác quá nhiều)
          const d = straightPortDist(path, cand, k, others, want + 120);
          if (d < 0) continue;
          const al = align(rot);
          const vertical2 = rot % 180 !== 0;
          // xe ngang: thẳng cột (cùng x); xe dọc: thẳng hàng (cùng y)
          const off = vertical2 ? (Number.isNaN(al.y) ? 0 : Math.abs(y - al.y)) : Number.isNaN(al.x) ? 0 : Math.abs(x - al.x);
          const cost = Math.abs(d - want) + (rot === mainRot ? 0 : 40) + off * 0.6;
          if (!best || cost < best.cost) best = { x: Math.round(x / 5) * 5, y: Math.round(y / 5) * 5, rot, cost };
        }
      }
    }
    if (!best) break;
    out.push({ x: best.x, y: best.y, rot: best.rot });
    others.push({ x: best.x, y: best.y, rot: best.rot, capacity: 4 });
  }
  return out;
}

/**
 * Nền bãi: nếu mọi xe và chỗ dự phòng đều nằm trong vòng ống thì nền = lòng ống (null);
 * nếu có xe nằm ngoài ống thì nền = khung bo góc bao trùm ống + mọi xe (toạ độ thiết kế).
 */
export function boardRect(level: LevelDef, pad = 34): { x: number; y: number; w: number; h: number } | null {
  let path: PipePath;
  try {
    path = new PipePath(level.pipe);
  } catch {
    return null;
  }
  const k = level.busScale ?? 1;
  const boxes = [...level.buses, ...(level.spareSlots ?? []).map((s) => ({ ...s, capacity: 4 }))];
  const half = (b: { rot: number }) => {
    const v = ((b.rot % 360) + 360) % 360 % 180 !== 0;
    return { hw: ((v ? BUS_H : busLength(4)) / 2) * k, hh: ((v ? busLength(4) : BUS_H) / 2) * k };
  };
  const outside = boxes.some((b) => {
    const { hw, hh } = half(b);
    return ![[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].every(([dx, dy]) => pointInPoly(b.x + dx, b.y + dy, path.pts));
  });
  if (!outside) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of path.pts) {
    x0 = Math.min(x0, p.x - PIPE_HALF); y0 = Math.min(y0, p.y - PIPE_HALF);
    x1 = Math.max(x1, p.x + PIPE_HALF); y1 = Math.max(y1, p.y + PIPE_HALF);
  }
  for (const b of boxes) {
    const { hw, hh } = half(b);
    x0 = Math.min(x0, b.x - hw); y0 = Math.min(y0, b.y - hh);
    x1 = Math.max(x1, b.x + hw); y1 = Math.max(y1, b.y + hh);
  }
  x0 = Math.max(20, x0 - pad); y0 = Math.max(220, y0 - pad);
  x1 = Math.min(1060, x1 + pad); y1 = Math.min(1720, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

