/**
 * 「還沒做」的那一頁。**「統計」那個 tab，以及卡片列表點進去的編輯畫面**，現在都是它。
 *
 * **tab 不會因為內容是空的就停用或隱藏**（HIG `N-05`）——那樣的話人按下去沒反應，
 * 會以為 app 壞了。要留在導覽列上，並在頁內說清楚為什麼是空的。說明那一塊與複習畫面的
 * 「今日份完成」共用同一支 `./notice.tsx`，三處空畫面因此長得一樣。
 *
 * > **這一支是暫時的**，編輯頁（票 `16`）與統計頁各自的票一動工就地取代它。
 * > 卡片列表那一頁已經在票 `15` 取代掉了。因此頁內的字**不查表**：
 * > `ADR-0013` 管的是介面文字，而這幾句話會跟這支檔一起消失，為它們往三份翻譯檔各加一條，
 * > 留下的是三條孤兒。與票 `18` 刪掉的那支探針畫面同一個立場。
 */
import { StyleSheet, View } from 'react-native';
import { Notice, type NoticeProps } from './notice';
import { color, SCREEN_INSET } from './theme';

export type PlaceholderScreenProps = NoticeProps;

export function PlaceholderScreen(props: PlaceholderScreenProps) {
  return (
    <View style={styles.root}>
      <Notice {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  /** 背景延伸到螢幕實體邊緣，四邊不留白條（HIG `L-01`）。 */
  root: {
    flex: 1,
    backgroundColor: color.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SCREEN_INSET,
  },
});
