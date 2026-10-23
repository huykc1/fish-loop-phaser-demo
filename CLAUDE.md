# Fish Loop – ghi chú cho Claude Code

Game xếp cá theo màu (Phaser 4 + TypeScript + Vite), port từ bản PixiJS `../fish-bus`. Người dùng nói tiếng Việt, hãy trả lời bằng tiếng Việt.

## Đọc trước khi sửa
- `docs/gdd/`: GDD (luật chơi = nguồn sự thật cho `src/core/`). Mọi thay đổi luật: sửa `src/core/`, GDD và `tests/`.
- `docs/guide/editor.md`: spec + cách dùng level editor (`editor/`, chạy ở `/editor/`).
- Trước khi viết code Phaser, đọc skill trong `.claude/skills/` (API Phaser 4 khác Phaser 3).

## Kiến trúc
- `src/core/`: logic thuần, mô phỏng 60Hz deterministic, solver. Xe cố định 4 nấc; kích thước xe trong `geometry.ts` khớp ảnh `public/assets/bus_body.png`.
- `src/game/`: hiển thị Phaser. `Board.ts` (ống, cá, hiệu ứng), `BusView.ts` (xe + bể), `Hud.ts`, `Background.ts`, `textures.ts` (texture vẽ bằng canvas), `ui.ts` (nút, popup).
- `src/scenes/`: `Boot` (nạp asset) → `Game`.
- `level-data/`: dữ liệu level do editor quản lý: `levels/<id>.json`, `collections.json`, `collections/Main/NNN_<id>.json` (game đọc Main làm thứ tự chơi).
- `editor/`: Level Editor (TS + DOM + SVG), build riêng `npm run build:editor` → `dist-editor/`, chỉ đăng ở bản latest.
- Asset: `art/tools/cut_assets.py` cắt từ `art/reference/*.webp` vào `public/assets/` (cần pillow, numpy, scipy, opencv-python-headless).

## Lệnh
- `npm run dev` (port 8080), `npm test`, `npm run solve`, `npm run build`, `npm run build:site`
- Tạo asset bằng ChatGPT: quy trình ở `docs/guide/assets.md`; link cuộc trò chuyện nằm trong `.claude/chatgpt-task.local.md` (chỉ trên máy, không commit, không ghi vào docs).
- Khi dev: `window.__fishloop` có `sim`, `start(i)`, `speed(v)`, `autoplay()`; POST `/__snap?name=x` lưu ảnh canvas vào `.snaps/`.
