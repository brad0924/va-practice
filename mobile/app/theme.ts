/**
 * 這一版畫面共用的顏色與字級。
 *
 * **顏色一律走 `PlatformColor`**，拿的是 iOS 自己的語意色（`label`、`separator`、
 * `systemBlue` 那一組），不是寫死的色碼。這樣「設定 → 輔助使用 → 提高對比」一打開，
 * 顏色會自己跟著變（HIG `T-11`），淺色深色也各自有正確的值——寫死的色碼兩件事都做不到。
 * 這一點與網頁版相反，網頁版抄的是 `src/styles.css` 的 `:root`。
 *
 * **字級是照著 iOS 的 text styles 抄的一張表。** React Native 沒有「給我 Body」這種 API，
 * 只吃數字，所以 HIG `T-02`（不要寫死字級）在這裡只做得到一半：數字集中在這裡一份，
 * 而且 `<Text>` 預設會跟著系統字級放大，因此 Dynamic Type 是活的。
 * 唯一關掉自動放大的是振假名那一排，理由見 `../lib/term-layout.ts`。
 */
import { PlatformColor } from 'react-native';

export const color = {
  /** 整頁的底。內容層。 */
  background: PlatformColor('systemBackground'),
  /** 卡片本體。內容層要分層時用標準材質那一組，不是玻璃（HIG `M-01`、`M-02`）。 */
  card: PlatformColor('secondarySystemBackground'),
  label: PlatformColor('label'),
  secondaryLabel: PlatformColor('secondaryLabel'),
  tertiaryLabel: PlatformColor('tertiaryLabel'),
  separator: PlatformColor('separator'),
  /**
   * 主要動作的顏色。這一頁是「顯示答案」那顆鈕上的字。
   *
   * **它現在上在文字不上在背景**（票 `06` 定案 1a）。原本走的是玻璃底套藍色配白字，
   * 那條路踩過一個坑：白色只能寫色碼，不能寫 `PlatformColor('white')`——
   * React Native 的 iOS 語意色對照表（`react-native/React/Base/RCTConvert.mm`）
   * 只收 40 個名字，`white` 不在裡面，查不到就安靜地給不出顏色，
   * 整顆鈕上會是一片空白（真機實測踩到，2026-08-26）。改成藍字之後那一格不必存在了。
   */
  accent: PlatformColor('systemBlue'),
} as const;

/**
 * iOS text styles 在預設字級下的點數。名字沿用 Apple 的叫法，日後對照文件查得到。
 */
export const fontSize = {
  title2: 22,
  title3: 20,
  headline: 17,
  body: 17,
  subheadline: 15,
  footnote: 13,
} as const;

/**
 * 字重只用這四個。Ultralight／Thin／Light 三個一律不碰（HIG `T-05`）。
 * React Native 的 `fontWeight` 吃字串。
 */
export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
} as const;

/** 控制項的最小點擊區。HIG `B-01`、`B-02` 都是這個數字。 */
export const TAP_SIZE = 44;

/** 浮在內容之上的那兩條控制列離螢幕邊緣多遠。整寬按鈕要避開（HIG `L-05`）。 */
export const SCREEN_INSET = 16;
