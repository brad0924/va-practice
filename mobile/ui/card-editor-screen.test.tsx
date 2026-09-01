// 這一支是 mobile/ 自己新寫的，所以直接寫 Jest。`core/` 那批仍寫著 `from 'vitest'`
// 並靠 `../test/vitest-shim.ts` 轉接——那個包袱只屬於搬過來的舊測試（票 `02`）。
import { describe, it, expect, jest } from '@jest/globals';
import { Alert, StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { createStore, type StorageLike } from '@core/lib/storage';
import type { Ask } from '@core/lib/reading-editor';
import type { AppData, Card } from '@core/lib/types';
import { createReviewSession, type ReviewSession } from '../lib/review-session';
import { CardEditorScreen } from './card-editor-screen';

/**
 * 編輯畫面的畫面測試。守的是票 `16` 驗收裡**在 Node 上看得到過沒過**的那幾條：
 * 存得進去、儲存並繼續、必填格的順序、詞條重複、讀音格的合併與切割、AI 預填、
 * 改單字本不動排程、44 點的觸控目標。
 *
 * 三件事**不在這裡**，它們沒有一件在這台機器上是真的：
 *
 * - **「取消」按不按得到。** 它掛在 `Stack.Screen` 的 `headerLeft` 上，而這裡的
 *   `expo-router` 是個空殼，導覽列畫不出來。那一條是真機驗收。
 * - **游標落在哪一格。** React Native 的測試工具沒有「現在焦點在誰身上」這個問題的答案。
 *   決定落點的是 `core/lib/required-fields.ts`，那一支自己有測試；這一頁只負責把序號
 *   翻回輸入框，因此這裡驗的是**看得到的後果**：該存的時候存了、不該存的時候沒存。
 * - **44 點撐開之後好不好看。** 那是並排目測那把尺的事（票 `16` 驗收最後一條）。
 */

/** `Stack.Screen` 在這台機器上沒有原生導覽列可掛。與 `./cards-screen.test.tsx` 同一個做法。 */
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

function fakeStorage(): StorageLike {
  const cells = new Map<string, string>();
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
  };
}

const 甲乙兩本 = [
  { id: 'A', name: '甲本' },
  { id: 'B', name: '乙本' },
];

/** 一張已經複習過幾輪的卡。排程那三格都有值，搬家那一條才驗得出「沒被動到」。 */
const 排程過的卡: Card = {
  id: 'c-1',
  bookId: 'A',
  text: '焦[こ]がす',
  meaning: '燒焦',
  interval: 21,
  ease: 2.6,
  due: '2026-09-20',
};

function seed(cards: Card[] = []): AppData {
  const ids = 甲乙兩本.map((book) => book.id);
  return { version: 3, books: 甲乙兩本, cards, scopes: { review: ids, list: ids, stats: ids }, updatedAt: 0 };
}

function build(data: AppData): ReviewSession {
  const store = createStore(fakeStorage());
  store.save(data);
  return createReviewSession({
    store,
    now: () => new Date(2026, 7, 25),
    // 亂數固定成「每張卡都跟自己交換」，佇列順序因此可預期。
    random: () => 0.999999,
    onChange: () => {},
    haptic: () => {},
  });
}

/**
 * 畫一次，交回查詢函式與「做完了幾次」。
 *
 * 這一頁與卡片列表不同，**不必手動重畫**：讀音格那台狀態機雖然也活在 React 外面，
 * 但每一支指令回來之後畫面自己會叫一次重畫（見 `./card-editor-screen.tsx` 的 `apply`）。
 */
async function show(session: ReviewSession, card: Card | null = null, ask: Ask | null = null) {
  const done: number[] = [];
  const tree = () => (
    <CardEditorScreen session={session} card={card} ask={ask} onDone={() => done.push(1)} />
  );
  const rendered = await render(tree());
  return Object.assign(rendered, { done });
}

type View = Awaited<ReturnType<typeof show>>;

