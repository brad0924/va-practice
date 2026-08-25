/**
 * 複製：把去掉讀音標記後的詞條原文放進系統剪貼簿。正名見 `CONTEXT.md`。
 *
 * **它存在是因為詞條長按選不起來。** 振假名靠兩層 `<Text>` 疊字做，詞條因此被拆成
 * 好幾個 `<Text>`，而 iOS 的長按選取只在單一個 `<Text>` 內成立
 * （`.scratch/rn-spike/issues/01` 記過這個代價）。釋義沒有這個問題，那邊照樣長按選得起來。
 *
 * 複製出去的是 `焦[こ]がす` → `焦がす`——那才是貼進字典查得到的東西，
 * 也跟判斷詞條全域唯一時用的是同一個基準（`core/lib/storage.ts` 的 `findTermConflict()`）。
 */
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { t } from '@core/i18n';
import { toPlainText } from '@core/lib/reading';
import { ContentPill } from './glass-pill';
import { color, fontSize, weight } from './theme';

/** 「已複製」停留多久。夠久看得到，短到不會擋住下一次操作。 */
const CONFIRM_MS = 1600;

export interface CopyButtonProps {
  /** 帶讀音標記的詞條原文。 */
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 按完就切到別張卡、或整個畫面被收掉時，計時器要跟著下班——
  // 不然它會回頭對一個已經不在畫面上的元件設狀態。
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  function copy(): void {
    // 不等它寫完：呼叫端是一個點擊處理器。寫失敗也吞掉，使用者能做的只有再按一次。
    void Clipboard.setStringAsync(toPlainText(text)).catch(() => {});
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
  }

  return (
    <ContentPill onPress={copy} accessibilityLabel={t('review.copy')} style={styles.pill}>
      <Text style={styles.text}>{copied ? t('review.copied') : t('review.copy')}</Text>
    </ContentPill>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
  },
  text: {
    color: color.label,
    fontSize: fontSize.footnote,
    fontWeight: weight.medium,
  },
});
