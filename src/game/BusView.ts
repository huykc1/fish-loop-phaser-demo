import * as Phaser from 'phaser';
import type { Bus, FishColor } from '../core/types';
import { BUS_H, BUS_W, TANK_H, busLocal, tankOffset } from '../core/geometry';
import { WATER_FULL } from './textures';
import { DEPTH, FISH_TANK_SCALE } from './layout';

interface TankFish {
    img: Phaser.GameObjects.Image;
    bx: number;
    by: number;
    ph: number;
    sp: number;
    rx: number;
}

interface Tank {
    root: Phaser.GameObjects.Container;
    water: Phaser.GameObjects.Image;
    front: Phaser.GameObjects.Image;
    rim: Phaser.GameObjects.Image;
    glass: Phaser.GameObjects.Image;
    surface: Phaser.GameObjects.Image;
    flash: Phaser.GameObjects.Image;
    fish: TankFish[];
    color: FishColor | null;
    level: number; // 0..1 mực nước đang hiển thị
    busy: number; // số hiệu ứng đang bay tới / rời khỏi bể
    tween?: Phaser.Tweens.Tween; // hiệu ứng nước đang chạy (chỉ 1 cái mỗi bể)
}

const WATER_H = (TANK_H - 8) * WATER_FULL;

export { tankOffset };

/** ảnh thân xe đúng chiều (ngang / lật ngang / dọc đuôi xuống / dọc đầu xuống), đặt quanh tâm xe */
export function busBodyImage(scene: Phaser.Scene, rot: number) {
    const r = ((Math.round(rot) % 360) + 360) % 360;
    if (r === 90 || r === 270) {
        const key = r === 90 ? 'bus_v_rear' : 'bus_v_front';
        const meta = (scene.cache.json.get('bus_v') as Record<string, { trayCx: number; trayCy: number; w: number; h: number }>)[key];
        const a = tankOffset(r, 0), z = tankOffset(r, 3);
        const cx = (a.x + z.x) / 2, cy = (a.y + z.y) / 2;
        return scene.add.image(cx - (meta.trayCx - meta.w / 2), cy - (meta.trayCy - meta.h / 2), key);
    }
    const img = scene.add.image(0, 0, 'bus_body');
    if (r === 180) img.setFlipX(true);
    else if (r !== 0) img.setAngle(r);
    return img;
}

/** Hiển thị 1 xe: thân xe (ảnh cắt), 4 bể kính có nước + cá, hàng cá chờ xả ở đuôi. */
export class BusView extends Phaser.GameObjects.Container {
    readonly tanks: Tank[] = [];
    private busImg: Phaser.GameObjects.Image;
    private pending: Phaser.GameObjects.Image[] = [];
    private pendingSig = '';
    private time = Math.random() * 10;
    private lid: Phaser.GameObjects.Image;
    done = false;

    /** tâm khay bể (cục bộ, chưa nhân cỡ xe) – nơi đặt nắp và dấu ✓ */
    readonly trayCenter: { x: number; y: number };

    constructor(scene: Phaser.Scene, public bus: Bus, onTap: (id: number) => void, readonly base = 1) {
        super(scene, bus.x, bus.y);
        this.setScale(base);
        this.setDepth(DEPTH.bus + bus.y / 10000);
        const rot = ((Math.round(bus.rot) % 360) + 360) % 360;
        const vertical = rot === 90 || rot === 270;
        // bóng đổ mềm lệch xuống dưới như ảnh mẫu
        const shadow = scene.add.image(6, 26, 'busShadow').setTint(0x01061a).setAlpha(0.8);
        if (vertical) shadow.setAngle(90).setPosition(10, 18);
        this.add(shadow);
        // xe dọc có ảnh riêng: xoay 90° = đuôi xe quay xuống, 270° = đầu xe quay xuống; 180° = lật ngang
        this.busImg = busBodyImage(scene, rot);
        this.add(this.busImg);

        for (let i = 0; i < bus.capacity; i++) {
            const off = tankOffset(rot, i);
            const root = scene.add.container(off.x, off.y);
            if (vertical) root.setScale(1, 0.93);
            const back = scene.add.image(0, 0, 'tankBack');
            const water = scene.add.image(0, 0, 'tw_red');
            const front = scene.add.image(0, 0, 'tf_red');
            const rim = scene.add.image(0, 0, 'tr_red').setVisible(false);
            const surface = scene.add.image(0, 0, 'waterSurface').setOrigin(0.5, 0.3);
            const fishLayer: TankFish[] = [];
            const spots = [
                [-19, -20],
                [20, -4],
                [-17, 18],
                [19, 32],
            ];
            const glass = scene.add.image(0, 0, 'tankGlass');
            const flash = scene.add.image(0, 0, 'tankFlash').setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
            root.add([back, water, surface]);
            spots.forEach(([x, y], k) => {
                const img = scene.add.image(x, y, 'fish_red').setScale(FISH_TANK_SCALE).setVisible(false);
                root.add(img);
                fishLayer.push({ img, bx: x, by: y, ph: k * 1.9 + i, sp: 0.7 + ((k * 7 + i * 3) % 5) * 0.14, rx: 5 + (k % 3) * 2 });
            });
            root.add([front, glass, rim, flash]);
            this.add(root);
            this.tanks.push({ root, water, front, rim, glass, surface, flash, fish: fishLayer, color: null, level: 0, busy: 0 });
        }

        const a0 = tankOffset(rot, 0), a3 = tankOffset(rot, bus.capacity - 1);
        this.trayCenter = { x: (a0.x + a3.x) / 2, y: (a0.y + a3.y) / 2 };
        this.lid = scene.add.image(this.trayCenter.x, this.trayCenter.y, 'lid').setVisible(false);
        if (vertical) this.lid.setAngle(90).setScale(1, 0.95);
        this.add(this.lid);

        const hw = (vertical ? BUS_H : BUS_W) / 2 + 12, hh = (vertical ? BUS_W : BUS_H) / 2 + 12;
        this.setSize(hw * 2, hh * 2);
        this.setInteractive({ useHandCursor: true });
        this.on('pointerdown', () => {
            this.press();
            onTap(this.bus.id);
        });
        scene.add.existing(this);
        this.syncInstant();
    }