/** 三格填滿。詞條打完之後讀音格才長出來，所以順序不能換。 */
async function fill(view: View, term: string, readings: Record<string, string>, meaning: string) {
  await fireEvent.changeText(view.getByPlaceholderText('焦がす'), term);
  for (const [kanji, reading] of Object.entries(readings)) {
    await fireEvent.changeText(view.getByLabelText(`${kanji}的讀音`), reading);
  }
  await fireEvent.changeText(view.getByPlaceholderText('燒焦'), meaning);
}

const cardsOf = (session: ReviewSession) => session.snapshot().data.cards;

describe('新增一張卡', () => {
  it('三格填滿按「儲存」：資料真的進去了，而且回得到列表', async () => {
    const session = build(seed());
    const view = await show(session);
    await fill(view, '焦がす', { 焦: 'こ' }, '燒焦');
    await fireEvent.press(view.getByText('儲存'));

    expect(cardsOf(session)).toHaveLength(1);
    expect(cardsOf(session)[0]?.text).toBe('焦[こ]がす');
    expect(cardsOf(session)[0]?.meaning).toBe('燒焦');
    expect(view.done).toHaveLength(1);
  });

  it('新卡的排程是空的：沒有間隔、沒有到期日', async () => {
    const session = build(seed());
    const view = await show(session);
    await fill(view, '焦がす', { 焦: 'こ' }, '燒焦');
    await fireEvent.press(view.getByText('儲存'));

    expect(cardsOf(session)[0]?.interval).toBeNull();
    expect(cardsOf(session)[0]?.due).toBeNull();
  });

  it('釋義存進去之前去掉頭尾空白', async () => {
    const session = build(seed());
    const view = await show(session);
    await fill(view, '焦がす', { 焦: 'こ' }, '  燒焦  ');
    await fireEvent.press(view.getByText('儲存'));

    expect(cardsOf(session)[0]?.meaning).toBe('燒焦');
  });

  it('新增模式有兩顆鈕，編輯模式只有「儲存」', async () => {
    const 新增 = await show(build(seed()));
    expect(新增.getByText('儲存並繼續')).toBeTruthy();

    const 編輯 = await show(build(seed([排程過的卡])), 排程過的卡);
    expect(編輯.queryByText('儲存並繼續')).toBeNull();
    expect(編輯.getByText('儲存')).toBeTruthy();
  });
});

describe('儲存並繼續', () => {
  it('存完留在原地：沒有回列表，而且卡進去了', async () => {
    const session = build(seed());
    const view = await show(session);
    await fill(view, '焦がす', { 焦: 'こ' }, '燒焦');
    await fireEvent.press(view.getByText('儲存並繼續'));

    expect(cardsOf(session)).toHaveLength(1);
    expect(view.done).toHaveLength(0);
  });

  it('三面清空：詞條、讀音格、釋義都回到空白', async () => {
    const session = build(seed());
    const view = await show(session);
    await fill(view, '焦がす', { 焦: 'こ' }, '燒焦');
    await fireEvent.press(view.getByText('儲存並繼續'));

    // 詞條空了，讀音格因此整區消失，換成「這個詞沒有漢字」。這一條是真的驗到了：
    // 那一區是照狀態機重畫的。
    expect(view.getByText('這個詞沒有漢字')).toBeTruthy();
    expect(view.queryByLabelText('焦的讀音')).toBeNull();
    // 底下這兩條**只驗到「重畫時交出去的值是空的」**，沒有驗到「框裡看得見的字被清掉了」。
    // 那兩格是不受控的，真正動手清的是 `clear()`（見 `./card-editor-screen.tsx` 的 `reset`），
    // 而 `clear()` 底下是原生那一端，這台機器上是假的。眼睛看得到的那一半留給真機。
    expect(view.getByPlaceholderText('焦がす').props.defaultValue).toBe('');
    expect(view.getByPlaceholderText('燒焦').props.defaultValue).toBe('');
  });

  it('跳一則說存進去了，講的是剛才那個詞', async () => {
    const view = await show(build(seed()));
    await fill(view, '焦がす', { 焦: 'こ' }, '燒焦');
    await fireEvent.press(view.getByText('儲存並繼續'));

    expect(view.getByText('已加入『焦がす』')).toBeTruthy();
  });

  it('連著存兩張都存得進去，第二張的那一則講的是第二個詞', async () => {
    const session = build(seed());
    const view = await show(session);
    await fill(view, '焦がす', { 焦: 'こ' }, '燒焦');
    await fireEvent.press(view.getByText('儲存並繼續'));
    await fill(view, '漂う', { 漂: 'ただよ' }, '漂浮');
    await fireEvent.press(view.getByText('儲存並繼續'));

    expect(cardsOf(session).map((card) => card.text)).toEqual(['焦[こ]がす', '漂[ただよ]う']);
    expect(view.getByText('已加入『漂う』')).toBeTruthy();
  });
});

