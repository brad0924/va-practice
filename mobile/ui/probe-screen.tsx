import { randomUUID } from 'expo-crypto';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import { toMessage } from '@core/lib/app-error';
import { DEFAULT_EASE } from '@core/lib/review';
import { addBook, type Store } from '@core/lib/storage';
import type { CloudBackup } from '@core/lib/cloud-backup';
import type { AppData, Card } from '@core/lib/types';
import type { SelfCheckReport } from '../lib/crypto-self-check';

/**
 * 票 `03`（骨架）、`04`（儲存）與 `05`（加解密）的探針畫面。**它不是任何一頁正式介面。**
 *
 * 它回答四件事：EAS Build 出來的包裝得進真機嗎、`GlassView` 在這台機器上真的長出玻璃嗎、
 * `createStore()` 吃得下 MMKV 嗎、**手機上加出來的備份電腦解不解得開**——
 * 第三項要靠人按按鈕、關掉 app、重開來驗，自動測試碰不到「關掉再開」那一段。
 *
 * > **它現在是「資料」tab 的內容**（票 `09`）。原本掛在複習畫面標題列一顆寫著「探針」的
 * > 後門膠囊底下，那顆鈕已經拆掉——它做的事本來就是資料頁的事。
 * > **資料頁一做好，這整支檔案就地被取代。**
 *
 * 沒有「回上一頁」那種按鈕，因為它不是被蓋上來的一層：四個 tab 平起平坐，
 * 回複習畫面就是按導覽列上的「複習」（HIG `N-10` 那條講的是返回鈕該長什麼樣，
 * 而這一頁根本不該有返回鈕）。
 */

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
 * 靠 `lib/install-crypto.ts` 補上去的。補丁沒生效的話這一按就當場丟例外——
 * 自動測試看不到這件事，因為 Node 自己有那個函式。
 *
 * 詞條刻意標了讀音（`探[たん]針[しん]`），複習畫面上才看得到振假名。
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

export interface ProbeScreenProps {
  store: Store;
  /** 雲端備份。與複習畫面共用同一個——兩套實作在寫同一批資料是這條路上最不能踩的線。 */
  cloud: CloudBackup;
  /** 標答比對的結論。`null` 代表還在跑，那時候不准動雲端，理由見底下的 `cloudReady`。 */
  vectors: SelfCheckReport | null;
  cloudStatus: string;
  /** 換掉那一行狀態字。與 `cloud` 那一端寫的是同一行。 */
  onStatus(message: string): void;
  /** 這支畫面改過本機資料了，外面要重讀。 */
  onDataChanged(): void;
}

/**
 * 讀一次本機資料，讀不出來就交回一句話而不是讓它往上丟。
 *
 * `store.load()` 在資料壞掉時會丟出帶 key 的錯（`ADR-0013`），沒接住的話畫面直接掛掉，
 * 人看到的是一片空白——**正好在最需要它說話的那一刻失聲**。這裡不捏一份假的空資料頂上去，
 * 資料就是讀不出來，畫面照實說。
 */
function open(store: Store): { data: AppData | null; failure: string | null } {
  try {
    return { data: store.load(), failure: null };
  } catch (error) {
    return { data: null, failure: toMessage(error) };
  }
}

