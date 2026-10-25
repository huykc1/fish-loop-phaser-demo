import * as Phaser from 'phaser';
import type { Sim } from '../core/sim';
import type { FishColor, SimEvent } from '../core/types';
import { BUS_W, busTail } from '../core/geometry';
import { BusView, busBodyImage, tankOffset } from './BusView';
import { DEPTH, FISH_FLY_SCALE, FISH_PIPE_SCALE, PIPE_W } from './layout';
import { boardRect } from '../core/levelUtil';
import { PALETTE } from './palette';

interface Flyer {
    imgs: Phaser.GameObjects.Image[];
    t: number;
    dur: number;
    from: () => { x: number; y: number };
    to: () => { x: number; y: number };
    arc: number;
    done?: () => void;
}

interface Mover {
    img: Phaser.GameObjects.Image;
    s: number;
    lat: number;
    v: number;
}

type Pt = { x: number; y: number };
/** Graphics nhận Vector2[], nhưng chỉ đọc x/y */
const v2 = (p: Pt[]) => p as unknown as Phaser.Math.Vector2[];

/**
 * Board: vẽ bãi đỗ, ống nước, cá, xe và mọi hiệu ứng từ trạng thái Sim.
 * Không chứa luật chơi – chỉ đọc sim và sự kiện.
 */
export class Board {
    readonly views: BusView[] = [];
    private objs: Phaser.GameObjects.GameObject[] = [];
    private fishPool: Phaser.GameObjects.Image[] = [];
    private ripples: Mover[] = [];
    private streaks: Mover[] = [];
    private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
    private trailT = 0;
    private shimmer?: Phaser.GameObjects.Image;
    private bubbles: Mover[] = [];
    private flyers: Flyer[] = [];
    private hiddenSlots = new Map<number, number>();
    private checks = new Map<number, Phaser.GameObjects.Image>();
    private spareGhosts: Phaser.GameObjects.GameObject[][] = [];
    private danger: Phaser.GameObjects.Graphics;
    private splash: Phaser.GameObjects.Particles.ParticleEmitter;
    private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
    private stars: Phaser.GameObjects.Particles.ParticleEmitter;
    private foam: Phaser.GameObjects.Particles.ParticleEmitter;
    private time = 0;
    private tmp = { x: 0, y: 0, a: 0 };
    quality: 'high' | 'low' = 'high';
    /** cỡ xe của level */
    private readonly scale: number;