describe('必填格', () => {
  it('三格沒填滿就按儲存：擋下來，出一句紅字，資料一個字沒進去', async () => {
    const session = build(seed());
    const view = await show(session);
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '焦がす');
    await fireEvent.press(view.getByText('儲存'));

    expect(view.getByText('詞條、讀音與釋義都要填。')).toBeTruthy();
    expect(cardsOf(session)).toHaveLength(0);
    expect(view.done).toHaveLength(0);
  });

  /**
   * 換欄鍵那一條（ADR-0006）：**還有空格時它只是往下走，不是「我要存」**。
   *
   * 落點是哪一格由 `core/lib/required-fields.ts` 決定，那一支自己有測試；
   * 這裡驗的是看得到的後果——沒有存、也沒有那一行紅字。
   */
  it('還有空格時按 return：不儲存，也不出紅字', async () => {
    const session = build(seed());
    const view = await show(session);
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '焦がす');
    await fireEvent(view.getByPlaceholderText('焦がす'), 'submitEditing');

    expect(cardsOf(session)).toHaveLength(0);
    expect(view.queryByText('詞條、讀音與釋義都要填。')).toBeNull();
  });

  it('全部有值時按 return：放行，走的是「儲存並繼續」那條', async () => {
    const session = build(seed());
    const view = await show(session);
    await fill(view, '焦がす', { 焦: 'こ' }, '燒焦');
    await fireEvent(view.getByPlaceholderText('燒焦'), 'submitEditing');

    expect(cardsOf(session)).toHaveLength(1);
    // 新增模式的送出是「儲存並繼續」：留在原地，沒有回列表。
    expect(view.done).toHaveLength(0);
  });

  it('從一個空著的格子按 return：什麼都不該發生', async () => {
    const session = build(seed());
    const view = await show(session);
    await fireEvent(view.getByPlaceholderText('焦がす'), 'submitEditing');

    expect(cardsOf(session)).toHaveLength(0);
    expect(view.queryByText('詞條、讀音與釋義都要填。')).toBeNull();
  });

  it('讀音填了但不是假名：列出來，游標不動，不儲存', async () => {
    const session = build(seed());
    const view = await show(session);
    await fill(view, '焦がす', { 焦: 'ko' }, '燒焦');
    await fireEvent.press(view.getByText('儲存'));

    expect(cardsOf(session)).toHaveLength(0);
    // 訊息由 `core/lib/reading.ts` 給，這裡只確認它真的被畫出來。
    expect(view.getByText('焦 的讀音要填假名')).toBeTruthy();
  });
});

describe('詞條重複', () => {
  it('撞到已經有卡的詞：擋下來，訊息說得出撞到哪一本', async () => {
    const session = build(seed([排程過的卡]));
    const view = await show(session);
    await fill(view, '焦がす', { 焦: 'こ' }, '別的意思');
    await fireEvent.press(view.getByText('儲存'));

    expect(view.getByText('「焦がす」已經在「甲本」裡了')).toBeTruthy();
    expect(cardsOf(session)).toHaveLength(1);
  });

  it('編輯自己那張時不算撞到自己', async () => {
    const session = build(seed([排程過的卡]));
    const view = await show(session, 排程過的卡);
    await fireEvent.changeText(view.getByPlaceholderText('燒焦'), '燒焦了');
    await fireEvent.press(view.getByText('儲存'));

    expect(cardsOf(session)[0]?.meaning).toBe('燒焦了');
    expect(view.done).toHaveLength(1);
  });
});

