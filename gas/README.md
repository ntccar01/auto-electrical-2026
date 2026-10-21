# 雲端教師端部署

本版採「學生匯出提交檔 → 教師登入後匯入 → 覆閱／核章／發證」。不使用公開匿名寫入端點，不把教師權限交給學生端判定。

## 已備妥與未驗證的界線

- Code.gs：教師白名單、JSON 匯入／去重、調分、核章、學期證書快照及 HMAC 簽章查驗。
- Teacher.html：Apps Script 管理頁，使用 google.script.run 呼叫後端。
- appsscript.json：V8、臺北時區與必要的 Sheets／帳號 email 權限。
- 已完成本機 mock 測試及瀏覽器整合；尚未建立 Google 試算表、Apps Script 專案或正式部署，也未驗證 Google 實際授權。

## 第一次部署（教師本人）

1. 用教師的 Google 帳號建立專用試算表，保留私人存取，記下試算表網址中的 ID。
2. 從試算表的「擴充功能 → Apps Script」建立綁定專案。
3. 將本目錄 Code.gs 貼入指令碼，建立名為 Teacher 的 HTML 檔並貼入 Teacher.html。
4. 在專案設定顯示 appsscript.json，貼入本目錄的 manifest。
5. 在「專案設定 → 指令碼屬性」加入：
   - SPREADSHEET_ID：步驟 1 的試算表 ID。
   - TEACHER_EMAILS：教師帳號 email；多個帳號用逗號分隔。此值只放伺服器，不放學生端。
6. 部署為「網頁應用程式」，執行身分選教師本人，存取權限選「僅限自己」。第一次由教師本人完成 Google 授權。
7. 開啟部署網址，確認管理頁能讀取空成績列表。若身分 email 取不到，後端會拒絕，不會退回匿名存取。
8. 將部署網址寫到 shared/js/config.js 的 gasUrl（https://script.google.com/macros/s/.../exec），設定 semester，例如 115-1。網址是教師管理入口，不是學生 POST API。

目前「僅限自己」部署只服務部署教師本人；白名單不會繞過 Google 部署權限。多教師協作需另行確認學校 Workspace 的存取政策與授權方式。

## 使用方式

1. 學生完成考評後，下載「匯出提交檔」的 JSON；CSV 仍可保存人類可讀成績。
2. 教師收集提交檔，也可在本機 teacher.html 依單元／班級篩選後按「匯出雲端提交檔」。檔案只含班級代號、座號、題目、紀錄 ID 與前端初評。
3. 教師登入雲端管理頁，輸入本批匯入學期並選檔匯入。每批 1～200 筆，檔案上限 1 MB。未指定批次學期時，檔案內各筆必須已有學期。
4. 伺服器以 recordId 去重；本機調分、核章、姓名與額外欄位不會被當成雲端授權資料。
5. 教師覆閱後調分或核章，核章身分取自 Google 帳號，核章後鎖定。
6. 依班級代號、座號、學期核發證書。雲端 ID 不含學生識別碼，證書保存已核章紀錄的快照。
7. 使用雲端管理頁查驗 ID；結果遮罩班級與座號，並檢查伺服器簽章。公開 verify.html 仍只查本機，不能替代此雲端查驗。

NTC_Grades 與 NTC_Certificates 工作表由首次使用時建立。請不要手動修改內部 ID 或 JSON 欄位。CERT_SIGNING_KEY 在首次雲端核發時自動產生並留在指令碼屬性；更換或刪除會使舊證書無法通過簽章查驗。

匯入的初評仍來自學生瀏覽器，不能視為防作弊證據；教師須核對操作歷程或課堂表現後再核章。若要即時學生登入提交、跨裝置學生自助查驗，須另做學生身分驗證與查詢權限，不能把本教師端改成 Anyone 直接開放。

## Google 官方依據

- [Web Apps：執行身分與部署](https://developers.google.com/apps-script/guides/web)
- [Session：取得登入使用者及 email 限制](https://developers.google.com/apps-script/reference/base/session)
- [HTML Service：google.script.run 非同步呼叫](https://developers.google.com/apps-script/guides/html/communication)
- [Utilities：伺服器 HMAC SHA-256](https://developers.google.com/apps-script/reference/utilities/utilities)
