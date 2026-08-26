/**
 * 圓形的圖示鈕。卡片最下面那兩顆「複製」與「朗讀」就是它（樣版 1a）。
 *
 * **符號一律用 SF Symbols，不自己畫。** `B-14` 明講：系統已經有的符號自己畫一個就沒過。
 * React Native 沒有內建，走的是 `expo-symbols` 的 `SymbolView`——那是原生模組，
 * 因此這一顆鈕的改動要跟票 `08` 湊在一起重新出包（見票 `09`〈與票 08 一起出包〉）。
 *
 * > 導覽列那四個圖示**不走這一支**。那邊的符號由 `NativeTabs.Trigger.Icon` 的 `sf`
 * > 直接餵給系統的 tab bar，中間沒有 `SymbolView`。
 *
 * 它是**內容層**的按鈕，因此不套玻璃（HIG `M-01`）——那兩顆畫在卡片裡面，而卡片是內容。
 * 底色走標準材質那一組（`M-02`），見 `./theme.ts` 的 `color.fill`。
 *
 * > **`B-10`（不要寫死按鈕的尺寸與圓角，讓系統套 iOS 26 的新值）在這裡做不到**，
 * > 與 `./glass-pill.tsx` 同一個理由：React Native 沒有系統按鈕元件可用，尺寸只能自己給。
 * > 守的是下限與比例——44 是地板，圓角永遠取直徑的一半，字級變大時兩者一起長。
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { color, TAP_SIZE } from './theme';

/**
 * 符號在預設字級下多大。樣版 1a 上是 17——與 `fontSize.headline` 同一個數字不是巧合，
 * 那顆鈕原本裝的就是一行字。
 */
const SYMBOL_SIZE = 17;

/** 符號與圓形邊緣之間留多少。兩邊加起來讓預設字級下的圓剛好是 44。 */
const SYMBOL_PADDING = (TAP_SIZE - SYMBOL_SIZE) / 2;

export interface IconButtonProps {
  /** SF Symbol 的名字。打錯字 `tsc` 會擋下來——那個型別收了 SF Symbols 全表。 */
  name: SFSymbol;
  /** **一定要有。** 鈕面上沒有字，少了它 VoiceOver 只會唸出「按鈕」。 */
  accessibilityLabel: string;
  onPress(): void;
}

export function IconButton({ name, accessibilityLabel, onPress }: IconButtonProps) {
  /**
   * 圖示跟著系統字級一起放大（HIG `T-06`）。字放大而圖示不動的話，同一排東西的
   * 大小關係就垮了。圓也跟著長，因此 44 是下限而不是固定值。
   */
  const { fontScale } = useWindowDimensions();
  const symbol = SYMBOL_SIZE * fontScale;
  // 44 是下限（`B-01`）：iOS 的字級也調得比預設小，那時候圓不能跟著縮到按不到。
  const diameter = Math.max(TAP_SIZE, symbol + SYMBOL_PADDING * 2);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {({ pressed }) => (
        <View
          style={[
            styles.circle,
            // 半徑取直徑的一半，圓角因此永遠是正圓，字級再大也不會變成圓角方塊。
            { width: diameter, height: diameter, borderRadius: diameter / 2 },
            pressed && styles.pressed,
          ]}
        >
          <SymbolView name={name} size={symbol} tintColor={color.label} resizeMode="scaleAspectFit" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * 按下去的樣子（HIG `B-03`）。**縮一下比變淡有感**——手指蓋住按鈕的時候看不到
   * 中間變淡了，看得到的只有邊緣。與 `./glass-pill.tsx` 用同一組數字。
   */
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
});
