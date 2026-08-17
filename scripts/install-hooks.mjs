#!/usr/bin/env node
/**
 * 把 `scripts/hooks/` 底下的 git hook 裝進這份 clone 的 `.git/hooks/`。
 *
 * `.git/` 不進版控，所以 hook 本體只能放在 repo 裡再複製過去。換一台電腦、或重新 clone 之後
 * 要自己跑一次 `npm run hooks`——而且沒有東西會提醒你（.scratch/i18n/issues/11 的「已知缺口三」）。
 *
 * 用法：npm run hooks
 */
import { chmodSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'hooks');
const HOOKS = ['commit-msg'];

/**
 * 認出「這個 hook 是我們裝的」。用的是 hook 本體一定會出現的那個 import 路徑，而不是另外貼一行
 * 標記——標記會跟本體漂移，import 不會（`privacy-signals.test.mjs` 釘死了兩道 hook 都要 import 它）。
 * 順帶讓複製過去的檔跟版控裡的逐字相同，比對「要不要更新」直接比內容就好。
 */
const FINGERPRINT = 'privacy-signals.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/**
 * `core.hooksPath` 一被設定，`.git/hooks/` 裡的東西 git 就完全不看了。裝進去會是「裝了但靜靜地
 * 沒作用」——那正是這幾道 hook 在對付的那種失敗，不能自己先犯一次。所以擋下來講清楚。
 */
let hooksPath;
try {
  hooksPath = git('config', '--get', 'core.hooksPath');
} catch {
  hooksPath = ''; // 沒設定時 git config 回傳非 0，那才是正常情況
}
if (hooksPath !== '') {
  console.error(
    `這份 clone 設了 core.hooksPath = ${hooksPath}，git 不會去看 .git/hooks/。\n` +
      `裝進去也不會有作用，所以這裡不動手。請把 ${HOOKS.join('、')} 自行放到那個目錄，` +
      `或先 git config --unset core.hooksPath 再跑一次。`,
  );
  process.exit(1);
}

// worktree 的 .git 是一個檔不是目錄，hooks 也不在旁邊，所以問 git 要路徑，不要自己拼。
const targetDir = git('rev-parse', '--git-path', 'hooks');

let blocked = false;
for (const hook of HOOKS) {
  const source = join(SOURCE_DIR, hook);
  const target = join(targetDir, hook);

  if (existsSync(target)) {
    const existing = readFileSync(target, 'utf8');
    if (!existing.includes(FINGERPRINT)) {
      console.error(
        `${target} 已經存在，而且不是我們產生的——沒有動它。\n` +
          `  請自己看一眼那個檔，決定要把 ${source} 的內容併進去，還是先把它移開再跑一次。`,
      );
      blocked = true;
      continue;
    }
    if (existing === readFileSync(source, 'utf8')) {
      console.log(`${hook} 已是最新`);
      continue;
    }
    copyFileSync(source, target);
    chmodSync(target, 0o755);
    console.log(`${hook} 更新了`);
    continue;
  }

  copyFileSync(source, target);
  chmodSync(target, 0o755);
  console.log(`${hook} 裝好了`);
}

process.exit(blocked ? 1 : 0);
