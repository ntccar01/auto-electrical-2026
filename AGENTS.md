# 開發接續

- 先讀 CLAUDE.md、工作筆記.md；接手盤點.md 是 2026-10-21 修正前的基準快照。
- 功能變更後執行 `node --test tests/regression.test.cjs tests/gas.test.cjs`。涉及頁面互動時依 tests/README.md 執行 browser.cjs。
- 等使用者指示或說「收工」才 commit。不得自行 push、部署、變更雲端分享權限或重寫 Git 歷史。
- 只收集班級代號與座號；雲端匯入必須以白名單教師身分執行，學生提交檔不得自帶可信核章。
- 不提交金鑰、憑證、教材 PDF 或 tmp/、test-results/ 的輸出。
- 維持純 HTML／CSS／JavaScript 學生端；GAS 僅放在 gas/。測試環境 mock 不等於 Google 線上驗證。
