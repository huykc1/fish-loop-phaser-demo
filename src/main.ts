import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/700.css';
import * as Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Game } from './scenes/Game';
import { Promo } from './scenes/Promo';

const promo = new URLSearchParams(location.search).get('promo');

// Khung thiết kế dọc 1080x1920 (theo GDD), co giãn vừa màn hình.
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    title: 'Fish Loop',
    backgroundColor: promo === 'logo' || promo === 'icon' ? 'rgba(0,0,0,0)' : '#0d4f86',
    transparent: promo === 'logo' || promo === 'icon',
    fps: { limit: 60 },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        parent: 'game-container',
        width: 1080,
        height: 1920
    },
    render: { antialias: true, powerPreference: 'high-performance' },
    scene: [Boot, Game, Promo]
};

const game = new Phaser.Game(config);

// Phaser tự tạm dừng vòng lặp khi tab bị ẩn và chạy lại khi hiện (không tự sleep/wake thêm để tránh kẹt).

if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;

export default game;
