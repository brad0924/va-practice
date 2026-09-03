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
 *
 * 登入時那兩個問句（`askReplace`、`askFirstBackup`）站的是同一個立場：**怎麼問**由
 * 呼叫端遞進來，本模組只決定**什麼時候該問**。兩支一律回 `Promise`，理由與
 * `cloud-consent.ts` 的 `ask()` 完全相同——網頁版走 `confirm()`，答案當場就有；
 * React Native 上沒有那種對話框，`Alert.alert` 是 callback，遷就比較慢的那一邊。
 * 兩端的接線都在建它的那個地方：網頁版 `src/app.ts`（`confirm()` 加 `ui/choice-modal.ts`），
 * 手機版 `mobile/lib/app-context.tsx`（`mobile/lib/cloud-prompts-native.ts`）。
 */
import { t } from '../i18n';
import { AppError, toMessage } from './app-error';
import type { AppData } from './types';
import { blank, type StorageLike } from './storage';
import { deriveKeys, encrypt, decrypt, isRemoteNewer, type CloudKeys } from './cloud-crypto';

const DATABASE = 'https://va-practice-default-rtdb.asia-southeast1.firebasedatabase.app';

/** 記住暱稱與密碼的地方。能讀這裡的人本來就讀得到全部的卡片與進度，不吃虧。 */
export const CREDENTIALS_KEY = 'va-practice:cloud';

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
 * 程式無法分辨「密碼打錯」與「這個暱稱被別人用了」——兩者的正確反應都是
 * 不要動雲端那份，所以不必分辨，一律用同一條 key。
 */
class RejectedByCloud extends AppError {
  constructor() {
    super('cloud.wrongPassword');
  }
}

class TooLarge extends AppError {
  constructor() {
    super('cloud.tooLarge');
  }
}

/**
 * 推不上去的三種理由各有各的下一步，那行狀態字不能混為一談。
 *
 * 前兩種自己就帶著 key，話怎麼講由 `toMessage()` 在這一刻查表決定——不要在這裡
 * 另外列一張「哪個類別配哪句話」的表，那會變成第二條漏斗，改 key 得改兩處。
 * 其餘一切（網路不通、雲端回怪狀態碼）都不是使用者能處理的，一律講同一句。
 */
function statusFor(error: unknown): string {
  if (error instanceof RejectedByCloud || error instanceof TooLarge) return toMessage(error);
  return t('cloud.offlineNote');
}

/** 雲端上任何人都讀得到的那一半：密文與伺服器時間戳。 */
interface RemoteOpen {
  payload: string;
  updatedAt: number;
}

/**
 * 雲端還空著、而本機有資料時，使用者的三個答案。
 *
 * - `local`：用這台的資料建立備份。
 * - `blank`：把這台清成剛裝好的樣子，再拿那份空的建立備份。
 * - `cancel`：不登入，本機一個字不動。
 */
export type FirstBackupChoice = 'local' | 'blank' | 'cancel';

