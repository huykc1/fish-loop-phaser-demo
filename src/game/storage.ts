/** Lưu tiến độ – luôn bọc try/catch (chế độ ẩn danh, iframe có thể chặn storage). */
export interface Save {
  unlocked: number; // index level cao nhất đã mở
  current: number;
  sound: boolean;
  quality: 'auto' | 'high' | 'low';
}

const KEY = 'fishloop.save.v1';
const DEF: Save = { unlocked: 0, current: 0, sound: true, quality: 'auto' };

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEF, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEF };
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const PLAYTEST_KEY = 'fishloop.playtest';
