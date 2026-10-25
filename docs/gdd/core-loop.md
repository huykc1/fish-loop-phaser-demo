# 2. Core loop

<Badge type="tip" text="Live" /> Luật dưới đây lấy từ đặc tả bản gốc Fish Bus (`GAME_SPEC.md` v1); đã có trong code Phaser (`src/core/`).

## 2.1 Thành phần

| Thành phần | Mô tả |
|---|---|
| **Ống (Pipe)** | Đường khép kín (đa giác bo góc) do level định nghĩa. Cá chạy **một chiều**, tốc độ đều `pipeSpeed` (px/s). |
| **Ống hở có cổng** | Ống có thể hở (`open`): điểm đầu và điểm cuối là 2 **cổng**. Cá chui vào cổng cuối thì ra **ngay lập tức** ở cổng đầu, nên về luật ống vẫn là một vòng; chiều dài vòng `L` không tính đoạn nối 2 cổng. |
| **Ô ống (Slot)** | Ống được chia đều thành `C = floor(L / slotLength)` ô. Mỗi ô chứa **0 hoặc 1 nấc cá** (1 màu). `C` = sức chứa ống. |
| **Xe (Bus)** | Đứng yên tại chỗ. Có `capacity` = **4 nấc (cố định)**. _(Bản gốc cho phép 1..4; đã chốt dùng 4 cho Fish Loop.)_ Nội dung là **ngăn xếp**: phần tử đầu = đầu xe, phần tử cuối = **đuôi xe**. |
| **Cổng (Port)** | Mỗi xe có 1 điểm trên ống (`portS`, toạ độ theo chiều dài ống). Mặc định = điểm đầu tiên trên ống khi đi **thẳng theo hướng đuôi xe** (cá ra thẳng từ đuôi); nếu hướng đó không gặp ống thì lấy điểm ống gần đuôi xe nhất. Cá ra và vào xe đều qua cổng này. |
| **Nấc (Unit)** | Đơn vị logic nhỏ nhất: 1 nấc = 1 bể cá 1 màu. Về hình ảnh, 1 nấc hiển thị `fishPerUnit` con cá. |

## 2.2 Xả cá (người chơi tap xe)

1. Xe bị khoá (đã ✓) hoặc rỗng → tap không có tác dụng (rung nhẹ).
2. Lấy **cụm cùng màu liền nhau ở đuôi** xe, độ dài `k`.
3. `free = min(số ô trống trong ống, N − số nấc đang trên ống) − số nấc đang chờ vào ống (của mọi xe)`. `N` = `pipeLimit` của level (mặc định 5): số nấc tối đa được chạy trên ống cùng lúc.
4. `n = min(k, free)`. Nếu `n = 0` → báo "Ống đầy", không xả.

Bộ đếm `x/N` trên HUD: `x` = số nấc đang chạy trên ống. Nấc rơi xuống ống → `x` tăng 1; nấc vào xe → `x` giảm 1. Khi `x = N` số chuyển màu đỏ nhạt.
5. `n` nấc rời xe ngay (xe không còn chứa chúng) và vào **hàng chờ của cổng** xe đó.
6. Mỗi khi một ô đi qua cổng, nấc đầu hàng chờ **chen vào ngay** ô đó (không phải chờ ô trống). Nếu ô đang có cá thì các nấc từ ô đó ngược về phía sau (chưa tới cổng) **lùi mỗi nấc 1 ô** tới ô trống gần nhất để nhường chỗ (luôn có ô trống vì bước 3 đã trừ hàng chờ). Trên màn hình, đàn phía sau chậm lại rồi giãn ra mượt. Ô mới ghi nhớ `source = xe nguồn`, `traveled = 0`. Tốc độ xả ≈ `pipeSpeed / slotLength` nấc mỗi giây.
7. Có thể tap tiếp khi hàng chờ chưa xả hết. Cụm tiếp theo xếp sau trong hàng chờ.

## 2.3 Cá vào xe (tự động)

Khi một ô có cá màu `c` đi qua cổng của xe `B`, cá vào `B` nếu **đủ tất cả** điều kiện:

- `B` chưa hoàn thành và còn chỗ trống (`stack.length < capacity`).
- `B` rỗng **hoặc** nấc ở đuôi `B` có màu `c`.
- `B` không có hàng chờ xả (xe đang xả thì cổng ưu tiên cho cá ra).
- Không phải trường hợp `source = B` và `traveled < L` (cá **không quay lại xe nguồn** khi chưa chạy hết 1 vòng).
- **Ưu tiên xe cùng màu:** nếu `B` rỗng mà đang có xe khác chưa ✓, còn chỗ, không rỗng và nấc ở đuôi màu `c`, thì cá **không vào `B`** (đi ngang xe trống cũng bỏ qua) mà chạy tiếp tìm xe đó. Khi các xe như vậy đã đầy, phần còn dư mới được vào xe trống (thường sau thêm 1 vòng). Tránh việc 2 xe cùng có nấc màu `c` cứ chuyền qua lại cho nhau.

Nếu nhiều cổng trùng vị trí, xét theo thứ tự xe trong level.

## 2.4 Hoàn thành xe

Xe **đủ `capacity` nấc và tất cả cùng màu** → hoàn thành: nắp đóng lại che các bể, dấu ✓ hiện trên nắp, xe bị khoá vĩnh viễn (không xả, không nhận).

## 2.5 Session loop và long-term loop

_TBD_
