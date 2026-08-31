# iOS 26 HIG 逐項清單

這份清單是 rn-rewrite 每一頁畫面的**施工指引**。決策背景見 `spec.md` 的〈驗收決定〉，開票理由見 `issues/01-hig-liquid-glass-checklist.md`。

**它不是驗收線。** 最終判定是拿 app 跟 Apple 自家 app 並排目測，維護者說了算。這份清單回答「合不合規」，不回答「好不好看」。

## 怎麼讀這份表

每一條四個欄位：

- **編號** — 例如 `M-01`。後面的票要引用哪一條就寫編號。**編號只增不改**：作廢的條目留著、在條目欄標「（作廢）」，不要把號碼讓給新的一條。
- **條目** — 一句話，只講一件事。
- **出處** — Apple 文件的頁面與章節。頁面網址見底下〈出處對照〉。
- **怎麼驗** — 一個能回答「過／沒過」的動作。看不出過沒過的條目不收。

**這份清單會長大。** 每做一頁畫面碰到新的規定就往對應章節底下追加，不必一次想窮盡；整個章節也可以是新長出來的（〈Lists〉那一章就是票 `15` 加的）。

**抓取時間：2026-08-24。** 內容取自 developer.apple.com 當時的線上版本，涵蓋 Apple 於 2025-06-09 加入、2025-09-09 更新的 Liquid Glass 指引。Apple 會改文件，日後對不上時以線上版為準，並回來更新這份表。

**只對 iOS 負責。** iPadOS、macOS、visionOS、watchOS、tvOS 專屬的規定一律沒收進來。

---

## Materials（材質）

玻璃材質用在哪些層、不能用在哪、上面疊什麼合法。

| 編號 | 條目 | 出處 | 怎麼驗 |
| --- | --- | --- | --- |
| M-01 | Liquid Glass 只用在控制與導覽這一層，不用在內容層 | Materials §Liquid Glass | 列出該頁所有用到玻璃的元件。只要有一個是內容層的東西（卡片本體、清單列、頁面背景），就沒過 |
| M-02 | 內容層要分層時用標準材質（ultraThin／thin／regular／thick），不是玻璃 | Materials §Standard materials、§iOS, iPadOS | 內容層的半透明區塊查它接的是哪個 API。不是標準材質那一組就沒過 |
| M-03 | 內容層的暫態控制項（滑桿、開關）只在使用者操作的當下能呈現玻璃 | Materials §Liquid Glass | 靜止時就是玻璃 → 沒過；只有拖動或切換的那一瞬間是玻璃 → 過 |
| M-04 | 自訂控制項套玻璃要克制，只給該頁最重要的功能元件 | Materials §Liquid Glass（Use Liquid Glass effects sparingly） | 數該頁自訂玻璃元件的數量。說不出「為什麼這一個比其他的重要」就沒過 |
| M-05 | clear 變體只用在媒體之上，其餘一律 regular | Materials §Liquid Glass | 看該元件底下是不是照片或影片。不是，就必須是 regular |
| M-06 | 文字量大的元件（警示、側邊欄、彈出視窗）用 regular 變體 | Materials §Liquid Glass | 該元件裡的文字超過一兩個字卻用了 clear → 沒過 |
| M-07 | 用 clear 且底下內容偏亮時，要墊一層 35% 不透明度的深色 | Materials §Liquid Glass | 量該層的 opacity。底下是亮的、卻沒有這層或不是 0.35 → 沒過。底下夠暗則免 |
| M-08 | 玻璃元件上不要再疊自訂背景 | Adopting Liquid Glass §Visual refresh、Toolbars §Best practices | 檢查 tab bar、toolbar、split view 有沒有設自訂 background。有就沒過 |
| M-09 | 玻璃上的文字與符號預設走單色，不套色 | Color §Liquid Glass color | 抓 toolbar 與 tab bar 的文字與符號顏色。設了非系統單色的值就沒過 |
| M-10 | 要強調主要動作時，色彩加在背景不加在文字，而且一頁只給一個 | Color §Liquid Glass color | 數該頁有幾個控制項的**背景**上了色。超過一個就沒過 |
| M-11 | 標準材質上的文字要用系統的 vibrant 色 | Materials §Standard materials | 材質上的文字若用寫死的色碼，沒過 |
| M-12 | quaternary 級的 vibrancy 不要疊在 thin 與 ultraThin 上 | Materials §iOS, iPadOS | 對照材質厚度與 vibrancy 級別。這個組合出現就沒過 |
| M-13 | 材質依語意選，不依它看起來的顏色選 | Materials §Standard materials | 問「為什麼選這個材質」。答得出用途 → 過；答「因為它看起來比較灰」→ 沒過 |
| M-14 | 相鄰的多個玻璃元件要放進同一個玻璃容器，才會正確融形 | Applying Liquid Glass to custom views | 兩個玻璃元件靠在一起卻各自獨立 → 沒過 |
| M-15 | 玻璃效果的修飾要套在其他外觀修飾之後 | Applying Liquid Glass to custom views | 讀該元件的修飾順序。玻璃套在中間、後面還接了改外觀的修飾 → 沒過 |

