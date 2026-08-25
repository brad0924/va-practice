#!/usr/bin/env node
/**
 * 產生雲端備份加解密的**標答表**：`core/lib/cloud-crypto-vectors.json`。
 *
 * 標答表是一張對照表——同一段明文、同一組暱稱密碼、同一個初始向量，加密出來應該長這樣。
 * 網頁版是標準答案，React Native 那一側要對齊它（`.scratch/rn-rewrite/issues/05`）。
 * 這件事錯了不會當場報錯：存的時候一切正常，某天想還原才發現打不開，那時資料已經沒了。
 *
 * **這支腳本不進 CI，也不必常跑。** 它的用途是「日後查得回這些數字怎麼來的」。
 * 表一旦產生就固定下來——重跑它只該在**刻意要改標準答案**的時候，而那意味著舊備份解不開，
 * 是一件要先寫 ADR 的事，不是順手跑一下的事。
 *
 * 用法：node scripts/generate-crypto-vectors.mjs
 * 需要 Node 22.18 以上（要直接 import `.ts`，靠的是 Node 自己剝掉型別那個功能）。
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveKeys, encrypt } from '../core/lib/cloud-crypto.ts';

const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'core/lib/cloud-crypto-vectors.json',
);

/** AES-GCM 的初始向量長度，與 `cloud-crypto.ts` 的 `IV_BYTES` 是同一個數字。 */
const IV_BYTES = 12;

/** AES-GCM 附在密文尾巴的完整性標籤，固定 16 位元組。「密碼不對就拋錯」靠的就是它。 */
const TAG_BYTES = 16;

/**
 * Firebase 安全規則給單筆備份的上限，與 `core/lib/cloud-backup.ts` 的
 * `CLOUD_PAYLOAD_LIMIT` 是同一個數字（那邊是正本，這裡不 import 是因為這支腳本跑在
 * 純 Node 上，而那個模組會連帶拉進整套介面字串表）。
 *
 * **這條線量的是加密後那串 base64 的字數，不是明文的位元組數。** `cloud-backup.ts`
 * 擋的是 `payload.length`。最後那一筆標答刻意做到快貼著這條線——量錯尺的話，
 * 做出來的是一份這支 app 根本不會送出去的備份，那就白驗了。
 */
const PAYLOAD_LIMIT_CHARS = 4 * 1024 * 1024;

/**
 * 每一筆標答的配方。`plaintext` 是一個單位，`repeat` 是它重複幾次——
 * 除了最後那筆超大的，其餘都是 1。
 *
 * 這份清單就是「我們決定要涵蓋哪些狀況」的正本。票 `05` 點名了前五種，
 * 第六種（日文暱稱與密碼）是多加的：暱稱是 salt、密碼是金鑰的原料，
 * 兩者都要先過 UTF-8 編碼，那一步在兩個執行環境上未必一致。
 */
const RECIPES = [
  {
    name: 'ascii-short',
    why: '純 ASCII 短字串。最單純的一筆，對不上就代表接線整條是錯的。',
    nickname: 'brad',
    password: 'hunter2',
    plaintext: '{"version":2,"books":[],"cards":[]}',
  },
  {
    name: 'japanese-mixed',
    why: '日文：漢字、平假名、片假名各有。UTF-8 下它們是三位元組字元。',
    nickname: 'brad',
    password: 'hunter2',
    plaintext: '{"text":"拝む","meaning":"参拝する／ザルソバ","kana":"おがむ"}',
  },
  {
    name: 'reading-markup',
    why: '帶讀音標記的詞條。方括號是 ASCII、夾在中間的是日文，混在一起最容易踩到邊界。',
    nickname: 'brad',
    password: 'hunter2',
    plaintext: '{"text":"焦[こ]がす／気[き]を付[つ]ける","meaning":"燒焦；小心"}',
  },
  {
    name: 'emoji',
    why: '表情符號。UTF-16 下它們占兩格（代理對），逐字元處理的程式碼會在這裡裂開。',
    nickname: 'brad',
    password: 'hunter2',
    plaintext: '{"meaning":"拉麵 🍜 と 🍣 と 👩‍👩‍👧‍👦 と 🇯🇵 と 🧑🏽‍🎓"}',
  },
  {
    name: 'japanese-credentials',
    why: '暱稱與密碼本身是日文。暱稱是 salt、密碼是金鑰原料，對不上的話指紋與金鑰全歪。',
    nickname: 'ブラッド',
    password: '合言葉は「山」',
    plaintext: '{"version":2,"cards":[{"text":"雪[ゆき]","meaning":"雪"}]}',
  },
  {
    name: 'huge-backup',
    why: '接近上限的長備份。驗的不是編碼對不對，是量大了會不會垮——'
      + 'base64 那個逐字元接起來的迴圈、底層 C++ 的分段處理，都只在這個量級才發作。',
    nickname: 'brad',
    password: 'hunter2',
    // 一張卡的樣子。整串接起來**不是合法的 JSON**，這是刻意的：加解密只看位元組，
    // 不解析內容，為了讓它成為合法 JSON 而多帶頭尾兩段字串，只是讓配方變難懂。
    plaintext:
      '{"id":"3f2a9c14-7b6e-4d51-9a0f-8c2d6e1b5470","bookId":"n2","text":"焦[こ]がす",'
      + '"meaning":"燒焦、烤焦 🍜","interval":21,"ease":2.6,"due":1756080000000},',
    /** 重複到密文剛好貼著上限底下。張數與實際長度由腳本算出來寫進表裡。 */
    fillToPayload: PAYLOAD_LIMIT_CHARS,
  },
];

