/**
 * 在**真的裝置上**跑一遍雲端備份的標答表（票 `05`）。
 *
 * 這是整張票唯一驗得到真正風險的一段。`core/lib/cloud-crypto-vectors.test.ts` 跑在 Node 上，
 * 用的是 Node 內建的加解密；只有這裡跑的是 `react-native-quick-crypto`，也就是使用者手機上
 * 真正在加密備份的那一份。**兩者對不上的話，電腦存的備份手機解不開，反過來也一樣，
 * 而且不會當場報錯**——存的時候一切正常，某天想還原才發現打不開。
 *
 * **只有 CI 會叫它。** 觸發的方式是一個檔案：`mobile-crypto.yml` 裝好 app、開起來之前，
 * 往 app 文件夾塞一個 `TRIGGER_FILE`；app 開機同步問一句「在不在」，在才跑。
 * 使用者手上那台永遠沒有那個檔，於是永遠不跑——票 `13` 之前是每個人開 app 都跑一遍，
 * 而那是 CI 需求的副作用，從來沒有人決定過要讓使用者跑。
 *
 * FAIL 的唯一去處是 CI 紅燈（`mobile-crypto.yml` 最後那行 `grep -q ' PASS '`）。
 * app 裡不留任何顯示——使用者那台根本跑不到它。
 */
import { File, Paths } from 'expo-file-system';
import { checkAllVectors, type VectorCheck } from '@core/lib/cloud-crypto-vectors';

/** 這一行的開頭。日誌裡找得到它，CI 判定也是拿它當「結論寫完了」的訊號。 */
export const MARKER = '[crypto-vectors]';

/**
 * 結論寫進 app 文件夾底下這個檔，CI 從模擬器把它撈出來。
 *
 * **為什麼不叫 CI 去日誌裡撈那一行**：日誌串流會把系統訊息插在中間、Release 版對
 * `console.log` 的處理又跟 Debug 版不一樣，撈得到撈不到要真的跑一次才知道。
 * 檔案沒有這些不確定：寫進去就在那裡，`xcrun simctl get_app_container` 指得到那個目錄。
 * 檔名見 `.github/workflows/mobile-crypto.yml`，兩邊要一致。
 */
export const RESULT_FILE = 'crypto-vectors.txt';

/**
 * CI 塞這個檔，就代表「這一趟要跑標答」。**使用者那台永遠不會有它。**
 *
 * 與結論檔刻意放同一個目錄：CI 已經靠 `xcrun simctl get_app_container … data` 指到那裡了，
 * 多一個目錄就多一個會對不上的地方。檔名見 `.github/workflows/mobile-crypto.yml`
 * 的 `TRIGGER_FILE`，兩邊要一致。
 *
 * 為什麼是檔案，而不是建置時的旗標或一條專用網址：走檔案這條路，CI 開的就是**使用者
 * 會拿到的那個 `.app`，一個位元組不差**。旗標那條會削出一份特製版，CI 從此測的不是
 * 使用者手上那一份；網址那條擋不住知道網址的人。決策紀錄在票 `13` 的 triage。
 */
export const TRIGGER_FILE = 'run-crypto-vectors';

/**
 * 這一趟要不要跑標答？
 *
 * **同步的。** `expo-file-system` 的 `exists` 是布林值不是 Promise，因此這一句擺得進
 * 開機路徑上而不必先進非同步區——使用者那台問完就走，一件事都沒有發生。
 *
 * 問不出來（原生那一半沒接上、目錄沒有讀取權）就當成「不跑」。使用者那邊本來就該不跑；
 * CI 那邊則會在等結論檔那一步超時紅燈，不會靜悄悄地變成綠的。
 */
export function isSelfCheckRequested(): boolean {
  try {
    return new File(Paths.document, TRIGGER_FILE).exists;
  } catch {
    return false;
  }
}

export interface SelfCheckReport {
  /** 少掉的全域函式，一個一句。空的代表環境補齊了。 */
  missing: string[];
  results: VectorCheck[];
  passed: boolean;
  /** 一行講完的結論，CI 撈的就是它。 */
  summary: string;
}

/** `core/` 要用到、而這個執行環境不見得有的那幾樣，逐一點名。補齊的話交回空陣列。 */
function findMissing(): string[] {
  const runtime = globalThis as unknown as {
    crypto?: { subtle?: unknown; getRandomValues?: unknown; randomUUID?: unknown };
    btoa?: unknown;
    atob?: unknown;
  };
  const missing: string[] = [];
  if (typeof runtime.crypto?.subtle !== 'object') missing.push('crypto.subtle');
  if (typeof runtime.crypto?.getRandomValues !== 'function') missing.push('crypto.getRandomValues');
  if (typeof runtime.crypto?.randomUUID !== 'function') missing.push('crypto.randomUUID');
  if (typeof runtime.btoa !== 'function') missing.push('btoa');
  if (typeof runtime.atob !== 'function') missing.push('atob');
  return missing;
}

/**
 * 先問環境齊不齊，再跑標答。
 *
 * 順序有意義：`crypto.subtle` 沒接上的話，每一列標答都會用同一個看不懂的錯掛掉，
 * 那時看到的是六行雜訊而不是「quick-crypto 沒裝起來」這一句。
 */
export async function runCryptoSelfCheck(): Promise<SelfCheckReport> {
  const missing = findMissing();
  if (missing.length > 0) {
    return {
      missing,
      results: [],
      passed: false,
      summary: `FAIL 執行環境缺了 ${missing.join('、')}`,
    };
  }

  let results: VectorCheck[];
  try {
    results = await checkAllVectors();
  } catch (error) {
    // 整批掛掉（例如 4 MB 那筆把記憶體吃爆）也要說得出話，不能只留一片空白。
    return {
      missing,
      results: [],
      passed: false,
      summary: `FAIL 整批中斷：${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const failed = results.filter((result) => !result.passed);
  return {
    missing,
    results,
    passed: failed.length === 0,
    summary:
      failed.length === 0
        ? `PASS ${results.length}/${results.length}`
        : `FAIL ${failed.length}/${results.length}｜`
          + failed.map((result) => `${result.name}: ${result.failures.join('；')}`).join('｜'),
  };
}

/**
 * 跑一遍，結論同時送去兩個地方：日誌與檔案。
 *
 * 兩份是給兩種讀者的。日誌給接著 Metro 開發的人看；檔案給 CI 讀，判定就是讀它。
 * **寫檔失敗不能拖垮整支 app**——這塊自我檢查是探針，不是使用者要用的功能，
 * 為了寫不出一個檔而讓畫面掛掉，等於用一個小問題蓋掉它本來要回報的大問題。
 */
export async function reportCryptoSelfCheck(): Promise<SelfCheckReport> {
  const report = await runCryptoSelfCheck();
  const line = `${MARKER} ${report.summary}`;
  console.log(line);

  try {
    const file = new File(Paths.document, RESULT_FILE);
    file.create({ overwrite: true });
    file.write(`${line}\n`);
  } catch (error) {
    console.log(`${MARKER} 結論寫不進檔案：${error instanceof Error ? error.message : String(error)}`);
  }

  return report;
}
