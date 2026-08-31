/**
 * 編輯卡片。**現在是一頁說明**（HIG `N-05`），本體排在票 `16`。
 *
 * 這一頁存在的理由是「接縫先接好」（2026-08-31 拍板，圖版三·甲）：卡片列表點一列真的
 * 推得出一頁、返回鍵回得去，那條路現在就驗得到；票 `16` 動工時就地把內容換掉，
 * 導覽那一段一個字都不必重接。
 *
 * 頁內的字不查表，與 `../../ui/placeholder-screen.tsx` 同一個立場：這幾句話會跟這支檔
 * 一起消失，為它們往三份翻譯檔各加一條，留下的是三條孤兒。
 */
import { Stack, useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../ui/placeholder-screen';

export default function CardEditorRoute() {
  // 票 `16` 會拿這個編號去 `useApp()` 那份資料裡查卡片。現在只用來確認參數真的傳到了。
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      {/* 標題由系統絕對置中，返回鍵是系統的 chevron（HIG `N-10`）——兩者都不自己畫。
          `headerLargeTitle` 不開：這是被推出來的第二層，大標題留給列表那一頁。 */}
      <Stack.Screen options={{ title: '編輯卡片' }} />
      <PlaceholderScreen
        mark="✎"
        title="編輯畫面還沒做"
        note={`這一頁之後會有詞條、讀音格與釋義。\n它是排在後面那張票（卡片編號 ${id}）。`}
      />
    </>
  );
}