    constructor(private scene: Phaser.Scene, private sim: Sim, private onTap: (id: number) => void) {
        this.scale = sim.level.busScale ?? 1;
        this.drawFloor();
        this.drawPipe();
        this.danger = this.track(scene.add.graphics().setDepth(DEPTH.danger).setAlpha(0));
        this.strokePath(this.danger, PIPE_W + 10, 0xff3b3b, 0.9);
        this.drawProps();
        this.drawGates();
        this.drawSpares();

        const L = sim.L;
        const nr = Math.round(L / 110);
        for (let i = 0; i < nr; i++) {
            const img = this.track(scene.add.image(0, 0, 'ripple').setDepth(DEPTH.ripples).setBlendMode(Phaser.BlendModes.ADD));
            img.setAlpha(0.14 + ((i * 13) % 7) / 50).setScale(0.45 + ((i * 7) % 5) / 12, 0.7);
            this.ripples.push({ img, s: (i / nr) * L, lat: (((i * 31) % 11) / 11 - 0.5) * 70, v: 1.15 + ((i * 17) % 5) / 10 });
        }
        // đốm sáng mềm trôi theo dòng nước (tròn, không xoay nên qua góc vẫn mượt)
        const ns = Math.round(L / 34);
        for (let i = 0; i < ns; i++) {
            const img = this.track(scene.add.image(0, 0, 'glow').setDepth(DEPTH.ripples + 0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0xe6fbff));
            const sc = 0.18 + ((i * 7) % 6) / 30;
            img.setScale(sc * 1.6, sc);
            this.streaks.push({ img, s: ((i * 0.618) % 1) * L, lat: (((i * 37) % 17) / 17 - 0.5) * (PIPE_W - 30), v: 1.05 + ((i * 13) % 7) / 14 });
        }
        this.drawPipeShimmer();
        this.trail = this.track(
            scene.add.particles(0, 0, 'bubble', {
                emitting: false,
                speed: { min: 10, max: 40 },
                lifespan: { min: 350, max: 700 },
                scale: { start: 0.32, end: 0.05 },
                alpha: { start: 0.85, end: 0 },
            }),
        ).setDepth(DEPTH.pipeBubbles);
        const nb = Math.round(L / 70);
        for (let i = 0; i < nb; i++) {
            const img = this.track(scene.add.image(0, 0, 'bubble').setDepth(DEPTH.pipeBubbles));
            img.setScale(0.25 + ((i * 37) % 10) / 30).setAlpha(0.8);
            this.bubbles.push({ img, s: (i / nb) * L, lat: (((i * 53) % 13) / 13 - 0.5) * 72, v: 0.55 + ((i * 17) % 7) / 10 });
        }

        this.splash = this.track(
            scene.add.particles(0, 0, 'drop', {
                emitting: false,
                speed: { min: 140, max: 360 },
                angle: { min: 200, max: 340 },
                gravityY: 1100,
                lifespan: { min: 380, max: 620 },
                scale: { start: 0.75, end: 0.25 },
                alpha: { start: 1, end: 0 },
                rotate: { min: -40, max: 40 },
            }),
        ).setDepth(DEPTH.fx);
        this.sparks = this.track(
            scene.add.particles(0, 0, 'sparkle', {
                emitting: false,
                speed: { min: 180, max: 520 },
                lifespan: { min: 450, max: 900 },
                scale: { start: 1.1, end: 0 },
                alpha: { start: 1, end: 0 },
                rotate: { min: 0, max: 360 },
                tint: [0xffffff, 0xfff1a0, 0xffd34a],
                blendMode: Phaser.BlendModes.ADD,
            }),
        ).setDepth(DEPTH.fx);
        this.stars = this.track(
            scene.add.particles(0, 0, 'star', {
                emitting: false,
                speed: { min: 220, max: 600 },
                angle: { min: 200, max: 340 },
                gravityY: 900,
                lifespan: { min: 700, max: 1100 },
                scale: { start: 0.55, end: 0.15 },
                rotate: { start: 0, end: 360 },
                tint: [0xffe14d, 0xffffff, 0xffb02e],
            }),
        ).setDepth(DEPTH.fx);
        this.foam = this.track(
            scene.add.particles(0, 0, 'bubble', {
                emitting: false,
                speed: { min: 30, max: 140 },
                gravityY: -260,
                lifespan: { min: 500, max: 1000 },
                scale: { start: 0.55, end: 0.15 },
                alpha: { start: 0.95, end: 0 },
            }),
        ).setDepth(DEPTH.fx);

        this.syncBuses();
        this.intro();
    }

