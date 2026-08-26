/**
 * 「這裡什麼都沒有，原因是這個」的那一塊：一個大符號、一行標題、一段說明。
 *
 * 三個地方用它，講的都是同一件事——**畫面是空的，而空是有原因的**：
 * 複習畫面的「今日份完成」與「還沒有單字本」（票 `06`），以及卡片與統計那兩頁「還沒做」
 * （票 `09`，見 `./placeholder-screen.tsx`）。三處長得一樣是刻意的，人才會一眼認出
 * 「這不是壞掉，是沒東西」。
 */
import { StyleSheet, Text, View } from 'react-native';
import { color, fontSize, weight } from './theme';

/**
 * 上面那個符號多大。
 *
 * **這一個不走 `./theme.ts` 的字級表，因為它不是文字。** 它是拿字型當插圖用，
 * Apple 的 text styles 裡沒有對應的一格；表裡最大的 `title2` 是 22，套上去只會變成
 * 一個看不出是圖的字。這個數字唯一的要求是「一眼看得出是插圖不是句子」。
 */
const MARK_SIZE = 44;

export interface NoticeProps {
  /** 當插圖用的那個符號，一個字元。 */
  mark: string;
  title: string;
  /** 為什麼是空的。一句話講完。 */
  note: string;
}

export function Notice({ mark, title, note }: NoticeProps) {
  return (
    <View style={styles.notice}>
      <Text style={styles.mark}>{mark}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    alignItems: 'center',
    gap: 12,
  },
  mark: {
    fontSize: MARK_SIZE,
  },
  title: {
    color: color.label,
    fontSize: fontSize.title2,
    fontWeight: weight.semibold,
    textAlign: 'center',
  },
  note: {
    color: color.secondaryLabel,
    fontSize: fontSize.body,
    textAlign: 'center',
  },
});
