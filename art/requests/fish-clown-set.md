# fish-clown-set

- Trạng thái: đã vào game (2026-10-23)
- Dùng ở: cá trong ống, trong bể xe, cá bay (8 màu của game)
- Kích thước: 1536 x 1024, lưới 4 x 2 con, nền xám #808080 (có cá xanh lá nên không dùng nền xanh lá)
- Ảnh mẫu: art/reference/gameplay-1080x1920.webp, art/reference/fish-sheet.webp
- File kết quả: art/generated/fish-clown-set.png → public/assets/fish/fish_<màu>.webp

## Prompt
Using the attached references (same glossy 3D cartoon style as the gameplay screenshot and the fish sheet),
create a sprite sheet of 8 cute cartoon CLOWNFISH for a casual mobile puzzle game.
All 8 fish must have the IDENTICAL shape, pose, size and camera angle: side view facing RIGHT, chunky rounded body,
two white stripes with thin dark outlines, big friendly eye, small fins with darker edges — like the clownfish inside the bus tanks of the gameplay screenshot.
Only the body color changes. Arrange them in a grid of 4 columns x 2 rows, evenly spaced with clear gaps, each fish centered in its cell, whole fish visible.
Row 1 colors (left to right): RED (#ff5326), YELLOW (#ffd23a), GREEN (#3fd94a), BLUE (#2f8bff).
Row 2 colors (left to right): PURPLE (#a24bff), ORANGE (#ff8a1f), PINK (#ff5fb8), CYAN (#22d8e0).
Plain flat solid neutral GREY (#808080) background everywhere, no shadows, no text, no labels, no borders. Landscape image 1536x1024.

## Ghi chú
Lần chạy thử đầu tiên của quy trình. ChatGPT tạo trong 1 phút 26 giây, 1 lần là đạt; PNG 1536x1024, 1,64 MB. Cắt bằng `fish_set()` trong `art/tools/cut_assets.py`. Mục tiêu: cá trong bể giống ảnh mẫu (cùng một loài cá hề, chỉ khác màu).