describe('編輯既有的卡', () => {
  it('一進來三格就是這張卡的內容', async () => {
    const view = await show(build(seed([排程過的卡])), 排程過的卡);
    expect(view.getByPlaceholderText('焦がす').props.defaultValue).toBe('焦がす');
    expect(view.getByLabelText('焦的讀音').props.defaultValue).toBe('こ');
    expect(view.getByPlaceholderText('燒焦').props.defaultValue).toBe('燒焦');
  });

  it('改單字本等於搬家：interval／ease／due 一格都沒被動到', async () => {
    const session = build(seed([排程過的卡]));
    const view = await show(session, 排程過的卡);
    await fireEvent.press(view.getByText('甲本'));
    await fireEvent.press(view.getByText('乙本'));
    await fireEvent.press(view.getByText('儲存'));

    const after = cardsOf(session)[0]!;
    expect(after.bookId).toBe('B');
    expect({ interval: after.interval, ease: after.ease, due: after.due }).toEqual({
      interval: 21,
      ease: 2.6,
      due: '2026-09-20',
    });
  });
});

describe('刪除', () => {
  it('走 Alert.alert() 問一次，取消排在前面、刪除是破壞性樣式', async () => {
    const asked = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const session = build(seed([排程過的卡]));
    const view = await show(session, 排程過的卡);
    await fireEvent.press(view.getByText('刪除這張卡'));

    const buttons = asked.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((button) => button.style)).toEqual(['cancel', 'destructive']);
    // 問完之前一個字都還沒動。
    expect(cardsOf(session)).toHaveLength(1);
    asked.mockRestore();
  });

  it('按下警示窗裡那顆「刪除」才真的刪，然後回列表', async () => {
    const asked = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const session = build(seed([排程過的卡]));
    const view = await show(session, 排程過的卡);
    await fireEvent.press(view.getByText('刪除這張卡'));

    const destructive = (asked.mock.calls[0]?.[2] ?? []).find((button) => button.style === 'destructive');
    await act(async () => {
      destructive?.onPress?.();
    });

    expect(cardsOf(session)).toHaveLength(0);
    expect(view.done).toHaveLength(1);
    asked.mockRestore();
  });

  it('新增模式沒有刪除鈕', async () => {
    const view = await show(build(seed()));
    expect(view.queryByText('刪除這張卡')).toBeNull();
  });
});

describe('讀音格', () => {
  it('沒有漢字時整區換成一句話', async () => {
    const view = await show(build(seed()));
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), 'あける');
    expect(view.getByText('這個詞沒有漢字')).toBeTruthy();
  });

  it('一串新的連續漢字逐字開格——切法的起點是「全拆開」', async () => {
    const view = await show(build(seed()));
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '剃刀');

    expect(view.getByLabelText('剃的讀音')).toBeTruthy();
    expect(view.getByLabelText('刀的讀音')).toBeTruthy();
  });

  it('點格與格之間的接縫：合成一格', async () => {
    const view = await show(build(seed()));
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '剃刀');
    await fireEvent.press(view.getByLabelText('把剃和刀合併'));

    expect(view.getByLabelText('剃刀的讀音')).toBeTruthy();
    expect(view.queryByLabelText('剃的讀音')).toBeNull();
  });

  it('點漢字與漢字之間的縫：切回左右兩格', async () => {
    const view = await show(build(seed()));
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '剃刀');
    await fireEvent.press(view.getByLabelText('把剃和刀合併'));
    await fireEvent.press(view.getByLabelText('把剃和刀拆開'));

    expect(view.getByLabelText('剃的讀音')).toBeTruthy();
    expect(view.getByLabelText('刀的讀音')).toBeTruthy();
  });

  it('接縫的觸控目標是 44 點見方（HIG B-01）', async () => {
    const view = await show(build(seed()));
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '剃刀');
    const seam = view.getByLabelText('把剃和刀合併');
    // 可按區域裡面那一塊才是量得到尺寸的東西，`Pressable` 本身不設寬高。
    const inner = seam.children[0];
    if (typeof inner === 'string') throw new Error('接縫底下應該是一塊 View，不是一段文字');
    const box = StyleSheet.flatten(inner!.props.style as never) as { width?: number; height?: number };
    expect({ width: box.width, height: box.height }).toEqual({ width: 44, height: 44 });
  });

  it('打字加了一個漢字時讀音格跟著長出來，已經填的不會被清掉', async () => {
    const view = await show(build(seed()));
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '焦がす');
    await fireEvent.changeText(view.getByLabelText('焦的讀音'), 'こ');
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '焦がす。漂');

    expect(view.getByLabelText('焦的讀音').props.defaultValue).toBe('こ');
    expect(view.getByLabelText('漂的讀音')).toBeTruthy();
  });
});

