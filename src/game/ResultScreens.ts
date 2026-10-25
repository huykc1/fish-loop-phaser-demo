import * as Phaser from 'phaser';
import { button, label, Popup } from './ui';

/** dải ruy băng có chữ */
function ribbonTitle(scene: Phaser.Scene, y: number, key: 'ribbonGold' | 'ribbonRed', text: string) {
    const c = scene.add.container(0, y);
    const img = scene.add.image(0, 0, key);
    const t = scene.add
        .text(0, -6, text, {
            fontFamily: 'Fredoka, Arial, sans-serif',
            fontSize: '72px',
            fontStyle: '700',
            color: '#ffffff',
            stroke: key === 'ribbonGold' ? '#8a3f05' : '#5a0a12',
            strokeThickness: 12,
            shadow: { offsetX: 0, offsetY: 6, color: '#00000066', blur: 0, fill: true, stroke: true },
        })
        .setOrigin(0.5);
    c.add([img, t]);
    c.setScale(0.2).setAlpha(0);
    scene.tweens.add({ targets: c, scale: 1, alpha: 1, delay: 150, duration: 520, ease: 'Back.easeOut', easeParams: [2.2] });
    return c;
}

/** cá bơi tại chỗ (vui: nhảy; buồn: lật nghiêng, chìm nổi) */
function fishActor(scene: Phaser.Scene, x: number, y: number, key: string, mood: 'happy' | 'sad') {
    const f = scene.add.image(x, y, key).setScale(0.9);
    if (mood === 'happy') {
        scene.tweens.add({ targets: f, y: y - 40, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeOut' });
        scene.tweens.add({ targets: f, angle: { from: -12, to: 12 }, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: f, scaleY: { from: 0.86, to: 0.96 }, duration: 190, yoyo: true, repeat: -1 });
    } else {
        // cá buồn: xám xanh, chúi đầu xuống, chìm nổi chậm (thay bằng ảnh cá buồn khi có)
        f.setTint(0x9fb0d6).setAngle(24).setScale(0.8, 0.74);
        scene.tweens.add({ targets: f, y: y + 16, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: f, angle: { from: 18, to: 30 }, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return f;
}

export interface WinInfo {
    level: number;
    stars: number;
    buses: number;
    moves: number;
    nextLabel: string | null;
    onNext: () => void;
    onRetry: () => void;
}

/** Màn thắng: tia nắng xoay, ruy băng vàng, 3 sao bật lần lượt, cá hề nhảy mừng. */
export function showWin(scene: Phaser.Scene, info: WinInfo, onStar: (i: number) => void): Popup {
    const p = new Popup(scene, 820, 820, 0.68);
    const rays = scene.add.image(0, -230, 'rays').setScale(1.7).setAlpha(0).setTint(0xfff0a8).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: rays, alpha: 0.55, duration: 500 });
    scene.tweens.add({ targets: rays, angle: 360, duration: 16000, repeat: -1 });
    p.under(rays);
    const items: Phaser.GameObjects.GameObject[] = [ribbonTitle(scene, -400, 'ribbonGold', 'Tuyệt vời!')];
    // ô sao + sao vàng
    const pos = [
        { x: -200, y: -215, s: 0.95 },
        { x: 0, y: -250, s: 1.2 },
        { x: 200, y: -215, s: 0.95 },
    ];
    pos.forEach((q, i) => {
        items.push(scene.add.image(q.x, q.y, 'starSlot').setScale(q.s));
        if (i >= info.stars) return;
        const st = scene.add.image(q.x, q.y, 'starGold').setScale(0).setAngle(-90);
        items.push(st);
        scene.tweens.add({
            targets: st,
            scale: q.s,
            angle: 0,
            delay: 550 + i * 260,
            duration: 420,
            ease: 'Back.easeOut',
            easeParams: [2.6],
            onStart: () => onStar(i),
        });
    });
    items.push(fishActor(scene, 0, -20, 'fish_orange', 'happy'));
    items.push(label(scene, 0, 135, `Level ${info.level} hoàn thành`, 50, '#ffe066'));
    items.push(label(scene, 0, 192, `${info.buses} xe · ${info.moves} lượt`, 36));
    if (info.nextLabel) {
        const next = button(scene, 0, 310, 460, 130, info.nextLabel, info.onNext);
        scene.tweens.add({ targets: next, scale: { from: 1, to: 1.06 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1400 });
        items.push(next);
        items.push(button(scene, 0, 480, 280, 96, 'Chơi lại', info.onRetry, 'grey'));
    } else items.push(button(scene, 0, 310, 460, 130, 'Chơi lại', info.onRetry));
    p.add(items);
    return p;
}

export interface LoseOption {
    key: string;
    name: string;
    count: number;
    enabled: boolean;
    use: () => void;
}

/** Màn thua: viền tối, ruy băng đỏ, cá buồn, thẻ booster để cứu màn. */
export function showLose(scene: Phaser.Scene, options: LoseOption[], onRetry: () => void): Popup {
    const p = new Popup(scene, 840, 900, 0.72, 0x12051a);
    const vig = scene.add.image(0, 60, 'vignette').setDisplaySize(1080, 1920).setTint(0x3a0010).setAlpha(0);
    scene.tweens.add({ targets: vig, alpha: 0.75, duration: 500 });
    p.under(vig);
    const items: Phaser.GameObjects.GameObject[] = [ribbonTitle(scene, -440, 'ribbonRed', 'Ống bị kẹt!')];
    items.push(fishActor(scene, 0, -250, 'fish_blue', 'sad'));
    // nước mắt
    const tears = scene.add.particles(-30, -240, 'drop', {
        speedX: { min: -40, max: 10 },
        speedY: { min: 40, max: 80 },
        gravityY: 300,
        lifespan: 700,
        frequency: 420,
        scale: { start: 0.45, end: 0.2 },
        alpha: { start: 0.9, end: 0 },
        tint: 0x9fd8ff,
    });
    items.push(tears);
    items.push(label(scene, 0, -105, 'Không còn cá nào vào được xe', 40));
    items.push(label(scene, 0, -50, 'Dùng booster để cứu màn:', 34, '#c9d3ff'));
    const xs = [-260, 0, 260];
    options.forEach((o, i) => {
        const c = scene.add.container(xs[i], 110);
        const card = scene.add.nineslice(0, 0, 'panel', undefined, 230, 250, 50, 50, 50, 60).setTint(o.enabled ? 0xffffff : 0x8a8aa0);
        const ic = scene.add.image(0, -30, o.key).setScale(0.95);
        const nm = label(scene, 0, 78, o.name, 34);
        const badge = scene.add.container(70, -90);
        badge.add([scene.add.image(0, 0, 'badge'), label(scene, 0, -2, String(o.count), 32)]);
        c.add([card, ic, nm, badge]);
        c.setSize(230, 250);
        if (o.enabled) {
            c.setInteractive({ useHandCursor: true });
            c.on('pointerdown', () => scene.tweens.add({ targets: c, scale: 0.92, duration: 70, yoyo: true }));
            c.on('pointerup', () => o.use());
            scene.tweens.add({ targets: ic, scale: { from: 0.95, to: 1.05 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 200 });
        } else c.setAlpha(0.45);
        c.setScale(0);
        scene.tweens.add({ targets: c, scale: 1, delay: 300 + i * 120, duration: 380, ease: 'Back.easeOut' });
        items.push(c);
    });
    items.push(button(scene, 0, 345, 440, 120, 'Chơi lại', onRetry));
    p.add(items);
    return p;
}
