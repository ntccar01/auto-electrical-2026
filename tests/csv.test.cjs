// 學生端成績檔（shared/js/submission.js）與雲端匯入（gas/Code.gs）的端對端契約測試。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeGAS } = require('./gas-helpers.cjs');

function client() {
  const ctx = { console, Date, JSON, Math, Object, Array, String, Number, Uint8Array, TextEncoder, btoa, crypto: globalThis.crypto };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/js/submission.js'), 'utf8'), ctx, { filename: 'submission.js' });
  return ctx.NTC_SUBMIT;
}
function record(over = {}) {
  return Object.assign({ recordId: 'R-csv-1', sid: 'S-csv', unit: 'horn', mode: 'exam', cls: '汽一甲', seat: '12', semester: '115-1', paper: 'A',
    faultConfigId: 'HORN-S-04', archivedAt: '2026-11-11T02:35:00.000Z',
    summary: { score: 78, pass: true, multi: false, attempt: 2, level: 'standard', diagnosisCorrect: true, parts: { '結果正確': 40, '一次繳交': 5 } } }, over);
}
const asFile = (f, name) => ({ name: name || f.filename, text: f.text });

test('codes: teacher-generated codes pass the client check digit and typos are caught', () => {
  const h = makeGAS(), S = client();
  const { created } = h.ctx.createRoster('汽一甲', 1, 40);
  assert.equal(created.length, 40);
  for (const c of created) { assert.match(c.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/); assert.equal(S.validCode(c.code), true); assert.equal(S.validCode(c.code.toLowerCase()), true); }
  const code = created[0].code, swapped = code.slice(0, 2) + (code[2] === 'A' ? 'B' : 'A') + code.slice(3);
  assert.equal(S.validCode(swapped), false);
  assert.equal(new Set(created.map(c => c.code)).size > 35, true, 'codes should be random');
  const stored = JSON.stringify([...h.sheets.get('NTC_Roster').data]);
  assert.ok(!stored.includes(code), 'roster must not store the code itself');
});

test('roster: creation skips existing seats, reset replaces the code, and all roster calls are teacher-only', () => {
  const h = makeGAS();
  const first = h.ctx.createRoster('汽一甲', 1, 3); const again = h.ctx.createRoster('汽一甲', 1, 5);
  assert.equal(again.created.length, 2); assert.deepEqual(Array.from(again.skipped), ['1', '2', '3']);
  const reset = h.ctx.resetCode('汽一甲', '2'); assert.notEqual(reset.code, first.created[1].code);
  assert.equal(h.ctx.listRoster('汽一甲').length, 5);
  assert.throws(() => h.ctx.createRoster('汽一甲', 1, 200), /最多/);
  h.setEmail('student@example.invalid');
  for (const [m, a] of [['createRoster', ['X', 1, 2]], ['resetCode', ['X', '1']], ['listRoster', ['X']], ['previewCsv', [[]]], ['importCsv', [[]]]]) assert.throws(() => h.ctx[m](...a), /無教師權限/);
});

