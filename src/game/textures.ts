import * as Phaser from 'phaser';
import { TANK_H, TANK_W } from '../core/geometry';
import { COLORS } from '../core/types';
import { PALETTE } from './palette';

/**
 * Texture vẽ bằng Canvas 2D lúc khởi động: bể kính, nước, bọt, tia sáng, pháo giấy…
 * Ảnh cắt từ ảnh mẫu (xe, nút, HUD) nằm trong public/assets và được nạp ở Boot.
 */
type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw) {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) return;
    draw(tex.getContext(), w, h);
    tex.refresh();
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
}

/** trộn 2 màu hex (t=0 → a, t=1 → b), trả về rgba() */
function mix(a: number, b: number, t: number, alpha = 1) {
    const ch = (c: number, sh: number) => (c >> sh) & 255;
    const m = (sh: number) => Math.round(ch(a, sh) * (1 - t) + ch(b, sh) * t);
    return `rgba(${m(16)},${m(8)},${m(0)},${alpha})`;
}

/** mực nước khi bể đầy (tỉ lệ chiều cao) – phía trên chừa khoảng trống như ảnh mẫu */
export const WATER_FULL = 0.9;

/**
 * Bể nước theo từng màu, giống "khối thạch" trong ảnh mẫu:
 *  tw_<màu>: khối nước (đậm dần xuống đáy, mép trong phát sáng, vân sáng)
 *  tf_<màu>: lớp phủ trước cá (nhuộm màu cho cá như chìm trong nước, bọt khí, vệt bóng)
 *  tr_<màu>: viền kính ánh màu nước
 */
function buildTankTextures(scene: Phaser.Scene) {
    const TW = TANK_W, TH = TANK_H, R = 20;
    const W = 0xffffff;
    for (const c of COLORS) {
        const { main, dark } = PALETTE[c];
        make(scene, `tw_${c}`, TW, TH, (g) => {
            g.save();
            rr(g, 4, 4, TW - 8, TH - 8, R - 3);
            g.clip();
            const gr = g.createLinearGradient(0, 0, 0, TH);
            gr.addColorStop(0, mix(main, W, 0.12, 0.9));
            gr.addColorStop(0.5, mix(main, main, 0, 0.9));
            gr.addColorStop(1, mix(main, dark, 0.45, 0.95));
            g.fillStyle = gr;
            g.fillRect(0, 0, TW, TH);
            // lòng nước sâu và trong hơn ở giữa
            const rad = g.createRadialGradient(TW / 2, TH * 0.55, 4, TW / 2, TH * 0.55, TW * 0.6);
            rad.addColorStop(0, mix(dark, dark, 0, 0.42));
            rad.addColorStop(1, mix(dark, dark, 0, 0));
            g.fillStyle = rad;
            g.fillRect(0, 0, TW, TH);
            // mép trong phát sáng như neon
            g.shadowColor = mix(main, W, 0.6, 1);
            g.shadowBlur = 12;
            g.lineWidth = 8;
            g.strokeStyle = mix(main, W, 0.7, 0.95);
            rr(g, 1, 1, TW - 2, TH - 2, R);
            g.stroke();
            g.shadowBlur = 0;
            // vân sáng mờ trong nước
            g.strokeStyle = 'rgba(255,255,255,0.14)';
            g.lineWidth = 2;
            for (let k = 0; k < 3; k++) {
                g.beginPath();
                const y0 = TH * (0.35 + k * 0.2);
                for (let x = 8; x <= TW - 8; x += 4) g.lineTo(x, y0 + Math.sin(x * 0.11 + k * 2) * 4);
                g.stroke();
            }
            g.restore();
        });
        make(scene, `tf_${c}`, TW, TH, (g) => {
            g.save();
            rr(g, 4, 4, TW - 8, TH - 8, R - 3);
            g.clip();
            g.fillStyle = mix(main, main, 0, 0.32);
            g.fillRect(0, 0, TW, TH);
            // bọt khí nhỏ
            const bubbles = [
                [0.78, 0.3, 3.5], [0.84, 0.42, 2.5], [0.72, 0.55, 2], [0.22, 0.72, 3], [0.3, 0.84, 2], [0.86, 0.78, 2.8], [0.5, 0.36, 1.8],
            ];
            for (const [bx, by, br] of bubbles) {
                g.beginPath();
                g.arc(TW * bx, TH * by, br, 0, Math.PI * 2);
                g.fillStyle = 'rgba(255,255,255,0.18)';
                g.fill();
                g.lineWidth = 1.2;
                g.strokeStyle = 'rgba(255,255,255,0.8)';
                g.stroke();
            }
            // vệt bóng chéo
            const gl = g.createLinearGradient(0, 0, TW, TH);
            gl.addColorStop(0, 'rgba(255,255,255,0.28)');
            gl.addColorStop(0.35, 'rgba(255,255,255,0.05)');
            gl.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gl;
            g.fillRect(0, 0, TW, TH);
            g.restore();
        });
        make(scene, `tr_${c}`, TW, TH, (g) => {
            // viền kính mảnh, sáng như neon theo màu nước; vệt bóng trắng ở cạnh trên-trái
            g.shadowColor = mix(main, W, 0.5, 1);
            g.shadowBlur = 8;
            rr(g, 3, 3, TW - 6, TH - 6, R);
            g.lineWidth = 3.5;
            g.strokeStyle = mix(main, W, 0.82, 1);
            g.stroke();
            g.shadowBlur = 0;
            g.lineCap = 'round';
            g.strokeStyle = 'rgba(255,255,255,0.95)';
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(9, TH * 0.6);
            g.lineTo(9, R + 2);
            g.quadraticCurveTo(9, 9, R + 2, 9);
            g.lineTo(TW * 0.42, 9);
            g.stroke();
            g.strokeStyle = 'rgba(255,255,255,0.5)';
            g.lineWidth = 5;
            g.beginPath();
            g.moveTo(15, TH * 0.48);
            g.lineTo(15, TH * 0.26);
            g.stroke();
        });
    }
}

