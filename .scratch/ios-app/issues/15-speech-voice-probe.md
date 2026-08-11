# 15 — 朗讀跟著系統選的語音走，外加一支查語音的暫時探針

Status: ready-for-human
Type: enhancement
Blocked by: 07

票 07 出了 build 之後的真機回報：**在設定裡把日文語音切到 O-ren，app 裡聽起來沒有套用**，而且與網頁版比對聲音一樣。

## 現況

票 07 的 `SpeechPlugin.swift` 選語音的規則是「全清單挑 `quality` 最高的那一顆」，**完全沒有讀系統的語音偏好**。因此使用者在「朗讀內容」裡選誰，對這支 app 沒有任何影響——回報的現象在目前的寫法下是必然的，不是壞掉。

但另外三件事是真的不知道，而且**在沒有 Mac 的情況下無從得知**（開發機是 Windows，看不到 Safari 除錯器）：

1. 這支手機上到底有哪幾顆日文語音、各是什麼品質？
2. `AVSpeechSynthesisVoice(language:)` 拿到的「系統預設那顆」，是不是就是使用者在設定裡選的那顆？**公開 API 沒有一支是「讀出使用者選的朗讀語音」**，這只能實測。
3. O-ren 到底拿不拿得到？**強烈懷疑拿不到**——O-ren 與 Hattori 是 Siri 的日文語音，而 Siri 那批語音第三方 app 取不到。若屬實，那不管規則怎麼改都選不到它。

第 3 點若成立，這張票的規則改動對「聽到 O-ren」這件事是無效的——但探針會給出答案，而不是繼續猜。

## 決定

### 一、選語音改成「系統預設優先，同一顆取品質最好的版本」

先問 `AVSpeechSynthesisVoice(language: "ja-JP")` 系統預設是誰，再在清單裡找**同名**的、品質最高的那一版（同一顆語音常有 compact 與 enhanced 兩個版本）。系統預設拿不到時，才退回票 07 的「全清單品質最高」。

**代價據實記錄**：使用者選的那顆若只有 compact，而別顆有 enhanced，新規則會挑前者——音質不是最好的。這是「尊重使用者的選擇」必然要付的錢，使用者想要更好可以自己去下載增強版。不為此加例外（例如「品質差太多就不跟隨」），那種規則沒有人說得清界線在哪。

**風險**：若實測發現 `AVSpeechSynthesisVoice(language:)` 根本不反映使用者的選擇，這條規則等於白改，甚至可能挑到比票 07 更差的一顆。探針與規則同一個 build 出去，正是為了一次看清楚再決定要不要留。

### 二、一支暫時的探針：把語音清單印在畫面上

**這不是功能，是鷹架**，照票 13 的做法與立場：

- 在「資料」畫面加一顆按鈕，按下去把原生那端看到的東西印成一塊文字，可以直接截圖
- 印四樣：**清單裡每一顆日文語音的名字與品質**、**系統預設是誰**、**程式實際挑到誰**、**手機的當前語言**
- **只在 iOS 出現**，網頁版一個像素都不變
- 平台判斷會短暫地出現在畫面層，違反本 repo 的立場——**明知故犯，因為它要被拆掉**；包成正式接縫反而會讓人忘記拆

### 三、報告的文字由原生那端組好

探針是丟棄品，格式化塞在哪一層不值得爭。原生那端直接回一個字串，TypeScript 只負責顯示，是這兩者之間最少的程式碼。

## 這張票不做的事

- 不改 `src/ui/review-view.ts`
- 不改網頁版的任何行為
- 不加語音或語速的設定畫面——「跟著系統走」正是為了不必自己做一套設定
- 不碰 `AVAudioSession`（靜音鍵的事是另一件事，票 07 已記錄）
- 不為原生那端補自動測試，理由同票 07

## 怎麼用

1. 出一個帶探針的 build，裝到 iPhone
2. 在「資料」畫面按「語音診斷」，截圖
3. 對照結果決定下一步：

   | 看到什麼 | 意思 |
   | --- | --- |
   | 清單裡有 enhanced／premium，且被挑到 | 規則是對的，音質該有差別，A／B 比對可以收尾 |
   | 清單裡全是 compact | 音質一樣是正常的，差的是語音檔沒下載 |
   | 清單裡根本沒有 O-ren | 證實它是 Siri 專用，第三方 app 取不到，這條路要放棄 |
   | 系統預設 ≠ 使用者在設定裡選的那顆 | 「跟著系統走」做不到，決定一要退回票 07 的規則 |

4. 驗完再發一次 build 把探針拆掉

## 驗收

- [ ] iPhone 的「資料」畫面出現「語音診斷」按鈕，按下去印出四樣資訊
- [ ] 網頁版看不到這顆按鈕，行為與本票之前一字不差
- [ ] 朗讀改為跟著系統預設的日文語音走
- [ ] 既有測試全數通過，且一個既有測試檔都沒被修改
- [ ] **診斷結果寫進本票的 `## Comments`，並回填票 07 的驗收**
- [ ] **鷹架已拆除**（這一條要等驗完才勾得掉，也是本票結案的條件）

