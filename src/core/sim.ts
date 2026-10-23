import { PipePath, autoPortS } from './path';
import { rngNext } from './rng';
import type { Bus, FishColor, GameStatus, LevelDef, SimEvent, Slot } from './types';
import { MAX_CAPACITY } from './types';

export const FIXED_DT = 1 / 60;

/** 1 lần cá vào xe – để booster Return trả về chỗ cũ */
interface AbsorbRecord {
  bus: number;
  index: number;
  color: FishColor;
  src: number;
  srcIndex: number;
}

/** số nấc mặc định được chạy trên ống cùng lúc */
export const DEFAULT_PIPE_LIMIT = 5;

interface Snapshot {
  absorbs: AbsorbRecord[];
  slots: Slot[];
  offset: number;
  buses: Bus[];
  seed: number;
  status: GameStatus;
  stuckTime: number;
  nextSpare: number;
  completed: number;
  time: number;
}

export function busComplete(b: { stack: FishColor[]; capacity: number }): boolean {
  if (b.stack.length !== b.capacity || b.capacity === 0) return false;
  const c = b.stack[0];
  return b.stack.every((x) => x === c);
}

/** số nấc cùng màu liền nhau ở đuôi */
export function tailRun(stack: FishColor[]): number {
  if (!stack.length) return 0;
  const c = stack[stack.length - 1];
  let k = 0;
  for (let i = stack.length - 1; i >= 0 && stack[i] === c; i--) k++;
  return k;
}

export function computeGoalHeuristic(level: LevelDef): number {
  const count = new Map<FishColor, number>();
  for (const b of level.buses) for (const c of b.stack) count.set(c, (count.get(c) ?? 0) + 1);
  let g = 0;
  for (const n of count.values()) g += Math.ceil(n / MAX_CAPACITY);
  return g;
}

/**
 * Mô phỏng logic game – không phụ thuộc render.
 * Gọi update(dt thực) mỗi frame hoặc step() trực tiếp (solver/test).
 */
export class Sim {
  readonly path: PipePath;
  readonly L: number;
  readonly C: number;
  readonly S: number;
  readonly speed: number;
  readonly goal: number;
  readonly loopTime: number;
  /** số nấc tối đa trên ống cùng lúc */
  readonly limit: number;

  slots: Slot[] = [];
  offset = 0;
  buses: Bus[] = [];
  status: GameStatus = 'playing';
  stuckTime = 0;
  nextSpare = 0;
  completed = 0;
  time = 0;
  rng: { seed: number };
  boosters: { undo: number; shuffle: number; addBus: number };
  events: SimEvent[] = [];
  /** các lần cá vào xe, mới nhất ở cuối (cho Return) */
  absorbs: AbsorbRecord[] = [];
  moves = 0;
  private acc = 0;
  private absorbedThisStep = false;

  constructor(readonly level: LevelDef, sharedPath?: PipePath) {
    this.path = sharedPath ?? new PipePath(level.pipe);
    this.L = this.path.length;
    this.C = Math.max(1, Math.floor(this.L / level.slotLength));
    this.S = this.L / this.C;
    this.speed = level.pipeSpeed;
    this.loopTime = this.L / this.speed;
    this.limit = level.pipeLimit ?? DEFAULT_PIPE_LIMIT;
    this.rng = { seed: level.seed ?? 1 };
    this.boosters = { ...level.boosters };
    for (let i = 0; i < this.C; i++) this.slots.push({ color: null, source: -1, srcIndex: -1, traveled: 0 });
    level.buses.forEach((b, i) => {
      const bus: Bus = {
        id: i,
        x: b.x,
        y: b.y,
        rot: b.rot,
        capacity: b.capacity,
        stack: [...b.stack],
        portS: b.portS ?? this.autoPort(b.x, b.y, b.rot, b.capacity),
        pending: [],
        pendingIdx: [],
        done: false,
        spare: false,
      };
      if (busComplete(bus)) {
        bus.done = true;
        this.completed++;
      }
      this.buses.push(bus);
    });
    this.goal = level.goal ?? computeGoalHeuristic(level);
  }

