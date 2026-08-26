// 這一行要留在最前面：`core/` 用得到 `crypto.subtle`、`crypto.randomUUID()` 與 `btoa()`，
// 而 React Native 一個都沒有。補丁要早於任何 `core/` 的程式碼被載入（見該檔）。
import './lib/install-crypto';

/**
 * `expo-router` 的進入點。它把 `app/` 整個目錄讀成路由表，然後做 `registerRootComponent`
 * 那一段——也就是這支檔以前自己做的事（票 `09` 之前是 `registerRootComponent(App)`）。
 *
 * **順序是這支檔存在的唯一理由。** `package.json` 的 `main` 大可以直接寫
 * `expo-router/entry`，但那樣補丁就沒有地方插在前面了：路由表一被讀進來，
 * `app/_layout.tsx` 會一路帶出 `core/` 的程式碼，而那時候 `crypto.subtle` 還不存在，
 * 載入當場就炸。這裡先補環境、再交給它。
 */
import 'expo-router/entry';
