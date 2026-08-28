/**
 * `import-scan.ts` 的單元測試（票 `12`）。
 *
 * **fixture 裡的套件名一律用 `mobile/package.json` 真的有的那些。**
 * 理由是這支檔自己也會被 `dependency-guard.test.ts` 掃到——那支掃的是原始碼文字，
 * 分不出「這行 import 是真的」還是「這行 import 只是我寫在字串裡的假資料」。
 * 想驗「查不到的套件會被抓出來」時，改的是傳進去的 `declared`，不是 fixture 的名字。
 */
import { describe, it, expect } from '@jest/globals';
import {
  stripComments,
  collectModuleSources,
  packageNameOf,
  findMissingDependencies,
  type SourceFile,
} from './import-scan';

describe('剝註解', () => {
  it('`//` 之後到行尾整段不算', () => {
    expect(collectModuleSources("// import { it } from 'react';\n")).toEqual([]);
  });

  it('`/* */` 包起來的整段不算', () => {
    expect(collectModuleSources("/**\n * import { it } from 'react';\n */\n")).toEqual([]);
  });

  it('字串裡的 `//` 不是註解，同一行後面的 import 照樣抓得到', () => {
    const code = "const url = 'https://example.com';\nimport { a } from 'react';";
    expect(collectModuleSources(code)).toEqual(['react']);
  });

  it('字串裡的 `/*` 不會把後面的程式碼整段吃掉', () => {
    const code = "const glob = '/*.ts';\nimport { a } from 'react';";
    expect(collectModuleSources(code)).toEqual(['react']);
  });

  it('剝掉的區塊不會把左右兩個字黏成一個', () => {
    expect(stripComments("import/* x */'react';")).not.toContain("import'react'");
  });
});

describe('抓 import 來源', () => {
  it('抓得到 `from` 的來源', () => {
    expect(collectModuleSources("import { a } from 'react';")).toEqual(['react']);
  });

  it('`import type` 也算', () => {
    expect(collectModuleSources("import type { A } from 'react';")).toEqual(['react']);
  });

  it('`export … from` 也算', () => {
    expect(collectModuleSources("export { a } from 'react';")).toEqual(['react']);
  });

  it('沒有具名匯入的副作用 import 也算', () => {
    expect(collectModuleSources("import 'react';")).toEqual(['react']);
  });

  it('`require()` 也算——設定檔只有這種寫法', () => {
    expect(collectModuleSources("const p = require('react');")).toEqual(['react']);
  });

  it('動態 `import()` 也算', () => {
    expect(collectModuleSources("const m = await import('react');")).toEqual(['react']);
  });

  it('跨好幾行的具名匯入照樣抓得到', () => {
    const code = "import {\n  a,\n  b,\n} from 'react';";
    expect(collectModuleSources(code)).toEqual(['react']);
  });

  it('同一支檔的多個來源都收進來，重複的不去掉', () => {
    const code = "import 'react';\nimport { b } from 'expo-router';\nimport { c } from 'react';";
    expect(collectModuleSources(code)).toEqual(['react', 'expo-router', 'react']);
  });
});

describe('換算套件名', () => {
  it('相對路徑不是套件', () => {
    expect(packageNameOf('./term-layout')).toBeNull();
    expect(packageNameOf('../test/vitest-shim')).toBeNull();
  });

  it('`@core/*` 是別名不是套件', () => {
    expect(packageNameOf('@core/lib/storage')).toBeNull();
  });

  it('`node:*` 是內建模組', () => {
    expect(packageNameOf('node:path')).toBeNull();
  });

  it('沒有子路徑時就是套件名本身', () => {
    expect(packageNameOf('react')).toBe('react');
  });

  it('子路徑取第一段', () => {
    expect(packageNameOf('react-native-screens/experimental')).toBe('react-native-screens');
  });

  it('scoped 套件取前兩段', () => {
    expect(packageNameOf('@testing-library/react-native')).toBe('@testing-library/react-native');
  });

  it('scoped 套件的子路徑也只取前兩段', () => {
    expect(packageNameOf('@babel/runtime/helpers/interopRequireDefault')).toBe('@babel/runtime');
  });
});

describe('比對 package.json', () => {
  const files: SourceFile[] = [
    { file: 'lib/a.ts', code: "import { a } from 'react';" },
    { file: 'lib/b.ts', code: "import { b } from 'expo-router';" },
  ];

  it('每一個都列在 package.json 裡就沒事', () => {
    expect(findMissingDependencies(files, new Set(['react', 'expo-router']))).toEqual([]);
  });

  it('查不到的那個會被抓出來，帶著是哪支檔、哪個套件', () => {
    expect(findMissingDependencies(files, new Set(['react']))).toEqual([
      { file: 'lib/b.ts', source: 'expo-router', packageName: 'expo-router' },
    ]);
  });

  it('子路徑報的是原始寫法，查的是套件名', () => {
    const withSubpath: SourceFile[] = [
      { file: 'ui/c.tsx', code: "import { c } from 'react-native-screens/experimental';" },
    ];
    expect(findMissingDependencies(withSubpath, new Set())).toEqual([
      {
        file: 'ui/c.tsx',
        source: 'react-native-screens/experimental',
        packageName: 'react-native-screens',
      },
    ]);
  });

  it('同一個套件在同一支檔漏兩次只報一次', () => {
    const twice: SourceFile[] = [{ file: 'lib/d.ts', code: "import 'react';\nimport { d } from 'react';" }];
    expect(findMissingDependencies(twice, new Set())).toHaveLength(1);
  });

  it('相對路徑、別名、內建模組都不會被當成查不到的套件', () => {
    const skipped: SourceFile[] = [
      {
        file: 'lib/e.ts',
        code: "import './f';\nimport '@core/lib/storage';\nimport 'node:path';",
      },
    ];
    expect(findMissingDependencies(skipped, new Set())).toEqual([]);
  });
});
