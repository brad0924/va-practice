const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro（簡單說就是把程式碼即時送進手機的那台小伺服器）預設只看得到 `mobile/` 底下的檔，
 * 而共用邏輯住在 repo 根的 `core/`（票 `02`）。這一份設定就是把那個目錄接進來。
 *
 * `core/` 換位置時要一起改的地方列在 repo 根 `tsconfig.json` 的 `paths` 上方。
 */
const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, '..', 'core');

const config = getDefaultConfig(projectRoot);

// 不加這一行，改 `core/` 底下的檔手機上不會刷新——Metro 根本沒在看那個目錄。
config.watchFolders = [coreRoot];

/**
 * `@core/lib/storage` 換算成 `core/lib/storage` 的絕對路徑。
 *
 * 不用 `resolver.extraNodeModules`：那張表是照套件名查的，而 `@` 開頭在 npm 的規矩裡
 * 是 scope，`@core/lib` 整段會被當成套件名，`@core` 這一格永遠對不上。
 */
const previousResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = previousResolveRequest ?? context.resolveRequest;
  if (moduleName.startsWith('@core/')) {
    return resolve(context, path.join(coreRoot, moduleName.slice('@core/'.length)), platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
