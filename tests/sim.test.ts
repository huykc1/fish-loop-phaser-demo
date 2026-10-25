import { describe, it, expect } from 'vitest';
import { Sim, FIXED_DT, tailRun } from '../src/core/sim';
import { solveLevel } from '../src/core/solver';
import type { LevelDef } from '../src/core/types';
import { PipePath } from '../src/core/path';

const levels = import.meta.glob('../level-data/levels/*.json', { eager: true, import: 'default' }) as Record<string, LevelDef>;

function base(): LevelDef {
  return {
    id: 0,
    pipe: { points: [[100, 330], [980, 330], [980, 1600], [100, 1600]], cornerRadius: 150 },
    pipeSpeed: 220,
    slotLength: 95,
    fishPerUnit: 5,
    buses: [
      { x: 540, y: 640, rot: 0, capacity: 4, stack: ['red', 'red', 'red', 'blue'] },
      { x: 540, y: 960, rot: 0, capacity: 4, stack: ['blue', 'blue', 'blue', 'red'] },
      { x: 540, y: 1280, rot: 0, capacity: 4, stack: [] },
    ],
    boosters: { undo: 3, shuffle: 1, addBus: 0 },
    seed: 1,
  };
}
const run = (s: Sim, sec: number) => {
  for (let i = 0; i < sec / FIXED_DT; i++) s.step(FIXED_DT);
};

describe('core', () => {
  it('tailRun', () => {
    expect(tailRun(['red', 'blue', 'blue'])).toBe(2);
    expect(tailRun([])).toBe(0);
  });

  it('tap xả cụm đuôi, giới hạn bởi chỗ trống', () => {
    const s = new Sim({ ...base(), pipeLimit: 99 });
    expect(s.tap(0)).toBe(true);
    expect(s.buses[0].stack).toEqual(['red', 'red', 'red']);
    expect(s.buses[0].pending).toEqual(['blue']);
    // giả lập ống gần đầy: chỉ còn 2 chỗ
    const s2 = new Sim({ ...base(), pipeLimit: 99 });
    s2.slots.forEach((sl, i) => (sl.color = i < s2.C - 2 ? 'green' : null));
    s2.buses[0].stack = ['blue', 'red', 'red', 'red'];
    s2.tap(0);
    expect(s2.buses[0].pending.length).toBe(2);
    expect(s2.buses[0].stack).toEqual(['blue', 'red']);
  });

  it('không quay lại xe nguồn trong vòng đầu, xe rỗng nhận cá', () => {
    const s = new Sim(base());
    s.tap(0); // blue ra
    run(s, s.loopTime * 1.5);
    // bus2 rỗng nhận blue
    expect(s.buses[2].stack).toEqual(['blue']);
  });

  it('chơi thắng level 1 bằng tay', () => {
    const s = new Sim(base());
    s.tap(0);
    run(s, s.loopTime + 1);
    s.tap(1); // red -> bus0
    run(s, s.loopTime + 1);
    expect(s.buses[0].done).toBe(true);
    s.tap(2); // blue -> bus1
    run(s, s.loopTime + 1);
    expect(s.status).toBe('won');
    expect(s.completed).toBe(2);
  });

  it('nấc ưu tiên xe có đuôi cùng màu, bỏ qua xe trống', () => {
    const lv = base();
    lv.pipeLimit = 99;
    // xe 0 xả 1 nấc xanh; xe 1 có đuôi xanh và còn chỗ; xe 2 trống
    lv.buses[0].stack = ['red', 'red', 'red', 'blue'];
    lv.buses[1].stack = ['red', 'blue'];
    const s = new Sim(lv);
    s.tap(0);
    run(s, s.loopTime * 1.5);
    expect(s.buses[1].stack).toEqual(['red', 'blue', 'blue']);
    expect(s.buses[2].stack).toEqual([]);
  });

  it('xe cùng màu đầy rồi thì phần dư mới vào xe trống', () => {
    const lv = base();
    lv.pipeLimit = 99;
    lv.buses[0].stack = ['blue', 'blue'];
    lv.buses[1].stack = ['red', 'red', 'blue'];
    const s = new Sim(lv);
    s.tap(0); // 2 nấc xanh: 1 lấp đầy xe 1, nấc còn lại sang xe trống
    run(s, s.loopTime * 3);
    expect(s.buses[1].stack).toEqual(['red', 'red', 'blue', 'blue']);
    expect(s.buses[2].stack.length + s.buses[0].stack.length).toBe(1);
  });

  it('cá chen vào ngay, đàn phía sau lùi nhường chỗ', () => {
    const lv = base();
    lv.pipeLimit = 99;
    lv.buses[0].stack = ['red', 'red', 'red', 'blue'];
    const s = new Sim(lv);
    // lấp kín toàn bộ ống trừ 3 ô ở xa cổng xe 0
    const port = s.buses[0].portS;
    s.slots.forEach((sl, i) => {
      const y = s.path.wrap(port - s.slotPos(i, 0));
      sl.color = y < s.L * 0.6 ? 'green' : null;
    });
    const before = s.slots.filter((x) => x.color === 'green').length;
    expect(s.tap(0)).toBe(true);
    // 1 nấc đi tới cổng mất ~1 ô; không cần chờ ô trống đi qua
    for (let k = 0; k < Math.ceil((s.S / s.speed) / FIXED_DT) + 2; k++) s.step(FIXED_DT);
    expect(s.buses[0].pending.length).toBe(0);
    expect(s.slots.filter((x) => x.color === 'blue').length).toBe(1);
    expect(s.slots.filter((x) => x.color === 'green').length).toBe(before); // không mất nấc nào
  });

  it('giới hạn N nấc trên ống', () => {
    const lv = base();
    lv.pipeLimit = 2;
    lv.buses[0].stack = ['blue', 'red', 'red', 'red'];
    const s = new Sim(lv);
    s.tap(0);
    expect(s.buses[0].pending.length).toBe(2); // chỉ được 2 nấc dù cụm đuôi có 3
    run(s, 1);
    expect(s.onPipe()).toBe(2);
    expect(s.freeCapacity()).toBe(0);
    expect(s.tap(1)).toBe(false); // ống đầy
  });

  it('Return trả nấc vừa vào xe về chỗ cũ', () => {
    const s = new Sim(base());
    s.tap(0); // blue (vị trí 3 của xe 0) -> xe 2
    run(s, s.loopTime * 1.5);
    expect(s.buses[2].stack).toEqual(['blue']);
    expect(s.canUndo()).toBe(true);
    expect(s.useUndo()).toBe(true);
    expect(s.buses[2].stack).toEqual([]);
    expect(s.buses[0].stack).toEqual(['red', 'red', 'red', 'blue']);
    expect(s.canUndo()).toBe(false); // không còn nấc nào để trả
  });

  it('Return mờ khi chỗ cũ đã bị chiếm', () => {
    const s = new Sim(base());
    s.tap(0); // blue -> xe 2
    run(s, s.loopTime * 1.5);
    s.buses[0].stack.pop(); // nấc dưới chỗ cũ đã đi
    expect(s.canUndo()).toBe(false);
  });

  it('Shuffle gom màu, màu lẻ ra đuôi', () => {
    const lv = base();
    lv.buses[0].stack = ['blue', 'red', 'red', 'red'];
    const s = new Sim(lv);
    expect(s.canShuffleBus(2)).toBe(false); // xe rỗng
    expect(s.useShuffle(0)).toBe(true);
    expect(s.buses[0].stack).toEqual(['red', 'red', 'red', 'blue']);
    expect(s.canShuffleBus(0)).toBe(false); // đã đúng thứ tự, xáo không đổi gì
  });

  it('thua khi kẹt 1 vòng', () => {
    const lv = base();
    lv.buses = [
      { x: 540, y: 640, rot: 0, capacity: 4, stack: ['red', 'green', 'red', 'blue'] },
      { x: 540, y: 960, rot: 0, capacity: 4, stack: ['blue', 'green', 'blue', 'red'] },
    ];
    lv.slotLength = 4000; // ống chỉ chứa 1 nấc
    const s = new Sim(lv);
    expect(s.C).toBe(1);
    s.tap(0);
    expect(s.tap(1)).toBe(false);
    run(s, s.loopTime * 4);
    expect(s.status).toBe('lost');
  });

  it('determinism', () => {
    const a = new Sim(base()), b = new Sim(base());
    for (const s of [a, b]) {
      s.tap(0);
      run(s, 3.3);
      s.tap(1);
      run(s, 7);
    }
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
  });
});

