const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { app, makeContext, wire, START_WIRES, HORN_WIRES, root } = require('./helpers.cjs');
for (const [unit,pairs] of [['start',START_WIRES],['horn',HORN_WIRES]]) {
  test(`${unit}: empty, complete and every missing wire stay within score bounds`, () => {
    const h = app(unit);
    assert.equal(h.ctx.ASSESS.checkWiring().score10,0);
    wire(h,pairs);
    const full = h.ctx.ASSESS.checkWiring();
    assert.equal(full.score10,10); assert.equal(full.ok,full.total);
    for(let i=0;i<pairs.length;i++) {
      wire(h,pairs.filter((_,j) => i!==j));
      const r = h.ctx.ASSESS.checkWiring();
      assert.ok(r.score10>=0 && r.score10<10, `missing wire ${i} was rewarded as complete`);
      assert.ok(r.ok<=r.total);
    }
  });
  test(`${unit}: zero score survives the actual submission/archive path`, () => {
    const h=app(unit);
    h.ctx.ASSESS.score=()=>({total:0,parts:{}});
    h.run('lastResultData={isPass:false};finishSubmit();');
    assert.equal(h.ctx.NTC_LOG.history()[0].summary.score,0);
  });
}
test('Logger: every new exam and submission has an independent identity', () => {
  const h=app('start'); const log=h.ctx.NTC_LOG;
  const sid=log.session.id;
  const a=log.archive({score:0}), b=log.archive({score:75});
  assert.equal(a.sid,b.sid); assert.notEqual(a.recordId,b.recordId);
  log.log('probe_measure',{}); log.clear();
  assert.notEqual(log.session.id,sid); assert.equal(log.events.length,0); assert.equal(log.count('probe_measure'),0);
  assert.equal(log.session.student.cls,''); assert.equal(log.session.faultConfigId,'');
});
test('Logger: legacy repeated sid and duplicate record IDs migrate without dropping scores', () => {
  const rows=[{sid:'same',summary:{score:0}},{sid:'same',summary:{score:50}},{sid:'x',recordId:'duplicate'},{sid:'x',recordId:'duplicate'}];
  const h=makeContext({'ntc-history-v1':JSON.stringify(rows)}); h.load('shared/js/logger.js');
  const a=h.ctx.NTC_LOG.history(), b=h.ctx.NTC_LOG.history();
  assert.equal(a.length,4); assert.equal(new Set(a.map(x=>x.recordId)).size,4);
  assert.equal(a[0].summary.score,0); assert.deepEqual(a.map(x=>x.recordId),b.map(x=>x.recordId));
});
test('Logger: new sessions and history do not store student names', () => {
  const h=app('start'); h.ctx.NTC_LOG.setSession({student:{cls:'TEST',seat:'1',name:'PRIVATE_NAME'}});
  h.ctx.NTC_LOG.archive({score:60});
  assert.ok(!JSON.stringify(h.ctx.NTC_LOG.exportData()).includes('PRIVATE_NAME'));
  assert.ok(!JSON.stringify(h.ctx.NTC_LOG.history()).includes('PRIVATE_NAME'));
});
function startScenario({pairs=START_WIRES,ig='ST',gear='P',fault=null}={}) {
  const h=app('start');wire(h,pairs);
  h.run(`faultState=freshFaultState();${fault ? `faultState[${JSON.stringify(fault[0])}]=${JSON.stringify(fault[1])};` : ''}igPos=${JSON.stringify(ig)};gearPos=${JSON.stringify(gear)};runSimulation();`);
  return {bm:h.ctx.__bmMech,amps:Number(h.ctx.document.getElementById('crankAmps').textContent),h};
}
test('Start: healthy wiring cranks in P and N, while OFF/IG/R/D prevent cranking', () => {
  for(const gear of ['P','N']) assert.equal(startScenario({gear}).amps,180);
  for(const gear of ['R','D']) assert.equal(startScenario({gear}).bm,false);
  for(const ig of ['OFF','IG']) assert.equal(startScenario({ig}).amps,0);
});
test('Start: each control/ground interruption prevents pull-in', () => {
  for(const i of [0,1,2,3,5,6,7]) assert.equal(startScenario({pairs:START_WIRES.filter((_,j)=>j!==i)}).bm,false,`wire ${i}`);
  for(const fault of [['solHold','Open'],['solPull','Open'],['mot','Open'],['ns','Open'],['fuse','Open'],['wireA','Open'],['wireB','Open'],['wireC','Open']]) {
    assert.equal(startScenario({fault}).bm,false, fault[0]);
  }
});
test('Start: main power and B-M faults stop cranking but keep the control pull-in path', () => {
  for(const fault of [['battB','Open'],['bm','Fail']]) { const s=startScenario({fault});assert.equal(s.bm,true);assert.equal(s.amps,0); }
});
test('Start: model fault readings distinguish coils, motor and wiring', () => {
  for(const [fault,a,b] of [['solHold','sol_ST','sol_G'],['solPull','sol_ST','sol_M'],['mot','mot_M','mot_gnd']]) {
    const {h}=startScenario({fault:[fault,'Open']});
    assert.equal(h.run(`CircuitEngine.getResistance('${a}','${b}')`),-1);
  }
});
test('Tracked HTML local resources resolve and all JS parses', () => {
  function walk(dir) {for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if(['.git','node_modules','電子書','tmp'].includes(e.name))continue;
    const file=path.join(dir,e.name);
    if(e.isDirectory())walk(file);
    else if(file.endsWith('.js'))new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
    else if(file.endsWith('.html')) {
      const s=fs.readFileSync(file,'utf8');
      for(const m of s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1],{filename:file});
      for(const m of s.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const ref=m[1].split(/[?#]/)[0]; if(!ref||/^(?:https?:|data:|javascript:)/.test(ref))continue;
        assert.ok(fs.existsSync(path.resolve(path.dirname(file),ref)),`${file}: ${ref}`);
      }
    }
  }} walk(root);
});

