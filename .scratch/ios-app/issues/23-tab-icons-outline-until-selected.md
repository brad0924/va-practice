# 23 — 導覽列圖示改成平常線條、選中變實心，與網頁版一致

Status: ready-for-agent
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

**2026-09-22 拍板：iOS 跟網頁版一致，改成線條加實心。** `N-07` 那一列標成刻意不照。經過見 Comments。

## 驗收

- [ ] 四格沒選中時是線條版，選中那格是實心版。
- [ ] 切換 tab 時圖示跟著換，沒有閃一下或對不齊。
- [x] `N-07` 那一列照拍板的結果更新。
- [ ] 真機（iOS 26）看一次，捲動時縮成小膠囊的狀態也看一次。

## 出處

- 網頁版的選擇：`web-tab-bar/01` 決定 7；原型分支 `prototype/web-tab-bar`。
- 手機版原本的圖示決定：`rn-rewrite/09`，維護者 2026-08-26 目測選定。

## Comments

**2026-09-22，拍板經過。** 維護者先問了「一般來說怎麼做」。答案是兩套規矩：Apple 的指南與 iOS 內建 app 是四格全實心，只換顏色；Google 的 Material Design 與 Instagram、YouTube 這類跨平台 app 是平常線條、選中實心。分界是要「像 iPhone 原生」還是「跟自己的網頁版一樣」。這支 app 有網頁版，所以選後者。

**2026-09-22，程式做完，等真機。** 系統自己換圖：`sf.default` 與 `sf.selected` 交給 `react-native-screens` 的 `icon` 與 `selectedIcon`，不經過 React 重畫，所以程式這一端不會造成閃一下。捲動縮成小膠囊時會不會照樣換圖，原始碼看不出來，要真機看。