test('csv: signed file verifies, edits are detected, wrong code fails, unsigned needs teacher opt-in, duplicates skip', async () => {
  const h = makeGAS(), S = client();
  const code = h.ctx.createRoster('汽一甲', 12, 12).created[0].code;
  const good = await S.buildCsv(record(), { diagnosis: '繼電器線圈斷路' }, code);
  assert.match(good.filename, /^汽一甲_12號_喇叭_A卷_\d{8}-\d{4}\.csv$/);
  assert.ok(good.text.startsWith('﻿班級代號,座號'));

  // 學生竄改「資料」欄中的分數 → 驗證失敗
  const tamperedText = (() => {
    const data = good.text.split('\r\n')[1].split(',').at(-2);
    const json = JSON.parse(Buffer.from(data, 'base64').toString('utf8')); json.record.summary.score = 100;
    return good.text.replace(data, Buffer.from(JSON.stringify(json)).toString('base64'));
  })();
  const wrongCode = await S.buildCsv(record({ recordId: 'R-csv-2' }), {}, code === 'ABCDEJ' ? 'ABCDEK' : 'ABCDEJ');
  const unsigned = await S.buildCsv(record({ recordId: 'R-csv-3' }), {}, '');
  const practice = await S.buildCsv(record({ recordId: 'R-csv-4', mode: 'practice' }), {}, code);
  const other = await S.buildCsv(record({ recordId: 'R-csv-5', seat: '13' }), {}, code); // 用自己的代碼簽別人的座號

  const files = [asFile(good), asFile({ filename: 'edited.csv', text: tamperedText }), asFile(wrongCode, 'wrong.csv'), asFile(unsigned, 'unsigned.csv'), asFile(practice, 'practice.csv'), asFile(other, 'other.csv'), { name: 'junk.csv', text: 'a,b\n1,2' }];
  const preview = h.ctx.previewCsv(files, '');
  assert.deepEqual(Array.from(preview, p => p.status), ['ok', 'tampered', 'tampered', 'unsigned', 'practice', 'noRoster', 'invalid']);
  assert.ok(preview.every(p => !('record' in p)));
  assert.equal(h.sheets.get('NTC_Grades').data.length, 1, 'preview must not write');

  const res = h.ctx.importCsv(files, '', false);
  assert.equal(res.imported, 1);
  let rows = h.ctx.listRecords();
  assert.equal(rows[0].recordId, 'R-csv-1'); assert.equal(rows[0].verify, 'ok'); assert.equal(rows[0].attempt, 2); assert.equal(rows[0].summary.score, 78);
  assert.equal(rows[0].approved, undefined);

  const res2 = h.ctx.importCsv(files, '', true);
  assert.equal(res2.counts.duplicate, 1); assert.equal(res2.imported, 2); // unsigned + noRoster
  rows = h.ctx.listRecords();
  assert.deepEqual(Array.from(rows, r => r.verify).sort(), ['noRoster', 'ok', 'unsigned']);
  assert.ok(!rows.some(r => r.recordId === 'R-csv-4'), 'practice records are never imported');
  assert.ok(!JSON.stringify(rows).includes('繼電器線圈斷路'), 'student diagnosis text is not stored');
});

test('csv: Excel-style quoting and formula guard survive the round trip', async () => {
  const h = makeGAS(), S = client();
  const code = h.ctx.createRoster('汽一甲', 12, 12).created[0].code;
  const f = await S.buildCsv(record(), { diagnosis: '=HYPERLINK("x"),含逗號' }, code);
  assert.ok(f.text.includes('"\'=HYPERLINK(""x""),含逗號"'));
  assert.equal(h.ctx.previewCsv([asFile(f)], '')[0].status, 'ok');
});

test('csv: editing the readable score column (e.g. in Excel) is flagged and never imported', async () => {
  const h = makeGAS(), S = client();
  const code = h.ctx.createRoster('汽一甲', 12, 12).created[0].code;
  const f = await S.buildCsv(record(), {}, code);
  const lines = f.text.split('\r\n'), cells = lines[1].split(','); cells[10] = '100'; // 總分 78 → 100
  const edited = { name: 'excel.csv', text: [lines[0], cells.join(','), ''].join('\r\n') };
  const p = h.ctx.previewCsv([edited], '')[0];
  assert.equal(p.status, 'readableEdited'); assert.equal(p.message, '總分'); assert.equal(p.score, 78);
  assert.equal(h.ctx.importCsv([edited], '', true).imported, 0);
});