test('Cloud export strips legacy identity and approval while preserving zero scores', () => {
  const h=makeContext(); h.load('shared/js/logger.js');
  const row={recordId:'R-1',sid:'S-1',unit:'horn',cls:'TEST',seat:'1',name:'PRIVATE_NAME',summary:{score:0,pass:false,parts:{'結果正確':0,name:'PRIVATE_NAME'}},approved:{code:'LOCAL_ONLY'},adjust:{delta:5}};
  const result=h.ctx.NTC_LOG.exportRecords([row]);
  assert.equal(result.records[0].summary.score,0);assert.ok(!JSON.stringify(result).includes('PRIVATE_NAME'));assert.ok(!JSON.stringify(result).includes('LOCAL_ONLY'));assert.equal(result.records[0].approved,undefined);assert.equal(result.records[0].adjust,undefined);
});

test('Start: backfeed voltages respect coil/motor resistance and disconnected grounds', () => {
  const healthy=startScenario().h;
  assert.equal(healthy.run("CircuitEngine.getVoltageAtNode('mot_M',true,true)"),12);
  assert.equal(healthy.run("CircuitEngine.getVoltageAtNode('mot_gnd',true,true)"),0);
  const fault=startScenario({fault:['bm','Fail']}).h;
  const v=fault.run("CircuitEngine.getVoltageAtNode('mot_M',true,true)");
  assert.ok(Math.abs(v-12*1.5/(2+1.5))<1e-8); // Not 12V from the main motor circuit.
  assert.ok(fault.run("CircuitEngine.getVoltageAtNode('sol_B',true,true)")-v>2.5);
  const missing=startScenario({pairs:START_WIRES.filter(p=>p[0]!=='mot_gnd')}).h;
  assert.ok(Math.abs(missing.run("CircuitEngine.getVoltageAtNode('mot_gnd',true,false)")-12)<1e-8);
  const motor=startScenario({fault:['mot','Open']}).h;
  assert.ok(Math.abs(motor.run("CircuitEngine.getVoltageAtNode('mot_M',true,false)")-12)<1e-8);
});

