import './styles.css';
import { start } from './app';

// 讓瀏覽器不要因為長期未使用而清掉複習進度。
void navigator.storage?.persist?.();

const root = document.getElementById('app');
if (root) {
  start(root);
}
