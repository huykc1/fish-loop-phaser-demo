import type { LevelDef } from '../../src/core/types';
import { colorCounts } from '../../src/core/levelUtil';
import { h, modal, confirmBox, kids } from './dom';
import { copyName, type Collection } from './store';
import type { App } from './main';

const diffClass = (d?: string) => (d === 'Dễ' ? 'easy' : d === 'Khó' ? 'hard' : d === 'Rất khó' ? 'vhard' : d ? '' : 'none');

/**
 * Tab Organiser: xếp level thành collection (thứ tự chơi).
 * Mọi thay đổi chỉ được ghi khi bấm Save collection.
 */
export class Organiser {
    cols: Collection[] = [];
    sel = 0;
    /** bản đang sửa của collection đang chọn */
    edit: Collection | null = null;
    private origName: string | null = null;
    private copies = new Set<string>();
    private copyText = new Map<string, string>();

    constructor(private app: App) {}

    get dirty() {
        const c = this.cols[this.sel];
        return !!this.edit && (!c || JSON.stringify(c) !== JSON.stringify(this.edit));
    }

    async load() {
        const store = this.app.store;
        if (!store) return;
        this.cols = await store.collections();
        if (this.sel >= this.cols.length) this.sel = 0;
        await this.pick(this.sel, true);
    }

    private async pick(i: number, force = false) {
        if (!force && this.dirty && !(await confirmBox('Unsaved collection', 'Collection có thay đổi chưa lưu. Bỏ thay đổi?', 'Discard'))) return;
        this.sel = i;
        const c = this.cols[i];
        this.edit = c ? structuredClone(c) : null;
        this.origName = c?.name ?? null;
        await this.refreshCopies();
        this.app.renderAll();
    }

    private async refreshCopies() {
        const store = this.app.store;
        this.copies.clear();
        this.copyText.clear();
        if (!store || !this.origName) return;
        this.copies = await store.copies(this.origName);
        for (const f of this.copies) this.copyText.set(f, (await store.fs.read(`collections/${this.origName}/${f}`)) ?? '');
    }

    private level(id: number): LevelDef | undefined {
        return this.app.levels.find((l) => l.id === id);
    }

    private copyStatus(i: number, id: number): [string, boolean] {
        const f = copyName(i, id);
        if (!this.copies.has(f) || this.origName !== this.edit?.name) return ['not copied yet: Save', false];
        const lv = this.level(id);
        const same = lv && this.copyText.get(f) === JSON.stringify(lv, null, 1) + '\n';
        return same ? ['copy in folder', true] : ['copy outdated: Save', false];
    }

    private mutate(fn: (c: Collection) => void) {
        if (!this.edit) return;
        fn(this.edit);
        this.app.renderAll();
    }

