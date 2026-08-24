/**
 * 雲端備份的密碼學部分：由密碼派生指紋與金鑰、整份資料的加解密、新舊比較。
 * 全部用瀏覽器內建的 Web Crypto，不裝任何套件（見 ADR-0003）。
 *
 * 本模組只做計算，不碰網路，也不碰任何儲存。
 */

const ITERATIONS = 200_000;
/** AES-GCM 的初始向量長度，固定 12 位元組，直接接在密文前面一起存。 */
const IV_BYTES = 12;

export interface CloudKeys {
  /** 雲端路徑用的暱稱雜湊。用雜湊而非暱稱原文，暱稱才不受 Firebase 路徑字元限制。 */
  path: string;
  /** 存在雲端、讓安全規則據以擋掉別人覆寫的指紋，64 位十六進位字元。 */
  fingerprint: string;
  /** 上傳前把整份資料加密的金鑰。 */
  key: CryptoKey;
}

/**
 * 密碼身兼兩職：派生出一個指紋（誰能覆寫）與一把金鑰（內容怎麼加密）。
 * 暱稱當作 salt，同一組密碼在不同暱稱下派生出的值互不相同。
 */
export async function deriveKeys(nickname: string, password: string): Promise<CloudKeys> {
  const material = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  // 一次派生 64 位元組再對半切。PBKDF2 的兩個區塊各自是獨立的雜湊鏈，
  // 拿到其中一半推不出另一半，指紋因此不會賠上金鑰。
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: utf8(`va-practice:${nickname}`),
        iterations: ITERATIONS,
        hash: 'SHA-256',
      },
      material,
      512,
    ),
  );

  return {
    path: await sha256Hex(nickname),
    fingerprint: toHex(bits.slice(32)),
    key: await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']),
  };
}

/** 加密後的結果是一段 base64 文字，可以直接當成 JSON 字串送上雲端。 */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(plaintext)));
  const joined = new Uint8Array(iv.length + cipher.length);
  joined.set(iv);
  joined.set(cipher, iv.length);
  return toBase64(joined);
}

/**
 * 金鑰不對時會拋出例外，而不是解出一堆亂碼——AES-GCM 自帶完整性檢查。
 * 「密碼不對」就是靠這件事判斷出來的。
 */
export async function decrypt(key: CryptoKey, payload: string): Promise<string> {
  const joined = fromBase64(payload);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: joined.slice(0, IV_BYTES) },
    key,
    joined.slice(IV_BYTES),
  );
  return new TextDecoder().decode(plain);
}

/**
 * 雲端那份是否比本機新。時間戳一律是伺服器蓋的，不受裝置時鐘偏差影響。
 * 相等時算「不新」：本機那份可能有還沒推上去的變動，平手時要留給本機。
 */
export function isRemoteNewer(remoteUpdatedAt: number, localUpdatedAt: number): boolean {
  return remoteUpdatedAt > localUpdatedAt;
}

// TextEncoder 的型別允許共享記憶體，Web Crypto 的型別不收；實際回來的永遠是一般的緩衝區。
function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
}

async function sha256Hex(text: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(text))));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}
