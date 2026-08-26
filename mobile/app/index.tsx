/**
 * 「複習」tab，也是預設那一頁。畫面本體在 `../ui/review-screen.tsx`。
 *
 * 這一層只做一件事：把共用的那一份複習流程遞進去。**它不自己建一份**——
 * 理由見 `../lib/app-context.tsx` 開頭。
 */
import { ReviewScreen } from '../ui/review-screen';
import { useApp } from '../lib/app-context';

export default function ReviewRoute() {
  const { session } = useApp();
  return <ReviewScreen session={session} />;
}