  autoPort(x: number, y: number, rot: number, cap: number): number {
    return autoPortS(this.path, x, y, rot, cap, this.level.busScale ?? 1);
  }

  slotPos(i: number, offset = this.offset): number {
    return this.path.wrap(i * this.S + offset);
  }

  emptySlots(): number {
    let n = 0;
    for (const s of this.slots) if (!s.color) n++;
    return n;
  }

  pendingTotal(): number {
    let n = 0;
    for (const b of this.buses) n += b.pending.length;
    return n;
  }

  /** số nấc đang chạy trên ống (bộ đếm x/N) */
  onPipe(): number {
    return this.slots.length - this.emptySlots();
  }

  /** số nấc còn được xả thêm: vừa phải còn ô trống, vừa không vượt giới hạn N */
  freeCapacity(): number {
    const pend = this.pendingTotal();
    return Math.min(this.emptySlots() - pend, this.limit - this.onPipe() - pend);
  }

  isTappable(b: Bus): boolean {
    return !b.done && b.stack.length > 0;
  }

  anyEffectiveTap(): boolean {
    if (this.freeCapacity() <= 0) return false;
    return this.buses.some((b) => this.isTappable(b));
  }

  /** người chơi tap xe. Trả về true nếu có cá được xả */
  tap(busId: number): boolean {
    if (this.status !== 'playing') return false;
    const b = this.buses[busId];
    if (!b || !this.isTappable(b)) {
      this.events.push({ type: 'denied', bus: busId });
      return false;
    }
    const k = tailRun(b.stack);
    const n = Math.min(k, this.freeCapacity());
    if (n <= 0) {
      this.events.push({ type: 'pipeFull', bus: busId });
      return false;
    }
    const top = b.stack.length;
    const colors = b.stack.splice(top - n, n);
    b.pending.push(...colors);
    // nấc ở đuôi ra trước
    for (let k = 1; k <= n; k++) b.pendingIdx.push(top - k);
    this.moves++;
    this.events.push({ type: 'release', bus: busId, colors });
    return true;
  }

