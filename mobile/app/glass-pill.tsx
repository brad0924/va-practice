/**
 * 玻璃膠囊：這一頁所有控制項的形狀。標題列那三顆、底部的「顯示答案」與四顆評分鈕都是它。
 *
 * **玻璃只用在控制與導覽這一層**（HIG `M-01`）。卡片本體、釋義、頁面底色一律不套——
 * 那些是內容層，要分層時用標準材質（`M-02`），見 `./theme.ts`。
 *
 * `GlassView` 只在 iOS 26 以上存在，而且某些 iOS 26 beta 沒有這個 API，直接畫下去會閃退，
 * 因此畫之前先問一次 `isGlassEffectAPIAvailable()`。**16.4 到 25 的機器退回一般區塊**，
 * 不另外做仿玻璃版本（見 `.scratch/rn-rewrite/spec.md` 的〈外觀與舊版裝置〉）。
 */
import { GlassContainer, GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { ACCENT_TINT, color, TAP_SIZE } from './theme';

/** 模組層算一次就好：一支 app 從開到關不會變，放進 render 只是每次重畫多問一次同樣的問題。 */
const canRenderGlass = isGlassEffectAPIAvailable();

/** 相鄰的玻璃元件從多遠開始互相影響。靠得夠近時系統會讓它們融成一塊。 */
const MERGE_SPACING = 20;

export interface GlassGroupProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 這一組實際佔了多高。呼叫端靠它讓開捲動內容，見 `./review-screen.tsx`。 */
  onLayout?: ViewProps['onLayout'];
}

/**
 * 一組靠在一起的玻璃膠囊。**相鄰的玻璃元件要放進同一個玻璃容器才會正確融形**（HIG `M-14`）；
 * 各自獨立擺著的話，兩塊玻璃之間不會有那個互相牽動的效果。
 *
 * 容器本身不畫任何東西，只負責告訴系統「這幾塊是一組的」，因此不算多疊一層背景（`M-08`）。
 * `GlassContainer` 與 `GlassView` 同樣要先問過 `isGlassEffectAPIAvailable()`，套件文件明寫。
 */
export function GlassGroup({ children, style, onLayout }: GlassGroupProps) {
  if (!canRenderGlass)
    return (
      <View style={style} onLayout={onLayout}>
        {children}
      </View>
    );
  return (
    <GlassContainer spacing={MERGE_SPACING} style={style} onLayout={onLayout}>
      {children}
    </GlassContainer>
  );
}

export interface GlassPillProps {
  children: ReactNode;
  /** 沒有 `onPress` 的就不是按鈕，是一塊靜態的膠囊（標題列的「剩餘 N 張」）。 */
  onPress?: () => void;
  /**
   * 上色的那一顆。**一頁只給一個**（HIG `M-10`）——這一頁是「顯示答案」。
   * 色彩加在背景不加在文字，因此玻璃吃 `tintColor`，文字仍走單色。
   */
  tinted?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function GlassPill({ children, onPress, tinted, accessibilityLabel, style }: GlassPillProps) {
  const body = (pressed: boolean) =>
    canRenderGlass ? (
      <GlassView
        style={[styles.pill, style, pressed && styles.pressed]}
        glassEffectStyle="regular"
        tintColor={tinted ? ACCENT_TINT : undefined}
        // 自訂玻璃按鈕要開啟互動反應，才有系統按鈕那種按壓感（HIG `B-12`）。
        isInteractive={onPress !== undefined}
      >
        {children}
      </GlassView>
    ) : (
      <View style={[styles.pill, styles.fallback, tinted && styles.fallbackTinted, style, pressed && styles.pressed]}>
        {children}
      </View>
    );

  if (onPress === undefined) return body(false);

  // 自訂按鈕一定要有按下狀態（HIG `B-03`）。玻璃自己的互動反應只在 iOS 26 上有，
  // 退回一般區塊的機器上就只剩這一層透明度，因此兩條路都掛。
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

export interface ContentPillProps {
  children: ReactNode;
  onPress(): void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * 內容層裡的按鈕。形狀與 `GlassPill` 一樣，但**一律不套玻璃**。
 *
 * 卡片裡的「複製」與「朗讀」走這一支。HIG `M-01` 說玻璃只用在控制與導覽這一層，
 * 而那兩顆畫在卡片裡面——卡片是內容層。內容層要分層時走標準材質（`M-02`），
 * 也就是這裡用的那組顏色，與 `GlassPill` 在 iOS 26 以下退回的樣子是同一種。
 */
export function ContentPill({ children, onPress, accessibilityLabel, style }: ContentPillProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {({ pressed }) => (
        <View style={[styles.pill, styles.fallback, style, pressed && styles.pressed]}>{children}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * 膠囊形狀：小元件用膠囊，大元件才改圓角矩形（HIG `B-13`）。這一頁的控制項都是小的。
   *
   * > `B-10` 說不要寫死按鈕的尺寸與圓角、讓系統套 iOS 26 的新值。**這一條做不到**：
   * > React Native 沒有系統按鈕元件可用，尺寸只能自己給。這裡守的是下限——
   * > `minHeight` 與 `minWidth` 都是 44（`B-01`、`B-02`），字級變大時由內距把它撐開。
   */
  pill: {
    minHeight: TAP_SIZE,
    minWidth: TAP_SIZE,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    // **不要加 `overflow: 'hidden'`。** 膠囊是圓角 999，一旦開了裁切，字只要有一點
    // 放不下就會被那個圓形的邊緣削成一條橫帶——真機在最大字級下踩到（2026-08-26）。
    // 那把「字有點擠」放大成「字整個不見」。背景與玻璃本來就會照圓角畫，不靠這一行。
  },
  pressed: {
    opacity: 0.55,
  },
  /** iOS 26 以下走到這裡。一塊看得出邊界的半透明區塊，不假裝自己是玻璃。 */
  fallback: {
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
  },
  fallbackTinted: {
    backgroundColor: color.accent,
    borderColor: 'transparent',
  },
});
