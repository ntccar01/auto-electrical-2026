const {test}=require('node:test');const assert=require('node:assert/strict');const {makeGAS,grade}=require('./gas-helpers.cjs');
function send(h,records){return h.ctx.importRecords(JSON.stringify({version:1,records}));}
test('GAS: every public operation rejects anonymous and unauthorized users before accessing sheets',()=>{
 for(const email of ['', 'student@example.invalid']) {
  const h=makeGAS();h.setEmail(email);
  for(const [method,args] of [['doGet',[]],['listRecords',[]],['importRecords',['{}']],['adjustRecord',['R-one',1,'test']],['approveRecord',['R-one']],['issueCertificate',['TEST_A','1','115-1']],['verifyCertificate',['NTC-1']]])assert.throws(()=>h.ctx[method](...args),/無教師權限/);
  assert.equal(h.sheetAccess(),0);
 }
 const h=makeGAS();h.properties.delete('TEACHER_EMAILS');assert.throws(()=>h.ctx.listRecords(),/無教師權限/);
});
test('GAS: imports are idempotent, preserve zero and do not trust client names, adjustments or approval',()=>{
 const h=makeGAS(),r=grade('R-zero',0);r.name='PRIVATE_NAME';r.approved={code:'FORGED'};r.adjust={delta:10};
 assert.equal(send(h,[r,r]).imported,1);assert.equal(send(h,[r]).duplicates,1);
 const saved=h.ctx.listRecords()[0];assert.equal(saved.summary.score,0);assert.equal(saved.approved,undefined);assert.equal(saved.adjust,undefined);assert.ok(!JSON.stringify(saved).includes('PRIVATE_NAME'));
});
test('GAS: invalid score/identity rejects the whole batch before writing',()=>{
 for(const bad of [grade('R-bad',101),{...grade(),cls:'=IMPORTXML(1)'},{...grade(),seat:'0'},{...grade(),unit:'unknown'}]) {
  const h=makeGAS();assert.throws(()=>send(h,[grade('R-good'),bad]));assert.equal(h.sheetAccess(),0);
 }
});
test('GAS: separate submissions sharing sid can be adjusted and approved independently',()=>{
 const h=makeGAS();send(h,[grade('R-first'),grade('R-second')]);
 h.ctx.adjustRecord('R-second',5,'review');h.ctx.approveRecord('R-second');
 const rows=h.ctx.listRecords();assert.equal(rows[0].adjust,undefined);assert.equal(rows[0].approved,undefined);assert.equal(rows[1].adjust.delta,5);assert.equal(rows[1].approved.teacher,'teacher@example.invalid');
 assert.throws(()=>h.ctx.adjustRecord('R-second',1,'changed'),/鎖定/);
 assert.throws(()=>h.ctx.adjustRecord('R-first',11,'changed'),/整數/);
});
test('GAS: certificates require server approval, use opaque unique IDs, signed snapshots and masked verification',()=>{
 const h=makeGAS();send(h,[grade('R-first',100)]);
 assert.throws(()=>h.ctx.issueCertificate('TEST_A','1','115-1'),/尚無已核章/);
 h.ctx.adjustRecord('R-first',10,'review');h.ctx.approveRecord('R-first');
 const a=h.ctx.issueCertificate('TEST_A','1','115-1'),b=h.ctx.issueCertificate('TEST_A','1','115-1');assert.notEqual(a.certId,b.certId);assert.ok(!a.certId.includes('TEST_A'));assert.equal(a.records[0].total,100);
 const check=h.ctx.verifyCertificate(a.certId);assert.equal(check.valid,true);assert.equal(check.cls,'T＊＊');assert.equal(check.seat,'＊＊');
 const sheet=h.sheets.get('NTC_Certificates');const stored=JSON.parse(sheet.data[1][1]);stored.payload=stored.payload.replace('TEST_A','TEST_B');sheet.data[1][1]=JSON.stringify(stored);
 assert.equal(h.ctx.verifyCertificate(a.certId).valid,false);assert.equal(h.ctx.verifyCertificate('NTC-unknown').valid,false);
});

test('GAS: certificates cannot include a different semester',()=>{
 const h=makeGAS();const a=grade('R-term1'),b=grade('R-term2');b.semester='115-2';send(h,[a,b]);h.ctx.approveRecord(a.recordId);h.ctx.approveRecord(b.recordId);
 const cert=h.ctx.issueCertificate('TEST_A','1','115-1');assert.equal(cert.records.length,1);assert.equal(cert.records[0].recordId,'R-term1');
});
