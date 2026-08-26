// 這一支是 mobile/ 自己新寫的，所以直接寫 Jest。`core/` 那批仍寫著 `from 'vitest'`
// 並靠 `../test/vitest-shim.ts` 轉接——那個包袱只屬於搬過來的舊測試（票 `02`）。
import { describe, it, expect, jest } from '@jest/globals';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createStore, type StorageLike } from '@core/lib/storage';
import { DEFAULT_EASE } from '@core/lib/review';
import type { AppData } from '@core/lib/types';
import { createReviewSession, type ReviewSession } from '../lib/review-session';
import { ReviewScreen, ratingsFitOneRow } from './review-screen';

/**
 * 複習畫面的畫面測試。`ADR-0014` 那批 jsdom 畫面測試在 React Native 上作廢，
 * 這是改用 React Native 自己那套工具重寫的第一支（見 `.scratch/rn-rewrite/spec.md`
 * 的〈測試決定〉）。它守的是票 `06` 驗收第 1 條：**複習流程走得完**。
 *
 * 排程與佇列那一層由 `../lib/review-session.test.ts` 守，這裡只驗接線：
 * 按下去有沒有真的走到狀態機、狀態變了畫面有沒有跟著換。
 */

/** `SafeAreaProvider` 在測試裡量不到真正的螢幕，先給它一組固定值。 */
const FRAME = { x: 0, y: 0, width: 390, height: 844 };
const INSETS = { top: 47, left: 0, right: 0, bottom: 34 };

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

function seed(books: AppData['books'], cards: AppData['cards']): AppData {
  const ids = books.map((book) => book.id);
  return { version: 3, books, cards, scopes: { review: ids, list: ids, stats: ids }, updatedAt: 0 };
}

/** 亂數固定成「每張卡都跟自己交換」，佇列順序因此就是卡片原本的順序。見狀態機那支測試。 */
function build(data: AppData): ReviewSession {
  const store = createStore(fakeStorage());
  store.save(data);
  return createReviewSession({
    store,
    now: () => new Date(2026, 7, 25),
    random: () => 0.999999,
    onChange: () => {},
  });
}

/**
 * 畫一次，交回查詢函式與一支 `redraw()`。
 *
 * 狀態機不經過 React 的 state，畫面因此不會自己重畫；正式跑的時候是 `App.tsx` 收到
 * `onChange` 之後重畫（見那支檔案）。測試裡由 `redraw()` 代勞，按下按鈕之後叫一次。
 */
async function show(session: ReviewSession, onOpenProbe: () => void = () => {}) {
  // 每次都造一個新的 element。**同一個 element 物件遞第二次的話 React 會直接跳過重畫**，
  // 而狀態機的改變不經過 props，畫面就永遠停在第一次的樣子。
  // 正式跑的時候不會踩到：`App.tsx` 是靠自己重畫，每一輪本來就是新的 element。
  const tree = () => (
    <SafeAreaProvider initialMetrics={{ frame: FRAME, insets: INSETS }}>
      <ReviewScreen session={session} onOpenProbe={onOpenProbe} />
    </SafeAreaProvider>
  );
  const rendered = await render(tree());
  return Object.assign(rendered, { redraw: () => rendered.rerender(tree()) });
}

const 一張卡 = seed(
  [{ id: 'A', name: '甲本' }],
  [{ id: 'c1', bookId: 'A', text: '焦[こ]がす', meaning: '燒焦', interval: null, ease: DEFAULT_EASE, due: null }],
);

const 兩張卡 = seed(
  [{ id: 'A', name: '甲本' }],
  [
    { id: 'c1', bookId: 'A', text: '一', meaning: '第一張', interval: null, ease: DEFAULT_EASE, due: null },
    { id: 'c2', bookId: 'A', text: '二', meaning: '第二張', interval: null, ease: DEFAULT_EASE, due: null },
  ],
);

