/**
 * 把 `vitest` 這個名字接到 Jest 身上。
 *
 * `core/` 那批測試（票 `02` 搬過去的 21 支）開頭寫的是 `import { … } from 'vitest'`，
 * 而 React Native 這一側跑的是 Jest。**測試檔一行都不改**是票 `02` 立下的規矩，
 * 所以改的是「vitest 這個名字指到哪裡」——`jest.config.js` 的 `moduleNameMapper`
 * 把它指到本檔，本檔再把 Jest 的同名工具原封轉出去。
 *
 * 只轉 `core/` 真的用到的五樣：`describe`、`it`、`expect`、`vi`、`beforeEach`。
 * 缺哪一樣，缺的當下 Jest 會直接說 `xxx is not a function`，不會默默跑過去。
 *
 * `mobile/` 自己新寫的測試不走這裡，直接寫 `from '@jest/globals'`——這個包袱只屬於
 * 搬過來的那批。
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

export { describe, expect, it, beforeEach };

/** vitest 的 `vi` 與 Jest 的 `jest` 是同一種東西：假計時器、假函式、假模組。 */
export const vi = jest;
