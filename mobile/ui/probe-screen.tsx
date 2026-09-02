import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import { toMessage } from '@core/lib/app-error';
import type { Store } from '@core/lib/storage';
import type { CloudBackup } from '@core/lib/cloud-backup';
import type { CloudConsent } from '@core/lib/cloud-consent';
import type { AppData } from '@core/lib/types';

/**
 * 票 `03`（骨架）、`04`（儲存）與 `05`（加解密）的探針畫面。**它不是任何一頁正式介面。**
 *
 * 它現在回答三件事：EAS Build 出來的包裝得進真機嗎、`GlassView` 在這台機器上真的長出玻璃嗎、
 * **手機上加出來的備份電腦解不解得開**。最後一項要靠人輸入暱稱密碼真的推拉一次，
 * 自動測試碰不到那條路。
 *
 * > 票 `17` 在雲端那一區多加了一顆「停止同步」。它驗的是**密碼搬進 Keychain 之後
 * > 那顆鈕仍然清得掉那一筆**——那是隱私權政策對使用者的承諾。
 * > 資料頁那顆正式的鈕屬於票 `18`，這一顆與這整支檔一起被取代。
 *
 * > 本來還有第四件：`createStore()` 吃不吃得下 MMKV。票 `15` 拆掉那一塊之後改由卡片列表驗——
 * > 建一本、加幾張卡、關掉 app 再開，走的是使用者真的會走的那一條（見底下那段墓誌銘）。
 *
 * > 這裡本來還有一行「標答比對：⋯」。票 `13` 把那項比對整個搬出使用者的啟動路徑，
 * > 只剩 CI 塞了觸發檔時才跑，FAIL 的唯一去處是 CI 紅燈，畫面上因此沒有東西可顯示。
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

/* 這裡以前還有一整塊 MMKV 的儀表：一行「MMKV：N 本 · M 張卡」加一顆「加 5 張卡」，
   那顆鈕會 `addBook()` 建一本並塞五張進去。票 `15` 把它整塊拆了（2026-08-31 拍板，
   圖版四·乙）——單字本現在建得出來了，卡片列表那一頁就是正式的入口，探針上再留一個
   會建資料的後門，只是多一條會把使用者資料弄髒的路。

   它守過的東西沒有跟著消失：票 `04` 那條「關掉 app 再開，資料還在」現在用卡片列表
   建一本、加幾張卡就驗得到，而且驗的是使用者真的會走的那一條。

   `crypto.randomUUID()` 的補丁也還有人守。那顆鈕當初刻意走 `addBook()` 就是為了讓補丁
   沒生效時當場丟例外；現在 `addBook()` 由卡片列表的「＋ 新增單字本」呼叫，同一條路，
   同一個當場。 */

