# 03 — 模型名字與提示詞搬上 Remote Config

Status: ready-for-human
Type: enhancement
Blocked by: 02

決策背景見 `../spec.md`，本票對應決定十五。

## 要做什麼

把 `gemini-reading.ts` 裡兩個寫死的東西改成從 Firebase Remote Config 讀：

- 模型名字（現在是 `gemini-3.6-flash`）
- `INSTRUCTIONS` 那一整段給 Gemini 的指令

程式碼裡仍然留一份預設值，Remote Config 抓不到時用它。

**只有 iOS build 走這條路。** 網頁版沒有 Firebase SDK，繼續用寫死的值。

## 為什麼

固定金鑰把「模型下架」的修復成本從幾分鐘拉到幾天。

`ADR-0005` 記錄過一次真實事故：`gemini-2.5-flash` 對新申請的金鑰回 404「no longer available to new users」，而且 ListModels 型錄查得到、卻叫不動，只有實際呼叫才知道。

- 在自備金鑰的設計下：零星使用者踩到，改個字串 push 上去，GitHub Pages 幾分鐘上線。
- 在固定金鑰加 iOS 的設計下：**所有使用者同時停擺**，而他們沒有自救途徑（決定二），維護者要重新打包、送審、等一到兩天，還可能被退件。

`INSTRUCTIONS` 一起搬的邊際成本幾乎是零（同一個 SDK、同一次抓取），而 `ADR-0005` 記錄過那段判準實際改過兩次（吹雪、剃刀）——讀音判準出包也不必送審。

## 這不牴觸 ADR-0005 拒絕 `-latest` 別名那一條

該決定拒絕的原話是「模型在腳下換人的話，同一個詞的讀音會**無預警**改答案，寫死才知道自己在跟誰講話」。

差別在方向盤在誰手上：`-latest` 是 Google 想換就換、你不知道；Remote Config 是維護者自己按發布才換，知道換成什麼、什麼時候換。它拒絕的是無預警，不是可以換。

## 決定

### 參數命名

兩個參數，名字要一眼看得出管什麼：

```
gemini_model         = gemini-3.6-flash
gemini_instructions  = （現在 INSTRUCTIONS 那一整段）
```

### 預設值寫在程式碼裡

Web 平台的 Remote Config 不能用設定檔帶預設值，只能在程式碼裡設。所以 `gemini-3.6-flash` 這個字串不會消失，身分從「唯一答案」變成「連不上時的後備」。

**預設值就用網頁版共用的那一份**，不要維護兩套會漂移的字串。

### 抓取間隔明確設定，不吃預設

JS SDK 預設 12 小時、Capacitor 外掛預設 1 小時。這個功能的重點是「出事時快點救得回來」，因此明確設定間隔，不依賴預設值。實際數字在實作時決定並寫進註解，說明為什麼是那個數字。

**要記錄的事實**：這不是「立刻生效」。改完要等下一次抓取。實務上仍是「幾小時」對上「送審一到兩天」。

### 抓取失敗不影響任何事

Remote Config 連不上時直接用預設值，不重試、不出提示、不擋住讀音預填。它是保險，不是前置條件。

## 驗收

- iOS build 上，在 Firebase 主控台把 `gemini_model` 改成一個不存在的模型名並發布，等過抓取間隔後，讀音預填開始失敗——證明那個值真的被讀到了。改回來後恢復。
- 把 `gemini_instructions` 改一個字（例如在規則後面多加一句），確認送出去的提示詞真的變了。
- 飛航模式下全新安裝、開啟 app，Remote Config 抓不到，讀音預填仍用預設模型正常運作（有網路後）。
- 網頁版產物完全不受影響，`npm run build` 產物裡沒有 Remote Config 相關程式碼。
- `npm test` 全綠。
