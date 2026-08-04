import { describe, it, expect } from 'vitest';
import {
  parseReading,
  toPlainText,
  toReadingText,
  toDraft,
  toMarkup,
  rebuildRuns,
  mergeSeam,
  splitCellAt,
  validateDraft,
  acceptPrefill,
  type KanjiRun,
} from './reading';

describe('讀音標記解析', () => {
  it('單一漢字加送假名', () => {
    expect(parseReading('焦[こ]がす')).toEqual([
      { text: '焦', reading: 'こ' },
      { text: 'がす' },
    ]);
  });

  it('連續漢字共用一段讀音', () => {
    expect(parseReading('帰省[きせい]')).toEqual([{ text: '帰省', reading: 'きせい' }]);
  });

  it('多段漢字各自標讀音，送假名邊界正確切開', () => {
    expect(parseReading('書[か]き下[お]ろす')).toEqual([
      { text: '書', reading: 'か' },
      { text: 'き' },
      { text: '下', reading: 'お' },
      { text: 'ろす' },
    ]);
  });

  it('讀音只吃緊鄰括號的漢字，前面的假名不被吞掉', () => {
    expect(parseReading('送[おく]り仮名[がな]')).toEqual([
      { text: '送', reading: 'おく' },
      { text: 'り' },
      { text: '仮名', reading: 'がな' },
    ]);
  });

  it('純假名詞條沒有讀音', () => {
    expect(parseReading('ざるを得[え]ない')).toEqual([
      { text: 'ざるを' },
      { text: '得', reading: 'え' },
      { text: 'ない' },
    ]);
  });

  it('外來語完全沒有標記時視為單一無讀音區段', () => {
    expect(parseReading('シンポジウム')).toEqual([{ text: 'シンポジウム' }]);
  });

  it('空字串回傳空陣列', () => {
    expect(parseReading('')).toEqual([]);
  });

  it('括號前沒有漢字時原樣保留，不當成讀音', () => {
    expect(parseReading('あ[い]')).toEqual([{ text: 'あ[い]' }]);
  });

  it('未閉合的方括號原樣保留', () => {
    expect(parseReading('焦[こ')).toEqual([{ text: '焦[こ' }]);
  });

  it('疊字符號算漢字', () => {
    expect(parseReading('人々[ひとびと]')).toEqual([{ text: '人々', reading: 'ひとびと' }]);
  });
});

describe('文字轉換', () => {
  it('去掉標記後得到詞條原文', () => {
    expect(toPlainText('書[か]き下[お]ろす')).toBe('書き下ろす');
    expect(toPlainText('シンポジウム')).toBe('シンポジウム');
  });

  it('以讀音取代漢字後得到朗讀用的假名字串', () => {
    expect(toReadingText('書[か]き下[お]ろす')).toBe('かきおろす');
    expect(toReadingText('シンポジウム')).toBe('シンポジウム');
  });
});

