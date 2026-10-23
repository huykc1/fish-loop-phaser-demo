# Level editor (spec)

<Badge type="tip" text="Live" /> Đã build theo spec này. Mở: `npm run dev` rồi vào `http://localhost:8080/editor/`; bản đăng ở `<pagesUrl>/editor/`.

## Cách dùng nhanh

- **Nơi lưu:** mở lần đầu, editor tự dùng **Browser storage** và nạp sẵn toàn bộ level của game (chỉ nằm trong trình duyệt đó). Muốn sửa level của game thì bấm **Choose folder** và trỏ vào thư mục `level-data/` của project (Chrome / Edge); folder trống sẽ được nạp sẵn level của game.
- Nút **★** ở panel Levels: thêm các level của game còn thiếu (không ghi đè level đang có).
- **Phím tắt:** V chọn · P sửa ống · 1–8 cọ màu · 0 tẩy · R xoay · D nhân bản · Del xoá · Ctrl+Z / Ctrl+Y · Ctrl+S lưu · Space chơi thử · Esc bỏ chọn / thoát chơi thử.
- **Ống (P):** kéo điểm, bấm ⊕ để thêm điểm, bấm đúp điểm để xoá. Điểm vàng là điểm bắt đầu.
- **Cổng:** chấm xanh = tự động, vàng = đặt tay; kéo chấm dọc ống để đặt tay.
- Sau khi sửa level, vào **Organiser** bấm **Save collection** để cập nhật bản copy trong `collections/Main/` (game đọc từ đó).

Editor là một trang riêng trong cùng project Vite + TypeScript, chạy ở `<pagesUrl>/editor/` (cạnh `/demo/` và `/docs/`). Editor **không** nằm trong bản snapshot của từng version (`build_demo` / `release_demo`).

## 1. Dữ liệu level

Theo [GDD: Level format](../gdd/level-format).

- **Ống:** đa giác bo góc (`cornerRadius`), cá chạy theo thứ tự điểm. Khép kín, hoặc **hở có 2 cổng** (`open`, có nút bật/tắt; cá qua cổng tức thì). `inlet` / `outlet` chỉ để trang trí (ống khép kín). 6 mẫu ống: Chữ nhật, Chữ nhật nhỏ, Chữ L, Chữ U, Chữ T ngược, Lục giác; thêm mẫu "Chữ U hở 2 cổng".
- **Thông số:** `pipeSpeed` (px/s), `slotLength` (quyết định sức chứa ống), `fishPerUnit`, **N** `pipeLimit` (số nấc tối đa trên ống cùng lúc, mặc định 5), **cỡ xe** `busScale` (theo từng level, mặc định 1).
- **Xe:** x, y, xoay 0/90/180/270, **sức chứa cố định 4 nấc** (không chỉnh trong editor), các nấc màu (đầu → đuôi xe), cổng tự động hoặc đặt tay.
- **Vị trí xe dự phòng** (`spareSlots`) cho booster Thêm xe: mỗi level ít nhất 1. Nút **+ Dự phòng** tự tìm chỗ trống (hết chỗ thì báo: dời xe, giảm cỡ xe hoặc Tự xếp xe); vẫn kéo tay được. Level mới tạo có sẵn 1 vị trí.
- **Booster:** số lượt Undo / Shuffle / Thêm xe. Cùng với `goal`, `seed`.
- **Bảng màu:** 8 màu: red, yellow, green, blue, purple, orange, pink, cyan.
- Khung thiết kế 1080 × 1920.
- Không có chướng ngại hay xe đặc biệt. Không có dữ liệu ngoài level (tiền tệ, tiến trình) mà editor phải tránh.

### Cảnh báo

| Mức | Điều kiện |
|---|---|
| Lỗi | Ống không hợp lệ |
| Lỗi | Ống chứa ít hơn 2 nấc |
| Lỗi | Chưa có xe nào |
| Lỗi | Số nấc của một màu không vừa khít bất kỳ nhóm xe nào |
| Lỗi | Tổng nấc lớn hơn tổng chỗ trên xe |
| Lỗi | `pipeSpeed` quá lớn so với `slotLength` |
| Lỗi | `pipeLimit` (N) lớn hơn sức chứa ống |
| Lỗi | Xe có số nấc vượt sức chứa |
| Cảnh báo | Xe đã hoàn thành ngay từ đầu |
| Cảnh báo | Hai xe chồng lên nhau |
| Lỗi | Xe / vị trí dự phòng đè lên ống nước |
| Lỗi | Chưa có vị trí xe dự phòng (booster Thêm xe cần ít nhất 1) |
| Cảnh báo | Vị trí dự phòng chồng lên xe |
| Lỗi | Vị trí dự phòng không nối thẳng vào ống (đuôi xe không hướng ra ống hoặc bị xe khác chắn) |
| Cảnh báo | Số booster Thêm xe lớn hơn số vị trí xe dự phòng |
| Thông tin | Chưa có `goal` |

