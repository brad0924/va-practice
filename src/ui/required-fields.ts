/**
 * 必填格：編輯畫面上「還空著就還沒填完」那條規則的家，完全不碰 DOM。
 *
 * 三種格（詞條、讀音格、釋義）共用同一句判空，換欄鍵與儲存按鈕共用同一份判斷。
 * 兩者走的順序不同是刻意的（ADR-0006／0009）：換欄照畫面由上而下，儲存把讀音排最後。
 */

/** 一個必填格的身分。讀音格的序號是攤平後由左到右，與畫面一致。 */
export type FieldRef =
  | { kind: 'term' }
  | { kind: 'reading'; index: number }
  | { kind: 'meaning' };

/** 換欄的三種結果：送過去、就地不動、全部有值可以放行。 */
export type Jump =
  | { kind: 'move'; to: FieldRef }
  | { kind: 'stay' }
  | { kind: 'done' };

export interface RequiredFields {
  /** 換欄：從 from 往下找下一個還空著的格子，順序照畫面由上而下，到底繞回頭。 */
  nextEmpty(from: FieldRef): Jump;
  /** 儲存：第一個擋著不讓存的格子，順序是詞條 → 釋義 → 讀音格；全部有值回 null。 */
  firstBlocking(): FieldRef | null;
}

/** 值一律現取：畫面上的字隨時在變，模組不留快照。 */
export interface FieldValues {
  term: () => string;
  readings: () => string[];
  meaning: () => string;
  /** 讀音格接下來會不會被 AI（Artificial Intelligence，人工智慧）動到，來自 `editor.prefilling`。 */
  prefilling: () => boolean;
}

export function createRequiredFields(values: FieldValues): RequiredFields {
  const valueOf = (ref: FieldRef): string => {
    switch (ref.kind) {
      case 'term':
        return values.term();
      case 'reading':
        return values.readings()[ref.index] ?? '';
      case 'meaning':
        return values.meaning();
    }
  };

  /** 還空著＝還沒填完。三種格共用這一句。 */
  const isEmpty = (ref: FieldRef) => valueOf(ref).trim() === '';

  /** 目前有幾個讀音格由值決定：純假名詞條一格都沒有。 */
  const readingRefs = (): FieldRef[] =>
    values.readings().map((_, index) => ({ kind: 'reading', index }));

  /** 換欄的一圈：詞條 → 讀音格（左到右）→ 釋義。 */
  const cycle = (): FieldRef[] => [{ kind: 'term' }, ...readingRefs(), { kind: 'meaning' }];

  /**
   * 從 from 起算，往下找這一圈裡第一個還空著的格子，到底繞回頭。
   * from 一定在圈裡：不在的（序號超出範圍）取不到值，上面那條前提早就回 stay 了。
   */
  const nextEmptyIn = (ring: FieldRef[], from: FieldRef): FieldRef | null => {
    const at = ring.findIndex((ref) => same(ref, from));
    for (let step = 1; step < ring.length; step += 1) {
      const field = ring[(at + step) % ring.length]!;
      if (isEmpty(field)) return field;
    }
    return null;
  };

  /**
   * 這一輪要不要把讀音格整段跳過（ADR-0006 的 AI 預填避讓）。離開詞條的這一刻讀音格
   * 隨時會被回覆整批換掉，把人送進去等於送他去被蓋字——就算什麼都還沒打，光是重畫
   * 就會讓游標和鍵盤一起沒掉，而「鍵盤留得住」正是 ↵ 這條路唯一的價值。
   */
  const avoidReading = (from: FieldRef) => from.kind === 'term' && values.prefilling();

  return {
    nextEmpty(from) {
      // 前提一：離開的那一格必須有值。從空格出發什麼都不該發生——不跳，也不能放行送出。
      if (isEmpty(from)) return { kind: 'stay' };
      const avoided = avoidReading(from)
        ? nextEmptyIn([{ kind: 'term' }, { kind: 'meaning' }], from)
        : null;
      const to = avoided ?? nextEmptyIn(cycle(), from);
      // 找不到空格只剩一種意思：真的全部有值。避讓那一種已經在上面退讓掉了。
      return to === null ? { kind: 'done' } : { kind: 'move', to };
    },

    firstBlocking() {
      // 刻意不照畫面的由上而下（讀音夾在中間），讀音排最後是使用者選的（ADR-0009）。
      const order: FieldRef[] = [{ kind: 'term' }, { kind: 'meaning' }, ...readingRefs()];
      return order.find(isEmpty) ?? null;
    },
  };
}

/** 同一格：讀音格還要序號一樣。必填格是值，不是物件，因此不能用 ===。 */
function same(a: FieldRef, b: FieldRef): boolean {
  if (a.kind === 'reading' && b.kind === 'reading') return a.index === b.index;
  return a.kind === b.kind;
}
