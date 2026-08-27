// 這一支是 mobile/ 自己新寫的，所以直接寫 Jest。`core/` 那批仍寫著 `from 'vitest'`
// 並靠 `../test/vitest-shim.ts` 轉接——那個包袱只屬於搬過來的舊測試（票 `02`）。
import { describe, it, expect, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createStore, type StorageLike } from '@core/lib/storage';
import { DEFAULT_EASE } from '@core/lib/review';
import type { AppData } from '@core/lib/types';
import { createReviewSession, type ReviewSession } from '../lib/review-session';
import { ReviewScreen, ratingsFitOneRow } from './review-screen';
import { color } from './theme';

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

/**
 * 這顆按鈕裡的 SF Symbol 叫什麼名字。
 *
 * `expo-symbols` 在測試環境裡畫出來的是一個叫 `ViewManagerAdapter_SymbolModule` 的
 * 節點，符號名字原封不動留在它的 `name` 上——**查得到名字，就查得到「有沒有換錯符號」**。
 * 名字打錯由 `tsc` 擋（型別收了 SF Symbols 全表），換錯只有這裡擋得下來。
 */
function symbolNames(button: { queryAll(match: (node: { type: unknown }) => boolean): { props: { name?: unknown } }[] }) {
  return button
    .queryAll((node) => typeof node.type === 'string' && node.type.includes('SymbolModule'))
    .map((node) => node.props.name);
}

/** 亂數固定成「每張卡都跟自己交換」，佇列順序因此就是卡片原本的順序。見狀態機那支測試。 */
function build(data: AppData, haptic: () => void = () => {}): ReviewSession {
  const store = createStore(fakeStorage());
  store.save(data);
  return createReviewSession({
    store,
    now: () => new Date(2026, 7, 25),
    random: () => 0.999999,
    onChange: () => {},
    haptic,
  });
}

/**
 * 畫一次，交回查詢函式與一支 `redraw()`。
 *
 * 狀態機不經過 React 的 state，畫面因此不會自己重畫；正式跑的時候是 `../lib/app-context.tsx` 收到
 * `onChange` 之後重畫（見那支檔案）。測試裡由 `redraw()` 代勞，按下按鈕之後叫一次。
 */
