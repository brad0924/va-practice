import type { App } from '../app';
import { t, type Key } from '@core/i18n';
import {
  clearSlot,
  currentQuestion,
  filledSlots,
  isRoundOver,
  place,
  settle,
  type Question,
  type Result,
  type Round,
} from '@core/lib/spelling';
import { el, button } from './dom';
import { spellingBar } from './spelling-bar';
import { bookLabel } from './book-label';
import { tileGrid } from './tile-grid';

/**
 * 收尾之後正解在畫面上停留幾毫秒才進下一題（票 03 決定 8）。
 * 短到不打斷節奏，長到看得清楚自己錯在哪一格；實玩之後調得動。
 */
const SETTLE_PAUSE_MS = 1600;

/** 碼表多久重畫一次。 */
const TICK_MS = 100;

/** 剩幾秒轉黃、剩幾秒轉紅（票 03 決定 3）。 */
const SOON_SECONDS = 5;
const URGENT_SECONDS = 3;

/** 碼表那一圈的半徑與周長。周長算一次就好，dash 的兩個屬性都吃它。 */
const RING_RADIUS = 19;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * 磚在自己那一格裡最多偏移多少，單位是**磚自己的大小**的百分比。
 *
 * 用磚而不是格子當單位，是因為格子多寬只有瀏覽器算得出來（它跟著螢幕跑），而磚有大小上限。
 * 20% 在 375px 上是九個像素左右，看得出散亂，又推不出格外。
 *
 * `translate()` 的兩個百分比各自對照元素的寬與高，兩邊因此只有在磚是正方形時才等長
 * ——`.kana-tile` 把寬高都寫成同一個 `--tile` 就是為了守住這個前提。
 * 那條規則另有一個跟著這個數字走的除數，動這裡要連它一起改。
 */
const TILE_JITTER = 20;

/**
 * 三種收尾各自的那一行字與顏色。`key` 存的是翻譯檔的 key 而不是字——寫成字的話在模組
 * 載入的那一刻就算完了，那比 `initI18n()` 還早，切語言之後也不會跟著換。
 * 與 `review-view.ts` 的 `RATING_BUTTONS` 同一種寫法。
 *
 * 收成一張表而不是兩串 if：查字與挑顏色本來就是同一個三選一，寫兩次的話改了一邊
 * 會出現「字說時間到、顏色卻是拼錯的紅」。
 */
const OUTCOMES = {
  correct: { key: 'spelling.settledCorrect', tone: 'ok' },
  wrong: { key: 'spelling.settledWrong', tone: 'bad' },
  timeout: { key: 'spelling.settledTimeout', tone: 'late' },
} satisfies Record<string, { key: Key; tone: string }>;

type Outcome = keyof typeof OUTCOMES;

/**
 * 拼字畫面：上半是釋義與碼表，下半是散落的磚。
 *
 * **一輪是端進來的，不在這裡開。** 洗牌與挑干擾要亂數，而亂數在這個 app 裡只有 `app.ts`
 * 碰得到；挑單字本那一頁（票 04）洗好再遞進來，這支因此完全不需要亂數，測試也可以直接
 * 手捏一輪丟進去。交出去的地方有兩個，都收同一份東西：
 *
 * - `onSettled` 每結算一題就報一次。**這一頁隨時可能被換掉而不收到任何通知**
 *   （`root.replaceChildren()` 不出聲），練到一半跳去別的畫面時那一輪要照樣封存
 *   （spec 決定 12），因此進度得一路往外遞，不能只在最後交一次。
 * - `onDone` 在這一輪收工時報一次：每一題都出過了，或使用者按了「結束」。
 *   兩條路的差別只有「還剩幾題沒出」，接的人不必分辨是哪一種。
 *
 * 最後一題結算時兩支都會被呼叫，`onSettled` 先。
 *
 * 狀態變化一律走 `refresh()`，不整頁重建——碼表每 0.1 秒跳一次，整頁重建會把它一起砍掉重生。
 * 碼表自己另有一支 `paintClock()`，只碰數字與那一圈，不動別的。
 */
