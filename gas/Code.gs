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
  ['結果正確','結果相近','量測覆蓋','檔位運用','配線完整','用時','一次繳交','故障找出','量測證據','分段維修','功能確認'].forEach(function(k){if(typeof source[k]==='number'&&isFinite(source[k])&&source[k]>=0&&source[k]<=100)parts[k]=source[k];});
  return {recordId:id_(r.recordId),sid:id_(r.sid),unit:r.unit,cls:code_(r.cls,'班級代號'),seat:seat_(r.seat),semester:code_(semester || r.semester,'學期'),
    paper:/^[A-E]$/.test(r.paper)?r.paper:'',faultConfigId:/^(HORN|START)-[SCW]-\d{2}$/.test(r.faultConfigId)?r.faultConfigId:'',
    summary:{score:score,pass:r.summary.pass===true,multi:r.summary.multi===true,parts:parts}};
}
function doGet(e) {
  if (e && e.parameter && e.parameter.page === 'verify') {
    var page=HtmlService.createTemplateFromFile('StudentVerify');
    page.certificateId=String(e.parameter.id||'');
    return page.evaluate().setTitle('汽車電系雲端證書查驗');
  }
  if(e&&e.parameter&&e.parameter.page==='interview')return HtmlService.createHtmlOutputFromFile('InterviewReport').setTitle('面試學習歷程報告');
  teacher_();
  return HtmlService.createHtmlOutputFromFile('Teacher').setTitle('汽車電系雲端教師端');
}
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
function certificatePayload_(id) {
  var hit=rows_(sheet_('NTC_Certificates')).filter(function(r){return r.id===id;})[0];
  var key=PropertiesService.getScriptProperties().getProperty('CERT_SIGNING_KEY');
  if(!hit||!key||!hit.data||typeof hit.data.payload!=='string'||typeof hit.data.signature!=='string'||signature_(hit.data.payload,key)!==hit.data.signature)return null;
  try {
    var payload=JSON.parse(hit.data.payload);
    if(!payload||payload.certId!==id||!payload.cls||!payload.seat||!payload.semester||!Array.isArray(payload.records)||!payload.records.length)return null;
    return payload;
  } catch(e) { return null; }
}
function certificateSummary_(payload) {
  return {valid:true,certId:payload.certId,cls:payload.cls.slice(0,1)+'＊＊',seat:'＊＊',semester:payload.semester,
    units:Array.from(new Set(payload.records.map(function(r){return r.unit;}).filter(function(unit){return ['horn','start'].indexOf(unit)>=0;}))),at:payload.at};
}
function verifyStudentCertificate(id) {
  id=String(id||'').trim();
  if(!/^NTC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return {valid:false};
  return locked_(function(){var payload=certificatePayload_(id);return payload?certificateSummary_(payload):{valid:false};});
}
function getStudentVerifyUrl() {
  teacher_();
  var url=String(PropertiesService.getScriptProperties().getProperty('STUDENT_VERIFY_URL')||'').trim().replace(/\/+$/,'');
  return /^https:\/\/script\.google\.com\/(?:macros\/|a\/macros\/[A-Za-z0-9.-]+\/)s\/[A-Za-z0-9_-]+\/exec$/.test(url)?url:'';
}
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
    var payload=certificatePayload_(id);
    return payload?certificateSummary_(payload):{valid:false};
  });
}