describe('標記字串攤成讀音格 toDraft', () => {
  it('漢仮：焦[こ]がす', () => {
    expect(toDraft('焦[こ]がす')).toEqual({
      term: '焦がす',
      runs: [{ start: 0, cells: [{ kanji: '焦', reading: 'こ' }] }],
    });
  });

  it('漢：帰省[きせい] 產生一格，不逐字拆', () => {
    expect(toDraft('帰省[きせい]')).toEqual({
      term: '帰省',
      runs: [{ start: 0, cells: [{ kanji: '帰省', reading: 'きせい' }] }],
    });
  });

  it('仮：純假名沒有任何讀音格', () => {
    expect(toDraft('くしゃみ')).toEqual({ term: 'くしゃみ', runs: [] });
  });

  it('漢仮漢仮：考[かんが]え込[こ]む', () => {
    expect(toDraft('考[かんが]え込[こ]む')).toEqual({
      term: '考え込む',
      runs: [
        { start: 0, cells: [{ kanji: '考', reading: 'かんが' }] },
        { start: 2, cells: [{ kanji: '込', reading: 'こ' }] },
      ],
    });
  });

  it('漢仮漢：送[おく]り仮名[がな]', () => {
    expect(toDraft('送[おく]り仮名[がな]')).toEqual({
      term: '送り仮名',
      runs: [
        { start: 0, cells: [{ kanji: '送', reading: 'おく' }] },
        { start: 2, cells: [{ kanji: '仮名', reading: 'がな' }] },
      ],
    });
  });

  it('仮漢仮：ざるを得[え]ない', () => {
    expect(toDraft('ざるを得[え]ない')).toEqual({
      term: 'ざるを得ない',
      runs: [{ start: 3, cells: [{ kanji: '得', reading: 'え' }] }],
    });
  });

  it('未標音的多字漢字串逐字兩格', () => {
    expect(toDraft('書留')).toEqual({
      term: '書留',
      runs: [
        {
          start: 0,
          cells: [
            { kanji: '書', reading: '' },
            { kanji: '留', reading: '' },
          ],
        },
      ],
    });
  });

  it('緊鄰的兩串標音各成一格，合為同一串', () => {
    expect(toDraft('書[かき]留[とめ]')).toEqual({
      term: '書留',
      runs: [
        {
          start: 0,
          cells: [
            { kanji: '書', reading: 'かき' },
            { kanji: '留', reading: 'とめ' },
          ],
        },
      ],
    });
  });

  it('邊界字串不當掉', () => {
    expect(toDraft('')).toEqual({ term: '', runs: [] });
    expect(toDraft('あ[い]')).toEqual({ term: 'あ[い]', runs: [] });
    expect(toDraft('焦[こ')).toEqual({
      term: '焦[こ',
      runs: [{ start: 0, cells: [{ kanji: '焦', reading: '' }] }],
    });
    expect(toDraft('人々[ひとびと]')).toEqual({
      term: '人々',
      runs: [{ start: 0, cells: [{ kanji: '人々', reading: 'ひとびと' }] }],
    });
  });
});

describe('讀音格重建標記 toMarkup', () => {
  it('有讀音輸出漢字[讀音]，沒讀音原樣輸出', () => {
    expect(
      toMarkup({
        term: '書留',
        runs: [
          {
            start: 0,
            cells: [
              { kanji: '書', reading: 'かき' },
              { kanji: '留', reading: '' },
            ],
          },
        ],
      }),
    ).toBe('書[かき]留');
  });
});

// 打開一張既有的卡（toDraft）什麼都不改直接存（toMarkup），字串必須原樣不動——
// 位置算歪一格就會把使用者沒碰過的卡寫壞。
// 以下涵蓋標記字串的每一種形狀：已標音的漢字串出現在詞首／詞中／詞尾、
// 相鄰兩串與三串、多字共用一個讀音、完全未標音的漢字串、純假名、疊字，
// 以及兩個不合語法但必須原樣保留的邊界字串。
describe('往返：toMarkup(toDraft) 不變形', () => {
  it.each([
    '焦[こ]がす',
    '崖[がけ]',
    '帰省[きせい]',
    '作[さく]物[もつ]',
    '心[こころ]構[がま]え',
    '吐[は]き気[け]',
    '考[かんが]え込[こ]む',
    'ざるを得[え]ない',
    '就[しゅう]職[しょく]難[なん]',
    '送[おく]り仮[が]名[な]',
    '書留',
    'シンポジウム',
    '人々[ひとびと]',
    'あ[い]',
    '焦[こ',
  ])('%s 原樣還原', (markup) => {
    expect(toMarkup(toDraft(markup))).toBe(markup);
  });
});

describe('合併縫 mergeSeam', () => {
  it('書[かき] 留[とめ] → 書留[かきとめ]', () => {
    const run: KanjiRun = {
      start: 0,
      cells: [
        { kanji: '書', reading: 'かき' },
        { kanji: '留', reading: 'とめ' },
      ],
    };
    expect(mergeSeam(run, 0)).toEqual({
      start: 0,
      cells: [{ kanji: '書留', reading: 'かきとめ' }],
    });
  });

  it('今[] 日[] 中[] 連點第 0 道縫 → 今日[] 中[]，toMarkup 得 今日中', () => {
    const run: KanjiRun = {
      start: 0,
      cells: [
        { kanji: '今', reading: '' },
        { kanji: '日', reading: '' },
        { kanji: '中', reading: '' },
      ],
    };
    const merged = mergeSeam(run, 0);
    expect(merged).toEqual({
      start: 0,
      cells: [
        { kanji: '今日', reading: '' },
        { kanji: '中', reading: '' },
      ],
    });
    expect(toMarkup({ term: '今日中', runs: [merged] })).toBe('今日中');
  });

  it('不改動原物件', () => {
    const run: KanjiRun = {
      start: 0,
      cells: [
        { kanji: '書', reading: 'かき' },
        { kanji: '留', reading: 'とめ' },
      ],
    };
    mergeSeam(run, 0);
    expect(run.cells).toHaveLength(2);
  });
});

