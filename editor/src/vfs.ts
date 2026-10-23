/**
 * Hệ thống file ảo cho editor: cùng 1 giao diện cho folder trên máy (File System Access API, Chrome/Edge)
 * và Browser storage (IndexedDB). Đường dẫn dạng "levels/1.json", "collections/Main/001_1.json".
 */
export interface VFS {
    readonly kind: 'folder' | 'browser';
    readonly label: string;
    read(path: string): Promise<string | null>;
    write(path: string, text: string): Promise<void>;
    remove(path: string): Promise<void>;
    /** tên file/thư mục con trực tiếp trong thư mục */
    list(dir: string): Promise<string[]>;
}

// ---------------- IndexedDB nhỏ gọn ----------------
function idb(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
        const r = indexedDB.open('fishloop-editor', 1);
        r.onupgradeneeded = () => {
            r.result.createObjectStore('files');
            r.result.createObjectStore('meta');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

async function tx<T>(store: 'files' | 'meta', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await idb();
    return new Promise((res, rej) => {
        const r = fn(db.transaction(store, mode).objectStore(store));
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

export async function metaGet<T>(key: string): Promise<T | undefined> {
    try {
        return await tx<T>('meta', 'readonly', (s) => s.get(key) as IDBRequest<T>);
    } catch {
        return undefined;
    }
}

export async function metaSet(key: string, value: unknown) {
    try {
        await tx('meta', 'readwrite', (s) => s.put(value, key));
    } catch {
        /* bỏ qua */
    }
}

export class BrowserVFS implements VFS {
    readonly kind = 'browser';
    readonly label = 'Browser storage';
    read(path: string) {
        return tx<string | undefined>('files', 'readonly', (s) => s.get(path) as IDBRequest<string | undefined>).then((v) => v ?? null);
    }
    async write(path: string, text: string) {
        await tx('files', 'readwrite', (s) => s.put(text, path));
    }
    async remove(path: string) {
        await tx('files', 'readwrite', (s) => s.delete(path));
    }
    async list(dir: string) {
        const keys = (await tx<IDBValidKey[]>('files', 'readonly', (s) => s.getAllKeys())) as string[];
        const pre = dir.endsWith('/') ? dir : dir + '/';
        const out = new Set<string>();
        for (const k of keys) if (k.startsWith(pre)) out.add(k.slice(pre.length).split('/')[0]);
        return [...out];
    }
}

// ---------------- Folder (File System Access API) ----------------
type Dir = FileSystemDirectoryHandle;

export class FolderVFS implements VFS {
    readonly kind = 'folder';
    constructor(private root: Dir) {}
    get label() {
        return this.root.name + '/';
    }

    private async dir(parts: string[], create: boolean): Promise<Dir | null> {
        let d: Dir = this.root;
        for (const p of parts) {
            try {
                d = await d.getDirectoryHandle(p, { create });
            } catch {
                return null;
            }
        }
        return d;
    }

    async read(path: string) {
        const parts = path.split('/');
        const d = await this.dir(parts.slice(0, -1), false);
        if (!d) return null;
        try {
            const f = await (await d.getFileHandle(parts.at(-1)!)).getFile();
            return await f.text();
        } catch {
            return null;
        }
    }

    async write(path: string, text: string) {
        const parts = path.split('/');
        const d = (await this.dir(parts.slice(0, -1), true))!;
        const h = await d.getFileHandle(parts.at(-1)!, { create: true });
        const w = await h.createWritable();
        await w.write(text);
        await w.close();
    }

    async remove(path: string) {
        const parts = path.split('/');
        const d = await this.dir(parts.slice(0, -1), false);
        try {
            await d?.removeEntry(parts.at(-1)!, { recursive: true });
        } catch {
            /* không có thì thôi */
        }
    }

    async list(dir: string) {
        const d = await this.dir(dir.split('/').filter(Boolean), false);
        if (!d) return [];
        const out: string[] = [];
        for await (const name of (d as unknown as { keys(): AsyncIterable<string> }).keys()) out.push(name);
        return out;
    }
}

export const canPickFolder = () => 'showDirectoryPicker' in window;

/** chọn folder mới; lưu handle để lần sau mở lại */
export async function pickFolder(): Promise<FolderVFS | null> {
    try {
        const h = await (window as unknown as { showDirectoryPicker(o: object): Promise<Dir> }).showDirectoryPicker({ mode: 'readwrite' });
        await metaSet('folder', h);
        return new FolderVFS(h);
    } catch {
        return null;
    }
}

/** folder đã chọn lần trước: trả về handle và trạng thái quyền (có thể phải bấm Reconnect) */
export async function savedFolder(): Promise<{ handle: Dir; granted: boolean } | null> {
    const h = await metaGet<Dir>('folder');
    if (!h) return null;
    const q = await (h as unknown as { queryPermission(o: object): Promise<string> }).queryPermission({ mode: 'readwrite' });
    return { handle: h, granted: q === 'granted' };
}

export async function reconnect(h: Dir): Promise<FolderVFS | null> {
    const r = await (h as unknown as { requestPermission(o: object): Promise<string> }).requestPermission({ mode: 'readwrite' });
    return r === 'granted' ? new FolderVFS(h) : null;
}
