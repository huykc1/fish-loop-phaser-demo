/**
 * Kích thước xe dùng chung cho game, editor và tính cổng.
 * Lấy theo ảnh thân xe `public/assets/bus_body.png` (cắt từ ảnh mẫu, 4 bể, đầu xe bên trái).
 */
export const BUS_W = 503;
export const BUS_H = 195;
export const TANK_W = 102;
export const TANK_H = 112;
export const TANK_PITCH = 106;
/** toạ độ y (cục bộ) của tâm bể so với tâm xe: khay nằm phía trên thân xe */
export const TANK_Y = -20;
const FIRST_TANK_X = -146.5;

export function busLength(_capacity: number): number {
  return BUS_W;
}

/** toạ độ cục bộ (theo trục xe, x hướng về đuôi) của tâm nấc thứ i (0 = đầu xe) */
export function tankLocalX(_capacity: number, i: number): number {
  return FIRST_TANK_X + i * TANK_PITCH;
}

export function localToWorld(bx: number, by: number, rotDeg: number, lx: number, ly: number) {
  const r = (rotDeg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: bx + lx * c - ly * s, y: by + lx * s + ly * c };
}

/**
 * Đổi toạ độ cục bộ của xe (x theo trục đầu → đuôi, y theo chiều cao ảnh) sang toạ độ quanh tâm xe trên màn hình.
 * Xe 180° chỉ LẬT NGANG ảnh (đuôi sang trái), không lộn ngược, nên y giữ nguyên.
 * Xe dọc (90° / 270°) dùng ảnh xe dọc riêng nên xoay đúng hình học.
 */
export function busLocal(rot: number, lx: number, ly: number) {
  const r = ((Math.round(rot) % 360) + 360) % 360;
  if (r === 0) return { x: lx, y: ly };
  if (r === 180) return { x: -lx, y: ly };
  return localToWorld(0, 0, r, lx, ly);
}

/** vị trí tâm bể i so với tâm xe (bể luôn đứng thẳng) */
export function tankOffset(rot: number, i: number) {
  return busLocal(rot, tankLocalX(4, i), TANK_Y);
}

/** điểm đuôi xe (nơi cá ra/vào) */
export function busTail(x: number, y: number, rot: number, capacity: number, scale = 1) {
  return localToWorld(x, y, rot, (busLength(capacity) / 2) * scale, 0);
}
