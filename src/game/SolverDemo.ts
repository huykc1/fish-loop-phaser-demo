import * as Phaser from 'phaser';
import { FIXED_DT, type Sim } from '../core/sim';
import type { TimelineTap } from '../core/solver';
import { tankOffset } from './BusView';
import type { Board } from './Board';
import { DEPTH } from './layout';

/** Thời gian (giây) để bàn tay ấn xuống rồi nhấc lên. */
const PRESS = 0.2;
/** Thời gian bàn tay bay tới xe kế tiếp (tối đa). */
const TRAVEL = 0.5;
/** Lúc giơ lên, đầu ngón trỏ lơ lửng cao hơn điểm ấn chừng này px. */
const HOVER = 18;
/** Cỡ bàn tay so với ảnh gốc (190px rộng). */
const HAND_SCALE = 0.78;

type Origins = Record<'up' | 'down', { originX: number; originY: number }>;

type Pt = { x: number; y: number };

/**
 * Tự chơi theo lời giải của solver: tự bước mô phỏng 60Hz và tap đúng bước đã lập lịch
 * (nên chắc chắn thắng), bàn tay bay tới từng xe và ấn xuống đúng lúc tap.
 */
export class SolverDemo {
    private hand: Phaser.GameObjects.Image;
    private ring: Phaser.GameObjects.Image;
    private step = 0;
    private acc = 0;
    private next = 0;
    private from: Pt;
    private home: Pt = { x: 900, y: 2050 };
    private origins: Origins;
    done = false;

    constructor(
        private scene: Phaser.Scene,
        private sim: Sim,
        private board: Board,
        private taps: TimelineTap[],
        private onTap: (bus: number) => void,
    ) {
        this.origins = scene.cache.json.get('hand') as Origins;
        this.hand = scene.add.image(this.home.x, this.home.y, 'hand_up').setDepth(DEPTH.toast - 1).setScale(HAND_SCALE);
        this.setState('up');
        this.ring = scene.add.image(0, 0, 'ring').setDepth(DEPTH.toast - 2).setAlpha(0);
        this.from = { ...this.home };
    }

    /** đổi trạng thái tay; gốc toạ độ luôn ở đầu ngón trỏ của trạng thái đó */
    private setState(s: 'up' | 'down') {
        const o = this.origins[s];
        this.hand.setTexture(`hand_${s}`).setOrigin(o.originX, o.originY);
    }

    /** điểm bàn tay ấn trên xe: giữa hàng bể */
    private target(bus: number): Pt {
        const v = this.board.views[bus];
        if (!v) return this.home;
        const a = tankOffset(v.bus.rot, 1), b = tankOffset(v.bus.rot, 2);
        return { x: v.x + ((a.x + b.x) / 2) * v.base, y: v.y + ((a.y + b.y) / 2) * v.base + 10 };
    }

    update(dt: number) {
        if (this.done) return;
        this.acc += Math.min(dt, 0.1);
        while (this.acc >= FIXED_DT) {
            this.acc -= FIXED_DT;
            while (this.next < this.taps.length && this.taps[this.next].step === this.step) {
                const t = this.taps[this.next++];
                this.press(t.bus);
            }
            this.sim.step(FIXED_DT);
            this.step++;
            if (this.sim.status !== 'playing') break;
        }
        this.moveHand();
        if (this.sim.status !== 'playing' || (this.next >= this.taps.length && this.step > (this.taps.at(-1)?.step ?? 0) + 60)) this.leave();
    }

    private press(bus: number) {
        const p = this.target(bus);
        this.hand.setPosition(p.x, p.y);
        this.from = { x: p.x, y: p.y - HOVER };
        this.setState('down');
        this.scene.tweens.add({ targets: this.hand, scaleX: HAND_SCALE * 0.96, scaleY: HAND_SCALE * 0.93, duration: (PRESS / 2) * 1000, yoyo: true, ease: 'Quad.easeOut' });
        this.scene.time.delayedCall(PRESS * 1000, () => {
            this.setState('up');
            this.hand.setPosition(this.from.x, this.from.y);
        });
        this.ring.setPosition(p.x, p.y).setScale(0.2).setAlpha(0.9);
        this.scene.tweens.add({ targets: this.ring, scale: 1.1, alpha: 0, duration: 420, ease: 'Quad.easeOut' });
        this.onTap(bus);
    }

    /** bàn tay bay tới xe của lần tap kế tiếp, đến nơi đúng lúc tap */
    private moveHand() {
        const t = this.taps[this.next];
        if (!t) return;
        const now = this.step * FIXED_DT;
        const prev = this.next > 0 ? this.taps[this.next - 1].step * FIXED_DT + PRESS : now - TRAVEL;
        const at = t.step * FIXED_DT;
        const start = Math.max(prev, at - TRAVEL);
        const tp = this.target(t.bus);
        const to = { x: tp.x, y: tp.y - HOVER };
        if (now < start) {
            // chờ: lơ lửng nhẹ tại chỗ
            this.hand.y = this.from.y - Math.abs(Math.sin(now * 4)) * 6;
            return;
        }
        const k = Math.min(1, (now - start) / Math.max(0.05, at - start));
        const e = k * k * (3 - 2 * k);
        this.hand.setPosition(this.from.x + (to.x - this.from.x) * e, this.from.y + (to.y - this.from.y) * e - Math.sin(Math.PI * e) * 40);
    }

    private leave() {
        if (this.done) return;
        this.done = true;
        this.scene.tweens.add({ targets: this.hand, x: this.home.x, y: this.home.y, alpha: 0, duration: 600, ease: 'Quad.easeIn', onComplete: () => this.destroy() });
    }

    destroy() {
        this.done = true;
        this.scene.tweens.killTweensOf(this.hand);
        this.hand.destroy();
        this.ring.destroy();
    }
}
