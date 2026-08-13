/**
 * 雲端備份：把整份資料加密後放到 Firebase Realtime Database，換裝置時接得回來。
 *
 * 這裡刻意不寫進 `storage.ts`：localStorage 仍然是唯一的資料來源，
 * 雲端只是備份的搬運帶，不是第二個真相來源（見 ADR-0002、ADR-0003）。
 *
 * 未登入時本模組完全靜默，一個網路請求都不發。
 *
 * `hooks.fetch` 與 `retry()` 出現在介面上是同一個立場的兩面：
 * 本模組不碰 DOM（Document Object Model，文件物件模型）。
 * 上網的方式跟 `storage` 一樣由呼叫端遞進來；「連線恢復了，該補推了」是瀏覽器事件，
 * 何時觸發由接線層（`app.ts`）決定，這裡只提供一個可以叫的動作。
 */
import { t } from '../i18n';
import type { AppData } from './types';
import type { StorageLike } from './storage';
import { deriveKeys, encrypt, decrypt, isRemoteNewer, type CloudKeys } from './cloud-crypto';

const DATABASE = 'https://va-practice-default-rtdb.asia-southeast1.firebasedatabase.app';

/** 記住暱稱與密碼的地方。能讀這裡的人本來就讀得到全部的卡片與進度，不吃虧。 */
export const CREDENTIALS_KEY = 'va-practice:cloud';

/**
 * 程式無法分辨「密碼打錯」與「這個暱稱被別人用了」——兩者的正確反應都是
 * 不要動雲端那份，所以不必分辨，一律回這句話。
 *
 * 是函式不是常數：查表要等 `initI18n()` 接上這台裝置，而常數在模組載入的那一刻就算完了。
 */
export const wrongPassword = (): string => t('cloud.wrongPassword');

/**
 * 單筆備份的大小上限，量的是加密後那串 base64 的字數——安全規則量的也是同一個東西。
 * 兩邊必須是同一個數字：規則若比這裡嚴，超大的那份會被放行出去再被雲端擋下，
 * 使用者拿到的就是一個沒人看得懂的狀態碼（`cloud-backup.test.ts` 有一條測試釘住這件事）。
 *
 * `ADR-0003` 記錄的每張卡約 155 bytes 量的也是推送後的大小（20 KB ÷ 132 張），
 * 與這裡同一把尺，直接相除即可：約當 27,000 張卡，遠高於 JLPT 全級數的字彙量。
 */
export const CLOUD_PAYLOAD_LIMIT = 4_194_304;

/**
 * 三句話缺一不可：超過的是什麼、改用什麼、以及本機到底有沒有事。
 * 最後一句最重要——不講的話，使用者會以為自己的卡出事了。
 *
 * 與 `wrongPassword()` 同一個理由是函式而不是常數。
 */
export const tooLarge = (): string => t('cloud.tooLarge');

class RejectedByCloud extends Error {
  constructor() {
    super(wrongPassword());
  }
}

class TooLarge extends Error {
  constructor() {
    super(tooLarge());
  }
}

/** 推不上去的三種理由各有各的下一步，那行狀態字不能混為一談。 */
function statusFor(error: unknown): string {
  if (error instanceof RejectedByCloud) return wrongPassword();
  if (error instanceof TooLarge) return tooLarge();
  return t('cloud.offlineNote');
}

/** 雲端上任何人都讀得到的那一半：密文與伺服器時間戳。 */
interface RemoteOpen {
  payload: string;
  updatedAt: number;
}

export interface CloudBackup {
  /** 目前登入的暱稱，未登入為 null。 */
  nickname(): string | null;
  /** 開 app 時拉一次。未登入則什麼都不做。 */
  begin(local: AppData): void;
  /** 登入。對得上雲端才把暱稱密碼記在本機；失敗時拋出可直接顯示給使用者的訊息。 */
  signIn(nickname: string, password: string, local: AppData): Promise<void>;
  /**
   * 換密碼。雲端那筆改用新密碼的指紋與金鑰，成功後這台裝置照常推拉。
   * 已知且無法避免的後果：其他還記著舊密碼的裝置從此推不上去也解不開，
   * 必須各自重新輸入一次新密碼（見 spec 決定 9）。
   */
  changePassword(password: string, local: AppData): Promise<void>;
  /** 停止同步：忘掉本機記住的暱稱密碼，回到未登入。卡片與進度完整留在本機。 */
  signOut(): void;
  /** 本機資料有變動。推的永遠是最新的整份，送出期間的變動會併到下一次。 */
  push(data: AppData): void;
  /**
   * 把待推的那份再送一次。與 `push()` 一樣命令式、不等結果。
   * 何時該重試由接線層決定（瀏覽器的 `online` 事件在 `app.ts` 上）。
   */
  retry(): void;
}

