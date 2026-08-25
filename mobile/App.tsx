import { randomUUID } from 'expo-crypto';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { initI18n } from '@core/i18n';
import { toMessage } from '@core/lib/app-error';
import { DEFAULT_EASE } from '@core/lib/review';
import { addBook, createStore } from '@core/lib/storage';
import type { AppData, Card } from '@core/lib/types';
import { createMmkvStorage } from './lib/storage-mmkv';

/**
 * 骨架票（`.scratch/rn-rewrite/issues/03`）與儲存票（`04`）的探針畫面，
 * 不是任何一頁正式介面。複習畫面是票 `06`，那時整支 App.tsx 會被換掉。
 *
 * 它回答三件事：EAS Build 出來的包裝得進真機嗎、`GlassView` 在這台機器上真的長出玻璃嗎、
 * `createStore()` 吃得下 MMKV 嗎——最後一項要靠人按按鈕、關掉 app、重開來驗，
 * 自動測試碰不到「關掉再開」那一段。
 */

/**
 * 這台裝置那一格儲存，開一次就好。
 *
 * 三行的順序不能換：`storage.ts` 與 `app-error.ts` 都會查介面字串表，接上之前叫到就丟例外。
 *
 * **語言在這裡寫死成繁體中文**，不去問裝置設定。探針畫面自己那幾行字本來就是寫死的中文，
 * 查表只在資料壞掉要顯示錯誤時才用得到——為了那一句話多帶一個原生模組進包裡不划算。
 * 「跟著裝置語言走」是複習畫面那張票（`06`）的事，網頁版對應的那行在 `src/app.ts`。
 */
const storage = createMmkvStorage();
initI18n(storage, 'zh-TW');
const store = createStore(storage);

/**
 * `GlassView` 只在 iOS 26 以上存在，而且某些 iOS 26 beta 版本沒有這個 API，直接畫下去會閃退。
 * 套件因此另外提供 `isGlassEffectAPIAvailable()`，要在畫之前先問一次。
 *
 * 兩個檢查問的不是同一件事，所以兩個都顯示：
 * - `isGlassEffectAPIAvailable()`：這台機器上叫得動這個 API 嗎（閃退防線）
 * - `isLiquidGlassAvailable()`：這支 app 現在正以 Liquid Glass 的樣子在跑嗎
 *
 * 兩個都在模組層算一次就好。套件那邊各自把答案記在模組變數裡，一支 app 從開到關不會變，
 * 放進 render 只是每次重畫多問一次同樣的問題。
 */
const canRenderGlass = isGlassEffectAPIAvailable();
const usingLiquidGlass = isLiquidGlassAvailable();

/**
 * 玻璃的重點是折射，不是模糊。細條紋加上強對比，玻璃有沒有把線折彎才看得出來——
 * 底下若是一片素色，毛玻璃與 Liquid Glass 長得一模一樣，這張票就白驗了。
 *
 * 顏色取自網頁版 `src/styles.css` 的評分色，沒有別的意思，只是要一組彼此對比夠強的顏色。
 */
const STRIPE_COLORS = ['#6ea8ff', '#d9534f', '#d9843f', '#46a758', '#d9c14f', '#9a7fe0'];

/** 條紋斜著鋪，數量與間距只求蓋滿整面螢幕（轉過角度之後要留出頭尾），沒有其他考量。 */
const STRIPE_COUNT = 40;
const STRIPE_STEP = 44;
const STRIPE_TOP = -420;

/** 按一次加幾張卡。「存一批」而不是「存一張」——一張看不出整份資料有沒有完整寫回去。 */
const BATCH_SIZE = 5;

/**
 * 加一本，往裡面塞一批卡。
 *
 * `addBook()` 是刻意走的：它內部呼叫 `crypto.randomUUID()`，而那是 React Native 沒有、
 * 靠 `lib/install-random-uuid.ts` 補上去的。補丁沒生效的話這一按就當場丟例外——
 * 自動測試看不到這件事，因為 Node 自己有那個函式。
 */
function addBatch(data: AppData): AppData {
  const next = addBook(data, `探針 ${data.books.length + 1}`);
  const book = next.books[next.books.length - 1];
  // 編號接著現有張數往下數，按第二次不會撞到第一次那五張——詞條全域唯一，
  // 連探針資料也照這條規矩，否則存進去的是一份這支 app 自己不接受的資料。
  const cards: Card[] = Array.from({ length: BATCH_SIZE }, (_, index) => {
    const number = data.cards.length + index + 1;
    return {
      id: randomUUID(),
      bookId: book.id,
      text: `探[たん]針[しん]${number}`,
      meaning: `第 ${number} 張`,
      interval: null,
      ease: DEFAULT_EASE,
      due: null,
    };
  });
  return { ...next, cards: [...next.cards, ...cards] };
}

