/**
 * 「資料」tab 底下的推入導覽（票 `18`）。
 *
 * 這一層存在的理由只有一個：**三個子畫面要用 iOS 的推入式導覽**（語言、登入、換密碼），
 * 返回鈕交給系統（HIG `N-10`）。沒有 `Stack` 就沒有那條導覽列，也就沒有返回鈕。
 *
 * 這個 tab 在票 `18` 之前是單一檔（`app/data.tsx`），因為探針畫面沒有第二層。
 * 「卡片」那個 tab 早一步長出同樣的目錄（票 `15`），做法與那邊一致。
 *
 * ## `headerTransparent` 是「讓系統畫那條列」的開關
 *
 * **它的名字會騙人：開了不是變成看不見，是變成玻璃。** 不開的話 React Navigation 會塞
 * 主題的 `colors.card`——一塊不透明的實色，iOS 26 的 Liquid Glass 就被蓋掉了
 * （HIG `M-08`：玻璃元件上不要再疊自訂背景）。理由的正本在 `../cards/_layout.tsx`。
 *
 * 代價是內容會從導覽列底下穿過去，捲動區得自己讓開。**那正是 `L-02` 要的**，
 * 四頁都用 `contentInsetAdjustmentBehavior="automatic"`，系統自己算得出讓開多少。
 */
import { Stack } from 'expo-router';

export default function DataLayout() {
  // 標題各頁自己給（`Stack.Screen`），這一層只決定「有一個原生導覽列，而且它是玻璃的」。
  return <Stack screenOptions={{ headerTransparent: true }} />;
}
