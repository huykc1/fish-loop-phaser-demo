# Game Design Document

**Fish Loop** · Game Design Document · tracks build `latest` (see [Changelog](./changelog))

This document describes what Fish Loop is, how it plays, and why it is built the way it is. Every number in it (timings, formulas, sizes, colours) comes from the current code. If the two disagree, the code is right and this document has a bug.

## How to read this document

Each feature carries a status:

| Badge | Meaning |
|---|---|
| <Badge type="tip" text="Live" /> | In the current build and playable at [the demo](https://huykc1.github.io/fish-loop-phaser-demo/demo/). |
| <Badge type="warning" text="Coming soon" /> | Designed or planned, **not in the game yet**. Details may change before it ships. |

Coordinates and sizes are in **design pixels** on the 1080 × 1920 portrait canvas (từ GDD gốc Fish Bus).

## Contents

| Part | Chapters |
|---|---|
| **I. Vision** | [1. Overview](./overview) |
| **II. Gameplay** | [2. Core loop](./core-loop) · [3. Rules & mechanics](./rules) · [4. Level format](./level-format) |
| **III. Art** | [5. Art direction](./art) |
| **IV. Production** | [6. Roadmap & open questions](./roadmap) · [7. Changelog](./changelog) |

## One-paragraph summary

Game xếp cá theo màu. Cá chạy một chiều trên một ống khép kín; người chơi tap các xe đứng yên để xả cá vào ống, cá tự vào xe cùng màu. Xe đủ nấc cùng màu thì hoàn thành ✓. Thắng khi ống rỗng và mọi xe đều ✓ hoặc rỗng. Nội dung lấy từ đặc tả bản gốc Fish Bus (PixiJS); gameplay đã chạy trên Phaser 4.
