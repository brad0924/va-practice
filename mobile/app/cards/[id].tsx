/**
 * 新增／編輯卡片。畫面本體在 `../../ui/card-editor-screen.tsx`。
 *
 * 這一層只做接線：拿編號去共用的那份資料裡查卡、把「做完了」翻成一次返回，
 * 並把「去問 AI 讀音」那支函式遞進去。**它不自己建資料**——理由見
 * `../../lib/app-context.tsx` 開頭。
 *
 * ## 一支檔管兩種模式
 *
 * 編號是字面上的 `new` 就是**新增**，其餘一律當成要編的那張卡的編號。
 *
 * 兩種模式共用同一支路由，是因為它們共用同一頁畫面、同一段接線；拆成兩支檔的話
 * 上面那幾行要各抄一份。不會撞號：卡片的編號是 `crypto.randomUUID()` 產的，
 * 長度與格式都不可能剛好是那三個字母。
 *
 * > 票 `15` 先接好的那條路（列表點一列 → 推出這一頁 → 返回鍵回得去）一個字沒改，
 * > 就地把佔位畫面換成本體而已（2026-08-31 拍板，圖版三·甲）。
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { t } from '@core/i18n';
import type { Card } from '@core/lib/types';
import { CardEditorScreen } from '../../ui/card-editor-screen';
import { Notice } from '../../ui/notice';
import { useApp } from '../../lib/app-context';
import { askReadingNative, prepare } from '../../lib/gemini-reading-native';

/** 這個編號代表「新增一張」，不是某張卡。 */
const NEW = 'new';

export default function CardEditorRoute() {
  const { session } = useApp();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  /**
   * 一進這一頁就先去排 App Attest 憑證的隊，不等它。
   *
   * 第一次跟 Apple 要憑證要花好幾秒。等到使用者打完詞條才開始排，那幾秒會整段吃掉
   * 問話的預算，第一張卡就可能白等一場。理由的正本在 `../../lib/gemini-reading-native.ts`。
   *
   * 只叫一次。空的相依陣列是刻意的：這是「開了這一頁」的動作，不是每次重畫都要重來。
   */
  useEffect(() => {
    prepare();
  }, []);

  /**
   * 要編的那張卡，**只在第一次畫的時候查一次**。
   *
   * 每次重畫都重查的話，按下「刪除這張卡」會閃一下：資料一變這一層就先重畫，那一刻卡
   * 已經不在了，畫面於是換成底下那張「找不到這張卡」，然後才被返回動畫推走。
   *
   * 只查一次也更符合這一頁的語義——它是一次編輯，從打開的那一刻起就拿著一份快照
   * （編輯畫面自己的三格也是那時候灌進去的），中途資料在別處變了不該把它抽換掉。
   */
  const opened = useRef<Card | null>(null);
  if (id !== NEW && opened.current === null) {
    // 先把那一份資料拿出來再找卡，不要一路 `session.snapshot().data.cards.find(...)` 串下去。
    // 這是這個 repo 既有的寫法（`../../ui/cards-screen.tsx` 第一行就是它）。
    const { data } = session.snapshot();
    opened.current = data.cards.find((entry) => entry.id === id) ?? null;
  }
  const card = id === NEW ? null : opened.current;

  // 要編的那張一開始就不在了。刪掉之後從別處回到這個網址會走到這裡。
  // **不要靜靜地變成新增畫面**——那會讓使用者以為自己的卡被清空了。
  if (id !== NEW && card === null) {
    return <Notice mark="🔎" title={t('editor.cardGoneTitle')} note={t('editor.cardGone')} />;
  }

  return (
    <CardEditorScreen
      session={session}
      card={card}
      // 手機版一律問得出來：固定金鑰、走 Firebase AI Logic，使用者什麼都不必設定
      // （spec 決定一、二）。網頁版那條「沒設金鑰就回 null」在這裡不存在。
      ask={askReadingNative}
      onDone={() => router.back()}
    />
  );
}
