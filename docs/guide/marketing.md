# Bộ marketing (quảng cáo)

Chuẩn bị sẵn để làm video quảng cáo / trang store. File tĩnh nằm trong `art/marketing/`:

| File | Kích thước | Dùng cho |
|---|---|---|
| `logo.png` | 1040 × 700, nền trong suốt | Logo "FISH LOOP" (chữ bong bóng + vòng ống kính có cá bơi) |
| `icon.png` | 1024 × 1024, bo góc, nền trong suốt ngoài góc | Icon app / store |
| `endcard.png` | 1080 × 1920 | Ảnh tĩnh end card (outro video) |
| `screen-win.png`, `screen-lose.png` | 1080 × 1920 | Ảnh màn thắng / thua |

## Cảnh động (để quay màn hình làm outro video)

Mở game với tham số `promo`:

- `<pagesUrl>/demo/?promo=endcard`: end card động: logo nảy, cá bơi vòng quanh logo, xe buýt nhận cá liên tục, nút **CHƠI NGAY** nhấp nháy + bàn tay bấm. Khung dọc 1080 × 1920, quay ~5–8 giây là đủ một vòng lặp.
- `?promo=logo`: chỉ logo (nền trong suốt).
- `?promo=icon`: icon app.

Khi chạy `npm run dev`, gõ `await window.__promo.export()` trong console để xuất lại PNG vào `.snaps/` (rồi chép vào `art/marketing/`).

## Thông tin game

- Tên: **Fish Loop**
- Câu giới thiệu (tagline): *Xếp cá đúng màu – lấp đầy xe buýt!* (tiếng Anh: *Sort the fish, fill the bus!*)
- Màu chủ đạo: xanh nước (#1aa0e6), tím xe buýt (#6b4fd8), cam cá hề (#ff8a1f), viền chữ tím đậm (#4b2bb5).

Logo, icon và end card hiện vẽ bằng code (`src/game/Logo.ts`, `src/scenes/Promo.ts`). Khi có ảnh logo / ruy băng / cá vui – buồn từ ChatGPT (phiếu `art/requests/logo.md`, `art/requests/ui-kit.md`) thì thay vào.
