# 領域文件

這些工程 skill 在探索程式碼時，應如何取用本 repo 的領域文件。

## 開始探索前先讀這些

- 根目錄的 **`CONTEXT.md`**，或
- 根目錄的 **`CONTEXT-MAP.md`**（若存在）——它會指向每個 context 各自的 `CONTEXT.md`。與主題相關的都要讀。
- **`docs/adr/`**——讀取與你即將動工的區域相關的 ADR。在多 context 的 repo 中，也要檢查 `src/<context>/docs/adr/` 裡的 context 專屬決策。

若上述檔案不存在，**安靜地繼續**。不要特別指出它們缺席，也不要建議預先建立。`/domain-modeling` skill（經由 `/grill-with-docs` 與 `/improve-codebase-architecture` 進入）會在詞彙或決策真正被釐清時才順勢建立。

## 檔案結構

單一 context 的 repo（多數 repo 屬此）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多 context 的 repo（根目錄存在 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系統層級的決策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context 專屬的決策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用詞彙表的語言

當你的產出提到某個領域概念時（issue 標題、重構提案、假說、測試名稱），使用 `CONTEXT.md` 所定義的詞。不要飄移到詞彙表明列要避免的同義詞。

若你需要的概念還不在詞彙表裡，那是個訊號——要嘛你正在發明專案並不使用的語言（請重新考慮），要嘛真的存在缺口（記下來交給 `/domain-modeling`）。

## 指出與 ADR 的衝突

若你的產出與既有 ADR 相牴觸，請明確點出來，不要默默覆蓋：

> _與 ADR-0007（event-sourced orders）相牴觸——但值得重新討論，因為……_
