import * as Phaser from 'phaser';
import { Background } from '../game/Background';
import { BusView } from '../game/BusView';
import { createLogo, PipeRing } from '../game/Logo';
import { DEPTH } from '../game/layout';
import { label } from '../game/ui';
import type { Bus, FishColor } from '../core/types';

/**
 * Cảnh quảng cáo (mở bằng ?promo=endcard | logo | icon):
 *  - endcard: end card cho video quảng cáo (logo, xe nhận cá, nút CHƠI NGAY nhấp nháy, bàn tay bấm)
 *  - logo: chỉ logo trên nền trong suốt (xuất PNG)
 *  - icon: icon app vuông
 * Dev: window.__promo.export() lưu ảnh vào .snaps/ (POST /__snap).
 */
export class Promo extends Phaser.Scene {
    private bg?: Background;
    constructor() {
        super('Promo');
    }

    create() {
        const mode = new URLSearchParams(location.search).get('promo') || 'endcard';
        if (mode === 'logo') this.logoMode();
        else if (mode === 'icon') this.iconMode();
        else this.endcardMode();
    }

    update(_t: number, dt: number) {
        this.bg?.update(dt / 1000);
    }

    private endcardMode() {
        this.bg = new Background(this);
        // vùng tối nhẹ ở giữa cho chữ nổi
        this.add.image(540, 960, 'glow').setDisplaySize(1300, 1500).setTint(0x0a2a6a).setAlpha(0.35).setDepth(DEPTH.ambient + 1);
        const logo = createLogo(this, 540, 470, 1).setDepth(DEPTH.hud);
        logo.setScale(0.2).setAlpha(0);
        this.tweens.add({ targets: logo, scale: 1, alpha: 1, duration: 700, ease: 'Back.easeOut', easeParams: [1.8] });
        this.tweens.add({ targets: logo, y: 455, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 700 });

        // xe buýt nhận cá liên tục
        const bus: Bus = { id: 0, x: 540, y: 1000, rot: 0, capacity: 4, stack: [], portS: 0, pending: [], pendingIdx: [], done: false, spare: false };
        const view = new BusView(this, bus, () => undefined, 1.1).setDepth(DEPTH.hud);
        const palette: FishColor[] = ['orange', 'blue', 'pink', 'yellow', 'purple', 'green'];
        const sparks = this.add.particles(0, 0, 'sparkle', {
            emitting: false,
            speed: { min: 180, max: 520 },
            lifespan: { min: 450, max: 900 },
            scale: { start: 1.1, end: 0 },
            tint: [0xffffff, 0xfff1a0, 0xffd34a],
            blendMode: Phaser.BlendModes.ADD,
        }).setDepth(DEPTH.toast);
        let k = 0;
        const fillNext = () => {
            const c = palette[Math.floor(k / 4) % palette.length];
            const i = k % 4;
            if (i === 0) {
                bus.stack = [];
                view.syncInstant();
            }
            bus.stack.push(c);
            view.fillTank(i, c);
            k++;
            if (i === 3)
                this.time.delayedCall(300, () => {
                    // mừng xe đầy (không đóng nắp để vòng lặp tiếp tục)
                    this.tweens.add({ targets: view, scaleX: 1.18, scaleY: 1.18, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
                    sparks.explode(24, 540, 990);
                });
        };
        this.time.addEvent({ delay: 520, loop: true, callback: fillNext });
        this.events.on('update', (_t: number, dt: number) => view.update(dt / 1000));

        const tag = label(this, 540, 1235, 'Xếp cá đúng màu – lấp đầy xe buýt!', 52).setDepth(DEPTH.hud);
        tag.setAlpha(0);
        this.tweens.add({ targets: tag, alpha: 1, delay: 500, duration: 500 });

        // nút CHƠI NGAY + bàn tay bấm
        const cta = this.add.container(540, 1480).setDepth(DEPTH.hud);
        const bgBtn = this.add.nineslice(0, 0, 'btn_blank', undefined, 620, 190, 46, 46, 46, 46);
        const txt = label(this, 0, -8, 'CHƠI NGAY', 92);
        cta.add([bgBtn, txt]);
        this.tweens.add({ targets: cta, scale: { from: 1, to: 1.08 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        const shine = this.add.image(-260, 0, 'ray').setAngle(25).setScale(0.35, 0.22).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
        cta.add(shine);
        this.tweens.add({ targets: shine, x: 280, duration: 900, repeat: -1, repeatDelay: 900, ease: 'Quad.easeInOut' });
        const hand = this.add.image(650, 1560, 'hand_up').setScale(0.9).setOrigin(0.5, 0.05).setDepth(DEPTH.toast);
        const tap = () => {
            hand.setTexture('hand_down');
            this.tweens.add({ targets: cta, scale: 0.94, duration: 90, yoyo: true });
            this.time.delayedCall(180, () => hand.setTexture('hand_up'));
        };
        this.tweens.add({ targets: hand, x: 610, y: 1500, duration: 500, yoyo: true, repeat: -1, repeatDelay: 600, ease: 'Sine.easeInOut', onYoyo: tap });

        this.expose(() => ({ x: 0, y: 0, w: 1080, h: 1920 }), 'endcard', false);
    }

    private logoMode() {
        this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
        createLogo(this, 540, 950, 1.12);
        this.expose(() => ({ x: 20, y: 610, w: 1040, h: 700 }), 'logo', true);
    }

    private iconMode() {
        const s = 1024, x0 = 540 - s / 2, y0 = 960 - s / 2;
        // nền icon: nước xanh chuyển màu, bo góc (vẽ canvas cho mượt)
        if (!this.textures.exists('iconBg')) {
            const t = this.textures.createCanvas('iconBg', s, s)!;
            const c = t.getContext();
            const gr = c.createLinearGradient(0, 0, 0, s);
            gr.addColorStop(0, '#5fd6ff');
            gr.addColorStop(0.55, '#1aa0e6');
            gr.addColorStop(1, '#0c4fa8');
            c.fillStyle = gr;
            c.beginPath();
            c.roundRect(0, 0, s, s, 200);
            c.fill();
            const rad = c.createRadialGradient(s * 0.5, s * 0.35, 40, s * 0.5, s * 0.45, s * 0.6);
            rad.addColorStop(0, 'rgba(255,255,255,0.35)');
            rad.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = rad;
            c.fill();
            t.refresh();
        }
        this.add.image(540, 960, 'iconBg');
        this.add.image(540, 960, 'glow').setDisplaySize(900, 900).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
        new PipeRing(this, 540, 1000, 330, 330, ['blue', 'pink', 'yellow', 'green', 'purple', 'cyan']);
        this.add.image(540, 930, 'fish_orange').setScale(1.75);
        this.add.particles(540, 1150, 'bubble', { x: { min: -260, max: 260 }, speedY: { min: -60, max: -140 }, lifespan: 2500, frequency: 260, scale: { min: 0.4, max: 1 }, alpha: { start: 0.8, end: 0 } });
        this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
        this.expose(() => ({ x: x0, y: y0, w: s, h: s }), 'icon', true);
    }

    /** dev: window.__promo.export() chụp vùng ảnh và lưu PNG vào .snaps/<name>.png */
    private expose(area: () => { x: number; y: number; w: number; h: number }, name: string, _transparent: boolean) {
        (window as unknown as { __promo: unknown }).__promo = {
            export: () =>
                new Promise<string>((res) => {
                    const a = area();
                    this.game.renderer.snapshotArea(a.x, a.y, a.w, a.h, (img) => {
                        void fetch(`/__snap?name=${name}`, { method: 'POST', body: (img as HTMLImageElement).src }).then(() => res(name));
                    });
                }),
        };
    }
}