## 2. Sinh level

Giữ nguyên ống và vị trí xe, chỉ rải lại màu.

- **Designer nhập:** số màu (1–8), số xe để trống, độ khó mục tiêu (Dễ / Vừa / Khó).
- **Editor tự làm:**
  - Mỗi màu **cố định 4 nấc**, xáo ngẫu nhiên rồi rải vào xe.
  - Tránh xe đã hoàn thành sẵn.
  - Chạy solver tối đa 40 lần cho đến khi được màn giải được đúng độ khó.
- **Tự xếp xe:** xếp các xe thành một cột ở giữa vùng bên trong ống.

## 3. Lưu dữ liệu

- Folder trên máy (File System Access API, chỉ Chrome / Edge), hoặc Browser storage.
- Giữ **3 bản cũ** gần nhất của mỗi level.

```
<folder>/
  levels/<id>.json
  levels/.versions/<id>/
  drafts/current.json
  collections.json
  collections/<Tên>/NNN_<id>.json
```

- **Id là số.** Editor tự cấp số tiếp theo khi tạo level mới.
- **Import** không ghi đè: id trùng thì đổi sang số trống tiếp theo.
- **Xoá** có hỏi xác nhận; lịch sử bản cũ vẫn giữ.
- **Đổi id** thì chuyển theo cả file, lịch sử và các collection.

## 4. Quản lý level

- **Thanh thông tin:** Name, Id, Status (WIP / PROD / ARCHIVE), Difficulty (Dễ / Vừa / Khó / Rất khó, tự điền từ solver và sửa tay được), Category (chữ tự do).
- **Organiser:** xếp level thành collection có thứ tự chơi. Ban đầu có sẵn collection **Main** chứa 5 level gốc theo thứ tự cũ.
- **Add level** mở hộp thoại riêng:
  - Chỉ liệt kê các level chưa có trong collection, mỗi dòng có ô tick.
  - Có ô tìm theo tên.
  - Hai nút **Add all levels** và **Add selected levels** (mờ khi chưa tick gì), kèm dòng "N of M selected".
  - Level mới được thêm vào cuối collection.
  - Nếu mọi level đã có trong collection thì hiện "All levels are already in this collection."
  - Nút X đóng hộp thoại mà không thêm gì.

## 5. Kiểm tra level (mức C)

- Cảnh báo dữ liệu (mục 1).
- Nút **▶ Play** để chơi thử.
- **Mô phỏng:**
  - Solver tìm lời giải **nhanh nhất về thời gian chơi** (số lần tap, thời gian) và tự điền `goal`.
  - Cho nhiều người chơi ngẫu nhiên chơi thử, đo tỉ lệ thắng → độ khó: ≥ 40% Dễ, ≥ 15% Vừa, ≥ 5% Khó, < 5% Rất khó.
  - _TBD_: với giới hạn N = 5, người chơi ngẫu nhiên gần như luôn thua (0–5%) kể cả ở màn solver giải rất nhanh, nên thang độ khó này cần làm lại (ví dụ đo theo số trạng thái solver phải thử, hoặc người chơi "biết chờ").

## 6. Chơi thử

- Nút **▶ Play** (phím Space) mở game Phaser phủ lên editor với level đang mở, kể cả các thay đổi chưa lưu.
- Game đọc **thẳng file level JSON** của editor, không cần chuyển đổi.
- **‹** / Esc để quay lại editor, **↻** để chơi lại.
- Nút **Xem lời giải**: bàn tay hướng dẫn tự chơi màn đang mở theo lời giải của solver.

## 7. Giao diện

- Logo Athena (cam ở theme tối, đen ở theme sáng).
- Theme tối / sáng có nút chuyển, lựa chọn được nhớ.
- Bố cục theo mẫu Fish Ball: danh sách level bên trái, vùng làm việc ở giữa, Inspector bên phải. Các panel thu gọn được và kéo đổi kích thước được, trạng thái được nhớ.
