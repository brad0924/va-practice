// 這一支是 mobile/ 自己新寫的，所以直接寫 Jest。`core/` 那批仍寫著 `from 'vitest'`
// 並靠 `../test/vitest-shim.ts` 轉接——那個包袱只屬於搬過來的舊測試（票 `02`）。
import { describe, it, expect, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { createStore, type StorageLike } from '@core/lib/storage';
import { DEFAULT_EASE } from '@core/lib/review';
import type { AppData, Card } from '@core/lib/types';
import { createReviewSession, type ReviewSession } from '../lib/review-session';
import { CardsScreen } from './cards-screen';

/**
 * 卡片列表的畫面測試。守的是票 `15` 驗收裡**看得到過沒過**的那幾條：分桶、搜尋、排序、
 * 範圍、「共 N 張」、零本畫面。
 *
 * 分桶與搜尋比對那一層由 `core/lib/card-list.test.ts` 守，這裡只驗接線：
 * 畫出來的桶對不對、按下去有沒有真的走到狀態機、狀態變了畫面有沒有跟著換。
 *
 * **單字本管理那一半沒有畫面測試。** 新增、改名、刪除、匯入四支的判斷全在
 * `core/lib/storage.ts`（那裡有 `storage.test.ts`），而畫面這一側要碰的是系統的 sheet、
 * `Alert.alert()` 與檔案選擇器——三樣在這台機器上都是假的，測到的只會是假貨自己的行為。
 * 那幾條留給真機驗收。
 */

/**
 * `expo-router` 的 `Stack.Screen`／`Stack.SearchBar` 在這台機器上沒有原生導覽列可掛。
 *
 * 搜尋列換成一個普通的輸入框，**把同一支 `onChangeText` 接上去**。這樣測得到的是
 * 「打了字之後這一頁怎麼反應」，而系統那一半（往下捲收起、跟著鍵盤上滑）本來就不歸
 * 這台機器管——那幾件事在真機驗收上看。
 */
jest.mock('expo-router', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return {
    Stack: {
      Screen: () => null,
      // 型別直接寫在參數上。`jest.mock()` 的工廠不准引用外面的東西，
      // **具名的型別別名也算**——那條檢查是靜態的，看不出型別在執行時並不存在。
      SearchBar: ({
        placeholder,
        onChangeText,
      }: {
        placeholder?: string;
        onChangeText?: (event: { nativeEvent: { text: string } }) => void;
      }) =>
        React.createElement(TextInput, {
          placeholder,
          onChangeText: (text: string) => onChangeText?.({ nativeEvent: { text } }),
        }),
    },
  };
});

