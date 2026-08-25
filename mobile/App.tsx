import { StatusBar } from 'expo-status-bar';
import { getLocales } from 'expo-localization';
import { useEffect, useReducer, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initI18n } from '@core/i18n';
import { createStore } from '@core/lib/storage';
import type { AppData } from '@core/lib/types';
import { ProbeScreen } from './app/probe-screen';
import { ReviewScreen } from './app/review-screen';
import { createCloudProbe } from './lib/cloud-probe';
import { reportCryptoSelfCheck, type SelfCheckReport } from './lib/crypto-self-check';
import { createReviewSession, type ReviewSession } from './lib/review-session';
import { createMmkvStorage } from './lib/storage-mmkv';

/**
 * 這支 app 的根。首頁是複習畫面（票 `06`），標題列上那顆「探針」通往票 `03`–`05` 的
 * 探針畫面——那是暫時的後門，資料頁做好之後連同 `app/probe-screen.tsx` 一起刪掉。
 */

/**
 * 這台裝置那一格儲存，開一次就好。
 *
 * 三行的順序不能換：`storage.ts` 與 `app-error.ts` 都會查介面字串表，接上之前叫到就丟例外。
 *
 * **語言跟著裝置走**，與網頁版 `src/app.ts` 遞 `navigator.language` 是同一件事
 * （`ADR-0013`）。票 `03`–`05` 的探針畫面在這裡寫死繁體中文，因為那幾張票只要顯示錯誤，
 * 為那一句話多帶一個原生模組進包裡不划算；正式畫面每一個字都要查表，所以現在接上。
 * `getLocales()` 是同步的，畫面出來之前就答得出來。
 */
const storage = createMmkvStorage();
initI18n(storage, getLocales()[0]?.languageTag ?? 'en');
const store = createStore(storage);

/**
 * 雲端備份與複習流程接起來。
 *
 * 兩個方向都要接，因此在同一個閉包裡建：雲端拉下一份新資料時複習佇列要重建
 * （`onData` → `session.reload()`），而每一次評分存完之後要推上去
 * （`onPersisted` → `cloud.push()`）。
 *
 * **推送這一步不是票 `06` 表上列的東西，但少了它會掉資料。** 雲端備份是整份覆蓋、
 * 較新的一份勝出（見 `CONTEXT.md`）；手機上評的分若不讓 `updatedAt` 往前走，
 * 電腦那邊一推，手機這幾天的複習就整批被蓋掉。網頁版 `src/app.ts` 的 `persist()`
 * 把推送接在同一個位置。
 */
function createWiring(onChange: () => void, onStatus: (message: string) => void) {
  /**
   * 標答比對還在跑的時候不准推。**兩件事都會去抽 12 個位元組當初始向量**，而比對期間
   * 亂數來源被換成表裡那個公開在版控裡的固定值——同一把金鑰配同一個初始向量，
   * AES-GCM 的保護就整個垮了。理由的正本在 `app/probe-screen.tsx` 的 `cloudReady`。
   *
   * 擋掉的那幾次不會遺失：`push()` 送的是整份資料，比對跑完補推一次就全帶到了。
   */
  const gate = { open: false, missed: false };

  let session: ReviewSession;
  const cloud = createCloudProbe({
    storage,
    store,
    // 兩條刻意分開：拉下來是「整份資料被換掉了」，要重讀；推上去只是伺服器蓋了新的
    // 時間戳，資料一個字沒變，動不得——理由見 `lib/review-session.ts` 的 `noteCloudTimestamp`。
    onPulled: () => session.reload(),
    onPushed: (updatedAt) => session.noteCloudTimestamp(updatedAt),
    onStatus,
  });

  function push(data: AppData): void {
    if (!gate.open) {
      gate.missed = true;
      return;
    }
    cloud.push(data);
  }

  session = createReviewSession({
    store,
    now: () => new Date(),
    random: Math.random,
    onChange,
    onPersisted: push,
  });

  /** 標答比對跑完了，閘門打開；期間擋掉過的話補推一次。 */
  function openGate(): void {
    gate.open = true;
    if (!gate.missed) return;
    gate.missed = false;
    cloud.push(store.load());
  }

  return { cloud, session, openGate };
}

export default function App() {
  // 這支 app 的畫面本來就是整片重畫的，狀態機自己記著資料，React 這一側只要知道
  // 「有東西變了」。與網頁版不引入 signal／store／observer 是同一個理由（票 `02`）。
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const [showProbe, setShowProbe] = useState(false);
  const [vectors, setVectors] = useState<SelfCheckReport | null>(null);
  const [cloudStatus, setCloudStatus] = useState('');
  const [wiring] = useState(() => createWiring(redraw, setCloudStatus));

  /**
   * 標答比對排在畫面畫完之後才跑。它會佔住 JavaScript 那條執行緒好幾秒——
   * 最後那一筆明文有 4 MB，PBKDF2 又刻意跑得慢——放進第一次畫面就是開 app 先黑幾秒。
   *
   * 只跑一次。空的相依陣列是刻意的：這張表不會因為畫面重畫而改變答案。
   * CI 也靠它——那支流程只是把 app 開起來，然後等結論寫成檔案
   * （`.github/workflows/mobile-crypto.yml`），所以它必須在首頁就跑，不能等人點進探針。
   */
  useEffect(() => {
    let alive = true;
    void reportCryptoSelfCheck().then((report) => {
      if (!alive) return;
      setVectors(report);
      wiring.openGate();
    });
    return () => {
      alive = false;
    };
  }, [wiring]);

  /**
   * 回到前景時檢查一次有沒有跨過午夜。網頁版靠 `visibilitychange` 加一個原生事件兩條訊號，
   * React Native 上 `AppState` 就是那件事。檢查本身是冪等的，多叫幾次不會出事。
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') wiring.session.refreshDay();
    });
    return () => subscription.remove();
  }, [wiring]);

  return (
    <SafeAreaProvider>
      {showProbe ? (
        <ProbeScreen
          store={store}
          cloud={wiring.cloud}
          vectors={vectors}
          cloudStatus={cloudStatus}
          onStatus={setCloudStatus}
          onDataChanged={() => wiring.session.reload()}
          onClose={() => setShowProbe(false)}
        />
      ) : (
        <ReviewScreen session={wiring.session} onOpenProbe={() => setShowProbe(true)} />
      )}
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
