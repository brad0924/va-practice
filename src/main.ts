import './styles.css';
import { start } from './app';
import { isNative, restoreFromNative } from './lib/safety-copy-native';

// 讓瀏覽器不要因為長期未使用而清掉複習進度。
void navigator.storage?.persist?.();

const root = document.getElementById('app');
if (root) {
  if (isNative()) {
    // iOS 才多這一個非同步前置步驟：還原必須早於 store.load()，
    // 它在 localStorage 空白時會自行初始化一份新資料，晚一步使用者就先看到一個空的 app。
    void restoreFromNative(localStorage).then(() => start(root));
  } else {
    // 網頁版的啟動路徑一步都不多，仍然是同步的。
    start(root);
  }
}