## Comments

### 2026-08-11 — 落地的東西

| 檔案 | 是什麼 |
| --- | --- |
| `ios/App/App/SpeechPlugin.swift` | 選語音的規則改成系統預設優先；多一支 `describeVoices` 回報告字串（鷹架） |
| `src/lib/speech-native.ts` | 多一支 `describeNativeVoices()`（鷹架），失敗時把錯誤原文交回去顯示 |
| `src/ui/data-view.ts` | 「語音診斷（暫時）」那一區（鷹架），只在 iOS 出現 |

順手改掉的一件事：票 07 把挑到的語音存在 `lazy var` 裡，**只在 app 啟動時挑一次**。改成每次朗讀重挑——這一趟只是過濾十幾筆的陣列，省下的時間不值得換來「換了設定要重開 app 才生效」這個解釋不清的行為。使用者本來就會在 app 開著的時候去設定裡換語音。

### 本機驗到哪裡

| 驗的東西 | 怎麼驗的 | 結果 |
| --- | --- | --- |
| 全部測試 | `npm test` | ✅ 391 過（18 檔） |
| 既有測試零修改 | `git status` | ✅ 測試檔一個都沒動 |
| typecheck | `tsc --noEmit` | ✅ 乾淨 |
| 網頁版與 iOS build | `npm run build`、`npm run build:ios` | ✅ 兩個都過 |
| `cap sync ios` | 實跑 | ✅ exit 0 |

網頁版 bundle 從 56.90 kB 變成 57.35 kB——鷹架的程式碼跟著進了 bundle，但 `isNative()` 恆為 false，那一區永遠不會出現。拆掉後大小會回去，與票 13 同一個處理方式。

Swift 那一半照樣一行都沒被執行過。

### 維護者待辦

1. push 後手動觸發 `Build iOS and upload to TestFlight`
2. 「資料」畫面按「語音診斷」，截圖回報
3. 依上方「怎麼用」的表格判斷下一步，結果寫回本票與票 07
4. 驗完發一次 build 拆掉鷹架（三個檔案都要）

### 2026-08-11 — 診斷結果：兩個猜測都錯了，而且解釋了「聽起來一樣」

真機按下「語音診斷」印出來的：

```
當前語言：cmn-TW
系統預設：O-ren (Enhanced)／enhanced 增強／ja-JP／com.apple.ttsbundle.siri_O-ren_ja-JP_premium
實際挑到：O-ren (Enhanced)／enhanced 增強／ja-JP／com.apple.ttsbundle.siri_O-ren_ja-JP_premium
清單共 11 顆日文語音：
・Kyoko (Enhanced)／enhanced 增強／ja-JP／com.apple.voice.enhanced.ja-JP.Kyoko
・Kyoko／compact 壓縮／ja-JP／com.apple.voice.compact.ja-JP.Kyoko
・Eddy／Flo／Grandma／Grandpa／Reed／Rocko／Sandy／Shelley（8 顆 eloquence，全 compact）
・O-ren (Enhanced)／enhanced 增強／ja-JP／com.apple.ttsbundle.siri_O-ren_ja-JP_premium
```

#### 本票「現況」裡的三個未知，全部有答案了

1. **O-ren 拿得到。** 本票寫「強烈懷疑拿不到——Siri 那批第三方 app 取不到」，**猜錯了**。它就在清單裡，identifier 是 `com.apple.ttsbundle.siri_O-ren_ja-JP_premium`，而且被挑到了。
2. **`AVSpeechSynthesisVoice(language:)` 確實反映使用者的選擇。** 使用者在設定裡選 O-ren，系統預設回的就是 O-ren。決定一的那個「建在未經證實的假設上」的風險**沒有發生**，規則可以留下。
3. **這支手機有 enhanced，沒有 premium。** 兩顆 enhanced（Kyoko、O-ren），其餘九顆全是 compact。

#### 順帶解釋了票 07 那個「聽起來一樣」

票 07 的規則是「全清單品質最高」，同分時 Swift 的 `max(by:)` 保留**先出現**的那個——依上面的清單順序，票 07 的 build 挑到的是 **Kyoko (Enhanced)**。

而網頁版的 `speech.ts` 挑的是「清單裡第一顆 `ja` 開頭的語音」，在同一支手機上**極可能也是 Kyoko (Enhanced)**。兩邊同一顆語音，聲音當然一樣——回報的現象因此完全說得通，不是任何一端壞掉。

這也是本票的規則改動帶來的實質差別：**現在挑的是 O-ren，與網頁版不再是同一顆**。A／B 比對要重做一次才算數。

#### 還沒收掉的一條

「音質明顯比 Web Speech 自然」（票 07 驗收）仍待重驗。若重比之後**還是一樣**，那要懷疑的就不是實作，而是 spec 決定十五的前提本身——屆時可以再加一段探針，把 Web Speech 那側 `speechSynthesis.getVoices()` 看到的清單也印出來，直接比對兩邊挑到的是不是同一顆。
