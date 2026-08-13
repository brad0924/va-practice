# 02 — i18n 機制：翻譯檔、查表函式、語言決定與保存

Status: ready-for-agent
Type: enhancement
Blocked by: 01

決策背景見 `../spec.md` 決定二、三、五、六，以及 `docs/adr/0013-interface-localization.md`。

## 要做什麼

蓋出多語言的骨架，**但不搬任何字串**。做完之後 `zh-Hant.ts` 裡可能只有兩三條示範用的 key，畫面看起來跟現在一模一樣。

搬字串是票 03，那張才會讓畫面真的動起來。

**刻意拆開的理由**：機制與搬遷是兩種完全不同的工作。機制錯了要重來，搬遷錯了只是某一句話跑掉。混在一張票裡，搬到第 150 條才發現機制不對就很痛。

## 決定

### 檔案結構

```
src/i18n/
├── zh-Hant.ts   ← 唯一的來源，其餘兩支照它的型別
├── en.ts
├── ja.ts
└── index.ts     ← t()、當前語言、語言決定與保存
```

### 漏譯交給型別，不寫測試

```ts
// zh-Hant.ts
export default { ... } as const;

// en.ts
import type zhHant from './zh-Hant';
const en: typeof zhHant = { ... };   // 少一條就編譯錯
export default en;
```

`package.json` 的 `build` 與 `typecheck` 都會跑 `tsc --noEmit`，因此漏譯在建置時就擋下來。**不要另外寫一支「檢查各檔 key 一致」的測試**，那是型別已經做完的事。

### key 用語意命名

`books.addButton`、`editor.saveFailed`。不用中文原文當 key，理由見 ADR-0013 的 Considered Options。

命名沿用檔案分區即可（`books.*`、`editor.*`、`review.*`、`list.*`、`stats.*`、`data.*`、`cloud.*`、`reading.*`），不必先想出一套完整的分類法——約 193 條是在票 03 才會全部長出來的，那時候自然會知道該怎麼分。

### 語言的決定順序

```
va-practice:lang 有值且是三種語言之一  → 用它
va-practice:lang 是 'system' 或不存在  → 看 navigator.language 的主碼
```

主碼比對表：

| `navigator.language` | 主碼 | 給 |
| --- | --- | --- |
| `zh-TW`、`zh-HK`、`zh-Hant`、`zh-CN`、`zh-Hans` | `zh` | `zh-Hant` |
| `ja-JP` | `ja` | `ja` |
| 其餘一切（含 `ko-KR`） | | `en` |

**簡體中文算符合，給繁體中文。** 理由見 `../spec.md` 決定六。

### 保存位置：獨立的 `va-practice:lang`

**不進 `va-practice:data`，`DATA_VERSION` 維持 3，備份格式一個字不改。**

與 `va-practice:reminder`、`va-practice:reminder-time`、`va-practice:gemini` 同一類。存的值是 `'system'`、`'zh-Hant'`、`'en'`、`'ja'` 四者之一；讀到不認得的值一律當 `'system'`。

沿用既有做法：storage 從外面遞進來（`StorageLike`），這個模組不自己碰 `localStorage`，測試時可換成假的實作。

### 切語言之後怎麼讓畫面更新

這個 app 的畫面是重新渲染的（`review-view.ts` 的 `replaceChildren` 那類），**不需要引入任何響應式機制**。切語言之後把當前畫面重新渲染一次即可，接線由 `app.ts` 負責——與「複習範圍一變就重建佇列」是同一種做法。

不要為了 i18n 引入 signal、store、observer 之類的東西。

## 這張票不做的事

- **不搬任何既有字串**（票 03）
- **不做語言選單 UI**（票 04）
- **不碰錯誤訊息**（票 05）
- **不寫英日的翻譯內容**（票 06）——這兩支檔案這輪可以只放示範用的兩三條
- **不寫「各檔 key 一致」的測試**，型別已經做完了

## 驗收

- [ ] `src/i18n/` 四個檔存在（zh-Hant、en、ja、index），`t()` 可以取出 `zh-Hant` 的字串
- [ ] 故意在 `en.ts` 刪掉一條 key → `npm run typecheck` 紅燈
- [ ] `va-practice:lang` 設成 `'ja'` → `t()` 回日文那份
- [ ] `va-practice:lang` 不存在、`navigator.language` 是 `zh-CN` → 回繁體中文那份
- [ ] `va-practice:lang` 不存在、`navigator.language` 是 `de-DE` → 回英文那份
- [ ] `va-practice:lang` 存了不認得的值（如 `'ko'`）→ 當成 `'system'`
- [ ] `va-practice:data` 與 `DATA_VERSION` 一個字都沒改
- [ ] `npm run test` 與 `npm run typecheck` 全綠
