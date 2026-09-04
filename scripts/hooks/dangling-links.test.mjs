import { describe, expect, it } from 'vitest';
import {
  MARKER,
  SCANNED_ROOTS,
  collect,
  danglingIn,
  describeHits,
  hasMarker,
  isComment,
  linksIn,
  resolveTarget,
  scans,
} from './dangling-links.mjs';

/** 目標存在與否由呼叫端遞進來，測試才不必真的在磁碟上擺檔。 */
const existing = (...paths) => {
  const set = new Set(paths);
  return (path) => set.has(path);
};

describe('scans', () => {
  it('四個範圍內的程式碼與 markdown 都掃', () => {
    for (const root of SCANNED_ROOTS) {
      expect(scans(`${root}/lib/a.ts`)).toBe(true);
    }
    expect(scans('mobile/ui/a.tsx')).toBe(true);
    expect(scans('mobile/plugins/a.js')).toBe(true);
    expect(scans('docs/adr/0017-x.md')).toBe(true);
  });

  it('.scratch/ 不掃——那裡整片都是講古', () => {
    expect(scans('.scratch/rn-rewrite/issues/23-x.md')).toBe(false);
  });

  it('範圍外的目錄不掃', () => {
    expect(scans('README.md')).toBe(false);
    expect(scans('scripts/hooks/dangling-links.mjs')).toBe(false);
    expect(scans('public/privacy.html')).toBe(false);
  });

  it('依賴套件與建置產物不掃', () => {
    expect(scans('mobile/node_modules/x/readme.md')).toBe(false);
    expect(scans('mobile/ios/App/AppDelegate.swift')).toBe(false);
  });

  it('掃不出東西的副檔名不掃', () => {
    expect(scans('mobile/assets/icon.png')).toBe(false);
    expect(scans('core/lib/a.json')).toBe(false);
  });

  it('Windows 的反斜線路徑先正規化再判斷', () => {
    expect(scans('mobile\\ui\\review-screen.tsx')).toBe(true);
  });
});

describe('isComment', () => {
  it('認得 JSDoc 的續行、行註解與區塊開頭', () => {
    expect(isComment(' * 理由見 x')).toBe(true);
    expect(isComment('  // 理由見 x')).toBe(true);
    expect(isComment('/** 理由見 x */')).toBe(true);
    expect(isComment('/* 理由見 x')).toBe(true);
  });

  it('真正的程式碼不算註解', () => {
    expect(isComment("const P = [/\\bfrom\\s*['\"]([^'\"]+)['\"]/g];")).toBe(false);
    expect(isComment('export function f() {')).toBe(false);
  });
});

describe('linksIn', () => {
  it('抓得到註解裡的指路連結', () => {
    const text = ' * 理由見 [../app/data/index.tsx](../app/data/index.tsx)。';
    expect(linksIn('mobile/ui/review-screen.tsx', text)).toEqual([
      { file: 'mobile/ui/review-screen.tsx', line: 1, target: '../app/data/index.tsx', label: '../app/data/index.tsx' },
    ]);
  });

  it('markdown 檔整份都算，不必是註解', () => {
    const text = '決策見 [spec](../../.scratch/rn-rewrite/spec.md)。';
    expect(linksIn('docs/adr/0017-x.md', text)).toHaveLength(1);
  });

  it('程式碼檔只認註解行——正規表示式長得像連結也不算', () => {
    // 這一行是 mobile/test/import-scan.ts 真有的寫法，字面上剛好符合 [..](..)。
    const text = "  /\\bfrom\\s*['\"]([^'\"]+)['\"]/g,";
    expect(linksIn('mobile/test/import-scan.ts', text)).toEqual([]);
  });

  it('反引號寫的講古一句都不碰', () => {
    const text = ' * > 這一頁在票 `18` 之前掛的是探針畫面（`ui/probe-screen.tsx`）。';
    expect(linksIn('mobile/app/data/index.tsx', text)).toEqual([]);
  });

  it('外部網址不算指路', () => {
    const text = '見 [Certificates](https://developer.apple.com/account) 與 [信](mailto:a@b.c)。';
    expect(linksIn('docs/ios-signing-renewal.md', text)).toEqual([]);
  });

  it('同一份文件裡的錨點不算指路', () => {
    const text = '[另一種情況](#另一種情況app-id-的-capability-改了)';
    expect(linksIn('docs/ios-signing-renewal.md', text)).toEqual([]);
  });

  it('路徑後面掛錨點時，檢查的是路徑那一段', () => {
    const text = '見 [設定](./install-hooks.mjs#L20)。';
    expect(linksIn('docs/a.md', text)[0].target).toBe('./install-hooks.mjs');
  });

  it('連結帶標題時，標題不算進路徑', () => {
    const text = '見 [設定](./a.ts "說明")。';
    expect(linksIn('docs/a.md', text)[0].target).toBe('./a.ts');
  });

  it('圖片也是檔案，一樣要指得到', () => {
    const text = '![畫面](./shot.png)';
    expect(linksIn('docs/a.md', text)[0].target).toBe('./shot.png');
  });

  it('行號從 1 起算，一行兩個連結就回兩筆', () => {
    const text = ['第一行沒有連結', '見 [a](./a.ts) 與 [b](./b.ts)。'].join('\n');
    const hits = linksIn('docs/a.md', text);
    expect(hits.map((hit) => [hit.line, hit.target])).toEqual([
      [2, './a.ts'],
      [2, './b.ts'],
    ]);
  });
});

