import { describe, it, expect } from 'vitest';
import { acceptFakes, askFakes } from './gemini-fakes';
import type { Card } from './types';

function card(id: string, text: string, meaning: string): Card {
  return { id, bookId: 'b1', text, meaning, interval: null, ease: 2.5, due: null };
}

const KOGASU = card('kogasu', '焦[こ]がす', '燒焦、烤焦');
const NEKO = card('neko', '猫[ねこ]', '貓');

describe('收不收 Gemini 回來的假釋義', () => {
  it('形狀對：依送出去的順序，一張卡對一組，以卡片 id 為鍵收下', () => {
    const reply = {
      cards: [
        { term: '焦がす', fakes: ['洗乾淨', '曬乾', '冷凍'] },
        { term: '猫', fakes: ['狐狸', '老虎', '松鼠'] },
      ],
    };

    expect(acceptFakes([KOGASU, NEKO], reply)).toEqual(
      new Map([
        ['kogasu', ['洗乾淨', '曬乾', '冷凍']],
        ['neko', ['狐狸', '老虎', '松鼠']],
      ]),
    );
  });

  it.each([
    ['不是物件', '[]'],
    ['少一張卡', { cards: [{ term: '焦がす', fakes: ['洗乾淨', '曬乾', '冷凍'] }] }],
    [
      '順序對不上：收一半的話，會把一張卡的假釋義配給另一張',
      {
        cards: [
          { term: '猫', fakes: ['狐狸', '老虎', '松鼠'] },
          { term: '焦がす', fakes: ['洗乾淨', '曬乾', '冷凍'] },
        ],
      },
    ],
    [
      'fakes 裡混了不是字的東西',
      {
        cards: [
          { term: '焦がす', fakes: ['洗乾淨', 3, '冷凍'] },
          { term: '猫', fakes: ['狐狸', '老虎', '松鼠'] },
        ],
      },
    ],
  ])('%s：整批不收', (_, reply) => {
    expect(acceptFakes([KOGASU, NEKO], reply)).toBeNull();
  });
});

describe('送出去的請求', () => {
  it('金鑰在 header 上；每張卡送去掉讀音標記的詞條與釋義，讀音不送', async () => {
    // 比照讀音那邊，只認金鑰與送出去的卡。提示詞會反覆微調，比對全文只會無辜變紅。
    let sent: RequestInit | undefined;
    const doFetch: typeof fetch = async (_url, init) => {
      sent = init;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }));
    };

    await askFakes('我的金鑰', [KOGASU, NEKO], doFetch);

    expect((sent?.headers as Record<string, string>)['x-goog-api-key']).toBe('我的金鑰');
    const body = String(sent?.body);
    for (const text of ['焦がす', '燒焦、烤焦', '猫', '貓']) expect(body).toContain(text);
    expect(body).not.toContain('こ');
    expect(body).not.toContain('ねこ');
  });
});
