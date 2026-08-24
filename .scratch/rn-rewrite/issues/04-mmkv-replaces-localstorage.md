# 04 — MMKV 頂替 `localStorage`，同步介面原封不動

Status: ready-for-agent
Type: enhancement
Blocked by: 02, 03

決策背景見 `../spec.md` 的〈儲存〉。

## 為什麼有這張票

`localStorage` 是瀏覽器的東西，React Native 上沒有。而它是唯一真相來源（`ADR-0002`），純邏輯層有 27 處在用。

React Native 官方給的 `AsyncStorage` 是非同步的——改下去會傳染到每一個呼叫端，連同呼叫它們的地方一起改。**`react-native-mmkv` 是完全同步的**（走 JSI），所以 `StorageLike` 這個同步介面可以原封搬過去，27 處一行不改。

`ADR-0015` 當初否決 React Native，第一條理由就是「儲存是非同步的」。**這張票要證明那條理由已經不成立。** 排在畫面之前，是因為它若不成立，後面全部要重新規劃。

## 要做什麼

在 React Native 那邊做一個 `StorageLike` 的 MMKV 實作，讓 `createStore()` 吃得下去。

介面就是現有那個，不新增方法、不改簽章。

**保險副本仍然是唯讀的救援管道，不是第二個真相來源**（`ADR-0015`）。程式任何時候讀的都是主儲存，副本只有一個用途：啟動時發現主儲存空白而副本有東西，才寫回去。這個行為照搬，不要趁機改設計。

## 這張票不做的事

- **不改 `StorageLike` 介面。** 一旦發現非改不可，那不是這張票的事——停下來，那代表整個架構要重看，見 `../spec.md`。
- **不碰雲端備份與加解密。** 那是票 `05`。
- **不做資料搬遷。** Capacitor 版與 React Native 版是兩支不同的 app，各自的資料互不相通。使用者要搬資料走的是雲端備份或匯出檔那條既有的路。

## 驗收

- [ ] React Native 上有一個 MMKV 版的 `StorageLike`，`createStore()` 直接吃得下
- [ ] `StorageLike` 介面與呼叫端一行未改
- [ ] 邏輯層的儲存測試在 React Native 環境跑得過
- [ ] 真機上存一批卡、關掉 app、重開，資料還在
- [ ] 保險副本的救援行為驗過：清掉主儲存、重開，資料從副本回來
