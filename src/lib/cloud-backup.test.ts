import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  createCloudBackup,
  CLOUD_PAYLOAD_LIMIT,
  CREDENTIALS_KEY,
  type CloudBackupHooks,
} from './cloud-backup';
import { deriveKeys, encrypt, decrypt } from './cloud-crypto';
import { DATA_VERSION, type StorageLike } from './storage';
import { DEFAULT_EASE } from './review';
import type { AppData } from './types';
import zhHant from '../i18n/zh-Hant';

const NICKNAME = 'brad';
const PASSWORD = 'hunter2';

/**
 * 模組回報給畫面的那三句狀態字。從翻譯檔取值，改文案不必動測試。
 *
 * 這三條**刻意留在文字這一層**：`onStatus` 遞出去的本來就是「畫面角落那行小字」，
 * 不是錯誤物件——票 05 改成帶 key 的是 `throw` 出去的那些。
 */
const OFFLINE_NOTE = zhHant['cloud.offlineNote'];
const WRONG_PASSWORD = zhHant['cloud.wrongPassword'];
const TOO_LARGE = zhHant['cloud.tooLarge'];

/** 一份認得出是誰的資料：`mark` 解密後找得回來，用來分辨送上去的是哪一份。 */
function appData(mark: string, updatedAt = 0): AppData {
  return {
    version: DATA_VERSION,
    books: [{ id: 'book', name: '我的單字' }],
    cards: [{ id: mark, bookId: 'book', text: mark, meaning: mark, interval: null, ease: DEFAULT_EASE, due: null }],
    scopes: { review: ['book'], list: ['book'], stats: ['book'] },
    updatedAt,
  };
}

/**
 * 一份大到雲端收不下的資料。加密後轉成 base64 會膨脹約 4/3，
 * 所以原始文字只要塞到上限那麼長，送上去的那串一定超過上限。
 */
function oversized(): AppData {
  const data = appData('太多字了');
  data.cards[0].text = 'x'.repeat(CLOUD_PAYLOAD_LIMIT);
  return data;
}

/** 一台裝置的本機儲存。沿用 storage.test.ts 的寫法，模組只存一個鍵，不必分辨。 */
function fakeStorage(initial?: string): StorageLike {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
}

/** 記著憑證的儲存，用來模擬「上次開 app 已經登入過」。 */
function signedInStorage(password = PASSWORD): StorageLike {
  return fakeStorage(JSON.stringify({ nickname: NICKNAME, password }));
}

/** 安全規則檔裡我們要核對的那一格。路徑相對於本檔，不受 vitest 從哪裡啟動影響。 */
const RULES_FILE = new URL('../../.scratch/cloud-backup/firebase-rules.json', import.meta.url);

interface RulesFile {
  rules: { backups: { $key: { open: { payload: { '.validate': string } } } } };
}

/** 寫入雲端時送出去的那包。 */
interface WriteBody {
  fingerprint: string;
  prev: string;
  open: { payload: string };
}

interface Sent {
  method: string;
  /** PUT 才有，GET 一律是 null。 */
  body: WriteBody | null;
}

/**
 * 一台假的 Firebase：只認 cloud-backup 會打的那兩個端點，
 * 並照真的安全規則辦事——`prev` 對不上現存的指紋就回 401，那筆原封不動。
 * 回的是真的 `Response`，`response.json()` 遇到什麼行為就是什麼行為。
 */