export function ProbeScreen({ store, cloud, vectors, cloudStatus, onStatus, onDataChanged }: ProbeScreenProps) {
  const [opened, setOpened] = useState(() => open(store));
  const { data, failure } = opened;
  const setData = (next: AppData) => setOpened({ data: next, failure: null });

  /**
   * **每次切回這個 tab 都要重讀。**
   *
   * 票 `09` 之前這一頁是被蓋上來的一層，離開就整個卸載、回來重建，那時候「開機讀一次」
   * 就等於「每次進來都讀」。改成 tab 之後四頁同時掛著，切走只是被蓋住——手上那份因此會
   * 停在上次進來的樣子。
   *
   * **停住不只是顯示不準，是會掉資料**：在「複習」評幾張再切過來按「加 5 張卡」，
   * `store.save()` 存下去的是那份舊快照，中間評的分整批被蓋掉。
   *
   * 用 `useFocusEffect` 而不是重建整個元件（換 `key`）：重建會把填到一半的暱稱與密碼
   * 一起清掉，而票 `09` 的驗收明講「切走再切回來，探針填到一半的欄位還在」。
   */
  useFocusEffect(
    useCallback(() => {
      setOpened(open(store));
    }, [store]),
  );

  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);

  /**
   * 登入一次。**同一顆按鈕走得到兩個方向**——`signIn()` 先看雲端那份新不新：
   * 雲端新就拉下來（電腦存、手機拉），本機新就推上去（手機存、電腦拉）。
   * 兩個方向都要驗的話，就是在網頁版與手機上輪流動一動、輪流按它。
   */
  async function signIn(): Promise<void> {
    if (data === null) return;
    setCloudBusy(true);
    onStatus('派生金鑰中⋯（PBKDF2 刻意跑得慢，要等一下）');
    try {
      await cloud.signIn(nickname, password, data);
      setData(store.load());
      onDataChanged();
    } catch (error) {
      // 不吞掉：`signIn()` 之外，`store.load()` 也在這個 try 裡，那一支的錯不會經過
      // cloud 那一端的 onStatus。少了這一行，資料壞掉時畫面一句話都不說。
      // 帶 key 的錯要查表才變成字（`ADR-0013`），畫面層一律走 toMessage()。
      onStatus(toMessage(error));
    } finally {
      setCloudBusy(false);
    }
  }

  function press(): void {
    if (data === null) return;
    try {
      const next = addBatch(data);
      store.save(next);
      setData(next);
      onDataChanged();
    } catch (error) {
      // 帶 key 的錯要查表才變成字（`ADR-0013`），畫面層一律走 toMessage()。
      setOpened({ data, failure: toMessage(error) });
    }
  }

  /**
   * 雲端那塊要等標答比對跑完才准動，而且不能同時在忙。
   *
   * **兩件事都會去抽 12 個位元組當初始向量。** 標答比對期間亂數來源被換成表裡那個固定值，
   * 這時真的推一份備份上去的話，那份會用上一個**公開在版控裡**的初始向量——
   * 同一把金鑰配同一個初始向量，AES-GCM 的保護就整個垮了。長度一樣，擋不掉，
   * 只能不讓它們重疊。複習畫面那一端的推送走同一道閘門，見 `../lib/app-context.tsx`。
   */
  const cloudReady = vectors !== null && !cloudBusy && data !== null;

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

      {/**
       * **這層 `ScrollViewMarker` 是 iOS 26 的 tab bar 會不會捲動縮小的唯一開關。**
       * 它不畫任何東西，存在的目的只有一個：告訴原生那一端「這一頁要盯的捲動區是哪一個」。
       *
       * 少了它，`UITabBarController` 手上沒有捲動區可盯，`app/_layout.tsx` 那行
       * `minimizeBehavior="onScrollDown"` 就永遠不會發生任何事——2026-08-27 真機測
       * 票 `09` 那條驗收就是掛在這裡，而症狀長得極像「iOS 版本不夠」。
       *
       * 接線在 `RNSScrollViewMarkerComponentView.mm`：它從自己**唯一的那個孩子**解析出
       * 捲動區，再往上找到這一頁的 tab screen，呼叫 `setContentScrollView:forEdge:`。
       * **那支 `setContentScrollView:` 全套件只有這一條路會叫**——沒有 marker 就沒有人叫。
       *
       * 兩條規矩不能破：**只能有一個孩子**（原生那邊有 assert），而且那個孩子要解析得出
       * 捲動區。它擺哪一層不重要，因為它是往上找而不是往下找——裝飾層排在前面也沒關係。
       *
       * 它來自 `react-native-screens/experimental`，那個入口的檔頭寫明「隨時可能改，
       * 不跟大版號」。原生那一半包在 `#if RNS_GAMMA_ENABLED` 裡，而 Expo SDK 57 預設把它
       * 開著（`-DRNS_GAMMA_ENABLED=1` 在 build log 的 RNScreens 編譯參數裡），因此不必
       * 為了它重新出包。哪天升 SDK 之後這條驗收又不過，先回來確認那個旗標還在不在。
       */}
      <ScrollViewMarker>
        <ScrollView contentContainerStyle={styles.center}>
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

          <View style={styles.statusPill}>
            {vectors === null ? (
              <Text style={styles.statusText}>標答比對：執行中⋯</Text>
            ) : (
              <Text style={vectors.passed ? styles.statusText : styles.failureText}>
                {`標答比對：${vectors.summary}`}
              </Text>
            )}
          </View>

          <View style={styles.statusPill}>
            <Text style={styles.statusText}>
              {cloud.nickname() === null ? '雲端備份：沒登入' : `雲端備份：${cloud.nickname()}`}
            </Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="暱稱"
              placeholderTextColor="#8b93a3"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="密碼"
              placeholderTextColor="#8b93a3"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Pressable
              style={[styles.button, cloudReady ? null : styles.buttonOff]}
              disabled={!cloudReady}
              onPress={() => void signIn()}
            >
              <Text style={styles.buttonText}>{cloudBusy ? '進行中⋯' : '登入並跑一次雲端備份'}</Text>
            </Pressable>
            {!cloudReady && vectors === null && (
              <Text style={styles.statusText}>等標答比對跑完才能按（見程式碼註解）</Text>
            )}
            {cloudStatus !== '' && <Text style={styles.statusText}>{cloudStatus}</Text>}
          </View>
        </ScrollView>
      </ScrollViewMarker>
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
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 24,
    paddingVertical: 72,
  },
  card: {
    width: '86%',
    height: 160,
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
  /** 按不得的時候要看得出來，不然人會以為 app 當掉了。 */
  buttonOff: {
    backgroundColor: '#4a5364',
  },
  buttonText: {
    color: '#141821',
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    minWidth: 220,
    backgroundColor: 'rgba(238, 242, 248, 0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(238, 242, 248, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#eef2f8',
    fontSize: 15,
  },
  /** 網頁版 src/styles.css 的 --danger。這一行出現就代表儲存那條路有東西壞了。 */
  failureText: {
    color: '#e0574f',
    fontSize: 13,
    textAlign: 'center',
  },
});
