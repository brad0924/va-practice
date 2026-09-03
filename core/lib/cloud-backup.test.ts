import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  createCloudBackup,
  CLOUD_PAYLOAD_LIMIT,
  CREDENTIALS_KEY,
  type CloudBackupHooks,
  type FirstBackupChoice,
} from './cloud-backup';
import { deriveKeys, encrypt, decrypt } from './cloud-crypto';
import { blank, DATA_VERSION, type StorageLike } from './storage';
import { DEFAULT_EASE } from './review';
import type { AppData } from './types';
import zhHant from '../i18n/zh-Hant';

/**
 * 登入時那兩個問句的答案。兩處假貨（`fakeHooks` 與 `fakeDevice`）遞的是同一組東西，
 * 因此給它一個名字，不要各寫各的行內型別。
 */
interface Answers {
  /** 「雲端那份要蓋掉本機這份」按確定為 true。 */
  replace: boolean;
  /** 「雲端還沒有備份，要拿什麼建立」的三選一。 */
  firstBackup: FirstBackupChoice;
}

const NICKNAME = 'bradtest';
const PASSWORD = 'hunter2';
/** 另一個暱稱，用來演「換一個人登入」。與上面那個一樣不是真的（`ADR-0018`）。 */
const OTHER = 'someoneelsetest';

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
    /** 雲端現在替這個暱稱存著什麼（解密後的 JSON 原文）。沒有那筆就是 null。 */
    async read(nickname: string, password: string): Promise<string | null> {
      const keys = await deriveKeys(nickname, password);
      const entry = entries.get(keys.path);
      if (entry === undefined) return null;
      return decrypt(keys.key, entry.payload);
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

  /**
   * 登入時兩個問句的答案，測試可以在呼叫 `signIn()` 之前改掉。
   *
   * 預設是「按下去之後行為與問句加進來之前一樣」：覆蓋照做、備份拿本機那份去建。
   * 底下那些不是在測對話框的測試因此一個字都不必改。
   */
  const answers: Answers = { replace: true, firstBackup: 'local' };
  /** 問句被叫過幾次、各是哪一句。「不該跳對話框」的那幾條守門看的就是它。 */
  const asked: string[] = [];

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
    askReplace(nickname) {
      asked.push(`replace:${nickname}`);
      return Promise.resolve(answers.replace);
    },
    askFirstBackup(nickname) {
      asked.push(`firstBackup:${nickname}`);
      return Promise.resolve(answers.firstBackup);
    },
  };

  return {
    hooks,
    pulled,
    pushed,
    status,
    asked,
    answers,
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

    // 刪掉幾張之後又評一張：備份沒有卡死，照常推得上去。
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

/**
 * 登入的六種情況（`ADR-0020`）。規則只有一句：**雲端已經有備份就一律以那份為準**，
 * 只有雲端還空著時才寫得進去，因此沒有任何一條路蓋得掉別人現有的備份。
 *
 * 底下有四條釘的是**不該跳對話框**（`asked` 是空的）。少了它們，那個確認框會退化成
 * 每次登入都跳的東西——而每次都跳的確認框，使用者按第三次就不看了。
 */
describe('登入', () => {
  it('雲端有備份、密碼打錯：本機比雲端新或舊都是同一句話，雲端一個字不動', async () => {
    // 兩個方向各跑一次。改版前只有「雲端較新」那條會先解密，另一條是送出去被規則擋在
    // 401——那一趟白跑的網路現在沒有了，兩條路的行為一致（驗收 8）。
    for (const localUpdatedAt of [1, 99_999]) {
      const server = fakeFirebase();
      await server.seed(NICKNAME, PASSWORD, appData('雲端那份', 9_000), 9_000);
      const storage = fakeStorage();
      const { hooks, asked } = fakeHooks(server.fetch, storage);

      await expect(
        createCloudBackup(hooks).signIn(NICKNAME, '打錯的密碼', appData('本機那份', localUpdatedAt)),
      ).rejects.toThrow(expect.objectContaining({ key: 'cloud.wrongPassword' }));

      expect(server.writes()).toHaveLength(0);
      expect(storage.getItem(CREDENTIALS_KEY)).toBeNull();
      // 密碼都還沒對上就問「要不要蓋掉」是在問一個還不存在的問題。
      expect(asked).toEqual([]);
    }
  });

  it('雲端有備份、本機零本零卡：不問，直接拉下來', async () => {
    const server = fakeFirebase();
    await server.seed(NICKNAME, PASSWORD, appData('雲端那份', 9_000), 9_000);
    const { hooks, pulled, asked } = fakeHooks(server.fetch, fakeStorage());

    expect(await createCloudBackup(hooks).signIn(NICKNAME, PASSWORD, blank())).toBe(true);

    // 全新裝置接上一個已有備份的暱稱是最常見的那一次登入，它不該被問任何事（驗收 4）。
    expect(asked).toEqual([]);
    expect(pulled).toHaveLength(1);
    expect((JSON.parse(pulled[0].json) as AppData).cards[0].id).toBe('雲端那份');
    expect(server.writes()).toHaveLength(0);
  });

  it('雲端有備份、內容與本機相同：不問，直接拉下來', async () => {
    const server = fakeFirebase();
    await server.seed(NICKNAME, PASSWORD, appData('同一份', 9_000), 9_000);
    const { hooks, pulled, asked } = fakeHooks(server.fetch, fakeStorage());

    // 兩邊時間戳刻意不同：那一格本來就天生不相等（雲端記的是上一次推成功的，
    // 本機那格已經被 `onPushed` 回寫成這一次的），比內容時必須把它排除掉。
    expect(await createCloudBackup(hooks).signIn(NICKNAME, PASSWORD, appData('同一份', 12_345))).toBe(
      true,
    );

    // 兩台裝置備份得好好的、重新登入同一個暱稱，這是最不該被打擾的一次（驗收 3）。
    expect(asked).toEqual([]);
    expect(pulled).toHaveLength(1);
    expect(server.writes()).toHaveLength(0);
  });

  it('雲端有備份、內容不同：問過才拉下來，雲端不動', async () => {
    const server = fakeFirebase();
    await server.seed(NICKNAME, PASSWORD, appData('雲端那份', 9_000), 9_000);
    const { hooks, pulled, asked, answers } = fakeHooks(server.fetch, fakeStorage());
    answers.replace = true;

    expect(await createCloudBackup(hooks).signIn(NICKNAME, PASSWORD, appData('本機那份', 1))).toBe(true);

    expect(asked).toEqual([`replace:${NICKNAME}`]);
    expect((JSON.parse(pulled[0].json) as AppData).cards[0].id).toBe('雲端那份');
    expect(server.writes()).toHaveLength(0);
  });

  it('雲端有備份、內容不同、按取消：沒有登入，本機與雲端都一個字不動', async () => {
    const server = fakeFirebase();
    await server.seed(NICKNAME, PASSWORD, appData('雲端那份', 9_000), 9_000);
    const storage = fakeStorage();
    const { hooks, pulled, pushed, answers } = fakeHooks(server.fetch, storage);
    answers.replace = false;
    const cloud = createCloudBackup(hooks);

    expect(await cloud.signIn(NICKNAME, PASSWORD, appData('本機那份', 1))).toBe(false);

    // 取消不是錯誤，因此不丟例外；但登入的每一個副作用都不能發生。
    expect(pulled).toEqual([]);
    expect(pushed).toEqual([]);
    expect(server.writes()).toHaveLength(0);
    expect(storage.getItem(CREDENTIALS_KEY)).toBeNull();
    expect(cloud.nickname()).toBeNull();
    expect(await server.read(NICKNAME, PASSWORD)).toContain('雲端那份');
  });

  it('雲端還是空的、本機零本零卡：不問，直接建立備份', async () => {
    const server = fakeFirebase();
    const { hooks, pushed, asked } = fakeHooks(server.fetch, fakeStorage());

    expect(await createCloudBackup(hooks).signIn(NICKNAME, PASSWORD, blank())).toBe(true);

    // 三個選項在這裡會得到一模一樣的結果，問了只是多一步。
    expect(asked).toEqual([]);
    expect(pushed).toHaveLength(1);
    expect(server.writes()).toHaveLength(1);
  });

  it('雲端還是空的、本機有資料、選「用這台的資料」：推上去，本機不變', async () => {
    const server = fakeFirebase();
    const { hooks, pulled, pushed, asked, answers } = fakeHooks(server.fetch, fakeStorage());
    answers.firstBackup = 'local';

    expect(await createCloudBackup(hooks).signIn(NICKNAME, PASSWORD, appData('這台的資料'))).toBe(true);

    expect(asked).toEqual([`firstBackup:${NICKNAME}`]);
    expect(await server.read(NICKNAME, PASSWORD)).toContain('這台的資料');
    // 本機一個字沒變，只多記了一個時間戳——那正是 `onPushed` 與 `onPulled` 的差別。
    expect(pushed).toHaveLength(1);
    expect(pulled).toEqual([]);
  });

  it('雲端還是空的、本機有資料、選「清空，重新開始」：本機與雲端都是零本零卡', async () => {
    const server = fakeFirebase();
    const { hooks, pulled, answers } = fakeHooks(server.fetch, fakeStorage());
    answers.firstBackup = 'blank';

    expect(await createCloudBackup(hooks).signIn(NICKNAME, PASSWORD, appData('這台的資料'))).toBe(true);

    const stored = JSON.parse((await server.read(NICKNAME, PASSWORD))!) as AppData;
    expect(stored.books).toEqual([]);
    expect(stored.cards).toEqual([]);
    // 本機也要跟著空掉，走的是 `onPulled`——「整份換掉本機這份」本來就是它在做的事。
    expect(pulled).toHaveLength(1);
    expect((JSON.parse(pulled[0].json) as AppData).cards).toEqual([]);
  });

  it('雲端那份的欄位順序不同：內容仍算相同，不問', async () => {
    const local = appData('同一份', 12_345);
    // 同樣的內容，物件的鍵刻意換一個順序寫進去。`JSON.stringify` 保留的是寫入順序，
    // 因此密文裡那一串與本機這份逐字比並不相等——比對必須看內容，不能看字串。
    const reordered = {
      updatedAt: 9_000,
      scopes: local.scopes,
      cards: local.cards.map((card) => ({
        due: card.due,
        ease: card.ease,
        interval: card.interval,
        meaning: card.meaning,
        text: card.text,
        bookId: card.bookId,
        id: card.id,
      })),
      books: local.books.map((book) => ({ name: book.name, id: book.id })),
      version: local.version,
    } as AppData;

    const server = fakeFirebase();
    await server.seed(NICKNAME, PASSWORD, reordered, 9_000);
    const { hooks, pulled, asked } = fakeHooks(server.fetch, fakeStorage());

    expect(await createCloudBackup(hooks).signIn(NICKNAME, PASSWORD, local)).toBe(true);

    expect(asked).toEqual([]);
    expect(pulled).toHaveLength(1);
  });

  it('離線時累積的那一份不會跟著換到下一個暱稱去', async () => {
    const server = fakeFirebase();
    await server.seed(OTHER, PASSWORD, appData('別人的那份', 9_000), 9_000);
    const { hooks, status, until } = fakeHooks(server.fetch, fakeStorage());
    const cloud = createCloudBackup(hooks);

    // 登入自己的暱稱，離線改一張——那一份卡在待推。
    await cloud.signIn(NICKNAME, PASSWORD, appData('這台的資料'));
    server.goOffline();
    cloud.push(appData('離線時改的'));
    await until(() => status.includes(OFFLINE_NOTE));
    server.goOnline();

    // 換去別人的暱稱。那邊雲端已經有備份，走的是拉下來那一條。
    const quiet = server.writes().length;
    expect(await cloud.signIn(OTHER, PASSWORD, appData('這台的資料'))).toBe(true);
    cloud.retry();

    // 拿一次重新登入當節拍器：待推的那份若沒被清掉，`retry()` 會把它送給**剛剛接上的
    // 這個暱稱**，而那一趟一定排在這次登入的 GET 之前。那正是「寫得到別人現有的備份」。
    await cloud.signIn(OTHER, PASSWORD, appData('這台的資料'));
    expect(server.writes()).toHaveLength(quiet);
    expect(await server.read(OTHER, PASSWORD)).toContain('別人的那份');
  });

  it('雲端還是空的、本機有資料、選「取消」：沒有登入，雲端仍然是空的', async () => {
    const server = fakeFirebase();
    const storage = fakeStorage();
    const { hooks, answers } = fakeHooks(server.fetch, storage);
    answers.firstBackup = 'cancel';
    const cloud = createCloudBackup(hooks);

    expect(await cloud.signIn(NICKNAME, PASSWORD, appData('這台的資料'))).toBe(false);

    expect(server.writes()).toHaveLength(0);
    expect(await server.read(NICKNAME, PASSWORD)).toBeNull();
    expect(storage.getItem(CREDENTIALS_KEY)).toBeNull();
    expect(cloud.nickname()).toBeNull();
  });
});

/**
 * 使用者 2026-09-03 回報的手順：停止備份 → 換一個暱稱登入 → 刪卡 → 停止備份 →
 * 回舊暱稱登入。結果舊暱稱那份雲端備份裡，剛剛刪掉的卡也不見了。
 *
 * 這一組刻意把接線層那一格也模擬進來：`onPushed` 回來的伺服器時間戳要寫回本機那份
 * （真的接線在 `mobile/lib/review-session.ts` 的 `noteCloudTimestamp` 與 `src/app.ts`）。
 * 少了那一格，本機的 `updatedAt` 永遠停在原地，新舊比較就不是真的那一套。
 *
 * ## 這兩條曾經是 `it.fails`
 *
 * 病灶還在的時候，行為要怎麼改還沒談定（票 `05`），因此斷言寫的是「使用者期待的
 * 結果」而現況做不到，兩條掛著 `it.fails`——bug 還在時它們是綠的，**修好的那一天
 * 會轉紅**，逼修的人回頭把它們收掉。票 `06` 把病灶修掉了，於是它們變回普通的 `it`。
 *
 * **兩條刻意答不一樣的答案**（第一條按確定、第二條按取消），因為這一組要釘的是
 * 「不管使用者按哪一顆，舊暱稱雲端那張卡都還在」。
 */
describe('換暱稱', () => {
  const OLD = '舊暱稱';
  const NEW = '新暱稱';

  /** 兩張卡的一份資料。刪掉第二張之後看得出來少了什麼。 */
  function twoCards(updatedAt: number): AppData {
    const data = appData('第一張', updatedAt);
    data.cards.push({
      id: '第二張',
      bookId: 'book',
      text: '第二張',
      meaning: '第二張',
      interval: null,
      ease: DEFAULT_EASE,
      due: null,
    });
    return data;
  }

  /**
   * 一台裝置：本機那份跟著推拉更新時間戳，與真的接線層一致。
   *
   * `answers` 是登入時兩個問句的答案。**這一組測試要驗的是「不管按哪一顆都一樣」**，
   * 因此它由呼叫端指定，斷言則不隨它變。
   */
  function fakeDevice(
    doFetch: typeof fetch,
    local: AppData,
    answers: Answers = { replace: true, firstBackup: 'local' },
  ) {
    let data = local;
    let pushes = 0;
    const settled: Array<() => void> = [];
    const hooks: CloudBackupHooks = {
      storage: fakeStorage(),
      fetch: doFetch,
      onPulled(json, updatedAt) {
        data = { ...(JSON.parse(json) as AppData), updatedAt };
        for (const resolve of settled.splice(0)) resolve();
      },
      onPushed(updatedAt) {
        data = { ...data, updatedAt };
        pushes += 1;
        for (const resolve of settled.splice(0)) resolve();
      },
      onStatus() {},
      askReplace: () => Promise.resolve(answers.replace),
      askFirstBackup: () => Promise.resolve(answers.firstBackup),
    };
    return {
      cloud: createCloudBackup(hooks),
      current: () => data,
      /** 本機刪掉一張卡，然後推上去。等推完才回來。 */
      async deleteCardAndPush(next: AppData) {
        const before = pushes;
        data = next;
        this.cloud.push(next);
        while (pushes === before) await new Promise<void>((resolve) => settled.push(resolve));
      },
    };
  }

  it('在新暱稱底下刪掉卡，回舊暱稱登入時舊的那份備份原封不動（按確定）', async () => {
    const server = fakeFirebase();
    await server.seed(OLD, PASSWORD, twoCards(100), 100);

    // 第 5 步那一問按「確定」：雲端那份整份拉下來蓋掉本機，雲端仍然一個字沒被寫。
    const device = fakeDevice(server.fetch, twoCards(100), { replace: true, firstBackup: 'local' });

    // 1. 在舊暱稱底下停止備份
    await device.cloud.signIn(OLD, PASSWORD, device.current());
    device.cloud.signOut();

    // 2. 用新暱稱登入
    await device.cloud.signIn(NEW, PASSWORD, device.current());

    // 3. 刪掉第二張卡
    await device.deleteCardAndPush(appData('第一張', device.current().updatedAt));

    // 4. 在新暱稱底下停止備份
    device.cloud.signOut();

    // 5. 回舊暱稱登入
    const beforeStep5 = server.writes().length;
    await device.cloud.signIn(OLD, PASSWORD, device.current());

    // 機制確認：第 5 步走的是「把雲端那份拉下來」，一個寫入都沒發出去。
    // 這一行原本斷言的是相反的事（`+ 1`），那正是票 05 記錄的病灶。
    expect(server.writes().length).toBe(beforeStep5);
    expect(await server.read(OLD, PASSWORD)).toContain('第二張');
  });

  it('縮到最小：兩次「停止備份」都不是必要條件（按取消）', async () => {
    const server = fakeFirebase();
    await server.seed(OLD, PASSWORD, twoCards(100), 100);

    // 這一條那一問按「取消」：沒有登入，本機與雲端都一個字沒動。
    const device = fakeDevice(server.fetch, twoCards(100), { replace: false, firstBackup: 'local' });

    // 從沒登入過舊暱稱，直接用新暱稱登入
    await device.cloud.signIn(NEW, PASSWORD, device.current());
    // 刪一張
    await device.deleteCardAndPush(appData('第一張', device.current().updatedAt));
    // 直接登入舊暱稱，中間不停止備份
    await device.cloud.signIn(OLD, PASSWORD, device.current());

    expect(await server.read(OLD, PASSWORD)).toContain('第二張');
  });
});
