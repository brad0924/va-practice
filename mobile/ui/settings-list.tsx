/**
 * 系統風格的分組清單：一行一件事，要填的東西點進去填（票 `18`）。
 *
 * 維護者 2026-09-01 看過並排的實物圖後選定這個版面，對照組是「設定」與「提醒事項」。
 * **這不是網頁版 `src/ui/data-view.ts` 那種一頁到底的區塊卷軸**——那邊一段說明配一組欄位，
 * 手機上一列裝不下一段說明，長句改放在群組底下的小字（iOS 的 section footer），
 * 最長的那幾段則整段搬進子畫面。
 *
 * ## `L-07` 在這裡只做得到一半
 *
 * HIG `L-07` 要的是「列高、內距、區塊圓角交給系統，不沿用寫死的舊數字」。
 * **React Native 沒有 `UITableView`**，`UICollectionLayoutListConfiguration.insetGrouped`
 * 那一套拿不到，只能自己畫一個長得像的。因此底下真的有兩個數字：
 *
 * - 列高走 `TAP_SIZE`（44）。那正好是 UIKit 分組清單的預設列高，也是 `B-01` 的觸控下限，
 *   而且它是 `minHeight` 不是 `height`——字級調大時由內距把它撐開，Dynamic Type 活著。
 * - 圓角是 `GROUP_RADIUS`，一個目測值（見底下）。
 *
 * 兩個都集中在這一支檔，換一次就三頁一起換。**真正的守門是驗收那條「與『設定』、
 * 『提醒事項』並排目測，不覺得舊」**——這裡寫得再好也代替不了那一眼。
 *
 * ## `LT-02` 也只做到一半，寫下來免得日後被當成漏掉
 *
 * `LT-02` 要求「導覽用的列按下去要持續高亮，選項式的列要留下一個看得到的符號」。
 * 後半有做：打勾是 `checked`，那是真的留在畫面上的符號。**前半沒有**——底下 `SettingsRow`
 * 只有按住時的短暫高亮，手指放開就消失。
 *
 * 理由是這一版的推入導覽由系統負責：按下去馬上推出下一頁，這一頁被蓋住，
 * 「持續高亮」在單欄的 iPhone 上看不到（那條規矩對的是 iPad 的雙欄，左欄要標出右欄在看誰）。
 * 這支 app 只出 iPhone 直式（`app.json` 的 `orientation: "portrait"`），因此接受這個缺口。
 * 哪天要支援 iPad 的雙欄，這一段要重新想過。
 */
import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { color, fontSize, SCREEN_INSET, TAP_SIZE, weight } from './theme';

/**
 * 一整組的圓角。**這是目測值，不是系統給的**。
 *
 * UIKit 的 `insetGrouped` 用的是 10，而這個 codebase 既有的卡片與輸入框用 12
 * （`./card-editor-screen.tsx` 的 `field`）。取 12 讓資料頁與編輯畫面看起來是同一支 app——
 * 兩個數字差 2 點，比「同一支 app 裡兩種圓角」好認。
 */
const GROUP_RADIUS = 12;

/** 列的左右內距。分隔線也從這裡起算，才會對齊列上的字（iOS 的分隔線就是這樣縮的）。 */
const ROW_INSET = 16;

export interface SettingsGroupProps {
  /** 群組上面那行小標。省略就沒有標頭——單獨一列、標籤本身已經說完話的那種群組不必給。 */
  title?: string;
  /** 群組底下那段小字。長句住在這裡，不是塞進列裡。 */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * 一整組。標頭、圓角容器、底下的小字。
 *
 * 列與列之間的分隔線由這一層畫，不是由列自己畫——列自己畫的話最後一列底下會多一條，
 * 而 iOS 的分組清單最後一列底下是沒有線的。
 */
export function SettingsGroup({ title, footer, children }: SettingsGroupProps) {
  // 攤平並丟掉 false／null：呼叫端用 `{條件 && <SettingsRow …/>}` 決定要不要長出某一列，
  // 不濾掉的話那幾個空位會被算成一列，於是畫出兩條連在一起的分隔線。
  const rows = Children.toArray(children);

  return (
    <View style={styles.group}>
      {title !== undefined && <Text style={styles.groupTitle}>{title}</Text>}
      <View style={styles.rows}>
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 && <View style={styles.separator} />}
            {row}
          </View>
        ))}
      </View>
      {footer !== undefined && <View style={styles.footer}>{footer}</View>}
    </View>
  );
}

/** 群組底下那段小字。分成一支是因為一個群組底下可能疊好幾段（說明加上一行狀態字）。 */
export function SettingsFooterText({ text, tone }: { text: string; tone?: 'danger' }) {
  return <Text style={[styles.footerText, tone === 'danger' && styles.dangerText]}>{text}</Text>;
}