/**
 * AI（Artificial Intelligence，人工智慧）讀音預填。
 *
 * 五條守門、搶答檢查、提示字的生死全在 `core/lib/reading-editor.ts`，那一支有 37 條測試。
 * 這裡只驗接線：問出去了沒、填得進格子沒、失敗那句話畫得出來沒。
 */
describe('AI 讀音預填', () => {
  /** 一支假的 AI：記下被問了什麼，何時回、回什麼一律由測試決定，不發任何請求。 */
  function fakeAsk() {
    const asked: string[] = [];
    let settle: { resolve(value: unknown): void; reject(reason: unknown): void } | null = null;
    const ask: Ask = (term) => {
      asked.push(term);
      return new Promise((resolve, reject) => {
        settle = { resolve, reject };
      });
    };
    return {
      asked,
      ask,
      reply: (value: unknown) => settle?.resolve(value),
      fail: (message: string) => settle?.reject(new Error(message)),
    };
  }

  const 回一格 = (kanji: string, reading: string) => ({
    termKana: 'かな',
    runs: [{ splittable: true, cells: [{ kanji, reading }] }],
  });

  it('詞條打完離開輸入框就去問，問的是那一串', async () => {
    const ai = fakeAsk();
    const view = await show(build(seed()), null, ai.ask);
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '焦がす');
    await fireEvent(view.getByPlaceholderText('焦がす'), 'blur');

    expect(ai.asked).toEqual(['焦がす']);
    expect(view.getByText('詢問中…')).toBeTruthy();
  });

  it('回覆進來就填進格子，並掛上「請確認」', async () => {
    const ai = fakeAsk();
    const view = await show(build(seed()), null, ai.ask);
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '焦がす');
    await fireEvent(view.getByPlaceholderText('焦がす'), 'blur');
    await act(async () => {
      ai.reply(回一格('焦', 'こ'));
    });

    expect(view.getByLabelText('焦的讀音').props.defaultValue).toBe('こ');
    expect(view.getByText('讀音由 AI 填入，請確認')).toBeTruthy();
  });

  it('失敗時提示字說得出原因，讀音格留空', async () => {
    const ai = fakeAsk();
    const view = await show(build(seed()), null, ai.ask);
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '焦がす');
    await fireEvent(view.getByPlaceholderText('焦がす'), 'blur');
    await act(async () => {
      ai.fail('連不上');
    });

    expect(view.getByText('自動填讀音失敗：連不上')).toBeTruthy();
    expect(view.getByLabelText('焦的讀音').props.defaultValue).toBe('');
  });

  it('沒有人可問時全程靜默：一個字都不出', async () => {
    const view = await show(build(seed()), null, null);
    await fireEvent.changeText(view.getByPlaceholderText('焦がす'), '焦がす');
    await fireEvent(view.getByPlaceholderText('焦がす'), 'blur');

    expect(view.queryByText('詢問中…')).toBeNull();
  });

  it('開舊卡不會去問——那幾格已經有字了', async () => {
    const ai = fakeAsk();
    const view = await show(build(seed([排程過的卡])), 排程過的卡, ai.ask);
    await fireEvent(view.getByPlaceholderText('焦がす'), 'blur');

    expect(ai.asked).toEqual([]);
  });
});
