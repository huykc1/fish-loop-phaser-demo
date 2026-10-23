/** Trợ giúp DOM nhỏ gọn cho editor. */
type Attrs = Record<string, unknown> & { class?: string; style?: string };
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
        else if (k === 'value') (e as HTMLInputElement).value = String(v);
        else if (k === 'checked') (e as HTMLInputElement).checked = !!v;
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, String(v));
    }
    for (const c of children.flat()) {
        if (c === null || c === undefined || c === false) continue;
        e.append(c instanceof Node ? c : String(c));
    }
    return e;
}

/** gom con (bỏ null/false, làm phẳng mảng) để dùng với append / replaceChildren */
export const kids = (...c: (Child | Child[])[]): (Node | string)[] =>
    c.flat().filter((x): x is Node | string | number => x !== null && x !== undefined && x !== false).map((x) => (x instanceof Node ? x : String(x)));

/** hộp thoại giữa màn hình; trả về hàm đóng */
export function modal(title: string, body: Node, footer: Node[] = [], onClose?: () => void) {
    const close = () => {
        back.remove();
        document.removeEventListener('keydown', esc, true);
        onClose?.();
    };
    const esc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        }
    };
    const back = h(
        'div',
        { class: 'modal-back', onPointerdown: (e: Event) => e.target === back && close() },
        h(
            'div',
            { class: 'modal', role: 'dialog', 'aria-label': title },
            h('div', { class: 'mh' }, h('span', { style: 'flex:1' }, title), h('button', { class: 'ghost', 'aria-label': 'Close', onClick: close }, '×')),
            h('div', { class: 'mb' }, body),
            footer.length ? h('div', { class: 'mf' }, footer) : null,
        ),
    );
    document.addEventListener('keydown', esc, true);
    document.body.append(back);
    return close;
}

/** hỏi xác nhận bằng hộp thoại riêng (không dùng window.confirm) */
export function confirmBox(title: string, text: string, okLabel = 'Delete'): Promise<boolean> {
    return new Promise((res) => {
        let done = false;
        const close = modal(title, h('div', {}, text), [
            h('span', { style: 'flex:1' }),
            h('button', { onClick: () => { done = true; res(false); close(); } }, 'Cancel'),
            h('button', { class: 'primary', onClick: () => { done = true; res(true); close(); } }, okLabel),
        ], () => !done && res(false));
    });
}

export const fmtTime = (t: number) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
