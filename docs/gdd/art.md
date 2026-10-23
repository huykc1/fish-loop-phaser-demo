# 5. Art direction

<Badge type="tip" text="Live" /> Asset hiện tại cắt từ ảnh mẫu `art/reference/gameplay-1080x1920.webp` bằng `art/tools/cut_assets.py`: khung HUD, nút booster, nút cài đặt, thân xe ngang (kéo dài thành 4 bể), 2 xe dọc từ `art/reference/bus-vertical.webp` (`rot` 90 = đuôi xe quay xuống, 270 = đầu xe quay xuống; cũng kéo dài thành 4 bể), biển trạm xe, ống vào/ra, viền san hô của nền. 8 con cá hề cùng dáng, đổi màu, tạo bằng ChatGPT (`art/generated/fish-clown-set.png`, xem Nhật ký asset). Bể kính, nước, ống nước, bọt, pháo giấy vẽ bằng code (`src/game/textures.ts`).

Prompt tạo asset gốc (lấy từ `ART_PROMPTS.md` của bản Fish Bus) giữ lại bên dưới để tạo asset mới cùng phong cách.

**Phong cách chung:** casual mobile puzzle game art, glossy 3D cartoon render, soft studio lighting, bright saturated colors, clean edges.

Asset tạo bằng ChatGPT, **đính kèm ảnh mẫu của game** để giữ cùng phong cách, nền xanh lá thuần (#00FF00) để tách nền.

## 5.1 Cá (mỗi màu 1 ảnh): `fish_red.png`, `fish_yellow.png`, `fish_green.png`, `fish_blue.png`, `fish_purple.png`

```
A single cute cartoon clownfish for a casual mobile puzzle game, side view facing RIGHT,
glossy 3D cartoon render, chunky rounded body, two white stripes with thin black outlines,
big friendly eye, small fins with dark edges. Body color: RED-ORANGE.
Centered, whole fish visible, nothing else in the image, plain flat pure green (#00FF00) background,
no shadow, no text. Square image 1024x1024.
```

Đổi `RED-ORANGE` thành `YELLOW`, `GREEN`, `BLUE`, `PURPLE` cho các file còn lại.

## 5.2 Xe buýt: `bus_4.png` (và `bus_3.png` nếu muốn)

```
A purple cartoon bus seen from a high top-down 3/4 view (camera looking down at ~70 degrees),
for a casual mobile puzzle game, glossy 3D render. The bus is long and horizontal, front on the LEFT,
rear on the RIGHT. Its roof is a flat recessed tray that holds 4 EMPTY square glass slots in a row
(the slots must be empty dark blue holes, no fish, no water). Small yellow headlights on the left,
red tail lights on the right, small orange side lights, black wheels peeking out at the bottom.
Plain flat pure green (#00FF00) background, no ground, no shadow, no text. Image 1536x640.
```

## 5.3 Nền đáy biển: `background.png`

```
Top-down view of a bright tropical seabed for a casual mobile puzzle game background,
glossy cartoon style, light turquoise water, sandy patches, colorful corals (pink, orange, purple,
teal), starfish, shells and small rocks placed ONLY along the left, right, top and bottom borders.
The large CENTER area must be empty open water (it will be covered by the gameplay board).
No fish, no text, no UI. Portrait 1080x1920.
```

## 5.4 Nút UI (tuỳ chọn): `btn_undo.png`, `btn_shuffle.png`, `btn_bus.png`, `btn_settings.png`

```
A single glossy rounded-square game button icon for a casual mobile puzzle game,
purple with gold rim, white icon of [UNDO ARROW / SHUFFLE ARROWS / BUS / GEAR] in the center,
3D cartoon style, soft highlight on top. Plain flat pure green (#00FF00) background, no text.
Square 512x512.
```

Nếu ảnh ra khác góc nhìn, nhắc thêm: "same camera angle and style as the attached reference".

## 5.5 Nhật ký asset

Asset mới tạo bằng ChatGPT theo [quy trình này](../guide/assets).

| Ngày | Asset | Phiếu yêu cầu | Ảnh mẫu | Ghi chú |
|---|---|---|---|---|
| 2026-10-23 | 8 cá hề cùng dáng (thay 8 loài cá cũ) | `art/requests/fish-clown-set.md` | gameplay-1080x1920, fish-sheet | Nền xám vì có cá xanh lá |
| 2026-10-23 | Bàn tay hướng dẫn 2 trạng thái (giơ lên / ấn xuống) | `art/requests/hand-pointer.md` | gameplay-1080x1920 | Lần 2: mu bàn tay hướng ra (lần 1 lộ lòng bàn tay) |
| 2026-10-23 | 7 cá hề màu mới (brown, white, black, gray, sky, lime, navy) | `art/requests/fish-clown-set-2.md` | fish-clown-set.png | Nền hồng cánh sen vì có cá trắng / xám / đen |