for(const id of ['START-C-01','START-C-02','START-C-03'])test('Start C: '+id+' evidence gates, staged repair and final cranking',()=>{
 const h=app('start');wire(h,START_WIRES);h.run(`window.__NTC_LAST_ITEM=START_BANK.getById('${id}');initRepairProgress(__NTC_LAST_ITEM);isAssessmentMode=true;`);
 assert.equal(h.run('stageHtml().includes(faultLabel(__NTC_LAST_ITEM.faults[0]))'),false);
 assert.equal(h.run('requestRepair(__NTC_LAST_ITEM.stages[0].repair,__NTC_LAST_ITEM.faults[0]).ok'),false);
 h.run("igPos='ST';runSimulation()");assert.notEqual(h.ctx.document.getElementById('crankAmps').textContent,180);
 // Motor must be diagnosed first in C-03; the other two orders are also exercised.
 const stages=Array.from(h.ctx.START_BANK.getById(id).stages);if(id==='START-C-03')stages.reverse();
 for(const stage of stages){
  h.run(`igPos='OFF';runSimulation();constRule=repairEvidenceRules['${stage.fault}'];NTC_LOG.log('probe_measure',{red:constRule.pairs[0][0],black:constRule.pairs[0][1],mode:constRule.kind==='voltage'?'DCV':'Ω',ignition:'OFF',gear:'P',pressed:constRule.kind==='voltage',valid:true,reading:'1 .'});`);
  if(id==='START-C-01' && stage.fault==='fuse_open'){
   h.run("NTC_LOG.log('probe_measure',{red:'fuse_in',black:'fuse_out',mode:'20V',isolated:true,valid:true,reading:'0.00'});NTC_LOG.log('probe_measure',{red:'fuse_in',black:'fuse_out',mode:'200Ω',ignition:'OFF',isolated:true,valid:true,reading:'1 .'})");
  }
  if(id==='START-C-01' && stage.fault==='ns_open'){
   h.run("for(const [red,reading] of [['ns_in','12.00'],['ns_out','0.00']]) NTC_LOG.log('probe_measure',{red,black:'bat_neg',mode:'20V',gear:'P',pressed:true,valid:true,reading})");
  }
  assert.equal(h.run(`requestRepair('${stage.repair}','${stage.fault}').ok`),true);
 }
 assert.equal(h.run('repairProgress.finalConfirmed'),false);h.run("igPos='OFF';runSimulation();igPos='ST';runSimulation()");assert.equal(h.ctx.document.getElementById('crankAmps').textContent,180);assert.equal(h.run('repairProgress.finalConfirmed'),true);
 const score=h.run('ASSESS.score({multi:true,configId:__NTC_LAST_ITEM.id,faultHits:2,evidenceStages:2,repairOk:2,repairMiss:0,finalConfirmed:true})');assert.equal(score.total,100);assert.equal(score.parts['用時'],undefined);
});

