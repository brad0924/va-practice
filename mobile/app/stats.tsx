/** 「統計」tab。圖表本體排在自己的票，現在是一頁說明（HIG `N-05`）。 */
import { PlaceholderScreen } from '../ui/placeholder-screen';

export default function StatsRoute() {
  return (
    <PlaceholderScreen
      mark="📈"
      title="統計還沒做"
      note={'這一頁之後會畫出每天複習了幾張、有幾張到期。\n四頁裡它排最後，因為不影響日常複習。'}
    />
  );
}