function fakeFirebase() {
  const entries = new Map<string, { fingerprint: string; payload: string; updatedAt: number }>();
  const requests: Sent[] = [];
  const arrivals: Array<() => void> = [];
  /** 時間戳一律由伺服器蓋，遞增即可。 */
  let clock = 1_000;
  let offline = false;
  let gate: Promise<void> | null = null;
  let openGate: (() => void) | null = null;

  const json = (value: unknown) =>
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  const doFetch: typeof fetch = async (input, init) => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as WriteBody) : null;
    const pathname = new URL(String(input)).pathname;
    requests.push({ method, body });
    for (const resolve of arrivals.splice(0)) resolve();

    if (gate !== null) await gate;
    if (offline) throw new TypeError('Failed to fetch');

    if (method === 'GET') {
      const key = pathname.slice('/backups/'.length, -'/open.json'.length);
      const entry = entries.get(key);
      return json(entry === undefined ? null : { payload: entry.payload, updatedAt: entry.updatedAt });
    }

    const key = pathname.slice('/backups/'.length, -'.json'.length);
    const existing = entries.get(key);
    // 指紋對不上就是被規則擋下來，那筆原封不動。
    if (existing !== undefined && existing.fingerprint !== body!.prev) {
      return new Response(null, { status: 401 });
    }
    clock += 1;
    entries.set(key, { fingerprint: body!.fingerprint, payload: body!.open.payload, updatedAt: clock });
    return json({ open: { updatedAt: clock } });
  };

  return {
    fetch: doFetch,
    requests,
    /** 只看寫入，讀取不算——「有沒有動到雲端」問的是這個。 */
    writes: () => requests.filter((sent) => sent.method === 'PUT'),
    goOffline() {
      offline = true;
    },
    goOnline() {
      offline = false;
    },
    /** 讓接下來的請求停在半路，直到 `resume()`。 */
    pause() {
      gate = new Promise((resolve) => {
        openGate = resolve;
      });
    },
    resume() {
      openGate?.();
      gate = null;
      openGate = null;
    },
    /** 等到下一個請求送達（不等它回應）。要在觸發之前先接住這個 promise。 */
    arrived(): Promise<void> {
      return new Promise((resolve) => arrivals.push(resolve));
    },
    /** 別台裝置換了密碼：這裡的指紋從此對不上，我們寫什麼都被擋在 401。 */
    hijack() {
      for (const [key, entry] of entries) entries.set(key, { ...entry, fingerprint: '別人的指紋' });
    },
    /** 預先放一筆，模擬別台裝置早就備份過。 */
    async seed(nickname: string, password: string, data: AppData, updatedAt: number) {
      const keys = await deriveKeys(nickname, password);
      entries.set(keys.path, {
        fingerprint: keys.fingerprint,
        payload: await encrypt(keys.key, JSON.stringify(data)),
        updatedAt,
      });
    },
  };
}

/**
 * 假的 hooks：每次被叫就記一筆。
 * `push()` 不等結果就回來，所以測試等的是「記錄長成預期的樣子」——
 * 拿模組自己回報的終點線當號誌，不猜微任務輪數。
 */
function fakeHooks(doFetch: typeof fetch, storage: StorageLike) {
  const pulled: Array<{ json: string; updatedAt: number }> = [];
  const pushed: number[] = [];
  const status: string[] = [];
  const watchers: Array<{ check: () => boolean; resolve: () => void }> = [];

  const settle = () => {
    for (let i = watchers.length - 1; i >= 0; i -= 1) {
      if (watchers[i].check()) watchers.splice(i, 1)[0].resolve();
    }
  };

  const hooks: CloudBackupHooks = {
    storage,
    fetch: doFetch,
    onPulled(json, updatedAt) {
      pulled.push({ json, updatedAt });
      settle();
    },
    onPushed(updatedAt) {
      pushed.push(updatedAt);
      settle();
    },
    onStatus(message) {
      status.push(message);
      settle();
    },
  };

  return {
    hooks,
    pulled,
    pushed,
    status,
    /** 等到 hooks 被叫到滿足這個條件為止。 */
    until(check: () => boolean): Promise<void> {
      if (check()) return Promise.resolve();
      return new Promise((resolve) => {
        watchers.push({ check, resolve });
      });
    },
  };
}

/** 解開送上去的那包，看看裡面是哪一份。 */
async function sentData(keyOwner: { key: CryptoKey }, sent: Sent): Promise<string> {
  return decrypt(keyOwner.key, sent.body!.open.payload);
}