    private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
        this.objs.push(o);
        return o;
    }

    // ---------------- Vẽ tĩnh ----------------
    private pts(): Pt[] {
        return this.sim.path.pts;
    }

    private offsetPts(d: number): Pt[] {
        const P = this.pts(), n = P.length, open = this.sim.path.open;
        return P.map((p, i) => {
            const a = open && i === 0 ? p : P[(i - 1 + n) % n];
            const b = open && i === n - 1 ? p : P[(i + 1) % n];
            const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
            return { x: p.x - (dy / l) * d, y: p.y + (dx / l) * d };
        });
    }

    private strokePath(g: Phaser.GameObjects.Graphics, w: number, color: number, alpha: number, pts = this.pts()) {
        g.lineStyle(w, color, alpha);
        g.strokePoints(v2(pts), !this.sim.path.open, !this.sim.path.open);
        // bo tròn chỗ nối các đoạn ngắn
        g.fillStyle(color, alpha);
        for (let i = 0; i < pts.length; i += 6) g.fillCircle(pts[i].x, pts[i].y, w / 2 - 0.5);
    }

    private drawFloor() {
        const s = this.scene;
        const g = this.track(s.add.graphics().setDepth(DEPTH.floor));
        const P = this.pts();
        const rect = boardRect(this.sim.level);
        this.floorRect = rect;
        if (rect) {
            // có xe nằm ngoài ống: nền là khung bo góc bao trùm ống + xe
            const r = 44;
            g.fillStyle(0x0f3c6e, 0.45);
            g.fillRoundedRect(rect.x + 6, rect.y + 16, rect.w, rect.h, r);
            g.fillStyle(0x1b3f7e, 1);
            g.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, r);
            g.lineStyle(10, 0x2f63a6, 0.9);
            g.strokeRoundedRect(rect.x + 8, rect.y + 8, rect.w - 16, rect.h - 16, r - 8);
            g.fillStyle(0x16366f, 0.85);
            g.fillRoundedRect(rect.x + 18, rect.y + 18, rect.w - 36, rect.h - 36, r - 14);
            this.drawFloorWater();
            return;
        }
        g.fillStyle(0x0f3c6e, 0.45);
        g.fillPoints(v2(this.offsetPts(-14).map((p) => ({ x: p.x + 6, y: p.y + 16 }))), true);
        // bãi xe: xanh dương đậm như ảnh mẫu, viền trong sáng hơn, lòng bãi tối dần vào giữa
        g.fillStyle(0x1b3f7e, 1);
        g.fillPoints(v2(P), true);
        const inner = this.offsetPts(PIPE_W / 2 + 26);
        g.lineStyle(10, 0x2f63a6, 0.9);
        g.strokePoints(v2(inner), true, true);
        g.fillStyle(0x16366f, 0.85);
        g.fillPoints(v2(this.offsetPts(PIPE_W / 2 + 40)), true);
        this.drawFloorWater();
    }

    /** vân sáng lấp lánh trong lòng ống: vân caustics của nền, chỉ hiện trong ống */
    private drawPipeShimmer() {
        const s = this.scene;
        if (!s.textures.exists('caustics')) return;
        if (s.textures.exists('pipeMask')) s.textures.remove('pipeMask');
        const tex = s.textures.createCanvas('pipeMask', 1080, 1920);
        if (!tex) return;
        const c = tex.getContext();
        const pts = this.pts();
        c.strokeStyle = '#fff';
        c.lineWidth = PIPE_W - 14;
        c.lineJoin = 'round';
        c.filter = 'blur(3px)';
        c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        if (!this.sim.path.open) c.closePath();
        c.stroke();
        tex.refresh();
        const img = this.track(
            s.add.image(540, 960, 'caustics').setDisplaySize(1080, 1920).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fe2ff).setAlpha(0.38).setDepth(DEPTH.pipeWater + 0.5),
        );
        img.enableFilters();
        img.filters!.internal.addMask('pipeMask');
        this.shimmer = img;
    }

    /** sóng nước trên mặt bãi: vân sáng (caustics) của nền, chỉ hiện trong lòng bãi */
    private floorWater?: Phaser.GameObjects.Image;
    private floorRect: { x: number; y: number; w: number; h: number } | null = null;
    private drawFloorWater() {
        const s = this.scene;
        if (!s.textures.exists('caustics')) return;
        if (s.textures.exists('floorMask')) s.textures.remove('floorMask');
        const tex = s.textures.createCanvas('floorMask', 1080, 1920);
        if (!tex) return;
        const c = tex.getContext();
        c.fillStyle = '#fff';
        c.filter = 'blur(10px)';
        c.beginPath();
        const rect = this.floorRect;
        if (rect) c.roundRect(rect.x + 18, rect.y + 18, rect.w - 36, rect.h - 36, 30);
        else {
            const pts = this.offsetPts(PIPE_W / 2 + 18);
            pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
            c.closePath();
        }
        c.fill();
        tex.refresh();
        const img = this.track(
            s.add.image(540, 960, 'caustics').setDisplaySize(1080, 1920).setBlendMode(Phaser.BlendModes.ADD).setTint(0x6fb8ff).setAlpha(0.22).setDepth(DEPTH.floor + 0.5),
        );
        img.enableFilters();
        img.filters!.internal.addMask('floorMask');
        this.floorWater = img;
    }

    private drawPipe() {
        const s = this.scene;
        const shadow = this.track(s.add.graphics().setDepth(DEPTH.pipeShadow));
        this.strokePath(shadow, PIPE_W + 22, 0x062a5c, 0.35, this.pts().map((p) => ({ x: p.x + 4, y: p.y + 12 })));
        const glass = this.track(s.add.graphics().setDepth(DEPTH.pipeGlass));
        this.strokePath(glass, PIPE_W + 20, 0x3d7fe0, 1);
        this.strokePath(glass, PIPE_W + 12, 0xbfeaff, 1);
        this.strokePath(glass, PIPE_W + 2, 0xeafbff, 1);
        const water = this.track(s.add.graphics().setDepth(DEPTH.pipeWater));
        this.strokePath(water, PIPE_W - 8, 0x35a3f0, 1);
        this.strokePath(water, PIPE_W - 30, 0x4cb8fa, 0.9);
        this.strokePath(water, PIPE_W - 62, 0x7fd3ff, 0.45);
        const shine = this.track(s.add.graphics().setDepth(DEPTH.pipeShine));
        shine.lineStyle(8, 0xffffff, 0.6);
        shine.strokePoints(v2(this.offsetPts(-PIPE_W / 2 + 10)), !this.sim.path.open, !this.sim.path.open);
        shine.lineStyle(4, 0xffffff, 0.35);
        shine.strokePoints(v2(this.offsetPts(PIPE_W / 2 - 9)), !this.sim.path.open, !this.sim.path.open);
        // khớp nối: chỉ đặt trên đoạn thẳng (bỏ qua chỗ ống đang uốn)
        const L = this.sim.L;
        const k = Math.max(4, Math.round(L / 640));
        const q = { x: 0, y: 0, a: 0 };
        for (let i = 0; i < k; i++) {
            let sAt = (i / k) * L + 160;
            for (let tries = 0; tries < 40; tries++) {
                const a0 = this.sim.path.at(sAt - 40, q).a, a1 = this.sim.path.at(sAt + 40, q).a;
                if (Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))) < 0.02) break;
                sAt += 25;
            }
            if (this.sim.path.open && (sAt < 140 || sAt > L - 140)) continue;
            const p = this.sim.path.at(sAt);
            this.track(s.add.image(p.x, p.y, 'joint').setRotation(p.a).setDepth(DEPTH.joints).setAlpha(0.95));
        }
    }

    /** 2 cổng ở đầu ống hở: cá chui vào cổng cuối, ra ở cổng đầu */
    private gates: Pt[] = [];
    private drawGates() {
        const path = this.sim.path;
        if (!path.open) return;
        const s = this.scene;
        const ends = [
            { at: path.at(0), out: -1 },
            { at: path.at(path.length - 0.01), out: 1 },
        ];
        for (const e of ends) {
            const { x, y, a } = e.at;
            const ox = Math.cos(a) * e.out, oy = Math.sin(a) * e.out;
            this.track(s.add.image(x + ox * 6, y + oy * 6, 'gateHole').setRotation(a).setDepth(DEPTH.pipeShine + 0.5).setAlpha(0.9));
            this.track(s.add.image(x + ox * 22, y + oy * 22, 'gate').setRotation(a).setDepth(DEPTH.joints + 0.5));
            this.gates.push({ x: x - ox * 10, y: y - oy * 10 });
            // xoáy nước nhẹ ở miệng cổng
            this.track(
                s.add.particles(x - ox * 14, y - oy * 14, 'bubble', {
                    x: { min: -6, max: 6 },
                    y: { min: -30, max: 30 },
                    speedX: { min: -40 * ox - 20, max: -40 * ox + 20 },
                    speedY: { min: -40 * oy - 20, max: -40 * oy + 20 },
                    lifespan: 600,
                    frequency: 160,
                    scale: { start: 0.4, end: 0.1 },
                    alpha: { start: 0.8, end: 0 },
                }),
            ).setDepth(DEPTH.pipeBubbles);
        }
    }

    private drawProps() {
        const s = this.scene;
        const lv = this.sim.level;
        const xs = lv.pipe.points.map((p) => p[0]), ys = lv.pipe.points.map((p) => p[1]);
        const top = Math.min(...ys), left = Math.min(...xs);
        // ống thoát gắn dưới đỉnh xa nhất bên phải (nếu nhiều đỉnh cùng x thì lấy đỉnh thấp nhất)
        const right = Math.max(...xs);
        const corner = lv.pipe.points.filter((p) => p[0] === right).reduce((a, b) => (b[1] > a[1] ? b : a));
        if (lv.pipe.inlet && !lv.pipe.open) {
            // ống cấp nước ở góc trên trái, dòng nước đổ vào ống
            const ox = left - 92, oy = top - 330;
            this.track(s.add.image(ox, oy, 'inlet_pipe').setOrigin(0, 0).setDepth(DEPTH.props));
            const mouth = { x: ox + 150, y: oy + 262 };
            this.track(
                s.add.particles(mouth.x, mouth.y, 'drop', {
                    speedX: { min: 60, max: 120 },
                    speedY: { min: 40, max: 90 },
                    gravityY: 500,
                    lifespan: 380,
                    frequency: 45,
                    scale: { start: 0.55, end: 0.2 },
                    alpha: { start: 0.9, end: 0 },
                }),
            ).setDepth(DEPTH.props + 0.1);
            this.track(
                s.add.particles(mouth.x + 40, mouth.y + 70, 'bubble', {
                    x: { min: -30, max: 30 },
                    speedY: { min: -40, max: -100 },
                    lifespan: 600,
                    frequency: 110,
                    scale: { start: 0.45, end: 0.1 },
                    alpha: { start: 0.9, end: 0 },
                }),
            ).setDepth(DEPTH.props + 0.1);
        }
        if (lv.pipe.outlet && !lv.pipe.open) {
            const ox = corner[0] - 112, oy = corner[1] + 30;
            this.track(s.add.image(ox, oy, 'outlet_pipe').setOrigin(0, 0).setDepth(DEPTH.props));
            this.track(
                s.add.particles(ox + 80, oy + 210, 'bubble', {
                    x: { min: -40, max: 40 },
                    speedY: { min: -60, max: -150 },
                    lifespan: { min: 500, max: 900 },
                    frequency: 140,
                    scale: { start: 0.2, end: 0.65 },
                    alpha: { start: 0.9, end: 0 },
                }),
            ).setDepth(DEPTH.props + 0.1);
        }
    }

    private drawSpares() {
        const s = this.scene;
        for (const sp of this.sim.level.spareSlots ?? []) {
            const k = this.scale;
            // bóng mờ đúng chiều xe sẽ chạy vào (lật ngang / ảnh xe dọc giống xe thật)
            const body = busBodyImage(s, sp.rot).setAlpha(0.22).setTint(0x8fa0ff);
            const ghost = this.track(s.add.container(sp.x, sp.y, [body]).setScale(k).setDepth(DEPTH.spare));
            const vertical = ((sp.rot % 360) + 360) % 360 % 180 !== 0;
            // biển trạm: xe ngang đặt ở đầu xe, xe dọc đặt ngay phía trên chỗ đỗ (không chen vào khe giữa các xe)
            const sign = vertical
                ? this.track(s.add.image(sp.x, sp.y - (BUS_W / 2 - 40) * k, 'bus_stop').setScale(0.6 * k).setDepth(DEPTH.spare + 0.1))
                : this.track(s.add.image(sp.x - (BUS_W / 2 - 10) * k, sp.y - 30 * k, 'bus_stop').setScale(0.75 * k).setDepth(DEPTH.spare + 0.1));
            s.tweens.add({ targets: body, alpha: 0.34, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.spareGhosts.push([ghost, sign]);
        }
    }

    private intro() {
        this.views.forEach((v, i) => {
            const y = v.y;
            v.y = y - 220;
            v.setAlpha(0);
            this.scene.tweens.add({ targets: v, y, alpha: 1, delay: 120 + i * 90, duration: 520, ease: 'Back.easeOut', easeParams: [1.6] });
        });
    }

    // ---------------- Xe ----------------
    syncBuses(instant = true) {
        const buses = this.sim.buses;
        while (this.views.length > buses.length) {
            const v = this.views.pop()!;
            v.destroy();
        }
        for (let i = 0; i < buses.length; i++) {
            if (!this.views[i]) {
                const v = new BusView(this.scene, buses[i], this.onTap, this.scale);
                this.views.push(v);
            } else this.views[i].setBus(buses[i]);
            if (instant) this.views[i].syncInstant();
        }
        for (const [id, c] of this.checks) {
            if (!buses[id]?.done) {
                c.destroy();
                this.checks.delete(id);
            }
        }
        buses.forEach((b) => b.done && !this.checks.has(b.id) && this.addCheck(b.id, false));
        // bãi dự phòng đã dùng thì ẩn bóng mờ
        this.spareGhosts.forEach((g, i) => g.forEach((o) => (o as unknown as Phaser.GameObjects.Image).setVisible(i >= this.sim.nextSpare)));
    }

    private addCheck(id: number, animate: boolean) {
        const v = this.views[id];
        const b = this.sim.buses[id];
        const k = this.scale;
        const a = tankOffset(b.rot, 0), z = tankOffset(b.rot, b.capacity - 1);
        const dy = ((a.y + z.y) / 2) * k;
        const img = this.scene.add.image(b.x + ((a.x + z.x) / 2) * k, b.y + dy, 'check').setDepth(DEPTH.check).setScale(k);
        img.setData('dy', dy);
        this.checks.set(id, img);
        if (animate) {
            img.setScale(0).setAngle(-30);
            v?.celebrate();
            // ✓ in lên nắp sau khi nắp đóng
            this.scene.tweens.add({ targets: img, scale: k, angle: 0, delay: 300, duration: 520, ease: 'Back.easeOut', easeParams: [2.4] });
            this.scene.time.delayedCall(320, () => {
                this.sparks.explode(26, img.x, img.y);
                this.stars.explode(10, img.x, img.y);
            });
        }
    }

    // ---------------- Cá bay ----------------
    private fly(color: FishColor, count: number, from: () => Pt, to: () => Pt, dur: number, arc: number, done: () => void) {
        const imgs: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < count; i++) {
            imgs.push(this.scene.add.image(-100, -100, `fish_${color}`).setScale(FISH_FLY_SCALE).setDepth(DEPTH.flying));
        }
        this.flyers.push({ imgs, t: 0, dur, from, to, arc, done });
    }

    handleEvents(events: SimEvent[]) {
        const sim = this.sim;
        for (const e of events) {
            switch (e.type) {
                case 'release': {
                    const v = this.views[e.bus];
                    if (!v) break;
                    const n = e.colors.length;
                    const start = sim.buses[e.bus].stack.length;
                    for (let k = 0; k < n; k++) v.drainTank(start + n - 1 - k, k * 70);
                    const tail = busTail(v.bus.x, v.bus.y, v.bus.rot, v.bus.capacity, this.scale);
                    this.splash.explode(8, tail.x, tail.y - 30);
                    break;
                }
                case 'insert': {
                    const b = sim.buses[e.bus];
                    this.hiddenSlots.set(e.slot, (this.hiddenSlots.get(e.slot) ?? 0) + 1);
                    const tail = busTail(b.x, b.y, b.rot, b.capacity, this.scale);
                    const from = { x: tail.x - 10, y: tail.y - 70 };
                    this.fly(e.color, sim.level.fishPerUnit, () => from, () => sim.path.at(sim.slotPos(e.slot, sim.renderOffset()) - sim.S / 2), 0.34, 110, () => {
                        this.hiddenSlots.set(e.slot, (this.hiddenSlots.get(e.slot) ?? 1) - 1);
                        const p = sim.path.at(sim.slotPos(e.slot, sim.renderOffset()) - sim.S / 2);
                        this.splash.explode(6, p.x, p.y);
                    });
                    break;
                }
                case 'absorb': {
                    const v = this.views[e.bus];
                    if (!v) break;
                    const tank = v.tanks[e.index];
                    tank.busy++;
                    const p = sim.path.at(e.s);
                    const from = { x: p.x, y: p.y };
                    this.fly(e.color, sim.level.fishPerUnit, () => from, () => v.tankWorld(e.index), 0.36, 130, () => {
                        tank.busy--;
                        v.fillTank(e.index, e.color);
                        const w = v.tankWorld(e.index);
                        this.splash.explode(10, w.x, w.y - 30);
                        this.foam.explode(6, w.x, w.y + 10);
                        const c = this.checks.get(e.bus);
                        if (!c && this.pendingComplete.has(e.bus) && v.tanks.every((t) => t.busy === 0)) {
                            this.pendingComplete.delete(e.bus);
                            this.addCheck(e.bus, true);
                            this.onComplete?.(e.bus);
                        }
                    });
                    break;
                }
                case 'complete': {
                    // chờ cá bay vào bể cuối rồi mới chúc mừng
                    this.pendingComplete.add(e.bus);
                    break;
                }
                case 'pipeFull':
                case 'denied':
                    this.views[e.bus]?.shake();
                    break;
                case 'shuffle':
                    this.shuffleFx(e.bus, e.before);
                    break;
                case 'return':
                    this.returnFx(e);
                    break;
                case 'addBus':
                    this.syncBuses(false);
                    this.driveIn(e.bus);
                    break;
            }
        }
    }

    /** gọi khi xe hoàn thành (sau khi cá đã vào bể) – để HUD nảy số */
    onComplete?: (bus: number) => void;
    /** xe đã xong theo logic nhưng cá chưa bay vào bể (để bộ đếm nảy đúng lúc) */
    readonly pendingComplete = new Set<number>();

    /** Shuffle 1 xe: các bể đổi màu xoay vòng lần lượt, lấp lánh */
    private shuffleFx(id: number, before: FishColor[]) {
        const v = this.views[id];
        if (!v) return;
        const after = this.sim.buses[id].stack;
        v.tanks.forEach((t, i) => {
            if (before[i] === after[i]) return;
            t.busy++;
            const s = this.scene;
            s.tweens.add({
                targets: t.root,
                scaleX: 0,
                angle: 20,
                delay: i * 70,
                duration: 150,
                ease: 'Quad.easeIn',
                onComplete: () => {
                    v.setTankColor(i, after[i] ?? null);
                    v.setLevel(i, after[i] ? 1 : 0);
                    s.tweens.add({
                        targets: t.root,
                        scaleX: 1,
                        angle: 0,
                        duration: 260,
                        ease: 'Back.easeOut',
                        onComplete: () => {
                            t.busy--;
                            if (v.tanks.every((x) => x.busy === 0) && this.sim.buses[id].done && !this.checks.has(id)) {
                                this.addCheck(id, true);
                                this.onComplete?.(id);
                            }
                        },
                    });
                    const w = v.tankWorld(i);
                    this.sparks.explode(5, w.x, w.y);
                },
            });
        });
        this.foam.explode(10, v.x, v.y);
    }

    /** Return: nấc cá bay thẳng từ xe đích về chỗ cũ ở xe cũ */
    private returnFx(e: { from: number; fromIndex: number; to: number; toIndex: number; color: FishColor; reopened: boolean }) {
        const from = this.views[e.from], to = this.views[e.to];
        if (!from || !to) return;
        if (e.reopened) {
            this.checks.get(e.from)?.destroy();
            this.checks.delete(e.from);
            from.reopen();
        }
        from.drainTank(e.fromIndex, 0);
        const tank = to.tanks[e.toIndex];
        tank.busy++;
        const a = from.tankWorld(e.fromIndex);
        this.fly(e.color, this.sim.level.fishPerUnit, () => a, () => to.tankWorld(e.toIndex), 0.45, 160, () => {
            tank.busy--;
            to.fillTank(e.toIndex, e.color);
            const w = to.tankWorld(e.toIndex);
            this.splash.explode(8, w.x, w.y - 30);
        });
        this.sparks.explode(8, a.x, a.y);
    }

    private driveIn(id: number) {
        const v = this.views[id];
        if (!v) return;
        const x = v.x;
        v.x = -BUS_W * this.scale;
        this.scene.tweens.add({
            targets: v,
            x,
            duration: 700,
            ease: 'Back.easeOut',
            easeParams: [1.2],
            onComplete: () => this.foam.explode(16, x - (BUS_W / 2) * this.scale, v.y + 60 * this.scale),
        });
    }

    private clearFx() {
        for (const f of this.flyers) f.imgs.forEach((i) => i.destroy());
        this.flyers = [];
        this.hiddenSlots.clear();
        this.pendingComplete.clear();
        this.views.forEach((v) => v.tanks.forEach((t) => (t.busy = 0)));
    }

    // ---------------- Cập nhật mỗi khung hình ----------------
    update(dt: number) {
        this.time += dt;
        const sim = this.sim;
        const t = this.time;
        const high = this.quality === 'high';
        const p = this.tmp;
        const moving = sim.status === 'playing';

        this.floorWater?.setVisible(high);

        // cảnh báo kẹt: ống nhấp nháy đỏ
        const d = sim.status === 'lost' ? 0.3 + 0.1 * Math.sin(t * 5) : sim.dangerLevel() * (0.3 + 0.3 * Math.sin(t * 12));
        this.danger.setAlpha(d);

        // cá trong ống
        const fpu = sim.level.fishPerUnit;
        const off = sim.renderOffset();
        let used = 0;
        for (let i = 0; i < sim.C; i++) {
            const slot = sim.slots[i];
            if (!slot.color || (this.hiddenSlots.get(i) ?? 0) > 0) continue;
            const head = sim.slotPos(i, off);
            for (let j = 0; j < fpu; j++) {
                let img = this.fishPool[used];
                if (!img) {
                    img = this.scene.add.image(0, 0, 'fish_red').setDepth(DEPTH.fish);
                    this.fishPool.push(img);
                }
                used++;
                const s = head - (j + 0.5) * (sim.S / fpu) * 0.95 + Math.sin(t * 3 + j * 2 + i) * 4;
                sim.path.at(s, p);
                const lat = Math.sin(j * 2.3 + i * 1.3) * 24 + Math.sin(t * 2 + j + i) * 4;
                img.setTexture(`fish_${slot.color}`).setVisible(true);
                img.setPosition(p.x - Math.sin(p.a) * lat, p.y + Math.cos(p.a) * lat);
                const ca = Math.cos(p.a), sa = Math.sin(p.a);
                const face = ca < -0.15 ? -1 : 1;
                img.rotation = Math.atan2(sa, Math.abs(ca) + 0.6) * 0.5 * face + Math.sin(t * 9 + j * 1.7 + i) * 0.07;
                const g = this.gateFade(s);
                img.setAlpha(g);
                img.setScale(FISH_PIPE_SCALE * face * (0.4 + 0.6 * g), FISH_PIPE_SCALE * (0.4 + 0.6 * g) * (1 + Math.sin(t * 14 + j * 2 + i) * 0.05));
            }
        }
        for (let k = used; k < this.fishPool.length; k++) this.fishPool[k].setVisible(false);
        // nấc cá vừa qua cổng (ống hở): bọt bắn ở cả 2 cổng
        if (this.gates.length) {
            for (let i = 0; i < sim.C; i++) {
                const head = sim.slotPos(i, off);
                const prev = this.prevHead[i];
                if (prev !== undefined && head < prev - sim.L / 2 && sim.slots[i].color) for (const gp of this.gates) this.foam.explode(5, gp.x, gp.y);
                this.prevHead[i] = head;
            }
        }

        // gợn nước + bọt khí chạy theo dòng
        for (const r of this.ripples) {
            if (moving) r.s += sim.speed * r.v * dt;
            sim.path.at(r.s, p);
            const lat = r.lat + Math.sin(t * 1.5 + r.s * 0.01) * 5;
            r.img.setPosition(p.x - Math.sin(p.a) * lat, p.y + Math.cos(p.a) * lat).setRotation(p.a);
            r.img.setVisible(this.gateFade(r.s) > 0.5);
        }
        this.streaks.forEach((r, i) => {
            if (moving) r.s += sim.speed * r.v * dt;
            sim.path.at(r.s, p);
            const lat = r.lat + Math.sin(t * 1.7 + i * 2.1) * 9;
            r.img.setPosition(p.x - Math.sin(p.a) * lat, p.y + Math.cos(p.a) * lat);
            // kéo dài theo hướng dòng chảy một chút, mờ tỏ chậm
            r.img.rotation = p.a;
            r.img.setAlpha((0.12 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.3))) * this.gateFade(r.s));
            r.img.setVisible(high);
        });
        this.shimmer?.setVisible(high);
        // vệt bọt sau mỗi đàn cá
        this.trailT += dt;
        if (high && moving && this.trailT > 0.12) {
            this.trailT = 0;
            for (let i = 0; i < sim.C; i++) {
                if (!sim.slots[i].color || (this.hiddenSlots.get(i) ?? 0) > 0) continue;
                sim.path.at(sim.slotPos(i, sim.renderOffset()) - sim.S * 0.95, p);
                if (this.gateFade(sim.slotPos(i, sim.renderOffset()) - sim.S * 0.95) < 0.5) continue;
                this.trail.explode(1, p.x + (Math.random() - 0.5) * 30, p.y + (Math.random() - 0.5) * 30);
            }
        }
        for (const b of this.bubbles) {
            b.img.setVisible(high);
            if (!high) continue;
            if (moving) b.s += sim.speed * b.v * dt;
            sim.path.at(b.s, p);
            const lat = b.lat + Math.sin(t * 2 + b.s * 0.01) * 6;
            b.img.setPosition(p.x - Math.sin(p.a) * lat, p.y + Math.cos(p.a) * lat).setAlpha(0.8 * this.gateFade(b.s));
        }

        for (const v of this.views) v.update(dt);

        // check nhấp nhô nhẹ
        for (const [id, c] of this.checks) c.y = (this.views[id]?.y ?? c.y) + (c.getData('dy') as number) + Math.sin(t * 3 + id) * 3;

        // cá bay theo đường cong, đuổi theo đích đang chạy
        this.flyers = this.flyers.filter((f) => {
            f.t += dt;
            const k = Math.min(1, f.t / f.dur);
            const a = f.from(), b = f.to();
            const dir = b.x >= a.x ? 1 : -1;
            f.imgs.forEach((img, i) => {
                const kk = Math.max(0, Math.min(1, k * 1.3 - i * 0.07));
                const e = kk * kk * (3 - 2 * kk);
                const spread = (i - (f.imgs.length - 1) / 2) * 9;
                img.setPosition(a.x + (b.x - a.x) * e + spread, a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * f.arc);
                img.rotation = Math.cos(Math.PI * e) * -0.7 * dir;
                img.setScale(FISH_FLY_SCALE * dir, FISH_FLY_SCALE);
                img.setVisible(kk > 0);
            });
            if (k >= 1) {
                f.imgs.forEach((img) => img.destroy());
                f.done?.();
                return false;
            }
            return true;
        });
    }

    /** ống hở: cá mờ và nhỏ dần khi tới gần cổng (1 = bình thường, 0 = ngay miệng cổng) */
    private gateFade(s: number) {
        const path = this.sim.path;
        if (!path.open) return 1;
        const w = path.wrap(s);
        return Math.min(1, Math.min(w, path.length - w) / 46);
    }
    private prevHead: number[] = [];

    /** màu chủ đạo của level (dùng cho pháo giấy) */
    colors(): number[] {
        const set = new Set<FishColor>();
        for (const b of this.sim.level.buses) b.stack.forEach((c) => set.add(c));
        return [...set].map((c) => PALETTE[c].main);
    }

    destroy() {
        this.clearFx();
        for (const v of this.views) v.destroy();
        for (const c of this.checks.values()) c.destroy();
        for (const o of this.objs) o.destroy();
        for (const f of this.fishPool) f.destroy();
    }
}
