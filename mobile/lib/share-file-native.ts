/**
 * 把一份檔案交給使用者：寫進暫存檔，再叫出系統的分享單（票 `18`）。
 *
 * 做法與 Capacitor 版 `src/lib/download-native.ts` 一致——**iOS 上沒有「下載」這回事**，
 * 存到「檔案」、AirDrop、傳給自己都經過同一張分享單。這裡換的只是套件：
 * `@capacitor/filesystem` + `@capacitor/share` 換成 `expo-file-system` + `expo-sharing`。
 *
 * **比 Capacitor 那份少一段。** 那邊要自己認「使用者把分享單滑掉了」——插件在取消時
 * 丟一句沒有錯誤代碼的訊息，只能看字串比對（該檔的 `isCancelled()`）。`expo-sharing`
 * 不必：它的 `completionWithItemsHandler` 一律 resolve，取消與完成都走成功那條路
 * （見 `node_modules/expo-sharing/ios/SharingModule.swift` 裡那段註解）。
 * 滑掉分享單本來就是正常操作，這裡因此**沒有任何「取消」的分支**。
 *
 * **`app.json` 沒有列 `expo-sharing` 這個外掛**，那不是漏掉的。`npx expo install` 會順手
 * 加上它，但它管的是**收**別的 app 分享過來的東西（一個 share extension 目標），
 * 而且 `props.ios.enabled` 預設是 `false`、不給就整支不做事
 * （見 `node_modules/expo-sharing/plugin/build/withShareExtension.js` 第一行的判斷）。
 * 這支 app 只往外送，留著那一行會讓人以為它收得到分享。原生模組本身靠 autolinking 接，
 * 與這個外掛無關。
 *
 * 本模組不寫自動測試：兩個套件底下都是原生的，在 Node 裡造一整套假物件只會測到自己寫的
 * 假貨——與 `./keychain-native.ts`、`./gemini-reading-native.ts` 同一個立場，
 * 行為由真機驗收守住。
 */
import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';

/**
 * 寫一份暫存檔並叫出分享單。內容與檔名一字不改地沿用網頁版那一份。
 *
 * 檔案落在**快取目錄**：它只是遞給分享單的中繼站，使用者要留哪一份由分享單決定，
 * 這一份系統存量吃緊時清掉也無所謂。`overwrite` 要開——同一天匯出第二次時檔名會撞號，
 * 不開的話 `create()` 當場丟例外。
 *
 * **只給 `UTI`，不給 `mimeType`**：iOS 認的是前者，後者按官方文件是 Android 專用的
 * （https://docs.expo.dev/versions/v57.0.0/sdk/sharing/），而這支 app 只出 iOS。
 * 少了 `UTI`，分享單會把這份 JSON 當成無類型的檔案，收得下它的 app 少一半。
 *
 * 沒有先問 `isAvailableAsync()`：文件建議問，理由是網頁那一端支援有限。
 * 這支 app 只出 iOS，那一問在這裡永遠是 true。
 */
export async function shareFileNative(content: string, filename: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  await shareAsync(file.uri, { UTI: 'public.json' });
}
