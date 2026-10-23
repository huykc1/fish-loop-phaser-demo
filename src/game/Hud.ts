import * as Phaser from 'phaser';
import { DEPTH, HUD } from './layout';
import { label } from './ui';

export interface HudState {
    level: string;
    /** số nấc đang trên ống / giới hạn N */
    onPipe: number;
    limit: number;
    undo: number;
    shuffle: number;
    addBus: number;
    canUndo: boolean;
    canShuffle: boolean;
    /** đang chọn xe để Shuffle */
    picking: boolean;
    canAddBus: boolean;
}

interface Booster {
    root: Phaser.GameObjects.Container;
    img: Phaser.GameObjects.Image;
    badge: Phaser.GameObjects.Container;
    count: Phaser.GameObjects.Text;
    enabled: boolean;
}

/** HUD theo ảnh mẫu: khung Level, khung đếm xe, nút cài đặt, 3 nút booster có huy hiệu số. */
export class Hud {
    private levelText: Phaser.GameObjects.Text;
    private countText: Phaser.GameObjects.Text;
    private counter: Phaser.GameObjects.Container;
    private boosters: Record<'undo' | 'shuffle' | 'addBus', Booster>;
    private sig = '';
    private lastDone = -1;

    constructor(
        private scene: Phaser.Scene,
        handlers: { undo: () => void; shuffle: () => void; addBus: () => void; settings: () => void },
    ) {
        const s = scene;
        const lp = s.add.container(HUD.levelPill.x, HUD.levelPill.y).setDepth(DEPTH.hud);
        lp.add(s.add.image(0, 0, 'hud_pill'));
        this.levelText = label(s, 0, -3, 'Level 1', 50);
        lp.add(this.levelText);

        this.counter = s.add.container(HUD.counter.x, HUD.counter.y).setDepth(DEPTH.hud);
        this.counter.add(s.add.image(0, 0, 'hud_counter'));
        this.countText = label(s, 30, -3, '0/0', 50);
        this.counter.add(this.countText);

        const gear = s.add.image(HUD.gear.x, HUD.gear.y, 'btn_gear').setDepth(DEPTH.hud).setInteractive({ useHandCursor: true });
        gear.on('pointerdown', () => {
            s.tweens.add({ targets: gear, angle: gear.angle + 90, scale: 0.9, duration: 160, yoyo: false, ease: 'Quad.easeOut', onComplete: () => gear.setScale(1) });
            handlers.settings();
        });

        const mk = (x: number, key: string, onClick: () => void): Booster => {
            const root = s.add.container(x, HUD.buttonsY).setDepth(DEPTH.hud);
            const img = s.add.image(0, 0, key);
            const badge = s.add.container(46, 46);
            badge.add(s.add.image(0, 0, 'badge'));
            const count = label(s, 0, -2, '0', 32);
            badge.add(count);
            root.add([img, badge]);
            root.setSize(130, 132);
            root.setInteractive({ useHandCursor: true });
            const b: Booster = { root, img, badge, count, enabled: true };
            root.on('pointerdown', () => {
                s.tweens.add({ targets: root, scale: 0.88, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
                if (b.enabled) onClick();
                else this.nudge(root);
            });
            return b;
        };
        this.boosters = {
            undo: mk(HUD.undoX, 'btn_undo', handlers.undo),
            shuffle: mk(HUD.shuffleX, 'btn_shuffle', handlers.shuffle),
            addBus: mk(HUD.addBusX, 'btn_bus', handlers.addBus),
        };

        // HUD trượt vào khi bắt đầu
        for (const o of [lp, this.counter, gear]) {
            const y = o.y;
            o.y = y - 200;
            s.tweens.add({ targets: o, y, duration: 600, delay: 100, ease: 'Back.easeOut' });
        }
        Object.values(this.boosters).forEach((b, i) => {
            const y = b.root.y;
            b.root.y = y + 260;
            s.tweens.add({ targets: b.root, y, duration: 600, delay: 200 + i * 80, ease: 'Back.easeOut' });
        });
    }

    private nudge(o: Phaser.GameObjects.Container) {
        const x = o.x;
        this.scene.tweens.add({ targets: o, x: { from: x - 10, to: x }, duration: 300, ease: 'Elastic.easeOut', easeParams: [1, 0.2] });
    }

    /** vị trí khung đếm (cho hiệu ứng ngôi sao bay về) */
    counterPos() {
        return { x: this.counter.x - 70, y: this.counter.y };
    }

    update(st: HudState) {
        const sig = JSON.stringify(st);
        if (sig === this.sig) return;
        this.sig = sig;
        this.levelText.setText(st.level);
        this.countText.setText(`${st.onPipe}/${st.limit}`);
        this.countText.setColor(st.onPipe >= st.limit ? '#ffb4a8' : '#ffffff');
        if (this.lastDone >= 0 && st.onPipe !== this.lastDone) {
            this.scene.tweens.killTweensOf(this.counter);
            this.counter.setScale(1);
            this.scene.tweens.add({ targets: this.counter, scale: st.onPipe > this.lastDone ? 1.14 : 0.92, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
        }
        this.lastDone = st.onPipe;
        const set = (b: Booster, n: number, can: boolean, offKey?: string, onKey?: string) => {
            b.enabled = can;
            b.count.setText(String(n));
            b.badge.setVisible(n > 0);
            if (offKey && onKey) b.img.setTexture(can ? onKey : offKey);
            else if (can) b.img.clearTint();
            else b.img.setTint(0x9a9ab5);
            b.root.setAlpha(can || n > 0 ? 1 : 0.85);
        };
        set(this.boosters.undo, st.undo, st.canUndo, 'btn_undo_off', 'btn_undo');
        set(this.boosters.shuffle, st.shuffle, st.canShuffle || st.picking);
        // nút Shuffle sáng lên khi đang chọn xe
        this.scene.tweens.killTweensOf(this.boosters.shuffle.img);
        this.boosters.shuffle.img.setScale(1);
        if (st.picking) this.scene.tweens.add({ targets: this.boosters.shuffle.img, scale: 1.1, duration: 300, yoyo: true, repeat: -1 });
        set(this.boosters.addBus, st.addBus, st.canAddBus);
    }
}