## Layout（版面）

邊距、安全區、圓角半徑的對應關係。

| 編號 | 條目 | 出處 | 怎麼驗 |
| --- | --- | --- | --- |
| L-01 | 背景與滿版美術要延伸到螢幕實體邊緣 | Layout §Best practices | 截圖看四邊有沒有留白條。有就沒過 |
| L-02 | 可捲動的版面要一路捲到螢幕最底與最邊，內容從控制層底下透出來 | Layout §Best practices | 捲到底。內容在 tab bar 上方就停住、底下是一塊實色 → 沒過 |
| L-03 | 內容與控制之間不加背景色塊，用 scroll edge effect 分隔 | Layout §Visual hierarchy | toolbar 或 tab bar 底下若鋪了自訂色塊，沒過 |
| L-04 | 內容要避開 safe area 之外的區域（Dynamic Island、Home indicator、螢幕圓角） | Layout §Guides and safe areas | 在有 Dynamic Island 的機型上截圖，看有沒有被切到的文字或被蓋住的控制項 |
| L-05 | 避免整寬按鈕，按鈕要內縮到系統邊距內 | Layout §iOS（Avoid full-width buttons） | 量按鈕左右是否貼齊螢幕邊。貼齊就沒過；真的要整寬時，圓角要與硬體圓角呼應 |
| L-06 | 巢狀元件的圓角要與容器的圓角同心 | Toolbars §Best practices、Adopting Liquid Glass §Controls | 量內外兩層的圓角半徑與間距。內層半徑不等於「外層半徑減間距」→ 沒過 |
| L-07 | 列表、表格、表單的列高、內距、區塊圓角交給系統，不沿用寫死的舊數字 | Adopting Liquid Glass §Organization and layout | 搜尋版面碼裡寫死的列高與圓角常數。有就沒過 |
| L-08 | 區塊標題用 title-style 大小寫，不再全大寫（只適用於拉丁字母的標籤） | Adopting Liquid Glass §Organization and layout | 看英文區塊標題是不是全大寫。是就沒過 |
| L-09 | 直向與橫向都要能用；只支援一種時，左右兩個旋轉方向都要能用 | Layout §iOS | 實機轉四個方向各看一次 |
| L-10 | 狀態列預設留著，只有沉浸式體驗才藏 | Layout §iOS | 該頁若隱藏狀態列，說得出它是哪一種沉浸式體驗才算過 |
| L-11 | 控制項之間要留夠間距：有邊框的元件約 12 pt，沒邊框的約 24 pt | Accessibility §Mobility | 量相鄰控制項可視邊緣之間的距離 |
| L-12 | scroll edge effect 優先用 automatic 樣式 | Scroll views §Scroll edge effects | 改用 soft 樣式時，要拿出在多種背景下都還看得清控制項的截圖，否則沒過 |
| L-13 | 一個 view 只套一個 scroll edge effect，而且只在捲動內容位於浮動元件底下時才用 | Scroll views §Scroll edge effects | 同一個 view 出現兩層效果 → 沒過；底下沒有捲動內容、拿它當裝飾 → 沒過 |
| L-14 | 內容要分區時用留白、色塊、材質或分隔線，並確保內容與控制仍然分得開 | Layout §Best practices | 指著任一個元件問「這是內容還是控制」，答不出來就沒過 |
| L-15 | 巢狀的捲動區不要與外層同方向 | Scroll views §Best practices | 垂直捲動裡再包一個垂直捲動 → 沒過；包水平的 → 過 |

