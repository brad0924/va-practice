/**
 * 換密碼的子畫面。畫面本體在 `../../ui/cloud-account-screen.tsx`。
 *
 * 這一層只做接線。**沒有 `onDone`**：換成功之後留在原地，就地清空欄位並留一句成功訊息——
 * 畫面上其他東西都沒變，直接彈回去的話使用者看不到「換掉了」這件事（與網頁版一致）。
 * 要離開就按導覽列上系統給的返回鈕。
 */
import { useApp } from '../../lib/app-context';
import { ChangePasswordScreen } from '../../ui/cloud-account-screen';

export default function ChangePasswordRoute() {
  const { session, cloud } = useApp();
  return <ChangePasswordScreen session={session} cloud={cloud} />;
}