/**
 * 初始向量從名字算出來，不是抓亂數。
 *
 * 標答要能重現，而 `encrypt()` 內部是抓亂數的——所以產生與驗證兩邊都得把那一步換掉。
 * 用名字的雜湊前 12 位元組，好處是看到這個值就知道它不是真的隨機來源，
 * 不會有人把標答裡的向量當成「可以拿去用的隨機值」。
 *
 * **正式使用時初始向量仍然是真亂數**，`cloud-crypto.ts` 一個字都沒改。
 */
function fixedIv(name) {
  return new Uint8Array(createHash('sha256').update(name).digest().subarray(0, IV_BYTES));
}

/**
 * 把配方展開成真正的明文。
 *
 * 對照的是 `cloud-crypto-vectors.ts` 的 `expand()`——那一支只做「重複 N 次」，
 * N 是這裡算完寫進表裡的。**兩邊算出不一樣的東西會被測試當場抓到**：
 * 那支測試有一條在核對「展開的明文長度與表裡記的位元組數一致」。
 *
 * 要倒推的是 N。給定的目標是**密文**的長度（那才是安全規則量的東西）：
 * base64 每 3 個位元組換 4 個字，而明文之外還要多帶初始向量與完整性標籤。
 */
function expand(recipe) {
  if (recipe.fillToPayload === undefined) return { text: recipe.plaintext, repeat: 1 };
  const unitBytes = new TextEncoder().encode(recipe.plaintext).length;
  const budgetBytes = Math.floor(recipe.fillToPayload / 4) * 3 - IV_BYTES - TAG_BYTES;
  const repeat = Math.floor(budgetBytes / unitBytes);
  return { text: recipe.plaintext.repeat(repeat), repeat };
}

/** 暫時把亂數來源換成固定值，只在這一次加密期間有效。 */
async function encryptWithFixedIv(key, plaintext, iv) {
  const real = crypto.getRandomValues;
  crypto.getRandomValues = (array) => {
    array.set(iv);
    return array;
  };
  try {
    return await encrypt(key, plaintext);
  } finally {
    crypto.getRandomValues = real;
  }
}

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

const vectors = [];
for (const recipe of RECIPES) {
  const { text, repeat } = expand(recipe);
  const iv = fixedIv(recipe.name);
  const { path, fingerprint, key } = await deriveKeys(recipe.nickname, recipe.password);
  const payload = await encryptWithFixedIv(key, text, iv);

  // 算錯的話這裡當場停下來。做出一份超過上限的標答，驗到的是一份這支 app 根本不會
  // 送出去的備份——那比沒有這一列更糟，因為它看起來有在守。
  if (payload.length > PAYLOAD_LIMIT_CHARS) {
    throw new Error(`${recipe.name} 的密文 ${payload.length} 字，超過上限 ${PAYLOAD_LIMIT_CHARS}`);
  }

  vectors.push({
    name: recipe.name,
    why: recipe.why,
    nickname: recipe.nickname,
    password: recipe.password,
    plaintext: recipe.plaintext,
    repeat,
    plaintextBytes: new TextEncoder().encode(text).length,
    // 安全規則量的是這個數字，不是明文的位元組數。測試據此核對最後那一列真的貼著上限。
    payloadChars: payload.length,
    iv: toHex(iv),
    path,
    fingerprint,
    // 太大就不存密文本身，只留指紋。哪一列算「太大」由配方決定——寫成 `fillToPayload`
    // 有沒有設，而不是拿張數當暗號。理由與「為什麼這樣仍然驗得到位元級相同」寫在
    // core/lib/cloud-crypto-vectors.ts，那份是給讀程式的人看的正本。
    payload: recipe.fillToPayload === undefined ? payload : null,
    payloadSha256: sha256Hex(payload),
  });

  console.log(
    `${recipe.name}: ${repeat} 份 · 明文 ${vectors.at(-1).plaintextBytes} 位元組 · 密文 ${payload.length} 字`,
  );
}

writeFileSync(
  OUTPUT,
  `${JSON.stringify(
    {
      note: '由 scripts/generate-crypto-vectors.mjs 產生，不要手改。改動的意義見該檔檔頭。',
      vectors,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(`\n寫入 ${OUTPUT}`);
