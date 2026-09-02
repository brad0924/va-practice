/**
 * 資料頁。改寫的第四頁正式程式碼，對照的是網頁版 `src/ui/data-view.ts`（446 行）。
 *
 * 網頁版那六區，手機上只剩三區（票 `18`）：
 *
 * | 網頁版那一區 | 手機上 |
 * | --- | --- |
 * | 單字本 | 票 `15` 提前搬去卡片列表了 |
 * | 介面語言 | 做 |
 * | 雲端備份 | 做 |
 * | Gemini 金鑰 | 本來就不長。iOS 走固定金鑰，使用者什麼都不必設定（`ADR-0016`） |
 * | 每日提醒 | 票 `19` |
 * | 手動備份 | 做 |
 *
 * ## 版面：系統風格的分組清單
 *
 * 一行一件事，要填的東西點進去填。零件在 `./settings-list.tsx`，那裡也記著 `L-07`
 * 在 React Native 上只做得到一半的原因。
 *
 * **標題「資料」置中，`headerLargeTitle: false`。** 這是既有的房規，不是這張票的新決定
 * （見 `./cards-screen.tsx` 的 `cardsHeader()`：置中是維護者明確要求的，2026-08-31，
 * 圖版五·甲）。三頁一致。
 *
 * > **附帶結果，寫下來免得日後被當成失誤**：iOS「設定」app 用的是靠左的大標題。
 * > 這一頁會像設定 app 的**內容**、但標題列不像。那是刻意的。
 *
 * ## 三層子畫面
 *
 * 語言、登入、換密碼各是一頁，用 iOS 的推入式導覽，返回鈕交給系統（HIG `N-10`）。
 * 接線在 `../app/data/`。**匯出與匯入不是子畫面**，是動作列，點下去直接發生。
 *
 * ## 這一頁上以前是什麼
 *
 * 票 `03`–`05` 的探針畫面（`ui/probe-screen.tsx`，423 行）。那支檔的檔頭自己寫著
 * 「資料頁一做好，這整支檔案就地被取代」，票 `18` 執行了那句話：畫面、
 * `lib/cloud-probe.ts`、`probeReading()` 三樣一起刪掉，**資料頁上不留任何診斷**。
 *
 * > **代價寫在這裡**：票 `16` 為了讀音預填那三條靜默的路燒掉兩趟真機，那顆「試問一次讀音」
 * > 就是為此而加的。刪掉之後，下次讀音預填靜默失敗時又會分不出「壞了」跟「它根本沒試」。
 * > 要不要留一個只有維護者看得到的出口是 spec 層的決定，不歸這一頁。
 */
import { File } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useReducer, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import { lang, t } from '@core/i18n';
import { toMessage } from '@core/lib/app-error';
import type { CloudBackup } from '@core/lib/cloud-backup';
import type { CloudConsent } from '@core/lib/cloud-consent';
import { toDateKey } from '@core/lib/review';
import type { ReviewSession } from '../lib/review-session';
import { langLabel } from './language-screen';
import { SettingsFooterText, SettingsGroup, SettingsRow, settingsListStyle } from './settings-list';
import { color, TAB_BAR_CLEARANCE } from './theme';

/**
 * 雲端那一區的三種樣子。第四種「連不上」不在這裡——見底下 `state` 那一段。
 *
 * **暱稱綁在狀態上，不是另外一格。** 有暱稱的那兩種各自帶著它，於是「這一列拿得到暱稱嗎」
 * 由型別回答：`signed-out` 那一格根本沒有 `nickname` 可讀，而另外兩種一定讀得到。
 * 拆成 `state` 加一個 `string | null` 的話，畫 `data.pullNow` 那一列時得多寫一次
 * 「它這時候一定不是 null」，而那種話寫錯了編譯器也不會攔。
 */
type CloudState =
  | { kind: 'signed-out' }
  | { kind: 'paused'; nickname: string }
  | { kind: 'active'; nickname: string };

