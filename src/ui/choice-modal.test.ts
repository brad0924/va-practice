// @vitest-environment jsdom

/**
 * 三選一彈窗（`ADR-0014`：畫面層的東西在 jsdom 裡測）。
 *
 * 這裡驗的都是「答案有沒有正確地送回去、東西有沒有收乾淨」，
 * 不驗那三句話講得好不好——那只有人看得出來。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { askChoice } from './choice-modal';

type Answer = 'local' | 'blank' | 'cancel';

const CHOICES = [
  { label: '用這台的資料', value: 'local' as Answer },
  { label: '清空，重新開始', value: 'blank' as Answer, danger: true },
  { label: '取消', value: 'cancel' as Answer },
];

function ask(): Promise<Answer> {
  return askChoice<Answer>({
    title: '「someone」還沒有雲端備份',
    body: '要用這台裝置目前的卡片與進度建立備份，還是清空這台、從頭開始？',
    choices: CHOICES,
    dismiss: 'cancel',
  });
}

function buttons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.modal-overlay .modal-rows button')];
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('三選一彈窗', () => {
  // 三顆鈕各自長什麼樣子（哪一顆是主要動作、哪一顆是危險色）**刻意不驗**：
  // 那是 class 名與版面，`ADR-0014` 與 `docs/spec.md` 的 Testing Decisions 把它列為
  // 硬規則——那種斷言會在每次微調時無辜變紅，然後被人習慣性改掉。顏色只有實機看得出來。
  it('三顆按鈕照順序長出來', async () => {
    const answer = ask();

    expect(buttons().map((node) => node.textContent)).toEqual([
      '用這台的資料',
      '清空，重新開始',
      '取消',
    ]);

    buttons()[2].click();
    await answer;
  });

  it('按哪一顆就回哪一個答案', async () => {
    for (const [index, expected] of (['local', 'blank', 'cancel'] as const).entries()) {
      const answer = ask();
      buttons()[index].click();
      expect(await answer).toBe(expected);
    }
  });

  it('答完就整棵拆掉，Esc 那顆監聽器也一起解除', async () => {
    const answer = ask();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();

    buttons()[0].click();
    expect(await answer).toBe('local');
    expect(document.querySelector('.modal-overlay')).toBeNull();

    // 監聽器若沒解除，這一下會對一個已經答完的 promise 再 resolve 一次。
    // resolve 第二次是靜默的，因此改看它有沒有把別人的彈窗誤關掉。
    const second = ask();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await second).toBe('cancel');
  });

  it('按 Esc 與點背景都算取消', async () => {
    const byKey = ask();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await byKey).toBe('cancel');

    const byBackdrop = ask();
    document.querySelector<HTMLElement>('.modal-overlay')!.click();
    expect(await byBackdrop).toBe('cancel');
  });

  it('點在面板上不算取消——那是內容，不是背景', async () => {
    const answer = ask();
    document.querySelector<HTMLElement>('.modal-panel')!.click();

    expect(document.querySelector('.modal-overlay')).not.toBeNull();
    buttons()[0].click();
    expect(await answer).toBe('local');
  });

  it('焦點落在取消那一顆：習慣性按 Enter 不會毀掉東西', async () => {
    const answer = ask();
    expect(document.activeElement).toBe(buttons()[2]);

    buttons()[2].click();
    await answer;
  });
});
