import * as Phaser from 'phaser';
import { COLORS } from '../core/types';
import { buildTextures } from '../game/textures';

const IMAGES = [
    'bus_body',
    'bus_stop',
    'bus_v_front',
    'bus_v_rear',
    'hand_up',
    'hand_down',
    'hud_pill',
    'hud_counter',
    'btn_gear',
    'btn_undo',
    'btn_undo_off',
    'btn_shuffle',
    'btn_bus',
    'btn_blank',
    'inlet_pipe',
    'outlet_pipe',
];

/** Nạp ảnh, vẽ texture phụ, chờ font rồi vào Game. */
export class Boot extends Phaser.Scene {
    constructor() {
        super('Boot');
    }

    preload() {
        const bar = this.add.graphics();
        this.load.on('progress', (v: number) => {
            bar.clear();
            bar.fillStyle(0xffffff, 0.25).fillRoundedRect(290, 950, 500, 26, 13);
            bar.fillStyle(0xffffff, 1).fillRoundedRect(290, 950, 500 * v, 26, 13);
        });
        this.load.setPath('assets/');
        for (const k of IMAGES) this.load.image(k, `${k}.png`);
        this.load.image('bg_frame', 'bg_frame.webp');
        this.load.json('bus_v', 'bus_v.json');
        this.load.json('hand', 'hand.json');
        for (const c of COLORS) this.load.image(`fish_${c}`, `fish/fish_${c}.webp`);
    }

    async create() {
        buildTextures(this);
        try {
            await Promise.race([document.fonts.load('700 40px Fredoka'), new Promise((r) => setTimeout(r, 1500))]);
        } catch {
            /* dùng font dự phòng */
        }
        // ?promo=endcard|logo|icon mở cảnh quảng cáo thay cho màn chơi
        this.scene.start(new URLSearchParams(location.search).has('promo') ? 'Promo' : 'Game');
    }
}
