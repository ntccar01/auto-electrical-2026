/* 教師專用 Apps Script 後端；部署前設定 SPREADSHEET_ID、TEACHER_EMAILS。
 * 學生提交檔的分數屬前端初評，必須由教師覆閱後核章；不接受檔案內的核章。
 */
function teacher_() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  var allowed = String(PropertiesService.getScriptProperties().getProperty('TEACHER_EMAILS') || '').toLowerCase().split(',').map(function(s){return s.trim();}).filter(Boolean);
  if (!email || allowed.indexOf(email) < 0) throw new Error('無教師權限，請使用已授權的 Google 帳號登入。');
  return email;
}
function locked_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function sheet_(name) {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('尚未設定 SPREADSHEET_ID。');
  var book = SpreadsheetApp.openById(id);
  var sheet = book.getSheetByName(name);
  if (!sheet) { sheet = book.insertSheet(name); sheet.appendRow(['recordId', 'dataJSON']); }
  return sheet;
}
function rows_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues().map(function(row,i){return {row:i+2,id:String(row[0]),data:JSON.parse(row[1])};});
}
function write_(sheet, row, data) { sheet.getRange(row,1,1,2).setValues([[data.recordId || data.certId, JSON.stringify(data)]]); }
function code_(value, label) {
  var s = String(value == null ? '' : value);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,29}$/u.test(s)) throw new Error(label + '格式錯誤。');
  return s;
}
function seat_(value) { var s=String(value); if(!/^[1-9]\d{0,2}$/.test(s))throw new Error('座號須為 1～999 的整數。');return s; }
function id_(value) { var s=String(value || '');if(!/^[A-Za-z0-9_-]{1,160}$/.test(s))throw new Error('紀錄 ID 格式錯誤。');return s; }
function normalized_(r, semester) {
  if (!r || ['horn','start'].indexOf(r.unit)<0) throw new Error('不支援的單元。');
  var score = r.summary && r.summary.score;
  if (typeof score !== 'number' || !isFinite(score) || score<0 || score>100) throw new Error('初評分數須為 0～100。');
  var parts={};var source=(r.summary && r.summary.parts)||{};
  ['結果正確','結果相近','量測覆蓋','檔位運用','配線完整','用時','一次繳交','故障找出','量測證據','分段維修'].forEach(function(k){if(typeof source[k]==='number'&&isFinite(source[k])&&source[k]>=0&&source[k]<=100)parts[k]=source[k];});
  return {recordId:id_(r.recordId),sid:id_(r.sid),unit:r.unit,cls:code_(r.cls,'班級代號'),seat:seat_(r.seat),semester:code_(semester || r.semester,'學期'),
    paper:/^[A-E]$/.test(r.paper)?r.paper:'',faultConfigId:/^(HORN|START)-[SCW]-\d{2}$/.test(r.faultConfigId)?r.faultConfigId:'',
    summary:{score:score,pass:r.summary.pass===true,multi:r.summary.multi===true,parts:parts}};
}
function doGet() { teacher_();return HtmlService.createHtmlOutputFromFile('Teacher').setTitle('汽車電系雲端教師端'); }
function listRecords() { teacher_();return locked_(function(){return rows_(sheet_('NTC_Grades')).map(function(r){return r.data;});}); }
function importRecords(text, semester) {
  var email=teacher_();
  if(typeof text!=='string'||text.length>1000000)throw new Error('請匯入 1 MB 以內的 JSON。');
  var payload=JSON.parse(text);
  if(payload.version!==1||!Array.isArray(payload.records)||!payload.records.length||payload.records.length>200)throw new Error('提交檔格式錯誤，每次限 1～200 筆。');
  // 先驗證整批，再取得寫入鎖，避免格式錯誤造成半批匯入。
  var incoming=payload.records.map(function(r){return normalized_(r, semester);});
  return locked_(function(){
    var sheet=sheet_('NTC_Grades'),seen=Object.create(null);rows_(sheet).forEach(function(r){seen[r.id]=true;});
    var add=[];incoming.forEach(function(r){if(seen[r.recordId])return;seen[r.recordId]=true;r.importedAt=new Date().toISOString();r.importedBy=email;add.push([r.recordId,JSON.stringify(r)]);});
    if(add.length)sheet.getRange(sheet.getLastRow()+1,1,add.length,2).setValues(add);
    return {imported:add.length,duplicates:incoming.length-add.length};
  });
}
function adjustRecord(id, delta, note) {
  var email=teacher_();id=id_(id);
  if(typeof delta!=='number'||!Number.isInteger(delta)||delta < -10||delta>10)throw new Error('調分限 -10～+10 的整數。');
  note=String(note||'').trim();if(!note||note.length>500)throw new Error('請填寫 500 字以內的調分說明。');
  return locked_(function(){var sheet=sheet_('NTC_Grades'),hit=rows_(sheet).filter(function(r){return r.id===id;})[0];
    if(!hit||hit.data.approved)throw new Error('紀錄不存在或已核章鎖定。');
    hit.data.adjust={delta:delta,comment:note,at:new Date().toISOString(),teacher:email};write_(sheet,hit.row,hit.data);return hit.data;});
}
function approveRecord(id) {
  var email=teacher_();id=id_(id);
  return locked_(function(){var sheet=sheet_('NTC_Grades'),hit=rows_(sheet).filter(function(r){return r.id===id;})[0];
    if(!hit||hit.data.approved)throw new Error('紀錄不存在或已核章鎖定。');
    hit.data.approved={teacher:email,at:new Date().toISOString()};write_(sheet,hit.row,hit.data);return hit.data;});
}
function total_(r) {return Math.max(0,Math.min(100,r.summary.score+((r.adjust&&r.adjust.delta)||0)));}
function signature_(raw,key) {return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(raw,key));}
function issueCertificate(cls,seat,semester) {
  var email=teacher_();cls=code_(cls,'班級代號');seat=seat_(seat);semester=code_(semester,'學期');
  return locked_(function(){
    var rows=rows_(sheet_('NTC_Grades')).map(function(r){return r.data;}).filter(function(r){return r.cls===cls&&r.seat===seat&&r.semester===semester&&r.approved;});
    if(!rows.length)throw new Error('尚無已核章紀錄。');
    var payload={certId:'NTC-'+Utilities.getUuid(),cls:cls,seat:seat,semester:semester,teacher:email,at:new Date().toISOString(),
      records:rows.map(function(r){return {recordId:r.recordId,unit:r.unit,total:total_(r),approved:r.approved};})};
    var raw=JSON.stringify(payload),props=PropertiesService.getScriptProperties(),key=props.getProperty('CERT_SIGNING_KEY');
    if(!key){key=Utilities.getUuid()+Utilities.getUuid();props.setProperty('CERT_SIGNING_KEY',key);}
    var cert={certId:payload.certId,payload:raw,signature:signature_(raw,key)};
    var sheet=sheet_('NTC_Certificates');write_(sheet,sheet.getLastRow()+1,cert);return payload;
  });
}
function verifyCertificate(id) {
  teacher_();id=id_(id);
  return locked_(function(){
    var hit=rows_(sheet_('NTC_Certificates')).filter(function(r){return r.id===id;})[0];
    var key=PropertiesService.getScriptProperties().getProperty('CERT_SIGNING_KEY');
    if(!hit||!key||signature_(hit.data.payload,key)!==hit.data.signature)return {valid:false};
    var p=JSON.parse(hit.data.payload);
    if(p.certId!==id)return {valid:false};
    return {valid:true,certId:p.certId,cls:p.cls.slice(0,1)+'＊＊',seat:'＊＊',semester:p.semester,units:Array.from(new Set(p.records.map(function(r){return r.unit;}))),at:p.at};
  });
}
