/**
 * 「資料」tab 的第一頁。畫面本體在 `../../ui/data-screen.tsx`。
 *
 * 這一層只做接線：把共用的那一份遞進去，把三個「點進去」翻成推入導覽，
 * 並把「交檔案給使用者」那支函式遞進去。**它不自己建資料**——理由見
 * `../../lib/app-context.tsx` 開頭。
 *
 * > 這一頁在票 `18` 之前掛的是探針畫面（`ui/probe-screen.tsx`）。那支檔的檔頭寫著
 * > 「資料頁一做好，這整支檔案就地被取代」，這就是那一刻。
 */
import { useRouter } from 'expo-router';
import { useApp } from '../../lib/app-context';
import { shareFileNative } from '../../lib/share-file-native';
import { DataScreen } from '../../ui/data-screen';

export default function DataRoute() {
  const { session, cloud, cloudConsent, reminder, cloudStatus } = useApp();
  const router = useRouter();

  return (
    <DataScreen
      session={session}
      cloud={cloud}
      cloudConsent={cloudConsent}
      // 每日提醒也是共用的那一份（票 `19`）：評分存完之後的整批重排接在
      // `../../lib/app-context.tsx` 裡，這一頁自己再建一個就是兩台各排各的。
      reminder={reminder}
      cloudStatus={cloudStatus}
      // 當前時間由外面遞進來，與 `core/` 那一層同一個規矩。匯出的檔名要用它。
      now={() => new Date()}
      // 原生模組由路由這一層 import，畫面那一支因此仍然在 Node 底下載得進來——
      // 與編輯畫面收 `ask` 的規矩一致。
      shareFile={shareFileNative}
      onOpenLanguage={() => router.push('/data/language')}
      onOpenSignIn={() => router.push('/data/sign-in')}
      onOpenPassword={() => router.push('/data/password')}
      /**
       * 匯入成功不另外報喜，直接跳去卡片列表——新資料出現在眼前就是回饋，與網頁版一致。
       *
       * **這一條走 `navigate()` 不走 `push()`**：目的地在另一個 tab，而 `push()` 一律往
       * 堆疊上再疊一層。每匯入一次就多疊一層卡片列表，返回鍵會把使用者一路帶回一堆
       * 長得一樣的畫面。`navigate()` 會沿用那個 tab 已經在的那一頁。
       */
      onImported={() => router.navigate('/cards')}
    />
  );
}