describe('雲端備份', () => {
  it('離線推不上去：待推的那份留著，恢復連線後 retry() 真的把它送出去', async () => {
    const server = fakeFirebase();
    const { hooks, pushed, status, until } = fakeHooks(server.fetch, fakeStorage());
    const cloud = createCloudBackup(hooks);
    await cloud.signIn(NICKNAME, PASSWORD, appData('登入時的那份'));

    server.goOffline();
    cloud.push(appData('離線時評的那張'));
    await until(() => status.includes(OFFLINE_NOTE));
    expect(pushed).toHaveLength(1);

    server.goOnline();
    cloud.retry();
    await until(() => status.at(-1) === '');

    expect(pushed).toHaveLength(2);
    const keys = await deriveKeys(NICKNAME, PASSWORD);
    expect(await sentData(keys, server.writes().at(-1)!)).toContain('離線時評的那張');
  });

  it('雲端回 401：狀態字說暱稱或密碼不對，之後再推一個請求都不發', async () => {
    const server = fakeFirebase();
    const { hooks, status, until } = fakeHooks(server.fetch, fakeStorage());
    const cloud = createCloudBackup(hooks);
    await cloud.signIn(NICKNAME, PASSWORD, appData('登入時的那份'));

    // 別台裝置換了密碼，這台的指紋從此對不上。
    server.hijack();
    cloud.push(appData('第一次被擋'));
    await until(() => status.includes(WRONG_PASSWORD));

    const quiet = server.requests.length;
    cloud.push(appData('之後再推'));

    // 這裡同步斷言「沒有請求」會無條件通過——請求要等 encrypt 跑完才發得出去。
    // 拿一次重新登入當節拍器：它真的走完一趟網路，被擋的那份若漏出去，一定排在它前面。
    await cloud.signIn(NICKNAME, PASSWORD, appData('重新登入'));
    expect(server.requests.slice(quiet).every((sent) => sent.method === 'GET')).toBe(true);
  });

  it('送出期間連推三次：中間那份被略過，最後送上去的是最新那份', async () => {
    const server = fakeFirebase();
    const { hooks, pushed, until } = fakeHooks(server.fetch, fakeStorage());
    const cloud = createCloudBackup(hooks);
    await cloud.signIn(NICKNAME, PASSWORD, appData('登入時的那份'));

    server.pause();
    const inFlight = server.arrived();
    cloud.push(appData('第一份'));
    await inFlight;
    cloud.push(appData('第二份'));
    cloud.push(appData('第三份'));
    server.resume();

    await until(() => pushed.length === 3);
    const keys = await deriveKeys(NICKNAME, PASSWORD);
    const writes = server.writes();
    expect(writes).toHaveLength(3);
    expect(await sentData(keys, writes[1])).toContain('第一份');
    expect(await sentData(keys, writes[2])).toContain('第三份');
  });

  it('開 app：雲端較新就拉下來且完全不推；本機較新或雲端沒資料就把本機那份推上去', async () => {
    const newer = fakeFirebase();
    await newer.seed(NICKNAME, PASSWORD, appData('雲端那份', 9_000), 9_000);
    const pull = fakeHooks(newer.fetch, signedInStorage());
    createCloudBackup(pull.hooks).begin(appData('本機那份', 1));
    await pull.until(() => pull.pulled.length === 1);

    expect(pull.pulled[0].updatedAt).toBe(9_000);
    expect((JSON.parse(pull.pulled[0].json) as AppData).cards[0].id).toBe('雲端那份');
    expect(newer.writes()).toHaveLength(0);

    const older = fakeFirebase();
    await older.seed(NICKNAME, PASSWORD, appData('雲端那份', 5), 5);
    const overwrite = fakeHooks(older.fetch, signedInStorage());
    createCloudBackup(overwrite.hooks).begin(appData('本機那份', 9_000));
    await overwrite.until(() => overwrite.pushed.length === 1);

    expect(older.writes()).toHaveLength(1);
    expect(overwrite.pulled).toHaveLength(0);

    const empty = fakeFirebase();
    const push = fakeHooks(empty.fetch, signedInStorage());
    createCloudBackup(push.hooks).begin(appData('本機那份', 1));
    await push.until(() => push.pushed.length === 1);

    expect(empty.writes()).toHaveLength(1);
    expect(push.pulled).toHaveLength(0);
  });

  it('登入時密碼不對：拋出暱稱或密碼不對，而且一個寫入都沒發出去', async () => {
    const server = fakeFirebase();
    await server.seed(NICKNAME, PASSWORD, appData('雲端那份', 9_000), 9_000);
    const storage = fakeStorage();
    const { hooks } = fakeHooks(server.fetch, storage);
    const cloud = createCloudBackup(hooks);

    await expect(cloud.signIn(NICKNAME, '打錯的密碼', appData('本機那份', 1))).rejects.toThrow(
      // 丟出來的錯只帶 key，一個字的介面文字都沒有（票 05）。
      expect.objectContaining({ key: 'cloud.wrongPassword' }),
    );
    expect(server.writes()).toHaveLength(0);
    expect(storage.getItem(CREDENTIALS_KEY)).toBeNull();
  });

  it('換密碼：送出的 prev 是舊指紋，成功後待推的那份被清掉', async () => {
    const server = fakeFirebase();
    const { hooks, status, until } = fakeHooks(server.fetch, fakeStorage());
    const cloud = createCloudBackup(hooks);
    await cloud.signIn(NICKNAME, PASSWORD, appData('登入時的那份'));

    server.goOffline();
    cloud.push(appData('還沒推上去的那份'));
    await until(() => status.includes(OFFLINE_NOTE));
    server.goOnline();

    await cloud.changePassword('新的密碼', appData('換密碼時的那份'));

    const before = await deriveKeys(NICKNAME, PASSWORD);
    const after = await deriveKeys(NICKNAME, '新的密碼');
    const write = server.writes().at(-1)!;
    expect(write.body!.prev).toBe(before.fingerprint);
    expect(write.body!.fingerprint).toBe(after.fingerprint);

    // 待推的那份若還在，retry() 會把它送上去。同樣拿重新登入當節拍器，
    // 走完一趟真的網路之後再看：換密碼之後不該再有任何寫入。
    const quiet = server.requests.length;
    cloud.retry();
    await cloud.signIn(NICKNAME, '新的密碼', appData('重新登入'));
    expect(server.requests.slice(quiet).every((sent) => sent.method === 'GET')).toBe(true);
  });

  it('未登入：開 app 與推送都一個請求都不發', async () => {
    const server = fakeFirebase();
    const { hooks } = fakeHooks(server.fetch, fakeStorage());
    const cloud = createCloudBackup(hooks);

    cloud.begin(appData('本機那份'));
    cloud.push(appData('評了一張'));
    expect(cloud.nickname()).toBeNull();

    // 拿一次登入當節拍器：上面若真的漏了請求出去，一定排在登入那趟之前。
    await cloud.signIn(NICKNAME, PASSWORD, appData('登入時的那份'));
    expect(server.requests[0].method).toBe('GET');
    expect(server.writes()).toHaveLength(1);
  });

  it('登出之後：推送零請求，待推的那份與記住的憑證都清掉', async () => {
    const server = fakeFirebase();
    const storage = fakeStorage();
    const { hooks, status, until } = fakeHooks(server.fetch, storage);
    const cloud = createCloudBackup(hooks);
    await cloud.signIn(NICKNAME, PASSWORD, appData('登入時的那份'));

    server.goOffline();
    cloud.push(appData('還沒推上去的那份'));
    await until(() => status.includes(OFFLINE_NOTE));
    server.goOnline();

    cloud.signOut();
    expect(storage.getItem(CREDENTIALS_KEY)).toBeNull();
    expect(cloud.nickname()).toBeNull();

    const quiet = server.requests.length;
    cloud.push(appData('登出之後評的'));
    cloud.retry();

    // 節拍器同上。登出之後不該再有任何寫入——新評的那張如此，
    // 離線時累積的那份也一樣，那才叫 pending 真的被清掉了。
    await cloud.signIn(NICKNAME, PASSWORD, appData('重新登入'));
    expect(server.requests.slice(quiet).every((sent) => sent.method === 'GET')).toBe(true);
  });

  it('卡片多到超過上限：說人話、沒送出任何東西，之後正常大小的那份照樣推得上去', async () => {
    const server = fakeFirebase();
    const storage = fakeStorage();
    const { hooks, status, until } = fakeHooks(server.fetch, storage);
    const cloud = createCloudBackup(hooks);
    await cloud.signIn(NICKNAME, PASSWORD, appData('登入時的那份'));
    const credentials = storage.getItem(CREDENTIALS_KEY);

    const quiet = server.writes().length;
    cloud.push(oversized());
    await until(() => status.includes(TOO_LARGE));

    // 超大的那份根本沒離開這台機器，雲端那筆原封不動。
    expect(server.writes()).toHaveLength(quiet);
    // 這句是使用者唯一的線索，少了它他會以為自己的卡出事了。
    expect(TOO_LARGE).toContain('本機的卡片與進度完全不受影響');
    // 被擋下來不等於被登出：憑證原封不動，下次開 app 照樣接得上雲端。
    expect(storage.getItem(CREDENTIALS_KEY)).toBe(credentials);
    expect(cloud.nickname()).toBe(NICKNAME);

    // 刪掉幾張之後又評一張：同步沒有卡死，照常推得上去。
    cloud.push(appData('刪掉之後又評的'));
    await until(() => status.at(-1) === '');
    expect(server.writes()).toHaveLength(quiet + 1);

    // 超限不是網路問題，一次都不該走到那句離線提示。
    expect(status).not.toContain(OFFLINE_NOTE);
  });

  it('客戶端的上限與安全規則是同一個數字', () => {
    const rules = JSON.parse(readFileSync(RULES_FILE, 'utf8')) as RulesFile;

    // 兩邊走鐘的話，客戶端會放行一份雲端其實收不下的資料，
    // 使用者就會拿到那個沒人看得懂的狀態碼——這條測試就是為了擋這件事。
    expect(rules.rules.backups.$key.open.payload['.validate']).toContain(
      `length <= ${CLOUD_PAYLOAD_LIMIT}`,
    );
  });
});