describe('resolveTarget', () => {
  it('相對於這支檔自己的目錄——VS Code 與 GitHub 都是這樣算的', () => {
    expect(resolveTarget('mobile/ui/review-screen.tsx', '../app/data/index.tsx')).toBe('mobile/app/data/index.tsx');
    expect(resolveTarget('docs/adr/0017-x.md', './0015-y.md')).toBe('docs/adr/0015-y.md');
  });

  it('往上穿出 repo 根的路徑照實算，交給呼叫端判定它不存在', () => {
    expect(resolveTarget('docs/a.md', '../../outside.ts')).toBe('../outside.ts');
  });
});

describe('danglingIn', () => {
  it('指得到就沒事', () => {
    const text = ' * 理由見 [x](../app/data/index.tsx)。';
    const hits = danglingIn('mobile/ui/review-screen.tsx', text, existing('mobile/app/data/index.tsx'));
    expect(hits).toEqual([]);
  });

  it('指不到就回一筆，帶著算出來的目標', () => {
    const text = ' * 理由見 [x](../app/data.tsx)。';
    const hits = danglingIn('mobile/ui/review-screen.tsx', text, existing());
    expect(hits).toEqual([
      {
        file: 'mobile/ui/review-screen.tsx',
        line: 1,
        target: '../app/data.tsx',
        label: 'x',
        resolved: 'mobile/app/data.tsx',
      },
    ]);
  });

  it('目標是目錄也算指得到', () => {
    const text = ' * 理由見 [x](../app/data/)。';
    const hits = danglingIn('mobile/ui/review-screen.tsx', text, existing('mobile/app/data'));
    expect(hits).toEqual([]);
  });

  it('不掃的檔一律回空', () => {
    const text = '見 [x](./nope.ts)';
    expect(danglingIn('.scratch/a/issues/01.md', text, existing())).toEqual([]);
  });
});

describe('hasMarker', () => {
  it('標記後面接了理由才算', () => {
    expect(hasMarker(`修一行\n\n${MARKER} 那支檔下一張票才會建`)).toBe(true);
  });

  it('只貼標記不寫理由不算', () => {
    expect(hasMarker(`修一行\n\n${MARKER}`)).toBe(false);
  });

  it('git 自己塞的說明行不算數', () => {
    expect(hasMarker(`修一行\n# ${MARKER} 這是範例`)).toBe(false);
  });
});

describe('collect', () => {
  /** 假的檔案系統：目錄一個 Map，檔案一個 Map。 */
  const io = {
    dirs: {
      '': ['mobile', 'docs', '.scratch', 'node_modules'],
      mobile: ['ui'],
      'mobile/ui': ['a.ts'],
      docs: ['b.md'],
      '.scratch': ['c.md'],
      node_modules: ['d.md'],
    },
    files: {
      'mobile/ui/a.ts': ' * 見 [x](./missing.ts) 與 [y](./a.ts)。',
      'docs/b.md': '見 [z](../mobile/ui/a.ts)。',
      '.scratch/c.md': '見 [w](./gone.md)。',
      'node_modules/d.md': '見 [v](./gone.md)。',
    },
  };
  const fakeIo = {
    list: (dir) => io.dirs[dir] ?? [],
    isDir: (path) => path in io.dirs,
    read: (path) => io.files[path] ?? '',
    exists: (path) => path in io.files || path in io.dirs,
  };

  it('只走四個範圍，回報指不到的那些', () => {
    expect(collect(fakeIo)).toEqual([
      {
        file: 'mobile/ui/a.ts',
        line: 1,
        target: './missing.ts',
        label: 'x',
        resolved: 'mobile/ui/missing.ts',
      },
    ]);
  });
});

describe('describeHits', () => {
  it('印出座標、寫的路徑、以及算出來的目標', () => {
    const line = describeHits([
      { file: 'mobile/ui/a.tsx', line: 19, target: '../app/data.tsx', label: 'x', resolved: 'mobile/app/data.tsx' },
    ]);
    expect(line).toContain('mobile/ui/a.tsx:19');
    expect(line).toContain('../app/data.tsx');
    expect(line).toContain('mobile/app/data.tsx');
  });
});
