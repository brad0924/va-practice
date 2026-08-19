#!/usr/bin/env node
/**
 * 把 provisioning profile 的名稱掛到 Xcode 專案裡 **App 那一個 target** 上。
 *
 * 為什麼不從 `xcodebuild` 的指令參數傳：指令參數會套用到這次 build 的**每一個** target。
 * 專案裝了 Firebase 之後，SPM 會多拉進 `Firebase_*`、`GoogleUtilities_*`、`Promises_*`
 * 那一串 target，而它們不接受 provisioning profile——被硬塞就整個 archive 失敗
 * （Xcode 14 起的行為）。掛在 target 的設定只管那一個 target，那幾支就看不到了。
 *
 * **搬過來的只有 profile 名稱這一項，其餘簽章設定都要留在命令列。** 那 8 個 target 是會被
 * 蓋章的，它們完全接受「手動簽章、用這張憑證、屬於這個 team」，唯一不接受的是被塞一張
 * provisioning profile。少搬會倒、多搬也會倒，四趟 CI 一項一項試出來的：
 *
 *   - profile 也留在命令列        → 「does not support provisioning profiles」
 *   - team 也搬走                 → 「requires a development team」
 *   - CODE_SIGN_STYLE 也搬走      → 「conflicting provisioning settings」（退回自動簽章，
 *                                   然後跟被指定的發佈憑證打架）
 *
 * 為什麼名稱不寫死在 repo 裡：`.scratch/ios-app/issues/17` 刻意讓 CI 當下從
 * `.mobileprovision` 讀出它，這樣重產一張 profile、換個名字，repo 一個字都不用改
 * （`docs/ios-signing-renewal.md` 那句「名字隨你取」靠的就是這一點）。
 *
 * 掛的位置靠 App target Release 設定裡那行 `CODE_SIGN_STYLE = Manual` 定位——全檔只有那一處。
 * 數量不對就當場停下來：那代表專案檔的形狀變了，這時候硬猜一個位置寫下去，
 * 換來的是一支簽章方式不明的 build。
 *
 * 用法：node scripts/inject-signing.mjs "<profile 名稱>"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'ios/App/App.xcodeproj/project.pbxproj',
);

/** 專案檔裡設定那幾行的縮排，四個 tab。 */
const INDENT = '\t\t\t\t';

/** 認出「App target 的 Release 設定」的那一行。理由見檔頭。 */
const ANCHOR = `${INDENT}CODE_SIGN_STYLE = Manual;`;

/**
 * 回傳掛好設定的專案檔內容。不碰磁碟，因此測得動。
 *
 * 行尾原樣保留。專案檔是 CRLF，整份換成 LF 不會讓 build 失敗，但會讓 diff 從兩行變成整份，
 * 之後沒有人看得出這一步實際動了什麼。
 */
export function injectSigning(source, profileName) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const anchor = ANCHOR + newline;

  const found = source.split(anchor).length - 1;
  if (found !== 1) {
    throw new Error(`預期剛好一處 ${ANCHOR.trim()}，實際 ${found} 處`);
  }

  return source.replace(
    anchor,
    anchor + `${INDENT}PROVISIONING_PROFILE_SPECIFIER = "${profileName}";${newline}`,
  );
}

// 被 import 進測試時不要執行。
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const profileName = process.argv[2];
  if (!profileName) {
    console.error('用法：node scripts/inject-signing.mjs "<profile 名稱>"');
    process.exit(1);
  }

  writeFileSync(PROJECT, injectSigning(readFileSync(PROJECT, 'utf8'), profileName));
  console.log(`profile 已掛到 App target：${profileName}`);
}
