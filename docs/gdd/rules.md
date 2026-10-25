# 3. Rules & mechanics

<Badge type="tip" text="Live" /> Luật dưới đây lấy từ đặc tả bản gốc Fish Bus (`GAME_SPEC.md` v1); đã có trong code Phaser (`src/core/`).

## 3.1 Thắng

Ống rỗng, không còn hàng chờ, và **mọi xe đều đã ✓ hoặc rỗng**.
(`goal` = số xe hoàn thành khi thắng, editor tính bằng solver; không hiện trên HUD. Bộ đếm trên HUD là số nấc trên ống, xem [Core loop](./core-loop).)

## 3.2 Thua (kẹt)

Đồng thời thoả mãn:

- Không có xe nào **tap được có hiệu quả** (ống không còn chỗ hoặc mọi xe đều ✓/rỗng), và
- Không có hàng chờ xả, và
- Trong **1 vòng ống** (`L / pipeSpeed` giây) không có nấc nào vào xe.

Khi đã qua 50% thời gian trên → bật cảnh báo (ống nhấp nháy đỏ). Có cá vào xe → reset bộ đếm.
Khi thua: popup cho phép dùng booster để cứu hoặc chơi lại.

## 3.3 Booster

| Booster | Tác dụng |
|---|---|
| **Return** (nút mũi tên vòng, trường `undo`) | Lấy **nấc vừa vào xe gần nhất** (toàn màn) đưa bay thẳng về đúng vị trí cũ ở xe nó đã rời. Chỉ dùng được khi: nấc vẫn còn ở đuôi xe đích; ở xe cũ, chỗ cũ đúng là chỗ trống kế tiếp (nấc ngay dưới chưa bị chuyển đi, chưa nhận nấc khác), xe cũ chưa ✓ và không có hàng chờ. Không thoả → nút mờ, không dùng được (không lùi về nấc cũ hơn). Nếu nấc đó đã làm xe đích ✓ thì xe mở nắp lại. |
| **Shuffle** (nút giữa) | Bấm nút → chọn 1 xe (xe chọn được sáng lên, xe khác mờ; bấm lại nút để huỷ). Các nấc trong xe được xếp lại: **gom cùng màu thành cụm, cụm đông ở đầu xe, màu lẻ (ít nấc) ra đuôi** để xả được ngay; các cụm bằng nhau xếp ngẫu nhiên (PRNG có seed). Không dùng cho xe ✓, xe rỗng, xe 1 màu, xe đang có hàng chờ, hoặc xe đã đúng thứ tự. |
| **Thêm xe** | Thêm 1 xe rỗng (capacity 4) vào vị trí dự phòng `spareSlots` tiếp theo của level; tồn tại tới hết màn, chơi lại thì mất. Booster dùng được ở **mọi level**, nên level nào cũng có sẵn ít nhất 1 vị trí dự phòng. |

## 3.4 Màn thắng / thua

- **Thắng:** tia nắng xoay, ruy băng vàng "Tuyệt vời!", 3 ô sao; số sao = 3 − số booster đã dùng (tối thiểu 1), sao bật lần lượt kèm âm thanh; cá hề nhảy mừng; nút **Màn tiếp** (nhấp nháy) và **Chơi lại**.
- **Thua:** viền tối đỏ, ruy băng đỏ "Ống bị kẹt!", cá buồn chìm nổi và rơi nước mắt; 3 thẻ booster (Trả về / Xáo xe / Thêm xe) có số lượt, thẻ không dùng được thì mờ; nút **Chơi lại**.

## 3.5 Xem lời giải (tự chơi)

Trong Cài đặt có nút **Xem lời giải**: chơi lại màn, solver tìm lời giải ngắn về thời gian (ưu tiên các nhánh ít thời gian + ít nấc còn phải xếp, bước chờ chỉ chờ tới khi có nấc vào xe) rồi **bàn tay hướng dẫn** bay tới từng xe và ấn xuống đúng lúc tap (lịch tap dựng từ lời giải, mô phỏng giống hệt nên chắc chắn thắng). Chạm vào bàn chơi để dừng; người chơi chơi tiếp từ trạng thái lúc dừng. Dùng để thử màn và sau này cho tutorial.

## 3.6 Mô phỏng

- Bước cố định **60 Hz**, độc lập khung hình → cùng level + cùng chuỗi thao tác = cùng kết quả (dùng cho solver, replay, undo).
- Băng chuyền: `offset += pipeSpeed * dt`; vị trí ô `i` = `(i * S + offset) mod L` với `S = L / C`.
- Random duy nhất (Shuffle, khi các cụm bằng nhau) dùng PRNG có seed.
