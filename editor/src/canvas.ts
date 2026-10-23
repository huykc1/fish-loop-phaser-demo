import { PipePath, autoPortS } from '../../src/core/path';
import { BUS_H, BUS_W, TANK_H, TANK_W, busTail, tankOffset } from '../../src/core/geometry';
import { DESIGN_H, DESIGN_W, type FishColor, type LevelDef } from '../../src/core/types';
import { PALETTE } from '../../src/game/palette';
import { boardRect } from '../../src/core/levelUtil';

export type Tool = 'select' | 'pipe';
export type Selection = { kind: 'bus' | 'spare'; i: number } | null;

export interface CanvasHost {
    level(): LevelDef;
    tool(): Tool;
    brush(): FishColor | 'erase' | null;
    selection(): Selection;
    select(s: Selection): void;
    /** bắt đầu 1 thao tác kéo: chụp trạng thái để undo 1 bước khi thả */
    begin(): void;
    /** thay đổi trực tiếp (đang kéo, chưa ghi lịch sử) */
    live(fn: (lv: LevelDef) => void): void;
    /** kết thúc thao tác kéo */
    end(): void;
    /** thay đổi 1 bước (có undo) */
    commit(fn: (lv: LevelDef) => void): void;
}

export const ASSET = import.meta.env.DEV ? '/assets/' : './assets/';
type BusVMeta = Record<string, { trayCx: number; trayCy: number; w: number; h: number }>;
let busV: BusVMeta | null = null;
fetch(ASSET + 'bus_v.json')
    .then((r) => r.json())
    .then((j) => (busV = j))
    .catch(() => (busV = null));

/** nạp sẵn ảnh xe 1 lần (object URL) để vẽ lại khung không bị chớp */
const IMG: Record<string, string> = {};
for (const k of ['bus_body', 'bus_v_front', 'bus_v_rear'])
    fetch(`${ASSET}${k}.png`)
        .then((r) => r.blob())
        .then((b) => (IMG[k] = URL.createObjectURL(b)))
        .catch(() => undefined);
const img = (k: string) => IMG[k] ?? `${ASSET}${k}.png`;

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    parent?.appendChild(e);
    return e;
};
const norm = (r: number) => ((Math.round(r) % 360) + 360) % 360;
const snap = (v: number) => Math.round(v / 5) * 5;

/** vị trí tâm bể i so với tâm xe (dùng chung công thức với game) */
const tankOff = tankOffset;

/**
 * Khung thiết kế level bằng SVG (toạ độ 1080x1920 giống game).
 * V: chọn / kéo xe, kéo chấm cổng. P: sửa ống (kéo điểm, ⊕ thêm điểm, bấm đúp xoá điểm).
 * Có cọ màu: bấm vào bể để tô (0 = tẩy).
 */
export class LevelCanvas {
    readonly svg: SVGSVGElement;
    private drag: null | ((p: { x: number; y: number }) => void) = null;
    private path: PipePath | null = null;

    constructor(host: HTMLElement, private ctx: CanvasHost) {
        this.svg = el('svg', { viewBox: `0 0 ${DESIGN_W} ${DESIGN_H}`, preserveAspectRatio: 'xMidYMid meet', class: 'level-svg' });
        host.appendChild(this.svg);
        this.svg.addEventListener('pointermove', (e) => {
            if (!this.drag) return;
            this.drag(this.pt(e));
        });
        const up = () => {
            if (!this.drag) return;
            this.drag = null;
            this.ctx.end();
        };
        this.svg.addEventListener('pointerup', up);
        this.svg.addEventListener('pointerleave', up);
        this.svg.addEventListener('pointerdown', (e) => {
            if (e.target === this.svg || (e.target as Element).classList.contains('bg')) this.ctx.select(null);
        });
    }

    private pt(e: PointerEvent) {
        const m = this.svg.getScreenCTM()!.inverse();
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
        return { x: p.x, y: p.y };
    }

