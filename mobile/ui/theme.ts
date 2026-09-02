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
   * 內容層裡那種「一塊淡淡的底」。卡片最下面那兩顆圓形圖示鈕就是它。
   *
   * 對照的是樣版 1a 上的 `rgba(120,120,128,0.2)`——那組數字正是 iOS 這個語意色在
   * 深色模式下的值（`react-native/React/Base/RCTConvert.mm` 的 `systemFillColor`
   * 備援值是 `0x33787880`）。寫語意名而不是抄那串色碼，「提高對比」才跟得動（`T-11`）。
   */
  fill: PlatformColor('systemFill'),
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
  /**
   * 破壞性動作的顏色。單字本那顆「刪除」與匯入失敗那行紅字走它。
   *
   * **顏色不是唯一的訊號**：刪除按下去還有一張講明後果的警示窗，失敗那行本身就是一句話，
   * 轉成灰階兩者都讀得出來（HIG `T-14`）。走語意色是為了讓「提高對比」跟得動（`T-11`）——
   * 網頁版 `src/styles.css` 那個 `--danger` 是寫死的色碼，這裡刻意不抄。
   */
  danger: PlatformColor('systemRed'),
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

/**
 * 捲動區底部要多留這麼一段（票 `18`）。
 *
 * **tab bar 是浮在內容之上的**（iOS 26 那條膠囊），捲到底時最後一列會躲在它後面。
 * 這一段留白把最後一列頂上來（HIG `L-02`）。
 *
 * 這是一個目測值，不是量出來的——`react-native-safe-area-context` 的下緣安全區量得到
 * home indicator，量不到那條浮著的膠囊有多高。真機上若最後一列仍被蓋住，調的是這一格。
 *
 * > `card-editor-screen.tsx` 那一頁還寫著自己的 `paddingBottom: 120`，數字一樣。
 * > 那是票 `16` 留下的，這張票沒有動它——改它要重跑那一頁的驗收，不歸這裡。
 */
export const TAB_BAR_CLEARANCE = 120;
