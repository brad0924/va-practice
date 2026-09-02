/**
 * 介面語言。資料頁點「介面語言 ›」推出來的那一頁（票 `18`）。
 *
 * 四列打勾，對照的是網頁版 `src/ui/data-view.ts` 的 `langSection()`——那邊是一個
 * `<select>`，iPhone 上它叫出來的正是系統的選取介面。手機上換成一頁清單，
 * 是因為資料頁整頁改成了分組清單，一列一件事、要選的東西點進去選。
 *
 * ## 邏輯一行都沒有新寫
 *
 * 「app 內選的」與「跟著系統走」的優先順序是現成的（`core/i18n/index.ts` 的 `t()`）：
 *
 * ```ts
 * TABLES[choice === 'system' ? fromSystem(systemLanguage) : choice][key]
 * ```
 *
 * 選「系統預設」時才聽系統的，選了具體語言就以 app 內的為準。這一頁只是把 `lang()`
 * 畫成打勾、把點擊翻成 `setLang()`。
 *
 * ## 系統設定裡那一條路是另一半
 *
 * `app.json` 的 `CFBundleLocalizations` 列出三種語言，iOS「設定」裡才長得出這支 app 的
 * 語言項目。**票 `18` 之前兩條路都沒有**：app 內沒選單，系統設定裡也找不到。
 * 兩條各管一件事——系統那條換的是「系統語言」，只有在這一頁選著「系統預設」時才看得到效果。
 *
 * ## 換完不必重開 app
 *
 * `setLang()` 由 `../lib/app-context.tsx` 那一支負責，它存好之後把整支 app 重畫一次，
 * 連底下四個 tab 的字一起換（見該檔與 `../app/_layout.tsx` 的 `Shell`）。
 * 這一頁自己也跟著重畫，打勾因此當場就搬家了。
 */
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { lang, t, type LangChoice } from '@core/i18n';
import { SettingsFooterText, SettingsGroup, SettingsRow, settingsListStyle } from './settings-list';
import { color, TAB_BAR_CLEARANCE } from './theme';

/** 選單上那四個，順序就是畫出來的順序。與網頁版 `data-view.ts` 的 `choices` 一致。 */
const CHOICES: readonly LangChoice[] = ['system', 'zh-Hant', 'en', 'ja'];

/**
 * 一個語言選項該顯示成什麼字。**資料頁那一列的值也是它算的**，因此 export。
 *
 * **三個具體語言用各自的自稱，刻意不隨介面語言變**（spec 決定十，與網頁版同一個理由）：
 * 手滑切到看不懂的語言時，滿畫面日文的情況下「繁體中文」那四個字還認得出來，找得回來；
 * 用當前介面語言寫的話就變成一場猜謎。「系統預設」是唯一的例外——它沒有自稱。
 */
export function langLabel(choice: LangChoice): string {
  switch (choice) {
    case 'system':
      return t('data.langSystem');
    case 'zh-Hant':
      return '繁體中文';
    case 'en':
      return 'English';
    case 'ja':
      return '日本語';
  }
}

export interface LanguageScreenProps {
  /**
   * 選了一種語言。存與重畫都在外面那一支（`../lib/app-context.tsx` 的 `setLang()`）——
   * 這一頁不自己叫 `core/i18n` 的 `setLang()`，那樣只會存下去、畫面一個字都不會變。
   */
  onPick(choice: LangChoice): void;
}

export function LanguageScreen({ onPick }: LanguageScreenProps) {
  const current = lang();

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('data.langTitle'), headerTitleAlign: 'center' }} />
      <ScrollView
        contentContainerStyle={styles.list}
        // 導覽列是玻璃的，內容從它底下穿過去，讓系統自己算要讓開多少（HIG `L-02`）。
        contentInsetAdjustmentBehavior="automatic"
      >
        <SettingsGroup footer={<SettingsFooterText text={t('data.langHint')} />}>
          {CHOICES.map((choice) => (
            <SettingsRow
              key={choice}
              label={langLabel(choice)}
              checked={choice === current}
              onPress={() => onPick(choice)}
            />
          ))}
        </SettingsGroup>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.background,
  },
  list: {
    ...settingsListStyle,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
});
