import * as Phaser from 'phaser';
import { DEPTH } from './layout';

export const FONT = 'Fredoka, "Arial Rounded MT Bold", Arial, sans-serif';

export function label(scene: Phaser.Scene, x: number, y: number, text: string, size = 52, color = '#ffffff') {
    return scene.add
        .text(x, y, text, {
            fontFamily: FONT,
            fontSize: `${size}px`,
            fontStyle: '700',
            color,
            stroke: '#1d1f7a',
            strokeThickness: Math.round(size / 7),
            shadow: { offsetX: 0, offsetY: Math.round(size / 14), color: '#0b0f4a', blur: 0, fill: true, stroke: true },
        })
        .setOrigin(0.5);
}

/** nút bấm có hiệu ứng nhún; skin = ảnh cắt từ ảnh mẫu, kéo giãn kiểu 9-slice */
export function button(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    onClick: () => void,
    skin: 'primary' | 'grey' = 'primary',
) {
    const c = scene.add.container(x, y);
    const bg = scene.add.nineslice(0, 0, skin === 'primary' ? 'btn_blank' : 'btn_grey', undefined, w, h, 42, 42, 42, 42);
    const t = label(scene, 0, -4, text, Math.min(54, h * 0.42));
    c.add([bg, t]);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => scene.tweens.add({ targets: c, scale: 0.92, duration: 70, yoyo: true, ease: 'Quad.easeOut' }));
    c.on('pointerup', () => onClick());
    return c;
}

/** Popup giữa màn hình: nền tối mờ + khung (9-slice từ khung HUD) bật nảy ra. */
export class Popup {
    readonly root: Phaser.GameObjects.Container;
    private dim: Phaser.GameObjects.Image;

    constructor(private scene: Phaser.Scene, w: number, h: number) {
        this.dim = scene.add.image(540, 960, 'pixel').setDisplaySize(1080, 1920).setTint(0x050a30).setAlpha(0).setDepth(DEPTH.popup);
        this.dim.setInteractive();
        this.root = scene.add.container(540, 900).setDepth(DEPTH.popup + 1);
        const panel = scene.add.nineslice(0, 0, 'panel', undefined, w, h, 70, 70, 70, 80);
        this.root.add(panel);
        this.root.setScale(0.6).setAlpha(0);
        scene.tweens.add({ targets: this.dim, alpha: 0.6, duration: 220 });
        scene.tweens.add({ targets: this.root, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut', easeParams: [1.8] });
    }

    add(o: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]) {
        this.root.add(o);
        return this;
    }

    close(then?: () => void) {
        this.scene.tweens.add({ targets: this.dim, alpha: 0, duration: 180 });
        this.scene.tweens.add({
            targets: this.root,
            scale: 0.7,
            alpha: 0,
            duration: 180,
            ease: 'Quad.easeIn',
            onComplete: () => {
                this.dim.destroy();
                this.root.destroy();
                then?.();
            },
        });
    }
}
