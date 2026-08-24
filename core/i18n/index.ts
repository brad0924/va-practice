/**
 * 介面語言：查表、語言的決定與保存（見 ADR-0013）。
 *
 * 選擇存在獨立的 `va-practice:lang`，與提醒開關、Gemini 金鑰同一類——**不進
 * `va-practice:data`，因此不上雲端也不進匯出檔**。備份是整份覆蓋，語言跟著走
 * 就等於所有裝置被綁成同一個語言（ADR-0013）。
 *
 * 這個模組不自己碰 `localStorage`，那一格由 `app.ts` 遞進來，測試時可換成假的實作。
 */
import type { StorageLike } from '../lib/storage';
import zhHant from './zh-Hant';
import en from './en';
import ja from './ja';

const TABLES = {
  'zh-Hant': zhHant,
  en,
  ja,
};

/** 翻譯檔裡的一條。三支翻譯檔的 key 由型別釘成一致。 */
export type Key = keyof typeof zhHant;

/** 真正查得到表的三種語言。 */
export type Lang = keyof typeof TABLES;

/** 使用者的選擇：三種語言，或跟著裝置走。 */
export type LangChoice = Lang | 'system';

/** 記著使用者選擇的那一格。 */
const LANG_STORAGE_KEY = 'va-practice:lang';

/** 這台裝置遞進來的兩樣東西：記住選擇的那一格，與它自己的語言。 */
interface Device {
  storage: StorageLike;
  systemLanguage: string;
}

/**
 * 還沒接上之前是 null——那代表接線漏了，不是使用者做錯什麼，
 * 所以底下三支都直接丟例外而不是默默給一種語言。
 */
let device: Device | null = null;
let choice: LangChoice = 'system';

/**
 * 接上這台裝置：記住選擇的地方與裝置語言都由外面遞進來。
 * `app.ts` 在畫面出來之前呼叫一次，`systemLanguage` 遞的是 `navigator.language`。
 */
export function initI18n(storage: StorageLike, systemLanguage: string): void {
  device = { storage, systemLanguage };
  choice = toChoice(storage.getItem(LANG_STORAGE_KEY));
}

/** 使用者目前選的是哪一個。給語言選單問「該打勾在哪一列」。 */
export function lang(): LangChoice {
  requireDevice();
  return choice;
}

/** 換一種語言並記在這台裝置上。畫面要重畫一次才看得到，那條接線在 `app.ts`。 */
export function setLang(next: LangChoice): void {
  const { storage } = requireDevice();
  choice = next;
  storage.setItem(LANG_STORAGE_KEY, next);
}

/**
 * 查一條介面字串。帶變數的走 `params` 代入 `{name}` 那種佔位符，**不要在外面
 * 拼字串**——其他語言的語序不同，拼起來會不通（票 03）。
 */
export function t(key: Key, params?: Record<string, string | number>): string {
  const { systemLanguage } = requireDevice();
  const text = TABLES[choice === 'system' ? fromSystem(systemLanguage) : choice][key];
  if (params === undefined) return text;
  return Object.entries(params).reduce(
    (filled, [name, value]) => filled.replaceAll(`{${name}}`, String(value)),
    text,
  );
}

function requireDevice(): Device {
  // 這種錯必然重現（只要那支檔案被載入就一定丟），不會是偶發，因此溜不到使用者手上。
  // 最可能踩到的是「在模組載入的當下就呼叫 t()」——那種字串要改成渲染時才算。
  //
  // 全 repo 只剩這一處是帶文字的 `Error` 而不是 `AppError`（票 05），刻意如此：
  // 帶 key 的錯要靠 `toMessage()` 查表才變成字，而這個錯的意思正是「查表還不能用」——
  // 顯示它的那一刻會再繞回這裡丟一次，使用者反而一個字都拿不到。
  // 它也不是介面文字——看到這句話的是開發者，不是使用者。
  if (device === null) throw new Error('i18n 還沒啟動，t() 不知道該用哪一種語言');
  return device;
}

/**
 * 那一格存的值。認不得的一律當「系統預設」——舊裝置上可能留著已經砍掉的 `ko`。
 *
 * 用 `Object.hasOwn` 而不是 `in`：後者會走原型鏈，`constructor`、`toString`、
 * `__proto__` 那幾個名字會被當成合法語言，接著查表查到 `undefined`。
 */
function toChoice(saved: string | null): LangChoice {
  return saved !== null && Object.hasOwn(TABLES, saved) ? (saved as Lang) : 'system';
}

/**
 * 裝置語言換算成介面語言：`navigator.language` 橫線後面砍掉再比主碼。
 *
 * 簡體中文（`zh-CN`、`zh-Hans`）主碼同樣是 `zh`，因此算「符合」而給繁體中文——
 * 繁簡差在字形與部分用詞，門檻遠低於讀英文，何況這只是預設值（spec 決定六）。
 * 韓文自決定十四之後不再是支援的語言，與其餘一切一起落到英文。
 */
function fromSystem(systemLanguage: string): Lang {
  const primary = systemLanguage.split('-')[0].toLowerCase();
  if (primary === 'zh') return 'zh-Hant';
  if (primary === 'ja') return 'ja';
  return 'en';
}
