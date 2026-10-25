import * as Phaser from 'phaser';
import { COLORS } from '../core/types';

const FONT = 'Fredoka, "Arial Rounded MT Bold", Arial, sans-serif';

/** chữ logo: bong bóng 3D, ruột trắng → xanh nhạt, viền tím đậm, bóng navy */
function logoWord(scene: Phaser.Scene, x: number, y: number, text: string, size: number) {
    const t = scene.add.text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: '700',
        color: '#ffffff',
        stroke: '#4b2bb5',
        strokeThickness: Math.round(size * 0.16),
        shadow: { offsetX: 0, offsetY: Math.round(size * 0.09), color: '#141a5c', blur: 0, fill: true, stroke: true },
        padding: { x: 20, y: 20 },
    });
    t.setOrigin(0.5);
    const grd = t.context.createLinearGradient(0, t.height * 0.25, 0, t.height * 0.8);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.55, '#d9f4ff');
    grd.addColorStop(1, '#7fd0ff');
    t.setFill(grd);
    return t;
}

/** vòng ống kính có nước, cá hề bơi vòng quanh */
export class PipeRing extends Phaser.GameObjects.Container {
    private fish: Phaser.GameObjects.Image[] = [];
    private t = 0;

    constructor(scene: Phaser.Scene, x: number, y: number, readonly rx: number, readonly ry: number, colors: string[] = ['orange', 'blue', 'pink', 'yellow', 'green', 'purple']) {
        super(scene, x, y);
        const g = scene.add.graphics();
        // vòng elip khép kín (tự lấy điểm để không bị khía ở chỗ nối)
        const pts = Array.from({ length: 96 }, (_, i) => {
            const t = (i / 96) * Math.PI * 2;
            return new Phaser.Math.Vector2(Math.cos(t) * rx, Math.sin(t) * ry);
        });
        const ring = (w: number, c: number, a: number) => {
            g.lineStyle(w, c, a);
            g.strokePoints([...pts, pts[0], pts[1]], false, false);
        };
        ring(46, 0x062a5c, 0.3);
        ring(42, 0x3d7fe0, 1);
        ring(36, 0xbfeaff, 1);
        ring(28, 0x35a3f0, 1);
        ring(12, 0x7fd3ff, 0.55);
        g.lineStyle(4, 0xffffff, 0.7);
        g.beginPath();
        for (let a = Math.PI * 1.05; a <= Math.PI * 1.55; a += 0.05) g.lineTo(Math.cos(a) * (rx - 8), Math.sin(a) * (ry - 8));
        g.strokePath();
        this.add(g);
        colors.forEach((c) => {
            const f = scene.add.image(0, 0, `fish_${c}`).setScale(0.24);
            this.fish.push(f);
            this.add(f);
        });
        scene.add.existing(this);
    }

    preUpdate(_t: number, dt: number) {
        this.t += dt / 1000;
        const n = this.fish.length;
        this.fish.forEach((f, i) => {
            const a = this.t * 0.9 + (i / n) * Math.PI * 2;
            const x = Math.cos(a) * this.rx, y = Math.sin(a) * this.ry;
            // hướng bơi = tiếp tuyến (theo chiều kim đồng hồ)
            const tx = -Math.sin(a) * this.rx, ty = Math.cos(a) * this.ry;
            const face = tx >= 0 ? 1 : -1;
            f.setPosition(x, y + Math.sin(this.t * 8 + i) * 3);
            f.setScale(0.24 * face, 0.24);
            f.rotation = Math.atan2(ty, Math.abs(tx) + 1) * 0.6 * face;
        });
    }
}

/** Logo "FISH LOOP": chữ bong bóng + vòng ống kính có cá bơi ở chữ LOOP. */
export function createLogo(scene: Phaser.Scene, x: number, y: number, scale = 1) {
    const c = scene.add.container(x, y);
    const ring = new PipeRing(scene, 20, 10, 400, 255, ['orange', 'blue', 'pink', 'yellow', 'green', 'purple', 'cyan', 'red'].filter((k) => (COLORS as readonly string[]).includes(k)));
    c.add(ring);
    const fish = logoWord(scene, 0, -95, 'FISH', 210);
    const loop = logoWord(scene, 30, 95, 'LOOP', 210);
    c.add([fish, loop]);
    // cá hề nhảy ra khỏi chữ O cuối
    const jumper = scene.add.image(300, -10, 'fish_orange').setScale(0.5).setAngle(-25);
    c.add(jumper);
    scene.tweens.add({ targets: jumper, y: -40, angle: -10, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    c.setScale(scale);
    return c;
}