function issueInterviewReport(cls,seat,semester,consent) {
  teacher_();
  if(consent!==true)throw new Error('請先確認學生同意提供面試報告。');
  cls=code_(cls,'班級代號');seat=seat_(seat);semester=code_(semester,'學期');
  return locked_(function(){
    var records=rows_(sheet_('NTC_Grades')).map(function(r){return r.data;}).filter(function(r){return r.cls===cls&&r.seat===seat&&r.semester===semester&&r.approved;}).map(function(r){
      return {unit:r.unit,task:r.faultConfigId,initialScore:r.summary.score,finalScore:total_(r),parts:r.summary.parts,approvedAt:r.approved.at};
    });
    if(!records.length)throw new Error('尚無已核章紀錄。');
    var now=new Date(),payload={reportId:'NTR-'+Utilities.getUuid(),cls:cls,seat:seat,semester:semester,issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+30*86400000).toISOString(),records:records};
    var props=PropertiesService.getScriptProperties(),key=props.getProperty('CERT_SIGNING_KEY');
    if(!key){key=Utilities.getUuid()+Utilities.getUuid();props.setProperty('CERT_SIGNING_KEY',key);}
    var raw=JSON.stringify(payload),sheet=sheet_('NTC_InterviewReports');
    sheet.getRange(sheet.getLastRow()+1,1,1,2).setValues([[payload.reportId,JSON.stringify({payload:raw,signature:signature_(raw,key)})]]);
    return {reportId:payload.reportId,expiresAt:payload.expiresAt};
  });
}
function verifyInterviewReport(id) {
  id=String(id||'').trim();
  if(!/^NTR-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return {valid:false};
  return locked_(function(){
    var props=PropertiesService.getScriptProperties(),bookId=props.getProperty('SPREADSHEET_ID'),key=props.getProperty('CERT_SIGNING_KEY');
    if(!bookId||!key)return {valid:false};
    var sheet=SpreadsheetApp.openById(bookId).getSheetByName('NTC_InterviewReports');
    if(!sheet)return {valid:false};
    try {
      var hit=rows_(sheet).filter(function(r){return r.id===id;})[0];
      if(!hit||signature_(hit.data.payload,key)!==hit.data.signature)return {valid:false};
      var payload=JSON.parse(hit.data.payload),expiry=new Date(payload.expiresAt).getTime();
      if(payload.reportId!==id||!isFinite(expiry)||Date.now()>=expiry)return {valid:false};
      return {valid:true,report:payload};
    }catch(e){return {valid:false};}
  });
}

/* ===== 學生名單、6 碼代碼與成績檔（CSV）匯入（2026-11-11）=====
 * 簽章契約與 shared/js/submission.js 必須一致：
 *   pinKey = SHA-256 hex("NTC-PIN-v1|" + 班級 + "|" + 座號 + "|" + 代碼)；驗證碼 = HMAC-SHA256 hex(key=pinKey, msg=base64 資料)。
 * NTC_Roster 只保存 pinKey，不保存代碼原文；代碼只在產生／重設時回傳給教師一次。
 */
var CODE_ALPHABET_='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var CSV_STATUS_LABEL_={ok:'驗證通過',tampered:'內容被修改',unsigned:'未簽章',noRoster:'名單中無此座號',invalid:'格式錯誤',practice:'練習模式紀錄',duplicate:'重複',readableEdited:'可讀欄位被修改'};
function codeCheck_(body){var sum=0;for(var i=0;i<body.length;i++)sum+=(i+1)*CODE_ALPHABET_.indexOf(body[i]);return CODE_ALPHABET_[sum%CODE_ALPHABET_.length];}
function newCode_(){
  var h=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''),body='';
  for(var i=0;i<5;i++)body+=CODE_ALPHABET_[parseInt(h.substr(i*4,4),16)%CODE_ALPHABET_.length];
  return body+codeCheck_(body);
}
function bytesHex_(bytes){return bytes.map(function(b){var v=b<0?b+256:b;return (v<16?'0':'')+v.toString(16);}).join('');}
function pinKey_(cls,seat,code){return bytesHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,'NTC-PIN-v1|'+cls+'|'+seat+'|'+code,Utilities.Charset.UTF_8));}
function csvSign_(keyHex,data){return bytesHex_(Utilities.computeHmacSha256Signature(data,keyHex));}
function rosterId_(cls,seat){return 'P|'+cls+'|'+seat;}
function rosterRows_(){return rows_(sheet_('NTC_Roster'));}
function rosterEntry_(email,cls,seat,old){var code=newCode_(),now=new Date().toISOString();
  return {code:code,data:{recordId:rosterId_(cls,seat),cls:cls,seat:seat,pinKey:pinKey_(cls,seat,code),createdAt:old?old.createdAt:now,resetAt:old?now:'',by:email}};}

