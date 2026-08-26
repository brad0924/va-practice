/** 「卡片」tab。列表本體排在自己的票，現在是一頁說明（HIG `N-05`）。 */
import { PlaceholderScreen } from '../ui/placeholder-screen';

export default function CardsRoute() {
  return (
    <PlaceholderScreen
      mark="🗂"
      title="卡片列表還沒做"
      note={'這一頁之後會列出所有卡片，可以搜尋、換單字本、點進去編輯。\n它排在導覽列後面的第一張票。'}
    />
  );
}
