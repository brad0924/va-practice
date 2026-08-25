/**
 * 複習範圍的開關。收合時是標題列上的一顆膠囊，點開是一張系統的 page sheet。
 *
 * 對照的是網頁版 `src/ui/book-filter.ts` 的 `pill` 版。**行為照抄，做法不抄**：
 * 那邊是自己畫的下拉選單，加上「點外面收起來」「Esc 收起來」「空白鍵讓路」三段接線；
 * 這裡交給系統的 sheet，那三件事系統自己會做（往下滑收起來、點外面收起來）。
 *
 * 兩條規則與網頁版一字不差：
 * - 已經全勾時「全部」那一列鎖起來——它沒有事情可做。
 * - 取消它會讓範圍空掉的那一本鎖起來，含「只剩一本單字本」那個情況。
 *   最後一道守門在 `core/lib/storage.ts` 的 `setScope()`，那裡會直接丟例外。
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { t } from '@core/i18n';
import type { Book } from '@core/lib/types';
import { GlassPill } from './glass-pill';
import { color, fontSize, SCREEN_INSET, TAP_SIZE, weight } from './theme';

export interface BookScopeSheetProps {
  books: readonly Book[];
  selected: readonly string[];
  onChange(bookIds: string[]): void;
}

/**
 * 收合後鈕上的那行字：全勾是「全部」，只勾一本是那本的名字，其餘報本數。
 * 與網頁版 `book-filter.ts` 的 `scopeLabel()` 同一套規則——那一支被列表頁與統計頁共用，
 * 住在網頁版的畫面碼裡，這裡不跨過去拿，改抄這三行。
 */
function scopeLabel(books: readonly Book[], selected: readonly string[]): string {
  if (selected.length === books.length) return t('filter.all');
  if (selected.length === 1) {
    return books.find((book) => book.id === selected[0])?.name ?? t('filter.bookCount', { count: 1 });
  }
  return t('filter.bookCount', { count: selected.length });
}

export function BookScopeSheet({ books, selected, onChange }: BookScopeSheetProps) {
  const [open, setOpen] = useState(false);
  const all = selected.length === books.length;

  /** 一律照 books 的順序存回去，勾選的先後不影響存下來的樣子。 */
  function choose(wanted: Set<string>): void {
    onChange(books.filter((book) => wanted.has(book.id)).map((book) => book.id));
  }

  return (
    <>
      {/* 鈕面上是「全部 ▾」，唸出來要是「單字本：全部」——那個箭頭是給眼睛看的，
          而光唸「全部」講不出它管的是什麼。 */}
      <GlassPill
        onPress={() => setOpen(true)}
        accessibilityLabel={t('filter.blockLabel', { scope: scopeLabel(books, selected) })}
      >
        <Text style={styles.pillText}>{`${scopeLabel(books, selected)} ▾`}</Text>
      </GlassPill>

      {/* `presentationStyle="pageSheet"` 拿的是 UIKit 自己那張卡片式的 sheet：
          頂端的把手、往下滑收起來、圓角，全部由系統畫，不是自己模仿的。 */}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('filter.blockLabel', { scope: scopeLabel(books, selected) })}</Text>
          <ScrollView contentContainerStyle={styles.list}>
            <ScopeRow
              name={t('filter.all')}
              checked={all}
              locked={all}
              onToggle={() => choose(new Set(books.map((book) => book.id)))}
            />
            {books.map((book) => {
              const checked = selected.includes(book.id);
              const wanted = new Set(selected);
              if (checked) wanted.delete(book.id);
              else wanted.add(book.id);
              return (
                <ScopeRow
                  key={book.id}
                  name={book.name}
                  checked={checked}
                  locked={checked && selected.length === 1}
                  onToggle={() => choose(wanted)}
                />
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

interface ScopeRowProps {
  name: string;
  checked: boolean;
  locked: boolean;
  onToggle(): void;
}

/** 一列一本。打勾用符號而不是只用顏色，轉成灰階仍讀得出來（HIG `T-14`）。 */
function ScopeRow({ name, checked, locked, onToggle }: ScopeRowProps) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={locked}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: locked }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={[styles.rowName, locked && styles.rowLocked]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.rowMark, locked && styles.rowLocked]}>{checked ? '✓' : ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pillText: {
    color: color.label,
    fontSize: fontSize.subheadline,
    fontWeight: weight.medium,
  },
  sheet: {
    flex: 1,
    backgroundColor: color.background,
    paddingTop: 24,
  },
  sheetTitle: {
    color: color.label,
    fontSize: fontSize.title3,
    fontWeight: weight.semibold,
    paddingHorizontal: SCREEN_INSET + 4,
    paddingBottom: 12,
  },
  list: {
    paddingHorizontal: SCREEN_INSET,
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: TAP_SIZE,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  rowPressed: {
    opacity: 0.55,
  },
  rowName: {
    flexShrink: 1,
    color: color.label,
    fontSize: fontSize.body,
  },
  rowMark: {
    color: color.accent,
    fontSize: fontSize.body,
    fontWeight: weight.semibold,
  },
  /** 點不動的那幾列要看得出來，不然人會以為 app 當掉了。 */
  rowLocked: {
    color: color.tertiaryLabel,
  },
});