## Navigation & search（導覽與搜尋）

分頁列與導覽列在 iOS 26 的樣子與行為。**iOS 的導覽列（navigation bar）在新版文件裡歸在 Toolbars 那一頁**，不再有獨立頁面。

| 編號 | 條目 | 出處 | 怎麼驗 |
| --- | --- | --- | --- |
| N-01 | tab bar 浮在畫面底部的內容之上，底下內容要透出來 | Tab bars §iOS | 捲動時看 tab bar 底下有沒有內容經過。它是一塊不透明實色 → 沒過 |
| N-02 | tab bar 只做導覽，不放動作 | Tab bars §Best practices | 逐一問每個 tab「按下去是換區域，還是對目前內容做事」。是後者就沒過 |
| N-03 | 導覽到任何區域時 tab bar 都看得見，只有 modal 蓋住時例外 | Tab bars §Best practices | 走完每一條導覽路徑，看 tab bar 有沒有消失 |
| N-04 | tab 不要多到出現 More 溢位分頁 | Tab bars §Best practices（Avoid overflow tabs） | 在最窄的支援機型上直向開啟。出現 More → 沒過 |
| N-05 | tab 內容為空時也不停用、不隱藏該 tab，改在頁內說明為什麼是空的 | Tab bars §Best practices | 把資料清空，看 tab 還在不在、有沒有說明 |
| N-06 | 每個 tab 都要有文字標籤，盡量只用一個詞 | Tab bars §Best practices | 數標籤字數 |
| N-07 | tab 圖示用 SF Symbols，優先選填滿（filled）的版本 | Tab bars §Best practices | 看圖示是不是自訂圖檔、是不是線框版 |
| N-08 | 搜尋若做成 tab，要用系統的 search tab API，讓系統自動把它分開並排到最尾端 | Adopting Liquid Glass §Search | 看搜尋 tab 是不是被系統排在最尾端且與其他 tab 分開。自己排的位置 → 沒過 |
| N-09 | 空間允許時，搜尋放畫面底部的 toolbar | Search fields §iOS | 搜尋放在頂端時，要說得出「底部內容不能被蓋住」的理由才算過 |
| N-10 | 返回與關閉用系統標準按鈕與符號，不要用文字「Back」「Close」 | Toolbars §Navigation | 看按鈕內容是符號還是文字 |
| N-11 | 大標題預設隨捲動縮成標準標題，捲回頂端再變回大標題 | Toolbars §iOS | 捲動一次再捲回頂端，看標題有沒有這兩段轉換 |
| N-12 | 視窗標題不要用 app 名稱，長度控制在 15 個字元以內 | Toolbars §Titles | 數標題字元數；標題等於 app 名稱 → 沒過 |
| N-13 | toolbar 的主要動作用 prominent 樣式，一頁只有一個，且放在 trailing 側 | Toolbars §Actions | 數 prominent 動作的數量與位置 |
| N-14 | toolbar 的分組最多三組 | Toolbars §Item groupings | 數分組數量 |
| N-15 | 相鄰的文字標籤按鈕之間要插固定間距 | Toolbars §Item groupings | 兩顆文字按鈕並排、中間沒有固定間距 → 沒過 |
| N-16 | toolbar 圖示用系統符號且不加外框 | Toolbars §Actions | 看符號有沒有被套上圓圈或方框 |
| N-17 | toolbar 預設版面就不該溢位，也不要自己加溢位選單 | Toolbars §Best practices | 在最窄機型上開啟，看是不是一進來就有溢位選單 |
| N-18 | 搜尋欄取得焦點時，要隨鍵盤一起上滑 | Adopting Liquid Glass §Search | 點搜尋欄，看它有沒有跟著鍵盤動；跟系統 app 比對動作是否一致 |
| N-19 | 導覽層與內容層要明確分開 | Adopting Liquid Glass §Navigation | 截圖後指著每個元件問「這屬於導覽還是內容」。分不清就沒過 |
| N-20 | 搜尋範圍要當場看得出來（用提示文字、scope bar 或標題） | Searching §Best practices | 進入搜尋畫面，看得出正在搜哪個範圍才算過 |
| N-21 | 打字就開始搜，不要等使用者按送出 | Search fields §Best practices | 打一個字就看結果。要按 return 才動 → 沒過 |
| N-22 | 一支 app 的內容盡量集中在一個搜尋入口；區塊分明時才另給只搜當前畫面的第二個 | Searching §Best practices | 數 app 裡的搜尋欄。超過一個時，要說得出每一個各搜什麼範圍才算過 |
| N-23 | iOS 上搜尋的入口三選一：tab bar 上的 tab、toolbar 裡的欄位、與內容並排的 inline 欄位 | Search fields §iOS | 指出這一頁的搜尋屬於哪一種。三種都不是（例如自己畫一個輸入框）→ 沒過 |
| N-24 | inline 的搜尋欄要放在它所搜的那份清單上方，捲動時釘在頂端 | Search fields §Search as an inline field | 捲動清單，看搜尋欄的位置與它所搜的內容有沒有脫節 |
| N-25 | 顯示搜尋歷史要顧慮隱私，而且要給得出清除的方法 | Searching §Best practices | 有顯示歷史卻沒有清除入口 → 沒過。不顯示歷史則不適用 |

