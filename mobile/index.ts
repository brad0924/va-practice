// 這一行要留在最前面：`core/lib/storage.ts` 用得到 `crypto.randomUUID()`，
// 而 React Native 沒有那個全域函式。補丁要早於任何 `core/` 的程式碼被載入（見該檔）。
import './lib/install-random-uuid';

import { registerRootComponent } from 'expo';

import App from './App';

// Expo 的進入點。它包的是 `AppRegistry.registerComponent('main', () => App)`，
// 多做的事是把執行環境接好——不管這支 app 是被 development 版載入還是獨立版載入，
// 進到 `App` 的時候環境都一樣。自己寫 `AppRegistry` 那行的話要分兩種情況處理。
registerRootComponent(App);