export interface SettingsRowProps {
  label: string;
  /** 右邊那格灰字，例如語言那一列的「繁體中文」。 */
  value?: string;
  /** 右邊要不要有那個 `›`。有它代表「點進去是另一頁」（HIG `N-12` 那類推入式導覽）。 */
  chevron?: boolean;
  /** 打勾。選項式的列要留下一個看得到的符號，不能只閃一下（HIG `LT-02`）。 */
  checked?: boolean;
  /**
   * 破壞性的那一列（「停止同步」）。**只換字的顏色，不換 role**——
   * HIG `B-06`：破壞性動作不指定 primary role，即使它是最可能被選的那顆。
   * 顏色也不是唯一的訊號：按下去還有一張講明後果的警示窗（`T-14`）。
   */
  tone?: 'danger';
  /** 省略就是一列不能按的資訊（例如「暱稱  某某」）。 */
  onPress?: () => void;
}

/**
 * 一列。
 *
 * 不能按的那種不包 `Pressable`：包了 VoiceOver 會把它唸成按鈕，而它按下去什麼都不會發生。
 */
export function SettingsRow({ label, value, chevron, checked, tone, onPress }: SettingsRowProps) {
  const body = (pressed = false) => (
    <View style={[styles.row, pressed && styles.pressed]}>
      <Text style={[styles.rowLabel, tone === 'danger' && styles.dangerText]}>{label}</Text>
      <View style={styles.spring} />
      {value !== undefined && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      {checked === true && (
        <Text style={styles.check} accessible={false}>
          ✓
        </Text>
      )}
      {chevron === true && (
        <Text style={styles.chevron} accessible={false}>
          {'›'}
        </Text>
      )}
    </View>
  );

  if (onPress === undefined) return body();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // 值與打勾都是這一列的狀態，不是另一個元素——分開唸的話 VoiceOver 會把一列講成兩句。
      accessibilityValue={value === undefined ? undefined : { text: value }}
      accessibilityState={checked === undefined ? undefined : { selected: checked }}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/** 群組與群組之間的間距，讓呼叫端疊在同一個捲動區裡。 */
export const settingsListStyle: ViewStyle = {
  paddingHorizontal: SCREEN_INSET,
  paddingTop: 12,
  gap: 28,
};

const styles = StyleSheet.create({
  group: {
    gap: 7,
  },
  /**
   * 群組上面那行小標。iOS 上它是灰的小字，**不是全大寫**——那是 iOS 13 以前的樣子，
   * 現在的「設定」用的是一般大小寫。
   */
  groupTitle: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
    fontWeight: weight.semibold,
    paddingHorizontal: ROW_INSET,
  },
  /**
   * 圓角容器。底色走標準材質那一組（HIG `M-02`），**不是玻璃**——清單是內容層的東西，
   * 玻璃只給控制與導覽那一層（`M-01`）。這一頁上屬於那一層的是導覽列與 tab bar。
   */
  rows: {
    backgroundColor: color.card,
    borderRadius: GROUP_RADIUS,
    // 列的按下效果會塗滿整列，不裁的話四個角會塗出圓角外面。
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TAP_SIZE,
    paddingHorizontal: ROW_INSET,
    paddingVertical: 10,
    gap: 8,
  },
  /** 按下去的樣子（HIG `B-03`）。整列亮起來，與 iOS 的清單一致。 */
  pressed: {
    backgroundColor: color.fill,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
    // 從標籤那一欄起算，與 iOS 的分隔線同一個縮法。
    marginLeft: ROW_INSET,
  },
  rowLabel: {
    color: color.label,
    fontSize: fontSize.body,
  },
  /** 把標籤推到左邊、值推到右邊。`flex: 1` 放在這裡而不是標籤上，長標籤才不會被壓扁。 */
  spring: {
    flex: 1,
    minWidth: 8,
  },
  rowValue: {
    color: color.secondaryLabel,
    fontSize: fontSize.body,
    // 值太長時讓它縮，標籤不縮——縮掉標籤的話這一列在講什麼就沒了。
    flexShrink: 1,
  },
  check: {
    color: color.accent,
    fontSize: fontSize.body,
    fontWeight: weight.semibold,
  },
  chevron: {
    color: color.tertiaryLabel,
    fontSize: fontSize.body,
    fontWeight: weight.semibold,
  },
  footer: {
    paddingHorizontal: ROW_INSET,
    gap: 6,
  },
  footerText: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
  },
  dangerText: {
    color: color.danger,
  },
});