/**
 * 開機讀一次。這就是驗收要的東西：上次關掉 app 之前存的卡，現在還在不在。
 *
 * 讀不出來時交回一句話而不是讓它往上丟。`store.load()` 在資料壞掉時會丟出帶 key 的錯
 * （`ADR-0013`），沒接住的話畫面直接掛掉，人看到的是一片空白——**正好在最需要它說話的
 * 那一刻失聲**。這裡不捏一份假的空資料頂上去，資料就是讀不出來，畫面照實說。
 */
function open(): { data: AppData | null; failure: string | null } {
  try {
    return { data: store.load(), failure: null };
  } catch (error) {
    return { data: null, failure: toMessage(error) };
  }
}

export default function App() {
  const [opened] = useState(open);
  const [data, setData] = useState<AppData | null>(opened.data);
  const [failure, setFailure] = useState<string | null>(opened.failure);

  function press(): void {
    if (data === null) return;
    try {
      const next = addBatch(data);
      store.save(next);
      setData(next);
      setFailure(null);
    } catch (error) {
      // 帶 key 的錯要查表才變成字（`ADR-0013`），畫面層一律走 toMessage()。
      setFailure(toMessage(error));
    }
  }

  const status = [
    canRenderGlass ? 'GlassView API 可用' : 'GlassView API 不可用（已退回一般區塊）',
    usingLiquidGlass ? 'Liquid Glass 開著' : 'Liquid Glass 沒開',
    `iOS ${Platform.Version}`,
  ].join(' · ');

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: STRIPE_COUNT }, (_, index) => (
          <View
            key={index}
            style={[
              styles.stripe,
              {
                top: STRIPE_TOP + index * STRIPE_STEP,
                backgroundColor: STRIPE_COLORS[index % STRIPE_COLORS.length],
              },
            ]}
          />
        ))}
        <View style={[styles.blob, styles.blobTop]} />
        <View style={[styles.blob, styles.blobBottom]} />
      </View>

      <View style={styles.center}>
        {canRenderGlass ? (
          <GlassView style={styles.card} glassEffectStyle="regular" />
        ) : (
          <View style={[styles.card, styles.fallbackCard]} />
        )}

        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <View style={styles.statusPill}>
          <Text style={styles.statusText}>
            {data === null
              ? 'MMKV：讀不出來'
              : `MMKV：${data.books.length} 本 · ${data.cards.length} 張卡`}
          </Text>
          {data !== null && (
            <Pressable style={styles.button} onPress={press}>
              <Text style={styles.buttonText}>{`加 ${BATCH_SIZE} 張卡`}</Text>
            </Pressable>
          )}
          {failure !== null && <Text style={styles.failureText}>{failure}</Text>}
        </View>
      </View>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // 網頁版 src/styles.css 的 --bg。條紋蓋不到的縫隙填這個色。
    backgroundColor: '#141821',
  },
  stripe: {
    position: 'absolute',
    left: -400,
    width: 1400,
    height: 18,
    transform: [{ rotate: '-24deg' }],
  },
  blob: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  blobTop: {
    top: 90,
    left: -60,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  blobBottom: {
    bottom: 120,
    right: -70,
    backgroundColor: 'rgba(8, 11, 36, 0.75)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingHorizontal: 24,
  },
  card: {
    width: '86%',
    height: 200,
    borderRadius: 40,
  },
  /** iOS 26 以下走到這裡。畫一塊看得出邊界的半透明區塊，才知道退回這條路真的有走到。 */
  fallbackCard: {
    backgroundColor: 'rgba(30, 36, 48, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(238, 242, 248, 0.35)',
  },
  statusPill: {
    backgroundColor: 'rgba(20, 24, 33, 0.86)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    color: '#eef2f8',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#6ea8ff',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: {
    color: '#141821',
    fontSize: 15,
    fontWeight: '600',
  },
  /** 網頁版 src/styles.css 的 --danger。這一行出現就代表儲存那條路有東西壞了。 */
  failureText: {
    color: '#e0574f',
    fontSize: 13,
    textAlign: 'center',
  },
});
