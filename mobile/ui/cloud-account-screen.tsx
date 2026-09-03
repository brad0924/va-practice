/**
 * 雲端備份的兩頁表單：**登入**與**換密碼**（票 `18`）。
 *
 * 對照的是網頁版 `src/ui/data-view.ts` 的 `cloudSection()` 與 `changePasswordForm()`。
 * 網頁版把兩者塞在同一頁的同一區裡；手機上資料頁是分組清單，一列裝不下一組欄位，
 * 因此各推出一頁。
 *
 * ## 為什麼兩頁住在同一支檔
 *
 * 它們是同一種東西：一段說明、一到兩格輸入框、一行錯誤字、一顆送出鈕。版面樣式整份共用，
 * 拆成兩支檔要把底下那張 `styles` 抄兩份。這個 repo 已經有同樣的先例
 * （`./book-scope-sheet.tsx` 裡住著好幾個元件）。
 *
 * ## `data.cloudHint` 放在登入頁裡，不是塞在清單底下的小字
 *
 * 那一段講的是「密碼同時是加密金鑰，遺失即無法復原」（`ADR-0003`），
 * **是這一頁最不能被漏看的一句話**。放在資料頁群組底下的小字裡，它會與另外幾段小字疊成
 * 一堵牆；放在這裡，使用者在打密碼之前一定會經過它。
 */
import { Stack } from 'expo-router';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { t } from '@core/i18n';
import { toMessage } from '@core/lib/app-error';
import type { CloudBackup } from '@core/lib/cloud-backup';
import type { CloudConsent } from '@core/lib/cloud-consent';
import type { ReviewSession } from '../lib/review-session';
import { color, fontSize, SCREEN_INSET, TAB_BAR_CLEARANCE, TAP_SIZE, weight } from './theme';

export interface CloudSignInScreenProps {
  session: ReviewSession;
  cloud: CloudBackup;
  /** 親手在這台打完密碼就是同意了，登入成功時 `grant()` 一次。 */
  cloudConsent: CloudConsent;
  /** 登入成功，回上一頁。 */
  onDone(): void;
}

/**
 * 登入。**`signIn()` 不比新舊**（`ADR-0020`）：那個暱稱在雲端已經有備份就一律拉下來，
 * 只有雲端還空著時才把這台這份存上去。內容會被蓋掉時它會先問一句，問的方式在
 * `../lib/cloud-prompts-native.ts`。
 *
 * **「改用別的暱稱」進來的也是這一頁。** 打一組新的送出去，`signIn()` 會把 Keychain
 * 那一筆蓋掉——因此資料頁上不必、也刻意沒有一個「忘掉舊的那一組」的動作。
 *
 * **登入成功就算同意**（票 `17`，接法與網頁版相同）：使用者剛剛才在這台打完密碼，
 * 下次開 app 再問一次是在羞辱他。少了這一句，「開機那一問按了取消、之後又自己登入」的
 * 裝置會卡在拒絕那格，從此不接。
 */
