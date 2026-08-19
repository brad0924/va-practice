# 01 — 探路：App Attest 在 Capacitor 裡拿得到權杖，並打通一個 Firebase AI Logic 請求

Status: ready-for-human
Type: enhancement

決策背景見 `../spec.md`，本票對應決定四、五、六、七與「測試決定」。

**這張票的結果可能推翻決定四與五。在它回報之前，其餘所有票都不要動工。**

## 要做什麼

用最小的程式碼證明三件事在真機上成立：

1. 原生層向 Apple 取得 App Attest 憑證，換到 Firebase App Check 權杖。
2. WebView 裡的 JavaScript 透過 `CustomProvider` 拿得到那個權杖。
3. 帶著那個權杖，Firebase AI Logic 回得出一個結構化輸出的回覆。

**不動 `gemini-reading.ts`、不動資料畫面、不動任何既有行為。** 探路的程式碼可以醜、可以是一顆暫時的按鈕，驗完就拆。

## 為什麼要單獨一張票

App Attest 是 Apple 的原生 API，`DCAppAttestService` 在**模擬器上一律回不支援**。維護者的開發機是 Windows，沒有 Mac、沒有模擬器，唯一的驗證管道是跑 `ios-testflight.yml` 送一版上去、裝到 iPhone 上試。

也就是說這條路通不通，答案一次要等一輪 TestFlight。若等到功能、文案、隱私權政策、商店申報全部改完才發現卡住，退回去的東西太多。

`.scratch/ios-app/spec.md` 決定二十九的探路 build 就是這個模式。

## 前置設定（都在票內完成）

- 在現有的 Firebase 專案（雲端備份那一個）開啟 Firebase AI Logic，選 **Gemini Developer API**（不是 Vertex），確認專案留在 **Spark 免費方案**、不綁計費。
- 在 Firebase 主控台的 App Check 註冊這支 iOS app，provider 選 App Attest。
- 在 Apple Developer 的 App ID 上確認 App Attest capability 已開啟（Bundle ID `io.github.brad0924.vapractice`，Explicit App ID，見 `.scratch/ios-app/issues/01`）。
- 下載 `GoogleService-Info.plist` 放進 iOS 專案，**進版控**（決定七：那把是 Firebase 的公開設定金鑰，靠 App Check 與安全規則擋，不靠保密；CI 需要它）。
- 裝 `firebase` 與 `@capacitor-firebase/app-check`，跑 `npx cap sync ios`。

## 探路程式碼的形狀

```js
await FirebaseAppCheck.initialize();
const provider = new CustomProvider({ getToken: () => FirebaseAppCheck.getToken() });
await initializeAppCheck(getApp(), { provider });

const model = getGenerativeModel(getAI(getApp()), {
  model: 'gemini-3.6-flash',
  generationConfig: { responseMimeType: 'application/json', responseSchema: /* 隨便一個小 schema */ },
});
const result = await model.generateContent('測試');
```

## 要回報的發現

每一項都要有實測結果，不接受「應該可以」：

- `FirebaseAppCheck.initialize()` 在 Capacitor 8 的 iOS 殼上跑不跑得起來。Capacitor 8 用 SPM 不用 CocoaPods（`.scratch/ios-app/spec.md`「上架」段），這個外掛裝不裝得上是第一個要確認的。
- `getToken()` 在 TestFlight 安裝的 build 上回得出權杖嗎？**注意 TestFlight 與 App Store 的 build 走的憑證路徑可能與開發 build 不同**，這是必須實測的原因。
- Firebase AI Logic 的回覆是否真的通過 App Check 驗證（把 App Check 設成強制執行，然後確認未帶權杖的請求會被拒）。
- 結構化輸出：`Schema.*` 建構式能不能表達 `gemini-reading.ts` 現有的 `RESPONSE_SCHEMA` 形狀（陣列包物件、`required`、`propertyOrdering`）。
- iOS 產物實際大了多少（firebase SDK 進來之後）。
- 一次 TestFlight 往返實際花多久（決定後面幾票怎麼排）。

## 驗收

- 一支裝在真 iPhone 上的 TestFlight build，按下探路按鈕會顯示 Firebase AI Logic 回來的 JSON。
- App Check 設為強制執行的狀態下仍然成功。
- 上述每一項發現寫進本檔案的 `## Comments`。
- 網頁版行為零改動；`npm test` 全綠。
- 探路用的按鈕與程式碼在票 02 動工前移除（本票可以留著，由 02 清掉）。

## 走不通的話

回報後停下來，不要自行改走別條路。決定四的另外兩個選項（自己寫 Cloud Function、硬塞進 ipa）都各自牴觸別的決定，需要維護者重新拍板。
