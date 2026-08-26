/**
 * 詞條：兩層 `<Text>` 疊字做出振假名。算式在 `../lib/term-layout.ts`，這裡只負責畫。
 *
 * **長按選不起來，那是這條路的代價。** 詞條被拆成好幾個 `<Text>`，而 iOS 的長按選取
 * 只在單一個 `<Text>` 內成立（`.scratch/rn-spike/issues/01` 記過這件事）。
 * 補救是旁邊那顆「複製」，見 `./copy-button.tsx`。
 *
 * VoiceOver 補得回來：整排掛一個 `accessibilityLabel`，會把詞條當一個東西唸完，
 * 不會一欄一欄拆著唸。
 */
import { useWindowDimensions, StyleSheet, Text, View } from 'react-native';
import { toPlainText } from '@core/lib/reading';
import { termColumns, termMetrics } from '../lib/term-layout';
import { color, weight } from './theme';

export interface TermProps {
  /** 帶讀音標記的詞條原文，如 `焦[こ]がす`。 */
  text: string;
  /** 掀開答案了沒。蓋著時漢字不標讀音——卡片正面就是靠這點測驗讀法的。 */
  showReading: boolean;
}

export function Term({ text, showReading }: TermProps) {
  // 用 `useWindowDimensions()` 而不是只讀一次的 `PixelRatio.getFontScale()`：
  // 使用者在設定裡調字級之後，這支 app 不必重開就跟上。
  const { fontScale } = useWindowDimensions();
  const metrics = termMetrics(fontScale);
  const columns = termColumns(text, showReading);

  return (
    <View
      style={[styles.row, { columnGap: metrics.columnGap }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={toPlainText(text)}
    >
      {columns.map((column, index) => (
        // 同一個字可能在詞條裡出現兩次，key 因此帶位置。這一排只會整批重建，不會逐欄增刪。
        <View key={`${index}-${column.base}`} style={styles.column}>
          {column.reading !== undefined && (
            <Text
              allowFontScaling={false}
              style={[
                styles.reading,
                {
                  fontSize: metrics.kana,
                  lineHeight: metrics.kanaLineHeight,
                  // 負的下邊距把假名往下貼，字身底端碰到漢字字身頂端。
                  marginBottom: -metrics.readingPull,
                },
              ]}
            >
              {column.reading}
            </Text>
          )}
          <Text
            allowFontScaling={false}
            style={[styles.base, { fontSize: metrics.term, lineHeight: metrics.baseLineHeight }]}
          >
            {column.base}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /** 整排 `flexWrap` 換行。換行只發生在欄與欄之間，一欄的讀音與本文不會被拆散。 */
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  /** 一欄上假名下本文。沒有讀音的欄只有本文那一個 `<Text>`，高度仍由行距撐住，兩者對得齊。 */
  column: {
    alignItems: 'center',
  },
  reading: {
    color: color.secondaryLabel,
    fontWeight: weight.regular,
    textAlign: 'center',
  },
  base: {
    color: color.label,
    fontWeight: weight.medium,
    textAlign: 'center',
  },
});