export interface ProbeScreenProps {
  store: Store;
  /** 雲端備份。與複習畫面共用同一個——兩套實作在寫同一批資料是這條路上最不能踩的線。 */
  cloud: CloudBackup;
  /**
   * 這台裝置要不要接雲端。這裡只用它記下「親手登入成功也算同意」那一句
   * （見底下的 `signIn()`）；開機那一問住在 `../lib/app-context.tsx`。
   */
  cloudConsent: CloudConsent;
  cloudStatus: string;
  /** 換掉那一行狀態字。與 `cloud` 那一端寫的是同一行。 */
  onStatus(message: string): void;
  /** 這支畫面改過本機資料了，外面要重讀。 */
  onDataChanged(): void;
  /**
   * 逐段跑一次讀音預填，每一段各自回報發生了什麼（票 `16`）。
   *
   * 由外面遞進來而不是這裡自己 import，理由與 `cloud` 同一條：那支底下是原生模組。
   * 一句話說明它為什麼存在——**上線那條路故意把三種失敗都收斂成靜默**，於是
   * 「壞了」跟「它根本沒試」在畫面上長得一模一樣，維護者自己也分不出來。
   */
  probeReading(term: string): Promise<string[]>;
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

/**
 * 試問的那個詞。**寫死一個含漢字的短詞**：這支探針要驗的是接得通不通，不是模型答得對不對，
 * 讓人自己打字只會多一種「打錯字所以沒反應」的可能。挑 `焦がす` 是因為 repo 各處的例子
 * 都用它（翻譯檔的提示文字也是），一眼認得出。
 */
const PROBE_TERM = '焦がす';

export function ProbeScreen({
  store,
  cloud,
  cloudConsent,
  cloudStatus,
  onStatus,
  onDataChanged,
  probeReading,
}: ProbeScreenProps) {
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
   * **停住不只是顯示不準，是會掉資料**：這一頁按下「登入」時會把手上那份推上雲端，
   * 而那份若是切走之前的舊快照，中間在別頁做的事就整批被蓋掉。
   * （票 `15` 之前這裡舉的例子是「加 5 張卡」那顆鈕，那顆已經拆了，坑還在。）
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

  /** 上一次試問讀音的逐段結果。空陣列代表還沒按過。 */
  const [readingLines, setReadingLines] = useState<string[]>([]);
  const [readingBusy, setReadingBusy] = useState(false);

  /**
   * 試問一次讀音，把每一段的結果攤在畫面上。
   *
   * **這一支自己不判斷成敗**，`probeReading()` 回什麼就印什麼——判斷是人的事，
   * 而人要看的正是那幾句原文（哪一段斷的、Google 回的狀態碼是幾號）。
   *
   * 外面那層 `catch` 是防呆：`probeReading()` 自己已經把三段各自包起來了，
   * 走到這裡代表它自己爆了，那句話一樣要出得來——不然按下去畫面一動也不動，
   * 又回到「分不出壞了還是沒試」那個坑。
   */
  async function tryReading(): Promise<void> {
    setReadingBusy(true);
    setReadingLines([]);
    try {
      setReadingLines(await probeReading(PROBE_TERM));
    } catch (error) {
      setReadingLines([`探針自己爆了：${toMessage(error)}`]);
    } finally {
      setReadingBusy(false);
    }
  }

  /**
   * 登入一次。**同一顆按鈕走得到兩個方向**——`signIn()` 先看雲端那份新不新：
   * 雲端新就拉下來（電腦存、手機拉），本機新就推上去（手機存、電腦拉）。
   * 兩個方向都要驗的話，就是在網頁版與手機上輪流動一動、輪流按它。
   *
   * **登入成功就算同意**（票 `17`，接法與網頁版 `src/ui/data-view.ts` 相同）：
   * 使用者剛剛才在這台打完密碼，下次開 app 再問一次是在羞辱他。少了這一句，
   * 「開機那一問按了取消、之後又自己登入」的裝置會卡在拒絕那格，從此不接。
   */
  async function signIn(): Promise<void> {
    if (data === null) return;
    setCloudBusy(true);
    onStatus('派生金鑰中⋯（PBKDF2 刻意跑得慢，要等一下）');
    try {
      await cloud.signIn(nickname, password, data);
      cloudConsent.grant();
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

  /**
   * 停止同步（票 `17`）。走的是**與網頁版同一支** `signOut()`——密碼搬進 Keychain 之後
   * 它清掉的是 Keychain 那一筆，而那一筆標記為可同步，`SecItemDelete` 會把刪除帶到
   * 使用者所有的裝置。**那正是隱私權政策寫的行為**（`public/privacy.html`：
   * 「按下『停止同步』才會⋯⋯若你開啟了 iCloud 鑰匙圈，那一份也會同時從鑰匙圈移除」）。
   *
   * 這裡不問「你確定嗎」。正式的確認文字屬於資料頁那張票（票 `18`），
   * 而探針上按錯的代價是重打一次暱稱密碼。
   */
  function stopSync(): void {
    cloud.signOut();
    // 密碼沒了，`nickname()` 就答不出來——這一行是這顆鈕的驗收：它必須變成「（沒有）」。
    onStatus(`已停止同步。記著的暱稱：${cloud.nickname() ?? '（沒有）'}`);
  }

  /**
   * 雲端那塊只要求兩件事：不能同時在忙，而且本機這份讀得出來。
   *
   * 票 `13` 之前還有第三個條件「標答比對跑完了沒」——那項比對會把**全域**亂數來源
   * 換成一個公開在版控裡的固定初始向量，那幾秒內推備份上去的話，那一份的保護就垮了。
   * 比對搬出使用者的啟動路徑之後沒有人再鎖亂數來源，那個條件跟著沒了。
   */
  const cloudReady = !cloudBusy && data !== null;

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

          {/* 本機資料讀不出來時仍然要出聲。這一行不是儀表，是**壞掉時唯一會說話的地方**——
              `store.load()` 丟例外的話底下雲端那一區整個不能用，沒有這一行的話畫面只會
              安靜地少一塊。平常它不出現。 */}
          {failure !== null && (
            <View style={styles.statusPill}>
              <Text style={styles.failureText}>{failure}</Text>
            </View>
          )}

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
            <Pressable
              style={[styles.button, cloudBusy ? styles.buttonOff : null]}
              disabled={cloudBusy}
              onPress={stopSync}
            >
              <Text style={styles.buttonText}>停止同步</Text>
            </Pressable>
            {cloudStatus !== '' && <Text style={styles.statusText}>{cloudStatus}</Text>}
          </View>

          {/* 讀音預填的探針（票 `16`）。**它問的是真的那條線**，不是另接一份——
              另接一份的話這裡綠了也不代表編輯畫面會動。 */}
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{`讀音預填：試問「${PROBE_TERM}」`}</Text>
            <Pressable
              style={[styles.button, readingBusy ? styles.buttonOff : null]}
              disabled={readingBusy}
              onPress={() => void tryReading()}
            >
              <Text style={styles.buttonText}>{readingBusy ? '問進行中⋯' : '試問一次讀音'}</Text>
            </Pressable>
            {readingLines.map((line) => (
              // 每一段一行。內容是逐段的原文（含 Google 回的狀態碼），不做任何歸納。
              <Text key={line} style={styles.statusText}>
                {line}
              </Text>
            ))}
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