test('Start safety: OFF isolates control branch, battery disconnect isolates return, live resistance is blocked',()=>{
 const h=app('start');wire(h,START_WIRES);
 h.run("igPos='OFF';probeState.red.jack='volts';probeState.black.jack='com';probeContact.red='fuse_in';probeContact.black='fuse_out';setMode(4)");
 assert.match(h.ctx.document.getElementById('meterSafety').textContent,/帶電/);
 assert.equal(h.ctx.document.getElementById('meter-display').textContent,'LIVE');
 assert.equal(h.ctx.NTC_LOG.count('probe_measure'),0);
 assert.equal(h.ctx.NTC_LOG.count('unsafe_resistance'),1);
 h.run('updateMultimeterReading()');assert.equal(h.ctx.NTC_LOG.count('unsafe_resistance'),1);
 h.run("probeContact.red='ns_in';probeContact.black='ns_out';updateMultimeterReading()");
 assert.equal(h.ctx.document.getElementById('meterSafety').textContent,'');
 h.run("igPos='ST';runSimulation()");
 assert.match(h.ctx.document.getElementById('meterSafety').textContent,/帶電/);
 const wireCount=h.run('connections.length');
 h.run('toggleRepairPower()');
 assert.equal(h.run('connections.length'),wireCount);
 assert.equal(h.run("CircuitEngine.isConnected('mot_chassis','bat_neg',CircuitEngine.buildGraph(false,false))"),false);
 assert.equal(h.run("CircuitEngine.isConnected('mot_chassis','sol_chassis',CircuitEngine.buildGraph(false,false))"),true);
 h.run("probeContact.red='fuse_in';probeContact.black='fuse_out';updateMultimeterReading()");
 assert.equal(h.ctx.document.getElementById('meterSafety').textContent,'');
 assert.equal(h.ctx.document.getElementById('meter-display').textContent,'0.1');
 h.run("probeContact.red='bat_pos';probeContact.black='bat_neg';updateMultimeterReading()");
 assert.equal(h.ctx.document.getElementById('meter-display').textContent,'LIVE');
 h.run('setMode(2)');
 assert.equal(h.ctx.document.getElementById('meter-display').textContent,'12.00');
 h.run("igPos='ST';runSimulation()");
 assert.equal(h.ctx.document.getElementById('crankAmps').textContent,0);
 h.run("toggleRepairPower();igPos='ST';runSimulation()");
 assert.equal(h.ctx.document.getElementById('crankAmps').textContent,180);
});

test('Start flow: direction follows supply and ground for either drawing order, without changing meter voltages',()=>{
 for(const reversed of [false,true]){
  const h=app('start');
  wire(h,reversed?START_WIRES.map(([a,b])=>[b,a]):START_WIRES);
  h.run("igPos='ST';runSimulation()");
  assert.equal(h.ctx.document.getElementById('crankAmps').textContent,180);
  const voltage=node=>h.run("CircuitEngine.getVoltageAtNode('"+node+"',true,true,0.0001)");
  assert.ok(voltage('fuse_out')>voltage('sol_B'));
  assert.ok(voltage('mot_gnd')>voltage('mot_chassis'));
  assert.ok(voltage('sol_G')>voltage('sol_chassis'));
  assert.equal(h.run("CircuitEngine.getVoltageAtNode('sol_B',true,true)"),12);
  assert.equal(h.run("CircuitEngine.getVoltageAtNode('mot_M',true,true)"),12);
  h.run("faultState.bm='Fail';runSimulation()");
  const backfeed=h.run("CircuitEngine.getVoltageAtNode('sol_M',true,__bmMech)");
  assert.ok(Math.abs(backfeed-12*1.5/3.5)<1e-9);
 }
});