    private async save() {
        const store = this.app.store;
        if (!store || !this.edit) return;
        const name = this.edit.name.trim();
        if (!name || /[\\/:*?"<>|]/.test(name)) return this.app.setStatus('Tên collection không hợp lệ');
        if (this.cols.some((c, i) => i !== this.sel && c.name === name)) return this.app.setStatus(`Đã có collection tên "${name}"`);
        this.edit.name = name;
        const all = [...this.cols];
        all[this.sel] = structuredClone(this.edit);
        const r = await store.saveCollection(this.edit, this.origName, all);
        this.cols = all;
        this.origName = name;
        await this.refreshCopies();
        this.app.setStatus(`Saved ${name}: ${r.copied} copied, ${r.renumbered} renumbered, ${r.removed} removed`);
        this.app.renderAll();
    }

    private async addCollection() {
        const store = this.app.store;
        if (!store) return;
        let n = 1;
        while (this.cols.some((c) => c.name === `Collection ${n}`)) n++;
        this.cols.push({ name: `Collection ${n}`, version: 1, levels: [] });
        await store.writeCollections(this.cols);
        await this.pick(this.cols.length - 1, true);
    }

    private async removeCollection(i: number) {
        const store = this.app.store;
        if (!store) return;
        const c = this.cols[i];
        if (!(await confirmBox('Remove collection', `Gỡ "${c.name}" khỏi danh sách? Folder collections/${c.name}/ trên đĩa vẫn được giữ.`, 'Remove'))) return;
        await store.removeCollection(c.name, this.cols);
        this.cols.splice(i, 1);
        await this.pick(Math.min(this.sel, Math.max(0, this.cols.length - 1)), true);
    }

    /** hộp thoại Add levels (spec 6b) */
    private openAddDialog() {
        const ed = this.edit;
        if (!ed) return;
        const avail = this.app.levels.filter((l) => !ed.levels.includes(l.id));
        const picked = new Set<number>();
        let q = '';
        const list = h('div');
        const count = h('span', { class: 'hint', style: 'flex:1' });
        const addSel = h('button', { class: 'primary', disabled: true }, 'Add selected levels') as HTMLButtonElement;
        const shown = () => avail.filter((l) => !q || (l.name ?? '').toLowerCase().includes(q));
        const draw = () => {
            list.replaceChildren(
                ...shown().map((l) =>
                    h('label', { class: 'check-row' },
                        h('input', { type: 'checkbox', checked: picked.has(l.id), onChange: (e: Event) => { if ((e.target as HTMLInputElement).checked) picked.add(l.id); else picked.delete(l.id); draw(); } }),
                        h('span', { style: 'flex:1' }, h('b', {}, l.name ?? 'Level'), ' ', h('span', { class: 'hint' }, `#${l.id} · ${l.buses.length} xe · ${colorCounts(l).size} màu`)),
                        h('span', { class: 'diff ' + diffClass(l.difficulty) }, l.difficulty ?? 'chưa đo'),
                    ),
                ),
            );
            count.textContent = `${picked.size} of ${avail.length} selected`;
            addSel.disabled = picked.size === 0;
        };
        const add = (ids: number[]) => {
            close();
            this.mutate((c) => c.levels.push(...ids));
        };
        if (!avail.length) {
            const close2 = modal(`Add levels to ${ed.name}`, h('div', { class: 'hint' }, 'All levels are already in this collection.'));
            void close2;
            return;
        }
        const body = h('div', {},
            h('input', { placeholder: 'Search by level name', style: 'width:100%;margin-bottom:8px', onInput: (e: Event) => { q = (e.target as HTMLInputElement).value.trim().toLowerCase(); draw(); } }),
            list,
        );
        addSel.onclick = () => add(avail.filter((l) => picked.has(l.id)).map((l) => l.id));
        const close = modal(`Add levels to ${ed.name}`, body, [
            count,
            h('button', { onClick: () => add(shown().map((l) => l.id)) }, 'Add all levels'),
            addSel,
        ]);
        draw();
    }

    render(left: HTMLElement, center: HTMLElement, right: HTMLElement) {
        const app = this.app;
        // --- danh sách collection
        left.replaceChildren(h('div', { class: 'ph' }, h('span', { style: 'flex:1' }, 'Collections'),
            h('button', { title: 'New collection', 'aria-label': 'New collection', disabled: !app.store, onClick: () => void this.addCollection() }, '+'),
            app.collapseBtn('left')));
        const lb = h('div', { class: 'pb' });
        left.append(lb);
        if (!app.store) lb.append(h('div', { class: 'hint' }, 'Chọn nơi lưu ở tab Editor trước.'));
        this.cols.forEach((c, i) =>
            lb.append(h('div', { class: 'list-row' + (i === this.sel ? ' cur' : ''), onClick: () => i !== this.sel && void this.pick(i) },
                h('span', { class: 'num' }, 'v' + c.version),
                h('div', { style: 'flex:1' }, h('div', { class: 'name' }, c.name), h('div', { class: 'sub' }, `${c.levels.length} levels`)),
                i === this.sel ? h('button', { title: 'Remove from list', 'aria-label': 'Remove collection', onClick: (e: Event) => { e.stopPropagation(); void this.removeCollection(i); } }, '🗑') : null,
            )),
        );

        // --- thứ tự level
        center.replaceChildren();
        const ed = this.edit;
        const headBar = h('div', { class: 'toolbar' }, h('b', { style: 'font-size:14px' }, ed ? ed.name : 'Chưa có collection'), h('span', { class: 'spacer' }), ed ? h('span', { class: 'pill' }, `${ed.levels.length} levels`) : null);
        const listBox = h('div', { style: 'flex:1;overflow:auto;background:var(--panel)' });
        center.append(headBar, listBox);
        if (ed) {
            let dragFrom = -1;
            ed.levels.forEach((id, i) => {
                const lv = this.level(id);
                const [st, ok] = this.copyStatus(i, id);
                const row = h('div', { class: 'org-row', draggable: true },
                    h('span', { class: 'grip', title: 'Kéo để đổi thứ tự' }, '⋮⋮'),
                    h('span', { class: 'num', style: 'font-family:ui-monospace,monospace;color:var(--faint)' }, String(i + 1).padStart(2, '0')),
                    h('div', { style: 'flex:1' },
                        h('b', {}, lv?.name ?? '(level đã xoá)'), ' ', h('span', { class: 'hint' }, `#${id}`),
                        h('div', { class: 'sub hint' }, lv ? `${lv.buses.length} xe · ${colorCounts(lv).size} màu ` : '', lv ? h('span', { class: 'diff ' + diffClass(lv.difficulty) }, lv.difficulty ?? 'chưa đo') : null, ' ', h('span', { style: ok ? '' : 'color:var(--accent)' }, st)),
                    ),
                    h('button', { 'aria-label': 'Move up', disabled: i === 0, onClick: () => this.mutate((c) => c.levels.splice(i - 1, 0, ...c.levels.splice(i, 1))) }, '↑'),
                    h('button', { 'aria-label': 'Move down', disabled: i === ed.levels.length - 1, onClick: () => this.mutate((c) => c.levels.splice(i + 1, 0, ...c.levels.splice(i, 1))) }, '↓'),
                    h('button', { class: 'danger', 'aria-label': 'Remove from collection', onClick: () => this.mutate((c) => c.levels.splice(i, 1)) }, '×'),
                );
                row.addEventListener('dragstart', () => (dragFrom = i));
                row.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    row.classList.add('drop');
                });
                row.addEventListener('dragleave', () => row.classList.remove('drop'));
                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    row.classList.remove('drop');
                    if (dragFrom < 0 || dragFrom === i) return;
                    const from = dragFrom;
                    this.mutate((c) => {
                        const [m] = c.levels.splice(from, 1);
                        c.levels.splice(from < i ? i - 1 : i, 0, m);
                    });
                });
                listBox.append(row);
            });
            if (!ed.levels.length) listBox.append(h('div', { class: 'hint', style: 'padding:12px' }, 'Collection trống: bấm "+ Add level" ở panel Settings.'));
        }

        // --- settings
        right.replaceChildren(h('div', { class: 'ph' }, h('span', { style: 'flex:1' }, 'Settings'), app.collapseBtn('right')));
        const rb = h('div', { class: 'pb' });
        right.append(rb);
        if (!ed) return;
        rb.append(...kids(
            h('label', { class: 'field', style: 'grid-template-columns:1fr' }, h('span', { class: 'lb' }, 'Name'), h('input', { value: ed.name, onChange: (e: Event) => this.mutate((c) => (c.name = (e.target as HTMLInputElement).value)) })),
            h('label', { class: 'field', style: 'grid-template-columns:1fr' }, h('span', { class: 'lb' }, 'Version'), h('input', { type: 'number', min: 1, value: ed.version, onChange: (e: Event) => this.mutate((c) => (c.version = Math.max(1, Number((e.target as HTMLInputElement).value) || 1))) })),
            h('button', { style: 'width:100%;margin:6px 0', onClick: () => this.openAddDialog() }, '+ Add level'),
            h('button', { class: this.dirty ? 'primary' : '', style: 'width:100%;margin:6px 0', onClick: () => void this.save() }, 'Save collection'),
            h('div', { class: 'hint' }, `Save ghi collections.json và các bản copy đánh số trong collections/${ed.name}/. Chỉ ghi khi bấm Save.`),
            ed.name === 'Main' ? h('div', { class: 'hint' }, 'Game đọc collection "Main" làm thứ tự chơi (khi folder là level-data của project).') : null,
        ));
    }
}