describe('levels giải được', () => {
  for (const [file, lv] of Object.entries(levels)) {
    it(file, () => {
      const r = solveLevel(lv, 60000, 25000);
      console.log(file, r.status, 'goal', r.goal, 'moves', r.moves.length, 'nodes', r.nodes, r.ms + 'ms');
      expect(r.status).toBe('solved');
    }, 40000);
  }
});

describe('ống hở có cổng', () => {
  it('chiều dài không gồm đoạn nối cổng cuối về cổng đầu', () => {
    const closed = new PipePath({ points: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], cornerRadius: 0 });
    const open = new PipePath({ points: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], cornerRadius: 0, open: true });
    expect(closed.length).toBeCloseTo(4000, 0);
    expect(open.length).toBeCloseTo(3000, 0);
    // đi hết ống thì quay về cổng đầu ngay
    const p = open.at(open.length + 10);
    expect(p.x).toBeCloseTo(10, 0);
    expect(p.y).toBeCloseTo(0, 0);
  });
});


describe('tự chơi theo lời giải', () => {
  it('lịch tap có khoảng nghỉ vẫn thắng level 1', async () => {
    const { solveLevel, planTimeline } = await import('../src/core/solver');
    const lv = Object.values(levels)[0];
    const r = solveLevel(lv, 20000, 8000);
    const plan = planTimeline(lv, r.moves);
    expect(plan.won).toBe(true);
    expect(plan.taps.length).toBe(r.moves.filter((m) => m >= 0).length);
  });
});

describe('cổng tự động', () => {
  it('cổng nằm thẳng hướng đuôi xe, kể cả xe sát mép trên', async () => {
    const { autoPortS } = await import('../src/core/path');
    const path = new PipePath({ points: [[100, 330], [980, 330], [980, 1600], [100, 1600]], cornerRadius: 150 });
    const s = autoPortS(path, 545, 480, 0, 4, 0.87);
    const p = path.at(s);
    expect(p.x).toBeCloseTo(980, 0); // ống bên phải
    expect(p.y).toBeCloseTo(480, 0); // cùng độ cao với xe
  });
});

describe('bố cục level', () => {
  it('không xe / chỗ dự phòng nào đè lên ống hoặc chồng lên nhau', async () => {
    const { validateLevel } = await import('../src/core/levelUtil');
    for (const [file, lv] of Object.entries(levels)) {
      const bad = validateLevel(lv).filter((i) => /đè lên ống|chồng lên/.test(i.msg)).map((i) => i.msg);
      expect(bad, file).toEqual([]);
    }
  });
});