## Lists（清單）

清單列怎麼排、選了要有什麼回饋、列尾那些控制項各自代表什麼。**這一章是票 `15` 做卡片列表時長出來的。**

| 編號 | 條目 | 出處 | 怎麼驗 |
| --- | --- | --- | --- |
| LT-01 | 清單優先放文字；項目尺寸差異大或圖片很多時改用 collection | Lists and tables §Best practices | 看列裡裝的是什麼。整列都是大圖卻用清單 → 沒過 |
| LT-02 | 選一列要有回饋，而且兩種回饋不能混用：往下一層走的持續高亮，選項式的短暫高亮再加一個打勾之類的符號 | Lists and tables §Best practices | 點一列。導覽用的列若只閃一下就恢復 → 沒過；選項式的列若沒有留下符號 → 沒過 |
| LT-03 | 列上的文字要精簡；文字量大時只列標題，內容放到下一層 | Lists and tables §Content | 看有沒有列被撐成好幾行。撐大的列要說得出「這幾行都是必要的」才算過 |
| LT-04 | 單欄清單沒有欄標題時，要用標籤或區塊標頭把脈絡講清楚 | Lists and tables §Content | 遮住畫面其餘部分只看一列，答得出「這是什麼的清單」才算過 |
| LT-05 | 分組的清單用標頭、頁尾與額外留白把每一組分開 | Lists and tables §Style | 兩組之間看不出界線 → 沒過 |
| LT-06 | 列的樣式要配合要顯示的資訊，不是每一列都套同一個版型 | Lists and tables §Style | 問「這一列為什麼長這樣」。答得出哪一段對應哪個欄位才算過 |
| LT-07 | info 鈕只用來顯示那一列的細節；要往下一層走用 disclosure indicator（`›`） | Lists and tables §iOS, iPadOS, visionOS | 按列尾那個符號。會推出下一頁卻畫成 info 鈕 → 沒過；只彈出細節卻畫成 `›` → 沒過 |
| LT-08 | 列尾已經有 disclosure indicator 之類的控制項時，不要再加右側索引 | Lists and tables §iOS, iPadOS, visionOS | 看清單右緣有沒有兩層東西疊著。有 → 沒過 |

## Buttons（按鈕）

尺寸、形狀、狀態、最小點擊區。