async function show(session: ReviewSession) {
  // 每次都造一個新的 element。**同一個 element 物件遞第二次的話 React 會直接跳過重畫**，
  // 而狀態機的改變不經過 props，畫面就永遠停在第一次的樣子。
  // 正式跑的時候不會踩到：`AppProvider` 是靠自己重畫，每一輪本來就是新的 element。
  const tree = () => (
    <SafeAreaProvider initialMetrics={{ frame: FRAME, insets: INSETS }}>
      <ReviewScreen session={session} />
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

/**
 * 票 `09` 之後**這一頁不通往任何地方**，換頁全部交給底部的導覽列。
 * 標題列上那顆「探針」跟著沒了，它現在是導覽列上「資料」那個 tab。
 */
describe('通往其他畫面的按鈕', () => {
  it('「編輯」與「卡片」都不放，因為那是導覽列的事', async () => {
    const view = await show(build(一張卡));
    expect(view.queryByText('編輯')).toBeNull();
    expect(view.queryByText('卡片')).toBeNull();
  });

  it('標題列上沒有「探針」那顆後門了', async () => {
    const view = await show(build(一張卡));
    expect(view.queryByText('探針')).toBeNull();
    expect(view.queryByLabelText('探針')).toBeNull();
  });
});

/**
 * 票 `08` 驗收第三條的程式碼那一半：**觸覺只加在評分上**。
 *
 * 這一頁不知道觸覺存在——震的那一下接在狀態機的 `rate()` 裡（見 `../lib/review-session.ts`）。
 * 因此這裡驗的不是這一頁做了什麼，而是**它沒有偷偷多接一條**：按下複製或掀開答案時，
 * 那條線不該被碰到。真的震不震只有真機驗得了，這支守的是「以後有人加第二處」。
 */
describe('觸覺只加在評分上', () => {
  it('按評分鈕震一下', async () => {
    const haptic = jest.fn();
    const view = await show(build(一張卡, haptic));
    await fireEvent.press(view.getByText('顯示答案'));
    await view.redraw();
    await fireEvent.press(view.getByText('好'));
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it('掀開答案與複製都不震', async () => {
    const haptic = jest.fn();
    const view = await show(build(一張卡, haptic));
    await fireEvent.press(view.getByLabelText('複製'));
    await fireEvent.press(view.getByText('顯示答案'));
    await view.redraw();
    expect(haptic).not.toHaveBeenCalled();
  });
});

/**
 * 這一組原本查的是鈕上那行字。票 `09` 把它換成圓形圖示鈕（樣版 1a），鈕面上沒有字了，
 * 因此改查唸出來的那一句——**那是換掉外觀之後還留著的同一個承諾**：這顆鈕叫「複製」，
 * 按下去會回報「已複製」。
 */
describe('複製', () => {
  it('按鈕在卡片最下面那一排，蓋著答案時也在', async () => {
    const view = await show(build(一張卡));
    expect(view.getByLabelText('複製')).toBeTruthy();
  });

  it('按下去之後回報一次「已複製」', async () => {
    const view = await show(build(一張卡));
    await fireEvent.press(view.getByLabelText('複製'));
    expect(view.getByLabelText('已複製')).toBeTruthy();
  });

  /** `B-14`：系統已經有的符號不自己畫。打錯字 `tsc` 擋得下來，換錯符號只有這裡擋得下來。 */
  it('用的是系統符號 doc.on.doc，按下去換成一個勾', async () => {
    const view = await show(build(一張卡));
    expect(symbolNames(view.getByLabelText('複製'))).toEqual(['doc.on.doc']);
    await fireEvent.press(view.getByLabelText('複製'));
    expect(symbolNames(view.getByLabelText('已複製'))).toEqual(['checkmark']);
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

  /**
   * 這裡的字級原本填 2.4，2026-08-26 改成 1.5。**不是放寬標準，是算式終於誠實了**：
   * 它以前用一個「評分鈕左右各留 4」的數字，而那個內距從來沒有真的畫出來過
   * （它被套在裡層的玻璃上，外層才是排在列裡的那一個）。改成真正的 `PILL_PADDING_H`
   * 之後，四顆本來就會比以前更早堆疊——這是它一直以來實際的樣子。
   */
  it('螢幕越窄越早排不下', () => {
    const wide = ratingsFitOneRow(430, 1.5);
    const narrow = ratingsFitOneRow(320, 1.5);
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

describe('評分鈕與「顯示答案」的顏色', () => {
  /**
   * 四個顏色沿用網頁版 `src/styles.css` 的 `--again`／`--hard`／`--good`／`--easy`。
   * 這一條守的是「換一台裝置不必重新學哪一顆是哪一顆」——維護者兩邊都在用。
   */
  const 評分色 = {
    再次: '#d9534f',
    困難: '#d9843f',
    好: '#46a758',
    簡單: '#4a90d9',
  } as const;

  it('四顆的文字各自上色，與網頁版同一組', async () => {
    const view = await show(build(一張卡));
    await fireEvent.press(view.getByText('顯示答案'));
    await view.redraw();

    for (const [label, tint] of Object.entries(評分色))
      expect(StyleSheet.flatten(view.getByText(label).props.style).color).toBe(tint);
  });

  it('四顆沒有兩顆撞色', () => {
    const tints = Object.values(評分色);
    expect(new Set(tints).size).toBe(tints.length);
  });

  it('「顯示答案」的字走系統藍，不是上色背景配白字', async () => {
    const view = await show(build(一張卡));
    expect(StyleSheet.flatten(view.getByText('顯示答案').props.style).color).toBe(color.accent);
  });
});
