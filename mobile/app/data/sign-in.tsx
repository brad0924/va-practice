/**
 * 登入雲端備份的子畫面。畫面本體在 `../../ui/cloud-account-screen.tsx`。
 *
 * **兩個入口都走這一頁**：未登入時的「登入」，以及「這台停了」那一格的「改用別的暱稱」。
 * 兩者要做的事一模一樣——打一組暱稱密碼送出去。後者的差別只在 `signIn()` 會把 Keychain
 * 那一筆蓋成新的，而那是 `core/lib/cloud-backup.ts` 自己的行為，不是這一頁的分支。
 */
import { useRouter } from 'expo-router';
import { useApp } from '../../lib/app-context';
import { CloudSignInScreen } from '../../ui/cloud-account-screen';

export default function CloudSignInRoute() {
  const { session, cloud, cloudConsent } = useApp();
  const router = useRouter();

  return (
    <CloudSignInScreen
      session={session}
      cloud={cloud}
      cloudConsent={cloudConsent}
      // 登入成功就回資料頁。那一頁會依 `cloud.nickname()` 重畫成「已登入」的樣子。
      onDone={() => router.back()}
    />
  );
}
