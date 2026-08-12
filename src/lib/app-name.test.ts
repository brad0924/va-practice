import { describe, it, expect } from 'vitest';
import { APP_NAME } from './app-name';
import plist from '../../ios/App/App/Info.plist?raw';
import privacy from '../../public/privacy.html?raw';

/**
 * `Info.plist` 與 `privacy.html` 都在打包流程外，拿不到常數，只能寫字面值（見 ADR-0012）。
 * 這支測試是那條路唯一的安全網：改名時漏改哪一個檔，這裡就紅燈。
 *
 * 因此失敗訊息必須指得出「哪個檔的哪一處」——紅燈了還要自己去翻檔案找，這道守門就白做了。
 */

/**
 * 抓不到比對不了，所以抓不到本身就是失敗，而且要跟「值不對」分開講：
 * 前者代表那個檔的格式被改過（換行、改字），後者才是漏改名字。
 */
function pick(source: string, file: string, where: string, pattern: RegExp): string {
  const found = source.match(pattern);
  if (found === null) {
    throw new Error(`${file} 的${where}找不到名字，該處格式可能改過了，請一併更新這支測試的比對規則：${pattern}`);
  }
  return found[1];
}

/**
 * 上面那幾處是逐一釘死的「已知位置」，抓不到檔案裡新長出來的第五處名字。
 * 因此另外釘住出現次數：多寫一次名字就紅燈，逼人當下決定那處要不要也進比對清單。
 */
function countOf(source: string, name: string): number {
  return source.split(name).length - 1;
}

describe('Info.plist 的顯示名稱與常數一致', () => {
  it('CFBundleDisplayName（iPhone 主畫面圖示底下那行字）', () => {
    const file = 'ios/App/App/Info.plist';
    const where = 'CFBundleDisplayName';
    const actual = pick(plist, file, where, /<key>CFBundleDisplayName<\/key>\s*<string>(.*?)<\/string>/);
    expect(actual, `${file} 的 ${where} 與 APP_NAME.short 不一致`).toBe(APP_NAME.short);
  });

  it('短名只出現在 CFBundleDisplayName 這一處', () => {
    const file = 'ios/App/App/Info.plist';
    const count = countOf(plist, APP_NAME.short);
    expect(
      count,
      `${file} 裡的短名出現 ${count} 次，這支測試只釘了 CFBundleDisplayName 一處。` +
        `多出來的那處改名時會被漏掉，請把它也加進比對規則並更新這個數字`,
    ).toBe(1);
  });
});

describe('privacy.html 的顯示名稱與常數一致', () => {
  const file = 'public/privacy.html';

  const spots: { where: string; pattern: RegExp }[] = [
    { where: '<title> 分頁標題', pattern: /<title>隱私權政策 — (.*?)<\/title>/ },
    { where: '頁首的 .updated 那行', pattern: /<p class="updated">(.*?) · 最後更新/ },
    { where: '內文首句「（以下稱「本 app」）」前面那段', pattern: /^\s*(.*?)（以下稱「本 app」）/m },
    { where: '頁尾的返回連結', pattern: /← 回到 (.*?)<\/a>/ },
  ];

  for (const { where, pattern } of spots) {
    it(where, () => {
      const actual = pick(privacy, file, where, pattern);
      expect(actual, `${file} 的${where}與 APP_NAME.full 不一致`).toBe(APP_NAME.full);
    });
  }

  it(`全名只出現在上面那 ${spots.length} 處`, () => {
    const count = countOf(privacy, APP_NAME.full);
    expect(
      count,
      `${file} 裡的全名出現 ${count} 次，這支測試只釘了 ${spots.length} 處。` +
        `多出來的那處改名時會被漏掉，請把它也加進上面的 spots 清單`,
    ).toBe(spots.length);
  });
});
