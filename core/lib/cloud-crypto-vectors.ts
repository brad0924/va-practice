/**
 * 雲端備份加解密的**標答比對**：拿 `cloud-crypto-vectors.json` 裡那張表，
 * 用當下這個執行環境的加解密跑一遍，看對不對得上。
 *
 * 為什麼要有這一支：雲端備份的內容是加密的，電腦存上去的，手機必須解得開，反過來也一樣
 * （`.scratch/rn-rewrite/issues/05`）。網頁版用瀏覽器內建的 `crypto.subtle`，
 * React Native 上沒有那個東西，換成 `react-native-quick-crypto` 補一份。
 * **換掉之後加出來的東西，網頁版還解不解得開？** 這一支就是在問這個。
 *
 * **它不屬於任何一個執行環境。** 三個地方各跑一次，跑的是同一份程式碼、同一張表：
 *
 * | 誰跑 | 用哪一套加解密 | 什麼時候 |
 * | --- | --- | --- |
 * | `cloud-crypto-vectors.test.ts`（vitest，repo 根的 `npm test`） | Node 內建的 | 每次推程式 |
 * | 同一支測試（jest，`mobile/npm test`） | Node 內建的 | 本機 |
 * | `mobile/lib/crypto-self-check.ts`（真的裝在手機上那一份） | quick-crypto | 開 app 時、CI 的模擬器裡 |
 *
 * 只有第三列驗得到真正的風險。前兩列守的是另一件事：**標答表不准漂**——
 * 有人動到 `cloud-crypto.ts` 就當場紅燈。
 *
 * 表本身不要手改，它由 `scripts/generate-crypto-vectors.mjs` 產生。
 */
import { deriveKeys, encrypt, decrypt } from './cloud-crypto';
import table from './cloud-crypto-vectors.json';

/** 標答表裡的一列。欄位的意思見 `scripts/generate-crypto-vectors.mjs` 的配方清單。 */
export interface CryptoVector {
  name: string;
  why: string;
  nickname: string;
  password: string;
  /** 明文的一個單位。實際明文是它重複 `repeat` 次，見 `expand()`。 */
  plaintext: string;
  repeat: number;
  plaintextBytes: number;
  /** 加密後那串 base64 有多長。Firebase 安全規則量的是這個數字，不是明文的位元組數。 */
  payloadChars: number;
  /** 十六進位的初始向量，24 個字。標答要重現，所以這一步不能抓亂數。 */
  iv: string;
  path: string;
  fingerprint: string;
  /** 完整的加密輸出。超大那一筆是 `null`，理由見 `checkVector()`。 */
  payload: string | null;
  payloadSha256: string;
}

export interface VectorCheck {
  name: string;
  passed: boolean;
  /** 對不上的地方，一項一句。全過的話是空陣列。 */
  failures: string[];
}

export const CRYPTO_VECTORS: CryptoVector[] = table.vectors as CryptoVector[];

/**
 * 把一列標答展開成真正的明文。
 *
 * 超大那一筆的明文有 4 MB，存進版控的話 git 永遠拿不掉，所以表裡只記「拿這段重複幾次」，
 * 明文是跑的當下現場產生的。這裡的算法要與產生腳本的 `expand()` 一模一樣。
 */
export function expand(vector: CryptoVector): string {
  return vector.plaintext.repeat(vector.repeat);
}

/**
 * 暫時把亂數來源換成標答裡那個固定的初始向量。
 *
 * `encrypt()` 內部抓亂數，所以同一份內容加密兩次本來就不一樣——那是刻意的設計，
 * 讓人看不出兩次備份是否相同。但「位元級相同」這件事要比對得起來，就得把那一步固定下來。
 * **換掉的是亂數來源，不是 `cloud-crypto.ts`**，那支一個字都沒改。
 *
 * **只接管長度剛好等於初始向量的那一次抽取，其餘原封轉給真的那一份。** 換掉的是全域，
 * 而這段期間畫面沒有停住——手機上跑這張表要好幾秒，那幾秒內任何人叫到
 * `crypto.getRandomValues()` 拿到的都會是這裡灌下去的固定值。加上長度判斷之後，
 * 只有「抽 12 個位元組當初始向量」那一種呼叫會被接手，也順帶擋掉了向量塞不進去的例外。
 */
async function encryptWithFixedIv(
  key: CryptoKey,
  plaintext: string,
  iv: Uint8Array,
): Promise<string> {
  const real = crypto.getRandomValues.bind(crypto) as unknown as FillRandom;
  const fake: FillRandom = (array) => {
    const bytes = array as Uint8Array;
    if (bytes.byteLength !== iv.byteLength) return real(array);
    bytes.set(iv);
    return array;
  };

  crypto.getRandomValues = fake as unknown as typeof crypto.getRandomValues;
  try {
    return await encrypt(key, plaintext);
  } finally {
    crypto.getRandomValues = real as unknown as typeof crypto.getRandomValues;
  }
}