export interface DataScreenProps {
  session: ReviewSession;
  cloud: CloudBackup;
  /** 這台裝置要不要接雲端。這一頁讀 `declined()`，並在接回來時 `grant()`。 */
  cloudConsent: CloudConsent;
  /** 雲端備份自己說的那行狀態字（推不上去、離線⋯⋯）。空字串代表沒事發生。 */
  cloudStatus: string;
  /** 現在幾點。匯出的檔名要用，與 `core/` 那一層同一個規矩：時間由外面遞進來。 */
  now(): Date;
  /**
   * 把一份檔案交給使用者（寫暫存檔 → 系統分享單）。
   *
   * 由外面遞進來而不是這裡自己 import，理由與 `ask`、觸覺同一條：
   * `../lib/share-file-native.ts` 底下是原生模組，這一頁一沾上就整支測不動。
   */
  shareFile(content: string, filename: string): Promise<void>;
  onOpenLanguage(): void;
  onOpenSignIn(): void;
  onOpenPassword(): void;
  /** 匯入成功了。目的地是卡片列表——新資料出現在眼前就是回饋，與網頁版一樣不另外報喜。 */
  onImported(): void;
}

export function DataScreen({
  session,
  cloud,
  cloudConsent,
  cloudStatus,
  now,
  shareFile,
  onOpenLanguage,
  onOpenSignIn,
  onOpenPassword,
  onImported,
}: DataScreenProps) {
  /**
   * 讓這一頁重畫一次。
   *
   * 雲端那幾個動作（停止同步、接回來）改的是 `cloud` 與 `cloudConsent` 手上的狀態，
   * 那兩台都不經過 React——與網頁版 `app.showData()` 重畫整頁是同一件事。
   */
  const [, redraw] = useReducer((count: number) => count + 1, 0);

  /** 匯出或匯入失敗那一行。成功不留話。 */
  const [failure, setFailure] = useState('');

  /**
   * 雲端那一區現在是哪一種樣子。**票 `18` 那張四種狀態的表就是這一行**：
   *
   * | 狀態 | 判斷式 |
   * | --- | --- |
   * | `signed-out` | `nickname() === null` |
   * | `paused` | 記著暱稱、但這台裝置拒絕過（開機那一問按了「取消」） |
   * | `active` | 記著暱稱，而且這台正在同步 |
   *
   * 先算成一個值再畫，不讓 `nickname !== null && !declined()` 那種判斷散在五列上——
   * 散開的話「這三列該不該長出來」得逐列重讀一次，而且哪天多一種狀態會漏掉其中一列。
   * 第四種「連不上」不在這裡：那不是這一區長什麼樣，是底下那行狀態字說什麼。
   */
  const nickname = cloud.nickname();
  const state: CloudState =
    nickname === null
      ? { kind: 'signed-out' }
      : { kind: cloudConsent.declined() ? 'paused' : 'active', nickname };

  /**
   * 雲端那一組底下的小字。**兩段都沒話講時整個不傳**（`undefined`），
   * 而不是傳一個空的 `<>`——那樣會畫出一個沒有內容的容器。
   *
   * - 停了的那一格要先講清楚「為什麼現在沒在備份」，不然底下那顆鈕看不懂。
   * - 連不上、推不上去⋯⋯照實說。那行字由 `core/lib/cloud-backup.ts` 給，它查表。
   */
  const cloudFooter =
    state.kind !== 'paused' && cloudStatus === '' ? undefined : (
      <>
        {state.kind === 'paused' && <SettingsFooterText text={t('data.declinedHint')} />}
        {cloudStatus !== '' && <SettingsFooterText text={cloudStatus} />}
      </>
    );

  /**
   * 停止同步。**清掉的是 Keychain 那一筆**，而那一筆標記為可同步，`SecItemDelete` 會把
   * 刪除帶到使用者所有的裝置。
   *
   * **那正是隱私權政策寫的行為**（`public/privacy.html`：「移除 app 不會把它清掉，
   * 按下『停止同步』才會⋯⋯若你開啟了 iCloud 鑰匙圈，那一份也會同時從鑰匙圈移除」）。
   * 2026-09-02 維護者拍板照政策走，因此走的是**與網頁版同一支** `signOut()`。
   *
   * 確認文字用手機版專屬的那一條（`data.stopConfirmNative`）：後果比網頁版大——
   * 網頁版刪的只是那台瀏覽器記著的一份，這裡會連別台裝置上的一起帶走。
   *
   * 「停止同步」那顆走 `destructive` 樣式，而且**不是預設選項**（HIG `B-06`），
   * 做法與 `./book-scope-sheet.tsx` 刪單字本、編輯畫面刪卡一致。
   */
  const confirmStop = () => {
    Alert.alert(t('data.stopSync'), t('data.stopConfirmNative'), [
      // 取消那顆借的是 `books.cancel`。**翻譯檔裡沒有 `data.cancel` 這條**，而這張票的
      // 字串預算是兩條，全花在講得出新東西的那兩句上——為一個各處都寫「取消」的詞再開一條，
      // 只是多一份要維護的翻譯。編輯畫面同樣是借的（它借 `editor.cancel`）。
      { text: t('books.cancel'), style: 'cancel' },
      {
        text: t('data.stopSync'),
        style: 'destructive',
        onPress: () => {
          cloud.signOut();
          // 密碼沒了，`nickname()` 就答不出來，這一區跟著畫回「未登入」的樣子。
          redraw();
        },
      },
    ]);
  };

  /**
   * 接回雲端備份。**一個字都不必打**——暱稱與密碼還在 Keychain 裡，只是這台答過「不接」。
   *
   * 走的是與開機那一問同意時同一支 `begin()`，行為因此一致：比新舊、該拉就拉。
   * 拉到雲端資料的話 `onPulled` 那一側會重建複習佇列（見 `../lib/app-context.tsx`）。
   */
  const resume = () => {
    cloudConsent.grant();
    cloud.begin(session.snapshot().data);
    redraw();
  };

  /**
   * 匯出：整份資料寫成 JSON，交給系統分享單。
   *
   * 檔名沿用網頁版那一個（`jlpt-cards-{date}.json`），跨版本匯入才對得上。
   * **使用者滑掉分享單是正常操作，不是失敗**，那一段不必在這裡處理——理由見
   * `../lib/share-file-native.ts`。
   */
  const exportBackup = async (): Promise<void> => {
    setFailure('');
    try {
      const json = JSON.stringify(session.snapshot().data, null, 2);
      await shareFile(json, `jlpt-cards-${toDateKey(now())}.json`);
    } catch (error) {
      // 帶 key 的錯要查表才變成字（`ADR-0013`），畫面層一律走 toMessage()。
      setFailure(t('data.exportFailed', { reason: toMessage(error) }));
    }
  };

  /**
   * 匯入：選一份備份檔，**整份覆蓋**目前的卡片與進度。
   *
   * 選檔走 `expo-file-system` 內建的那一支，與卡片列表的「匯入單字」同一支
   * （2026-08-31 拍板不另外裝 `expo-document-picker`）。
   *
   * **覆蓋前擋一次**，用 `Alert.alert()` 的破壞性樣式——`Alert` 是非同步的，
   * 因此讀檔與匯入接在按鈕的處理器裡，不像網頁版那一行 `if (!confirm(…)) return;`
   * 當場擋住。
   *
   * > **這裡的「匯入備份」與卡片列表上的「匯入單字」是兩件事**（`CONTEXT.md` 分得很清楚）：
   * > 前者整份覆蓋，後者只往一本裡加東西。兩顆鈕因此不共用同一條字串。
   */
  const importBackup = async (): Promise<void> => {
    setFailure('');
    let picked;
    try {
      picked = await File.pickFileAsync({ mimeTypes: 'application/json' });
    } catch (error) {
      setFailure(t('data.importFailed', { reason: toMessage(error) }));
      return;
    }
    // 使用者按了取消。那不是失敗，一個字都不必說。
    if (picked.canceled) return;
    const file = picked.result;

    Alert.alert(t('data.importButton'), t('data.importConfirm'), [
      { text: t('books.cancel'), style: 'cancel' },
      {
        text: t('data.importButton'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              session.importBackup(await file.text());
              onImported();
            } catch (error) {
              setFailure(t('data.importFailed', { reason: toMessage(error) }));
            }
          })();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={dataHeader()} />

      {/**
       * **這層 `ScrollViewMarker` 是 iOS 26 的 tab bar 會不會捲動縮小的唯一開關。**
       * 它不畫任何東西，存在的目的只有一個：告訴原生那一端「這一頁要盯的捲動區是哪一個」。
       *
       * 少了它，`UITabBarController` 手上沒有捲動區可盯，`../app/_layout.tsx` 那行
       * `minimizeBehavior="onScrollDown"` 就永遠不會發生任何事——2026-08-27 真機測票 `09`
       * 那條驗收就是掛在這裡，而症狀長得極像「iOS 版本不夠」。
       *
       * 接線在 `RNSScrollViewMarkerComponentView.mm`：它從自己**唯一的那個孩子**解析出
       * 捲動區，再往上找到這一頁的 tab screen，呼叫 `setContentScrollView:forEdge:`。
       * **那支 `setContentScrollView:` 全套件只有這一條路會叫**——沒有 marker 就沒有人叫。
       *
       * 兩條規矩不能破：**只能有一個孩子**（原生那邊有 assert），而且那個孩子要解析得出
       * 捲動區。它擺哪一層不重要，因為它是往上找而不是往下找。
       *
       * 它來自 `react-native-screens/experimental`，那個入口的檔頭寫明「隨時可能改，
       * 不跟大版號」。原生那一半包在 `#if RNS_GAMMA_ENABLED` 裡，而 Expo SDK 57 預設把它
       * 開著（`-DRNS_GAMMA_ENABLED=1` 在 build log 的 RNScreens 編譯參數裡），因此不必
       * 為了它重新出包。哪天升 SDK 之後這條驗收又不過，先回來確認那個旗標還在不在。
       *
       * > 這一段本來住在 `./probe-screen.tsx`。票 `18` 把那支檔整個刪掉，說明搬到接手的
       * > 這一頁——複習畫面與卡片列表那兩處都指著這裡。
       */}
      <ScrollViewMarker>
        <ScrollView
          contentContainerStyle={styles.list}
          // 導覽列是玻璃的（見 `../app/data/_layout.tsx`），內容從它底下穿過去，
          // 讓系統自己算要讓開多少（HIG `L-02`）。
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* 介面語言。**這一組沒有標頭**：只有一列，而那一列的標籤本身就說完了。 */}
          <SettingsGroup footer={<SettingsFooterText text={t('data.langHint')} />}>
            <SettingsRow
              label={t('data.langTitle')}
              value={langLabel(lang())}
              chevron
              onPress={onOpenLanguage}
            />
          </SettingsGroup>

          <SettingsGroup title={t('data.cloudTitle')} footer={cloudFooter}>
            {/* 未登入：一列就夠。群組標頭已經寫著「雲端備份」，列上不必再講一次。 */}
            {state.kind === 'signed-out' && (
              <SettingsRow label={t('data.signIn')} chevron onPress={onOpenSignIn} />
            )}

            {/* 這台停了：一條反悔的路，加一條換暱稱的路。 */}
            {state.kind === 'paused' && (
              <SettingsRow label={t('data.pullNow', { nickname: state.nickname })} onPress={resume} />
            )}
            {state.kind === 'paused' && (
              <SettingsRow label={t('data.switchNickname')} chevron onPress={onOpenSignIn} />
            )}

            {/* 正在同步：暱稱、換密碼、停止同步。 */}
            {state.kind === 'active' && (
              <SettingsRow label={t('data.nickname')} value={state.nickname} />
            )}
            {state.kind === 'active' && (
              <SettingsRow label={t('data.changePasswordTitle')} chevron onPress={onOpenPassword} />
            )}
            {state.kind === 'active' && (
              <SettingsRow label={t('data.stopSync')} tone="danger" onPress={confirmStop} />
            )}
          </SettingsGroup>

          <SettingsGroup
            title={t('data.fileTitle')}
            footer={
              <>
                <SettingsFooterText text={t('data.fileHint')} />
                {failure !== '' && <SettingsFooterText text={failure} tone="danger" />}
              </>
            }
          >
            <SettingsRow label={t('data.exportButton')} onPress={() => void exportBackup()} />
            <SettingsRow label={t('data.importButton')} onPress={() => void importBackup()} />
          </SettingsGroup>
        </ScrollView>
      </ScrollViewMarker>
    </View>
  );
}

/**
 * 導覽列那一列。與卡片列表、編輯畫面同一個處理：標準高度、標題置中。
 *
 * **它是一支函式，不是一個常數。** 寫成常數的話 `t('nav.data')` 會在模組載入的那一刻就算完，
 * 而那比 `initI18n()` 還早——不是拿到舊語言，是當場丟例外，整支檔載不進來。
 * 理由的正本在 `./cards-screen.tsx` 的 `cardsHeader()`。
 */
const dataHeader = () =>
  ({
    headerLargeTitle: false,
    // 「資料」兩個字，遠低於 15 字元的上限，也不是 app 名稱（HIG `N-12`）。
    title: t('nav.data'),
    headerTitleAlign: 'center',
  }) as const;

const styles = StyleSheet.create({
  /** 背景延伸到螢幕實體邊緣，四邊不留白條（HIG `L-01`）。 */
  root: {
    flex: 1,
    backgroundColor: color.background,
  },
  list: {
    ...settingsListStyle,
    // 底部留白：tab bar 浮在內容之上，捲到底時最後一組要能露出來（HIG `L-02`）。
    paddingBottom: TAB_BAR_CLEARANCE,
  },
});