describe('按邊界拆格 splitCellAt', () => {
  it('兩字格 剃刀[かみそり] 切第 1 字 → 剃[] 刀[]，讀音清空', () => {
    const run: KanjiRun = {
      start: 0,
      cells: [{ kanji: '剃刀', reading: 'かみそり' }],
    };
    expect(splitCellAt(run, 0, 1)).toEqual({
      start: 0,
      cells: [
        { kanji: '剃', reading: '' },
        { kanji: '刀', reading: '' },
      ],
    });
  });

  it('三字格 就職難 切第 1 道縫 → 就[] 職難[]，職難仍一格', () => {
    const run: KanjiRun = {
      start: 0,
      cells: [{ kanji: '就職難', reading: 'しゅうしょくなん' }],
    };
    expect(splitCellAt(run, 0, 1)).toEqual({
      start: 0,
      cells: [
        { kanji: '就', reading: '' },
        { kanji: '職難', reading: '' },
      ],
    });
  });

  it('三字格 就職難 切第 2 道縫 → 就職[] 難[]', () => {
    const run: KanjiRun = {
      start: 0,
      cells: [{ kanji: '就職難', reading: 'しゅうしょくなん' }],
    };
    expect(splitCellAt(run, 0, 2)).toEqual({
      start: 0,
      cells: [
        { kanji: '就職', reading: '' },
        { kanji: '難', reading: '' },
      ],
    });
  });

  it('只切目標格，同串其餘格不動', () => {
    const run: KanjiRun = {
      start: 0,
      cells: [
        { kanji: '就職難', reading: 'しゅうしょくなん' },
        { kanji: '者', reading: 'しゃ' },
      ],
    };
    expect(splitCellAt(run, 0, 1)).toEqual({
      start: 0,
      cells: [
        { kanji: '就', reading: '' },
        { kanji: '職難', reading: '' },
        { kanji: '者', reading: 'しゃ' },
      ],
    });
  });

  it('不改動原物件', () => {
    const run: KanjiRun = {
      start: 0,
      cells: [{ kanji: '就職難', reading: 'しゅうしょくなん' }],
    };
    splitCellAt(run, 0, 1);
    expect(run.cells).toHaveLength(1);
  });
});

describe('改詞條重算 rebuildRuns', () => {
  const previous: KanjiRun[] = [
    { start: 0, cells: [{ kanji: '考', reading: 'かんが' }] },
    { start: 2, cells: [{ kanji: '込', reading: 'こ' }] },
  ];

  it('改詞尾：考え込む → 考え込んだ，兩格都保留', () => {
    expect(rebuildRuns('考え込んだ', previous)).toEqual([
      { start: 0, cells: [{ kanji: '考', reading: 'かんが' }] },
      { start: 2, cells: [{ kanji: '込', reading: 'こ' }] },
    ]);
  });

  it('換漢字：考え込む → 考え直す，考保留、直是新的', () => {
    expect(rebuildRuns('考え直す', previous)).toEqual([
      { start: 0, cells: [{ kanji: '考', reading: 'かんが' }] },
      { start: 2, cells: [{ kanji: '直', reading: '' }] },
    ]);
  });

  it('前面插入：考え込む → 深く考え込む，不錯位', () => {
    expect(rebuildRuns('深く考え込む', previous)).toEqual([
      { start: 0, cells: [{ kanji: '深', reading: '' }] },
      { start: 2, cells: [{ kanji: '考', reading: 'かんが' }] },
      { start: 4, cells: [{ kanji: '込', reading: 'こ' }] },
    ]);
  });

  it('保留合併過的多字切法', () => {
    const merged: KanjiRun[] = [{ start: 0, cells: [{ kanji: '帰省', reading: 'きせい' }] }];
    expect(rebuildRuns('帰省する', merged)).toEqual([
      { start: 0, cells: [{ kanji: '帰省', reading: 'きせい' }] },
    ]);
  });
});

