/** 使用者看完答案後的自評，共四級。 */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

/** 一張卡：日文詞條與中文釋義的配對，外加排程狀態。 */
export interface Card {
  /** 建立後不變，即使詞條被編輯亦然，以確保單向合併不會重複加入。 */
  id: string;
  /** 帶讀音標記的詞條，如 `焦[こ]がす`。 */
  text: string;
  meaning: string;
  /** 間隔（天）。null 代表新卡：從未被複習過。 */
  interval: number | null;
  /** 成長倍數，初始 2.5，下限 1.3。 */
  ease: number;
  /** 到期日 `YYYY-MM-DD`（當地時區）。null 代表新卡，視為已到期。 */
  due: string | null;
}

/** 匯出／匯入與本機儲存共用的資料格式。 */
export interface AppData {
  version: number;
  cards: Card[];
  /**
   * 上次儲存時，內建牌組有哪些識別碼。
   * 單向合併只補入不在這份名單中的內建卡，使用者刪掉的卡因此不會被補回來。
   */
  knownBuiltinIds: string[];
  /**
   * 這份資料上次被推上雲端時，伺服器蓋的時間戳（毫秒）。
   * 只用來與雲端那份比新舊，一律由伺服器決定，本機不自行填。
   * 0 代表從未推上雲端，也涵蓋沒有這個欄位的舊格式資料——一律視為最舊。
   */
  updatedAt: number;
}
