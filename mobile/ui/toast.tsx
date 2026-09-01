/**
 * 存完留在原地時的那一則回饋。對照網頁版 `src/ui/toast.ts`。
 *
 * 只有「儲存並繼續」用得到它：那是唯一分不出「存進去了」還是「白打一場」的時刻——
 * 畫面留在原地、三面被清空，跟什麼都沒發生長得一模一樣。
 *
 * ## 為什麼掛在畫面上緣，不是下緣
 *
 * 網頁版那一則貼在畫面底部。這裡不能照抄：按下「儲存並繼續」之後焦點會回到詞條，
 * **鍵盤是開著的**，貼底的話整則被鍵盤蓋住，等於沒跳。上緣那一條在導覽列底下，
 * 鍵盤再高也蓋不到。
 *
 * ## 同時只有一則
 *
 * 連著存好幾張時是同一則被新內容取代，不疊成一整排蓋掉半個畫面。做法是呼叫端每次
 * 給一個新的 `key`（見 `./card-editor-screen.tsx`）：這支元件因此整個重生，
 * 計時器跟著重新開始，不必自己去管「上一顆計時器收掉了沒」。
 */
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '@core/i18n';
import { color, fontSize, SCREEN_INSET, TAP_SIZE, weight } from './theme';

/** 自己消失前留在畫面上的時間。與網頁版同一個數字。 */
const LINGER_MS = 3000;

export interface ToastProps {
  message: string;
  /** 該收掉了：時間到，或使用者自己按掉。呼叫端把它從畫面上拿走。 */
  onHide(): void;
}

export function Toast({ message, onHide }: ToastProps) {
  useEffect(() => {
    /**
     * **VoiceOver 靠這一句才知道有事發生。** 這一則不是使用者剛按的那顆按鈕的一部分，
     * 焦點也不會移過來，不主動報的話它就是一則只有眼睛看得到的訊息。
     * 網頁版靠 `role="status"`，iOS 上對應的是這支。
     */
    AccessibilityInfo.announceForAccessibility(message);
    const timer = setTimeout(onHide, LINGER_MS);
    return () => clearTimeout(timer);
    // 空的相依陣列是刻意的。`message` 在這一支的一生裡不會變——呼叫端換內容的做法是
    // 換一個 `key`，整支重生，計時器因此跟著重新開始。
  }, []);

  return (
    <View style={styles.dock} pointerEvents="box-none">
      <View style={styles.toast}>
        <Text style={styles.mark}>✓</Text>
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
        {/* 按掉的入口。它不是必要的（三秒後自己走），但連著加字時擋在詞條上方會礙眼。
            觸控區由 `hitSlop` 撐到 44（HIG `B-01`），視覺上維持一個小叉。 */}
        <Pressable
          onPress={onHide}
          accessibilityRole="button"
          accessibilityLabel={t('toast.close')}
          hitSlop={TAP_SIZE / 2}
        >
          {({ pressed }) => <Text style={[styles.close, pressed && styles.pressed]}>✕</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * 浮在內容之上、貼著上緣。`pointerEvents="box-none"` 讓這一層不吃觸控——
   * 它蓋住的那一條裡除了那顆 ✕ 以外都不該擋住底下的輸入框。
   */
  dock: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SCREEN_INSET,
    paddingTop: 8,
  },
  /**
   * 一則橫條。**它是內容層的東西，走標準材質那一組，不套玻璃**（HIG `M-01`、`M-02`）——
   * 玻璃是控制與導覽那一層的材質，套在一則講完就走的訊息上等於騙人家去按。
   *
   * 底色必須不透明：它蓋在輸入框上面，半透明的話底下的字會從中間穿過去。
   */
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  /** 那個打勾。**不只靠顏色講「成功了」**（HIG `T-14`），符號本身就是那句話。 */
  mark: {
    color: color.label,
    fontSize: fontSize.subheadline,
    fontWeight: weight.semibold,
  },
  text: {
    flex: 1,
    color: color.label,
    fontSize: fontSize.subheadline,
  },
  close: {
    color: color.secondaryLabel,
    fontSize: fontSize.subheadline,
  },
  /** 按下去的樣子（HIG `B-03`）。這一顆只有一個字元，縮放看不出來，用透明度。 */
  pressed: {
    opacity: 0.5,
  },
});
