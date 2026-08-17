#!/usr/bin/env node
/**
 * 隱私權政策的先鋒。agent 用 Edit／Write 改完檔之後跳，內容碰到隱私相關的行為就提醒一句。
 * 掛法見 `.claude/settings.json`，決策見 .scratch/i18n/issues/11。
 *
 * **只提醒，不擋。** 它跳的時機是「剛改完那支檔」，那時候擋沒有意義——agent 還在做事，
 * 該做的是把這件事記下來稍後處理。而且擋住 Edit 會讓它卡在一個解不開的狀態：得先改政策才能改
 * 程式，但它可能還沒想清楚政策要怎麼改。真正把關的是 `commit-msg` 那道。
 *
 * 出了任何意外就安靜退場。每改一次檔就噴一次錯的 hook 沒有人會留著，而漏掉的那一次還有
 * commit-msg 接得住。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  const input = payload.tool_input ?? {};
  // Write 遞整份 content，Edit 遞換上去的那一段。兩者都是「這次寫進去的東西」。
  const written = input.content ?? input.new_string;
  if (typeof written !== 'string' || typeof input.file_path !== 'string') process.exit(0);

  // 先問 git，`payload.cwd` 只當後備。反過來的話，Claude Code 的工作目錄若不是 repo 根，
  // 底下的 relative() 會吐 `../…`，那種路徑一律當成 repo 以外——這道提醒就整個靜音，而且不出聲。
  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    root = payload.cwd;
  }
  const { hitsIn, describeHits, normalize, MARKER, PRIVACY_PAGES } = await import(
    pathToFileURL(join(root, 'scripts', 'hooks', 'privacy-signals.mjs')).href
  );

  // PostToolUse 跑在檔案已經落地之後，所以直接回頭找那段字在檔裡的位置，行號就能點得進去。
  // 找不到多半是又被別的 hook 改過了，那就退回相對行號，並在訊息裡講明白。
  const source = readFileSync(input.file_path, 'utf8');
  const at = source.indexOf(written);
  const exact = at !== -1;
  const startsAt = exact ? source.slice(0, at).split('\n').length : 1;

  // Windows 上 relative() 吐反斜線，命中清單裡的路徑卻是正斜線的。同一則訊息裡兩種寫法會很像在講兩個檔。
  const file = normalize(relative(root, input.file_path));
  const hits = hitsIn(file, written, { startsAt });
  if (hits.length === 0) process.exit(0);

  const context = [
    `剛改的 ${file} 碰到了隱私相關的行為：`,
    '',
    describeHits(hits),
    exact ? null : '（行號是那段改動裡的相對位置，不是檔案裡的行號）',
    '',
    `${PRIVACY_PAGES.join(' 與 ')} 寫的每一句都是程式的實際行為，不是宣示。`,
    '這次改動若讓其中哪一句不成立了，那兩份要一起改（它們的內容逐句對應）。',
    `確定不用改就繼續做事，commit 時在 message 裡寫一行 \`${MARKER} <一句話理由>\` 即可。`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context },
    }),
  );
} catch {
  process.exit(0);
}