/**
 * `getRandomValues` 的形狀，自己描述一次。
 *
 * 內建的那個型別在兩套工具鏈底下寬窄不一樣——網頁版那份收得下共享記憶體，
 * React Native 那份不收——照抄任何一邊，另一邊都會紅字。這裡只需要「拿一塊記憶體、
 * 填滿、還回去」這個形狀，泛型參數對這一支沒有用處。
 */
type FillRandom = (array: ArrayBufferView) => ArrayBufferView;

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

/**
 * 一列標答的三項檢查。三項都過才算對得上。
 *
 * 1. **指紋與路徑**——由暱稱與密碼派生。對不上的話「別人覆寫不了」那道防線就是假的。
 * 2. **位元級相同**——同一組明文、密碼、初始向量下，這個環境加出來的與表裡的一模一樣。
 * 3. **解得開**——表裡那串密文，這個環境解出來與明文一字不差。
 *
 * 超大那一筆的表裡沒有密文（只有指紋），第 3 項因此改用**自己加出來的那一份**去解。
 * 這在邏輯上只有在第 2 項過了的時候才成立——第 2 項證明那一份與網頁版當初加出來的
 * 位元級相同，才輪得到「解得開它就等於解得開網頁版那一份」。所以第 2 項紅燈時
 * 這一列直接跳過第 3 項：拿一份已知不對的東西自己加自己解，只會多印一行綠的，
 * 讓人誤以為只壞了一半。
 *
 * **沒有「密文裡看不到明文片段」這一項。** 寫過，但它是空的：密文是 base64，
 * 而明文一定含 `{`、`"` 或日文，那些字元不在 base64 的字母表裡，這一項永遠不會紅燈。
 * 真正在擋「加密根本沒發生」的是第 2 項——密文對得上標答，就不可能是明文原樣送出去。
 */
export async function checkVector(vector: CryptoVector): Promise<VectorCheck> {
  const failures: string[] = [];
  const plaintext = expand(vector);
  const { path, fingerprint, key } = await deriveKeys(vector.nickname, vector.password);

  if (path !== vector.path) failures.push(`路徑對不上：算出 ${path}，標答是 ${vector.path}`);
  if (fingerprint !== vector.fingerprint) {
    failures.push(`指紋對不上：算出 ${fingerprint}，標答是 ${vector.fingerprint}`);
  }

  const mine = await encryptWithFixedIv(key, plaintext, fromHex(vector.iv));
  const mineSha256 = await sha256Hex(mine);
  const sameBits = mineSha256 === vector.payloadSha256;
  if (!sameBits) {
    failures.push(
      `密文不同：算出的摘要 ${mineSha256}，標答是 ${vector.payloadSha256}`
        + describeFirstDifference(mine, vector.payload),
    );
  }

  const golden = vector.payload ?? (sameBits ? mine : null);
  if (golden === null) {
    failures.push('位元級那一項沒過，這一列的「解得開」跳過——表裡沒有密文可以拿來解');
  } else {
    try {
      const back = await decrypt(key, golden);
      if (back !== plaintext) {
        failures.push(`解出來的內容與明文不同（長度 ${back.length} vs ${plaintext.length}）`);
      }
    } catch (error) {
      failures.push(`解不開：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { name: vector.name, passed: failures.length === 0, failures };
}

/**
 * 差在第幾個字，順便報出前後各一小段。
 *
 * 「對不上」這三個字沒有辦法拿來重新評估路線，票 `05` 要的是「哪一種明文、差在哪個位元組」。
 * 超大那筆表裡沒有密文可比，這時只交回空字串——摘要不同已經足以說明有位元不同。
 */
function describeFirstDifference(mine: string, golden: string | null): string {
  if (golden === null) return '';
  const at = [...mine].findIndex((char, index) => char !== golden[index]);
  if (at === -1) return `，長度不同（算出 ${mine.length}，標答 ${golden.length}）`;
  return `，第 ${at} 個字起不同：算出 ${JSON.stringify(mine.slice(at, at + 12))}`
    + `，標答 ${JSON.stringify(golden.slice(at, at + 12))}`;
}

/** 整張表跑一遍。手機上那塊自我檢查方塊與兩支測試都走這一支。 */
export async function checkAllVectors(): Promise<VectorCheck[]> {
  const results: VectorCheck[] = [];
  // 一列一列跑，不並行：超大那筆會吃掉幾 MB，跟別的擠在一起只是讓手機更容易被系統收掉。
  for (const vector of CRYPTO_VECTORS) results.push(await checkVector(vector));
  return results;
}
