/**
 * 玻璃控制項：這一頁上面那兩條列都是它。標題列那三顆是膠囊，底部那幾顆由呼叫端蓋成圓角矩形。
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
import { color, TAP_SIZE } from './theme';

/** 模組層算一次就好：一支 app 從開到關不會變，放進 render 只是每次重畫多問一次同樣的問題。 */
const canRenderGlass = isGlassEffectAPIAvailable();

/** 相鄰的玻璃元件從多遠開始互相影響。靠得夠近時系統會讓它們融成一塊。 */
const MERGE_SPACING = 20;

export interface GlassGroupProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 這一組實際佔了多高。呼叫端靠它讓開捲動內容，見 `./review-screen.tsx`。 */
  onLayout?: ViewProps['onLayout'];
  /**
   * 這一組裡的玻璃靠多近才融成一塊。**傳 0 就是「同一組，但各自獨立」**。
   *
   * 底部那一條要的正是 0：票 `06` 定案 1a 說評分是「四顆分開的玻璃方塊」，融在一起就不是
   * 四顆了，而且融形時系統會照自己的形狀畫，各自的圓角設定跟著失效。
   * 標題列不傳，走預設值，那邊本來就該連成一氣。
   */
  spacing?: number;
}

/**
 * 一組靠在一起的玻璃膠囊。**相鄰的玻璃元件要放進同一個玻璃容器才會正確融形**（HIG `M-14`）；
 * 各自獨立擺著的話，兩塊玻璃之間不會有那個互相牽動的效果。
 *
 * 容器本身不畫任何東西，只負責告訴系統「這幾塊是一組的」，因此不算多疊一層背景（`M-08`）。
 * `GlassContainer` 與 `GlassView` 同樣要先問過 `isGlassEffectAPIAvailable()`，套件文件明寫。
 */
export function GlassGroup({ children, style, onLayout, spacing = MERGE_SPACING }: GlassGroupProps) {
  if (!canRenderGlass)
    return (
      <View style={style} onLayout={onLayout}>
        {children}
      </View>
    );
  return (
    <GlassContainer spacing={spacing} style={style} onLayout={onLayout}>
      {children}
    </GlassContainer>
  );
}

export interface GlassPillProps {
  children: ReactNode;
  /**
   * **一定要有。** 玻璃是控制層的材質（HIG `M-01`），套在不能按的東西上等於騙人家去按。
   * 標題列的「剩餘 N 張」原本走這裡的靜態版本，已改回一行純文字。
   */
  onPress(): void;
  accessibilityLabel?: string;
  /**
   * 蓋在預設樣式上。**底部那幾顆靠它把圓角改成方的**（票 `06` 定案 1a），
   * 標題列那幾顆維持膠囊。它排在 `styles.pill` 後面，因此蓋得掉預設值。
   */
  style?: StyleProp<ViewStyle>;
}

export function GlassPill({ children, onPress, accessibilityLabel, style }: GlassPillProps) {
  const body = (pressed: boolean) =>
    canRenderGlass ? (
      <GlassView
        style={[styles.pill, style, pressed && styles.pressed]}
        glassEffectStyle="regular"
        // 自訂玻璃按鈕要開啟互動反應，才有系統按鈕那種按壓感（HIG `B-12`）。
        isInteractive
      >
        {children}
      </GlassView>
    ) : (
      <View style={[styles.pill, styles.fallback, style, pressed && styles.pressed]}>
        {children}
      </View>
    );

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
   * 膠囊形狀：小元件用膠囊，大元件才改圓角矩形（HIG `B-13`）。標題列那幾顆走這個預設；
   * 底部整寬的那幾顆自己傳 `style` 蓋成圓角矩形，見 `./review-screen.tsx`。
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
  /**
   * 按下去的樣子（HIG `B-03`）。
   *
   * **縮一下比變淡有感。** 原本只有透明度，真機上按起來像沒反應——手指蓋住按鈕的時候
   * 看不到自己按的那一塊變淡了，看得到的只有邊緣。尺寸變化在邊緣看得最清楚，
   * 所以兩個一起用：縮 4%，淡到八成。
   *
   * iOS 26 上玻璃自己還有一層系統的互動反應（`isInteractive`），這一層疊在它上面；
   * 26 以下沒有那一層，就只剩這裡。
   */
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  /** iOS 26 以下走到這裡。一塊看得出邊界的半透明區塊，不假裝自己是玻璃。 */
  fallback: {
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
  },
});
