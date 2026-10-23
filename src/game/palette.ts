import type { FishColor } from '../core/types';

/** màu chính, màu tối (viền/bóng), màu nước trong bể */
export const PALETTE: Record<FishColor, { main: number; dark: number; water: number; css: string }> = {
  red: { main: 0xff5326, dark: 0xb32a0d, water: 0xff8e6a, css: '#ff5326' },
  yellow: { main: 0xffd23a, dark: 0xc98f00, water: 0xffe98a, css: '#ffd23a' },
  green: { main: 0x3fd94a, dark: 0x1c8f2a, water: 0x8af08a, css: '#3fd94a' },
  blue: { main: 0x2f8bff, dark: 0x1748b8, water: 0x7cc0ff, css: '#2f8bff' },
  purple: { main: 0xa24bff, dark: 0x5e1fb3, water: 0xcc9bff, css: '#a24bff' },
  orange: { main: 0xff8a1f, dark: 0xb85200, water: 0xffbf80, css: '#ff8a1f' },
  pink: { main: 0xff5fb8, dark: 0xb3216f, water: 0xffa6d9, css: '#ff5fb8' },
  cyan: { main: 0x22d8e0, dark: 0x0d8a99, water: 0x8af2f5, css: '#22d8e0' },
  brown: { main: 0x9a6232, dark: 0x5a3414, water: 0xc99a6e, css: '#9a6232' },
  white: { main: 0xe9eef3, dark: 0x9aa6b2, water: 0xffffff, css: '#e9eef3' },
  black: { main: 0x3a3a46, dark: 0x15151c, water: 0x6a6a7a, css: '#3a3a46' },
  gray: { main: 0x9aa0a8, dark: 0x5c626b, water: 0xc8ccd2, css: '#9aa0a8' },
  sky: { main: 0x7fd0ff, dark: 0x3b8fc4, water: 0xc2eaff, css: '#7fd0ff' },
  lime: { main: 0xb8f23a, dark: 0x6f9e12, water: 0xdcff8f, css: '#b8f23a' },
  navy: { main: 0x2a3a9e, dark: 0x111b5c, water: 0x5f6fd0, css: '#2a3a9e' },
};
