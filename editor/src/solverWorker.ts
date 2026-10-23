import { solveLevel, estimateDifficulty } from '../../src/core/solver';
import { randomizeStacks } from '../../src/core/levelUtil';
import type { LevelDef } from '../../src/core/types';

/** Solver chạy ngầm để editor không bị treo. */
type Req =
    | { id: number; type: 'solve'; level: LevelDef }
    | { id: number; type: 'generate'; level: LevelDef; colors: number; empty: number; minWin: number; maxWin: number; tries: number };

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<Req>) => {
    const req = e.data;
    try {
        if (req.type === 'solve') {
            const result = solveLevel(req.level, 60000, 15000);
            const difficulty = estimateDifficulty(req.level, 40);
            post({ id: req.id, result, difficulty });
        } else {
            let best: { level: LevelDef; goal: number; taps: number; winRate: number } | null = null;
            for (let t = 0; t < req.tries; t++) {
                const lv = randomizeStacks(req.level, req.colors, req.empty, (Math.random() * 1e9) | 0);
                const r = solveLevel(lv, 8000, 2500);
                post({ id: req.id, progress: t + 1 });
                if (r.status !== 'solved') continue;
                const d = estimateDifficulty(lv, 30);
                lv.goal = r.goal;
                const cand = { level: lv, goal: r.goal, taps: r.moves.filter((m) => m >= 0).length, winRate: d.winRate };
                // giữ bản gần khoảng độ khó mong muốn nhất
                const dist = (w: number) => (w < req.minWin ? req.minWin - w : w > req.maxWin ? w - req.maxWin : 0);
                if (!best || dist(cand.winRate) < dist(best.winRate)) best = cand;
                if (dist(cand.winRate) === 0) break;
            }
            post({ id: req.id, generated: best });
        }
    } catch (err) {
        post({ id: req.id, error: String(err) });
    }
};