export interface CloudBackupHooks {
  storage: StorageLike;
  /** 上網的方式。與 `storage` 同待遇：一律由呼叫端遞進來，本模組不碰全域。 */
  fetch: typeof fetch;
  /** 拉到比本機新的雲端資料。傳的是解密後的 JSON 原文，交給呼叫端驗證後寫入。 */
  onPulled(json: string, updatedAt: number): void;
  /** 推送成功，這是伺服器蓋的時間戳，本機要記下來才能在下次開 app 時比新舊。 */
  onPushed(updatedAt: number): void;
  /** 畫面角落那行小狀態字；空字串代表收起來。 */
  onStatus(message: string): void;
}

export function createCloudBackup(hooks: CloudBackupHooks): CloudBackup {
  let account: { nickname: string; keys: CloudKeys } | null = null;
  /** 待推的那一份。永遠只留最後一份——推的是整份，中間那幾份沒有意義。 */
  let pending: AppData | null = null;
  let sending = false;
  /** 雲端拒絕了我們的指紋。再送幾次都一樣，等重新輸入密碼才有意義。 */
  let blocked = false;

  async function readOpen(keys: CloudKeys): Promise<RemoteOpen | null> {
    const response = await hooks.fetch(`${DATABASE}/backups/${keys.path}/open.json`);
    if (!response.ok) throw new Error(t('cloud.readFailed', { status: response.status }));
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    const open = body as Partial<RemoteOpen>;
    if (typeof open.payload !== 'string' || typeof open.updatedAt !== 'number') return null;
    return { payload: open.payload, updatedAt: open.updatedAt };
  }

  /**
   * `prev` 是「寫入者認為現在存著的指紋」，預設就是自己的指紋；
   * 只有換密碼時才會傳入舊指紋，讓同一條規則同時涵蓋兩種情況。
   */
  async function write(keys: CloudKeys, data: AppData, prev = keys.fingerprint): Promise<number> {
    const payload = await encrypt(keys.key, JSON.stringify(data));
    // 送出去也是被安全規則擋下來，不如在這裡就攔住：省一趟白跑的網路，
    // 也才有機會講一句人話——雲端回的只會是一個狀態碼。
    if (payload.length > CLOUD_PAYLOAD_LIMIT) throw new TooLarge();
    const response = await hooks.fetch(`${DATABASE}/backups/${keys.path}.json`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fingerprint: keys.fingerprint,
        prev,
        // 時間戳只能請伺服器自己填，客戶端送什麼數字規則都不收。
        open: { payload, updatedAt: { '.sv': 'timestamp' } },
      }),
    });
    // 指紋對不上就是被規則擋下來，雲端那份原封不動。
    if (response.status === 401) throw new RejectedByCloud();
    if (!response.ok) throw new Error(t('cloud.writeFailed', { status: response.status }));
    // 回應裡的時間戳已經是伺服器解析後的數字，不必再讀一次。
    const written = (await response.json()) as { open?: { updatedAt?: unknown } };
    const updatedAt = written.open?.updatedAt;
    if (typeof updatedAt !== 'number') throw new Error(t('cloud.noTimestamp'));
    return updatedAt;
  }

  /** 解不開就是密碼不對——AES-GCM 自帶完整性檢查，不會解出亂碼。 */
  async function open(keys: CloudKeys, remote: RemoteOpen): Promise<string> {
    try {
      return await decrypt(keys.key, remote.payload);
    } catch {
      throw new RejectedByCloud();
    }
  }

  function remember(nickname: string, password: string): void {
    hooks.storage.setItem(CREDENTIALS_KEY, JSON.stringify({ nickname, password }));
  }

  function recall(): { nickname: string; password: string } | null {
    const raw = hooks.storage.getItem(CREDENTIALS_KEY);
    if (raw === null) return null;
    try {
      const saved = JSON.parse(raw) as Partial<{ nickname: string; password: string }>;
      if (typeof saved.nickname !== 'string' || typeof saved.password !== 'string') return null;
      return { nickname: saved.nickname, password: saved.password };
    } catch {
      return null;
    }
  }

  async function flush(): Promise<void> {
    if (sending || blocked || account === null || pending === null) return;
    sending = true;
    try {
      while (pending !== null) {
        const snapshot: AppData = pending;
        const updatedAt = await write(account.keys, snapshot);
        // 送出期間又有新變動的話 pending 已經換人，這一份不能清掉。
        if (pending === snapshot) pending = null;
        hooks.onPushed(updatedAt);
      }
      hooks.onStatus('');
    } catch (error) {
      // 複習流程不被打斷：不跳對話框，只留一行小狀態字，待推的那份留著。
      if (error instanceof RejectedByCloud) blocked = true;
      hooks.onStatus(statusFor(error));
    } finally {
      sending = false;
    }
  }

  return {
    nickname() {
      return account?.nickname ?? recall()?.nickname ?? null;
    },

    begin(local) {
      const saved = recall();
      if (saved === null) return;
      void (async () => {
        try {
          account = { nickname: saved.nickname, keys: await deriveKeys(saved.nickname, saved.password) };
          const remote = await readOpen(account.keys);
          if (remote !== null && isRemoteNewer(remote.updatedAt, local.updatedAt)) {
            hooks.onPulled(await open(account.keys, remote), remote.updatedAt);
            return;
          }
          // 雲端還沒有這個暱稱，或本機這份比較新——把本機推上去。
          pending = local;
          await flush();
        } catch (error) {
          if (error instanceof RejectedByCloud) blocked = true;
          hooks.onStatus(statusFor(error));
        }
      })();
    },

    async signIn(nickname, password, local) {
      const trimmed = nickname.trim();
      if (trimmed === '' || password === '') throw new Error(t('cloud.credentialsRequired'));

      const keys = await deriveKeys(trimmed, password);
      const remote = await readOpen(keys);

      // 雲端那份比較新：先解得開才算數，解不開就是密碼不對，此時完全沒碰到雲端。
      if (remote !== null && isRemoteNewer(remote.updatedAt, local.updatedAt)) {
        const json = await open(keys, remote);
        account = { nickname: trimmed, keys };
        blocked = false;
        remember(trimmed, password);
        hooks.onPulled(json, remote.updatedAt);
        return;
      }

      // 本機這份比較新（含全新暱稱）：推上去。指紋不對會被規則擋在 401，雲端不動。
      const updatedAt = await write(keys, local);
      account = { nickname: trimmed, keys };
      blocked = false;
      remember(trimmed, password);
      hooks.onPushed(updatedAt);
    },

    async changePassword(password, local) {
      if (password === '') throw new Error(t('cloud.newPasswordRequired'));
      const saved = recall();
      if (saved === null) throw new Error(t('cloud.notSignedIn'));

      const before = await deriveKeys(saved.nickname, saved.password);
      const keys = await deriveKeys(saved.nickname, password);
      // 舊指紋配新指紋。舊密碼若對不上雲端，這裡就被規則擋在 401，雲端那份不動。
      const updatedAt = await write(keys, local, before.fingerprint);

      account = { nickname: saved.nickname, keys };
      // 剛剛送上去的就是最新的整份，待推的那份已無意義。
      pending = null;
      blocked = false;
      remember(saved.nickname, password);
      hooks.onPushed(updatedAt);
      hooks.onStatus('');
    },

    signOut() {
      account = null;
      pending = null;
      blocked = false;
      hooks.storage.removeItem(CREDENTIALS_KEY);
      hooks.onStatus('');
    },

    push(data) {
      // 未登入時連記都不記，維持「行為與現在完全一樣」。
      if (account === null) return;
      pending = data;
      void flush();
    },

    retry() {
      void flush();
    },
  };
}
