/**
 * 「資料」tab。**現在裝的是探針畫面**（票 `03`–`05`）。
 *
 * 那支畫面本來掛在複習畫面標題列上一顆寫著「探針」的後門膠囊底下。它做的事——加卡、
 * 登入雲端、看標答比對——本來就是資料頁的事，票 `09` 因此把它搬進這個 tab 並拆掉那顆鈕。
 *
 * 好處是這個 tab 不是一個空殼，而是「還沒做完的資料頁」；資料頁那張票動工時
 * 探針就地被取代，不必再去別的地方找它。
 */
import { ProbeScreen } from '../ui/probe-screen';
import { useApp } from '../lib/app-context';

export default function DataRoute() {
  const { store, cloud, session, vectors, cloudStatus, setCloudStatus } = useApp();
  return (
    <ProbeScreen
      store={store}
      cloud={cloud}
      vectors={vectors}
      cloudStatus={cloudStatus}
      onStatus={setCloudStatus}
      onDataChanged={() => session.reload()}
    />
  );
}
