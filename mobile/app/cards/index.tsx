/**
 * 「卡片」tab 的第一頁：卡片列表。畫面本體在 `../../ui/cards-screen.tsx`。
 *
 * 這一層只做接線：把共用的那一份遞進去，並把「點了一列」翻成一次推入導覽。
 * **它不自己建資料**——理由見 `../../lib/app-context.tsx` 開頭。
 */
import { useRouter } from 'expo-router';
import { CardsScreen } from '../../ui/cards-screen';
import { useApp } from '../../lib/app-context';

export default function CardsRoute() {
  const { session } = useApp();
  const router = useRouter();

  return (
    <CardsScreen
      session={session}
      // 當前時間由外面遞進來，與 `core/` 那一層同一個規矩。這一行與
      // `../../lib/app-context.tsx` 遞給複習流程的那一行是同一件事。
      now={() => new Date()}
      // 只遞編號過去。整張卡塞進網址會把使用者的資料寫進導覽狀態裡，而目的地
      // 本來就拿得到同一份資料——票 `16` 會在那一頁用這個編號去查。
      onOpenCard={(card) => router.push(`/cards/${card.id}`)}
    />
  );
}