| 編號 | 條目 | 出處 | 怎麼驗 |
| --- | --- | --- | --- |
| B-01 | 按鈕的點擊區至少 44x44 pt | Buttons §Best practices | 量點擊區（不是視覺大小）。任一邊小於 44 pt 就沒過 |
| B-02 | 控制項預設 44x44 pt，絕對最小 28x28 pt | Accessibility §Mobility | 量控制項尺寸。小於 28 pt 一律沒過 |
| B-03 | 自訂按鈕一定要有按下狀態 | Buttons §Best practices（Always include a press state） | 按住不放。外觀完全沒變 → 沒過 |
| B-04 | 一頁最多一到兩顆 prominent 按鈕 | Buttons §Style | 數該頁 prominent 按鈕的數量 |
| B-05 | 同一組選項用同尺寸按鈕，用樣式而不是尺寸區分主次 | Buttons §Style | 量同組按鈕的尺寸。尺寸不一致就沒過 |
| B-06 | 破壞性動作不指定 primary role，即使它是最可能的選擇 | Buttons §Role | 找出所有會刪資料的按鈕，看它們的 role |
| B-07 | primary role 給最可能被選的那顆，而且它要能被 Return 觸發 | Buttons §Role | 接上實體鍵盤按 Return，看有沒有觸發那顆按鈕 |
| B-08 | 按鈕標籤用 title-style 大小寫並以動詞開頭（只適用於拉丁字母的標籤） | Buttons §Content | 讀英文標籤第一個詞是不是動詞 |
| B-09 | 按鈕文字的顏色不要與內容層背景色相近 | Buttons §Style、Color §Liquid Glass color | 內容層是彩色時，按鈕文字若也上了色 → 沒過，改用預設單色 |
| B-10 | 不要寫死按鈕的尺寸與圓角，讓系統套 iOS 26 的新值 | Adopting Liquid Glass §Controls | 搜尋按鈕樣式裡寫死的 height 與 borderRadius。有就沒過 |
| B-11 | 動作不會立刻完成時，按鈕內顯示忙碌指示 | Buttons §iOS, iPadOS | 觸發會等待的動作（例如雲端備份），看按鈕有沒有轉圈與替代文字 |
| B-12 | 自訂玻璃按鈕要開啟互動反應，才有系統按鈕那種按壓感 | Applying Liquid Glass to custom views | 按住自訂玻璃按鈕，看玻璃有沒有跟著反應 |
| B-13 | 玻璃效果的形狀：小元件用膠囊或圓形，大元件改用圓角矩形 | Applying Liquid Glass to custom views | 大面積元件套成膠囊、形狀看起來怪 → 沒過 |
| B-14 | 圖示按鈕優先用 SF Symbols 裡代表該動作的標準符號 | Buttons §Content | 對照 Standard icons 一覽。自己畫了一個系統已有的符號 → 沒過 |

## Typography（文字）

動態字級、字重、系統字體的用法。

