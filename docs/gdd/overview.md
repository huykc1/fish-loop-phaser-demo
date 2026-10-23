# 1. Overview

| | |
|---|---|
| **Title** | Fish Loop |
| **Genre** | Puzzle xếp cá theo màu |
| **Platform** | Web (mobile portrait first), khung dọc 9:16 |
| **Engine** | Phaser 4, TypeScript, Vite |

::: info Nguồn
Nội dung GDD này lấy từ project gốc **Fish Bus** (PixiJS v8). Logic đã được port nguyên vẹn sang `src/core/`; phần hiển thị viết lại bằng Phaser 4.
:::

## 1.1 Pitch

Game xếp cá theo màu. Cá chạy một chiều trên một ống khép kín; người chơi tap các xe đứng yên để xả cá vào ống, cá tự vào xe cùng màu. Xe đủ nấc cùng màu thì hoàn thành ✓. Thắng khi ống rỗng và mọi xe đều ✓ hoặc rỗng.

## 1.2 Target player

_TBD_

## 1.3 Màn hình và toạ độ

Toạ độ thiết kế **1080 × 1920** (dọc). <Badge type="tip" text="Live" />