    /** điểm đuôi xe (cục bộ) nơi cá chờ xả */
    private pendingPos(k: number) {
        const p = busLocal(this.bus.rot, BUS_W / 2 - 18 - k * 34, -BUS_H / 2 + 6);
        return p;
    }

    tankWorld(i: number) {
        const o = tankOffset(this.bus.rot, i);
        return { x: this.x + o.x * this.scaleX, y: this.y + o.y * this.scaleY };
    }

    setBus(bus: Bus) {
        this.bus = bus;
    }

    /** đồng bộ ngay (khởi tạo, undo, thêm xe) */
    syncInstant() {
        this.tanks.forEach((t, i) => {
            t.busy = 0;
            t.tween?.stop();
            t.tween = undefined;
            this.setTankColor(i, this.bus.stack[i] ?? null);
            this.setLevel(i, t.color ? 1 : 0);
        });
        this.done = this.bus.done;
        this.lid.setVisible(this.done).setAlpha(1);
        this.tanks.forEach((t) => t.root.setVisible(!this.done));
        this.refreshPending(true);
    }

    setTankColor(i: number, c: FishColor | null) {
        const t = this.tanks[i];
        t.color = c;
        if (c) {
            t.water.setTexture(`tw_${c}`);
            t.front.setTexture(`tf_${c}`);
            t.rim.setTexture(`tr_${c}`);
        }
        t.rim.setVisible(!!c);
        t.glass.setVisible(!c);
        for (const f of t.fish) {
            f.img.setVisible(!!c);
            if (c) f.img.setTexture(`fish_${c}`);
        }
    }

    setLevel(i: number, v: number) {
        const t = this.tanks[i];
        t.level = v;
        const h = WATER_H * v;
        t.water.setVisible(v > 0.01);
        t.front.setVisible(v > 0.01);
        t.surface.setVisible(v > 0.03);
        // cắt khối nước từ đáy lên theo mực nước
        const top = t.water.height - 4 - h;
        t.water.setCrop(0, top, t.water.width, h + 4);
        t.front.setCrop(0, top, t.front.width, h + 4);
        t.rim.setAlpha(0.35 + 0.65 * v);
        t.surface.y = TANK_H / 2 - 4 - h;
        for (const f of t.fish) f.img.setAlpha(Math.min(1, v * 1.6));
    }

