import type { LevelDef } from '../../src/core/types';
import type { VFS } from './vfs';

/**
 * Dữ liệu level trên VFS, theo cấu trúc trong spec (docs/guide/editor.md):
 *   levels/<id>.json, levels/.versions/<id>/<thời điểm>.json (3 bản gần nhất),
 *   drafts/current.json, collections.json, collections/<Tên>/NNN_<id>.json
 */
export interface Collection {
    name: string;
    version: number;
    levels: number[];
}

export interface Version {
    file: string;
    time: number;
    level: LevelDef;
}

export const KEEP_VERSIONS = 3;
const json = (o: unknown) => JSON.stringify(o, null, 1) + '\n';
const pad = (n: number) => String(n).padStart(3, '0');
export const copyName = (i: number, id: number) => `${pad(i + 1)}_${id}.json`;

export class LevelStore {
    constructor(readonly fs: VFS) {}

    async listLevels(): Promise<LevelDef[]> {
        const out: LevelDef[] = [];
        for (const f of await this.fs.list('levels')) {
            if (!f.endsWith('.json')) continue;
            const t = await this.fs.read(`levels/${f}`);
            try {
                if (t) out.push(JSON.parse(t));
            } catch {
                /* file hỏng: bỏ qua */
            }
        }
        return out.sort((a, b) => a.id - b.id);
    }

    async readLevel(id: number): Promise<LevelDef | null> {
        const t = await this.fs.read(`levels/${id}.json`);
        return t ? JSON.parse(t) : null;
    }

    /** ghi level; bản đang có trên đĩa được giữ lại làm version cũ (tối đa 3) */
    async saveLevel(lv: LevelDef, keepVersion = true) {
        const path = `levels/${lv.id}.json`;
        const old = await this.fs.read(path);
        const text = json(lv);
        if (old === text) return;
        if (old && keepVersion) {
            await this.fs.write(`levels/.versions/${lv.id}/${Date.now()}.json`, old);
            const files = (await this.fs.list(`levels/.versions/${lv.id}`)).sort();
            for (const f of files.slice(0, Math.max(0, files.length - KEEP_VERSIONS))) await this.fs.remove(`levels/.versions/${lv.id}/${f}`);
        }
        await this.fs.write(path, text);
    }

    async versions(id: number): Promise<Version[]> {
        const files = (await this.fs.list(`levels/.versions/${id}`)).sort().reverse();
        const out: Version[] = [];
        for (const f of files) {
            const t = await this.fs.read(`levels/.versions/${id}/${f}`);
            if (t) out.push({ file: f, time: parseInt(f), level: JSON.parse(t) });
        }
        return out;
    }

    /** xoá level (lịch sử bản cũ vẫn giữ); gỡ id khỏi các collection */
    async deleteLevel(id: number) {
        await this.fs.remove(`levels/${id}.json`);
        const cols = await this.collections();
        for (const c of cols) c.levels = c.levels.filter((x) => x !== id);
        await this.writeCollections(cols);
    }

    /** đổi id: chuyển file, lịch sử và tham chiếu trong collection */
    async renameId(lv: LevelDef, newId: number) {
        const oldId = lv.id;
        await this.fs.write(`levels/${newId}.json`, json({ ...lv, id: newId }));
        await this.fs.remove(`levels/${oldId}.json`);
        for (const f of await this.fs.list(`levels/.versions/${oldId}`)) {
            const t = await this.fs.read(`levels/.versions/${oldId}/${f}`);
            if (t) await this.fs.write(`levels/.versions/${newId}/${f}`, t);
        }
        await this.fs.remove(`levels/.versions/${oldId}`);
        const cols = await this.collections();
        for (const c of cols) c.levels = c.levels.map((x) => (x === oldId ? newId : x));
        await this.writeCollections(cols);
    }

    async nextId(): Promise<number> {
        const ids = (await this.listLevels()).map((l) => l.id);
        return ids.length ? Math.max(...ids) + 1 : 1;
    }

    /** import không bao giờ ghi đè: id trùng thì lấy số trống tiếp theo */
    async importLevels(texts: { name: string; text: string }[]): Promise<{ ok: LevelDef[]; failed: string[] }> {
        const ok: LevelDef[] = [], failed: string[] = [];
        const ids = new Set((await this.listLevels()).map((l) => l.id));
        for (const { name, text } of texts) {
            try {
                const lv = JSON.parse(text) as LevelDef;
                if (!lv.pipe || !Array.isArray(lv.buses)) throw new Error('không phải level');
                let id = Number.isInteger(lv.id) && lv.id > 0 ? lv.id : 1;
                while (ids.has(id)) id++;
                lv.id = id;
                ids.add(id);
                await this.fs.write(`levels/${id}.json`, json(lv));
                ok.push(lv);
            } catch {
                failed.push(name);
            }
        }
        return { ok, failed };
    }

    // ---------------- Nháp ----------------
    async writeDraft(lv: LevelDef | null) {
        if (lv) await this.fs.write('drafts/current.json', json(lv));
        else await this.fs.remove('drafts/current.json');
    }

    async readDraft(): Promise<LevelDef | null> {
        const t = await this.fs.read('drafts/current.json');
        try {
            return t ? JSON.parse(t) : null;
        } catch {
            return null;
        }
    }

    // ---------------- Collection ----------------
    async collections(): Promise<Collection[]> {
        const t = await this.fs.read('collections.json');
        try {
            return t ? (JSON.parse(t).collections ?? []) : [];
        } catch {
            return [];
        }
    }

    async writeCollections(cols: Collection[]) {
        await this.fs.write('collections.json', json({ collections: cols }));
    }

    /** tên file bản copy hiện có trong folder của collection */
    async copies(name: string): Promise<Set<string>> {
        return new Set(await this.fs.list(`collections/${name}`));
    }

    /**
     * Save collection: ghi collections.json và các bản copy NNN_<id>.json theo thứ tự chơi.
     * Đổi tên collection thì folder đổi theo. Trả về số file copy / đánh số lại / gỡ bỏ.
     */
    async saveCollection(c: Collection, oldName: string | null, all: Collection[]) {
        if (oldName && oldName !== c.name) {
            for (const f of await this.fs.list(`collections/${oldName}`)) await this.fs.remove(`collections/${oldName}/${f}`);
            await this.fs.remove(`collections/${oldName}`);
        }
        const want = new Map(c.levels.map((id, i) => [copyName(i, id), id]));
        const have = await this.copies(c.name);
        let copied = 0, renumbered = 0, removed = 0;
        for (const f of have) {
            if (!want.has(f)) {
                await this.fs.remove(`collections/${c.name}/${f}`);
                const id = parseInt(f.split('_')[1]);
                if (c.levels.includes(id)) renumbered++;
                else removed++;
            }
        }
        for (const [f, id] of want) {
            const t = await this.fs.read(`levels/${id}.json`);
            if (!t) continue;
            const cur = await this.fs.read(`collections/${c.name}/${f}`);
            if (cur !== t) {
                await this.fs.write(`collections/${c.name}/${f}`, t);
                if (!have.has(f)) copied++;
            }
        }
        await this.writeCollections(all);
        return { copied, renumbered, removed };
    }

    async removeCollection(name: string, all: Collection[]) {
        // chỉ gỡ khỏi danh sách; folder trên đĩa vẫn giữ (như spec Fish Ball)
        await this.writeCollections(all.filter((c) => c.name !== name));
    }
}