test('roster: removing a seat invalidates its code but keeps grades', async () => {
  const h = makeGAS(), S = client();
  const code = h.ctx.createRoster('汽一甲', 11, 13).created[1].code;
  const f = await S.buildCsv(record(), {}, code);
  assert.equal(h.ctx.importCsv([asFile(f)], '', false).imported, 1);
  h.ctx.removeRosterSeat('汽一甲', '12');
  assert.deepEqual(Array.from(h.ctx.listRoster('汽一甲'), x => x.seat), ['11', '13']);
  assert.equal(h.ctx.listRecords().length, 1);
  const again = await S.buildCsv(record({ recordId: 'R-csv-9' }), {}, code);
  assert.equal(h.ctx.previewCsv([asFile(again)], '')[0].status, 'noRoster');
  assert.throws(() => h.ctx.removeRosterSeat('汽一甲', '12'), /沒有/);
  h.setEmail('student@example.invalid'); assert.throws(() => h.ctx.removeRosterSeat('汽一甲', '11'), /無教師權限/);
});

// ===== 第 2 階段：開放時段與線上上傳 =====
async function uploadBody(S, rec, code) {
  const f = await S.buildCsv(rec, {}, code);
  const cells = f.text.split('\r\n')[1].split(',');
  return JSON.stringify({ data: cells.at(-2), sig: cells.at(-1) });
}
const post = (h, body) => JSON.parse(h.ctx.doPost({ postData: { contents: body } }).text);

test('upload: only open classes accept, server counts attempts, duplicates are safe', async () => {
  const h = makeGAS(), S = client();
  const code = h.ctx.createRoster('汽一甲', 12, 12).created[0].code;
  const body1 = await uploadBody(S, record({ archivedAt: new Date().toISOString() }), code);
  assert.equal(post(h, body1).code, 'closed');
  h.ctx.openUpload('汽一甲', 50);
  assert.equal(h.ctx.uploadStatus()[0].cls, '汽一甲');
  const r1 = post(h, body1); assert.equal(r1.ok, true); assert.equal(r1.attempt, 1);
  assert.equal(post(h, body1).code, 'duplicate');
  const r2 = post(h, await uploadBody(S, record({ recordId: 'R-up-2', archivedAt: new Date().toISOString() }), code));
  assert.equal(r2.attempt, 2, 'attempts are counted on the server');
  const rows = h.ctx.listRecords(); assert.equal(rows.length, 2); assert.equal(rows[0].source, 'upload'); assert.equal(rows[0].verify, 'ok');
  h.ctx.closeUpload('汽一甲');
  assert.equal(post(h, await uploadBody(S, record({ recordId: 'R-up-3' }), code)).code, 'closed');
});

test('upload: wrong codes lock the seat after 5 tries; practice, junk and unsigned are rejected', async () => {
  const h = makeGAS(), S = client();
  const code = h.ctx.createRoster('汽一甲', 12, 12).created[0].code;
  h.ctx.openUpload('汽一甲', 50);
  const wrong = code === 'ABCDEJ' ? 'ABCDEK' : 'ABCDEJ';
  for (let i = 0; i < 5; i++) assert.equal(post(h, await uploadBody(S, record({ recordId: 'R-w' + i }), wrong)).code, 'auth');
  assert.equal(post(h, await uploadBody(S, record({ recordId: 'R-ok' }), code)).code, 'locked');
  h.cache.clear();
  assert.equal(post(h, await uploadBody(S, record({ recordId: 'R-ok' }), code)).ok, true);
  assert.equal(post(h, await uploadBody(S, record({ recordId: 'R-p', mode: 'practice' }), code)).code, 'practice');
  assert.equal(post(h, 'not json').code, 'bad');
  assert.equal(post(h, JSON.stringify({ data: 'abc', sig: '' })).code, 'bad');
  // 冒用別人座號：自己的代碼簽 13 號
  h.ctx.createRoster('汽一甲', 13, 13);
  assert.equal(post(h, await uploadBody(S, record({ recordId: 'R-x', seat: '13' }), code)).code, 'auth');
});

test('upload: open/close is teacher-only and time-limited', () => {
  const h = makeGAS();
  assert.throws(() => h.ctx.openUpload('汽一甲', 1), /5～240/);
  h.setEmail('student@example.invalid');
  for (const m of ['openUpload', 'closeUpload', 'uploadStatus']) assert.throws(() => h.ctx[m]('汽一甲', 50), /無教師權限/);
});
