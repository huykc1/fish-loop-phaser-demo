import './style.css';
import { COLORS, type FishColor, type LevelDef } from '../../src/core/types';
import { PipePath, autoPortS } from '../../src/core/path';
import { autoArrange, autoSpareSlots, colorCounts, newLevel, PIPE_PRESETS, validateLevel, type Issue } from '../../src/core/levelUtil';
import { PALETTE } from '../../src/game/palette';
import { LevelCanvas, type Selection, type Tool } from './canvas';
import { h, confirmBox, fmtTime, kids } from './dom';
import { LevelStore, type Collection } from './store';
import { BrowserVFS, canPickFolder, FolderVFS, metaGet, metaSet, pickFolder, reconnect, savedFolder, type VFS } from './vfs';
import { Organiser } from './organiser';

// ---------------- Dữ liệu mẫu (cho Browser storage lần đầu) ----------------
const SAMPLE_LEVELS = import.meta.glob('../../level-data/levels/*.json', { eager: true, import: 'default' }) as Record<string, LevelDef>;
const SAMPLE_COLS = import.meta.glob('../../level-data/collections.json', { eager: true, import: 'default' }) as Record<string, { collections: Collection[] }>;

export const PLAYTEST_KEY = 'fishloop.playtest';
const UI_KEY = 'fle.ui';
const MAX_UNDO = 60;
const DIFFS = ['Dễ', 'Vừa', 'Khó', 'Rất khó'];
export const diffLabel = (w: number) => (w >= 0.4 ? 'Dễ' : w >= 0.15 ? 'Vừa' : w >= 0.05 ? 'Khó' : 'Rất khó');
export const diffClass = (d?: string) => (d === 'Dễ' ? 'easy' : d === 'Khó' ? 'hard' : d === 'Rất khó' ? 'vhard' : d ? '' : 'none');
const clone = <T,>(o: T): T => structuredClone(o);
const J = (o: unknown) => JSON.stringify(o);

interface UiPrefs {
    leftW: number;
    rightW: number;
    leftCollapsed: boolean;
    rightCollapsed: boolean;
    theme: 'dark' | 'light';
    tab: 'editor' | 'organiser';
}

function loadPrefs(): UiPrefs {
    const def: UiPrefs = { leftW: 250, rightW: 290, leftCollapsed: false, rightCollapsed: false, theme: 'dark', tab: 'editor' };
    try {
        return { ...def, ...JSON.parse(localStorage.getItem(UI_KEY) ?? '{}') };
    } catch {
        return def;
    }
}

/** Trạng thái chung của editor */
export class App {
    prefs = loadPrefs();
    store: LevelStore | null = null;
    pendingFolder: FileSystemDirectoryHandle | null = null;
    levels: LevelDef[] = [];
    cur: LevelDef | null = null;
    /** JSON của bản đã lưu trên đĩa (để biết có thay đổi chưa lưu) */
    saved = '';
    undo: string[] = [];
    redo: string[] = [];
    private dragBase: string | null = null;
    sel: Selection = null;
    tool: Tool = 'select';
    brush: FishColor | 'erase' | null = null;
    search = '';
    status = 'Ready';
    solveInfo: Node | string = '';
    genInfo = '';
    private worker: Worker | null = null;
    private reqId = 0;
    private draftTimer = 0;

    // phần tử
    root = h('div', { class: 'app' });
    header = h('header');
    leftPanel = h('section', { class: 'panel' });
    rightPanel = h('section', { class: 'panel' });
    center = h('div', { class: 'center' });
    statusBar = h('div', { class: 'status' });
    canvas!: LevelCanvas;
    stage = h('div', { class: 'stage' });
    organiser = new Organiser(this);

    constructor() {
        document.documentElement.dataset.theme = this.prefs.theme;
        const main = h('main');
        const r1 = this.resizer('left'), r2 = this.resizer('right');
        main.append(this.leftPanel, r1, this.center, r2, this.rightPanel);
        this.root.append(this.header, main, this.statusBar);
        document.getElementById('app')!.append(this.root);
        this.canvas = new LevelCanvas(this.stage, {
            level: () => this.cur!,
            tool: () => this.tool,
            brush: () => this.brush,
            selection: () => this.sel,
            select: (s) => {
                this.sel = s;
                this.renderCanvas();
                this.renderRight();
            },
            begin: () => (this.dragBase = J(this.cur)),
            live: (fn) => {
                fn(this.cur!);
                this.renderCanvas();
            },
            end: () => {
                if (this.dragBase && this.dragBase !== J(this.cur)) this.pushUndo(this.dragBase);
                this.dragBase = null;
                this.changed();
            },
            commit: (fn) => this.commit(fn),
        });
        this.bindKeys();
        this.boot();
    }

    // ---------------- Khởi động & lưu trữ ----------------
    private async boot() {
        const kind = await metaGet<string>('storage');
        if (kind === 'browser') return this.useStore(new LevelStore(new BrowserVFS()));
        const saved = await savedFolder().catch(() => null);
        if (saved?.granted) return this.useStore(new LevelStore(new FolderVFS(saved.handle)));
        // lần đầu (hoặc folder cũ cần cấp quyền lại): mở ngay Browser storage với level của game;
        // vẫn chọn / reconnect folder được ở thanh trên cùng hoặc panel Levels
        this.pendingFolder = saved?.handle ?? null;
        await this.useStore(new LevelStore(new BrowserVFS()));
        if (this.pendingFolder) this.setStatus(`Đang dùng Browser storage. Bấm "Reconnect ${this.pendingFolder.name}/" ở panel Levels để quay lại folder.`);
    }

    async useStore(store: LevelStore) {
        this.store = store;
        await metaSet('storage', store.fs.kind);
        // nơi lưu trống (browser storage mới hoặc folder mới): nạp sẵn level của game
        if ((await store.listLevels()).length === 0 && (await store.collections()).length === 0) {
            await this.seedSamples(store);
            this.setStatus(`Đã nạp ${Object.keys(SAMPLE_LEVELS).length} level của game vào ${store.fs.label}`);
        }
        await this.reload();
        const draft = await store.readDraft();
        if (draft && this.levels.some((l) => l.id === draft.id)) {
            await this.openLevel(draft.id);
            if (J(draft) !== this.saved) {
                this.cur = draft;
                this.setStatus(`Mở lại bản nháp chưa lưu của ${draft.name ?? '#' + draft.id}`);
            }
        } else if (this.levels.length) await this.openLevel(this.levels[0].id);
        this.renderAll();
    }

