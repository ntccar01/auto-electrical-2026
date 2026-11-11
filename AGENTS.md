# 開發接續

- 先讀 CLAUDE.md、工作筆記.md；接手盤點.md 是 2026-10-21 修正前的基準快照。
- 功能變更後執行 `node --test tests/regression.test.cjs tests/gas.test.cjs tests/csv.test.cjs`。涉及頁面互動時依 tests/README.md 執行 browser.cjs。
- 等使用者指示或說「收工」才 commit。不得自行 push、部署、變更雲端分享權限或重寫 Git 歷史。
- 只收集班級代號與座號；雲端匯入必須以白名單教師身分執行，學生提交檔不得自帶可信核章。
- 學生成績檔（CSV）以 6 碼代碼簽章：`shared/js/submission.js` 與 `gas/Code.gs` 的簽章契約（代碼字元集與檢查碼、pinKey、HMAC 對象）必須一致，改動任一邊須同步並跑 tests/csv.test.cjs。名單只存 pinKey，不得保存或記錄代碼原文。
- 考評「通過」＝診斷正確＋配線完成＋至少 2 筆有效量測（電壓與電阻檔都用到）＋總分 ≥ 60（`ASSESS.passGate`）；考評未通過不得顯示或匯出正確答案。
- 不提交金鑰、憑證、教材 PDF 或 tmp/、test-results/ 的輸出。
- 維持純 HTML／CSS／JavaScript 學生端；GAS 僅放在 gas/。測試環境 mock 不等於 Google 線上驗證。

- 新增功能、調整進度或完成驗收時，同步更新 project-guide.js（開發導覽入口的狀態、歷程、連結及待辦）與工作筆記.md；清楚區分本機 mock、雲端實測及尚未部署。導覽不得放金鑰、憑證或學生專屬資料。
