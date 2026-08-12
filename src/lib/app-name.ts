/**
 * app 顯示名稱的唯一來源。
 *
 * 短名與全名刻意不壓成一個值：PWA manifest 規範本來就要 `name`（安裝提示）與
 * `short_name`（主畫面圖示，會被截斷）兩欄，iOS 主畫面圖示底下約 11–12 個全形字就截斷。
 * 一長一短是各平台的真需求。
 *
 * 這兩個值抵達七個使用位置的方式分成兩套（打包流程內 import、流程外靠 app-name.test.ts
 * 守門），理由與被否決的做法都在 ADR-0012。改名前先讀那份文件。
 */
export const APP_NAME = {
  short: 'VocabCard',
  full: 'Vocabulary Card Practice',
} as const;
