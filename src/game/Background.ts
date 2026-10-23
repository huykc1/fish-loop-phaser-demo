import * as Phaser from 'phaser';
import { DEPTH } from './layout';

type NoiseObj = Phaser.GameObjects.GameObject & { noiseOffset: number[]; setRenderToTexture(key: string): unknown; setActive(v: boolean): unknown };

/**
 * Nền đáy biển: nước xanh ngọc + vân sáng (caustics) động + viền san hô cắt từ ảnh mẫu + bọt khí bay lên.
 */
export class Background {
    private caustics?: NoiseObj;
    private causticsImg?: Phaser.GameObjects.Image;
    private ambient: Phaser.GameObjects.Particles.ParticleEmitter;
    private t = 0;

    constructor(scene: Phaser.Scene) {
        const W = 1080, H = 1920;
        scene.add.image(W / 2, H / 2, 'waterBase').setDisplaySize(W, H).setDepth(DEPTH.water);

        // vân sáng dưới nước: nhiễu tế bào 3D vẽ vào texture nhỏ (1/4) rồi phóng to – rẻ hơn nhiều so với vẽ toàn màn hình
        const add = scene.add as unknown as { noisecell3d?: (...a: unknown[]) => Phaser.GameObjects.GameObject };
        if (add.noisecell3d) {
            const n = add.noisecell3d(
                {
                    noiseCells: [5, 9, 4],
                    noiseIterations: 1,
                    noiseMode: 2,
                    noiseSmoothing: 0.6,
                    noiseColorStart: [0, 0, 0, 0],
                    noiseColorEnd: [0.75, 0.97, 1, 0.7],
                },
                0,
                0,
                W / 4,
                H / 4,
            ) as unknown as NoiseObj;
            n.setRenderToTexture('caustics');
            this.caustics = n;
            this.causticsImg = scene.add
                .image(W / 2, H / 2, 'caustics')
                .setDisplaySize(W, H)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setAlpha(0.45)
                .setDepth(DEPTH.caustics);
        }

        scene.add.image(W / 2, H / 2, 'bg_frame').setDepth(DEPTH.frame);

        this.ambient = scene.add
            .particles(0, 0, 'bubble', {
                x: { min: 0, max: W },
                y: H + 30,
                speedY: { min: -60, max: -150 },
                speedX: { min: -12, max: 12 },
                lifespan: 14000,
                frequency: 420,
                scale: { min: 0.25, max: 0.8 },
                alpha: { start: 0.65, end: 0.1 },
            })
            .setDepth(DEPTH.ambient);
        this.ambient.fastForward(9000);
    }

    setQuality(high: boolean) {
        this.causticsImg?.setVisible(high);
        this.caustics?.setActive(high);
        this.ambient.setVisible(high);
    }

    update(dt: number) {
        this.t += dt;
        if (this.caustics) {
            const o = this.caustics.noiseOffset;
            o[0] = Math.sin(this.t * 0.05) * 0.3;
            o[1] = this.t * 0.02;
            o[2] = this.t * 0.18;
        }
    }
}
