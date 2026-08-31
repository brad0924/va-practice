/**
 * 「卡片」tab 底下的推入導覽（票 `15`）。
 *
 * **這一層存在有兩個理由，兩個都是原生的東西給的：**
 *
 * 1. **系統的搜尋列只長在原生導覽列上。** 票要求「用系統的搜尋列，不自己畫一個」，
 *    往下捲收起、往上捲帶回來、聚焦時跟著鍵盤上滑全由系統負責，而那條列是
 *    `UINavigationController` 的一部分——沒有 `Stack` 就沒有它。
 * 2. **點一列要推出編輯畫面。** 那是票 `16`，這裡先把路接好（2026-08-31 拍板，圖版三·甲）。
 *
 * 其餘三個 tab 仍是單一檔，因為它們沒有第二層。哪一天資料頁或統計頁也要推入一頁，
 * 那一頁自己再長一個這樣的目錄，不必先在這裡預留。
 *
 * ## `headerTransparent` 是「讓系統畫那條列」的開關
 *
 * **它的名字會騙人：開了不是變成看不見，是變成玻璃。** React Navigation 決定導覽列底色的
 * 那一段（`useHeaderConfigProps.js`）只在三種情況給 `transparent`——有自訂 header、
 * 開了 `headerTransparent`、或 iOS 上開著大標題；其餘一律塞主題的 `colors.card`，
 * 那是一塊**不透明的實色**。塞了實色，iOS 26 的 Liquid Glass 就被蓋掉了（HIG `M-08`：
 * 玻璃元件上不要再疊自訂背景）。
 *
 * 這一層原本靠「大標題開著」免費拿到 transparent。2026-08-31 拿掉大標題之後那條路斷了，
 * 導覽列掉回實色——真機上看到的是一塊怪白（那時候主題還是淺色的）。
 * 因此改成明講，不再依賴大標題這個副作用。
 *
 * 代價是內容會從導覽列底下穿過去，捲動區得自己讓開。**那正是 `L-02` 要的**
 * （可捲動的版面要一路捲到最邊，內容從控制層底下透出來），兩頁都用
 * `contentInsetAdjustmentBehavior="automatic"` 或置中版面，系統自己算得出讓開多少。
 *
 * > 深色那一半不在這裡，在 `../_layout.tsx`：那份主題管的是文字與搜尋框的顏色。
 * > 兩個都要，少一個就是「白底黑字」或「深色但沒有玻璃」。
 */
import { Stack } from 'expo-router';

export default function CardsLayout() {
  // 標題各頁自己給（`Stack.Screen`），這一層只決定「有一個原生導覽列，而且它是玻璃的」。
  return <Stack screenOptions={{ headerTransparent: true }} />;
}