describe('儲存驗證 validateDraft', () => {
  const run = (cells: { kanji: string; reading: string }[]): KanjiRun => ({ start: 0, cells });

  // 底下兩個空格案例測的是守門，不是使用者看得到的錯：畫面按儲存時必填格已經先擋過空格，
  // 走到這裡代表輸入框與讀音格漂移了，這句紅字不會出現在畫面上。

  it('同串混填混空被擋（守門，畫面走不到）', () => {
    const draft = {
      term: '今日中',
      runs: [
        run([
          { kanji: '今', reading: 'こん' },
          { kanji: '日', reading: '' },
          { kanji: '中', reading: 'ちゅう' },
        ]),
      ],
    };
    expect(validateDraft(draft).length).toBeGreaterThan(0);
  });

  it('同串全空被擋，一串回一個錯（守門，畫面走不到）', () => {
    const draft = {
      term: '今日中',
      runs: [
        run([
          { kanji: '今', reading: '' },
          { kanji: '日', reading: '' },
          { kanji: '中', reading: '' },
        ]),
      ],
    };
    expect(validateDraft(draft)).toHaveLength(1);
  });

  it('同串全填通過', () => {
    const draft = {
      term: '今日中',
      runs: [
        run([
          { kanji: '今', reading: 'こん' },
          { kanji: '日', reading: 'にち' },
          { kanji: '中', reading: 'ちゅう' },
        ]),
      ],
    };
    expect(validateDraft(draft)).toEqual([]);
  });

  it('沒有漢字就沒有讀音格，一律通過', () => {
    expect(validateDraft({ term: 'ありがとう', runs: [] })).toEqual([]);
    expect(validateDraft({ term: 'テスト', runs: [] })).toEqual([]);
  });

  it('讀音含羅馬字被擋', () => {
    const draft = { term: '考', runs: [run([{ kanji: '考', reading: 'kanga' }])] };
    expect(validateDraft(draft)).toEqual(['考 的讀音要填假名']);
  });

  it('片假名加長音符通過', () => {
    const draft = { term: 'コ', runs: [run([{ kanji: 'コ', reading: 'コーヒー' }])] };
    expect(validateDraft(draft)).toEqual([]);
  });
});