for(const id of ['HORN-C-01','HORN-C-02','HORN-C-03','HORN-C-04']){
 test('Horn C: '+id+' faults coexist, staged repairs preserve remaining faults and practice resets',()=>{
  const h=app('horn');wire(h,HORN_WIRES);
  h.run("isAssessmentMode=true;window.__NTC_LAST_ITEM=HORN_BANK.getById('"+id+"');initRepairProgress(__NTC_LAST_ITEM)");
  const stages=Array.from(h.ctx.HORN_BANK.getById(id).stages);
  if(id==='HORN-C-04') stages.reverse();
  for(const [index,stage] of stages.entries()){
   for(const remaining of stages.slice(index)){
    assert.equal(h.run("faultState[FAULT_PICK_MAP['"+remaining.fault+"'][0]]"),h.run("FAULT_PICK_MAP['"+remaining.fault+"'][1]"));
   }
   assert.equal(h.run("requestRepair('"+stage.repair+"').ok"),true);
  }
  assert.equal(h.run("Object.values(faultState).every(value=>value==='Normal')"),true);
  h.run("isButtonPressed=false;faultState.horn1='Open';choosePracticeMode()");
  assert.equal(h.run('repairProgress'),null);
  assert.equal(h.run("Object.values(faultState).every(value=>value==='Normal')"),true);
 });
}
for (const unit of ['horn','start']) {
  test(`${unit}: exam retakes keep counting after restart and failed exams hide the answer`, () => {
    let store = new Map();
    const ctx0 = {cls:'TEST_A',seat:'1',paper:'A',date:'2026-11-11'};
    const submit = (pick) => {
      const h = app(unit, Object.fromEntries(store));
      h.run(`isAssessmentMode=true;window.__NTC_LAST_CTX=${JSON.stringify(ctx0)};NTC_LOG.setSession({unit:'${unit}',mode:'exam',level:'standard'});currentActiveFault='fuse_open';`);
      h.run(`(function(){const isCorrect='${pick}'===currentActiveFault;const hideAnswer=isAssessmentMode&&!isCorrect;lastResultData={studentClass:'TEST_A',seatNumber:'1',multi:false,track:'S',correctFault:hideAnswer?'（通過後顯示）':'保險絲斷路',answerHidden:hideAnswer,isPass:isCorrect};finishSubmit({});})()`);
      store = h.store;
      return h.ctx.lastResultData ?? h.run('lastResultData');
    };
    const first = submit('normal');
    assert.equal(first.attemptNo, 1); assert.equal(first.score.parts['一次繳交'], 10);
    assert.equal(first.answerHidden, true); assert.equal(first.correctFault, '（通過後顯示）');
    const second = submit('fuse_open');
    assert.equal(second.attemptNo, 2, 'restart must not reset the attempt count');
    assert.equal(second.score.parts['一次繳交'], 5);
    assert.equal(second.answerHidden, false);
  });
}
test('Logger export keeps the start C functional-confirmation part', () => {
  const src = fs.readFileSync(path.join(root,'shared/js/logger.js'),'utf8');
  assert.ok(src.includes("'功能確認'"), 'exportRecords must include 功能確認');
});
test('start: a fault on a student wire (B main power) does not count the wire as missing', () => {
  const h = app('start'); wire(h, START_WIRES);
  h.run("faultState.battB='Open';");
  const w = h.ctx.ASSESS.checkWiring(); assert.equal(w.ok, w.total);
});
for (const unit of ['horn','start']) {
  test(`${unit}: pass gate needs diagnosis, complete wiring, valid V and Ω measurements and 60 points`, () => {
    const h = app(unit); const A = h.ctx.ASSESS, L = h.ctx.NTC_LOG;
    const r = (score, diag=true) => ({ diagnosisCorrect: diag, multi: false, score: { total: score } });
    assert.equal(A.passGate(r(100)).pass, false);
    wire(h, unit === 'horn' ? HORN_WIRES : START_WIRES);
    L.log('probe_measure', { red:'fuse_out', black:'bat_neg', mode:'20V', reading:'12.00', valid:true });
    assert.equal(A.passGate(r(100)).checks.measure, false, 'one voltage reading is not enough');
    L.log('probe_measure', { red:'fuse_in', black:'fuse_out', mode:'200Ω', reading:'0.1', valid:false });
    assert.equal(A.passGate(r(100)).checks.measure, false, 'wrong-jack readings are not valid');
    L.log('probe_measure', { red:'fuse_in', black:'fuse_out', mode:'200Ω', reading:'0.1', valid:true });
    assert.equal(A.passGate(r(100)).pass, true);
    assert.equal(A.passGate(r(59)).pass, false);
    assert.equal(A.passGate(r(100, false)).pass, false);
    assert.ok(A.passGate(r(100, false)).reasons.includes('診斷結果不正確'));
  });
}
