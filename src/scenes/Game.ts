import * as Phaser from 'phaser';
import { Sim } from '../core/sim';
import { planTimeline, solveLevel } from '../core/solver';
import { SolverDemo } from '../game/SolverDemo';
import type { LevelDef } from '../core/types';
import { Background } from '../game/Background';
import { Board } from '../game/Board';
import { Hud } from '../game/Hud';
import { DEPTH } from '../game/layout';
import { LEVELS } from '../game/levels';
import { loadSave, writeSave, PLAYTEST_KEY } from '../game/storage';
import { sfx } from '../game/audio';
import { button, label, Popup } from '../game/ui';
import { showLose, showWin } from '../game/ResultScreens';

const params = new URLSearchParams(location.search);
const isPlaytest = params.has('playtest');

/** Màn chơi: nền + bàn chơi + HUD; điều phối Sim, âm thanh, popup thắng/thua/cài đặt. */
export class Game extends Phaser.Scene {
    private save = loadSave();
    private sim!: Sim;
    private board: Board | null = null;
    private hud!: Hud;
    private bg!: Background;
    private levelIndex = 0;
    private levelDef!: LevelDef;
    private popup: Popup | null = null;
    private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
    private quality: 'high' | 'low' = 'high';
    private perf = { samples: [] as number[], win: 0, good: 0 };
    /** đang tự chơi theo lời giải (bàn tay) */
    private demo: SolverDemo | null = null;
    private demoBanner: Phaser.GameObjects.Text | null = null;
    /** chỉ dùng khi test tự động: tua nhanh mô phỏng */
    private speed = 1;

    constructor() {
        super('Game');
    }