export function buildTextures(scene: Phaser.Scene) {
    buildTankTextures(scene);
    const TW = TANK_W, TH = TANK_H, R = 16;

    // lòng bể: kính tối có chiều sâu
    make(scene, 'tankBack', TW, TH, (g) => {
        const gr = g.createLinearGradient(0, 0, 0, TH);
        gr.addColorStop(0, 'rgba(40,30,120,0.85)');
        gr.addColorStop(1, 'rgba(70,55,170,0.9)');
        rr(g, 2, 2, TW - 4, TH - 4, R);
        g.fillStyle = gr;
        g.fill();
        const rad = g.createRadialGradient(TW / 2, TH * 0.45, 4, TW / 2, TH / 2, TW * 0.7);
        rad.addColorStop(0, 'rgba(255,255,255,0.08)');
        rad.addColorStop(1, 'rgba(0,0,20,0.35)');
        g.fillStyle = rad;
        g.fill();
    });

    // nước trong bể: trắng (tô màu bằng tint), đậm dần xuống đáy, mặt nước sáng
    make(scene, 'tankWater', TW, TH, (g) => {
        g.save();
        rr(g, 3, 3, TW - 6, TH - 6, R - 2);
        g.clip();
        const gr = g.createLinearGradient(0, 0, 0, TH);
        gr.addColorStop(0, 'rgba(255,255,255,0.75)');
        gr.addColorStop(0.5, 'rgba(235,235,235,0.85)');
        gr.addColorStop(1, 'rgba(190,190,190,0.95)');
        g.fillStyle = gr;
        g.fillRect(0, 0, TW, TH);
        g.restore();
    });

    // mặt nước (dải sáng gợn sóng) – đặt ở mép trên mực nước
    make(scene, 'waterSurface', TW - 10, 14, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0, h * 0.4);
        for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.35 + Math.sin(x * 0.18) * 2.2);
        g.lineTo(w, h);
        g.lineTo(0, h);
        g.closePath();
        g.fill();
    });

    // kính phía trước: viền sáng, bóng trên, vệt sáng dọc
    make(scene, 'tankGlass', TW, TH, (g) => {
        rr(g, 2, 2, TW - 4, TH - 4, R);
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.stroke();
        rr(g, 6, 6, TW - 12, TH - 12, R - 4);
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(160,220,255,0.45)';
        g.stroke();
        const top = g.createLinearGradient(0, 4, 0, 30);
        top.addColorStop(0, 'rgba(255,255,255,0.55)');
        top.addColorStop(1, 'rgba(255,255,255,0)');
        rr(g, 10, 6, TW - 20, 22, 10);
        g.fillStyle = top;
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        rr(g, 11, 30, 7, TH - 52, 4);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        rr(g, 22, 34, 4, TH - 64, 2);
        g.fill();
    });

    // vùng sáng khi bể vừa nhận cá
    make(scene, 'tankFlash', TW + 30, TH + 30, (g, w, h) => {
        const rad = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
        rad.addColorStop(0, 'rgba(255,255,255,0.9)');
        rad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rad;
        g.fillRect(0, 0, w, h);
    });

    make(scene, 'bubble', 32, 32, (g) => {
        const rad = g.createRadialGradient(16, 16, 6, 16, 16, 15);
        rad.addColorStop(0, 'rgba(255,255,255,0.08)');
        rad.addColorStop(0.8, 'rgba(255,255,255,0.35)');
        rad.addColorStop(1, 'rgba(255,255,255,0.9)');
        g.fillStyle = rad;
        g.beginPath();
        g.arc(16, 16, 14, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.beginPath();
        g.ellipse(11, 10, 4, 3, -0.6, 0, Math.PI * 2);
        g.fill();
    });

    make(scene, 'glow', 64, 64, (g) => {
        const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        rad.addColorStop(0, 'rgba(255,255,255,1)');
        rad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
        rad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rad;
        g.fillRect(0, 0, 64, 64);
    });

    // vệt gợn nước chạy dọc ống
    make(scene, 'ripple', 90, 18, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(w / 2, h / 2, w / 2, h / 2 - 3, 0, 0, Math.PI * 2);
        g.fill();
    });

    make(scene, 'drop', 20, 26, (g) => {
        const gr = g.createLinearGradient(0, 0, 20, 26);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(1, 'rgba(200,240,255,0.8)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(10, 0);
        g.bezierCurveTo(16, 9, 19, 14, 19, 17);
        g.arc(10, 17, 9, 0, Math.PI);
        g.bezierCurveTo(1, 14, 4, 9, 10, 0);
        g.fill();
    });

    make(scene, 'star', 64, 64, (g) => {
        g.fillStyle = '#ffffff';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
            const r = i % 2 ? 13 : 31;
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
    });

    make(scene, 'sparkle', 48, 48, (g) => {
        const rad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
        rad.addColorStop(0, 'rgba(255,255,255,1)');
        rad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rad;
        g.beginPath();
        g.moveTo(24, 0);
        g.quadraticCurveTo(27, 21, 48, 24);
        g.quadraticCurveTo(27, 27, 24, 48);
        g.quadraticCurveTo(21, 27, 0, 24);
        g.quadraticCurveTo(21, 21, 24, 0);
        g.fill();
    });

    make(scene, 'confetti', 16, 24, (g) => {
        g.fillStyle = '#ffffff';
        rr(g, 1, 1, 14, 22, 3);
        g.fill();
    });

    // dấu ✓ hoàn thành xe
    make(scene, 'check', 120, 120, (g) => {
        g.shadowColor = 'rgba(0,40,0,0.45)';
        g.shadowBlur = 10;
        g.shadowOffsetY = 5;
        const gr = g.createLinearGradient(0, 10, 0, 110);
        gr.addColorStop(0, '#7af06b');
        gr.addColorStop(1, '#1f9e2c');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(60, 58, 46, 0, Math.PI * 2);
        g.fill();
        g.shadowColor = 'transparent';
        g.lineWidth = 7;
        g.strokeStyle = '#ffffff';
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.beginPath();
        g.ellipse(60, 34, 30, 13, 0, 0, Math.PI * 2);
        g.fill();
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.lineWidth = 13;
        g.strokeStyle = '#ffffff';
        g.beginPath();
        g.moveTo(38, 60);
        g.lineTo(54, 76);
        g.lineTo(84, 42);
        g.stroke();
    });

    // huy hiệu số lượt booster (xanh lá như ảnh mẫu)
    make(scene, 'badge', 64, 64, (g) => {
        g.shadowColor = 'rgba(0,0,0,0.35)';
        g.shadowBlur = 6;
        g.shadowOffsetY = 3;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(32, 31, 27, 0, Math.PI * 2);
        g.fill();
        g.shadowColor = 'transparent';
        const gr = g.createLinearGradient(0, 8, 0, 56);
        gr.addColorStop(0, '#5ee05a');
        gr.addColorStop(1, '#14a12a');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(32, 31, 22, 0, Math.PI * 2);
        g.fill();
    });

    // nắp đậy khay bể khi xe hoàn thành (tím bóng như thân xe)
    make(scene, 'lid', 436, 122, (g, w, h) => {
        g.shadowColor = 'rgba(20,10,80,0.5)';
        g.shadowBlur = 8;
        g.shadowOffsetY = 4;
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#a99bff');
        gr.addColorStop(0.5, '#8473f2');
        gr.addColorStop(1, '#6a57de');
        rr(g, 6, 4, w - 12, h - 12, 22);
        g.fillStyle = gr;
        g.fill();
        g.shadowColor = 'transparent';
        rr(g, 14, 12, w - 28, h - 28, 16);
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.28)';
        rr(g, 22, 14, w - 44, 14, 7);
        g.fill();
    });

    // cổng ở 2 đầu ống hở: khối nắp ống + lòng tối
    make(scene, 'gate', 64, 176, (g, w, h) => {
        g.shadowColor = 'rgba(10,20,80,0.45)';
        g.shadowBlur = 8;
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, '#5a49d6');
        gr.addColorStop(0.5, '#8f80ff');
        gr.addColorStop(1, '#5a49d6');
        rr(g, 6, 4, w - 12, h - 8, 16);
        g.fillStyle = gr;
        g.fill();
        g.shadowColor = 'transparent';
        g.fillStyle = 'rgba(255,255,255,0.35)';
        rr(g, 14, 12, 8, h - 24, 4);
        g.fill();
    });
    make(scene, 'gateHole', 70, 120, (g, w, h) => {
        const rad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.8);
        rad.addColorStop(0, 'rgba(5,10,50,0.95)');
        rad.addColorStop(1, 'rgba(5,10,50,0)');
        g.fillStyle = rad;
        g.beginPath();
        g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        g.fill();
    });

    // vòng sóng khi bàn tay ấn xuống
    make(scene, 'ring', 160, 160, (g) => {
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.beginPath();
        g.arc(80, 80, 70, 0, Math.PI * 2);
        g.stroke();
    });

    // bóng đổ của xe: khối bo góc mờ (dùng chung cho xe ngang, xoay 90° cho xe dọc)
    make(scene, 'busShadow', 620, 320, (g, w, h) => {
        const bw = 470, bh = 160;
        g.shadowColor = 'rgba(0,0,0,1)';
        g.shadowBlur = 26;
        g.shadowOffsetX = 2000; // chỉ lấy phần bóng, khối gốc nằm ngoài khung
        g.fillStyle = '#000';
        rr(g, (w - bw) / 2 - 2000, (h - bh) / 2, bw, bh, 50);
        g.fill();
    });

    // ---- màn thắng / thua / end card ----
    // tia nắng xoay sau bảng kết quả
    make(scene, 'rays', 1024, 1024, (g, w, h) => {
        const n = 18;
        const rad = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w / 2);
        rad.addColorStop(0, 'rgba(255,255,255,0.95)');
        rad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rad;
        for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2, a1 = a0 + (Math.PI / n) * 0.9;
            g.beginPath();
            g.moveTo(w / 2, h / 2);
            g.arc(w / 2, h / 2, w / 2, a0, a1);
            g.closePath();
            g.fill();
        }
    });
    // dải ruy băng (vàng / đỏ) có đuôi gấp; chữ vẽ đè bằng Text
    const ribbon = (key: string, top: string, mid: string, bot: string, tail: string, fold: string) =>
        make(scene, key, 900, 230, (g, w) => {
            const cx = w / 2, by = 40, bh = 140, bw = 700, tw = 130;
            // đuôi 2 bên
            for (const s of [-1, 1]) {
                const x0 = cx + s * (bw / 2 - 30);
                const x1 = cx + s * (bw / 2 + tw);
                g.fillStyle = tail;
                g.beginPath();
                g.moveTo(x0, by + 40);
                g.lineTo(x1, by + 40);
                g.lineTo(x1 - s * 45, by + 40 + (bh - 20) / 2);
                g.lineTo(x1, by + bh + 20);
                g.lineTo(x0, by + bh + 20);
                g.closePath();
                g.fill();
                g.fillStyle = fold;
                g.beginPath();
                g.moveTo(cx + s * (bw / 2 - 30), by + bh);
                g.lineTo(cx + s * (bw / 2 - 30), by + bh + 20);
                g.lineTo(cx + s * (bw / 2 - 70), by + bh);
                g.closePath();
                g.fill();
            }
            // thân băng hơi cong
            g.shadowColor = 'rgba(20,10,60,0.45)';
            g.shadowBlur = 14;
            g.shadowOffsetY = 8;
            const gr = g.createLinearGradient(0, by, 0, by + bh);
            gr.addColorStop(0, top);
            gr.addColorStop(0.5, mid);
            gr.addColorStop(1, bot);
            g.fillStyle = gr;
            g.beginPath();
            g.moveTo(cx - bw / 2, by + 10);
            g.quadraticCurveTo(cx, by - 18, cx + bw / 2, by + 10);
            g.lineTo(cx + bw / 2, by + bh);
            g.quadraticCurveTo(cx, by + bh - 28, cx - bw / 2, by + bh);
            g.closePath();
            g.fill();
            g.shadowColor = 'transparent';
            g.strokeStyle = 'rgba(255,255,255,0.55)';
            g.lineWidth = 5;
            g.beginPath();
            g.moveTo(cx - bw / 2 + 14, by + 22);
            g.quadraticCurveTo(cx, by - 4, cx + bw / 2 - 14, by + 22);
            g.stroke();
        });
    ribbon('ribbonGold', '#ffe27a', '#ffb92e', '#e07a12', '#c4620c', '#7a3a06');
    ribbon('ribbonRed', '#ff8f7a', '#f0473a', '#b31d28', '#9a1622', '#5a0a12');
    // ô sao trống
    make(scene, 'starSlot', 160, 160, (g, w, h) => {
        g.fillStyle = 'rgba(10,15,70,0.75)';
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.lineWidth = 5;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
            const r = i % 2 ? 32 : 70;
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + 4 + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.stroke();
    });
    // sao vàng bóng
    make(scene, 'starGold', 160, 160, (g, w, h) => {
        g.shadowColor = 'rgba(120,60,0,0.5)';
        g.shadowBlur = 10;
        g.shadowOffsetY = 6;
        const gr = g.createLinearGradient(0, 10, 0, h - 10);
        gr.addColorStop(0, '#fff3a0');
        gr.addColorStop(0.45, '#ffd23a');
        gr.addColorStop(1, '#f08a12');
        g.fillStyle = gr;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
            const r = i % 2 ? 32 : 70;
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + 4 + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.shadowColor = 'transparent';
        g.lineWidth = 6;
        g.strokeStyle = '#fff6c8';
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.beginPath();
        g.ellipse(w / 2 - 14, h / 2 - 22, 14, 7, -0.5, 0, Math.PI * 2);
        g.fill();
    });
    // viền tối 4 góc (màn thua)
    make(scene, 'vignette', 540, 960, (g, w, h) => {
        const rad = g.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.62);
        rad.addColorStop(0, 'rgba(0,0,0,0)');
        rad.addColorStop(1, 'rgba(0,0,0,1)');
        g.fillStyle = rad;
        g.fillRect(0, 0, w, h);
    });

    // khớp nối trên ống (vòng kính)
    make(scene, 'joint', 40, 150, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgba(170,215,255,0.9)');
        gr.addColorStop(0.45, 'rgba(255,255,255,0.95)');
        gr.addColorStop(1, 'rgba(120,170,240,0.9)');
        g.fillStyle = gr;
        rr(g, 4, 2, w - 8, h - 4, 10);
        g.fill();
        g.strokeStyle = 'rgba(70,110,200,0.7)';
        g.lineWidth = 2;
        g.stroke();
    });

    // tia sáng chiếu xuống nước
    make(scene, 'ray', 160, 900, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(w * 0.35, 0);
        g.lineTo(w * 0.65, 0);
        g.lineTo(w, h);
        g.lineTo(0, h);
        g.closePath();
        g.fill();
    });

    // nền nước dưới đáy (gradient xanh ngọc)
    make(scene, 'waterBase', 4, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#2fc6e6');
        gr.addColorStop(0.5, '#1aa9d6');
        gr.addColorStop(1, '#2bbfe0');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
    });

    // khung popup: xanh tím bóng, viền sáng, lòng tối hơn (dùng 9-slice)
    make(scene, 'panel', 200, 200, (g, w, h) => {
        g.shadowColor = 'rgba(5,10,60,0.6)';
        g.shadowBlur = 14;
        g.shadowOffsetY = 8;
        const outer = g.createLinearGradient(0, 0, 0, h);
        outer.addColorStop(0, '#8f8cff');
        outer.addColorStop(1, '#4b3fd6');
        rr(g, 10, 6, w - 20, h - 22, 52);
        g.fillStyle = outer;
        g.fill();
        g.shadowColor = 'transparent';
        const inner = g.createLinearGradient(0, 20, 0, h - 30);
        inner.addColorStop(0, '#4f55e8');
        inner.addColorStop(1, '#3127b0');
        rr(g, 22, 18, w - 44, h - 46, 42);
        g.fillStyle = inner;
        g.fill();
        rr(g, 22, 18, w - 44, h - 46, 42);
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.stroke();
    });

    // nút xám trơn (từ nút tím trơn, khử màu) – cho nút phụ trong popup
    if (!scene.textures.exists('btn_grey')) {
        const src = scene.textures.get('btn_blank').getSourceImage() as HTMLImageElement;
        make(scene, 'btn_grey', src.width, src.height, (g) => {
            g.filter = 'grayscale(1) brightness(1.25) contrast(0.9)';
            g.drawImage(src, 0, 0);
        });
    }

    // lớp phủ tối cho popup
    make(scene, 'pixel', 4, 4, (g) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, 4, 4);
    });
}