| 編號 | 條目 | 出處 | 怎麼驗 |
| --- | --- | --- | --- |
| T-01 | 內文預設 17 pt，任何文字不得小於 11 pt | Typography §Ensuring legibility、Accessibility §Vision | 抓出該頁最小的字級。小於 11 pt 就沒過 |
| T-02 | 用系統 text styles（Body、Headline、Caption 等），不要寫死字級 | Typography §Using system fonts | 搜尋版面碼裡寫死的 fontSize 數字。有就沒過 |
| T-03 | 支援 Dynamic Type，含 AX1 到 AX5 五個放大級別 | Typography §Supporting Dynamic Type | 到「設定 > 輔助使用 > 顯示與文字大小 > 更大的文字」拉到最大，逐頁看有沒有截斷、重疊或跑版 |
| T-04 | 文字至少要能放大到原本的 200% | Accessibility §Vision | 對照最大級別與預設級別的實際字級 |
| T-05 | 避開 Ultralight、Thin、Light 三個字重，用 Regular／Medium／Semibold／Bold | Typography §Ensuring legibility | 抓所有 fontWeight 設定值 |
| T-06 | 字級變大時，有意義的介面圖示要跟著變大 | Typography §Supporting Dynamic Type | 拉到 AX5，看圖示跟文字的相對大小有沒有失衡 |
| T-07 | 字級變大時盡量不截斷文字，捲動區內尤其不行 | Typography §Supporting Dynamic Type | 拉到 AX5，找有沒有出現「…」 |
| T-08 | 字級變大時資訊層級不變，主要元素仍留在畫面上方 | Typography §Supporting Dynamic Type | 比對預設級別與 AX5 的截圖，看主要元素有沒有被擠走 |
| T-09 | 橫向空間不足時改成上下堆疊，文字在上、次要資訊在下 | Typography §Supporting Dynamic Type | 拉到 AX5，看同一列的文字與時間戳有沒有互相擠壓 |
| T-10 | 對比：17 pt 以下要 4.5:1，18 pt 要 3:1，粗體要 3:1 | Accessibility §Vision | 用對比計算器量前景色與背景色。淺色與深色兩種外觀各量一次 |
| T-11 | 顏色用系統定義的值，讓 Increase Contrast 自動生效 | Accessibility §Vision | 打開「提高對比」，看顏色有沒有跟著變 |
| T-12 | 同一個介面裡的字體家族數量壓到最少 | Typography §Conveying hierarchy | 數該頁用到幾種字體家族 |
| T-13 | 字級變化時，各級文字之間的相對層級與視覺差異要維持住 | Typography §Ensuring legibility | 比對預設級別與 AX5，標題仍明顯大於內文才算過 |
| T-14 | 不要只靠顏色傳達資訊，另外給形狀或圖示 | Accessibility §Vision | 把畫面轉成灰階，看資訊還讀不讀得出來 |

---

## 出處對照

| 出處 | 網址 |
| --- | --- |
| Materials | https://developer.apple.com/design/human-interface-guidelines/materials |
| Layout | https://developer.apple.com/design/human-interface-guidelines/layout |
| Scroll views | https://developer.apple.com/design/human-interface-guidelines/scroll-views |
| Tab bars | https://developer.apple.com/design/human-interface-guidelines/tab-bars |
| Toolbars | https://developer.apple.com/design/human-interface-guidelines/toolbars |
| Search fields | https://developer.apple.com/design/human-interface-guidelines/search-fields |
| Lists and tables | https://developer.apple.com/design/human-interface-guidelines/lists-and-tables |
| Searching | https://developer.apple.com/design/human-interface-guidelines/searching |
| Buttons | https://developer.apple.com/design/human-interface-guidelines/buttons |
| Typography | https://developer.apple.com/design/human-interface-guidelines/typography |
| Color | https://developer.apple.com/design/human-interface-guidelines/color |
| Accessibility | https://developer.apple.com/design/human-interface-guidelines/accessibility |
| Adopting Liquid Glass | https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass |
| Applying Liquid Glass to custom views | https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views |

**Adopting Liquid Glass 與 Applying Liquid Glass to custom views 是開發者文件，不是 HIG。** 收進來是因為圓角同心、玻璃容器、控制項尺寸這三件事只在那裡寫得明確，HIG 本文只帶過一句。

## 沒有收進來的東西

- **「用起來要舒服」那類條目。** 答不出過／沒過的一律不收。
- **iPad、Mac、Vision Pro、Apple Watch、Apple TV 的規定。** 只做 iOS，見 `spec.md`。
- **Android 的設計規範。** 不做 Android。
- **好不好看。** 那是並排目測那把尺的事。

## 變更紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-24 | 建立。五個章節共 78 條，取自 developer.apple.com 線上版（票 `01`） |
| 2026-08-31 | 卡片列表動工，加 13 條：搜尋 5 條（`N-21`–`N-25`）與新的〈Lists〉一章 8 條（`LT-01`–`LT-08`）。取自 Search fields、Searching、Lists and tables 三頁的線上版；前兩頁在 2026-06-08 更新過，iOS 的搜尋入口從兩種變成三種（票 `15`） |