    /** nhận 1 nấc cá: nước dâng + loé sáng + bọt */
    fillTank(i: number, c: FishColor) {
        this.setTankColor(i, c);
        const t = this.tanks[i];
        const o = { v: t.level };
        t.tween?.stop();
        t.tween = this.scene.tweens.add({
            targets: o,
            v: 1,
            duration: 380,
            ease: 'Sine.easeOut',
            onUpdate: () => this.setLevel(i, o.v),
        });
        t.flash.setAlpha(0.9).setScale(0.8);
        this.scene.tweens.add({ targets: t.flash, alpha: 0, scale: 1.15, duration: 420, ease: 'Quad.easeOut' });
        this.scene.tweens.add({ targets: t.root, scaleX: 1.12, scaleY: 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    }

    /** xả 1 nấc: nước rút */
    drainTank(i: number, delay: number) {
        const t = this.tanks[i];
        const o = { v: t.level };
        t.tween?.stop();
        t.tween = this.scene.tweens.add({
            targets: o,
            v: 0,
            delay,
            duration: 260,
            ease: 'Quad.easeIn',
            onUpdate: () => this.setLevel(i, o.v),
            onComplete: () => {
                if (!this.bus.stack[i]) this.setTankColor(i, null);
            },
        });
    }

    press() {
        this.scene.tweens.killTweensOf(this);
        this.setScale(this.base);
        this.scene.tweens.add({ targets: this, scaleX: this.base * 0.94, scaleY: this.base * 1.05, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
    }

    shake() {
        const x0 = this.bus.x;
        this.scene.tweens.add({
            targets: this,
            x: { from: x0 - 14, to: x0 },
            duration: 380,
            ease: 'Elastic.easeOut',
            easeParams: [1.2, 0.18],
        });
        this.busImg.setTint(0xff8080);
        this.scene.time.delayedCall(180, () => this.busImg.clearTint());
    }

    celebrate() {
        this.done = true;
        const s = this.scene;
        s.tweens.add({ targets: this, y: this.bus.y - 26, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
        s.tweens.add({ targets: this, scaleX: this.base * 1.06, scaleY: this.base * 1.06, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
        // nắp trượt xuống che các bể
        const sx = this.lid.scaleX, sy = this.lid.scaleY;
        this.lid.setVisible(true).setAlpha(0).setScale(sx * 1.25, sy * 1.25);
        s.tweens.add({
            targets: this.lid,
            alpha: 1,
            scaleX: sx,
            scaleY: sy,
            delay: 120,
            duration: 300,
            ease: 'Back.easeOut',
            onComplete: () => this.tanks.forEach((t) => t.root.setVisible(false)),
        });
        this.busImg.enableFilters();
        const glow = this.busImg.filters!.external.addGlow(0xfff3a0, 6, 0, 1, false, 10, 18);
        s.tweens.add({
            targets: glow,
            outerStrength: 0,
            delay: 250,
            duration: 900,
            onComplete: () => this.busImg.filters?.external.remove(glow),
        });
    }

    /** mở nắp lại (Return lấy đi nấc làm xe hoàn thành) */
    reopen() {
        this.done = false;
        this.tanks.forEach((t) => t.root.setVisible(true));
        this.scene.tweens.add({ targets: this.lid, alpha: 0, scaleX: this.lid.scaleX * 1.2, scaleY: this.lid.scaleY * 1.2, duration: 220, onComplete: () => this.lid.setVisible(false).setScale(1, this.bus.rot % 180 ? 0.95 : 1) });
    }

    /** viền sáng nhấp nháy khi đang chọn xe để Shuffle */
    setPickable(on: boolean) {
        this.scene.tweens.killTweensOf(this.busImg);
        if (on) {
            this.busImg.setTint(0xfff3a0);
            this.scene.tweens.add({ targets: this.busImg, alpha: { from: 1, to: 0.7 }, duration: 380, yoyo: true, repeat: -1 });
        } else {
            this.busImg.clearTint().setAlpha(1);
        }
    }

    setDimmed(on: boolean) {
        this.setAlpha(on ? 0.45 : 1);
    }

    /** cá chờ xả nhảy nhót ở đuôi xe */
    refreshPending(force = false) {
        const sig = this.bus.pending.join(',');
        if (!force && sig === this.pendingSig) return;
        this.pendingSig = sig;
        for (const p of this.pending) p.destroy();
        this.pending = this.bus.pending.map((c, k) => {
            const pp = this.pendingPos(k);
            const img = this.scene.add.image(pp.x, pp.y, `fish_${c}`).setScale(0.18);
            this.add(img);
            img.setData('by', pp.y);
            img.setData('k', k);
            return img;
        });
    }

    update(dt: number) {
        this.time += dt;
        const t = this.time;
        this.refreshPending();
        for (const p of this.pending) {
            const k = p.getData('k') as number;
            p.y = (p.getData('by') as number) - Math.abs(Math.sin(t * 9 + k)) * 18;
            p.rotation = Math.sin(t * 9 + k) * 0.25;
        }
        // tự đồng bộ: bể không còn hiệu ứng nào mà khác logic thì sửa ngay
        this.tanks.forEach((tank, i) => {
            if (tank.busy > 0 || (tank.tween && !tank.tween.isFinished() && !tank.tween.isDestroyed())) return;
            const want = this.bus.stack[i] ?? null;
            if (tank.color !== want || Math.abs(tank.level - (want ? 1 : 0)) > 0.01) {
                this.setTankColor(i, want);
                this.setLevel(i, want ? 1 : 0);
            }
        });
        for (const tank of this.tanks) {
            if (!tank.color || !tank.root.visible) continue;
            tank.surface.x = Math.sin(t * 2.2 + tank.root.x) * 2;
            for (const f of tank.fish) {
                const v = Math.sin(t * f.sp + f.ph);
                f.img.x = f.bx + v * f.rx;
                const floor = TANK_H / 2 - 4 - WATER_H * tank.level;
                f.img.y = Math.max(f.by + Math.sin(t * 2.3 + f.ph * 2) * 2.5, floor + 14);
                const dir = Math.cos(t * f.sp + f.ph) >= 0 ? 1 : -1;
                f.img.setScale(FISH_TANK_SCALE * dir, FISH_TANK_SCALE * (1 + Math.sin(t * 12 + f.ph) * 0.04));
                f.img.rotation = Math.sin(t * 4 + f.ph) * 0.07;
            }
        }
    }
}
