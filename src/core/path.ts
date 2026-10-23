import type { PipeDef } from './types';
import { busTail } from './geometry';

export interface PathSample {
  x: number;
  y: number;
  /** góc tiếp tuyến (rad) */
  a: number;
}

/**
 * Đường ống: đa giác khép kín được bo góc, lấy mẫu dày thành polyline
 * để tra vị trí theo chiều dài (arc-length) nhanh.
 * Ống hở (`open`): không có đoạn từ điểm cuối về điểm đầu; s chạy 0..L rồi quay về 0 (qua cổng tức thì).
 */
export class PipePath {
  readonly pts: { x: number; y: number }[] = [];
  readonly cum: number[] = [];
  readonly length: number;
  readonly open: boolean;

  constructor(def: PipeDef, step = 6) {
    const P = def.points;
    const n = P.length;
    this.open = !!def.open;
    if (n < (this.open ? 2 : 3)) throw new Error(this.open ? 'Ống hở cần ít nhất 2 điểm' : 'Pipe cần ít nhất 3 điểm');
    const out: { x: number; y: number }[] = [];
    // tính điểm tiếp tuyến của cung bo cho mỗi đỉnh
    const corners = P.map((_, i) => {
      const [px, py] = P[(i - 1 + n) % n];
      const [cx, cy] = P[i];
      const [nx, ny] = P[(i + 1) % n];
      const v1x = px - cx, v1y = py - cy;
      const v2x = nx - cx, v2y = ny - cy;
      const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      const u1x = v1x / l1, u1y = v1y / l1, u2x = v2x / l2, u2y = v2y / l2;
      const cos = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
      const ang = Math.acos(cos); // góc trong
      let r = def.cornerRadius;
      const end = this.open && (i === 0 || i === n - 1); // 2 đầu ống hở không bo
      let d = !end && ang > 1e-3 && ang < Math.PI - 1e-3 ? r / Math.tan(ang / 2) : 0;
      const maxD = Math.min(l1, l2) * 0.5;
      if (d > maxD) {
        d = maxD;
        r = d * Math.tan(ang / 2);
      }
      return {
        a: { x: cx + u1x * d, y: cy + u1y * d }, // điểm vào cung
        b: { x: cx + u2x * d, y: cy + u2y * d }, // điểm ra cung
        c: { x: cx, y: cy },
        d,
      };
    });
    for (let i = 0; i < n; i++) {
      const k = corners[i];
      if (k.d <= 0) {
        out.push(k.c);
      } else {
        // bezier bậc 2 qua đỉnh ~ cung tròn, đủ mượt cho game
        const segs = Math.max(6, Math.ceil((k.d * 2) / step));
        for (let j = 0; j <= segs; j++) {
          const t = j / segs, it = 1 - t;
          out.push({
            x: it * it * k.a.x + 2 * it * t * k.c.x + t * t * k.b.x,
            y: it * it * k.a.y + 2 * it * t * k.c.y + t * t * k.b.y,
          });
        }
      }
      // đoạn thẳng tới điểm vào cung kế tiếp
      if (this.open && i === n - 1) break;
      const nxt = corners[(i + 1) % n];
      const from = k.d > 0 ? k.b : k.c;
      const to = nxt.d > 0 ? nxt.a : nxt.c;
      const len = Math.hypot(to.x - from.x, to.y - from.y);
      const segs = Math.floor(len / step);
      for (let j = 1; j < segs; j++) {
        const t = j / segs;
        out.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      }
    }
    // loại điểm trùng
    for (const p of out) {
      const last = this.pts[this.pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.01) this.pts.push(p);
    }
    let acc = 0;
    const segs = this.open ? this.pts.length - 1 : this.pts.length;
    for (let i = 0; i < this.pts.length; i++) {
      this.cum.push(acc);
      if (i >= segs) break;
      const a = this.pts[i], b = this.pts[(i + 1) % this.pts.length];
      acc += Math.hypot(b.x - a.x, b.y - a.y);
    }
    this.length = acc;
  }

  wrap(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  at(s: number, out: PathSample = { x: 0, y: 0, a: 0 }): PathSample {
    s = this.wrap(s);
    // binary search
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const a = this.pts[lo], b = this.pts[(lo + 1) % this.pts.length];
    const segLen = (lo + 1 < this.cum.length ? this.cum[lo + 1] : this.length) - this.cum[lo];
    const t = segLen > 0 ? (s - this.cum[lo]) / segLen : 0;
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.a = Math.atan2(b.y - a.y, b.x - a.x);
    return out;
  }

  /** chiều dài s của điểm trên ống gần (x,y) nhất */
  nearestS(x: number, y: number): number {
    let best = Infinity, bestS = 0;
    const segs = this.open ? this.pts.length - 1 : this.pts.length;
    for (let i = 0; i < segs; i++) {
      const a = this.pts[i], b = this.pts[(i + 1) % this.pts.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
      const px = a.x + dx * t, py = a.y + dy * t;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < best) {
        best = d;
        bestS = this.cum[i] + Math.sqrt(l2) * t;
      }
    }
    return bestS;
  }
}

/** điểm gặp ống khi đi thẳng theo hướng đuôi xe; -1 nếu hướng đó không gặp ống */
export function rayPortS(path: PipePath, x: number, y: number, rot: number, capacity: number, scale = 1): number {
  const t = busTail(x, y, rot, capacity, scale);
  const r = (rot * Math.PI) / 180;
  const dx = Math.cos(r), dy = Math.sin(r);
  const P = path.pts, n = P.length;
  const segs = path.open ? n - 1 : n;
  let best = Infinity, bestS = -1;
  for (let i = 0; i < segs; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    // t + u*d = a + v*e  →  khoảng cách u dọc tia, v trên đoạn
    const ax = a.x - t.x, ay = a.y - t.y;
    const u = (ax * ey - ay * ex) / den;
    const v = (ax * dy - ay * dx) / den;
    if (u >= 0 && v >= 0 && v <= 1 && u < best) {
      best = u;
      bestS = path.cum[i] + Math.hypot(ex, ey) * v;
    }
  }
  return bestS >= 0 ? path.wrap(bestS) : -1;
}

/**
 * Cổng tự động của xe: đi thẳng theo hướng đuôi xe cho tới khi gặp ống (cá ra thẳng từ đuôi);
 * nếu hướng đó không gặp ống thì lấy điểm ống gần đuôi xe nhất.
 */
export function autoPortS(path: PipePath, x: number, y: number, rot: number, capacity: number, scale = 1): number {
  const s = rayPortS(path, x, y, rot, capacity, scale);
  if (s >= 0) return s;
  const t = busTail(x, y, rot, capacity, scale);
  return path.nearestS(t.x, t.y);
}