/**
 * 穩定序列化：物件的鍵一律照字母排。
 *
 * `JSON.stringify` 保留的是鍵被寫進去的順序，而雲端那份密文是**上一次**某條程式路徑
 * 序列化出來的，本機這份是**這一次**另一條路徑手上的物件，同樣的內容排出來的順序
 * 不保證一樣。拿順序不穩的字串去比，會把相同的兩份判成不同，登入就多跳一次對話框。
 */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, inner]) => `${JSON.stringify(key)}:${stable(inner)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * 拿來比對內容的那一串：整份都算，只把 `updatedAt` 那一格歸零。
 *
 * 排除那一格是必要的，不是省事：密文裡那份 `AppData` 的 `updatedAt` 記的是**上一次**
 * 推成功的時間戳，而本機現在那格已經被 `onPushed` 回寫成**這一次**的（見 `write()`
 * 與 `flush()`），兩個數字天生不相等。不排除的話「內容相同」永遠不成立。
 */
function content(data: unknown): string {
  return stable(typeof data === 'object' && data !== null ? { ...data, updatedAt: 0 } : data);
}

/**
 * 雲端那份（解密後的 JSON 原文）與本機這份內容一不一樣。
 *
 * 解不成 JSON 就當成不一樣：問一次的代價是一句話，猜錯的代價是資料被蓋掉。
 */
function sameAsRemote(json: string, local: AppData): boolean {
  try {
    return content(JSON.parse(json)) === content(local);
  } catch {
    return false;
  }
}

/** 這台裝置還是剛裝好的樣子（零本零卡）。複習進度也一起比，那本來就在 `blank()` 裡。 */
function isBlank(local: AppData): boolean {
  return content(local) === content(blank());
}

export interface CloudBackup {
  /** 目前登入的暱稱，未登入為 null。 */
  nickname(): string | null;
  /** 開 app 時拉一次。未登入則什麼都不做。 */
  begin(local: AppData): void;
  /**
   * 登入：把這台裝置接上這個暱稱的雲端備份。**不比新舊**，雲端已經有備份就一律以
   * 那份為準（`ADR-0020`）。密碼對不上時拋出可直接顯示給使用者的訊息。
   *
   * 回傳 `false` 代表使用者在對話框按了取消：沒有登入，本機與雲端都一個字沒動。
   * 那不是錯誤，呼叫端**不要**拿它去顯示一行紅字。
   */
  signIn(nickname: string, password: string, local: AppData): Promise<boolean>;
  /**
   * 換密碼。雲端那筆改用新密碼的指紋與金鑰，成功後這台裝置照常推拉。
   * 已知且無法避免的後果：其他還記著舊密碼的裝置從此推不上去也解不開，
   * 必須各自重新輸入一次新密碼（見 spec 決定 9）。
   */
  changePassword(password: string, local: AppData): Promise<void>;
  /** 停止備份：忘掉本機記住的暱稱密碼，回到未登入。卡片與進度完整留在本機。 */
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
  /**
   * 登入時雲端已經有備份，而它的內容與本機這份不一樣：問使用者要不要讓雲端那份
   * 整份取代本機。`true` 代表繼續登入。
   *
   * **只有內容真的不同才會叫到它。** 本機還是空的、或兩邊一模一樣時不問——
   * 那兩種情況沒有東西會被蓋掉，問了只是每次登入都跳一個沒有意義的對話框。
   */
  askReplace(nickname: string): Promise<boolean>;
  /**
   * 登入時雲端還空著，而本機有資料：問這份備份要拿什麼建立。
   *
   * 本機也是空的時候不問，直接把那份空的推上去——三個選項的結果會完全一樣。
   */
  askFirstBackup(nickname: string): Promise<FirstBackupChoice>;
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
    if (!response.ok) throw new AppError('cloud.readFailed', { status: response.status });
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
    if (!response.ok) throw new AppError('cloud.writeFailed', { status: response.status });
    // 回應裡的時間戳已經是伺服器解析後的數字，不必再讀一次。
    const written = (await response.json()) as { open?: { updatedAt?: unknown } };
    const updatedAt = written.open?.updatedAt;
    if (typeof updatedAt !== 'number') throw new AppError('cloud.noTimestamp');
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

  /**
   * 登入成功那一刻要做的事，兩條路共用。
   *
   * **`pending` 一定要清掉。** 走到這裡時，本機那份不是剛被雲端整份換掉、就是剛被
   * 送上去，離線時累積的那一份已經沒有意義了。留著的話，恢復連線時的 `retry()`
   * 會把它推給**剛剛接上的這個暱稱**，那正是「寫得到別人現有的備份」那條路。
   * `changePassword()` 底下清它的理由是同一個。
   */
  function accept(nickname: string, password: string, keys: CloudKeys): void {
    account = { nickname, keys };
    pending = null;
    blocked = false;
    remember(nickname, password);
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

    /**
     * 登入不比新舊（`ADR-0020`）。走到底只有兩個結果：把雲端那份整份拉下來，
     * 或者在雲端還空著的時候建立一份新的備份。
     *
     * **沒有任何一條路寫得到別人現有的雲端備份**，這是這支方法唯一不能被改掉的性質
     * （票 `.scratch/cloud-backup/issues/05` 的災情就是這條被違反）。
     */
    async signIn(nickname, password, local) {
      const trimmed = nickname.trim();
      if (trimmed === '' || password === '') throw new AppError('cloud.credentialsRequired');

      const keys = await deriveKeys(trimmed, password);
      const remote = await readOpen(keys);

      if (remote !== null) {
        // 先解密。解不開就是密碼不對，中止登入，此時完全沒碰到雲端——
        // 兩條路都走這裡，本機那份比雲端新的時候也不再是「送出去被 401 擋下」。
        const json = await open(keys, remote);
        // 本機還是空的、或兩邊內容一模一樣：沒有東西會被蓋掉，不問。
        if (!isBlank(local) && !sameAsRemote(json, local) && !(await hooks.askReplace(trimmed))) {
          return false;
        }
        accept(trimmed, password, keys);
        hooks.onPulled(json, remote.updatedAt);
        return true;
      }

      // 雲端還是空的。本機有資料時由使用者決定要存哪一份上去；
      // 本機也是空的就不問，三個選項在那裡會得到一模一樣的結果。
      const choice: FirstBackupChoice = isBlank(local) ? 'local' : await hooks.askFirstBackup(trimmed);
      if (choice === 'cancel') return false;

      const first = choice === 'blank' ? blank() : local;
      const updatedAt = await write(keys, first);
      accept(trimmed, password, keys);
      // 「清空，重新開始」要讓本機也跟著變成那份空的，因此走與拉下來同一支 hook——
      // 「整份換掉本機這份」本來就是 `onPulled` 在做的事。另一條只多記一個時間戳。
      if (choice === 'blank') hooks.onPulled(JSON.stringify(first), updatedAt);
      else hooks.onPushed(updatedAt);
      return true;
    },

    async changePassword(password, local) {
      if (password === '') throw new AppError('cloud.newPasswordRequired');
      const saved = recall();
      if (saved === null) throw new AppError('cloud.notSignedIn');

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
