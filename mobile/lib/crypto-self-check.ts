/**
 * 在**真的裝置上**跑一遍雲端備份的標答表（票 `05`）。
 *
 * 這是整張票唯一驗得到真正風險的一段。`core/lib/cloud-crypto-vectors.test.ts` 跑在 Node 上，
 * 用的是 Node 內建的加解密；只有這裡跑的是 `react-native-quick-crypto`，也就是使用者手機上
 * 真正在加密備份的那一份。**兩者對不上的話，電腦存的備份手機解不開，反過來也一樣，
 * 而且不會當場報錯**——存的時候一切正常，某天想還原才發現打不開。
 *
 * 兩個地方會叫它：`App.tsx` 的自我檢查方塊（人看得到），以及 CI 在 iOS 模擬器裡開這支 app
 * 之後去撈 `MARKER` 那一行（機器看得到，見 `.github/workflows/mobile-crypto.yml`）。
 */
import { File, Paths } from 'expo-file-system';
import { checkAllVectors, type VectorCheck } from '@core/lib/cloud-crypto-vectors';

/** 人在畫面上或日誌裡找這一行時用的開頭。 */
export const MARKER = '[crypto-vectors]';

/**
 * 結論寫進 app 文件夾底下這個檔，CI 從模擬器把它撈出來。
 *
 * **為什麼不叫 CI 去日誌裡撈那一行**：日誌串流會把系統訊息插在中間、Release 版對
 * `console.log` 的處理又跟 Debug 版不一樣，撈得到撈不到要真的跑一次才知道。
 * 檔案沒有這些不確定：寫進去就在那裡，`xcrun simctl get_app_container` 指得到那個目錄。
 * 檔名見 `.github/workflows/mobile-crypto.yml`，兩邊要一致。
 */
const RESULT_FILE = 'crypto-vectors.txt';

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
 * 跑一遍，結論同時送去三個地方：畫面（交回值）、日誌、檔案。
 *
 * 三份是給三種讀者的。畫面給人看；日誌給接著 Metro 開發的人看；檔案給 CI 讀。
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