function createRoster(cls,from,to){
  var email=teacher_();cls=code_(cls,'班級代號');from=Number(from);to=Number(to);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to>999||from>to)throw new Error('座號範圍須為 1～999 的整數，且起始不大於結束。');
  if(to-from+1>80)throw new Error('每次最多建立 80 位學生。');
  return locked_(function(){
    var sheet=sheet_('NTC_Roster'),seen=Object.create(null);rows_(sheet).forEach(function(r){seen[r.id]=true;});
    var created=[],skipped=[],add=[];
    for(var s=from;s<=to;s++){var seat=String(s);if(seen[rosterId_(cls,seat)]){skipped.push(seat);continue;}
      var e=rosterEntry_(email,cls,seat,null);add.push([e.data.recordId,JSON.stringify(e.data)]);created.push({cls:cls,seat:seat,code:e.code});}
    if(add.length)sheet.getRange(sheet.getLastRow()+1,1,add.length,2).setValues(add);
    return {created:created,skipped:skipped};
  });
}
function resetCode(cls,seat){
  var email=teacher_();cls=code_(cls,'班級代號');seat=seat_(seat);
  return locked_(function(){
    var sheet=sheet_('NTC_Roster'),hit=rows_(sheet).filter(function(r){return r.id===rosterId_(cls,seat);})[0];
    var e=rosterEntry_(email,cls,seat,hit?hit.data:null);write_(sheet,hit?hit.row:sheet.getLastRow()+1,e.data);
    return {cls:cls,seat:seat,code:e.code};
  });
}
function listRoster(cls){
  teacher_();cls=code_(cls,'班級代號');
  return locked_(function(){return rosterRows_().map(function(r){return r.data;}).filter(function(d){return d.cls===cls;})
    .map(function(d){return {seat:d.seat,createdAt:d.createdAt,resetAt:d.resetAt||''};}).sort(function(a,b){return Number(a.seat)-Number(b.seat);});});
}

