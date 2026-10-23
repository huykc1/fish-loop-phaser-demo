# 6. Roadmap & open questions

## 6.1 What exists today <Badge type="tip" text="Live" />

- Project scaffold: Phaser 4 game, docs site and versioned web releases
- Gameplay Fish Bus port sang Phaser 4: ống, xe 4 nấc, xả cá, cá vào xe, thắng/thua, 3 booster, 5 level
- Ống hở có 2 cổng (cá qua cổng tức thì), cỡ xe theo level, nắp đóng + ✓ khi xe hoàn thành; level 6 theo layout ảnh mẫu (2 hàng xe dọc + 1 xe ngang)
- Hình ảnh theo ảnh mẫu + animation: cá bơi trong ống và trong bể, nước dâng/rút, cá nhảy theo đường cong, dấu ✓ + lấp lánh, pháo giấy khi thắng, ống nhấp nháy đỏ khi sắp kẹt, xe dự phòng chạy vào

## 6.2 Roadmap <Badge type="warning" text="Coming soon" />

Order of priority. Milestones are scope buckets, not dates.

### M1: First playable
| Item | Chapter |
|---|---|
| Đo độ khó khi có giới hạn N | [Spec editor](../guide/editor) |

### M2: Nội dung và polish (gợi ý từ bản gốc)
| Item | Chapter |
|---|---|
| Thêm level (độ khó tăng dần) | [Level format](./level-format) |
| Nền / xe / nút từ ảnh AI | [Art direction](./art) |
| Nhạc nền | _TBD_ |
| Màn hình chính | _TBD_ |
| PWA / offline | _TBD_ |
| Hiệu ứng thắng (pháo giấy) | [Rules](./rules) |

### Ý tưởng từ ảnh layout mẫu (chưa thiết kế)
| Item | Chapter |
|---|---|
| Nấc ẩn màu "?" (chỉ lộ màu khi các nấc phía trên rời đi) | _TBD_ |
| Booster tốn xu + booster thứ 4; hệ thống tiền tệ | _TBD_ |

## 6.3 Known issues {#known-issues}

| Issue | Impact | Planned fix |
|---|---|---|

## 6.4 Open questions {#open-questions}

| Question | Options | Current lean |
|---|---|---|
| Target player | _TBD_ | _TBD_ |
| Cách đo độ khó khi có giới hạn N | Tỉ lệ thắng người chơi ngẫu nhiên / số trạng thái solver / người chơi biết chờ | _TBD_ |