    create() {
        sfx.enabled = this.save.sound;
        this.quality = this.save.quality === 'low' ? 'low' : 'high';
        this.bg = new Background(this);
        this.bg.setQuality(this.quality === 'high');
        this.hud = new Hud(this, {
            undo: () => this.useBooster('undo'),
            shuffle: () => this.useBooster('shuffle'),
            addBus: () => this.useBooster('addBus'),
            settings: () => this.openSettings(),
        });
        this.confetti = this.add
            .particles(0, 0, 'confetti', {
                emitting: false,
                x: { min: 0, max: 1080 },
                y: -40,
                speedY: { min: 300, max: 700 },
                speedX: { min: -160, max: 160 },
                gravityY: 260,
                lifespan: 3200,
                rotate: { onEmit: () => Math.random() * 360, onUpdate: (p) => p.angle + 9 },
                scaleX: { onEmit: () => 0.8 + Math.random() * 0.6, onUpdate: (p, _k, t) => Math.cos(t * 30 + p.x) * 1.1 },
                scaleY: { min: 0.8, max: 1.3 },
                tint: [0xff5326, 0xffd23a, 0x3fd94a, 0x2f8bff, 0xa24bff, 0xff5fb8, 0x22d8e0],
            })
            .setDepth(DEPTH.popup + 5);

        this.add
            .text(1068, 1910, __APP_VERSION__, { fontFamily: 'Arial', fontSize: '20px', color: '#ffffff' })
            .setOrigin(1, 1)
            .setAlpha(0.45)
            .setDepth(DEPTH.hud);

        this.input.once('pointerdown', () => sfx.unlock());
        // chơi thử trong editor: Esc báo editor đóng màn chơi thử
        if (isPlaytest && window.parent !== window) {
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') window.parent.postMessage({ type: 'fishloop:close-playtest' }, location.origin);
            });
        }
        this.levelIndex = Math.min(this.save.current, LEVELS.length - 1);
        this.startLevel(this.levelIndex);

        // móc cho test tự động / debug
        const scene = this;
        (window as unknown as { __fishloop: unknown }).__fishloop = {
            get sim() {
                return scene.sim;
            },
            start: (i: number) => scene.startLevel(i),
            speed: (v: number) => (scene.speed = v),
            demo: () => scene.startDemo(),
            /** tự chơi theo lời giải của solver (test hình ảnh / hiệu ứng) */
            autoplay: async () => {
                const r = solveLevel(scene.levelDef, 30000, 8000);
                const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
                for (const m of r.moves) {
                    const sim = scene.sim;
                    if (sim.status !== 'playing') break;
                    if (m >= 0) {
                        sim.tap(m);
                        while (sim.pendingTotal() > 0 && sim.status === 'playing') await wait(50);
                    } else await wait((sim.loopTime * 1000 * 1.05) / scene.speed);
                }
                return r.status;
            },
        };
    }

    // ---------------- Level ----------------
    private getLevel(i: number): LevelDef {
        if (isPlaytest) {
            try {
                const raw = localStorage.getItem(PLAYTEST_KEY);
                if (raw) return JSON.parse(raw);
            } catch {
                /* ignore */
            }
        }
        return structuredClone(LEVELS[i]);
    }

    private startLevel(i: number) {
        this.stopDemo();
        this.closePopup();
        this.levelIndex = i;
        this.levelDef = this.getLevel(i);
        if (!isPlaytest) {
            this.save.current = i;
            writeSave(this.save);
        }
        this.sim = new Sim(this.levelDef);
        this.boostersUsed = 0;
        this.board?.destroy();
        this.picking = false;
        this.board = new Board(this, this.sim, (id) => {
            sfx.unlock();
            if (this.popup) return;
            if (this.demo) return this.stopDemo();
            if (this.picking) return this.pickBus(id);
            if (this.sim.tap(id)) sfx.play('release');
        });
        this.board.quality = this.quality;
        this.board.onComplete = () => sfx.play('complete');
        this.cameras.main.fadeIn(300, 10, 40, 90);
        this.updateHud();
    }

    private updateHud() {
        const s = this.sim, b = s.boosters;
        this.hud.update({
            level: isPlaytest ? 'Test' : `Level ${this.levelDef.id}`,
            onPipe: s.onPipe(),
            limit: s.limit,
            undo: b.undo,
            shuffle: b.shuffle,
            addBus: b.addBus,
            canUndo: s.canUndo(),
            canShuffle: s.canShuffle(),
            picking: this.picking,
            canAddBus: s.canAddBus(),
        });
    }

    // ---------------- Booster ----------------
    /** đang chờ người chơi chọn xe để Shuffle */
    private picking = false;
    /** số booster đã dùng trong màn (tính sao khi thắng) */
    private boostersUsed = 0;

    private useBooster(kind: 'undo' | 'shuffle' | 'addBus') {
        sfx.unlock();
        const s = this.sim;
        if (kind === 'shuffle') {
            if (this.picking) return this.setPicking(false);
            if (!s.canShuffle()) {
                sfx.play('deny');
                return this.toast('Không có xe nào xáo được');
            }
            this.closePopup();
            this.setPicking(true);
            return this.toast('Chọn 1 xe để xáo');
        }
        this.setPicking(false);
        const ok = kind === 'undo' ? s.useUndo() : s.useAddBus();
        if (ok) {
            sfx.play('booster');
            this.boostersUsed++;
            this.closePopup();
        } else {
            sfx.play('deny');
            this.toast(kind === 'undo' ? 'Không trả về được' : 'Không thể thêm xe');
        }
    }

    private setPicking(on: boolean) {
        this.picking = on;
        this.board?.views.forEach((v, i) => {
            const can = on && this.sim.canShuffleBus(i);
            v.setPickable(can);
            v.setDimmed(on && !can);
        });
    }

    private pickBus(id: number) {
        if (this.sim.useShuffle(id)) {
            sfx.play('booster');
            this.boostersUsed++;
            this.setPicking(false);
        } else {
            sfx.play('deny');
            this.board?.views[id]?.shake();
        }
    }

    private toast(msg: string) {
        const t = label(this, 540, 1560, msg, 50).setDepth(DEPTH.toast).setAlpha(0).setScale(0.7);
        this.tweens.add({ targets: t, alpha: 1, scale: 1, y: 1520, duration: 220, ease: 'Back.easeOut' });
        this.tweens.add({ targets: t, alpha: 0, y: 1480, delay: 900, duration: 300, onComplete: () => t.destroy() });
    }

    // ---------------- Popup ----------------
    private closePopup(then?: () => void) {
        if (!this.popup) {
            then?.();
            return;
        }
        const p = this.popup;
        this.popup = null;
        p.close(then);
    }

    private onWin() {
        sfx.play('win');
        if (!isPlaytest) {
            this.save.unlocked = Math.max(this.save.unlocked, Math.min(this.levelIndex + 1, LEVELS.length - 1));
            this.save.current = Math.min(this.levelIndex + 1, LEVELS.length - 1);
            writeSave(this.save);
        }
        this.confetti.explode(120);
        this.time.delayedCall(350, () => this.confetti.explode(80));
        const last = this.levelIndex >= LEVELS.length - 1;
        this.time.delayedCall(900, () => {
            if (this.sim.status !== 'won') return;
            this.popup = showWin(
                this,
                {
                    level: this.levelDef.id,
                    stars: Math.max(1, 3 - this.boostersUsed),
                    buses: this.sim.completed,
                    moves: this.sim.moves,
                    nextLabel: isPlaytest ? null : last ? 'Về màn 1' : 'Màn tiếp',
                    onNext: () => this.startLevel(last ? 0 : this.levelIndex + 1),
                    onRetry: () => this.startLevel(this.levelIndex),
                },
                () => sfx.play('complete'),
            );
        });
    }

    private onLose() {
        sfx.play('lose');
        this.cameras.main.shake(300, 0.006);
        this.time.delayedCall(600, () => {
            if (this.sim.status !== 'lost' || this.popup) return;
            const s = this.sim;
            this.popup = showLose(
                this,
                [
                    { key: 'btn_undo', name: 'Trả về', count: s.boosters.undo, enabled: s.canUndo(), use: () => this.useBooster('undo') },
                    { key: 'btn_shuffle', name: 'Xáo xe', count: s.boosters.shuffle, enabled: s.canShuffle(), use: () => this.useBooster('shuffle') },
                    { key: 'btn_bus', name: 'Thêm xe', count: s.boosters.addBus, enabled: s.canAddBus(), use: () => this.useBooster('addBus') },
                ],
                () => this.startLevel(this.levelIndex),
            );
        });
    }

    private openSettings() {
        if (this.popup) return;
        const p = (this.popup = new Popup(this, 800, 1120));
        const sound = button(this, 0, -250, 520, 110, `Âm thanh: ${this.save.sound ? 'Bật' : 'Tắt'}`, () => {
            this.save.sound = !this.save.sound;
            sfx.enabled = this.save.sound;
            writeSave(this.save);
            (sound.list[1] as Phaser.GameObjects.Text).setText(`Âm thanh: ${this.save.sound ? 'Bật' : 'Tắt'}`);
        });
        const qName = () => (this.save.quality === 'low' ? 'Tiết kiệm' : this.save.quality === 'high' ? 'Cao' : 'Tự động');
        const qual = button(this, 0, -120, 520, 110, `Đồ hoạ: ${qName()}`, () => {
            this.save.quality = this.save.quality === 'auto' ? 'high' : this.save.quality === 'high' ? 'low' : 'auto';
            writeSave(this.save);
            this.setQuality(this.save.quality === 'low' ? 'low' : 'high');
            (qual.list[1] as Phaser.GameObjects.Text).setText(`Đồ hoạ: ${qName()}`);
        });
        const items: Phaser.GameObjects.GameObject[] = [label(this, 0, -400, 'Cài đặt', 80), sound, qual];
        if (!isPlaytest) {
            LEVELS.forEach((l, i) => {
                const unlocked = i <= this.save.unlocked;
                // 5 ô mỗi hàng
                const b = button(this, -260 + (i % 5) * 130, 20 + Math.floor(i / 5) * 105, 110, 92, String(l.id), () => unlocked && this.startLevel(i), unlocked ? 'primary' : 'grey');
                if (i === this.levelIndex) b.setScale(1.1);
                items.push(b);
            });
        }
        items.push(button(this, 0, 450, 520, 100, 'Xem lời giải', () => this.closePopup(() => this.startDemo())));
        items.push(button(this, -170, 330, 300, 110, 'Chơi lại', () => this.startLevel(this.levelIndex), 'grey'));
        items.push(button(this, 170, 330, 300, 110, 'Tiếp tục', () => this.closePopup()));
        p.add(items);
    }

    // ---------------- Xem lời giải ----------------
    /** chơi lại màn và để bàn tay tự chơi theo lời giải của solver */
    startDemo() {
        this.stopDemo();
        this.toast('Đang tìm lời giải…');
        // cho toast kịp hiện rồi mới giải (giải chặn luồng); màn chỉ khởi động lại SAU khi có lời giải,
        // và bàn tay gắn vào ngay trong cùng khung hình để mô phỏng bắt đầu đúng bước 0 như lịch tap
        this.time.delayedCall(80, () => {
            const def = this.getLevel(this.levelIndex);
            const r = solveLevel(def, 60000, 12000);
            const plan = r.status === 'solved' ? planTimeline(def, r.moves) : { taps: [], won: false };
            if (!plan.won) {
                this.toast('Chưa tìm được lời giải');
                return;
            }
            this.startLevel(this.levelIndex);
            if (!this.board) return;
            this.demo = new SolverDemo(this, this.sim, this.board, plan.taps, (bus) => {
                if (this.sim.tap(bus)) sfx.play('release');
            });
            this.demoBanner = label(this, 540, 250, 'Xem lời giải · chạm để dừng', 40).setDepth(DEPTH.toast);
            this.tweens.add({ targets: this.demoBanner, alpha: { from: 1, to: 0.55 }, duration: 700, yoyo: true, repeat: -1 });
        });
    }

    /** dừng tự chơi: người chơi tiếp tục từ trạng thái hiện tại */
    private stopDemo() {
        this.demo?.destroy();
        this.demo = null;
        this.demoBanner?.destroy();
        this.demoBanner = null;
    }

    private setQuality(q: 'high' | 'low') {
        this.quality = q;
        if (this.board) this.board.quality = q;
        this.bg.setQuality(q === 'high');
    }

    /** tự hạ chất lượng khi máy yếu */
    /**
     * Tự chỉnh đồ hoạ (chế độ Tự động): đo trung vị thời gian khung hình trong cửa sổ 4 giây.
     * Bỏ qua khung giật đơn lẻ (> 100 ms: solver, chuyển tab…). Chậm kéo dài (trung vị > 26 ms) → Tiết kiệm;
     * đang Tiết kiệm mà mượt lại (trung vị < 18 ms) 2 cửa sổ liên tiếp → bật lại đồ hoạ cao.
     */
    private perfSample(ms: number) {
        if (this.save.quality !== 'auto') return;
        const p = this.perf;
        if (ms > 100) return;
        p.samples.push(ms);
        p.win += ms;
        if (p.win < 4000) return;
        const sorted = [...p.samples].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)];
        p.samples = [];
        p.win = 0;
        if (this.quality === 'high' && med > 26) {
            this.setQuality('low');
            p.good = 0;
        } else if (this.quality === 'low') {
            p.good = med < 18 ? p.good + 1 : 0;
            if (p.good >= 2) this.setQuality('high');
        }
    }

    update(_time: number, deltaMs: number) {
        const dt = Math.min(deltaMs / 1000, 0.1);
        this.perfSample(deltaMs);
        this.bg.update(dt);
        if (this.demo && !this.demo.done) this.demo.update(dt * this.speed);
        else if (!this.popup || this.sim.status !== 'playing') this.sim.update(dt * this.speed);
        if (this.demo?.done && this.demoBanner) {
            this.demoBanner.destroy();
            this.demoBanner = null;
        }
        const ev = this.sim.drainEvents();
        if (ev.length && this.board) {
            this.board.handleEvents(ev);
            for (const e of ev) {
                if (e.type === 'absorb') sfx.play('absorb');
                else if (e.type === 'pipeFull') {
                    sfx.play('deny');
                    this.toast('Ống đầy!');
                } else if (e.type === 'denied') sfx.play('deny');
                else if (e.type === 'win') this.onWin();
                else if (e.type === 'lose') this.onLose();
            }
        }
        this.board?.update(dt);
        this.updateHud();
    }
}
