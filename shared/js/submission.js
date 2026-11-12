/* NTC 成績檔（學生下載後以通訊軟體交給老師，老師在雲端教師端匯入）2026-11-11
 *
 * 簽章契約（與 gas/Code.gs 必須一致，改動任一邊都要同步並跑 tests/gas.test.cjs）：
 *   代碼：6 碼，字元集 ALPHABET（排除易混淆的 0 O 1 I L），第 6 碼為前 5 碼的檢查碼。
 *   金鑰：pinKey = SHA-256 hex("NTC-PIN-v1|" + 班級代號 + "|" + 座號 + "|" + 代碼)
 *   資料：base64(UTF-8 JSON payload)
 *   驗證碼：HMAC-SHA256 hex(key = pinKey 字串, message = base64 資料字串)
 * 伺服器只保存 pinKey，不保存代碼原文。CSV 內可讀欄位僅供老師瀏覽，匯入時只採用簽章過的「資料」欄。
 */
window.NTC_SUBMIT = (function () {
  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var UNIT_NAMES = { horn: '喇叭', start: '起動' };
  var LEVEL_NAMES = { basic: '基礎', standard: '標準', challenge: '挑戰' };
  var HEADER = ['班級代號', '座號', '單元', '模式', '試卷', '難度', '繳交時間', '今日第幾次', '學生診斷', '是否通過', '總分', '分項', '紀錄ID', '資料', '驗證碼'];

  function normalizeCode(s) { return String(s || '').toUpperCase().replace(/[\s-]/g, ''); }
  function checkChar(body) {
    var sum = 0;
    for (var i = 0; i < body.length; i++) sum += (i + 1) * ALPHABET.indexOf(body[i]);
    return ALPHABET[sum % ALPHABET.length];
  }
  function validCode(code) {
    code = normalizeCode(code);
    if (code.length !== 6) return false;
    for (var i = 0; i < 6; i++) if (ALPHABET.indexOf(code[i]) < 0) return false;
    return checkChar(code.slice(0, 5)) === code[5];
  }

  function hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function utf8(s) { return new TextEncoder().encode(s); }
  function canSign() { return !!(window.crypto && crypto.subtle && window.TextEncoder); }
  async function pinKey(cls, seat, code) {
    return hex(await crypto.subtle.digest('SHA-256', utf8('NTC-PIN-v1|' + cls + '|' + seat + '|' + normalizeCode(code))));
  }
  async function sign(keyHex, message) {
    var key = await crypto.subtle.importKey('raw', utf8(keyHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', key, utf8(message)));
  }
  function base64Utf8(text) {
    var bytes = utf8(text), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  // 只放教師匯入需要的欄位；不含姓名、正確答案、本機調分或核章。
  function payloadOf(record, extra) {
    var s = record.summary || {};
    return { v: 1, kind: 'ntc-submission', record: {
      recordId: record.recordId, sid: record.sid, unit: record.unit || 'horn', mode: record.mode || '',
      cls: record.cls, seat: record.seat, semester: record.semester || '', paper: record.paper || '',
      faultConfigId: record.faultConfigId || '', level: s.level || '', attempt: s.attempt || 1,
      submittedAt: record.archivedAt || new Date().toISOString(),
      summary: { score: s.score, pass: !!s.pass, multi: !!s.multi, diagnosisCorrect: !!s.diagnosisCorrect, parts: s.parts || {} },
      diagnosis: (extra && extra.diagnosis) || ''
    } };
  }

  function cell(v) {
    var t = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(t)) t = "'" + t;               // 避免 Excel 公式注入
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function localStamp(iso, compact) {
    var d = new Date(iso);
    if (compact) return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  async function signed(record, extra, code) {
    var payload = payloadOf(record, extra), r = payload.record;
    var data = base64Utf8(JSON.stringify(payload));
    var sig = code ? await sign(await pinKey(r.cls, r.seat, code), data) : '';
    return { payload: payload, data: data, sig: sig };
  }

  async function buildCsv(record, extra, code) {
    var sp = await signed(record, extra, code), r = sp.payload.record, data = sp.data;
    var signature = code ? sp.sig : '未簽章';
    var parts = Object.keys(r.summary.parts).map(function (k) { return k + ' ' + r.summary.parts[k]; }).join('／');
    var row = [r.cls, r.seat, UNIT_NAMES[r.unit] || r.unit, r.mode === 'exam' ? '考評' : '練習', r.paper, LEVEL_NAMES[r.level] || r.level,
      localStamp(r.submittedAt), r.attempt, r.diagnosis, r.summary.pass ? '通過' : '未通過', r.summary.score, parts, r.recordId, data, signature];
    var filename = r.cls + '_' + r.seat + '號_' + (UNIT_NAMES[r.unit] || r.unit) + '_' + (r.paper ? r.paper + '卷_' : '') + localStamp(r.submittedAt, true) + '.csv';
    return { filename: filename, text: '﻿' + HEADER.map(cell).join(',') + '\r\n' + row.map(cell).join(',') + '\r\n', signed: !!code };
  }

  function save(file) {
    var blob = new Blob([file.text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = file.filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    // 延後移除與釋放，避免部分瀏覽器在下載開始前遺失檔名
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 30000);
  }

  // 詢問代碼：required 時不可留空。回傳 null 表示取消。
  function askCode(required) {
    for (;;) {
      var input = prompt('請輸入老師發給你的 6 碼代碼（大小寫都可以）。' + (required ? '' : '\n忘記代碼請問老師；若直接按「確定」，檔案會標示「未簽章」。'), '');
      if (input === null) return null;
      var code = normalizeCode(input);
      if (!code) {
        if (required) { alert('上傳成績需要代碼，忘記代碼請問老師。'); continue; }
        if (confirm('沒有輸入代碼，老師匯入時會顯示「未簽章」。確定要下載嗎？')) return '';
        continue;
      }
      if (validCode(code)) return code;
      alert('代碼好像打錯了，請再檢查一次。\n提醒：代碼不會出現 0、O、1、I、L。');
    }
  }

  // 學生端流程：輸入代碼（含檢查碼即時偵錯）→ 下載。取消則不下載。presetCode 可沿用剛輸入的代碼。
  async function downloadForTeacher(record, extra, presetCode) {
    if (!record) { alert('找不到本次繳交紀錄，請重新作答後再下載。'); return null; }
    var code = presetCode || '';
    if (record.mode === 'exam' && !presetCode) {
      if (!canSign()) {
        if (!confirm('這台裝置無法產生驗證碼，檔案會標示「未簽章」，老師需另外確認。仍要下載嗎？')) return null;
      } else {
        code = askCode(false);
        if (code === null) return null;
      }
    }
    var file = await buildCsv(record, extra, code);
    save(file);
    return file;
  }

  // 線上上傳（第 2 階段）：老師按下開放後才收件；失敗時可改下載成績檔。
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function post(url, body) {
    var last;
    for (var i = 0; i < 3; i++) {
      try {
        var res = await fetch(url, { method: 'POST', body: body }); // 字串 body → text/plain，免 CORS 預檢
        return await res.json();
      } catch (e) { last = e; await sleep(800 * (i + 1) + Math.random() * 600); }
    }
    throw last;
  }
  async function uploadOnline(record, extra) {
    var url = window.NTC_CONFIG && NTC_CONFIG.uploadUrl;
    if (!record) { alert('找不到本次繳交紀錄，請重新作答後再上傳。'); return null; }
    if (record.mode !== 'exam') { alert('練習模式的紀錄不需要上傳。'); return null; }
    if (!url) { alert('老師尚未設定線上上傳，請改用「下載成績檔」交給老師。'); return null; }
    if (!canSign()) { alert('這台裝置無法產生驗證碼，請改用「下載成績檔」交給老師。'); return null; }
    var code = askCode(true);
    if (code === null) return null;
    var sp = await signed(record, extra, code), res;
    try { res = await post(url, JSON.stringify({ data: sp.data, sig: sp.sig })); }
    catch (e) { res = { ok: false, code: 'network', message: '網路連線失敗。' }; }
    if (res.ok) { alert('✅ ' + res.message); return res; }
    var fallback = res.code === 'closed' || res.code === 'network' || res.code === 'error';
    if (fallback && confirm('❌ ' + res.message + '\n\n要改下載成績檔，用通訊軟體交給老師嗎？')) await downloadForTeacher(record, extra, code);
    else if (!fallback) alert('❌ ' + res.message);
    return res;
  }

  return { uploadOnline: uploadOnline, ALPHABET: ALPHABET, normalizeCode: normalizeCode, checkChar: checkChar, validCode: validCode,
    pinKey: pinKey, sign: sign, buildCsv: buildCsv, downloadForTeacher: downloadForTeacher, HEADER: HEADER };
})();
