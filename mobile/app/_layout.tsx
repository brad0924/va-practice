/**
 * 底部導覽列，四個頂層畫面（票 `09`）。
 *
 * **這是 iOS 26 的樣子，不是 iOS 18 的樣子。** 舊版是整寬貼底、方角、實心一條；
 * 26 上它是浮在內容上的膠囊，左右內縮到系統邊距內，底下的內容透出來（`N-01`）。
 * 這裡沒有任何一行在畫那個形狀——`NativeTabs` 底下就是 `UITabBarController`，
 * 長相與行為都由系統給。
 *
 * > **為什麼不自己用 `GlassView` 畫一條**：捲動縮小做不到。那是 `UITabBarController`
 * > 內部的行為，不對外開放。而票 `09` 接受「底部一次兩條 chrome」這個代價時，
 * > 寫下的減輕因素正是「iOS 26 的導覽列會在捲動時自己縮小」——自己畫的話那句話就跳票了。
 *
 * `app/` 這個目錄整個是 `expo-router` 的路由表，因此**只放路由檔**。畫面本體與共用元件
 * 住在 `../ui/`，共用的那一份資料住在 `../lib/app-context.tsx`。
 */
import { DarkTheme, ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { StatusBar } from 'expo-status-bar';
import { t } from '@core/i18n';
import { AppProvider } from '../lib/app-context';

export default function Layout() {
  return (
    <AppProvider>
      {/**
       * **告訴導覽這支 app 是深色的。** 少了這一行，`Stack` 的導覽列會拿
       * `DefaultTheme`（淺色）那一組顏色——底是白的、字是黑的。
       *
       * `app.json` 那行 `userInterfaceStyle: "dark"` 管的是 UIKit 元件與
       * `PlatformColor` 語意色，**管不到這裡**：導覽列的顏色由 React Navigation 自己那份
       * 主題決定，而它的預設值寫死在 `NavigationContainer.js` 的 `theme = DefaultTheme`。
       *
       * 票 `09` 到 `14` 之間沒有人看得出這件事，因為那時候畫面上只有 `NativeTabs`——
       * 它底下是 `UITabBarController`，長相由系統給，不吃這份主題。
       * 票 `15` 的卡片列表加了第一個 `Stack`，白底黑字才浮出來（真機踩到，2026-08-31）。
       */}
      <ThemeProvider value={DarkTheme}>
        {/**
         * 捲動時 tab bar 自己縮成小膠囊。要 iOS 26 與 Xcode 26，26 以下這個值被系統忽略。
         * 它是票 `09`〈已知並接受的代價〉那一段唯一的減輕因素，不能漏掉。
         */}
        <NativeTabs minimizeBehavior="onScrollDown">
          {/**
           * 四個 tab 的字都查表（`ADR-0013`），`nav.*` 那四條三份翻譯檔本來就有。
           * 每一條都是一個詞（`N-06`）。
           *
           * 圖示是填滿版的系統符號（`N-07`），四個都經維護者目測選定（2026-08-26）：
           * 「複習」是在做的事，用學士帽；「卡片」是一批東西，用一疊卡。這兩個 tab 天生會
           * 搶同一個圖案，拆法就在這裡——一個是動作，一個是收藏。
           */}
          <NativeTabs.Trigger name="index">
            <NativeTabs.Trigger.Icon sf="graduationcap.fill" />
            <NativeTabs.Trigger.Label>{t('nav.review')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="cards">
            <NativeTabs.Trigger.Icon sf="rectangle.stack.fill" />
            <NativeTabs.Trigger.Label>{t('nav.cards')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="data">
            <NativeTabs.Trigger.Icon sf="gearshape.fill" />
            <NativeTabs.Trigger.Label>{t('nav.data')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="stats">
            <NativeTabs.Trigger.Icon sf="chart.bar.fill" />
            <NativeTabs.Trigger.Label>{t('nav.stats')}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
        <StatusBar style="light" />
      </ThemeProvider>
    </AppProvider>
  );
}
