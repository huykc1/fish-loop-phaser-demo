# 4. Level format

<Badge type="tip" text="Live" /> Lấy từ đặc tả bản gốc Fish Bus (`GAME_SPEC.md` v1 §4–5); đã có trong code Phaser (`src/core/`).

## 4.1 Format level (JSON)

```jsonc
{
  "id": 1,
  "name": "Làm quen",
  "pipe": {
    "points": [[140,300],[940,300],[940,1500],[140,1500]], // đa giác khép kín, toạ độ thiết kế 1080x1920
    "cornerRadius": 120,
    "open": false,             // true = ống hở, 2 đầu là cổng (cá qua cổng tức thì)
    "inlet":  { "s": 0.02 },   // trang trí: vị trí ống vào (tỉ lệ 0..1 chiều dài)
    "outlet": { "s": 0.55 }
  },
  "pipeSpeed": 180,          // px/s
  "slotLength": 90,          // px mỗi nấc trong ống -> quyết định sức chứa
  "fishPerUnit": 5,          // số cá hiển thị mỗi nấc
  "pipeLimit": 5,            // N: số nấc tối đa trên ống cùng lúc (bộ đếm x/N)
  "busScale": 1,             // cỡ xe trong level (mặc định 1); nhỏ hơn để xếp nhiều xe
  "buses": [
    { "x": 540, "y": 600, "rot": 0, "capacity": 4,
      "stack": ["red","red","blue","yellow"],   // đầu xe -> đuôi xe
      "portS": null }                           // null = tự tính
  ],
  "spareSlots": [ { "x": 540, "y": 1350, "rot": 0 } ],
  "boosters": { "undo": 3, "shuffle": 3, "addBus": 1 },
  "goal": 3,
  "seed": 12345
}
```

Màn đông xe nên rải màu theo **cặp 2 nấc cùng màu** (rải ngẫu nhiên từng nấc với N = 5 gần như không giải được); cách này dùng cho level 7–10.

`rot`: góc xoay xe (độ). `rot = 0` → đầu xe bên trái, đuôi xe bên phải. `rot = 90` → đầu xe trên, đuôi dưới. `rot = 270` → đầu xe dưới, đuôi trên. `rot = 180` → ảnh xe lật ngang (đầu phải, đuôi trái), không lộn ngược.

Ống hở (`open: true`): các điểm đi từ cổng đầu tới cổng cuối, không nối điểm cuối về điểm đầu; 2 đầu không bo góc. Không vẽ ống cấp/thoát nước (`inlet`/`outlet`) cho ống hở.

## 4.2 Ràng buộc thiết kế level (editor kiểm tra)

- Mỗi màu: tổng số nấc phải ghép được vừa khít vào một tập xe cùng sức chứa (thường là bội số của 4).
- Tổng nấc ≤ tổng sức chứa xe + sức chứa ống.
- `pipeLimit` (N) ≤ sức chứa ống.
- Xe và vị trí dự phòng **không được đè lên ống** (cách mép ống ít nhất 12 px, tính cả phần đèn / cản của ảnh xe dọc).
- **Mỗi level có ít nhất 1 vị trí dự phòng** (`spareSlots`), số vị trí ≥ số lượt Thêm xe; vị trí dự phòng không chồng lên xe. Vị trí do máy tự chọn: chỗ trống trong bãi, không đè ống / xe, **đuôi xe nối thẳng vào ống** (đi thẳng từ đuôi phải gặp ống, không bị xe khác chắn, không xa hơn các xe khác quá nhiều), đuôi xe cách ống gần bằng các xe khác, cùng chiều xoay với đa số xe, thẳng cột / hàng với xe cùng chiều.
- Solver phải tìm được ít nhất 1 lời giải.

## 4.3 Bảng màu

15 màu cá: red, yellow, green, blue, purple, orange, pink, cyan, brown, white, black, gray, sky, lime, navy (8 màu đầu + 7 màu thêm tạo bằng ChatGPT, xem Art direction).

## 4.4 Nền bãi

Nếu mọi xe nằm trong vòng ống thì nền bãi là lòng ống; nếu có xe nằm ngoài ống thì nền là khung bo góc bao trùm ống và mọi xe.

## 4.5 Mẹo độ khó

"Độ dài 1 nấc trong ống" (`slotLength`) càng lớn thì ống chứa càng ít, nên càng dễ bị kẹt (khó hơn). Ít xe trống cũng làm màn khó hơn.
