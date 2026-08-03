/** 使用者看完答案後的自評，共四級。 */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

/** 卡片的容器。名字可改，識別碼建立後不變。 */
export interface Book {
  id: string;
  name: string;
}

/**
 * 複習、卡片列表、統計三個畫面各自的單字本範圍，互不影響。
 * 每組至少含一個 id；零本時三組皆為空陣列。
 */
export interface BookScopes {
  review: string[];
  list: string[];
  stats: string[];
}

/** 一張卡：日文詞條與中文釋義的配對，外加排程狀態。 */
export interface Card {
  /** 建立後不變，即使詞條被編輯亦然。 */
  id: string;
  /** 所屬單字本。一張卡剛好屬於一本，不能同時屬於多本，也不能不屬於任何一本。 */
  bookId: string;
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
  /** 單字本清單，順序即畫面上的顯示順序。 */
  books: Book[];
  cards: Card[];
  /** 三個畫面各自的單字本範圍。跟著備份走，因此換裝置後範圍一致。 */
  scopes: BookScopes;
  /**
   * 這份資料上次被推上雲端時，伺服器蓋的時間戳（毫秒）。
   * 只用來與雲端那份比新舊，一律由伺服器決定，本機不自行填。
   * 0 代表從未推上雲端，也涵蓋沒有這個欄位的舊格式資料——一律視為最舊。
   */
  updatedAt: number;
}
