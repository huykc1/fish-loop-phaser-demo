import type { LevelDef } from '../core/types';

/**
 * Thứ tự chơi = collection "Main" do Level Editor xuất ra (level-data/collections/Main/NNN_<id>.json),
 * đóng gói sẵn vào game, sắp theo tên file.
 */
const mods = import.meta.glob('../../level-data/collections/Main/*.json', { eager: true, import: 'default' }) as Record<string, LevelDef>;

export const LEVELS: LevelDef[] = Object.keys(mods)
    .sort()
    .map((k) => mods[k]);