export function CloudSignInScreen({ session, cloud, cloudConsent, onDone }: CloudSignInScreenProps) {
  /**
   * 兩格輸入框都「不受控」：字由 ref 自己記著，程式不回頭寫它。
   *
   * 與編輯畫面同一條規矩（理由的正本在 `./card-editor-screen.tsx` 的檔頭）——受控的話
   * 每打一個字就重畫一次那一格，而 iOS 的輸入法正在組字時被重畫會吃掉字。
   * 這兩格雖然只收英數，規矩仍然一致：畫面層不必去猜使用者的鍵盤長什麼樣。
   */
  const nickname = useRef('');
  const password = useRef('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setError('');
    setBusy(true);
    try {
      const signedIn = await cloud.signIn(nickname.current, password.current, session.snapshot().data);
      // 使用者在警示窗按了取消：沒有登入，本機與雲端都一個字沒動（`ADR-0020`）。
      // 那不是錯誤，因此不寫錯誤字、也不算同意；停在這一頁讓他重按或改暱稱。
      if (!signedIn) return;
      cloudConsent.grant();
      // 拉下來那一條，`onPulled` 那一側已經重讀過一次；這一行是「雲端還空著、把這台
      // 這份存上去」那條路上的補償——`signIn()` 會蓋一個新的時間戳。多讀一次是安全的。
      session.reload();
      onDone();
    } catch (reason) {
      // 帶 key 的錯要查表才變成字（`ADR-0013`），畫面層一律走 toMessage()。
      setError(toMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen title={t('data.signIn')}>
      {/* 這一段是這一頁的重點，擺在欄位之前——打密碼之前一定會經過它（`ADR-0003`）。 */}
      <Text style={styles.hint}>{t('data.cloudHint')}</Text>

      <Field
        label={t('data.nickname')}
        onChangeText={(value) => {
          nickname.current = value;
        }}
        textContentType="username"
      />
      <Field
        label={t('data.password')}
        onChangeText={(value) => {
          password.current = value;
        }}
        secureTextEntry
        textContentType="password"
      />

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <SubmitButton
        label={busy ? t('data.connecting') : t('data.signIn')}
        busy={busy}
        onPress={() => void submit()}
      />
    </FormScreen>
  );
}

export interface ChangePasswordScreenProps {
  session: ReviewSession;
  cloud: CloudBackup;
}

/**
 * 換密碼。
 *
 * **成功後不返回上一頁**，就地清空欄位並留一句成功訊息——與網頁版同一個處理。
 * 畫面上其他東西都沒變，直接彈回去的話使用者看不到「換掉了」這件事。
 *
 * 後果是機制決定的，不是可以藏起來的細節（`data.changeHint`，spec 決定九）：密碼同時是
 * 雲端的指紋與金鑰，換掉之後其他還記著舊密碼的裝置既推不上去也解不開，得各自重打一次。
 */
export function ChangePasswordScreen({ session, cloud }: ChangePasswordScreenProps) {
  const password = useRef('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * 換掉之後那一格要清空，而清空**不能靠換 `key` 重生**——重生會失焦。
   * 這裡走 `TextInput` 的 `clear()`，不換節點。做法與編輯畫面的 `reset()` 一致。
   */
  const input = useRef<TextInput | null>(null);

  const submit = async (): Promise<void> => {
    setError('');
    setDone('');
    setBusy(true);
    try {
      await cloud.changePassword(password.current, session.snapshot().data);
      password.current = '';
      input.current?.clear();
      setDone(t('data.passwordUpdated'));
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen title={t('data.changePasswordTitle')}>
      <Field
        label={t('data.newPassword')}
        inputRef={input}
        onChangeText={(value) => {
          password.current = value;
        }}
        secureTextEntry
        textContentType="newPassword"
      />
      <Text style={styles.hint}>{t('data.changeHint')}</Text>

      {error !== '' && <Text style={styles.error}>{error}</Text>}
      {done !== '' && <Text style={styles.status}>{done}</Text>}

      <SubmitButton
        label={busy ? t('data.connecting') : t('data.updatePassword')}
        busy={busy}
        onPress={() => void submit()}
      />
    </FormScreen>
  );
}

/**
 * 兩頁共用的外框：導覽列那一列加一個會讓開鍵盤的捲動區。
 *
 * **返回鈕交給系統**（HIG `N-10`）——這兩頁是「往下一層看東西」，不是編輯畫面那種
 * 蓋上來的表單，因此不像那一頁把左上角換成「取消」。
 */
function FormScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.root}>
      {/* 標題都是兩三個字，遠低於 15 字元的上限，也不是 app 名稱（HIG `N-12`）。 */}
      <Stack.Screen options={{ title, headerTitleAlign: 'center' }} />
      <ScrollView
        contentContainerStyle={styles.form}
        // 導覽列是玻璃的，內容從它底下穿過去，讓系統自己算要讓開多少（HIG `L-02`）。
        contentInsetAdjustmentBehavior="automatic"
        // 鍵盤開著時送出鈕第一下就按得到。預設值 `'never'` 會把第一下拿去收鍵盤，
        // 使用者得按第二次（理由的正本在 `./card-editor-screen.tsx`）。
        keyboardShouldPersistTaps="handled"
        // 鍵盤升起來時捲動區自己讓開，正在打的那一格不會被蓋住。
        automaticallyAdjustKeyboardInsets
      >
        {children}
      </ScrollView>
    </View>
  );
}

interface FieldProps {
  label: string;
  onChangeText(value: string): void;
  secureTextEntry?: boolean;
  /**
   * 給 iOS 的密碼自動填入用。`username` 配 `password` 是「登入這一組」，`newPassword`
   * 讓系統知道該提議一組新的而不是回填舊的。這一格與「密碼存在 Keychain」是兩件事：
   * 那一筆是 app 自己寫進去的（見 `../lib/keychain-native.ts`），這裡只是鍵盤上方那條建議。
   */
  textContentType?: 'username' | 'password' | 'newPassword';
  inputRef?: RefObject<TextInput | null>;
}

/** 一格：上面一行標籤，下面那個輸入框。與編輯畫面的 `Labelled` 同一個長相。 */
function Field({ label, onChangeText, secureTextEntry, textContentType, inputRef }: FieldProps) {
  return (
    <View style={styles.labelled}>
      <Text style={styles.labelText}>{label}</Text>
      <TextInput
        ref={inputRef}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        textContentType={textContentType}
        // 暱稱與密碼都是使用者自取的字串，自動大寫與拼字修正只會幫倒忙。
        autoCapitalize="none"
        autoCorrect={false}
        // 尾端那顆清除鈕（HIG `F-09`）：整串重打時不必按著刪除鍵不放。
        clearButtonMode="while-editing"
        // 這一格沒有標籤在旁邊被系統認得，少了它 VoiceOver 只會唸「文字欄位」。
        accessibilityLabel={label}
        style={[styles.field, styles.fieldText]}
      />
    </View>
  );
}

/**
 * 送出鈕。**這一頁上唯一的主要動作**（HIG `B-04`：一頁最多一到兩顆）。
 *
 * 顏色上在文字不上在背景（`M-10`），與編輯畫面那幾顆、複習畫面的「顯示答案」同一個處理。
 * 它是內容層的按鈕，底色走標準材質那一組，不套玻璃（`M-01`、`M-02`）。
 */
function SubmitButton({ label, busy, onPress }: { label: string; busy: boolean; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      // 送出期間按不得。少了它，連點兩下會送出兩次——而派生金鑰刻意跑得慢，
      // 那個空檔長到人真的會再按一次。
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      style={styles.buttonSlot}
    >
      {({ pressed }) => (
        <View style={[styles.button, pressed && styles.pressed]}>
          {/* 按不得的時候要看得出來，不然人會以為 app 當掉了。 */}
          <Text style={[styles.buttonLabel, busy && styles.buttonLabelOff]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** 背景延伸到螢幕實體邊緣，四邊不留白條（HIG `L-01`）。 */
  root: {
    flex: 1,
    backgroundColor: color.background,
  },
  form: {
    gap: 20,
    paddingHorizontal: SCREEN_INSET,
    paddingTop: 12,
    // 底部留白：tab bar 浮在內容之上，捲到底時送出鈕要能露出來（HIG `L-02`）。
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  labelled: {
    gap: 8,
  },
  labelText: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
    fontWeight: weight.semibold,
  },
  /** 一格輸入框。底色走標準材質那一組（`M-02`）。`minHeight` 是 44（`B-01`、`B-02`）。 */
  field: {
    minHeight: TAP_SIZE,
    backgroundColor: color.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  fieldText: {
    color: color.label,
    fontSize: fontSize.body,
  },
  /** 常駐的說明。灰的，因為它一直在那裡，不是剛剛發生的事。 */
  hint: {
    color: color.secondaryLabel,
    fontSize: fontSize.footnote,
  },
  error: {
    color: color.danger,
    fontSize: fontSize.footnote,
  },
  /**
   * 「密碼已更新」那一行。**與 `hint` 刻意不同色**：它是剛剛才發生的事，
   * 而旁邊就有一段長得很像的常駐說明（`data.changeHint`）。兩行同色的話，
   * 使用者按下更新之後只會看到底下多了一段灰字，分不出哪一句是回應他那一下。
   */
  status: {
    color: color.label,
    fontSize: fontSize.footnote,
    fontWeight: weight.semibold,
  },
  buttonSlot: {
    alignSelf: 'stretch',
  },
  button: {
    minHeight: TAP_SIZE,
    backgroundColor: color.card,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonLabel: {
    color: color.accent,
    fontSize: fontSize.body,
    fontWeight: weight.semibold,
  },
  buttonLabelOff: {
    color: color.tertiaryLabel,
  },
  /** 按下去的樣子（HIG `B-03`）。 */
  pressed: {
    backgroundColor: color.fill,
  },
});
