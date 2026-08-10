import './styles.css';
import { start } from './app';
import { isNative, restoreFromNative } from './lib/safety-copy-native';
import { loadNativeCloudStorage } from './lib/keychain-native';

// 讓瀏覽器不要因為長期未使用而清掉複習進度。
void navigator.storage?.persist?.();

const root = document.getElementById('app');
if (root) {
  if (isNative()) {
    // iOS 才多這一個非同步前置步驟，兩件事都非得在 start() 之前做完不可：
    // 還原必須早於 store.load()，它在 localStorage 空白時會自行初始化一份新資料，
    // 晚一步使用者就先看到一個空的 app；暱稱與密碼則要先從 Keychain 讀出來，
    // 雲端備份那一側才問得到「登入了沒」（它問的方式是同步的）。
    // 兩者互不相干，一起等即可。
    void Promise.all([restoreFromNative(localStorage), loadNativeCloudStorage()]).then(
      ([, cloudStorage]) => start(root, cloudStorage),
    );
  } else {
    // 網頁版的啟動路徑一步都不多，仍然是同步的；暱稱與密碼照舊存在 localStorage。
    start(root, localStorage);
  }
}