function parseCsv_(text){
  text=String(text).replace(/^﻿/,'');var rows=[],row=[],cell='',q=false;
  for(var i=0;i<text.length;i++){var c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;continue;}
    if(c==='"')q=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows.filter(function(r){return r.some(function(v){return String(v).trim()!=='';});});
}
function checkCsvFiles_(files,semester){
  if(!Array.isArray(files)||!files.length||files.length>100)throw new Error('請選擇 1～100 個成績檔。');
  var grades=Object.create(null);rows_(sheet_('NTC_Grades')).forEach(function(r){grades[r.id]=true;});
  var keys=Object.create(null);rosterRows_().forEach(function(r){keys[r.id]=r.data.pinKey;});
  var out=[],batch=Object.create(null);
  files.forEach(function(f){
    var name=String((f&&f.name)||'').slice(0,120),text=String((f&&f.text)||'');
    if(text.length>100000){out.push({file:name,status:'invalid',message:'檔案過大'});return;}
    var rows=parseCsv_(text),head=rows[0]||[],di=head.indexOf('資料'),si=head.indexOf('驗證碼');
    var col=function(row,name){var i=head.indexOf(name);return i<0?null:String(row[i]==null?'':row[i]).trim();};
    if(di<0||si<0||rows.length<2){out.push({file:name,status:'invalid',message:'不是本系統的成績檔'});return;}
    rows.slice(1).forEach(function(row){
      var item={file:name},data=String(row[di]||'').trim(),sig=String(row[si]||'').trim().toLowerCase();
      try{
        var payload=JSON.parse(Utilities.newBlob(Utilities.base64Decode(data)).getDataAsString('UTF-8'));
        if(!payload||payload.v!==1||payload.kind!=='ntc-submission'||!payload.record)throw new Error('資料格式不符');
        var src=payload.record,rec=normalized_(src,semester);
        rec.attempt=(Number.isInteger(src.attempt)&&src.attempt>0&&src.attempt<100)?src.attempt:1;
        rec.level=['basic','standard','challenge'].indexOf(src.level)>=0?src.level:'';
        rec.summary.diagnosisCorrect=!!(src.summary&&src.summary.diagnosisCorrect===true);
        item.record=rec;item.cls=rec.cls;item.seat=rec.seat;item.unit=rec.unit;item.paper=rec.paper;item.score=rec.summary.score;item.pass=rec.summary.pass;item.attempt=rec.attempt;
        var key=keys[rosterId_(rec.cls,rec.seat)];
        // 先判斷練習／簽章，被修改的檔案即使與已匯入紀錄同 ID 也要讓老師看到「內容被修改」。
        if(src.mode!=='exam')item.status='practice';
        else if(!sig||sig==='未簽章')item.status='unsigned';
        else if(!key)item.status='noRoster';
        else item.status=(csvSign_(key,data)===sig)?'ok':'tampered';
        // 可讀欄位（老師用 Excel 看到的）必須與簽章資料一致，否則視為被修改、不匯入
        if(['ok','unsigned','noRoster'].indexOf(item.status)>=0){
          var diff=[],chk=function(name,val){var v=col(row,name);if(v!==null&&v!==String(val))diff.push(name);};
          chk('班級代號',rec.cls);chk('座號',rec.seat);chk('總分',rec.summary.score==null?'':rec.summary.score);
          chk('是否通過',rec.summary.pass?'通過':'未通過');chk('紀錄ID',rec.recordId);chk('今日第幾次',rec.attempt);
          if(diff.length){item.status='readableEdited';item.message=diff.join('、');}
        }
        if(['ok','unsigned','noRoster'].indexOf(item.status)>=0){
          if(grades[rec.recordId]||batch[rec.recordId])item.status='duplicate';else batch[rec.recordId]=true;
        }
      }catch(e){item.status='invalid';item.message=String(e.message||e).slice(0,120);}
      out.push(item);
    });
  });
  out.forEach(function(it){it.label=CSV_STATUS_LABEL_[it.status]||it.status;});
  return out;
}
function previewCsv(files,semester){
  teacher_();
  return locked_(function(){return checkCsvFiles_(files,semester).map(function(it){var c={};Object.keys(it).forEach(function(k){if(k!=='record')c[k]=it[k];});return c;});});
}
function importCsv(files,semester,includeUnverified){
  var email=teacher_();
  return locked_(function(){
    var items=checkCsvFiles_(files,semester),sheet=sheet_('NTC_Grades'),add=[],counts={};
    items.forEach(function(it){
      counts[it.status]=(counts[it.status]||0)+1;
      var accept=it.status==='ok'||(includeUnverified===true&&(it.status==='unsigned'||it.status==='noRoster'));
      if(!accept)return;
      var r=it.record;r.verify=it.status;r.source='csv';r.sourceFile=it.file;r.importedAt=new Date().toISOString();r.importedBy=email;
      add.push([r.recordId,JSON.stringify(r)]);
    });
    if(add.length)sheet.getRange(sheet.getLastRow()+1,1,add.length,2).setValues(add);
    return {imported:add.length,counts:counts};
  });
}

// 學生休學／轉出：從名單移除座號，代碼立即失效；已匯入成績保留（2026-11-12）
function removeRosterSeat(cls,seat){
  teacher_();cls=code_(cls,'班級代號');seat=seat_(seat);
  return locked_(function(){
    var sheet=sheet_('NTC_Roster'),hit=rows_(sheet).filter(function(r){return r.id===rosterId_(cls,seat);})[0];
    if(!hit)throw new Error('名單中沒有 '+cls+' '+seat+' 號。');
    sheet.deleteRow(hit.row);return {cls:cls,seat:seat};
  });
}