describe('AI 預填採用 acceptPrefill', () => {
  /** 組一串 AI 回覆：splittable 加上各格的 [漢字, 讀音]。 */
  const ai = (splittable: boolean, ...cells: Array<[string, string]>) => ({
    splittable,
    cells: cells.map(([kanji, reading]) => ({ kanji, reading })),
  });

  it('單一漢字串：焦がす', () => {
    expect(acceptPrefill('焦がす', [ai(true, ['焦', 'こ'])])).toEqual([
      { start: 0, cells: [{ kanji: '焦', reading: 'こ' }] },
    ]);
  });

  it('逐字分配：吹雪 兩格', () => {
    expect(acceptPrefill('吹雪', [ai(true, ['吹', 'ふ'], ['雪', 'ぶき'])])).toEqual([
      {
        start: 0,
        cells: [
          { kanji: '吹', reading: 'ふ' },
          { kanji: '雪', reading: 'ぶき' },
        ],
      },
    ]);
  });

  it('拆不開的整串一格：剃刀', () => {
    expect(acceptPrefill('剃刀', [ai(false, ['剃刀', 'かみそり'])])).toEqual([
      { start: 0, cells: [{ kanji: '剃刀', reading: 'かみそり' }] },
    ]);
  });

  it('說拆不開卻還是拆了：程式自己合併回去，讀音接起來', () => {
    expect(acceptPrefill('剃刀', [ai(false, ['剃', 'かみ'], ['刀', 'そり'])])).toEqual([
      { start: 0, cells: [{ kanji: '剃刀', reading: 'かみそり' }] },
    ]);
  });

  it('說拆得開就照它給的格數，不代為合併', () => {
    expect(acceptPrefill('吹雪', [ai(true, ['吹雪', 'ふぶき'])])).toEqual([
      { start: 0, cells: [{ kanji: '吹雪', reading: 'ふぶき' }] },
    ]);
  });

  it('多串：考え込む 兩串，start 各自正確', () => {
    expect(
      acceptPrefill('考え込む', [ai(true, ['考', 'かんが']), ai(true, ['込', 'こ'])]),
    ).toEqual([
      { start: 0, cells: [{ kanji: '考', reading: 'かんが' }] },
      { start: 2, cells: [{ kanji: '込', reading: 'こ' }] },
    ]);
  });

  it('不採信 AI 的位置資訊，start 一律自己算', () => {
    expect(
      acceptPrefill('ざるを得ない', [
        { splittable: true, cells: [{ kanji: '得', reading: 'え', start: 99 }] },
      ]),
    ).toEqual([{ start: 3, cells: [{ kanji: '得', reading: 'え' }] }]);
  });

  it('片假名讀音放行', () => {
    expect(acceptPrefill('缶', [ai(true, ['缶', 'カン'])])).toEqual([
      { start: 0, cells: [{ kanji: '缶', reading: 'カン' }] },
    ]);
  });

  it('拒絕：串數與詞條對不上', () => {
    expect(acceptPrefill('考え込む', [ai(true, ['考', 'かんが'])])).toBeNull();
    expect(
      acceptPrefill('焦がす', [ai(true, ['焦', 'こ']), ai(true, ['込', 'こ'])]),
    ).toBeNull();
  });

  it('拒絕：AI 改字、漏字、多字', () => {
    expect(acceptPrefill('吹雪', [ai(false, ['吹雨', 'ふぶき'])])).toBeNull();
    expect(acceptPrefill('吹雪', [ai(false, ['吹', 'ふぶき'])])).toBeNull();
    expect(acceptPrefill('吹雪', [ai(false, ['大吹雪', 'おおふぶき'])])).toBeNull();
  });

  it('拒絕：讀音含羅馬字、漢字或數字', () => {
    expect(acceptPrefill('焦がす', [ai(true, ['焦', 'ko'])])).toBeNull();
    expect(acceptPrefill('焦がす', [ai(true, ['焦', '焦'])])).toBeNull();
    expect(acceptPrefill('焦がす', [ai(true, ['焦', 'こ1'])])).toBeNull();
  });

  it('拒絕：任一格讀音為空字串', () => {
    expect(acceptPrefill('吹雪', [ai(true, ['吹', 'ふぶき'], ['雪', ''])])).toBeNull();
  });

  it('拒絕：任一格漢字為空字串', () => {
    expect(acceptPrefill('吹雪', [ai(true, ['吹雪', 'ふぶき'], ['', 'き'])])).toBeNull();
  });

  it('拒絕：形狀不對', () => {
    expect(acceptPrefill('焦がす', null)).toBeNull();
    expect(acceptPrefill('焦がす', '焦[こ]がす')).toBeNull();
    expect(acceptPrefill('焦がす', [[{ kanji: '焦', reading: 'こ' }]])).toBeNull();
    expect(acceptPrefill('焦がす', [ai(true)])).toBeNull();
    expect(acceptPrefill('焦がす', [{ splittable: true, cells: ['こ'] }])).toBeNull();
    expect(acceptPrefill('焦がす', [{ splittable: true, cells: [{ kanji: '焦' }] }])).toBeNull();
    expect(
      acceptPrefill('焦がす', [{ splittable: true, cells: [{ kanji: 1, reading: 'こ' }] }]),
    ).toBeNull();
  });

  it('拒絕：缺 splittable 或不是布林', () => {
    expect(acceptPrefill('焦がす', [{ cells: [{ kanji: '焦', reading: 'こ' }] }])).toBeNull();
    expect(
      acceptPrefill('焦がす', [{ splittable: 'true', cells: [{ kanji: '焦', reading: 'こ' }] }]),
    ).toBeNull();
  });

  it('往返：採用後 toMarkup 再 parseReading 還原同一組漢字與讀音', () => {
    const runs = acceptPrefill('書き下ろす', [ai(true, ['書', 'か']), ai(true, ['下', 'お'])]);
    const markup = toMarkup({ term: '書き下ろす', runs: runs! });
    expect(markup).toBe('書[か]き下[お]ろす');
    expect(parseReading(markup).filter((segment) => segment.reading !== undefined)).toEqual([
      { text: '書', reading: 'か' },
      { text: '下', reading: 'お' },
    ]);
  });
});
