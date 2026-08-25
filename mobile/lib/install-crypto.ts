/**
 * 把 `core/` 需要的那幾個密碼學全域函式補進 React Native 的執行環境。
 * **要在任何 `core/` 的程式碼被載入之前跑**，因此接在 `index.ts` 的第一行。
 *
 * 瀏覽器裡這些東西是免費附贈的，React Native 沒有。缺的有三樣：
 *
 * | 缺的 | 誰用它 | 這裡怎麼補 |
 * | --- | --- | --- |
 * | `crypto.subtle` | `core/lib/cloud-crypto.ts` 的整套加解密 | `react-native-quick-crypto` |
 * | `crypto.randomUUID()` | `core/lib/storage.ts` 三處 | quick-crypto 自帶；沒有才退回 `expo-crypto` |
 * | `btoa()` / `atob()` | `cloud-crypto.ts` 的 base64 換算 | Hermes 若有就用它的；沒有才退回 `react-native-quick-base64` |
 *
 * **三件事的順序不能換。** quick-crypto 的 `install()` 是整個換掉 `global.crypto` 這個物件，
 * 先補的東西會被它連盤端走；所以它排第一，後面兩項再往上補缺的。
 *
 * **自動測試看不到這一支。** jest 跑在 Node 上，Node 自己就有 `crypto.subtle`、
 * `randomUUID`、`btoa`——少了這個檔測試照樣全綠，手機上才會爆。守門的是
 * `crypto-self-check.ts` 那塊自我檢查方塊，它在真的裝置上跑。
 */
import { randomUUID } from 'expo-crypto';
import { fromByteArray, toByteArray } from 'react-native-quick-base64';
import { install } from 'react-native-quick-crypto';

/** 執行環境那個全域物件。TypeScript 的型別裡沒有這幾格，所以自己描述一次。 */
const runtime = globalThis as unknown as {
  crypto?: { randomUUID?: () => string };
  btoa?: (binary: string) => string;
  atob?: (base64: string) => string;
};

// 一、整套 `crypto` 換成 quick-crypto。這一步同時帶進 `subtle`、`getRandomValues`
//     與它自己那份 `randomUUID`。
install();

// 二、`randomUUID` 缺了才補。quick-crypto 有自己的一份，正常情況下這一行不會做事；
//     留著是為了萬一哪天它把那個函式拿掉，儲存那條路不會無聲無息地斷掉。
if (runtime.crypto === undefined) runtime.crypto = {};
if (typeof runtime.crypto.randomUUID !== 'function') runtime.crypto.randomUUID = randomUUID;

// 三、base64。Hermes 有沒有內建 `btoa`/`atob` 各版本不一樣，而 `cloud-crypto.ts` 直接叫它們。
//     有就用現成的，沒有才拿 quick-base64 頂上——那是 C++ 寫的，比自己用迴圈接字串快得多。
//     `String.fromCharCode` 一次餵太多參數會爆堆疊，所以分段餵。
const CHUNK = 8192;

if (typeof runtime.btoa !== 'function') {
  runtime.btoa = (binary) => {
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return fromByteArray(bytes);
  };
}

if (typeof runtime.atob !== 'function') {
  runtime.atob = (base64) => {
    const bytes = toByteArray(base64);
    let binary = '';
    for (let at = 0; at < bytes.length; at += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
    }
    return binary;
  };
}