    /** Browser storage trống: nạp sẵn level và collection của game để thử */
    /** thêm các level của game còn thiếu (theo id) – không ghi đè level đang có */
    async addGameLevels() {
        const store = this.store;
        if (!store) return;
        const have = new Set((await store.listLevels()).map((l) => l.id));
        let n = 0;
        for (const lv of Object.values(SAMPLE_LEVELS)) {
            if (have.has(lv.id)) continue;
            await store.fs.write(`levels/${lv.id}.json`, JSON.stringify(lv, null, 1) + '\n');
            n++;
        }
        const cols = await store.collections();
        if (!cols.some((c) => c.name === 'Main')) {
            const main = (Object.values(SAMPLE_COLS)[0]?.collections ?? []).find((c) => c.name === 'Main');
            if (main) {
                cols.push(structuredClone(main));
                await store.saveCollection(cols[cols.length - 1], null, cols);
            }
        }
        await this.reload();
        this.setStatus(n ? `Đã thêm ${n} level của game (level trùng id được giữ nguyên)` : 'Đã có đủ level của game');
    }

    private async seedSamples(store: LevelStore) {
        for (const lv of Object.values(SAMPLE_LEVELS)) await store.fs.write(`levels/${lv.id}.json`, JSON.stringify(lv, null, 1) + '\n');
        const cols = Object.values(SAMPLE_COLS)[0]?.collections ?? [];
        await store.writeCollections(cols);
        for (const c of cols) await store.saveCollection(c, null, cols);
    }

    async reload() {
        if (!this.store) return;
        this.levels = await this.store.listLevels();
        await this.organiser.load();
        this.renderAll();
    }

    private async chooseFolder() {
        const fs = await pickFolder();
        if (fs) await this.useStore(new LevelStore(fs));
    }

    private async reconnectFolder() {
        if (!this.pendingFolder) return;
        const fs = await reconnect(this.pendingFolder);
        if (fs) await this.useStore(new LevelStore(fs));
    }

    private useBrowser() {
        void this.useStore(new LevelStore(new BrowserVFS() as VFS));
    }

    // ---------------- Level hiện tại ----------------
    get dirty() {
        return !!this.cur && J(this.cur) !== this.saved;
    }

    async openLevel(id: number) {
        const lv = this.levels.find((l) => l.id === id);
        if (!lv) return;
        if (this.dirty && !(await confirmBox('Unsaved changes', `"${this.cur!.name}" có thay đổi chưa lưu. Bỏ thay đổi và mở level khác?`, 'Discard'))) return;
        this.cur = clone(lv);
        this.saved = J(lv);
        this.undo = [];
        this.redo = [];
        this.sel = null;
        this.solveInfo = '';
        this.genInfo = '';
        void this.store?.writeDraft(null);
        this.renderAll();
    }

    private pushUndo(s: string) {
        this.undo.push(s);
        if (this.undo.length > MAX_UNDO) this.undo.shift();
        this.redo = [];
    }

    commit(fn: (lv: LevelDef) => void) {
        if (!this.cur) return;
        const before = J(this.cur);
        fn(this.cur);
        if (J(this.cur) === before) return;
        this.pushUndo(before);
        this.changed();
    }

    changed() {
        this.renderDetails();
        this.renderCanvas();
        this.renderRight();
        this.renderHeader();
        this.renderLeft();
        clearTimeout(this.draftTimer);
        this.draftTimer = window.setTimeout(() => void this.store?.writeDraft(this.dirty ? this.cur : null), 600);
    }

    doUndo() {
        const s = this.undo.pop();
        if (!s || !this.cur) return;
        this.redo.push(J(this.cur));
        this.cur = JSON.parse(s);
        this.validateSel();
        this.changed();
    }

    doRedo() {
        const s = this.redo.pop();
        if (!s || !this.cur) return;
        this.undo.push(J(this.cur));
        this.cur = JSON.parse(s);
        this.validateSel();
        this.changed();
    }

    private validateSel() {
        const s = this.sel;
        if (!s || !this.cur) return;
        const n = s.kind === 'bus' ? this.cur.buses.length : (this.cur.spareSlots ?? []).length;
        if (s.i >= n) this.sel = null;
    }

    async save() {
        if (!this.store || !this.cur) return;
        await this.store.saveLevel(this.cur);
        const i = this.levels.findIndex((l) => l.id === this.cur!.id);
        if (i >= 0) this.levels[i] = clone(this.cur);
        this.saved = J(this.cur);
        await this.store.writeDraft(null);
        const n = (await this.store.versions(this.cur.id)).length + 1;
        this.setStatus(`Saved ${this.cur.name ?? '#' + this.cur.id} (version ${n})`);
        this.renderAll();
    }

    /** sửa thông tin quản lý: ghi thẳng vào file (không tạo version, không ghi kèm thay đổi chưa lưu) */
    async setMeta(key: 'name' | 'status' | 'difficulty' | 'category', value: string) {
        if (!this.store || !this.cur) return;
        (this.cur as unknown as Record<string, unknown>)[key] = value || undefined;
        const disk = await this.store.readLevel(this.cur.id);
        if (disk) {
            (disk as unknown as Record<string, unknown>)[key] = value || undefined;
            await this.store.saveLevel(disk, false);
            const savedObj = JSON.parse(this.saved) as Record<string, unknown>;
            savedObj[key] = value || undefined;
            this.saved = J(savedObj);
            const i = this.levels.findIndex((l) => l.id === disk.id);
            if (i >= 0) this.levels[i] = disk;
        }
        this.renderLeft();
        this.renderHeader();
    }