/** 選檔底下是原生的，Node 裡沒有那一半。這支測試不走匯入那條路，給個空殼即可。 */
jest.mock('expo-file-system', () => ({
  File: { pickFileAsync: () => Promise.resolve({ canceled: true, result: null }) },
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

/** 今天。卡片的到期日全部照這一天往前後排，桶才落得準。 */
const NOW = new Date(2026, 7, 25);

function card(id: string, bookId: string, text: string, meaning: string, due: string | null): Card {
  return { id, bookId, text, meaning, interval: due === null ? null : 1, ease: DEFAULT_EASE, due };
}

function seed(books: AppData['books'], cards: AppData['cards']): AppData {
  const ids = books.map((book) => book.id);
  return { version: 3, books, cards, scopes: { review: ids, list: ids, stats: ids }, updatedAt: 0 };
}

const 甲乙兩本 = [
  { id: 'A', name: '甲本' },
  { id: 'B', name: '乙本' },
];

/**
 * 六個桶各放得下一張的一副牌，外加一張在乙本。
 * `新` 沒有到期日；`現在` 逾期；`今天`／`明天`／`週內`／`未來` 各自往後排。
 */
const 六桶各一張 = seed(甲乙兩本, [
  card('c-new', 'A', '焦[こ]がす', '燒焦', null),
  card('c-now', 'A', '漂[ただよ]う', '漂浮', '2026-08-20'),
  card('c-today', 'A', '企[くわだ]てる', '企圖', '2026-08-25'),
  card('c-tomorrow', 'A', '阻[はば]む', '阻擋', '2026-08-26'),
  card('c-week', 'A', '偽[いつわ]る', '偽裝', '2026-08-28'),
  card('c-future', 'B', '慰[なぐさ]める', '安慰', '2026-11-14'),
]);

/** 亂數固定成「每張卡都跟自己交換」。這一頁不洗牌，但狀態機開場會建佇列。 */
function build(data: AppData): ReviewSession {
  const store = createStore(fakeStorage());
  store.save(data);
  return createReviewSession({
    store,
    now: () => NOW,
    random: () => 0.999999,
    onChange: () => {},
    haptic: () => {},
  });
}

/**
 * 畫一次，交回查詢函式、一支 `redraw()` 與「點過哪幾張卡」。
 *
 * 狀態機不經過 React 的 state，畫面因此不會自己重畫；正式跑的時候是
 * `../lib/app-context.tsx` 收到 `onChange` 之後重畫。測試裡由 `redraw()` 代勞。
 */
async function show(session: ReviewSession) {
  const opened: Card[] = [];
  // 每次都造一個新的 element：同一個物件遞第二次的話 React 會直接跳過重畫。
  // 導覽列上那顆 ＋ 在這台機器上畫不出來（上面把 Stack.Screen 換成了一個空殼），
  // 所以這一支給一個什麼都不做的。新增那條路由編輯畫面自己的測試守。
  const tree = () => (
    <CardsScreen session={session} now={() => NOW} onOpenCard={(card) => opened.push(card)} onAddCard={() => {}} />
  );
  const rendered = await render(tree());
  return Object.assign(rendered, { redraw: () => rendered.rerender(tree()), opened });
}

/** 桶標頭上的字：`▾ ` 或 `▸ `、桶名、全形空白加張數，三段拼在同一個 `<Text>` 裡。 */
const bucketHead = (view: Awaited<ReturnType<typeof show>>, label: string) =>
  view.getByLabelText(new RegExp(`^${label} \\d+$`));

describe('六個時間桶', () => {
  it('六個桶都畫出來，順序由急到緩', async () => {
    const view = await show(build(六桶各一張));
    for (const label of ['新', '現在', '<24小時', '明天', '<1週', '未來']) {
      expect(bucketHead(view, label)).toBeTruthy();
    }
  });

  it('一開始六桶全收合，看不到任何一張卡', async () => {
    const view = await show(build(六桶各一張));
    expect(view.queryByText('燒焦')).toBeNull();
    expect(view.queryByText('漂浮')).toBeNull();
  });

  it('點一個桶只展開那一個，別的不動', async () => {
    const view = await show(build(六桶各一張));
    await fireEvent.press(bucketHead(view, '新'));

    expect(view.getByText('燒焦')).toBeTruthy();
    expect(view.queryByText('漂浮')).toBeNull();
  });

  it('再點一次收回去', async () => {
    const view = await show(build(六桶各一張));
    await fireEvent.press(bucketHead(view, '新'));
    await fireEvent.press(bucketHead(view, '新'));
    expect(view.queryByText('燒焦')).toBeNull();
  });

  it('空桶仍然顯示並標 0——「明天 0」本身是資訊', async () => {
    const 只有新卡 = seed(甲乙兩本, [card('c-new', 'A', '焦[こ]がす', '燒焦', null)]);
    const view = await show(build(只有新卡));
    expect(view.getByLabelText('明天 0')).toBeTruthy();
    expect(view.getByLabelText('新 1')).toBeTruthy();
  });
});

/**
 * 顏色。**這幾條守的是「有沒有換錯色」，不是「好不好看」。**
 *
 * 六個桶色與振假名的藍都是寫死的色碼（抄網頁版 `src/styles.css`），維護者 2026-08-31
 * 在真機上指定的。寫死的值沒有型別擋得住打錯一位數，也沒有工具看得出「明天」拿到了
 * 「未來」那一格——只有這裡擋得下來。
 */
describe('顏色', () => {
  const colorOf = (node: { props: { style?: unknown } }) =>
    (StyleSheet.flatten(node.props.style as never) as { color?: unknown }).color;

  it('六個桶名各自帶自己的顏色，值與網頁版一致', async () => {
    // 順序即畫面由上而下。對照 `src/styles.css` 的 `.bucket-head.*`。
    const expected: [string, string][] = [
      ['新', '#9a7fe0'],
      ['現在', '#e0574f'],
      ['<24小時', '#d9843f'],
      ['明天', '#d9c14f'],
      ['<1週', '#4a90d9'],
      ['未來', '#46a758'],
    ];
    const view = await show(build(六桶各一張));
    for (const [label, tint] of expected) {
      expect(colorOf(view.getByText(label))).toBe(tint);
    }
  });

  it('桶上那個張數不上色——它是次要資訊，跟著上色會跟桶名搶注意', async () => {
    // 只放一張新卡：那時候整頁只有一個「　1」，抓得到唯一的那個。
    // 六桶各一張的話六個標頭上都是「　1」，指不出是哪一個。
    const view = await show(build(seed(甲乙兩本, [card('c-new', 'A', '焦[こ]がす', '燒焦', null)])));
    // 桶名與張數在同一條標頭裡，顏色必須不同。張數走的是 iOS 的語意灰，
    // `PlatformColor` 攤平之後不是字串，因此比的是「不等於桶色」而不是某個值。
    expect(colorOf(view.getByText('新'))).toBe('#9a7fe0');
    expect(colorOf(view.getByText('　1'))).not.toBe('#9a7fe0');
  });

  /**
   * 振假名是 `./term.tsx` 的事，複習畫面用的是同一份。守在這裡是因為改動的觸發點在
   * 這一頁——網頁版三處振假名（複習、卡片列、編輯預覽）都是同一個 `--accent`。
   */
  it('振假名是網頁版那個藍，不是 systemBlue', async () => {
    const view = await show(build(六桶各一張));
    await fireEvent.press(bucketHead(view, '明天'));
    expect(colorOf(view.getByText('はば'))).toBe('#6ea8ff');
  });
});

describe('排序', () => {
  it('切成倒序時桶順序整個顛倒', async () => {
    const view = await show(build(六桶各一張));
    const before = view.getAllByLabelText(/^\S+ \d+$/).map((node) => node.props.accessibilityLabel);

    await fireEvent.press(view.getByLabelText(/切換到期排序方向/));
    await view.redraw();

    const after = view.getAllByLabelText(/^\S+ \d+$/).map((node) => node.props.accessibilityLabel);
    expect(after).toEqual([...before].reverse());
  });

  it('鈕面上的字跟著方向換', async () => {
    const view = await show(build(六桶各一張));
    expect(view.getByText('到期 ↑')).toBeTruthy();

    await fireEvent.press(view.getByLabelText(/切換到期排序方向/));
    await view.redraw();

    expect(view.getByText('到期 ↓')).toBeTruthy();
  });
});

describe('「共 N 張」', () => {
  it('沒搜尋時報範圍內的張數', async () => {
    const view = await show(build(六桶各一張));
    expect(view.getByText('共 6 張')).toBeTruthy();
  });

  it('N 是範圍內的張數，不是全 app 的——切掉乙本，那一張不算進去', async () => {
    const session = build(六桶各一張);
    const data = session.snapshot().data;
    session.applyData({ ...data, scopes: { ...data.scopes, list: ['A'] } });

    const view = await show(session);
    expect(view.getByText('共 5 張')).toBeTruthy();
  });
});

describe('單字本範圍', () => {
  it('鈕面上是目前的範圍', async () => {
    const view = await show(build(六桶各一張));
    expect(view.getByText('全部 ▾')).toBeTruthy();
  });

  it('只剩一本時鈕面換成那一本的名字', async () => {
    const session = build(六桶各一張);
    const data = session.snapshot().data;
    session.applyData({ ...data, scopes: { ...data.scopes, list: ['A'] } });

    const view = await show(session);
    expect(view.getByText('甲本 ▾')).toBeTruthy();
  });

  /** 三組範圍互不影響。改了 `list` 之後 `review` 與 `stats` 要原封不動。 */
  it('改的是 list 那一組，複習與統計的範圍不受影響', async () => {
    const session = build(六桶各一張);
    const data = session.snapshot().data;
    session.applyData({ ...data, scopes: { ...data.scopes, list: ['A'] } });

    const after = session.snapshot().data.scopes;
    expect(after.list).toEqual(['A']);
    expect(after.review).toEqual(['A', 'B']);
    expect(after.stats).toEqual(['A', 'B']);
  });
});

describe('卡片列', () => {
  it('詞條、釋義、所屬的本與到期日都畫得出來', async () => {
    const view = await show(build(六桶各一張));
    await fireEvent.press(bucketHead(view, '明天'));

    expect(view.getByText('阻')).toBeTruthy();
    expect(view.getByText('阻擋')).toBeTruthy();
    expect(view.getByText('甲本')).toBeTruthy();
    expect(view.getByText('2026-08-26')).toBeTruthy();
  });

  it('詞條上有振假名——這一頁是在找卡片，不是在測驗讀法', async () => {
    const view = await show(build(六桶各一張));
    await fireEvent.press(bucketHead(view, '明天'));
    expect(view.getByText('はば')).toBeTruthy();
  });

  it('新卡不長出到期日那一欄，也不填佔位字元', async () => {
    const view = await show(build(六桶各一張));
    await fireEvent.press(bucketHead(view, '新'));

    expect(view.getByText('燒焦')).toBeTruthy();
    expect(view.queryByText('—')).toBeNull();
    expect(view.queryByText('null')).toBeNull();
  });

  it('點一列把那張卡交出去——編輯畫面的接縫（票 16）', async () => {
    const view = await show(build(六桶各一張));
    await fireEvent.press(bucketHead(view, '新'));
    await fireEvent.press(view.getByLabelText('焦がす，燒焦'));

    expect(view.opened.map((card) => card.id)).toEqual(['c-new']);
  });
});

describe('搜尋', () => {
  /** 打字：走的是正式碼接在系統搜尋列上的那支處理器（見檔頂的 mock）。 */
  const type = async (view: Awaited<ReturnType<typeof show>>, text: string) => {
    await fireEvent.changeText(view.getByPlaceholderText('搜尋詞條、讀音或釋義'), text);
    await view.redraw();
  };

  it('比對得到讀音，而且結果直接看得到——不必再去點開那個桶', async () => {
    const view = await show(build(六桶各一張));
    await type(view, 'ただよ');
    expect(view.getByText('漂浮')).toBeTruthy();
  });

  it('搜尋中六桶全展開', async () => {
    const view = await show(build(六桶各一張));
    // 先確認不是「本來就展開著」——這一頁開場是六桶全收合。
    expect(view.queryByText('漂浮')).toBeNull();
    await type(view, '漂');
    expect(view.getByText('漂浮')).toBeTruthy();
  });

  it('搜尋中空桶藏起來，免得幾行「0」把結果擠下去', async () => {
    const view = await show(build(六桶各一張));
    await type(view, 'ただよ');

    expect(bucketHead(view, '現在')).toBeTruthy();
    expect(view.queryByLabelText(/^新 \d+$/)).toBeNull();
    expect(view.queryByLabelText(/^明天 \d+$/)).toBeNull();
  });

  it('搜尋中「共 N 張」報的是「符合幾張，共幾張」', async () => {
    const view = await show(build(六桶各一張));
    await type(view, 'ただよ');
    expect(view.getByText('符合 1 張，共 6 張')).toBeTruthy();
  });

  /**
   * 票 `15` 驗收第 2 條的後半：**清空後還原成搜尋前的收合狀態**，
   * 不是還原成「全收合」，也不是留著搜尋期間的全展開。
   */
  it('清空搜尋框還原成搜尋前的收合狀態', async () => {
    const view = await show(build(六桶各一張));
    // 搜尋前：只把「新」點開。
    await fireEvent.press(bucketHead(view, '新'));
    expect(view.getByText('燒焦')).toBeTruthy();

    await type(view, 'ただよ');
    await type(view, '');

    // 「新」還開著，其餘仍然收著——搜尋期間那次全展開沒有被帶回來。
    expect(view.getByText('燒焦')).toBeTruthy();
    expect(view.queryByText('漂浮')).toBeNull();
  });
});

describe('零本', () => {
  it('一本都沒有時是另一套畫面，沒有六個桶', async () => {
    const view = await show(build(seed([], [])));
    expect(view.getByText('還沒有單字本')).toBeTruthy();
    expect(view.queryByLabelText(/^新 \d+$/)).toBeNull();
  });

  /**
   * 票 `15` 驗收第 9 條：那顆鈕要指向**這一頁自己的**新增入口，不是叫人去別頁找。
   * 網頁版那顆「去建立單字本」會跳去資料頁，因為建立介面住在那一頁。
   */
  it('那顆鈕是「＋ 新增單字本」，不是叫人去別的畫面', async () => {
    const view = await show(build(seed([], [])));
    expect(view.getByText('＋ 新增單字本')).toBeTruthy();
    expect(view.queryByText('去建立單字本')).toBeNull();
  });
});
