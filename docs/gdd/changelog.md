# 7. Changelog

Every published version stays playable at its own URL. The [landing page](https://huykc1.github.io/fish-loop-phaser-demo/) lists them all.

## latest (main) <Badge type="tip" text="Live" />

- Project scaffold.
- Gameplay Fish Bus chạy trên Phaser 4, 5 level, asset cắt từ ảnh mẫu, animation và hiệu ứng.
- Xe dọc có ảnh riêng cho 2 chiều (đầu xuống / đuôi xuống).
- Bể nước vẽ lại theo từng màu (khối nước phát sáng, viền kính ánh màu).
- Ống hở có 2 cổng (`pipe.open`), cỡ xe theo level (`busScale`), xe hoàn thành đóng nắp + ✓. Level 6 "Hai cổng".
- Bỏ mũi tên làn ở 2 đầu xe ngang.
- Cá trong ống bơi dãn ra: mỗi đàn trải dài ~2,6 ô và lẫn với cá màu khác ở ô bên cạnh, mỗi con tự bơi lên / lùi chậm và lượn ngang khắp lòng ống, cỡ hơi khác nhau (chỉ đổi hiển thị, luật giữ nguyên).
- Sửa: sóng nước nền (và các hiệu ứng khác) không còn tự tắt sau một lúc. Nguyên nhân: chế độ đồ hoạ Tự động coi khung hình giật (solver, chuyển tab) là máy yếu và chuyển hẳn sang Tiết kiệm. Giờ bỏ qua khung giật, đo theo trung vị, và tự bật lại khi mượt.
- Nước chảy nhanh hơn ~20% (pipeSpeed 220 → 265, level 5: 240 → 290; level mới mặc định 265) và đẹp hơn: vân sáng lấp lánh trong lòng ống, đốm sáng mềm trôi theo dòng nước, vệt bọt sau mỗi đàn cá. Level 9 và 10 rải lại màu để solver vẫn giải nhanh; cả 10 level giải được.
- Màn thắng / thua làm lại (ruy băng, sao theo số booster đã dùng, tia nắng, cá vui / buồn, thẻ booster cứu màn).
- Bộ marketing: logo, icon 1024, end card động (`?promo=endcard`) và ảnh tĩnh trong `art/marketing/` (xem Guide → Bộ marketing).
- Editor: mở lần đầu tự nạp đủ level của game (trước đây phải chọn nơi lưu, và chỉ có 6 level); folder trống cũng được nạp sẵn; nút ★ thêm level của game còn thiếu.
- Kiểm tra mới: xe / chỗ dự phòng không được đè lên ống (editor báo lỗi, chỗ dự phòng tự động cũng tránh, có test). Sửa level 6 (2 hàng xe lấn vào ống), level 2 (xe dọc sát ống trái, chỗ dự phòng sát ống trên; cỡ xe 0,95), level 9 (2 xe trong lòng ống chạm nhau).
- Thêm level 7–10 theo 4 bố cục mẫu (`art/reference/layout-ref-7..10.jpg`): Chữ S (ống S hở, 3 hàng xe), Móc câu (ống ⊃ hở, xe trên / trong / dưới), Hai bờ (vòng ngang, 2 xe trong + xe 2 bờ), Ô vuông (vòng vuông, 3 xe trong + xe trên / dưới). 8–10 màu, màu rải theo cặp; solver giải được tất cả.
- Bảng màu từ 8 lên 15 màu (7 cá mới tạo bằng ChatGPT); nền bãi tự mở rộng khi có xe nằm ngoài ống; bảng chọn level trong Cài đặt thành 2 hàng.
- Nền bãi xe đổi sang xanh dương đậm theo ảnh mẫu, phủ vân sóng nước động (chỉ trong lòng bãi); xe có bóng đổ mềm lệch xuống dưới như ảnh mẫu.
- Solver mới tìm lời giải ngắn về thời gian chơi (trước đây tìm sâu, hay tap lặp một xe và chờ cả vòng): level 6 từ 43 tap / ~13 phút còn 23 tap / ~1 phút; level 5 từ 46 tap / ~16 phút còn 17 tap / ~32 giây.
- Level 6 thiết kế lại: 7 xe đầy (7 màu × 4 nấc, không xe trống), cỡ xe 0,7, hàng trên 4 xe + hàng dưới 3 xe và chỗ dự phòng; solver giải được (43 lần tap).
- Chỗ dự phòng phải nối thẳng vào ống (editor báo lỗi nếu không). Level 6 dàn lại: cỡ xe 0,55, hàng dưới 6 chỗ, xe dự phòng là chỗ thứ 6 (đuôi xuống ống dưới); solver xác nhận vẫn giải được.
- Cổng tự động của xe đổi thành điểm gặp ống khi đi thẳng từ đuôi xe (trước đây là điểm gần nhất, nên xe sát mép trên bị lấy cổng ở đoạn ống phía trên). Solver xác nhận 6 level vẫn giải được.
- Sửa xe xoay 180° (đuôi bên trái): thân xe chỉ lật ngang, bể nằm đúng trong khay (trước đây bể bị tụt xuống dưới); bóng mờ xe dự phòng đúng chiều xe thật (không lộn ngược). Áp dụng cho game, editor và bàn tay hướng dẫn.
- Mỗi level có sẵn vị trí xe dự phòng (máy tự đặt) và ít nhất 1 lượt Thêm xe. Level 1, 4, 5 dàn lại cột xe để có chỗ (level 4, 5 thu cỡ xe còn 0,87); solver xác nhận 6 level vẫn giải được.
- Luật cá vào xe: nấc ưu tiên xe có đuôi cùng màu, bỏ qua xe trống cho tới khi xe đó đầy (tránh 2 xe chuyền nấc qua lại). Solver xác nhận 6 level vẫn giải được.
- Level Editor ở `/editor/` theo spec `docs/guide/editor.md`: lưu folder / browser storage, 3 bản cũ, nháp, Organiser + Add levels, solver và sinh màu chạy ngầm, chơi thử trong editor.
- Dữ liệu level chuyển sang `level-data/` (levels/, collections/Main/); game đọc collection Main.
- Xem lời giải: bàn tay hướng dẫn (tạo bằng ChatGPT) tự chơi theo solver, tap đúng lịch nên chắc chắn thắng.
- Cá đổi thành bộ 8 cá hề cùng dáng (tạo bằng ChatGPT theo quy trình `docs/guide/assets.md`).
- Bộ đếm HUD đổi thành số nấc trên ống `x/N` (N = `pipeLimit`, mặc định 5); tap bị giới hạn bởi N.
- Booster mới: **Return** (trả nấc vừa vào xe về chỗ cũ), **Shuffle 1 xe** (chọn xe, gom màu, màu lẻ ra đuôi). Bỏ Undo kiểu khôi phục trạng thái và Shuffle màu trong ống.
- Level 4 và 6 sinh lại màu theo luật N = 5 (level 6 còn 7 màu, 4 xe trống); solver xác nhận cả 6 level giải được.
- Sửa solver: bản sao trạng thái giữ đúng bộ đếm kẹt (trước đây có thể coi là giải được ở màn thực tế sẽ thua).
- Level 2: dời 2 xe ngang sang phải cho đuôi xe sát ống (x 540 → 655).
- Xe cố định 4 nấc; level 4 sinh lại màu cho xe 4 nấc (solver xác nhận giải được); level 3 giãn lại khoảng cách xe để không chồng lên vị trí dự phòng.

[Play latest](https://huykc1.github.io/fish-loop-phaser-demo/demo/)

## Document history

| Date | Change |
|---|---|
| 2026-10-23 | GDD created |
