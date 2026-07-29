import type { App } from '../app';
import { currentCard, isComplete } from '../lib/review';
import type { Rating } from '../lib/types';
import { el, button } from './dom';
import { renderTerm } from './reading-html';
import { hasJapaneseVoice, speak } from './speech';

const RATING_BUTTONS: { rating: Rating; label: string; key: string }[] = [
  { rating: 'again', label: '再次', key: '1' },
  { rating: 'hard', label: '困難', key: '2' },
  { rating: 'good', label: '好', key: '3' },
  { rating: 'easy', label: '簡單', key: '4' },
];

export function reviewView(app: App): HTMLElement {
  if (isComplete(app.queue)) return doneView(app);
  const card = currentCard(app.queue)!;

  const screen = el('div', 'screen');

  const header = el('header', 'bar');
  header.append(
    el('span', 'remaining', `剩餘 ${app.queue.length} 張`),
    button('bar-action', '卡片', () => app.showList()),
  );

  const face = el('div', 'face');
  face.append(el('div', 'term', renderTerm(card.text, app.revealed)));

  if (app.revealed) {
    face.append(el('div', 'meaning', card.meaning));
    if (hasJapaneseVoice()) {
      const speakButton = button('speak', '🔊 朗讀', () => speak(card.text));
      speakButton.setAttribute('aria-label', '朗讀這個詞條');
      face.append(speakButton);
    }
  }

  const main = el('main', 'card');
  main.append(
    button('edit-here', '編輯', () => app.showEditor(card, () => app.showReview())),
    face,
  );

  const reveal = () => {
    app.reveal();
    app.showReview();
  };

  const submit = (rating: Rating) => {
    app.rate(rating);
    app.showReview();
  };

  const footer = el('footer', 'actions');
  if (app.revealed) {
    footer.classList.add('ratings');
    for (const { rating, label, key } of RATING_BUTTONS) {
      const node = button(`rating rating-${rating}`, label, () => submit(rating));
      node.append(el('span', 'key-hint', key));
      footer.append(node);
    }
  } else {
    footer.append(button('primary', '顯示答案', reveal));
  }

  // 電腦端：空白鍵掀開答案，數字鍵 1–4 對應四個評分。
  app.keyHandler = (event) => {
    if (event.key === ' ') {
      event.preventDefault();
      if (!app.revealed) reveal();
      return;
    }
    if (!app.revealed) return;
    const match = RATING_BUTTONS.find((entry) => entry.key === event.key);
    if (match) {
      event.preventDefault();
      submit(match.rating);
    }
  };

  screen.append(header, main, footer);
  return screen;
}

function doneView(app: App): HTMLElement {
  const screen = el('div', 'screen');
  const header = el('header', 'bar');
  header.append(el('span', 'remaining', '剩餘 0 張'), button('bar-action', '卡片', () => app.showList()));

  const main = el('main', 'card done');
  main.append(
    el('div', 'done-mark', '✓'),
    el('h1', 'done-title', '今日份完成'),
    el('p', 'done-note', '到期的卡片都複習過了，明天再來。'),
  );

  const footer = el('footer', 'actions');
  footer.append(button('secondary', '瀏覽全部卡片', () => app.showList()));

  app.keyHandler = null;
  screen.append(header, main, footer);
  return screen;
}
