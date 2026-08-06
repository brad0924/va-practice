# 01 — 佇列重建保留目前這張卡：規則抽進 review.ts

Status: ready-for-agent
Type: enhancement

## 現況

`app.ts:146` 的 `applyData()` 在複習範圍內的卡片集合變動時，整個丟掉重建：

```ts
const before = cardsInBooks(data.cards, data.scopes.review);
data = next;
const after = cardsInBooks(data.cards, data.scopes.review);
if (!sameCards(before, after)) {
  queue = buildQueue(after, now(), random);
  revealed = false;
}
```

`buildQueue()`（`review.ts:93`）會把整批到期卡重新洗牌，因此**正在看的那張卡即使仍在範圍內，也會被換掉**，已掀開的答案一併蓋回去。

現行的兩個觸發點都會踩到：

| 觸發 | 現在的結果 |
|---|---|
| 資料頁改複習範圍（`books-section.ts:105`） | 目前這張被換掉 |
| 刪掉一本**與目前這張無關**的單字本（`books-section.ts:146`） | 目前這張也被換掉 |

第二條是現存的小獵：刪的是別本，正在複習的那張卻跟著飛了。

另外，這條規則住在 `app.ts`，而**`app.ts` 沒有任何測試檔**（`src/` 底下沒有 `app.test.ts`）。它綁著 `localStorage`、`fetch`、DOM，要就地測得先搭一堆替身。

## 決定

### 新增 `rebuildQueue()`，住在 `review.ts`

`review.ts` 開頭第一句註解就寫著「排程演算法、抖動、佇列排序、『再次』重排全部收在這裡」。這條也是佇列排序規則，歸它。

```ts
/**
 * 換一批卡之後的佇列。正在看的那張若仍然到期，就留在最前面，
 * 其餘照常洗牌——換單字本範圍時不打斷手上這張。
 */
export function rebuildQueue(
  cards: readonly Card[],
  current: Card | undefined,
  now: Date,
  random: () => number,
): Queue
```

實作就是 `buildQueue()` 之後把 `current` 挪到隊首：

```ts
const rebuilt = buildQueue(cards, now, random);
const kept = current && rebuilt.find((card) => card.id === current.id);
if (!kept) return rebuilt;
return [kept, ...rebuilt.filter((card) => card.id !== current.id)];
```

**回傳的是 `rebuilt` 裡那一份，不是傳進來的 `current`。** 傳進來的可能是舊資料裡的那張（例如同一輪裡卡片被別的地方改過），以新的為準。

### `applyData()` 改用它

```ts
const before = cardsInBooks(data.cards, data.scopes.review);
const current = currentCard(queue);
data = next;
const after = cardsInBooks(data.cards, data.scopes.review);
if (!sameCards(before, after)) {
  queue = rebuildQueue(after, current, now(), random);
  // 換掉的時候才蓋回答案；留住的那張要連掀開狀態一起留住。
  if (currentCard(queue)?.id !== current?.id) revealed = false;
}
```

`revealed` 的重設條件從「有重建就蓋回去」收窄成「隊首真的換人了才蓋回去」。

### 這條規則對所有入口一律適用

不分是誰呼叫 `applyData()`。四個現行呼叫端（資料頁改範圍、刪本、列表範圍、統計範圍）加上 `03` 要新增的複習頁下拉，走的是同一條。刻意**不**替複習頁開特例——同一個設定從兩個地方改，結果必須一樣。

順帶修掉上面那個小獵：刪掉一本無關的單字本，正在看的那張現在會留著。

### `buildQueue()` 不動

它仍然是「從零建一份今日佇列」那支，開 app、匯入備份、雲端拉下來三條路（`app.ts:66`、`app.ts:213`）繼續用它。`rebuildQueue()` 是它的外包一層，不是取代。

## 這張票不做的事

- **不動任何畫面。** 複習頁的下拉是 `03`，這張票跑完使用者看不出差別（除了刪別本時目前這張會留著）。
- **不建 `app.test.ts`。** 規則搬去 `review.ts` 之後 `applyData()` 只剩接線，不值得為它搭替身。
- **不動 `sameCards()`** 的判斷（順序不算、只比 id 集合）。
- **不碰「再次」重排**（`reinsert`）。評為「再次」的卡到期日是當天（`review.ts:133`），重建時仍然到期、會自己回到佇列裡，不需要額外處理。

## 被放棄的替代方案

- **規則直接寫在 `applyData()` 裡**：改動最少，就地多幾行。否決的原因是這條排程規則會沒有測試保護，而且 `review.ts` 那句「佇列排序全部收在這裡」就不再成立。
- **規則留在 `applyData()`，另建 `app.test.ts`**：規則不搬家。否決的原因是 `app.ts` 綁著 `localStorage`、`fetch`、DOM，測得先搭一堆替身，成本遠高於抽一支純函式。
- **只給複習頁那顆下拉用，資料頁維持全部重洗**：改動範圍最小。否決的原因是同一個設定（複習範圍）從兩個入口改會有兩種結果，而且 `applyData()` 得多一個參數或多一支分身，還要在註解裡解釋為什麼不一致。
- **切換範圍前先跳確認視窗**：避免誤觸。否決的原因是使用者是自己主動去點那顆下拉的，不是意外。
- **完全不重建，切換只影響下次開 app**：零風險。否決的原因是使用者要的就是「現在就換一本練」。

## 驗收

`npm test` 全綠、`npm run typecheck` 過。

**`src/lib/review.test.ts` 新增（`rebuildQueue`）**

- `current` 仍在新的卡片集合裡且到期 → 回傳的第一張就是它
- `current` 仍在最前面時，**回傳的是新集合裡那一份**（用同 id 但內容不同的兩張卡驗，拿到的是新的）
- `current` 不在新的卡片集合裡（那本被取消勾選或被刪）→ 照常重建，第一張不是它
- `current` 在集合裡但**已不到期**（到期日在未來）→ 被 `buildQueue` 濾掉，照常重建，它不在結果裡
- `current` 為 `undefined`（原本佇列是空的）→ 結果與 `buildQueue` 完全一致
- 新集合為空 → 回傳空佇列
- 除了隊首那張，其餘卡片仍然經過洗牌（注入固定的 `random`，驗結果與 `buildQueue` 同一組輸入的相對順序一致）
- `current` 沒有出現兩次（回傳的 id 不重複）

**手動驗收**

- 資料頁把某一本取消勾選、回複習畫面 → 若正在看的那張屬於**還留著**的本，它仍在最前面、答案還掀著
- 資料頁把正在看的那張所屬的本取消勾選、回複習畫面 → 換成別張、答案蓋回去
- 刪掉一本**與正在看的那張無關**的單字本 → 正在看的那張留著（這是本票新修的行為）
- 刪掉正在看的那張所屬的本 → 換成別張
- 卡片列表、統計頁改自己那組範圍 → 複習佇列完全不受影響（`sameCards()` 擋掉，本來就不重建）