describe('複習流程', () => {
  it('蓋著答案時只看得到詞條原文，看不到讀音，也看不到釋義', async () => {
    const view = await show(build(一張卡));
    expect(view.getByText('焦')).toBeTruthy();
    expect(view.queryByText('こ')).toBeNull();
    expect(view.queryByText('燒焦')).toBeNull();
  });

  it('蓋著答案時底下是一顆「顯示答案」，沒有評分鈕', async () => {
    const view = await show(build(一張卡));
    expect(view.getByText('顯示答案')).toBeTruthy();
    expect(view.queryByText('好')).toBeNull();
  });

  it('掀開之後長出讀音、釋義與四顆評分鈕', async () => {
    const view = await show(build(一張卡));
    await fireEvent.press(view.getByText('顯示答案'));
    await view.redraw();

    expect(view.getByText('こ')).toBeTruthy();
    expect(view.getByText('燒焦')).toBeTruthy();
    for (const label of ['再次', '困難', '好', '簡單']) expect(view.getByText(label)).toBeTruthy();
    expect(view.queryByText('顯示答案')).toBeNull();
  });

  it('評分之後換下一張，答案蓋回去', async () => {
    const view = await show(build(兩張卡));
    await fireEvent.press(view.getByText('顯示答案'));
    await view.redraw();
    await fireEvent.press(view.getByText('好'));
    await view.redraw();

    expect(view.getByText('二')).toBeTruthy();
    expect(view.queryByText('第二張')).toBeNull();
    expect(view.getByText('顯示答案')).toBeTruthy();
  });

  it('剩餘張數跟著佇列走', async () => {
    const view = await show(build(一張卡));
    expect(view.getByText('剩餘 1 張')).toBeTruthy();
    await fireEvent.press(view.getByText('顯示答案'));
    await view.redraw();
    await fireEvent.press(view.getByText('好'));
    await view.redraw();
    expect(view.getByText('剩餘 0 張')).toBeTruthy();
  });

  it('佇列清空後顯示今日份完成，底下不再有可按的東西', async () => {
    const view = await show(build(一張卡));
    await fireEvent.press(view.getByText('顯示答案'));
    await view.redraw();
    await fireEvent.press(view.getByText('好'));
    await view.redraw();

    expect(view.getByText('今日份完成')).toBeTruthy();
    expect(view.queryByText('顯示答案')).toBeNull();
    expect(view.queryByText('好')).toBeNull();
  });
});

describe('單字本開關', () => {
  it('收合時鈕上顯示目前的複習範圍', async () => {
    const view = await show(build(兩張卡));
    expect(view.getByText('全部 ▾')).toBeTruthy();
  });
});

describe('零本', () => {
  it('顯示另一套畫面', async () => {
    const view = await show(build(seed([], [])));
    expect(view.getByText('還沒有單字本')).toBeTruthy();
  });

  it('不放單字本開關——那時候選單是空的，放上去就是顆死按鈕', async () => {
    const view = await show(build(seed([], [])));
    expect(view.queryByText('全部 ▾')).toBeNull();
  });
});

describe('通往其他畫面的按鈕', () => {
  it('「編輯」與「卡片」這一版都不放，因為目的地還沒做', async () => {
    const view = await show(build(一張卡));
    expect(view.queryByText('編輯')).toBeNull();
    expect(view.queryByText('卡片')).toBeNull();
  });

  it('探針那顆後門按得到', async () => {
    const onOpenProbe = jest.fn();
    const view = await show(build(一張卡), onOpenProbe);
    await fireEvent.press(view.getByText('探針'));
    expect(onOpenProbe).toHaveBeenCalledTimes(1);
  });
});

describe('複製', () => {
  it('按鈕就在詞條旁邊，蓋著答案時也在', async () => {
    const view = await show(build(一張卡));
    expect(view.getByText('複製')).toBeTruthy();
  });

  it('按下去之後回報一次「已複製」', async () => {
    const view = await show(build(一張卡));
    await fireEvent.press(view.getByText('複製'));
    expect(view.getByText('已複製')).toBeTruthy();
  });
});

describe('評分鈕排不排得下同一列', () => {
  /** iPhone 直向大約這麼寬。真機用的是 `useWindowDimensions()`，這裡直接餵數字。 */
  const PHONE = 390;

  it('預設字級下四顆排得下', () => {
    expect(ratingsFitOneRow(PHONE, 1)).toBe(true);
  });

  it('字級拉到最大就排不下，那時候要改成上下堆疊', () => {
    // iOS 最大的輔助使用字級大約是預設的三倍。
    expect(ratingsFitOneRow(PHONE, 3)).toBe(false);
  });

  it('螢幕越窄越早排不下', () => {
    const wide = ratingsFitOneRow(430, 2.4);
    const narrow = ratingsFitOneRow(320, 2.4);
    expect(wide).toBe(true);
    expect(narrow).toBe(false);
  });

  /** 同一個字級下，寬的螢幕不該比窄的螢幕先放棄——算式寫反了才會這樣。 */
  it('寬度變大不會讓它反而排不下', () => {
    for (const scale of [1, 1.5, 2, 2.5, 3]) {
      if (ratingsFitOneRow(320, scale)) expect(ratingsFitOneRow(430, scale)).toBe(true);
    }
  });
});
