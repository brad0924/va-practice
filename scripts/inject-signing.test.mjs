import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectSigning } from './inject-signing.mjs';

/**
 * 這支測試守的是「只有 CI 跑得到、壞了要等一輪 TestFlight 才知道」的那幾件事。
 *
 * 最要緊的是第一條：腳本靠專案檔裡那行 `CODE_SIGN_STYLE = Manual` 定位，
 * 而那一行寫在 `project.pbxproj` 裡。兩邊是耦合的，但沒有任何工具看得出來——
 * 有人在 Xcode 裡改一下簽章方式、或重新產生原生專案，這行就沒了或變成兩行，
 * 而 `npm test`、`tsc` 全都不會有反應。錯誤要到 CI 的 archive 那一步才炸。
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj');

const ARGS = { profileName: 'va-practice App Store', teamId: 'ABCDE12345' };

describe('把簽章設定掛到 App target', () => {
  it('真的那份專案檔剛好有一處錨點，掛得上去', () => {
    const source = readFileSync(PROJECT, 'utf8');

    const output = injectSigning(source, ARGS);

    expect(output).toContain('PROVISIONING_PROFILE_SPECIFIER = "va-practice App Store";');
    expect(output).toContain('DEVELOPMENT_TEAM = "ABCDE12345";');
  });

  it('掛進去的位置是 App target 的 Release 區塊，不是別人的', () => {
    const output = injectSigning(readFileSync(PROJECT, 'utf8'), ARGS);

    // 從 App target 的 Release 區塊起頭，切到該區塊的結尾為止
    const block = output
      .slice(output.indexOf('504EC3181FED79650016851F /* Release */'))
      .split('name = Release;')[0];

    expect(block).toContain('PROVISIONING_PROFILE_SPECIFIER');
    expect(block).toContain('DEVELOPMENT_TEAM');
  });

  it('行尾原樣保留，不會把整份 CRLF 換成 LF', () => {
    const crlf = '\t\t\t\tCODE_SIGN_STYLE = Manual;\r\n\t\t\t\tINFOPLIST_FILE = App/Info.plist;\r\n';

    const output = injectSigning(crlf, ARGS);

    expect(output).not.toMatch(/[^\r]\n/);
    expect(output.split('\r\n')).toHaveLength(5);
  });

  it('錨點一個都沒有就停下來，不要猜一個位置寫下去', () => {
    expect(() => injectSigning('\t\t\t\tCODE_SIGN_STYLE = Automatic;\n', ARGS)).toThrow('實際 0 處');
  });

  it('錨點不只一處也停下來——分不出哪一個才是 App target', () => {
    const two = '\t\t\t\tCODE_SIGN_STYLE = Manual;\n'.repeat(2);

    expect(() => injectSigning(two, ARGS)).toThrow('實際 2 處');
  });
});
