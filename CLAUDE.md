# 2026喇叭電路專案 — 班級工具專案

汽車科電系實習模擬教學平台（喇叭→起動→充電→燈光…多單元）。

## 對話開始時請先讀
- 進度與最近更動：`工作筆記.md`（正式位置：Obsidian vault `/2026喇叭電路專案/工作筆記.md`，vault 未連接時用本檔暫代）
- 架構與規格：各單元 `exam_bank.js`＋本檔工具清單

## 工作模式
- **繼續開發**：直接說要做的功能 → 改完驗證（`node --test tests/regression.test.cjs tests/gas.test.cjs`；瀏覽器驗收見 `tests/README.md`）→ 等指示 commit
- **結束工作**：說「**收工**」→ commit（push 需先設 remote 且 `gh auth login` 有效）
- **接續工作**：說「**開工**」→ 讀工作筆記、報告上次進度
- **本機測試**：`python -m http.server 8000`（專案根目錄）→ http://localhost:8000/

## 工具清單
- 單元入口：`index.html`
- 喇叭系統模擬：`units/horn/index.html`（學生端）＋`shared/js/app.js`
- 起動系統模擬：`units/start/index.html`＋`units/start/app-start.js`
- 教師端：`teacher.html`（成績／調分／核章／雷達／發證）　驗證頁：`verify.html`
- 雲端教師端：`gas/`（教師登入後匯入提交檔，部署說明 `gas/README.md`）；本機設定教學 `cloud-setup.html`
- 共用：`shared/js/{config,logger,oem,assessment}.js`、`units/{horn,start}/exam_bank.js`

## 🔒 安全規則（不可違反）
1. `.env` 或任何含 API Key 的檔案**絕對不能 commit**
2. 學生資料去識別化（只用座號＋班級代號）；驗證頁遮罩個資
3. GAS URL 放 `shared/js/config.js`（公開 repo 可見無妨，但部署權限只限老師帳號）
4. `電子書/*.pdf` 為本地課本掃描檔，禁止重新加入 Git。2026-10-21 已執行 `git rm --cached`，保留本地檔案；舊 Git 歷史仍含 PDF，未經指示不可重寫歷史或 force push。
5. 如果不小心 commit 了機密 → 立即告知使用者處理
6. 收工前說「收工」讓 Claude 同步；push 前確認 `gh auth status` 有效
