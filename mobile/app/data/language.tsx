/**
 * 介面語言的子畫面。畫面本體在 `../../ui/language-screen.tsx`。
 *
 * 這一層只做接線：把「選了一種語言」翻成共用那一份的 `setLang()`——存與重畫都在那裡，
 * 理由見 `../../lib/app-context.tsx`。
 */
import { useApp } from '../../lib/app-context';
import { LanguageScreen } from '../../ui/language-screen';

export default function LanguageRoute() {
  const { setLang } = useApp();
  return <LanguageScreen onPick={setLang} />;
}
