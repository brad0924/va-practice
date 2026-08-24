import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Text, View } from 'react-native';

/**
 * 骨架票（`.scratch/rn-rewrite/issues/03`）的探針畫面，不是任何一頁正式介面。
 *
 * 它只回答兩件事：EAS Build 出來的包裝得進真機嗎、`GlassView` 在這台機器上真的長出玻璃嗎。
 * 複習畫面是票 `06`，那時整支 App.tsx 會被換掉。
 */

/**
 * `GlassView` 只在 iOS 26 以上存在，而且某些 iOS 26 beta 版本沒有這個 API，直接畫下去會閃退。
 * 套件因此另外提供 `isGlassEffectAPIAvailable()`，要在畫之前先問一次。
 *
 * 兩個檢查問的不是同一件事，所以兩個都顯示：
 * - `isGlassEffectAPIAvailable()`：這台機器上叫得動這個 API 嗎（閃退防線）
 * - `isLiquidGlassAvailable()`：這支 app 現在正以 Liquid Glass 的樣子在跑嗎
 *
 * 兩個都在模組層算一次就好。套件那邊各自把答案記在模組變數裡，一支 app 從開到關不會變，
 * 放進 render 只是每次重畫多問一次同樣的問題。
 */
const canRenderGlass = isGlassEffectAPIAvailable();
const usingLiquidGlass = isLiquidGlassAvailable();

/**
 * 玻璃的重點是折射，不是模糊。細條紋加上強對比，玻璃有沒有把線折彎才看得出來——
 * 底下若是一片素色，毛玻璃與 Liquid Glass 長得一模一樣，這張票就白驗了。
 *
 * 顏色取自網頁版 `src/styles.css` 的評分色，沒有別的意思，只是要一組彼此對比夠強的顏色。
 */
const STRIPE_COLORS = ['#6ea8ff', '#d9534f', '#d9843f', '#46a758', '#d9c14f', '#9a7fe0'];

/** 條紋斜著鋪，數量與間距只求蓋滿整面螢幕（轉過角度之後要留出頭尾），沒有其他考量。 */
const STRIPE_COUNT = 40;
const STRIPE_STEP = 44;
const STRIPE_TOP = -420;

export default function App() {
  const status = [
    canRenderGlass ? 'GlassView API 可用' : 'GlassView API 不可用（已退回一般區塊）',
    usingLiquidGlass ? 'Liquid Glass 開著' : 'Liquid Glass 沒開',
    `iOS ${Platform.Version}`,
  ].join(' · ');

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: STRIPE_COUNT }, (_, index) => (
          <View
            key={index}
            style={[
              styles.stripe,
              {
                top: STRIPE_TOP + index * STRIPE_STEP,
                backgroundColor: STRIPE_COLORS[index % STRIPE_COLORS.length],
              },
            ]}
          />
        ))}
        <View style={[styles.blob, styles.blobTop]} />
        <View style={[styles.blob, styles.blobBottom]} />
      </View>

      <View style={styles.center}>
        {canRenderGlass ? (
          <GlassView style={styles.card} glassEffectStyle="regular" />
        ) : (
          <View style={[styles.card, styles.fallbackCard]} />
        )}

        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </View>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // 網頁版 src/styles.css 的 --bg。條紋蓋不到的縫隙填這個色。
    backgroundColor: '#141821',
  },
  stripe: {
    position: 'absolute',
    left: -400,
    width: 1400,
    height: 18,
    transform: [{ rotate: '-24deg' }],
  },
  blob: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  blobTop: {
    top: 90,
    left: -60,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  blobBottom: {
    bottom: 120,
    right: -70,
    backgroundColor: 'rgba(8, 11, 36, 0.75)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingHorizontal: 24,
  },
  card: {
    width: '86%',
    height: 200,
    borderRadius: 40,
  },
  /** iOS 26 以下走到這裡。畫一塊看得出邊界的半透明區塊，才知道退回這條路真的有走到。 */
  fallbackCard: {
    backgroundColor: 'rgba(30, 36, 48, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(238, 242, 248, 0.35)',
  },
  statusPill: {
    backgroundColor: 'rgba(20, 24, 33, 0.86)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  statusText: {
    color: '#eef2f8',
    fontSize: 14,
    textAlign: 'center',
  },
});
