"""Cắt asset từ ảnh mẫu art/reference/gameplay-1080x1920.webp vào public/assets/.

Chạy:  python3 art/tools/cut_assets.py   (cần pillow, numpy, scipy, opencv-python-headless)
Toạ độ trong file này là toạ độ pixel của ảnh mẫu 1080x1920 (trùng toạ độ thiết kế của game).
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / 'art/reference/gameplay-1080x1920.webp'
OUT = ROOT / 'public/assets'
DEBUG = '--debug' in sys.argv

src = np.array(Image.open(REF).convert('RGB'))
H, W = src.shape[:2]


def save(name, rgba):
    Image.fromarray(rgba).save(OUT / f'{name}.png', optimize=True)
    print(f'{name}.png', rgba.shape[1], 'x', rgba.shape[0])


def grabcut(box, fg=(), bg=(), iters=6, pad=12):
    """Tách vật trong box (x0,y0,x1,y1) bằng GrabCut. fg/bg: các box gợi ý chắc chắn là vật / là nền."""
    x0, y0, x1, y1 = box
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    img = np.ascontiguousarray(src[Y0:Y1, X0:X1, ::-1])
    mask = np.full(img.shape[:2], cv2.GC_BGD, np.uint8)
    mask[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = cv2.GC_PR_FGD
    for (a, b, c, d) in fg:
        mask[b - Y0:d - Y0, a - X0:c - X0] = cv2.GC_FGD
    for (a, b, c, d) in bg:
        mask[b - Y0:d - Y0, a - X0:c - X0] = cv2.GC_BGD
    bgm, fgm = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bgm, fgm, iters, cv2.GC_INIT_WITH_MASK)
    m = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    return clean(m), (X0, Y0)


def clean(m):
    lab, n = nd.label(m)
    if n == 0:
        return m
    sizes = nd.sum(m, lab, range(1, n + 1))
    m = lab == (np.argmax(sizes) + 1)
    m = nd.binary_fill_holes(m)
    m = nd.binary_opening(m, iterations=1)
    return m


def to_rgba(m, origin, feather=1.2):
    X0, Y0 = origin
    h, w = m.shape
    a = nd.gaussian_filter(m.astype(np.float32), feather)
    a = np.clip((a - 0.15) / 0.7, 0, 1)
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = src[Y0:Y0 + h, X0:X0 + w]
    rgba[..., 3] = (a * 255).astype(np.uint8)
    ys, xs = np.where(rgba[..., 3] > 8)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()


def rounded_mask(w, h, r):
    yy, xx = np.mgrid[0:h, 0:w]
    cx = np.clip(xx, r, w - 1 - r)
    cy = np.clip(yy, r, h - 1 - r)
    return (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r


def inpaint(rgba, mask, radius=6):
    bgr = np.ascontiguousarray(rgba[..., 2::-1])
    out = cv2.inpaint(bgr, mask.astype(np.uint8) * 255, radius, cv2.INPAINT_TELEA)
    rgba = rgba.copy()
    rgba[..., :3] = out[..., ::-1]
    return rgba


def text_mask(rgba, region, thr=205):
    """Mặt nạ chữ trắng trong vùng region (x0,y0,x1,y1) toạ độ cục bộ."""
    x0, y0, x1, y1 = region
    rgb = rgba[..., :3].astype(int)
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    m = np.zeros(lum.shape, bool)
    sub = (lum > thr) & (sat < 90)
    m[y0:y1, x0:x1] = sub[y0:y1, x0:x1]
    return nd.binary_dilation(m, iterations=4)


# ---------------- HUD ----------------
def hud():
    m, o = grabcut((157, 104, 369, 193))
    pill = to_rgba(m, o)
    h, w = pill.shape[:2]
    pill = inpaint(pill, text_mask(pill, (20, 12, w - 20, h - 18)), 8)
    save('hud_pill', pill)

    m, o = grabcut((431, 102, 650, 193))
    cnt = to_rgba(m, o)
    h, w = cnt.shape[:2]
    cnt = inpaint(cnt, text_mask(cnt, (88, 12, w - 18, h - 18)), 8)
    save('hud_counter', cnt)

    m, o = grabcut((853, 98, 957, 202))
    save('btn_gear', to_rgba(m, o))


# ---------------- Buttons ----------------
def buttons():
    m, o = grabcut((276, 1621, 404, 1753))
    undo_off = to_rgba(m, o)
    save('btn_undo_off', undo_off)

    # nút tím: nền trống đối xứng (nửa trái lật sang phải, nên không còn huy hiệu) + icon trắng dán lại
    w, h = 130, 132

    def icon_mask(rgb, margin=18, lum=185, sat=90):
        rgb = rgb.astype(int)
        m = (rgb.mean(axis=2) > lum) & ((rgb.max(axis=2) - rgb.min(axis=2)) < sat)
        m[:margin] = m[-margin:] = False
        m[:, :margin] = m[:, -margin:] = False
        lab, n = nd.label(m)
        if n:
            sizes = nd.sum(m, lab, range(1, n + 1))
            m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 25])
        return m

    def paste_icon(base, icon_rgb, m, oy=0, ox=0):
        out = base.copy()
        soft = nd.gaussian_filter(m.astype(np.float32), 0.7)[..., None]
        ih, iw = m.shape
        reg = out[oy:oy + ih, ox:ox + iw, :3].astype(np.float32)
        out[oy:oy + ih, ox:ox + iw, :3] = (reg * (1 - soft) + icon_rgb.astype(np.float32) * soft).astype(np.uint8)
        return out

    blank = None
    for name, (x0, y0) in {'btn_shuffle': (476, 1622), 'btn_bus': (676, 1622)}.items():
        crop = np.zeros((h, w, 4), np.uint8)
        crop[..., :3] = src[y0:y0 + h, x0:x0 + w]
        mk = rounded_mask(w, h, 30)
        a = nd.gaussian_filter(mk.astype(np.float32), 1.0)
        crop[..., 3] = (np.clip((a - 0.15) / 0.7, 0, 1) * 255).astype(np.uint8)
        im = icon_mask(crop[..., :3])
        im[86:, 84:] = False  # huy hiệu
        b = inpaint(crop, nd.binary_dilation(im, iterations=5), 10)
        b[:, w // 2:] = b[:, :w - w // 2][:, ::-1]
        if blank is None:
            blank = b.copy()
            save('btn_blank', blank)
        save(name, paste_icon(b, crop[..., :3], im))

    # nút undo tím = nền trống + icon undo lấy từ nút xám
    g = undo_off
    gh, gw = g.shape[:2]
    gm = icon_mask(g[..., :3], 14, 170, 45)
    gm[:34] = False  # vệt bóng phía trên nút xám
    white = np.full((gh, gw, 3), 255, np.uint8)
    save('btn_undo', paste_icon(blank, white, gm, (h - gh) // 2, (w - gw) // 2))


# ---------------- Bus ----------------
def bus():
    x0, y0, x1, y1 = 342, 400, 752, 600
    crop = src[y0:y1, x0:x1].astype(int)
    R, G, B = crop[..., 0], crop[..., 1], crop[..., 2]
    road = (R < 48) & (G > 40) & (B > 95) & (G < 110)
    m = ~road
    m[:, :6] = False
    m = clean(m)
    m = nd.binary_opening(m, iterations=2)
    rgba = to_rgba(m, (x0, y0), 1.0)
    # vùng khay chứa bể (toạ độ trong rgba sau khi cắt sát)
    ys, xs = np.where(nd.binary_opening(m, iterations=2))
    ox, oy = xs.min(), ys.min()
    tray = (60 - ox, 26 - oy, 378 - ox, 140 - oy)
    tx0, ty0, tx1, ty1 = tray
    tw, th = tx1 - tx0, ty1 - ty0
    rm = rounded_mask(tw, th, 22)
    yy = np.linspace(0, 1, th)[:, None]
    top = np.array([58, 44, 150])
    bot = np.array([86, 70, 196])
    fill = (top * (1 - yy[..., None]) + bot * yy[..., None]).repeat(tw, axis=1)
    # bóng đổ trong khay
    edge = nd.distance_transform_edt(rm)
    shade = np.clip(edge / 14, 0, 1)[..., None]
    fill = fill * (0.55 + 0.45 * shade)
    region = rgba[ty0:ty1, tx0:tx1]
    region[..., :3] = np.where(rm[..., None], fill.astype(np.uint8), region[..., :3])
    rgba[ty0:ty1, tx0:tx1] = region
    # kéo dài thân xe: thêm 1 bể (pitch ~104px) bằng cách nhân dải giữa
    mid = (tx0 + tx1) // 2
    strip = rgba[:, mid - 4:mid + 4]
    extra = 104
    reps = np.concatenate([strip] * (extra // strip.shape[1] + 1), axis=1)[:, :extra]
    out = np.concatenate([rgba[:, :mid], reps, rgba[:, mid:]], axis=1)
    save('bus_body', out)
    print('  tray x', tx0, '..', tx1 + extra, 'y', ty0, '..', ty1)


# ---------------- Xe dọc ----------------
def bus_vertical():
    """Xe dọc từ art/reference/bus-vertical.webp: 'front' = đầu xe quay xuống, 'rear' = đuôi xe quay xuống.
    Làm rỗng khay, chèn thêm 1 bể (3 → 4), thu nhỏ cho khoảng cách bể = 106 px như xe ngang."""
    global src, H, W
    keep = (src, H, W)
    src = np.array(Image.open(ROOT / 'art/reference/bus-vertical.webp').convert('RGB'))
    H, W = src.shape[:2]
    meta = {}
    specs = {
        # box xe, khay (x0,y0,x1,y1), hàng nhân bản, khoảng cách bể
        'bus_v_front': ((112, 430, 502, 1352), (203, 476, 422, 1152), 800, 220),
        'bus_v_rear': ((582, 404, 964, 1342), (660, 522, 890, 1200), 870, 228),
    }
    for name, (box, tray, mid, pitch) in specs.items():
        # tách nền theo màu: mặt đường xanh dương (R thấp, B cao); bánh xe và cản trước tối hơn nên được giữ
        X0, Y0, X1, Y1 = box
        o = (X0, Y0)
        c = src[Y0:Y1, X0:X1].astype(int)
        road = ((c[..., 0] < 62) & (c[..., 2] >= 97) & (c[..., 1] < 105)) | ((c[..., 0] < c[..., 1]) & (c[..., 2] > 150))
        m = clean(~road)
        m = nd.binary_opening(m, iterations=2)
        h, w = m.shape
        rgba = np.zeros((h, w, 4), np.uint8)
        rgba[..., :3] = src[Y0:Y0 + h, X0:X0 + w]
        a = nd.gaussian_filter(m.astype(np.float32), 1.0)
        rgba[..., 3] = (np.clip((a - 0.15) / 0.7, 0, 1) * 255).astype(np.uint8)
        tx0, ty0, tx1, ty1 = tray[0] - X0, tray[1] - Y0, tray[2] - X0, tray[3] - Y0
        tw, th = tx1 - tx0, ty1 - ty0
        rm = rounded_mask(tw, th, 26)
        xx = np.linspace(0, 1, tw)[None, :]
        left = np.array([58, 44, 150]); right = np.array([86, 70, 196])
        fill = (left * (1 - xx[..., None]) + right * xx[..., None]).repeat(th, axis=0)
        edge = nd.distance_transform_edt(rm)
        fill = fill * (0.55 + 0.45 * np.clip(edge / 16, 0, 1)[..., None])
        reg = rgba[ty0:ty1, tx0:tx1]
        reg[..., :3] = np.where(rm[..., None], fill.astype(np.uint8), reg[..., :3])
        reg[..., 3] = np.where(rm, 255, reg[..., 3])
        my = mid - Y0
        strip = rgba[my - 4:my + 4]
        reps = np.concatenate([strip] * (pitch // strip.shape[0] + 1), axis=0)[:pitch]
        out = np.concatenate([rgba[:my], reps, rgba[my:]], axis=0)
        ty1 += pitch
        k = TANK_PITCH_PX / pitch
        img = Image.fromarray(out)
        img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
        arr = np.array(img)
        ys, xs = np.where(arr[..., 3] > 8)
        arr = arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        cx = (tx0 + tx1) / 2 * k - xs.min()
        cy = (ty0 + ty1) / 2 * k - ys.min()
        save(name, arr)
        meta[name] = {'trayCx': round(cx, 1), 'trayCy': round(cy, 1), 'w': arr.shape[1], 'h': arr.shape[0]}
    (OUT / 'bus_v.json').write_text(__import__('json').dumps(meta, indent=2) + '\n')
    print('bus_v.json', meta)
    src, H, W = keep


TANK_PITCH_PX = 106


# ---------------- Cá (ChatGPT) ----------------
FISH_ORDER = ['red', 'yellow', 'green', 'blue', 'purple', 'orange', 'pink', 'cyan']


FISH_ORDER_2 = ['brown', 'white', 'black', 'gray', 'sky', 'lime', 'navy']


def fish_set(file='fish-clown-set.png', order=FISH_ORDER, bg='grey'):
    """Cá hề cùng dáng từ art/generated/<file> (lưới 4 x 2) → public/assets/fish/fish_<màu>.webp.
    bg='grey' (bộ 8 màu đầu) hoặc 'magenta' (bộ 7 màu thêm, vì có cá trắng / xám / đen)."""
    path = ROOT / 'art/generated' / file
    if not path.exists():
        return
    img = np.array(Image.open(path).convert('RGB')).astype(int)
    h, w = img.shape[:2]
    cw, ch = w // 4, h // 2
    (OUT / 'fish').mkdir(exist_ok=True)
    for k, name in enumerate(order):
        cx, cy = (k % 4) * cw, (k // 4) * ch
        cell = img[cy:cy + ch, cx:cx + cw]
        if bg == 'magenta':
            R, G, B = cell[..., 0], cell[..., 1], cell[..., 2]
            grey = (R > 170) & (B > 170) & (G < 110) & (np.abs(R - B) < 70)
        else:
            sat = cell.max(axis=2) - cell.min(axis=2)
            lum = cell.mean(axis=2)
            grey = (sat < 22) & (lum > 70) & (lum < 185)
        # nền = vùng xám nối với mép ô (giữ sọc trắng và viền tối của cá)
        lab, _ = nd.label(grey)
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        bgm = np.isin(lab, list(edge))
        m = clean(~bgm)
        a = nd.gaussian_filter(m.astype(np.float32), 0.9)
        rgba = np.zeros((ch, cw, 4), np.uint8)
        if bg == 'magenta':
            # khử viền hồng ở mép cá
            near = nd.binary_dilation(~m, iterations=3) & m
            cell = cell.copy()
            cell[..., 0] = np.where(near, np.minimum(cell[..., 0], cell[..., 1] + 40), cell[..., 0])
            cell[..., 2] = np.where(near, np.minimum(cell[..., 2], cell[..., 1] + 40), cell[..., 2])
        rgba[..., :3] = cell
        rgba[..., 3] = (np.clip((a - 0.2) / 0.6, 0, 1) * 255).astype(np.uint8)
        ys, xs = np.where(rgba[..., 3] > 8)
        rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        im = Image.fromarray(rgba)
        im = im.resize((256, round(256 * im.height / im.width)), Image.LANCZOS)
        im.save(OUT / 'fish' / f'fish_{name}.webp', quality=92)
        print(f'fish_{name}.webp', im.width, 'x', im.height)


# ---------------- Bàn tay hướng dẫn (ChatGPT) ----------------
def hand():
    """2 trạng thái bàn tay từ art/generated/hand-pointer.png (trái = giơ lên, phải = ấn xuống, nền #00FF00).
    Cắt cùng 1 khung cho cả 2 để đổi trạng thái không bị nhảy; gốc toạ độ = đầu ngón trỏ lúc giơ lên."""
    path = ROOT / 'art/generated/hand-pointer.png'
    if not path.exists():
        return
    img = np.array(Image.open(path).convert('RGB')).astype(int)
    h, w = img.shape[:2]
    halves, masks = [], []
    for x0 in (0, w // 2):
        c = img[:, x0:x0 + w // 2].copy()
        R, G, B = c[..., 0], c[..., 1], c[..., 2]
        green = (G > R + 45) & (G > B + 45)
        m = clean(~green)
        # khử viền xanh lá ở mép
        near = nd.binary_dilation(~m, iterations=3) & m
        c[..., 1] = np.where(near, np.minimum(G, np.maximum(R, B)), G)
        halves.append(c)
        masks.append(m)
    ys, xs = np.where(masks[0] | masks[1])
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    target_w = 190
    k = target_w / (x1 - x0)
    meta = {}
    for name, c, m in zip(('hand_up', 'hand_down'), halves, masks):
        a = nd.gaussian_filter(m.astype(np.float32), 1.0)
        rgba = np.zeros((*m.shape, 4), np.uint8)
        rgba[..., :3] = np.clip(c, 0, 255)
        rgba[..., 3] = (np.clip((a - 0.2) / 0.6, 0, 1) * 255).astype(np.uint8)
        im = Image.fromarray(rgba[y0:y1, x0:x1])
        im = im.resize((target_w, round(im.height * k)), Image.LANCZOS)
        im.save(OUT / f'{name}.png', optimize=True)
        print(f'{name}.png', im.width, 'x', im.height)
    # đầu ngón trỏ của từng trạng thái (điểm cao nhất của bàn tay) → gốc toạ độ khi vẽ
    for name, m in zip(('up', 'down'), masks):
        ty, tx = np.where(m[y0:y1, x0:x1])
        top = ty.min()
        meta[name] = {'originX': round(float(tx[ty <= top + 6].mean()) / (x1 - x0), 3), 'originY': round((top + 4) / (y1 - y0), 3)}
    (OUT / 'hand.json').write_text(__import__('json').dumps(meta) + '\n')
    print('hand.json', meta)


# ---------------- Đạo cụ ----------------
def props():
    m, o = grabcut((6, 786, 112, 966))
    save('bus_stop', to_rgba(m, o))
    m, o = grabcut((8, 0, 192, 330), fg=[(40, 20, 90, 120)])
    save('inlet_pipe', to_rgba(m, o))
    m, o = grabcut((868, 1508, 1032, 1790), fg=[(900, 1600, 1000, 1700)])
    save('outlet_pipe', to_rgba(m, o))


# ---------------- Nền ----------------
def background():
    """Giữ viền san hô của ảnh mẫu, khoét vùng giữa (ống + bãi xe + HUD + nút) thành trong suốt."""
    a = np.ones((H, W), np.float32)
    hole = np.zeros((H, W), bool)
    hole[95:1790, 112:985] = True        # bàn chơi + nút
    hole[0:360, 0:200] = True            # ống vào
    hole[1440:1800, 860:1040] = True     # ống ra
    hole[95:205, 140:970] = True         # HUD
    d = nd.distance_transform_edt(~hole)
    a = np.clip(d / 40, 0, 1)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = src
    rgba[..., 3] = (a * 255).astype(np.uint8)
    Image.fromarray(rgba).save(OUT / 'bg_frame.webp', quality=88)
    print('bg_frame.webp', W, 'x', H)


OUT.mkdir(parents=True, exist_ok=True)
hud()
buttons()
bus()
bus_vertical()
fish_set()
fish_set('fish-clown-set-2.png', FISH_ORDER_2, 'magenta')
hand()
props()
background()