    async setId(raw: string) {
        if (!this.store || !this.cur) return;
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0) return this.setStatus('Id phải là số nguyên dương');
        if (id === this.cur.id) return;
        if (this.levels.some((l) => l.id === id)) return this.setStatus(`Id ${id} đã có level khác`);
        const disk = (await this.store.readLevel(this.cur.id)) ?? this.cur;
        await this.store.renameId(disk, id);
        this.cur.id = id;
        const savedObj = JSON.parse(this.saved);
        savedObj.id = id;
        this.saved = J(savedObj);
        this.levels = await this.store.listLevels();
        await this.organiser.load();
        this.setStatus(`Đổi id thành ${id} (file, lịch sử và collection đã chuyển theo)`);
        this.renderAll();
    }

    // ---------------- Thao tác level ----------------
    async newLevel() {
        if (!this.store) return;
        const lv = newLevel(await this.store.nextId());
        await this.store.saveLevel(lv, false);
        this.levels = await this.store.listLevels();
        this.cur = null;
        await this.openLevel(lv.id);
        this.setStatus(`Tạo level #${lv.id}`);
    }

    async duplicate() {
        if (!this.store || !this.cur) return;
        const lv = clone(this.cur);
        lv.id = await this.store.nextId();
        lv.name = `${this.cur.name ?? 'Level'} (copy)`;
        lv.status = 'WIP';
        await this.store.saveLevel(lv, false);
        this.levels = await this.store.listLevels();
        this.cur = null;
        await this.openLevel(lv.id);
        this.setStatus(`Nhân đôi thành #${lv.id}`);
    }

    async importFiles(files: FileList | File[]) {
        if (!this.store) return;
        const texts = await Promise.all([...files].filter((f) => f.name.endsWith('.json')).map(async (f) => ({ name: f.name, text: await f.text() })));
        const r = await this.store.importLevels(texts);
        this.levels = await this.store.listLevels();
        this.setStatus(`Import ${r.ok.length} level` + (r.failed.length ? `, bỏ qua ${r.failed.length} file lỗi: ${r.failed.join(', ')}` : ''));
        this.renderAll();
    }

    private pickFiles(dir: boolean) {
        const inp = h('input', { type: 'file', accept: '.json,application/json', multiple: true }) as HTMLInputElement;
        if (dir) inp.setAttribute('webkitdirectory', '');
        inp.onchange = () => inp.files && void this.importFiles(inp.files);
        inp.click();
    }

    async deleteLevel() {
        if (!this.store || !this.cur) return;
        const lv = this.cur;
        if (!(await confirmBox('Delete level', `Xoá "${lv.name ?? '#' + lv.id}" (#${lv.id})? Lịch sử bản cũ vẫn được giữ, level bị gỡ khỏi các collection.`))) return;
        await this.store.deleteLevel(lv.id);
        await this.store.writeDraft(null);
        this.levels = await this.store.listLevels();
        await this.organiser.load();
        this.cur = null;
        this.saved = '';
        if (this.levels.length) await this.openLevel(this.levels[0].id);
        this.setStatus(`Đã xoá #${lv.id}`);
        this.renderAll();
    }

    async showVersions(anchor: HTMLElement) {
        if (!this.store || !this.cur) return;
        const vs = await this.store.versions(this.cur.id);
        const pop = h('div', { class: 'popover' });
        if (!vs.length) pop.append(h('div', { class: 'hint' }, 'Chưa có bản cũ'));
        for (const v of vs)
            pop.append(
                h('button', {
                    onClick: () => {
                        this.pushUndo(J(this.cur));
                        this.cur = { ...v.level, id: this.cur!.id };
                        this.setStatus(`Nạp bản ${fmtTime(v.time)} (chưa lưu – Save để giữ)`);
                        pop.remove();
                        this.changed();
                    },
                }, `${fmtTime(v.time)} · ${v.level.buses.length} xe`),
            );
        const r = anchor.getBoundingClientRect();
        pop.style.left = r.right + 6 + 'px';
        pop.style.top = r.top + 'px';
        document.body.append(pop);
        setTimeout(() => document.addEventListener('pointerdown', (e) => !pop.contains(e.target as Node) && pop.remove(), { once: true }));
    }

    // ---------------- Solver ----------------
    private getWorker() {
        if (!this.worker) this.worker = new Worker(new URL('./solverWorker.ts', import.meta.url), { type: 'module' });
        return this.worker;
    }

    runSolve() {
        if (!this.cur) return;
        const id = ++this.reqId;
        this.solveInfo = '⏳ Đang giải…';
        this.renderRight();
        const w = this.getWorker();
        w.onmessage = (e) => {
            if (e.data.id !== id) return;
            if (e.data.error) {
                this.solveInfo = '⚠ ' + e.data.error;
                return this.renderRight();
            }
            const r = e.data.result, d = e.data.difficulty;
            const taps = r.moves.filter((m: number) => m >= 0).length;
            if (r.status === 'solved') {
                const label = diffLabel(d.winRate);
                this.commit((lv) => {
                    lv.goal = r.goal;
                    lv.difficulty = label;
                });
                this.solveInfo = h('div', {},
                    h('div', { class: 'issue ok' }, `✓ Giải được: ${taps} lần tap, chơi ~${r.seconds} giây (${r.nodes} trạng thái, ${r.ms} ms)`),
                    h('div', {}, 'Goal: ', h('b', {}, r.goal), ' xe'),
                    h('div', {}, `Người chơi ngẫu nhiên thắng ${Math.round(d.winRate * 100)}% → `, h('span', { class: 'diff ' + diffClass(label) }, label)),
                    h('div', { class: 'hint' }, '_TBD_: thang độ khó này chưa chuẩn khi có giới hạn N (xem spec).'),
                );
            } else this.solveInfo = h('div', { class: 'issue ' + (r.status === 'unsolvable' ? 'error' : 'warn') }, r.status === 'unsolvable' ? '✗ Không giải được' : `? Chưa tìm ra lời giải sau ${r.nodes} trạng thái`);
            this.renderRight();
        };
        w.postMessage({ id, type: 'solve', level: clone(this.cur) });
    }

    runGenerate(colors: number, empty: number, diff: string) {
        if (!this.cur) return;
        const id = ++this.reqId;
        const ranges: Record<string, [number, number]> = { 'Dễ': [0.4, 1], 'Vừa': [0.15, 0.4], 'Khó': [0, 0.15] };
        const [minWin, maxWin] = ranges[diff] ?? [0.15, 0.4];
        this.genInfo = '⏳ Đang sinh…';
        this.renderGen();
        const w = this.getWorker();
        w.onmessage = (e) => {
            if (e.data.id !== id) return;
            if (e.data.progress) {
                this.genInfo = `⏳ Đang sinh… thử ${e.data.progress}/40`;
                return this.renderGen();
            }
            const g = e.data.generated;
            if (!g) this.genInfo = '✗ Không sinh được màn giải được, thử đổi số màu / số xe trống';
            else {
                this.commit((lv) => {
                    lv.buses.forEach((b, i) => (b.stack = g.level.buses[i].stack));
                    lv.seed = g.level.seed;
                    lv.goal = g.goal;
                    lv.difficulty = diffLabel(g.winRate);
                });
                this.genInfo = `✓ Đã sinh: goal ${g.goal}, ${g.taps} lần tap, người chơi ngẫu nhiên thắng ${Math.round(g.winRate * 100)}% (${diffLabel(g.winRate)})`;
            }
            this.renderGen();
        };
        w.postMessage({ id, type: 'generate', level: clone(this.cur), colors, empty, minWin, maxWin, tries: 40 });
    }

    // ---------------- Chơi thử ----------------
    play() {
        if (!this.cur) return;
        try {
            localStorage.setItem(PLAYTEST_KEY, JSON.stringify(this.cur));
        } catch {
            return this.setStatus('Không ghi được level chơi thử (storage bị chặn)');
        }
        const src = (import.meta.env.DEV ? '../?playtest' : '../demo/?playtest') + '&t=' + Date.now();
        const frame = h('iframe', { src, title: 'Play test' }) as HTMLIFrameElement;
        const close = () => {
            ov.remove();
            document.removeEventListener('keydown', esc, true);
            window.removeEventListener('message', onMsg);
        };
        // Esc khi bàn phím đang ở trong khung game
        const onMsg = (e: MessageEvent) => {
            if (e.origin === location.origin && e.data?.type === 'fishloop:close-playtest') close();
        };
        window.addEventListener('message', onMsg);
        const esc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        };
        const ov = h('div', { class: 'play' },
            h('div', { class: 'pbar' },
                h('button', { onClick: close }, '‹ Back'),
                h('button', { onClick: () => (frame.src = src.replace(/t=\d+/, 't=' + Date.now())) }, '↻ Restart'),
                h('span', { class: 'hint' }, `Chơi thử: #${this.cur.id} ${this.cur.name ?? ''}${this.dirty ? ' (gồm thay đổi chưa lưu)' : ''} · Esc để quay lại · "Xem lời giải" nằm trong ⚙ của game`),
            ),
            frame,
        );
        document.addEventListener('keydown', esc, true);
        document.body.append(ov);
        frame.focus();
    }

    // ---------------- Giao diện ----------------
    setStatus(s: string) {
        this.status = s;
        this.statusBar.textContent = s;
    }

    savePrefs() {
        try {
            localStorage.setItem(UI_KEY, JSON.stringify(this.prefs));
        } catch {
            /* bỏ qua */
        }
    }

    private resizer(side: 'left' | 'right') {
        const r = h('div', { class: 'resizer', title: 'Kéo để đổi kích thước, bấm đúp để về mặc định' });
        r.addEventListener('pointerdown', (e) => {
            r.setPointerCapture(e.pointerId);
            const x0 = e.clientX, w0 = side === 'left' ? this.prefs.leftW : this.prefs.rightW;
            const move = (ev: PointerEvent) => {
                const w = Math.max(180, Math.min(520, w0 + (side === 'left' ? ev.clientX - x0 : x0 - ev.clientX)));
                if (side === 'left') this.prefs.leftW = w;
                else this.prefs.rightW = w;
                this.applyPanelSizes();
            };
            const up = () => {
                r.removeEventListener('pointermove', move);
                this.savePrefs();
            };
            r.addEventListener('pointermove', move);
            r.addEventListener('pointerup', up, { once: true });
        });
        r.addEventListener('dblclick', () => {
            if (side === 'left') this.prefs.leftW = 250;
            else this.prefs.rightW = 290;
            this.applyPanelSizes();
            this.savePrefs();
        });
        return r;
    }

    applyPanelSizes() {
        this.leftPanel.style.width = this.prefs.leftW + 'px';
        this.rightPanel.style.width = this.prefs.rightW + 'px';
        this.leftPanel.classList.toggle('collapsed', this.prefs.leftCollapsed);
        this.rightPanel.classList.toggle('collapsed', this.prefs.rightCollapsed);
    }

    collapseBtn(side: 'left' | 'right') {
        const c = side === 'left' ? this.prefs.leftCollapsed : this.prefs.rightCollapsed;
        const arrow = side === 'left' ? (c ? '›' : '‹') : c ? '‹' : '›';
        return h('button', {
            class: 'ghost', 'aria-label': c ? 'Expand panel' : 'Collapse panel',
            onClick: () => {
                if (side === 'left') this.prefs.leftCollapsed = !this.prefs.leftCollapsed;
                else this.prefs.rightCollapsed = !this.prefs.rightCollapsed;
                this.savePrefs();
                this.renderAll();
            },
        }, arrow);
    }

    renderAll() {
        this.applyPanelSizes();
        this.renderHeader();
        this.statusBar.textContent = this.status;
        if (this.prefs.tab === 'organiser') {
            this.organiser.render(this.leftPanel, this.center, this.rightPanel);
            return;
        }
        this.renderLeft();
        this.renderCenter();
        this.renderRight();
    }

    renderHeader() {
        const p = this.prefs;
        const tab = (t: UiPrefs['tab'], label: string) =>
            h('button', { class: p.tab === t ? 'cur' : '', onClick: () => { p.tab = t; this.savePrefs(); this.renderAll(); } }, label);
        const fs = this.store?.fs;
        const editor = p.tab === 'editor';
        this.header.replaceChildren(...kids(
            h('div', { class: 'logo', role: 'img', 'aria-label': 'Athena' }),
            h('div', { class: 'app-name' }, 'Fish Loop Editor'),
            h('div', { class: 'tabs' }, tab('editor', 'Editor'), tab('organiser', 'Organiser')),
            h('span', { class: 'spacer' }),
            fs ? h('span', { class: 'pill', title: fs.kind === 'folder' ? 'Folder trên máy' : 'Lưu trong trình duyệt này' }, fs.label) : null,
            fs ? h('button', { title: 'Đọc lại từ nơi lưu', 'aria-label': 'Reload', onClick: () => void this.reload() }, '⟳') : null,
            canPickFolder() ? h('button', { onClick: () => void this.chooseFolder() }, fs?.kind === 'folder' ? 'Change folder' : 'Choose folder') : null,
            editor && this.cur ? h('span', { class: 'save-state' + (this.dirty ? ' dirty' : '') }, this.dirty ? `${this.cur.name ?? '#' + this.cur.id} · Unsaved changes` : 'Saved') : null,
            editor ? h('button', { title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', disabled: !this.undo.length, onClick: () => this.doUndo() }, '↶') : null,
            editor ? h('button', { title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', disabled: !this.redo.length, onClick: () => this.doRedo() }, '↷') : null,
            editor ? h('button', { class: this.dirty ? 'primary' : '', disabled: !this.cur, title: 'Save (Ctrl+S)', onClick: () => void this.save() }, 'Save') : null,
            h('button', { onClick: () => { p.theme = p.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = p.theme; this.savePrefs(); } }, 'Theme'),
            h('button', { class: 'primary', disabled: !this.cur, title: 'Play (Space)', onClick: () => this.play() }, '▶ Play'),
        ));
    }

    renderLeft() {
        const panel = this.leftPanel;
        if (this.prefs.tab !== 'editor') return;
        panel.replaceChildren(h('div', { class: 'ph' }, h('span', { style: 'flex:1' }, 'Levels'), this.collapseBtn('left')));
        const body = h('div', { class: 'pb' });
        panel.append(body);
        if (!this.store) {
            body.append(h('div', { class: 'connect' },
                h('div', { class: 'hint' }, 'Chọn nơi lưu level:'),
                this.pendingFolder ? h('button', { class: 'primary', onClick: () => void this.reconnectFolder() }, `Reconnect ${this.pendingFolder.name}/`) : null,
                canPickFolder() ? h('button', { class: this.pendingFolder ? '' : 'primary', onClick: () => void this.chooseFolder() }, 'Choose levels folder') : h('div', { class: 'hint' }, 'Chọn folder chỉ có trên Chrome / Edge.'),
                h('button', { onClick: () => this.useBrowser() }, 'Use browser storage'),
                h('div', { class: 'hint' }, `Folder: chọn thư mục level-data của project để game dùng luôn collection "Main" (folder trống sẽ được nạp sẵn level của game). Browser storage: lưu trong trình duyệt này, có sẵn ${Object.keys(SAMPLE_LEVELS).length} level của game.`),
            ));
            return;
        }
        if (this.pendingFolder && this.store.fs.kind === 'browser')
            body.append(h('button', { class: 'primary', style: 'width:100%;margin-bottom:8px', onClick: () => void this.reconnectFolder() }, `Reconnect ${this.pendingFolder.name}/`));
        body.append(
            h('div', { class: 'row', style: 'margin-bottom:8px' },
                h('button', { title: 'New level', 'aria-label': 'New level', onClick: () => void this.newLevel() }, '+'),
                h('button', { title: 'Duplicate', 'aria-label': 'Duplicate', disabled: !this.cur, onClick: () => void this.duplicate() }, '⧉'),
                h('button', { title: 'Import JSON files', 'aria-label': 'Import files', onClick: () => this.pickFiles(false) }, '⇩'),
                h('button', { title: 'Import a folder', 'aria-label': 'Import folder', onClick: () => this.pickFiles(true) }, '▤'),
                h('button', { title: `Thêm level của game còn thiếu (${Object.keys(SAMPLE_LEVELS).length} level, không ghi đè)`, 'aria-label': 'Add game levels', onClick: () => void this.addGameLevels() }, '★'),
                h('span', { class: 'spacer' }),
                h('button', { class: 'danger', title: 'Delete', 'aria-label': 'Delete level', disabled: !this.cur, onClick: () => void this.deleteLevel() }, '🗑'),
            ),
            h('input', { placeholder: 'Search name or id', value: this.search, style: 'width:100%;margin-bottom:8px', onInput: (e: Event) => { this.search = (e.target as HTMLInputElement).value; this.renderList(list); } }),
        );
        const list = h('div');
        body.append(list);
        this.renderList(list);
    }

    private renderList(list: HTMLElement) {
        const q = this.search.trim().toLowerCase();
        list.replaceChildren();
        for (const l of this.levels) {
            if (q && !(`${l.id}`.includes(q) || (l.name ?? '').toLowerCase().includes(q))) continue;
            const isCur = this.cur?.id === l.id;
            const lv = isCur ? this.cur! : l;
            const colors = colorCounts(lv).size;
            const row = h('div', { class: 'list-row' + (isCur ? ' cur' : ''), onClick: () => !isCur && void this.openLevel(l.id) },
                h('span', { class: 'num' }, '#' + l.id),
                h('div', { style: 'flex:1;min-width:0' },
                    h('div', { class: 'name' }, lv.name ?? 'Level', isCur && this.dirty ? h('span', { class: 'dirty-dot' }, ' ●') : null),
                    h('div', { class: 'sub' }, `${lv.buses.length} xe · ${colors} màu `, h('span', { class: 'diff ' + diffClass(lv.difficulty) }, lv.difficulty ?? 'chưa đo'), lv.status && lv.status !== 'WIP' ? ` · ${lv.status}` : ''),
                ),
                isCur ? h('button', { title: 'Older versions', 'aria-label': 'Older versions', onClick: (e: Event) => { e.stopPropagation(); void this.showVersions(e.currentTarget as HTMLElement); } }, '🕘') : null,
            );
            list.append(row);
        }
    }

    renderCenter() {
        const c = this.center;
        c.replaceChildren();
        if (!this.cur) {
            c.append(h('div', { class: 'stage' }, h('div', { class: 'hint' }, this.store ? 'Chưa có level: bấm + để tạo.' : 'Chọn nơi lưu ở panel Levels.')));
            return;
        }
        this.detailsEl = h('div', { class: 'details' });
        c.append(this.detailsEl);
        this.renderDetails();
        c.append(this.renderToolbar());
        c.append(this.stage);
        this.renderCanvas();
        this.genBox = h('div', { class: 'gen' });
        c.append(this.genBox);
        this.renderGen();
    }

    private detailsEl: HTMLElement | null = null;
    /** thanh thông tin: Name, Id, Status, Difficulty, Category */
    renderDetails() {
        const box = this.detailsEl;
        if (!box || !this.cur) return;
        if (box.contains(document.activeElement)) return; // đang gõ thì không vẽ lại
        const lv = this.cur;
        const meta = (key: 'name' | 'category') => {
            let t = 0;
            return h('input', { value: lv[key] ?? '', onInput: (e: Event) => { const v = (e.target as HTMLInputElement).value; clearTimeout(t); t = window.setTimeout(() => void this.setMeta(key, v), 500); } });
        };
        const sel = (key: 'status' | 'difficulty', opts: string[], blank?: string) =>
            h('select', { onChange: (e: Event) => void this.setMeta(key, (e.target as HTMLSelectElement).value) },
                blank !== undefined ? h('option', { value: '' }, blank) : null,
                opts.map((o) => h('option', { value: o, selected: (lv[key] ?? '') === o }, o)),
            );
        box.replaceChildren(
            h('label', {}, h('div', { class: 'lb' }, 'Name'), meta('name')),
            h('label', {}, h('div', { class: 'lb' }, 'Id'), h('input', { value: lv.id, inputmode: 'numeric', onChange: (e: Event) => void this.setId((e.target as HTMLInputElement).value) })),
            h('label', {}, h('div', { class: 'lb' }, 'Status'), sel('status', ['WIP', 'PROD', 'ARCHIVE'])),
            h('label', {}, h('div', { class: 'lb' }, 'Difficulty'), sel('difficulty', DIFFS, 'chưa đo')),
            h('label', {}, h('div', { class: 'lb' }, 'Category'), meta('category')),
        );
    }

    private toolbarEl: HTMLElement | null = null;
    private renderToolbar() {
        const tb = h('div', { class: 'toolbar' });
        this.toolbarEl = tb;
        this.fillToolbar();
        return tb;
    }

    fillToolbar() {
        const tb = this.toolbarEl;
        if (!tb) return;
        const tool = (t: Tool, label: string, key: string) =>
            h('button', { class: this.tool === t ? 'on' : '', title: `${label} (${key})`, onClick: () => this.setTool(t) }, `${key} ${label}`);
        tb.replaceChildren(...kids(
            tool('select', 'Chọn', 'V'),
            tool('pipe', 'Ống', 'P'),
            h('span', { class: 'lb', style: 'margin:0 4px' }, '|'),
            COLORS.map((c, i) =>
                h('button', {
                    class: 'swatch' + (this.brush === c ? ' on' : ''), style: `background:${PALETTE[c].css};border-color:${PALETTE[c].css}`,
                    title: i < 8 ? `Cọ ${c} (${i + 1})` : `Cọ ${c}`, 'aria-label': `Brush ${c}`, onClick: () => this.setBrush(this.brush === c ? null : c),
                }, h('small', {}, i < 8 ? i + 1 : '')),
            ),
            h('button', { class: this.brush === 'erase' ? 'on' : '', title: 'Tẩy (0)', onClick: () => this.setBrush(this.brush === 'erase' ? null : 'erase') }, '0 Tẩy'),
            h('span', { class: 'spacer' }),
            h('select', {
                title: 'Mẫu ống',
                onChange: (e: Event) => {
                    const k = (e.target as HTMLSelectElement).value;
                    if (!k) return;
                    const pre = PIPE_PRESETS[k];
                    this.commit((lv) => {
                        lv.pipe.points = clone(pre.points);
                        lv.pipe.cornerRadius = pre.cornerRadius;
                        lv.pipe.open = pre.open || undefined;
                        lv.buses.forEach((b) => (b.portS = null));
                    });
                    (e.target as HTMLSelectElement).value = '';
                },
            }, h('option', { value: '' }, 'Mẫu ống…'), Object.keys(PIPE_PRESETS).map((k) => h('option', { value: k }, k))),
            h('button', {
                onClick: () => this.commit((lv) => {
                    lv.buses.push({ x: 540, y: 960, rot: 0, capacity: 4, stack: [], portS: null });
                    this.sel = { kind: 'bus', i: lv.buses.length - 1 };
                }),
            }, '+ Xe'),
            h('button', { title: 'Tự tìm chỗ trống cho xe dự phòng (booster Thêm xe)', onClick: () => this.addSpare() }, '+ Dự phòng'),
        ));
    }

    /** tự tìm chỗ trống cho 1 xe dự phòng; hết chỗ thì báo */
    addSpare() {
        if (!this.cur) return;
        let found: { x: number; y: number; rot: number }[] = [];
        try {
            found = autoSpareSlots(this.cur, 1);
        } catch {
            /* ống lỗi */
        }
        if (!found.length) return this.setStatus('Không còn chỗ trống cho xe dự phòng: dời xe, giảm "Cỡ xe" hoặc bấm "Tự xếp xe"');
        this.commit((lv) => {
            (lv.spareSlots ??= []).push(found[0]);
            this.sel = { kind: 'spare', i: lv.spareSlots.length - 1 };
        });
        this.setStatus(`Đặt chỗ dự phòng ở (${found[0].x}, ${found[0].y}), xoay ${found[0].rot}°`);
    }

    setTool(t: Tool) {
        this.tool = t;
        if (t === 'pipe') this.brush = null;
        this.fillToolbar();
        this.renderCanvas();
    }

    setBrush(b: FishColor | 'erase' | null) {
        this.brush = b;
        if (b) this.tool = 'select';
        this.fillToolbar();
        this.renderCanvas();
    }

    renderCanvas() {
        if (this.cur && this.prefs.tab === 'editor') this.canvas.render();
    }

    private genBox: HTMLElement | null = null;
    private genColors = 4;
    private genEmpty = 1;
    private genDiff = 'Vừa';
    renderGen() {
        const g = this.genBox;
        if (!g || !this.cur) return;
        const num = (v: number, set: (n: number) => void, min: number, max: number) =>
            h('input', { type: 'number', min, max, value: v, onChange: (e: Event) => set(Number((e.target as HTMLInputElement).value)) });
        g.replaceChildren(...kids(
            h('div', { class: 'row' }, h('b', {}, 'Sinh màu ngẫu nhiên'), h('span', { class: 'hint' }, 'giữ ống và vị trí xe · mỗi màu 4 nấc')),
            h('div', { class: 'row wrap', style: 'margin-top:5px' },
                h('span', { class: 'lb' }, 'Số màu'), num(this.genColors, (n) => (this.genColors = n), 1, COLORS.length),
                h('span', { class: 'lb' }, 'Xe trống'), num(this.genEmpty, (n) => (this.genEmpty = n), 0, 20),
                h('span', { class: 'lb' }, 'Độ khó'),
                h('select', { onChange: (e: Event) => (this.genDiff = (e.target as HTMLSelectElement).value) }, ['Dễ', 'Vừa', 'Khó'].map((d) => h('option', { selected: d === this.genDiff }, d))),
                h('span', { class: 'spacer' }),
                h('button', { onClick: () => this.commit((lv) => Object.assign(lv, autoArrange(lv))) }, 'Tự xếp xe'),
                h('button', { class: 'primary', onClick: () => this.runGenerate(this.genColors, this.genEmpty, this.genDiff) }, '🎲 Sinh'),
            ),
            this.genInfo ? h('div', { class: 'hint' }, this.genInfo) : null,
        ));
    }

    renderRight() {
        const panel = this.rightPanel;
        if (this.prefs.tab !== 'editor') return;
        panel.replaceChildren(h('div', { class: 'ph' }, h('span', { style: 'flex:1' }, 'Inspector'), this.collapseBtn('right')));
        const body = h('div', { class: 'pb' });
        panel.append(body);
        const lv = this.cur;
        if (!lv) return;
        const num = (label: string, v: number | undefined, set: (lv: LevelDef, n: number) => void, attrs: Record<string, unknown> = {}) =>
            h('label', { class: 'field' }, h('span', { class: 'lb' }, label),
                h('input', { type: 'number', value: v ?? '', ...attrs, onChange: (e: Event) => { const n = Number((e.target as HTMLInputElement).value); if (!Number.isNaN(n)) this.commit((l) => set(l, n)); } }));
        const rots = (cur: number, set: (r: number) => void) =>
            h('div', { class: 'row' }, [0, 90, 180, 270].map((r) => h('button', { class: ((cur % 360) + 360) % 360 === r ? 'on' : '', onClick: () => set(r) }, r)));

        // --- vùng chọn
        const s = this.sel;
        const sec = h('div', { class: 'insp-sec' });
        if (s?.kind === 'bus' && lv.buses[s.i]) {
            const b = lv.buses[s.i];
            const manual = b.portS !== null && b.portS !== undefined;
            sec.append(
                h('div', { class: 'lb' }, `Xe #${s.i + 1} (đang chọn)`),
                num('X', b.x, (l, n) => (l.buses[s.i].x = n)),
                num('Y', b.y, (l, n) => (l.buses[s.i].y = n)),
                h('div', { class: 'field' }, h('span', { class: 'lb' }, 'Xoay'), rots(b.rot, (r) => this.commit((l) => { l.buses[s.i].rot = r; l.buses[s.i].portS = null; }))),
                h('div', { class: 'field' }, h('span', { class: 'lb' }, 'Nấc'),
                    h('div', { class: 'chips' }, b.stack.length ? b.stack.map((c) => h('span', { class: 'chip', title: c, style: `background:${PALETTE[c].css}` })) : h('span', { class: 'hint' }, 'trống'), h('span', { class: 'hint' }, ` ${b.stack.length}/4 · đầu → đuôi`))),
                h('div', { class: 'hint' }, 'Sức chứa: 4 nấc (cố định). Chọn cọ màu rồi bấm vào bể để tô.'),
                h('div', { class: 'field' }, h('span', { class: 'lb' }, 'Cổng'),
                    h('div', { class: 'row' },
                        h('button', { class: manual ? '' : 'on', onClick: () => this.commit((l) => (l.buses[s.i].portS = null)) }, 'Tự động'),
                        h('button', { class: manual ? 'on' : '', onClick: () => this.commit((l) => { if (l.buses[s.i].portS == null) l.buses[s.i].portS = this.autoPortS(l, s.i); }) }, 'Đặt tay'))),
                h('div', { class: 'row', style: 'margin-top:6px' },
                    h('button', { onClick: () => this.rotateSel() }, 'R Xoay'),
                    h('button', { onClick: () => this.duplicateSel() }, 'D Nhân'),
                    h('button', { class: 'danger', onClick: () => this.deleteSel() }, 'Xoá')),
            );
        } else if (s?.kind === 'spare' && lv.spareSlots?.[s.i]) {
            const sp = lv.spareSlots[s.i];
            sec.append(
                h('div', { class: 'lb' }, `Vị trí xe dự phòng ${s.i + 1}`),
                num('X', sp.x, (l, n) => (l.spareSlots![s.i].x = n)),
                num('Y', sp.y, (l, n) => (l.spareSlots![s.i].y = n)),
                h('div', { class: 'field' }, h('span', { class: 'lb' }, 'Xoay'), rots(sp.rot, (r) => this.commit((l) => (l.spareSlots![s.i].rot = r)))),
                h('button', { class: 'danger', onClick: () => this.deleteSel() }, 'Xoá vị trí'),
            );
        } else sec.append(h('div', { class: 'hint' }, this.tool === 'pipe' ? 'P: kéo điểm ống, ⊕ thêm điểm, bấm đúp để xoá điểm. Điểm vàng là điểm bắt đầu.' : 'Bấm vào xe để chọn. Kéo chấm trên ống để đặt cổng tay.'));
        body.append(sec);

        // --- ống & thông số
        let C = 0;
        try {
            C = Math.floor(new PipePath(lv.pipe).length / lv.slotLength);
        } catch {
            /* ống lỗi: báo ở phần kiểm tra */
        }
        body.append(h('div', { class: 'insp-sec' },
            h('div', { class: 'lb' }, 'Ống và thông số'),
            h('div', { class: 'field' }, h('span', { class: 'lb' }, 'Ống hở'),
                h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!lv.pipe.open, onChange: (e: Event) => this.commit((l) => { l.pipe.open = (e.target as HTMLInputElement).checked || undefined; l.buses.forEach((b) => (b.portS = null)); }) }), h('span', { class: 'hint' }, '2 cổng, cá qua cổng tức thì'))),
            num('Bo góc', lv.pipe.cornerRadius, (l, n) => (l.pipe.cornerRadius = Math.max(0, n))),
            num('Tốc độ', lv.pipeSpeed, (l, n) => (l.pipeSpeed = Math.max(20, n))),
            num('Dài 1 nấc', lv.slotLength, (l, n) => (l.slotLength = Math.max(20, n))),
            num('Cá / nấc', lv.fishPerUnit, (l, n) => (l.fishPerUnit = Math.max(1, Math.min(8, n)))),
            num('N (x/N)', lv.pipeLimit ?? 5, (l, n) => (l.pipeLimit = Math.max(1, n)), { min: 1 }),
            num('Cỡ xe', lv.busScale ?? 1, (l, n) => (l.busScale = n === 1 ? undefined : Math.max(0.3, Math.min(1.2, n))), { step: 0.02, min: 0.3, max: 1.2 }),
            h('div', { class: 'hint' }, `Sức chứa ống: ${C} nấc`),
        ));
        body.append(h('div', { class: 'insp-sec' },
            h('div', { class: 'lb' }, 'Booster'),
            num('Return', lv.boosters.undo, (l, n) => (l.boosters.undo = Math.max(0, n))),
            num('Shuffle', lv.boosters.shuffle, (l, n) => (l.boosters.shuffle = Math.max(0, n))),
            num('Thêm xe', lv.boosters.addBus, (l, n) => (l.boosters.addBus = Math.max(0, n))),
            num('Seed', lv.seed, (l, n) => (l.seed = n)),
        ));

        // --- kiểm tra
        const issues: Issue[] = validateLevel(lv);
        body.append(h('div', { class: 'insp-sec' },
            h('div', { class: 'lb' }, 'Level checks'),
            issues.length ? issues.map((i) => h('div', { class: 'issue ' + i.level }, (i.level === 'error' ? '✗ ' : i.level === 'warn' ? '⚠ ' : 'ℹ ') + i.msg)) : h('div', { class: 'issue ok' }, '✓ Không có lỗi dữ liệu'),
        ));
        body.append(h('div', { class: 'insp-sec' },
            h('div', { class: 'lb' }, 'Mô phỏng'),
            h('button', { style: 'width:100%;margin:4px 0', onClick: () => this.runSolve() }, '🧠 Kiểm tra giải được'),
            this.solveInfo,
            lv.goal ? h('div', { class: 'hint' }, `Goal hiện lưu: ${lv.goal} xe`) : null,
        ));
    }

    /** cổng tự động hiện tại của xe i (để chuyển sang đặt tay) */
    private autoPortS(lv: LevelDef, i: number) {
        try {
            const b = lv.buses[i];
            return Math.round(autoPortS(new PipePath(lv.pipe), b.x, b.y, b.rot, b.capacity, lv.busScale ?? 1));
        } catch {
            return 0;
        }
    }

    rotateSel() {
        const s = this.sel;
        if (!s) return;
        this.commit((l) => {
            const o = s.kind === 'bus' ? l.buses[s.i] : l.spareSlots![s.i];
            o.rot = ((o.rot ?? 0) + 90) % 360;
            if (s.kind === 'bus') l.buses[s.i].portS = null;
        });
    }

    duplicateSel() {
        const s = this.sel;
        if (!s) return;
        this.commit((l) => {
            if (s.kind === 'bus') {
                l.buses.push({ ...clone(l.buses[s.i]), x: l.buses[s.i].x + 40, y: l.buses[s.i].y + 40, portS: null });
                this.sel = { kind: 'bus', i: l.buses.length - 1 };
            } else {
                l.spareSlots!.push({ ...clone(l.spareSlots![s.i]), y: l.spareSlots![s.i].y + 40 });
                this.sel = { kind: 'spare', i: l.spareSlots!.length - 1 };
            }
        });
    }

    deleteSel() {
        const s = this.sel;
        if (!s) return;
        this.sel = null;
        this.commit((l) => {
            if (s.kind === 'bus') l.buses.splice(s.i, 1);
            else l.spareSlots!.splice(s.i, 1);
        });
    }

    private bindKeys() {
        document.addEventListener('keydown', (e) => {
            const t = e.target as HTMLElement;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
            if (document.querySelector('.modal-back, .play')) return;
            const mod = e.ctrlKey || e.metaKey;
            const k = e.key.toLowerCase();
            if (mod && k === 's') {
                e.preventDefault();
                void this.save();
            } else if (mod && k === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.doUndo();
            } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.doRedo();
            } else if (mod) return;
            else if (this.prefs.tab !== 'editor' || !this.cur) return;
            else if (k === 'v') this.setTool('select');
            else if (k === 'p') this.setTool('pipe');
            else if (k >= '1' && k <= '8') this.setBrush(COLORS[Number(k) - 1]);
            else if (k === '0') this.setBrush('erase');
            else if (k === 'r') this.rotateSel();
            else if (k === 'd') this.duplicateSel();
            else if (k === 'delete' || k === 'backspace') this.deleteSel();
            else if (k === ' ') {
                e.preventDefault();
                this.play();
            } else if (k === 'escape') {
                if (this.brush) this.setBrush(null);
                else if (this.sel) {
                    this.sel = null;
                    this.renderCanvas();
                    this.renderRight();
                } else this.setTool('select');
            }
        });
        window.addEventListener('beforeunload', (e) => {
            if (this.dirty) e.preventDefault();
        });
    }
}

new App();