    private startDrag(e: PointerEvent, fn: (p: { x: number; y: number }) => void) {
        e.stopPropagation();
        this.svg.setPointerCapture(e.pointerId);
        this.ctx.begin();
        this.drag = fn;
    }

    render() {
        const lv = this.ctx.level();
        const svg = this.svg;
        svg.replaceChildren();
        el('rect', { x: 0, y: 0, width: DESIGN_W, height: DESIGN_H, fill: '#21b3d8', class: 'bg' }, svg);
        try {
            this.path = new PipePath(lv.pipe);
        } catch {
            this.path = null;
        }
        this.drawPipe(lv);
        (lv.spareSlots ?? []).forEach((sp, i) => this.drawSpare(lv, sp, i));
        lv.buses.forEach((_, i) => this.drawBus(lv, i));
        if (this.ctx.tool() === 'pipe') this.drawPipeHandles(lv);
    }

    private poly(pts: { x: number; y: number }[], closed: boolean) {
        return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('') + (closed ? 'Z' : '');
    }

    private drawPipe(lv: LevelDef) {
        const path = this.path;
        if (!path) return;
        const g = el('g', {}, this.svg);
        const d = this.poly(path.pts, !path.open);
        const rect = boardRect(lv);
        if (rect) el('rect', { x: rect.x, y: rect.y, width: rect.w, height: rect.h, rx: 44, fill: '#1b3f7e', class: 'bg' }, g);
        else el('path', { d: this.poly(path.pts, true), fill: '#1b3f7e', class: 'bg' }, g);
        el('path', { d, fill: 'none', stroke: '#3d7fe0', 'stroke-width': 120, 'stroke-linejoin': 'round', 'stroke-linecap': 'butt' }, g);
        el('path', { d, fill: 'none', stroke: '#bfeaff', 'stroke-width': 108, 'stroke-linejoin': 'round', 'stroke-linecap': 'butt' }, g);
        el('path', { d, fill: 'none', stroke: '#35a3f0', 'stroke-width': 90, 'stroke-linejoin': 'round', 'stroke-linecap': 'butt' }, g);
        // mũi tên chiều chảy
        const L = path.length;
        for (let s = 150; s < L - 60; s += 260) {
            const p = path.at(s);
            const a = (p.a * 180) / Math.PI;
            el('path', { d: 'M-14,-16 L12,0 L-14,16', fill: 'none', stroke: '#ffffff', 'stroke-width': 7, opacity: 0.6, transform: `translate(${p.x},${p.y}) rotate(${a})` }, g);
        }
        if (path.open) {
            for (const [s, out] of [[0, -1], [L - 0.01, 1]] as const) {
                const p = path.at(s);
                const a = (p.a * 180) / Math.PI;
                el('rect', { x: out > 0 ? 0 : -40, y: -80, width: 40, height: 160, rx: 12, fill: '#6f5ee6', transform: `translate(${p.x},${p.y}) rotate(${a})` }, g);
            }
        }
        // sức chứa ống
        const C = Math.floor(L / lv.slotLength);
        const t = el('text', { x: DESIGN_W / 2, y: 60, 'text-anchor': 'middle', 'font-size': 34, fill: '#ffffff', opacity: 0.85 }, g);
        t.textContent = `Ống: ${Math.round(L)}px · sức chứa ${C} nấc · N = ${lv.pipeLimit ?? 5}`;
    }

