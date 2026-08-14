# 10 — PWA manifest 的描述與語言改成英文

Status: done
Type: enhancement
Blocked by: 無，可立即開始

決策背景見 `../spec.md` 決定九。**與 i18n 主線平行，最小的一張票。**

## 要做什麼

`vite.config.ts` 兩行：

```ts
description: '自建單字本，間隔複習，離線可用',   // :48 → 改成英文
lang: 'zh-Hant',                                  // :49 → 改成 'en'
```

## 為什麼是英文而不是跟著切

**PWA manifest 是一份靜態 JSON，只有一份。** 它在 build 時就固定了，執行時才決定的介面語言影響不到它。要多語言得動態產生或出多份 manifest，成本不成比例。

而「系統預設不符合就套英文」這條規則（`../spec.md` 決定六）已經把英文定成這個 app 的國際門面，`APP_NAME` 也早就是拉丁字母。描述跟語言標記跟著走，才是一致的。

## 影響範圍很小

manifest 只影響**網頁版的「加到主畫面」安裝提示**。

- iOS 上架版走 `Info.plist`，不看 manifest（`vite.config.ts:39` 的 `isIOS` 分支本來就把整個 `VitePWA` 跳過）
- 已經裝在主畫面上的圖示名稱來自 `short_name`，那是 `APP_NAME.short`，本票不動

**代價**：中文使用者在網頁版安裝時會看到英文描述。收下。

## 決定

### `name` 與 `short_name` 一個字都不改

它們是 `APP_NAME.full` 與 `APP_NAME.short`，由 `ADR-0012` 的單一來源架構供應。**本票只碰 `description` 與 `lang` 兩個字面值。**

### 英文描述照中文那句的意思翻

現在是「自建單字本，間隔複習，離線可用」——三個賣點：卡片由使用者自建、間隔複習排程、離線可用。英文版保持同樣三點、同樣簡短，用 `docs/glossary.md` 定案的 `Vocabulary Book` 一詞。

## 這張票不做的事

- **不碰 `name`、`short_name`**
- **不做多份 manifest 或動態產生**
- **不碰 `Info.plist`**
- **不碰 `index.html` 的 `<html lang>`**——那個由票 02 的機制在執行時設定，不屬本票

## 驗收

- [x] `vite.config.ts:48` 是英文描述，`:49` 是 `'en'`
- [x] `name` 與 `short_name` 仍然來自 `APP_NAME`，未被寫死
- [x] `npm run build` 之後 `dist/manifest.webmanifest` 裡是新值
- [x] `npm run build:ios` 不受影響（`isIOS` 分支本來就跳過 `VitePWA`）
- [x] `npm run test` 與 `npm run typecheck` 全綠
