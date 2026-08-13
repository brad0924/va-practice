# 02 — i18n 機制：翻譯檔、查表函式、語言決定與保存

Status: done
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

- [x] `src/i18n/` 四個檔存在（zh-Hant、en、ja、index），`t()` 可以取出 `zh-Hant` 的字串
- [x] 故意在 `en.ts` 刪掉一條 key → `npm run typecheck` 紅燈
- [x] `va-practice:lang` 設成 `'ja'` → `t()` 回日文那份
- [x] `va-practice:lang` 不存在、`navigator.language` 是 `zh-CN` → 回繁體中文那份
- [x] `va-practice:lang` 不存在、`navigator.language` 是 `de-DE` → 回英文那份
- [x] `va-practice:lang` 存了不認得的值（如 `'ko'`）→ 當成 `'system'`
- [x] `va-practice:data` 與 `DATA_VERSION` 一個字都沒改
- [x] `npm run test` 與 `npm run typecheck` 全綠

## Comments

**`zh-Hant.ts` 沒有加 `as const`，與票面示意碼不同。** 上面「漏譯交給型別」那兩段
示意碼不能同時成立：`as const` 會讓**值**也變成字面型別，`en.ts` 那句
`const en: typeof zhHant` 於是要求填一模一樣的中文才編得過，守門反而失效。

留下的是 `typeof zhHant` 那一半（做守門的是它），拿掉 `as const`。key 在物件字面值上
本來就是字面型別，`Key = keyof typeof zhHant` 不受影響。實測漏一條與多一條都紅燈。

**`t()` 這輪就吃參數**（`t('books.nameTaken', { name })`）。票 03 的「帶變數的字串用參數」
與票 05 的 `t(error.key, error.params)` 都已經釘死這個形狀，不是臆測性功能。

**還沒 `initI18n()` 就呼叫 `t()` 會丟例外。** 這是接線錯誤不是使用者的錯，而且必然重現
（那支檔案一被載入就一定丟），溜不到使用者手上。最可能踩到的是把 `t()` 寫進
module-level 常數——票 03 搬 `list-view.ts:183` 的 `BUCKETS` 時會第一個踩到，
那六個標籤要改成渲染時才算。

**`app.setLang()` 這條接線本輪就做了**（`app.ts`），內部呼叫 i18n 的 `setLang()` 再叫
現成的 `render()`。票 04 只要把 `<select>` 的 change 事件接上去。它目前沒有呼叫者。

`lang()` 一併開出來給票 04 問「該打勾在哪一列」。

### code review 後的修正

**`in` 換成 `Object.hasOwn`（真的有洞）。** 原本 `saved in TABLES` 會走原型鏈，
`va-practice:lang` 被塞成 `constructor`、`toString`、`__proto__` 會被當成合法語言，
接著查表回 `undefined`——型別卻宣告是 `string`。牴觸上面「讀到不認得的值一律當
`'system'`」那條。已補三個案例的測試。

**`en.ts` 的譯名改照 `docs/glossary.md`**：單字本的英文欄是 `Vocabulary Book`，
原本寫 `Add book`。這兩條是票 03／06 抄寫的樣板，現在就要對。

**`lang()` 也走 `requireDevice()`**，與 `t()`、`setLang()` 一致——接上之前什麼都別問。

**沒有採納的一條**：`t()` 每次呼叫都重算 `fromSystem()`（一次 `split('-')`），
review 建議在 init／setLang 時算好存一份。不改的理由是那會多出第三份要保持同步的
可變狀態，換到的是一個量測不出來的差別。

**接線的覆蓋落在票 04**：`src/` 沒有 `app.test.ts`，`app.setLang()` 這 4 行到票 04
之前是零覆蓋的死碼。票 04 驗收已有「選了語言之後當前畫面立刻變，不用重開」，
那條會驗到它，因此這裡不另外加測試。
