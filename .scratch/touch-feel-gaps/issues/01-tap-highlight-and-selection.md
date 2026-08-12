# 01 — 點按會閃灰、長按會跳出選字放大鏡

Status: ready-for-agent
Type: bug

沒有對應的 spec 決定——觸控行為的破綻，在一次 `/grilling` 中讀 `src/styles.css` 時發現的，不是使用者回報。

## 現況

`src/styles.css` 已經處理掉兩個最典型的網頁味：

| 位置 | 屬性 | 擋掉什麼 |
| --- | --- | --- |
| `:33` | `touch-action: manipulation` | 點擊延遲、連點兩下放大（票 `ios-app 16`） |
| `:47` | `overscroll-behavior: none` | 整頁的橡皮筋回彈 |

**但還有兩個沒處理**：

1. **`-webkit-tap-highlight-color` 沒設。** 手指按下去時 iOS Safari 會在元素上蓋一層灰色半透明方塊。原生 app 不會這樣。
2. **`user-select` 沒設。** 長按文字會跳出選取控制點與放大鏡，那是瀏覽器的行為，不是 app 的行為。

兩者都是一眼看得出「這是網頁」的破綻。

## 要做什麼

### tap highlight：可以全站關掉

```css
-webkit-tap-highlight-color: transparent;
```

全站關安全，因為**按下的回饋已經有人在做**——`styles.css:687`、`:702` 已經有自己的 `transition`（含 `transform`）。那道灰色閃光是多餘的第二層，拿掉不會讓按鈕變得沒反應。

### user-select：**不能全站關掉**

這是重點，別無腦加一行 `user-select: none` 到 `body` 上。

**這是單字 app，使用者很可能想長按複製詞條去查字典。** 全站關掉會把這個能力一起殺死，那是在修一個破綻的同時弄壞一個真實需求。

要區分：

| 該關掉 | 該保留 |
| --- | --- |
| 標題列、按鈕、四顆評分鈕、時間桶標頭、開關 | **詞條**（`.term`）、**釋義**（`.meaning`） |

判準是「這段文字有沒有被複製的價值」。互動元件沒有，內容有。

`:where()` 或個別選擇器都可以，挑一個跟現有寫法一致的。

## 這張票不做的事

- **不碰 `touch-action` 與 `overscroll-behavior`**，那兩個已經是對的
- **不做整體視覺翻修。** 這張票只補兩個具體破綻，不是「讓 app 更像原生」的大工程
- **與 `.scratch/swiftui-spike/` 那張票無關。** 這兩行不管原生方向走不走都該補，是本來就漏掉的

## 驗收

- [ ] `-webkit-tap-highlight-color: transparent` 已加，且不影響現有的按下回饋
- [ ] `user-select: none` 只套在互動元件上；詞條與釋義**仍然可以長按複製**
- [ ] **真機驗證**：iPhone 上點按鈕不再閃灰、長按按鈕不跳選字、長按詞條**仍然**跳得出複製
- [ ] `npm run test` 與 `npm run typecheck` 全綠

**驗收必須用真機。** Windows 上的桌面瀏覽器測不出 tap highlight 與長按選字——那是 iOS Safari 的觸控行為。接法見既有做法：熱點加 `vite --host`，手機連過去。

## Comments