    private drawSpare(lv: LevelDef, sp: { x: number; y: number; rot: number }, i: number) {
        const k = lv.busScale ?? 1;
        const vertical = norm(sp.rot) % 180 !== 0;
        const w = (vertical ? BUS_H : BUS_W) * k, h = (vertical ? BUS_W : BUS_H) * k;
        const sel = this.ctx.selection();
        const on = sel?.kind === 'spare' && sel.i === i;
        const g = el('g', { transform: `translate(${sp.x},${sp.y})`, class: 'pick' }, this.svg);
        el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 30 * k, fill: 'rgba(255,255,255,0.08)', stroke: on ? '#ef7d1a' : '#c9d3ff', 'stroke-width': on ? 8 : 5, 'stroke-dasharray': '24 16' }, g);
        const t = el('text', { x: 0, y: 12, 'text-anchor': 'middle', 'font-size': 36, fill: '#e8ecff' }, g);
        t.textContent = `dự phòng ${i + 1}`;
        g.addEventListener('pointerdown', (e) => {
            if (this.ctx.tool() !== 'select') return;
            this.ctx.select({ kind: 'spare', i });
            const o = this.pt(e);
            const x0 = sp.x, y0 = sp.y;
            this.startDrag(e, (p) =>
                this.ctx.live((lv2) => {
                    const s2 = lv2.spareSlots![i];
                    s2.x = snap(x0 + p.x - o.x);
                    s2.y = snap(y0 + p.y - o.y);
                }),
            );
        });
    }

    private drawBus(lv: LevelDef, i: number) {
        const b = lv.buses[i];
        const k = lv.busScale ?? 1;
        const rot = norm(b.rot);
        const vertical = rot === 90 || rot === 270;
        const sel = this.ctx.selection();
        const on = sel?.kind === 'bus' && sel.i === i;
        const g = el('g', { transform: `translate(${b.x},${b.y}) scale(${k})`, class: 'pick' }, this.svg);

        // thân xe: ảnh giống game
        const a = tankOff(rot, 0), z = tankOff(rot, 3);
        const cx = (a.x + z.x) / 2, cy = (a.y + z.y) / 2;
        if (vertical && busV) {
            const key = rot === 90 ? 'bus_v_rear' : 'bus_v_front';
            const m = busV[key];
            el('image', { href: img(key), x: cx - m.trayCx, y: cy - m.trayCy, width: m.w, height: m.h }, g);
        } else {
            const body = el('image', { href: img('bus_body'), x: -BUS_W / 2, y: -BUS_H / 2, width: BUS_W, height: BUS_H }, g);
            if (rot === 180) body.setAttribute('transform', 'scale(-1,1)');
        }
        // bể
        for (let t = 0; t < b.capacity; t++) {
            const o = tankOff(rot, t);
            const c = b.stack[t];
            const sy = vertical ? 0.93 : 1;
            const r = el('rect', {
                x: o.x - TANK_W / 2, y: o.y - (TANK_H * sy) / 2, width: TANK_W, height: TANK_H * sy, rx: 18,
                fill: c ? PALETTE[c].css : 'rgba(40,30,120,0.85)', stroke: c ? '#ffffff' : 'rgba(255,255,255,0.55)', 'stroke-width': 4, class: 'tank',
            }, g);
            r.addEventListener('pointerdown', (e) => {
                const brush = this.ctx.brush();
                if (!brush || this.ctx.tool() !== 'select') return;
                e.stopPropagation();
                this.ctx.select({ kind: 'bus', i });
                this.ctx.commit((lv2) => {
                    const st = lv2.buses[i].stack;
                    if (brush === 'erase') {
                        if (t < st.length) st.splice(t, 1);
                    } else if (t < st.length) st[t] = brush;
                    else st.push(brush);
                });
            });
        }
        // số thứ tự xe
        const badge = el('g', { transform: `translate(${vertical ? 0 : -BUS_W / 2 + 40},${vertical ? -BUS_W / 2 + 10 : -BUS_H / 2 + 6})` }, g);
        el('circle', { r: 26, fill: on ? '#ef7d1a' : '#141210', opacity: 0.85 }, badge);
        const tx = el('text', { y: 11, 'text-anchor': 'middle', 'font-size': 30, 'font-weight': 700, fill: '#fff' }, badge);
        tx.textContent = String(i + 1);
        if (on) {
            const w = vertical ? BUS_H : BUS_W, h = vertical ? BUS_W : BUS_H;
            el('rect', { x: -w / 2 - 10, y: -h / 2 - 10, width: w + 20, height: h + 20, rx: 36, fill: 'none', stroke: '#ef7d1a', 'stroke-width': 8 / Math.max(0.4, k) }, g);
        }
        g.addEventListener('pointerdown', (e) => {
            if (this.ctx.tool() !== 'select') return;
            this.ctx.select({ kind: 'bus', i });
            const o = this.pt(e);
            const x0 = b.x, y0 = b.y;
            this.startDrag(e, (p) =>
                this.ctx.live((lv2) => {
                    lv2.buses[i].x = snap(x0 + p.x - o.x);
                    lv2.buses[i].y = snap(y0 + p.y - o.y);
                }),
            );
        });
        this.drawPort(lv, i, on);
    }

    /** chấm cổng trên ống: xanh = tự động, vàng = đặt tay; kéo dọc ống để đặt */
    private drawPort(lv: LevelDef, i: number, on: boolean) {
        const path = this.path;
        if (!path) return;
        const b = lv.buses[i];
        const k = lv.busScale ?? 1;
        const tail = busTail(b.x, b.y, b.rot, b.capacity, k);
        const manual = b.portS !== null && b.portS !== undefined;
        const s = manual ? (b.portS as number) : autoPortS(path, b.x, b.y, b.rot, b.capacity, k);
        const p = path.at(s);
        el('line', { x1: tail.x, y1: tail.y, x2: p.x, y2: p.y, stroke: manual ? '#ffd23a' : '#7cf08a', 'stroke-width': on ? 6 : 3, 'stroke-dasharray': '10 8', opacity: on ? 1 : 0.6 }, this.svg);
        const dot = el('circle', { cx: p.x, cy: p.y, r: on ? 22 : 15, fill: manual ? '#ffd23a' : '#3fd94a', stroke: '#14181f', 'stroke-width': 4, class: 'pick' }, this.svg);
        dot.addEventListener('pointerdown', (e) => {
            if (this.ctx.tool() !== 'select') return;
            this.ctx.select({ kind: 'bus', i });
            this.startDrag(e, (q) => this.ctx.live((lv2) => (lv2.buses[i].portS = Math.round(path.nearestS(q.x, q.y)))));
        });
    }

    /** P: điểm ống (vàng = điểm bắt đầu), ⊕ giữa 2 điểm để thêm, bấm đúp để xoá */
    private drawPipeHandles(lv: LevelDef) {
        const P = lv.pipe.points;
        const n = P.length;
        const open = !!lv.pipe.open;
        const segs = open ? n - 1 : n;
        for (let i = 0; i < segs; i++) {
            const [ax, ay] = P[i], [bx, by] = P[(i + 1) % n];
            const mx = (ax + bx) / 2, my = (ay + by) / 2;
            const add = el('g', { transform: `translate(${mx},${my})`, class: 'pick' }, this.svg);
            el('circle', { r: 20, fill: '#141210', stroke: '#ffffff', 'stroke-width': 3, opacity: 0.85 }, add);
            el('path', { d: 'M-10,0H10M0,-10V10', stroke: '#fff', 'stroke-width': 4 }, add);
            add.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                this.ctx.commit((lv2) => lv2.pipe.points.splice(i + 1, 0, [Math.round(mx), Math.round(my)]));
            });
        }
        P.forEach(([x, y], i) => {
            const h = el('circle', { cx: x, cy: y, r: 26, fill: i === 0 ? '#ffd23a' : '#ffffff', stroke: '#ef7d1a', 'stroke-width': 6, class: 'pick' }, this.svg);
            h.addEventListener('pointerdown', (e) => {
                const o = this.pt(e);
                this.startDrag(e, (p) =>
                    this.ctx.live((lv2) => {
                        lv2.pipe.points[i] = [snap(x + p.x - o.x), snap(y + p.y - o.y)];
                    }),
                );
            });
            h.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (P.length <= (open ? 2 : 3)) return;
                this.ctx.commit((lv2) => lv2.pipe.points.splice(i, 1));
            });
        });
    }
}