  /** chạy theo thời gian thực, bước cố định */
  update(realDt: number): void {
    this.acc += Math.min(realDt, 0.1);
    while (this.acc >= FIXED_DT) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
    }
  }

  /** offset nội suy để render mượt trên màn hình >60Hz */
  renderOffset(): number {
    return this.status === 'playing' ? this.offset + this.speed * this.acc : this.offset;
  }

  step(dt: number): void {
    if (this.status !== 'playing') return;
    this.time += dt;
    const dv = this.speed * dt;
    const old = this.offset;
    this.offset = this.path.wrap(this.offset + dv);
    this.absorbedThisStep = false;

    for (const slot of this.slots) if (slot.color) slot.traveled += dv;
    // mỗi cổng: chỉ có tối đa 1 ô đi qua trong 1 bước (dv < S)
    for (const b of this.buses) {
      const y = this.path.wrap(b.portS - old);
      const i = Math.floor(y / this.S) % this.C;
      if (y - i * this.S >= dv) continue;
      const slot = this.slots[i];
      if (slot.color) this.tryAbsorb(b, slot, i);
      else if (b.pending.length) {
        const color = b.pending.shift()!;
        slot.color = color;
        slot.source = b.id;
        slot.srcIndex = b.pendingIdx.shift() ?? -1;
        slot.traveled = 0;
        this.events.push({ type: 'insert', bus: b.id, slot: i, color });
      }
    }
    this.checkEnd(dt);
  }

  /** có xe đang mở (chưa ✓, còn chỗ, không rỗng) mà nấc ở đuôi cùng màu c */
  hasMatchingBus(c: FishColor): boolean {
    return this.buses.some((b) => !b.done && b.stack.length > 0 && b.stack.length < b.capacity && b.stack[b.stack.length - 1] === c);
  }

  private tryAbsorb(b: Bus, slot: Slot, i: number): void {
    const c = slot.color!;
    if (b.done || b.pending.length) return;
    if (b.stack.length >= b.capacity) return;
    if (b.stack.length && b.stack[b.stack.length - 1] !== c) return;
    if (slot.source === b.id && slot.traveled < this.L) return;
    // ưu tiên xe đang có đuôi cùng màu: còn xe như vậy thì không vào xe trống
    if (!b.stack.length && this.hasMatchingBus(c)) return;
    b.stack.push(c);
    this.absorbs.push({ bus: b.id, index: b.stack.length - 1, color: c, src: slot.source, srcIndex: slot.srcIndex });
    if (this.absorbs.length > 200) this.absorbs.shift();
    slot.color = null;
    slot.source = -1;
    slot.srcIndex = -1;
    slot.traveled = 0;
    this.absorbedThisStep = true;
    this.events.push({ type: 'absorb', bus: b.id, slot: i, color: c, s: b.portS, index: b.stack.length - 1 });
    if (busComplete(b)) {
      b.done = true;
      this.completed++;
      this.events.push({ type: 'complete', bus: b.id, color: c });
    }
  }

  private checkEnd(dt: number): void {
    const pipeEmpty = this.slots.every((s) => !s.color);
    if (pipeEmpty && this.pendingTotal() === 0 && this.buses.every((b) => b.done || b.stack.length === 0)) {
      this.status = 'won';
      this.events.push({ type: 'win' });
      return;
    }
    if (this.absorbedThisStep) {
      this.stuckTime = 0;
    } else if (!this.anyEffectiveTap() && this.pendingTotal() === 0) {
      this.stuckTime += dt;
      if (this.stuckTime >= this.loopTime) {
        this.status = 'lost';
        this.events.push({ type: 'lose' });
      }
    } else {
      this.stuckTime = 0;
    }
  }

  /** 0..1: mức cảnh báo kẹt (>0 khi đã qua 50% thời gian) */
  dangerLevel(): number {
    const r = this.stuckTime / this.loopTime;
    return r <= 0.5 ? 0 : Math.min(1, (r - 0.5) / 0.5);
  }

  // ---------------- Booster ----------------
  /** Return: nấc vừa vào xe gần nhất (toàn màn) – trả về nếu còn quay về được, không thì null */
  private returnable(): AbsorbRecord | null {
    const r = this.absorbs[this.absorbs.length - 1];
    if (!r || r.src < 0 || r.srcIndex < 0) return null;
    const to = this.buses[r.bus], from = this.buses[r.src];
    if (!to || !from) return null;
    // nấc vẫn còn ở đúng chỗ trong xe đích
    if (to.stack.length - 1 !== r.index || to.stack[r.index] !== r.color || to.pending.length) return null;
    // xe cũ: chỗ cũ phải là chỗ trống kế tiếp (nấc bên dưới chưa đi, chưa nhận nấc khác)
    if (from.done || from.pending.length || from.stack.length !== r.srcIndex || r.srcIndex >= from.capacity) return null;
    return r;
  }

  canUndo(): boolean {
    return this.boosters.undo > 0 && this.status !== 'won' && this.returnable() !== null;
  }

  /** Return: trả nấc vừa vào xe gần nhất về vị trí cũ ở xe cũ */
  useUndo(): boolean {
    if (!this.canUndo()) return false;
    const r = this.absorbs.pop()!;
    const to = this.buses[r.bus], from = this.buses[r.src];
    to.stack.pop();
    const reopened = to.done;
    if (to.done) {
      to.done = false;
      this.completed--;
    }
    from.stack.push(r.color);
    this.boosters.undo--;
    this.stuckTime = 0;
    if (this.status === 'lost') this.status = 'playing';
    this.events.push({ type: 'return', from: r.bus, fromIndex: r.index, to: r.src, toIndex: r.srcIndex, color: r.color, reopened });
    return true;
  }

  /** thứ tự mới của xe khi Shuffle: gom cùng màu, cụm đông ở đầu xe, màu lẻ ra đuôi; cụm bằng nhau xếp ngẫu nhiên */
  private shuffledStack(b: Bus, rand: () => number): FishColor[] | null {
    if (b.done || b.pending.length || b.stack.length < 2) return null;
    const count = new Map<FishColor, number>();
    for (const c of b.stack) count.set(c, (count.get(c) ?? 0) + 1);
    if (count.size < 2) return null;
    const groups = [...count.entries()].map(([c, n]) => ({ c, n, r: rand() }));
    groups.sort((x, y) => y.n - x.n || x.r - y.r);
    const out = groups.flatMap((g) => Array<FishColor>(g.n).fill(g.c));
    return out.join() === b.stack.join() ? null : out;
  }

  /** xe có thể Shuffle (thứ tự sẽ thay đổi) */
  canShuffleBus(id: number): boolean {
    const b = this.buses[id];
    if (!b || this.boosters.shuffle <= 0 || this.status === 'won') return false;
    // thử vài cách xếp cụm bằng nhau: chỉ cần 1 cách khác thứ tự hiện tại
    for (let k = 0; k < 6; k++) {
      let t = k;
      if (this.shuffledStack(b, () => ((t = (t * 9301 + 49297) % 233280) / 233280))) return true;
    }
    return false;
  }

  canShuffle(): boolean {
    return this.buses.some((_, i) => this.canShuffleBus(i));
  }

  /** Shuffle 1 xe được chỉ định */
  useShuffle(id: number): boolean {
    if (!this.canShuffleBus(id)) return false;
    const b = this.buses[id];
    let next: FishColor[] | null = null;
    for (let k = 0; k < 12 && !next; k++) next = this.shuffledStack(b, () => rngNext(this.rng));
    if (!next) return false;
    const before = [...b.stack];
    b.stack = next;
    if (busComplete(b)) {
      b.done = true;
      this.completed++;
    }
    this.boosters.shuffle--;
    this.stuckTime = 0;
    if (this.status === 'lost') this.status = 'playing';
    this.events.push({ type: 'shuffle', bus: id, before });
    return true;
  }

  canAddBus(): boolean {
    const spares = this.level.spareSlots ?? [];
    return this.boosters.addBus > 0 && this.nextSpare < spares.length && this.status !== 'won';
  }

  useAddBus(): boolean {
    if (!this.canAddBus()) return false;
    const sp = this.level.spareSlots![this.nextSpare++];
    const id = this.buses.length;
    this.buses.push({
      id,
      x: sp.x,
      y: sp.y,
      rot: sp.rot,
      capacity: MAX_CAPACITY,
      stack: [],
      portS: sp.portS ?? this.autoPort(sp.x, sp.y, sp.rot, MAX_CAPACITY),
      pending: [],
      pendingIdx: [],
      done: false,
      spare: true,
    });
    this.boosters.addBus--;
    this.stuckTime = 0;
    if (this.status === 'lost') this.status = 'playing';
    this.events.push({ type: 'addBus', bus: id });
    return true;
  }

  // ---------------- Snapshot ----------------
  snapshot(): Snapshot {
    return structuredClone({
      absorbs: this.absorbs,
      slots: this.slots,
      offset: this.offset,
      buses: this.buses,
      seed: this.rng.seed,
      status: this.status,
      stuckTime: this.stuckTime,
      nextSpare: this.nextSpare,
      completed: this.completed,
      time: this.time,
    });
  }

  /** khôi phục chính xác 1 trạng thái (solver nhân bản để thử nước đi) */
  restore(s: Snapshot): void {
    const c = structuredClone(s);
    this.absorbs = c.absorbs;
    this.slots = c.slots;
    this.offset = c.offset;
    this.buses = c.buses;
    this.rng.seed = c.seed;
    this.status = c.status;
    this.stuckTime = c.stuckTime;
    this.nextSpare = c.nextSpare;
    this.completed = c.completed;
    this.time = c.time;
    this.acc = 0;
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