export function spellingView(
  app: App,
  round: Round,
  onSettled: (round: Round) => void,
  onDone: (round: Round) => void,
): HTMLElement {
  const screen = el('div', 'screen');

  const header = spellingBar(app);
  const main = el('main', 'prompt');
  // 磚排在 footer：複習畫面的 footer 放的是「你要按的那幾顆」，這一頁要按的就是磚。
  const footer = el('footer', 'kana-field');

  const meaning = el('div', 'prompt-meaning');
  const slots = el('div', 'slots');
  const verdict = el('div', 'verdict');
  const clockNumber = el('span', 'clock-num');
  const { svg, run: ring } = clockRing();
  const clock = el('div', 'clock', svg, clockNumber);
  const quit = button('end-round', t('spelling.quit'), endRound);

  /** 目前這一輪。每一次動作換上新的一份，不就地改——與 `spelling.ts` 那幾支純函式同一種形狀。 */
  let current = round;
  /** 這一題開始的時刻（毫秒）。碼表與計分都從它算。 */
  let startedAt = 0;
  /** 這一題結算後的結果；還沒收尾時是 null。 */
  let settled: Result | null = null;
  /** 怎麼收的尾。逾時與拼錯在畫面上是兩句話，光看格子分不出來。 */
  let outcome: Outcome = 'wrong';
  let ticker: number | null = null;
  let pause: number | null = null;
  let tiles: HTMLButtonElement[] = [];

  /** 這一題花掉幾秒。時間在這一層才第一次被讀，`spelling.ts` 只吃這個數字。 */
  function elapsed(): number {
    return (app.now().getTime() - startedAt) / 1000;
  }

  function stopTicker(): void {
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
  }

  /**
   * 碼表與「停留一下再進下一題」那兩支計時器一起收掉。
   *
   * 畫面被換掉時沒有人通知它們——`root.replaceChildren()` 把整棵樹丟掉，不出聲。
   * 因此每一下醒來都先看一眼自己還在不在文件上，脫離了就呼叫這支自我拆除。
   * 與 `book-filter.ts` 那道自癒同一個立場（`ADR-0011`）。
   */
  function stopTimers(): void {
    stopTicker();
    if (pause !== null) clearTimeout(pause);
    pause = null;
  }

  /** 這一題還剩幾秒。碼表與收尾時的最後一筆讀數都問這裡。 */
  function remaining(question: Question): number {
    return question.limit - elapsed();
  }

  function paintClock(left: number): void {
    const question = currentQuestion(current);
    if (!question) return;
    const safe = Math.max(0, left);
    clockNumber.textContent = safe.toFixed(1);
    ring.setAttribute('stroke-dashoffset', String(RING_LENGTH * (1 - safe / question.limit)));
    clock.className =
      'clock' + (safe <= URGENT_SECONDS ? ' urgent' : safe <= SOON_SECONDS ? ' soon' : '');
  }

  function tick(): void {
    if (!screen.isConnected) {
      stopTimers();
      return;
    }
    const question = currentQuestion(current);
    if (!question) return;
    const left = remaining(question);
    paintClock(left);
    if (left <= 0) finishQuestion('timeout');
  }

  /**
   * 那一格收尾後的樣子：沒填到的是灰的，填錯的是紅的，其餘是綠的。
   * 三種收尾共用這一支——拼對時每一格都對，自然整排都是綠的。
   */
  function slotTone(result: Result, index: number): string {
    const filled = result.filled[index] ?? '';
    if (filled === '') return 'missed';
    return filled === result.answer[index] ? 'ok' : 'bad';
  }

  /**
   * 那一格裡的磚偏移多少。**偏移量由那一格裝了哪個假名決定**，而哪個假名落在哪一格
   * 是 `startRound()` 用注入的亂數洗出來的（票 03 決定 5）——因此位置照樣是亂數決定的，
   * 只是不必在這一層再要一次亂數。
   *
   * 順帶換到一個好處：同一題重畫幾次，磚都待在原地。每次重畫都現搖一次的話，
   * 點一塊磚整片就會跳一次。
   */
  function jitterFor(kana: string, index: number): [number, number] {
    const seed = (kana.codePointAt(0) ?? 0) + index * 31;
    const spread = (mix: number, span: number) => (((seed * mix) % span) / (span - 1) - 0.5) * 2 * TILE_JITTER;
    return [spread(37, 41), spread(61, 43)];
  }

  /**
   * 把現有的每一塊磚放進自己那一格的中央。**只改位置，不換磚**——磚是誰、偏移多少都不動。
   *
   * 分成「鋪」與「擺」兩支，是因為這一支要跑第二次：手機轉個螢幕，場地從又矮又寬變成
   * 又高又窄，同樣十二塊磚該從四欄三列改成三欄四列（票 08 決定 3）。重鋪一次的話
   * 已經填好的格子與碼表會跟著整輪重來，那是決定 4 明文擋掉的事。
   *
   * 場地的兩個邊在這裡量、在這裡用完，欄列怎麼算交給 `tileGrid()`——那一支不碰 DOM，
   * 因此測得動（`ADR-0014`）。格線的兩個邊長仍然只交給 CSS：磚的大小要同時被欄數與
   * 列數夾住，否則螢幕一矮磚會被裁掉而不是縮小（票 03 決定 11）。
   */
  function layoutTiles(): void {
    const { cols, rows } = tileGrid(tiles.length, footer.clientWidth, footer.clientHeight);
    footer.style.setProperty('--cols', String(cols));
    footer.style.setProperty('--rows', String(rows));
    tiles.forEach((tile, index) => {
      tile.style.left = `${(((index % cols) + 0.5) / cols) * 100}%`;
      tile.style.top = `${((Math.floor(index / cols) + 0.5) / rows) * 100}%`;
    });
  }

  /**
   * 鋪磚：做出這一題的十二塊，各自帶著自己的格內偏移，再擺進格線。
   * **純亂數會疊在一起**，那是原型踩過的坑（票 03 決定 5）。
   *
   * 一題鋪一次。之後的重畫只改 class，磚不再重做。
   */
  function buildTiles(question: Question): void {
    tiles = question.tiles.map((kana, index) => {
      const node = button('kana-tile', kana, () => pick(index));
      const [dx, dy] = jitterFor(kana, index);
      node.style.setProperty('--dx', `${dx}%`);
      node.style.setProperty('--dy', `${dy}%`);
      return node;
    });
    footer.replaceChildren(...tiles);
    layoutTiles();
    // 第一題是在畫面接上文件**之前**鋪的：`spellingView()` 要先回傳，呼叫端才把它插進去。
    // 那一下量到的場地是 0×0，`tileGrid()` 只能退回正方形的算法。微任務排在呼叫端插完
    // 之後、瀏覽器繪製之前，補量一次——橫向的第一題因此不會先閃一格四欄三列。
    //
    // **只有還沒接上文件時才補。** 第二題以後是在畫面上鋪的，剛才那一次就量得準了，
    // 無條件排一次微任務等於每一題都白排一遍。
    if (!screen.isConnected) queueMicrotask(layoutTiles);
  }

  function refresh(): void {
    const question = currentQuestion(current);
    if (!question) return;

    meaning.textContent = question.card.meaning;

    // 這張卡的**所屬單字本**。找不到那本就不印、也不填佔位字元，
    // 與 `review-view.ts`、`list-view.ts` 的 `if (book)` 一致。
    const owner = app.data.books.find((candidate) => candidate.id === question.card.bookId);

    // 收尾時一律把正解翻出來，三種收尾都一樣（票 03 決定 8）。
    const shown = settled ? settled.answer : filledSlots(current);
    const nextSlot = current.slots.indexOf(null);
    slots.replaceChildren(
      ...question.answer.map((_, index) => {
        if (settled) return el('div', `slot done ${slotTone(settled, index)}`, shown[index] ?? '');
        const kana = shown[index] ?? '';
        // 空格不是按鈕：沒有事情可做，掛上去只會多一顆唸不出名字的鈕。
        if (kana !== '') return button('slot filled', kana, () => clearAt(index));

        // 下一塊磚要補進去的那一格看得出來，否則只取消中間一格時使用者不知道自己在填哪裡。
        // **標記走 `aria-current` 而不是一個 class**：它是「這一組裡的現在這個」的正名，
        // 螢幕閱讀器唸得出來，樣式也照它上色。斷言一個 class 名是 `ADR-0014` 禁止的事。
        const empty = el('div', 'slot');
        if (index === nextSlot) empty.setAttribute('aria-current', 'true');
        return empty;
      }),
    );

    verdict.className = settled ? `verdict ${OUTCOMES[outcome].tone}` : 'verdict';
    verdict.textContent = settled ? t(OUTCOMES[outcome].key, { points: settled.points }) : '';

    // 已經用掉的磚與收尾之後的整批磚都只靠 `disabled`：它同時擋住點擊、擋住鍵盤聚焦，
    // 樣式那條 `.kana-tile:disabled` 也吃得到，不必再多掛一個 class。
    tiles.forEach((tile, index) => {
      tile.disabled = settled !== null || current.slots.includes(index);
    });

    // 收尾那一下到進下一題之間也按不動。那一段裡剛判好的結果還在 `finishQuestion()` 手上，
    // 沒有換進 `current`；此時交出去會把那一題弄丟。理由與磚被關掉是同一個時機。
    quit.disabled = settled !== null;

    main.replaceChildren(
      ...(owner ? [bookLabel(owner.name)] : []),
      clock,
      meaning,
      slots,
      verdict,
      quit,
    );
  }

  /**
   * 點一塊磚：補到最前面的空格。**只負責放，不判對錯**——那是 `settle()` 的事
   * （spec 決定 3）。整排填滿的那一下才收尾。
   */
  function pick(index: number): void {
    if (settled) return;
    const next = place(current, index);
    if (next === current) return;
    current = next;
    refresh();
    if (!current.slots.includes(null)) finishQuestion('filled');
  }

  /** 點已填好的那一格：只清那一格，前後兩格不動（spec 決定 4）。 */
  function clearAt(index: number): void {
    if (settled) return;
    current = clearSlot(current, index);
    refresh();
  }

  /**
   * 這一題收尾：停住碼表、翻出正解、停一下再進下一題。
   * 對錯與分數一律問 `spelling.ts`，畫面自己不算（票 03 決定 6）。
   */
  function finishQuestion(reason: 'filled' | 'timeout'): void {
    stopTicker();
    const question = currentQuestion(current);
    if (!question) return;

    const judged = settle(current, elapsed());
    settled = judged.result;
    // **推進的那一份立刻往外報**，不等停留那 1.6 秒結束：這一頁在那段期間照樣可能被換掉，
    // 而被換掉時沒有人通知它（`root.replaceChildren()` 不出聲）。晚報的話，
    // 剛剛拼完的那一題就會從封存的成績裡消失。
    onSettled(judged.round);
    // 逾時一律不算拼對，即使最後一塊剛好放對也一樣——那條規則在 `spelling.ts` 裡，
    // 這裡只是把它的判定翻成畫面上的三選一。
    outcome = settled.correct ? 'correct' : reason === 'timeout' ? 'timeout' : 'wrong';
    // 逾時的讀數停在 0，不停在最後一下量到的 0.1。
    paintClock(reason === 'timeout' ? 0 : remaining(question));
    refresh();

    pause = window.setTimeout(() => {
      pause = null;
      if (!screen.isConnected) {
        stopTimers();
        return;
      }
      current = judged.round;
      settled = null;
      if (isRoundOver(current)) {
        onDone(current);
        return;
      }
      startQuestion();
    }, SETTLE_PAUSE_MS);
  }

  /**
   * 中途收工（票 05 決定 1）：停住碼表，把這一輪原樣交出去，成績頁接手。
   *
   * **正在拼的那一題不判。** 它沒被拼錯，只是還沒發生——與「按下結束時還沒出到的那幾題」
   * 同一個立場，`summary()` 的算法本來就只數已經結算過的（spec 決定 23）。
   * 若在這裡補判一次，中途收工的平均分會被一題硬生生的 0 分拉下來。
   */
  function endRound(): void {
    stopTimers();
    onDone(current);
  }

  /**
   * 開始一題。**碼表在題目出現的那一刻就跑**，不等使用者動作
   * ——這一版沒有「準備好了嗎」的過場（票 03 決定 7）。
   */
  function startQuestion(): void {
    const question = currentQuestion(current);
    if (!question) return;
    startedAt = app.now().getTime();
    buildTiles(question);
    refresh();
    paintClock(question.limit);
    ticker = window.setInterval(tick, TICK_MS);
  }

  /**
   * 轉螢幕之後把磚重擺一次（票 08 決定 4）。
   *
   * **只重擺，不重開一輪**：已經填好的格子留著，碼表也不歸零——`layoutTiles()` 一個
   * 狀態都不碰，只改磚的座標。
   *
   * 掛在 `window` 上，走成對註冊加 `isConnected` 自癒（`ADR-0011`）。這一頁沒有拆卸時機
   * ——`root.replaceChildren()` 把整棵樹丟掉，不通知任何人——所以每一次醒來都先看一眼
   * 自己還在不在文件上，脫離了就自己解除。同一頁的碼表就是這樣做的。
   */
  function relayoutOnResize(): void {
    if (!screen.isConnected) {
      window.removeEventListener('resize', relayoutOnResize);
      return;
    }
    layoutTiles();
  }
  window.addEventListener('resize', relayoutOnResize);

  // 磚是散落的，沒有自然的鍵盤順序可以對應，因此這一頁完全不做鍵盤操作（spec 決定 25）。
  // 明寫成 null 而不是留白：留白會讓上一個畫面的處理器活到這一頁來。
  app.keyHandler = null;

  // 一張卡都出不了題的一輪不該走到這裡，挑單字本那一頁（票 04 決定 8）擋在前面。
  // 真的走到了也不當機：碼表不跑，畫面停在空的。
  if (!isRoundOver(current)) startQuestion();

  screen.append(header, main, footer);
  return screen;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 碼表那兩圈：固定的底，加上一圈會縮的。縮的那一圈由 `paintClock()` 改 `stroke-dashoffset`。
 *
 * `createElementNS` 不能省——SVG 不吃 `el()` 背後的 `createElement`，用錯的話瀏覽器
 * 會建出一顆長得像 SVG 的 HTML 元素，畫面上什麼都不會出現。
 */
function clockRing(): { svg: SVGSVGElement; run: SVGCircleElement } {
  const circle = (className: string): SVGCircleElement => {
    const node = document.createElementNS(SVG_NS, 'circle');
    node.setAttribute('class', className);
    node.setAttribute('cx', '23');
    node.setAttribute('cy', '23');
    node.setAttribute('r', String(RING_RADIUS));
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke-width', '3');
    return node;
  };

  const run = circle('ring-run');
  run.setAttribute('stroke-linecap', 'round');
  run.setAttribute('stroke-dasharray', String(RING_LENGTH));
  run.setAttribute('stroke-dashoffset', '0');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 46 46');
  svg.setAttribute('width', '46');
  svg.setAttribute('height', '46');
  svg.append(circle('ring-track'), run);
  return { svg, run };
}
