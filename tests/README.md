# 驗證

## 不需外部套件的回歸測試

在專案根目錄執行（Node.js 22 或更新）：

```powershell
node --test tests/regression.test.cjs tests/gas.test.cjs
```

涵蓋兩單元完整／缺線／空配線評分、零分封存、新考試與重繳 ID、舊資料相容、姓名排除、起動控制與主電源故障，以及 GAS 的身分驗證、整批匯入、去重、核章鎖定、學期與證書簽章。

## 真實瀏覽器驗收

需要 Playwright Node 套件與已安裝的 Microsoft Edge。本專案不在背景下載或安裝瀏覽器。

```powershell
node tests/browser.cjs
```

若使用 Codex 隨附套件，可先設定：

```powershell
$env:NODE_PATH='C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node tests/browser.cjs
```

browser.cjs 啟動隨機 localhost 連接埠、使用全新的隔離瀏覽器內容、以 TEST_A 等虛構資料操作，結束後關閉伺服器與瀏覽器。驗收包含配線、刪線、電表拖曳、OEM、考評、CSV／JSON 匯出、教師篩選／調分／核章、本機證書、雲端教師管理頁、平板觸控與手機版面。Google 服務在此由本機 mock 取代，不代表實際 Google OAuth 或資料已寫入雲端。

截圖與下載檔寫在 test-results/，已排除 Git。tests/helpers.cjs 與 gas-helpers.cjs 為測試環境，不應被部署為學生端或 Apps Script 生產檔。

## 仍需人工或線上驗證

- 真實平板的長按 ST、電表探棒操作手感與瀏覽器相容性。
- 本機列印分頁、正式證書版型與 QR（尚待第二輪）。
- 教師 Google 授權、白名單拒絕、試算表讀寫、重複匯入與跨裝置查驗。
- 起動電壓使用固定 12V 電源、理想配線／開關及 30Ω／2Ω／1.5Ω 教學電阻求節點電壓；180A 搖轉顯示仍為狀態示意，未建模電瓶內阻、反電動勢、接點動態與短路熔斷。完全浮接端點暫以 0V 參考顯示。
