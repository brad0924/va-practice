# 23 — 導覽列圖示改成平常線條、選中變實心，與網頁版一致

Status: needs-triage
Type: enhancement
Blocked by: 無，可立即開始

## 為什麼有這張票

網頁版改成底部四格導覽列（`web-tab-bar/01`）時，維護者看原型挑了圖示的樣子：**沒選中的是線條版，選中那格換成實心**。維護者要 iOS app 也改成同一套（2026-09-22）。

iOS app 現在四格都是實心的系統符號，選中與沒選中只差顏色（`mobile/app/_layout.tsx`）。

## 要做什麼

`NativeTabs.Trigger.Icon` 的 `sf` 本來就收 `{ default, selected }`，四格各改一行：

| tab | 平常 | 選中 |
| --- | --- | --- |
| 複習 | `graduationcap` | `graduationcap.fill` |
| 卡片 | `rectangle.stack` | `rectangle.stack.fill` |
| 資料 | `gearshape` | `gearshape.fill` |
| 統計 | `chart.bar` | `chart.bar.fill` |

`_layout.tsx` 圖示上方那段註解寫著「填滿版的系統符號（`N-07`）」，要一起改掉。

## 動工前要維護者拍板

**這條與 HIG 檢查表 `N-07` 衝突。** `rn-rewrite/hig-checklist.md` 的 `N-07` 寫「tab 圖示用 SF Symbols，優先選填滿（filled）的版本」，出處是 HIG 的 Tab bars 一節。iOS 26 系統自己的 app 多半是四格都實心、只靠顏色分選中。改成線條版等於在檢查表上留一條沒過。

可能的處理：照維護者的選擇改，並在檢查表 `N-07` 那一列註明「刻意不照，理由是與網頁版一致」；或 iOS 維持實心，只有網頁版用線條。

## 驗收

- [ ] 四格沒選中時是線條版，選中那格是實心版。
- [ ] 切換 tab 時圖示跟著換，沒有閃一下或對不齊。
- [ ] `N-07` 那一列照拍板的結果更新。
- [ ] 真機（iOS 26）看一次，捲動時縮成小膠囊的狀態也看一次。

## 出處

- 網頁版的選擇：`web-tab-bar/01` 決定 7；原型分支 `prototype/web-tab-bar`。
- 手機版原本的圖示決定：`rn-rewrite/09`，維護者 2026-08-26 目測選定。
