import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from '@jest/globals';
import { findMissingDependencies, type ImportSite, type SourceFile } from './import-scan';

/**
 * 相依守門：讓「本機綠、CI 紅」在本機就紅（票 `12`）。
 *
 * 掃 `mobile/` 底下每一支原始碼，把 import 到的外部套件逐個拿去 `mobile/package.json` 查。
 * 查不到就當場紅燈。病灶與擋不住的那一半寫在 `import-scan.ts` 的檔頭。
 *
 * **只掃 `mobile/`，不掃 `core/`。** `core/` 那批測試整批寫著 `from 'vitest'`，而 `vitest`
 * 沒有裝在 `mobile/` 裡，掃進來就是一整批誤報。
 * 實際數了幾條、另外兩個方案各自的代價，見票 `12`。
 *
 * > 這裡原本還列了第二條理由：`gemini-reading.ts` 要 `firebase/ai`，而那支不在 mobile
 * > 這條路上。**兩半都不成立了**（票 `16`）：手機版的讀音預填共用了那支檔，而它為了
 * > 這件事把那個型別 import 拿掉了，`core/` 現在一個外部套件都不 import。
 *
 * **比對的是 `package.json`，不是 `node_modules`。** 每一個被 import 的套件都要自己列出來，
 * 靠別人順便帶進來的不算數——那種相依在別人升版的當下就會無聲消失。
 */
const MOBILE_ROOT = path.resolve(__dirname, '..');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js'];

/**
 * 明明沒列在 `package.json`、卻要放行的套件。
 *
 * **現在是空的**，留著是為了將來真的需要時有地方寫。這裡刻意不去讀 `jest.config.js` 的
 * `moduleNameMapper`：那張表正好把 `^vitest$` 映射掉，讀了就等於放行 `vitest`，
 * 而「在 `mobile/` 寫 `from 'vitest'` 要當場紅」正是這支檢查存在的理由之一。
 */
const ALLOWED_WITHOUT_DECLARATION: readonly string[] = [];

/**
 * 走檔案樹收原始碼。
 *
 * 跳過兩類目錄。`node_modules` 是別人的程式碼，不歸這裡管。`.` 開頭的整類也跳——
 * 那些目錄裝的都是工具自己生出來的東西（`.expo` 是 Expo 的快取、`.claude` 是設定），
 * 沒有人手寫的原始碼，而且內容隨時會被工具重寫。**要是哪天有人在點目錄裡放了真的
 * 原始碼，這支檢查看不到它。** 今天實測收到的檔數與 `find` 的全集一致。
 */
function collectSourceFiles(dir: string, collected: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      collectSourceFiles(full, collected);
      continue;
    }
    if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) collected.push(full);
  }
  return collected;
}

/** 相對 `mobile/` 的路徑，斜線統一成 POSIX——Windows 上 `path` 給的是反斜線。 */
const relativeToMobile = (absolute: string) =>
  path.relative(MOBILE_ROOT, absolute).split(path.sep).join('/');

const sourceFiles: SourceFile[] = collectSourceFiles(MOBILE_ROOT).map((absolute) => ({
  file: relativeToMobile(absolute),
  code: fs.readFileSync(absolute, 'utf8'),
}));

const manifest = JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
  ...ALLOWED_WITHOUT_DECLARATION,
]);

/** 紅燈時 Jest 印的就是這幾句，要看得出是哪支檔、哪個套件。 */
const describeMissing = (sites: ImportSite[]) =>
  sites.map(
    ({ file, source, packageName }) =>
      `${file} import 了 '${source}'，但 mobile/package.json 沒有列 ${packageName}`,
  );

/** 全部當成沒宣告掃一次。用來驗「掃到了什麼」，而不是「缺了什麼」。 */
const scanEverything = () => findMissingDependencies(sourceFiles, new Set<string>());

describe('掃描範圍', () => {
  it('每一支 .ts／.tsx／.js 都收進來了，設定檔與測試檔也算', () => {
    const files = sourceFiles.map((entry) => entry.file);
    expect(files).toContain('metro.config.js');
    expect(files).toContain('jest.config.js');
    expect(files).toContain('babel.config.js');
    expect(files).toContain('index.ts');
    expect(files).toContain('ui/review-screen.test.tsx');
    expect(files).toContain('lib/storage-mmkv.ts');
  });

  it('只有 mobile/ 底下的檔，core/ 與 node_modules 都不在裡面', () => {
    const outsiders = sourceFiles
      .map((entry) => entry.file)
      .filter((file) => file.startsWith('..') || file.includes('node_modules'));
    expect(outsiders).toEqual([]);
  });
});

describe('相依守門', () => {
  it('每一個 import 到的外部套件都列在 mobile/package.json 裡', () => {
    expect(describeMissing(findMissingDependencies(sourceFiles, declared))).toEqual([]);
  });

  it('掃出來的外部套件不是零——這支檢查真的有在看東西', () => {
    // 撈到零表示掃描或抓取那一段壞了，而不是「大家都乖」。
    expect(new Set(scanEverything().map((site) => site.packageName)).size).toBeGreaterThan(10);
  });

  it('require() 抓得到——metro.config.js 那行拿的是 expo/metro-config', () => {
    // 這支檔一個 import 關鍵字都沒有，全靠 require()。只抓 from 的話它整支等於沒掃。
    const fromMetro = scanEverything().filter((site) => site.file === 'metro.config.js');
    expect(fromMetro.map((site) => site.source)).toContain('expo/metro-config');
  });

  it('子路徑查的是套件名——react-native-screens/experimental 查 react-native-screens', () => {
    const subpath = scanEverything().find(
      (site) => site.source === 'react-native-screens/experimental',
    );
    expect(subpath?.packageName).toBe('react-native-screens');
  });

  it('註解裡的 vitest 沒有被當成真的 import', () => {
    expect(scanEverything().filter((site) => site.packageName === 'vitest')).toEqual([]);
  });

  it('Objective-C 的 #import 沒有被當成套件', () => {
    // `plugins/with-app-check-first.js` 要往 bridging header 寫一行
    // `#import "RNFBAppCheckModule.h"`，那是原生的寫法，不是 JavaScript 的 import。
    // 少了排除的話它會被報成「少宣告了一個叫 RNFBAppCheckModule.h 的套件」（票 `16` 踩到）。
    expect(scanEverything().filter((site) => site.source.endsWith('.h'))).toEqual([]);
  });
});
