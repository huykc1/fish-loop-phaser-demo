/** Màu cá. Thêm màu mới: thêm vào COLORS và palette trong render. */
export const COLORS = ['red', 'yellow', 'green', 'blue', 'purple', 'orange', 'pink', 'cyan', 'brown', 'white', 'black', 'gray', 'sky', 'lime', 'navy'] as const;
export type FishColor = (typeof COLORS)[number];

export const DESIGN_W = 1080;
export const DESIGN_H = 1920;
export const MAX_CAPACITY = 4;

export interface BusDef {
  x: number;
  y: number;
  /** độ; 0 = đầu xe bên trái, đuôi xe bên phải */
  rot: number;
  capacity: number;
  /** đầu xe -> đuôi xe */
  stack: FishColor[];
  /** vị trí cổng trên ống (px theo chiều dài). null = tự tính */
  portS?: number | null;
}

export interface SpareSlot {
  x: number;
  y: number;
  rot: number;
  portS?: number | null;
}

export interface PipeDef {
  /** đa giác khép kín, cá chạy theo thứ tự điểm */
  points: [number, number][];
  cornerRadius: number;
  /** true = ống hở: điểm đầu và điểm cuối là 2 cổng, cá vào cổng cuối thì ra ngay ở cổng đầu */
  open?: boolean;
  inlet?: { s: number };
  outlet?: { s: number };
}

export interface LevelDef {
  id: number;
  name?: string;
  /** thông tin quản lý (editor): WIP | PROD | ARCHIVE */
  status?: 'WIP' | 'PROD' | 'ARCHIVE';
  /** Dễ | Vừa | Khó | Rất khó (tự điền từ solver, sửa tay được) */
  difficulty?: string;
  category?: string;
  pipe: PipeDef;
  pipeSpeed: number;
  slotLength: number;
  fishPerUnit: number;
  /** số nấc tối đa được chạy trên ống cùng lúc (bộ đếm x/N trên HUD), mặc định 5 */
  pipeLimit?: number;
  /** tỉ lệ kích thước xe trong level (mặc định 1); xe nhỏ hơn để xếp được nhiều xe */
  busScale?: number;
  buses: BusDef[];
  spareSlots?: SpareSlot[];
  /** số lượt booster: undo = Return (trả nấc vừa vào xe về chỗ cũ), shuffle = xếp lại 1 xe, addBus = thêm xe */
  boosters: { undo: number; shuffle: number; addBus: number };
  goal?: number;
  seed?: number;
}

export interface Slot {
  color: FishColor | null;
  source: number; // id xe nguồn, -1 nếu không có
  srcIndex: number; // vị trí của nấc trong xe nguồn (cho booster Return), -1 nếu không có
  traveled: number; // px đã chạy kể từ khi vào ống
}

export interface Bus {
  id: number;
  x: number;
  y: number;
  rot: number;
  capacity: number;
  stack: FishColor[];
  portS: number;
  /** hàng chờ xả vào ống */
  pending: FishColor[];
  /** vị trí cũ trong xe của từng nấc đang chờ (song song với pending) */
  pendingIdx: number[];
  done: boolean;
  spare: boolean;
}

export type SimEvent =
  | { type: 'release'; bus: number; colors: FishColor[] }
  | { type: 'insert'; bus: number; slot: number; color: FishColor }
  /** cá chen vào ô `from`: các nấc từ `from` lùi về sau 1 ô, tới ô trống `to` (đi ngược chiều chảy) */
  | { type: 'shift'; from: number; to: number }
  | { type: 'absorb'; bus: number; slot: number; color: FishColor; s: number; index: number }
  | { type: 'complete'; bus: number; color: FishColor }
  | { type: 'pipeFull'; bus: number }
  | { type: 'denied'; bus: number }
  | { type: 'win' }
  | { type: 'lose' }
  | { type: 'shuffle'; bus: number; before: FishColor[] }
  | { type: 'addBus'; bus: number }
  | { type: 'return'; from: number; fromIndex: number; to: number; toIndex: number; color: FishColor; reopened: boolean };

export type GameStatus = 'playing' | 'won' | 'lost';
