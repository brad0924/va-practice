// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { APP_NAME } from './app-name';
import expoConfig from '../../mobile/app.json?raw';
import privacyZhHant from '../../public/privacy.html?raw';
import privacyEn from '../../public/privacy-en.html?raw';

/**
 * Expo 的 `app.json` 與各語言版的隱私權政策都在打包流程外，拿不到常數，
 * 只能寫字面值（見 ADR-0012）。
 * 這支測試是那條路唯一的安全網：改名時漏改哪一個檔，這裡就紅燈。
 *
 * 因此失敗訊息必須指得出「哪個檔的哪一處」——紅燈了還要自己去翻檔案找，這道守門就白做了。
 */

/**
 * 釘住的都是「已知位置」，抓不到檔案裡新長出來的下一處名字。
 * 因此另外釘住出現次數：多寫一次名字就紅燈，逼人當下決定那處要不要也進守門範圍。
 */
function countOf(source: string, name: string): number {
  return source.split(name).length - 1;
}

/**
 * iOS 版的名字寫在 `mobile/app.json` 的 `expo.name`，Expo 出包時把它寫進自己產的
 * 那份 `Info.plist` 的 `CFBundleDisplayName`，最後落在 iPhone 主畫面上。
 * 那份 `Info.plist` 每次 `expo prebuild` 重新產生、不進版控，所以守的是 `app.json` 這一頭。
 *
 * 它是 JSON，解開直接取鍵就好，不必猜哪一個 `"name"` 才是它。
 */
describe('mobile/app.json 的顯示名稱與常數一致', () => {
  it('expo.name（iPhone 主畫面圖示底下那行字）', () => {
    const actual = JSON.parse(expoConfig).expo.name;
    expect(actual, 'mobile/app.json 的 expo.name 與 APP_NAME.short 不一致').toBe(APP_NAME.short);
  });

  it('短名只出現在 expo.name 這一處', () => {
    const count = countOf(expoConfig, APP_NAME.short);
    expect(
      count,
      `mobile/app.json 裡的短名出現 ${count} 次，這支測試只釘了 expo.name 一處。` +
        `多出來的那處改名時會被漏掉，請把它也加進比對規則並更新這個數字`,
    ).toBe(1);
  });
});

/**
 * 隱私權政策每多一種語言，寫著全名的那幾處上下文就整批換一種文字（`隱私權政策 —` 變成
 * `Privacy Policy —`、`最後更新` 變成 `Last updated`），抓中文上下文的 regex 一條都活不下來。
 *
 * 因此那幾處在 HTML 裡標成 `data-app-name`，這裡只掃屬性：語言無關，一支測試管得到所有翻譯版，
 * 順帶不再因為那附近改個換行、改個標點就假紅燈。`app.json` 那半段是 JSON，沒有這個問題，維持原樣。
 */
const MARKER = 'data-app-name';

const privacyPages = [
  { file: 'public/privacy.html', source: privacyZhHant },
  { file: 'public/privacy-en.html', source: privacyEn },
];

/**
 * 屬性本身不帶名字，失敗訊息的座標只好自己算：原始檔裡第 n 個 `data-app-name` 就是 DOM 裡第 n 個
 * 元素，兩邊順序一致，逐行數出行號就配得起來。給的是「檔名:行號」，紅燈時直接點得進去。
 *
 * 兩邊數量對不上就當場丟例外，跟 `pick()` 同一個道理：那代表有人把 `data-app-name` 寫進了註解
 * 或樣式，配對整個錯開，行號會開始指向不相干的地方——那比沒有行號更糟。
 */
function markedSpots(source: string, file: string): { at: string; text: string }[] {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const elements = [...doc.querySelectorAll(`[${MARKER}]`)];
  const lines = source
    .split('\n')
    .flatMap((text, index) => Array<number>(text.split(MARKER).length - 1).fill(index + 1));

  if (elements.length !== lines.length) {
    throw new Error(
      `${file} 裡的 ${MARKER} 有 ${lines.length} 個，卻只解析出 ${elements.length} 個元素，` +
        `失敗訊息的行號會指錯地方。請確認是不是有 ${MARKER} 寫在註解或樣式裡`,
    );
  }

  return elements.map((element, index) => ({
    at: `${file}:${lines[index]}`,
    text: element.textContent ?? '',
  }));
}

describe.each(privacyPages)('$file 的顯示名稱與常數一致', ({ file, source }) => {
  const spots = markedSpots(source, file);

  for (const { at, text } of spots) {
    it(at, () => {
      expect(text, `${at} 標了 ${MARKER}，但那段文字與 APP_NAME.full 不一致`).toContain(APP_NAME.full);
    });
  }

  it(`全名只出現在標了 ${MARKER} 的那 ${spots.length} 處`, () => {
    expect(spots.length, `${file} 裡一個 ${MARKER} 都沒有，那幾處標記可能被刪掉了`).toBeGreaterThan(0);

    const count = countOf(source, APP_NAME.full);
    expect(
      count,
      `${file} 裡的全名出現 ${count} 次，標了 ${MARKER} 的有 ${spots.length} 處，兩邊要一樣多。` +
        `多出來的那次沒有任何守門管得到，改名時會被漏掉，請一併標上；` +
        `少了則是某一處的名字被改成了別的字，上面那幾條會指出是哪一處`,
    ).toBe(spots.length);
  });
});
