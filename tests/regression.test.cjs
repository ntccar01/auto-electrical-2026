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
