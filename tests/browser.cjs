// Requires Playwright and an installed Microsoft Edge. Uses a fresh, isolated profile.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {root, START_WIRES, HORN_WIRES} = require('./helpers.cjs');
const output=path.join(root,'test-results');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  let rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.resolve(root,'.'+rel);
  if((file!==root&&!file.startsWith(root+path.sep))||rel.includes('/.git')||rel.includes('/電子書/')) {res.writeHead(403);return res.end();}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();}else{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);}});
});
let browser;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true});
  await context.route('**/*',route=>route.request().url().startsWith(base) ? route.continue() : route.abort());
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(base+'/');assert.equal(await page.locator('a.unit-card').count(),2);
  console.log('PASS portal');
  await page.getByRole('link',{name:'📖 專案開發導覽（進度／歷程／連結）'}).click();
  assert.equal(await page.locator('#features article').count(),7);assert.equal(await page.locator('#timeline .event').count(),await page.evaluate(()=>PROJECT_GUIDE.timeline.length));
  const guideLinks=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>a.getAttribute('href')).filter(h=>!h.startsWith('#')&&!h.startsWith('http')));
  for(const link of guideLinks){assert.equal((await context.request.get(base+'/'+link)).status(),200,link);}
  await page.locator('#studentUrl').fill('https://example.com/exec');await page.locator('#linkSettings button[type=submit]').click();assert.ok((await page.locator('#savedStatus').innerText()).includes('請使用'));
  await page.locator('#studentUrl').fill('https://script.google.com/macros/s/TEST_DEPLOYMENT/exec');await page.locator('#linkSettings button[type=submit]').click();assert.equal(await page.locator('#studentCloud').getAttribute('href'),'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec?page=verify');await page.reload();assert.equal(await page.locator('#studentCloud').isVisible(),true);await page.locator('#clearUrl').click();assert.equal(await page.locator('#studentCloud').isVisible(),false);
  await page.screenshot({path:path.join(output,'project-guide.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,'project-guide-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1080});
  console.log('PASS development guide links, local URL setting, persistence and mobile layout');

  for(const [unit,wires] of [['start',START_WIRES],['horn',HORN_WIRES]]) {
    await page.goto(`${base}/units/${unit}/`);
    await page.getByRole('button',{name:'🔨 進入練習模式'}).click();
    for(const [a,b] of wires) {
      await page.locator(`.conn-point[data-id="${a}"]`).click({force:true});
      await page.locator(`.conn-point[data-id="${b}"]`).click({force:true});
    }
    assert.equal(await page.locator('.wire').count(),wires.length);
    assert.equal(await page.evaluate(()=>ASSESS.checkWiring().score10),10);
    if(unit==='start') {
      await page.evaluate(()=>{
        probeState.red.jack='volts';probeState.black.jack='com';
        probeContact.red='fuse_in';probeContact.black='fuse_out';setMode(4);
      });
      assert.equal(await page.locator('#meter-display').textContent(),'LIVE');
      await page.locator('#meterSafety').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>NTC_LOG.count('unsafe_resistance')),1);
      const wireCount=await page.locator('.wire').count();
      await page.locator('#isolatePowerBtn').click();
      assert.match(await page.locator('#batteryStatus').textContent(),/已拆離/);
      assert.equal(await page.locator('.wire').count(),wireCount);
      assert.equal(await page.locator('#meter-display').textContent(),'0.1');
      assert.equal(await page.locator('#meterSafety').isVisible(),false);
      await page.screenshot({path:path.join(output,'start-battery-disconnected.png'),fullPage:true});
      await page.locator('#isolatePowerBtn').click();
      assert.equal(await page.locator('#meter-display').textContent(),'LIVE');
      await page.screenshot({path:path.join(output,'start-live-resistance-warning.png'),fullPage:true});
      await page.evaluate(()=>setMode(0));
      assert.equal(await page.locator('#igStBtn').isDisabled(),true);
      await page.locator('#igOnBtn').click();
      const box=await page.locator('#igStBtn').boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      assert.equal(await page.locator('#crankAmps').textContent(),'180');
      assert.equal(await page.locator('.wire').nth(4).getAttribute('data-flow-direction'),'forward');
      assert.equal(await page.locator('.wire').nth(4).evaluate(el=>getComputedStyle(el).animationDirection),'normal');
      assert.equal(await page.locator('.wire').nth(7).getAttribute('data-flow-direction'),'forward');
      assert.equal(await page.locator('#sol_pull').getAttribute('data-flow-direction'),'none');
      await page.evaluate(()=>{
        connections=connections.map(connection=>({...connection,start:connection.end,end:connection.start,points:[...connection.points].reverse()}));
        renderWires();runSimulation();
      });
      assert.equal(await page.locator('.wire').nth(4).getAttribute('data-flow-direction'),'reverse');
      assert.equal(await page.locator('.wire').nth(4).evaluate(el=>getComputedStyle(el).animationDirection),'reverse');
      assert.equal(await page.locator('.wire').nth(7).getAttribute('data-flow-direction'),'reverse');
      assert.equal(await page.locator('.wire').nth(6).getAttribute('data-flow-direction'),'reverse');
      await page.screenshot({path:path.join(output,'start-flow-reversed-drawing.png'),fullPage:true});
      await page.evaluate(()=>{faultState.bm='Fail';runSimulation();});
      assert.equal(await page.locator('.wire').nth(4).getAttribute('data-flow-direction'),'none');
      assert.equal(await page.locator('#sol_pull').getAttribute('data-flow-direction'),'forward');
      await page.evaluate(()=>{
        faultState.bm='Normal';
        connections=connections.map(connection=>({...connection,start:connection.end,end:connection.start,points:[...connection.points].reverse()}));
        renderWires();runSimulation();
      });

      assert.equal(await page.locator('#pinionGear').evaluate(el=>getComputedStyle(el).animationName),'motVibe');
      assert.equal(await page.locator('#motSpin').getAttribute('visibility'),'visible');
      await page.mouse.up();assert.equal(await page.locator('#crankAmps').textContent(),'0');
      assert.equal(await page.locator('#igPosText').textContent(),'IG');
      assert.equal(await page.locator('#pinionGear').evaluate(el=>getComputedStyle(el).animationName),'none');
      await page.evaluate(()=>{faultState.battB='Open';runSimulation();});
      await page.mouse.down();
      assert.match(await page.locator('#statusMsg').textContent(),/馬達未搖轉/);
      assert.equal(await page.locator('#pinionGear').getAttribute('visibility'),'visible');
      assert.equal(await page.locator('#pinionGear').evaluate(el=>getComputedStyle(el).animationName),'none');
      assert.equal(await page.locator('#motSpin').getAttribute('visibility'),'hidden');
      await page.screenshot({path:path.join(output,'start-engaged-not-cranking.png'),fullPage:true});
      await page.mouse.up();
      await page.evaluate(()=>{faultState.battB='Normal';runSimulation();});
    }
    await page.locator('#oemBtn').click();
    await page.locator('#oemTabDiagram img').waitFor({state:'visible'});
    assert.ok(await page.locator('#oemTabDiagram img').evaluate(img=>img.complete&&img.naturalWidth>0));
    await page.locator('button[onclick="OEM.toggle(false)"]').click();
    const tip=page.locator('#tip-red-obj');const before=await tip.getAttribute('transform');const b=await tip.boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+35,b.y+b.height/2+25,{steps:5});await page.mouse.up();
    assert.notEqual(await tip.getAttribute('transform'),before);
    await page.screenshot({path:path.join(output,`${unit}-practice.png`),fullPage:true});
    await page.locator('#deleteWireBtn').click();
    const pos=await page.locator('.wire').first().evaluate(w=>{const pts=w.points;const p=w.ownerSVGElement.createSVGPoint();p.x=(pts[0].x+pts[1].x)/2;p.y=(pts[0].y+pts[1].y)/2;const q=p.matrixTransform(w.getScreenCTM());return {x:q.x,y:q.y};});
    await page.mouse.click(pos.x,pos.y);assert.equal(await page.locator('.wire').count(),wires.length-1);
    await page.locator('#deleteWireBtn').click();
    page.once('dialog',d=>d.accept());await page.locator('#clearBtn').click();assert.equal(await page.locator('.wire').count(),0);
    console.log(`PASS ${unit} practice wiring, score, OEM, probe drag, delete and clear`);
    await page.reload();
    await page.getByRole('button',{name:'📝 進入考評模式'}).click();
    assert.equal(await page.locator('#inputName').count(),0);
    await page.locator('#inputClass').fill('TEST_A');await page.locator('#inputSeat').fill('1');
    await page.getByRole('button',{name:'開始考評'}).click();
    assert.equal(await page.locator('#faultPanel').isVisible(),false);
    await page.locator('#oemBtn').click();
    await page.locator('#oemTabDiagram img').waitFor({state:'visible'});
    await page.locator('#oemFloat [data-tab=values]').click();
    assert.match(await page.locator('#oemTabValues').textContent(),/教學.*參考值/);
    if(unit==='start'){
      const values=await page.locator('#oemTabValues').textContent();
      assert.ok(values.includes('1.5 Ω') && values.includes('P／N') && values.includes('180 A'));
    }
    await page.screenshot({path:path.join(output,unit+'-exam-reference.png'),fullPage:true});
    await page.locator('button[onclick="OEM.toggle(false)"]').click();
    if(unit==='start'){assert.equal(await page.locator('#repairBtn').isVisible(),false);assert.equal(await page.locator('#benchBtn').isVisible(),false);}
    const sid=await page.evaluate(()=>NTC_LOG.session.id);
    await page.locator('#submitAnswerBtn').click();
    const fault=await page.evaluate(()=>window.__NTC_LAST_ITEM.faults[0]);
    await page.locator(`input[name="diagnosis"][value="${fault}"]`).check();await page.locator('#confirmSubmitBtn').click();
    assert.ok((await page.locator('#resultDetails').textContent()).includes('初評'));
    let rows=await page.evaluate(()=>NTC_LOG.history());assert.equal(rows.at(-1).sid,sid);
    // 2026-11-11 及格門檻：只答對、未配線未量測 → 診斷正確但不及格，且不公布答案
    assert.equal(rows.at(-1).summary.pass,false);assert.equal(rows.at(-1).summary.diagnosisCorrect,true);assert.ok(!('name' in rows.at(-1)));
    assert.ok((await page.locator('#resultTitle').textContent()).includes('未達及格門檻'));assert.ok(!(await page.locator('#resultDetails').textContent()).includes('正確答案：'));
    // 成績檔：考評下載會詢問 6 碼代碼；此處不輸入代碼（空白→確認），應得到「未簽章」檔且不含正確答案
    const csvDialog=d=>d.accept(d.type()==='prompt'?'':undefined);page.on('dialog',csvDialog);
    const downloadPromise=page.waitForEvent('download');await page.locator('.btn-download').click();const download=await downloadPromise;await download.saveAs(path.join(output,`${unit}-grade.csv`));page.off('dialog',csvDialog);
    const csv=fs.readFileSync(path.join(output,`${unit}-grade.csv`),'utf8');assert.ok(!csv.includes('姓名'));assert.ok(csv.includes('TEST_A'));assert.ok(csv.includes('未簽章'));assert.ok(csv.startsWith('\uFEFF班級代號,座號'));
    const jsonDownload=page.waitForEvent('download');await page.locator('.btn-upload').click();const json=await jsonDownload;await json.saveAs(path.join(output,`${unit}-submission.json`));
    const submission=JSON.parse(fs.readFileSync(path.join(output,`${unit}-submission.json`),'utf8'));assert.equal(submission.records.length,1);assert.equal(submission.records[0].recordId,rows.at(-1).recordId);assert.ok(!JSON.stringify(submission).includes('name'));
    // Submit again through the real UI to ensure records can be reviewed independently.
    await page.locator('#resultModal').evaluate(el=>el.classList.add('hidden'));
    await page.locator('#submitAnswerBtn').click();await page.locator(`input[name="diagnosis"][value="${fault}"]`).check();await page.locator('#confirmSubmitBtn').click();
    rows=await page.evaluate(()=>NTC_LOG.history());assert.equal(rows.at(-1).sid,rows.at(-2).sid);assert.notEqual(rows.at(-1).recordId,rows.at(-2).recordId);
    console.log(`PASS ${unit} exam, repeated submission, local history, CSV and cloud submission export`);
  }
  await page.goto(base+'/teacher.html');
  assert.equal(await page.locator('#gradeTable tbody tr').count(),4);
  await page.locator('#unitPick input[data-unit="horn"]').uncheck();assert.equal(await page.locator('#gradeTable tbody tr').count(),2);
  await page.getByRole('button',{name:'篩選',exact:true}).click();assert.equal(await page.locator('#unitPick input[data-unit="horn"]').isChecked(),false);
  // The two start rows deliberately share one sid. Editing the second must not touch the first.
  let prompts=['5','browser test'];page.on('dialog',async d=>{await d.accept(prompts.shift()||'TEST_TEACHER');});
  await page.locator('#gradeTable tbody tr').nth(1).getByRole('button',{name:'調分',exact:true}).click();
  let history=await page.evaluate(()=>NTC_LOG.history());assert.equal(history[0].adjust,undefined);assert.equal(history[1].adjust.delta,5);
  await page.locator('#gradeTable tbody tr').nth(1).getByRole('button',{name:'核章',exact:true}).click();
  history=await page.evaluate(()=>NTC_LOG.history());assert.equal(history[0].approved,undefined);assert.equal(history[1].approved.code,'TEST_TEACHER');
  await page.locator('#certCls').fill('TEST_A');await page.locator('#certSeat').fill('1');
  await page.getByRole('button',{name:'產生總證預覽'}).click();
  assert.ok((await page.locator('#certBox').textContent()).includes('TEST_A'));
  await page.getByRole('button',{name:'核章發證'}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ntc-cert-v1')||'[]').length===1);
  const cert=await page.evaluate(()=>JSON.parse(localStorage.getItem('ntc-cert-v1'))[0]);assert.ok(!('name'in cert));
  await page.screenshot({path:path.join(output,'teacher.png'),fullPage:true});
  await page.goto(`${base}/verify.html?id=${encodeURIComponent(cert.certId)}`);
  const msg=await page.locator('#vmsg').textContent();assert.ok(msg.includes('尚未經雲端查驗'));assert.ok(!msg.includes('TEST_A'));assert.ok(!msg.includes('驗證通過'));
  console.log('PASS teacher filtering, targeted adjustment/approval, certificate preview/issue and masked lookup');
  await page.goto(base+'/teacher.html');
  const bulkPromise=page.waitForEvent('download');await page.getByRole('button',{name:'匯出雲端提交檔',exact:true}).click();const bulk=await bulkPromise;await bulk.saveAs(path.join(output,'teacher-submissions.json'));
  const payload=JSON.parse(fs.readFileSync(path.join(output,'teacher-submissions.json'),'utf8'));assert.equal(payload.records.length,4);assert.ok(payload.records.every(r=>!r.approved&&!r.adjust&&!r.name));
  // Real cloud page + real GAS functions, with Google services replaced by local mocks.
  const {makeGAS}=require('./gas-helpers.cjs');const gas=makeGAS();
  const cp=await context.newPage();cp.setDefaultTimeout(10000);cp.on('pageerror',e=>errors.push(e.message));
  await cp.exposeFunction('gasCall',(method,args)=>{assert.ok(['listRecords','importRecords','adjustRecord','approveRecord','issueCertificate','verifyCertificate','getStudentVerifyUrl','verifyStudentCertificate','issueInterviewReport','verifyInterviewReport'].includes(method));return gas.ctx[method](...args);});
  await cp.addInitScript(()=>{function chain(){let success=()=>{},failure=()=>{};let proxy;proxy=new Proxy({}, {get(_,key){if(key==='withSuccessHandler')return fn=>{success=fn;return proxy;};if(key==='withFailureHandler')return fn=>{failure=fn;return proxy;};return (...args)=>window.gasCall(key,args).then(success).catch(failure);}});return proxy;}window.google={script:{get run(){return chain();}}};});
  await cp.goto(base+'/gas/Teacher.html');
  await cp.locator('#importSemester').fill('115-1');await cp.locator('#file').setInputFiles(path.join(output,'start-submission.json'));await cp.locator('#importBtn').click();
  await cp.waitForFunction(()=>document.querySelectorAll('#rows tr').length===1&&!document.getElementById('refresh').disabled);
  let cloudPrompts=['5','cloud browser review'];cp.on('dialog',d=>d.accept(cloudPrompts.shift()||''));
  await cp.getByRole('button',{name:'調分',exact:true}).click();await cp.waitForFunction(()=>!document.getElementById('refresh').disabled);
  assert.equal(gas.ctx.listRecords()[0].adjust.delta,5);
  await cp.getByRole('button',{name:'覆閱並核章',exact:true}).click();await cp.waitForFunction(()=>document.querySelector('#rows').textContent.includes('已核章'));
  await cp.locator('#cls').fill('TEST_A');await cp.locator('#seat').fill('1');await cp.locator('#semester').fill('115-1');await cp.locator('#issue').click();
  await cp.waitForFunction(()=>document.getElementById('certId').value.startsWith('NTC-')&&!document.getElementById('verify').disabled);
  const cloudCertId=await cp.locator('#certId').inputValue();
  await cp.waitForFunction(()=>document.getElementById('studentLink').value.includes('?page=verify&id=')&&!document.getElementById('copyStudentLink').disabled);
  const studentLink=await cp.locator('#studentLink').inputValue();assert.ok(studentLink.endsWith('?page=verify&id='+encodeURIComponent(cloudCertId)));
  await cp.locator('#verify').click();await cp.waitForFunction(()=>document.getElementById('verification').textContent.includes('雲端查驗通過'));
  assert.ok(!(await cp.locator('#verification').textContent()).includes('TEST_A'));
  await cp.screenshot({path:path.join(output,'cloud-teacher-local.png'),fullPage:true});
  await cp.locator('#reportConsent').check();await cp.locator('#issueReport').click();await cp.waitForFunction(()=>document.getElementById('reportLink').value.includes('page=interview'));
  const reportLink=await cp.locator('#reportLink').inputValue(),reportId=new URL(reportLink).searchParams.get('id');
  await cp.goto(base+'/gas/InterviewReport.html?id='+reportId);await cp.waitForFunction(()=>document.getElementById('status').textContent.includes('查驗通過'));
  assert.ok((await cp.locator('#facts').innerText()).includes('TEST_A'));assert.equal(await cp.locator('#records tr').count(),1);await cp.emulateMedia({media:'print'});assert.equal(await cp.locator('#report').isVisible(),true);await cp.screenshot({path:path.join(output,'interview-report.png'),fullPage:true});await cp.emulateMedia({media:'screen'});
  await cp.goto(base+'/gas/StudentVerify.html?id='+encodeURIComponent(cloudCertId));await cp.getByRole('button',{name:'查驗證書'}).click();
  await cp.waitForFunction(()=>document.getElementById('status').textContent.includes('查驗通過'));
  const studentCard=await cp.locator('#certificate').innerText();assert.ok(studentCard.includes('T＊＊'));assert.ok(studentCard.includes('＊＊'));assert.ok(studentCard.includes('115-1'));assert.ok(!studentCard.includes('TEST_A'));
  assert.equal(await cp.locator('#certificate dd').count(),6);assert.equal(await cp.locator('#printBtn').isVisible(),true);await cp.screenshot({path:path.join(output,'cloud-student-certificate.png'),fullPage:true});
  await cp.locator('#certId').fill('NTC-unknown');await cp.getByRole('button',{name:'查驗證書'}).click();await cp.waitForFunction(()=>document.getElementById('status').textContent.includes('查無有效證書'));
  await cp.close();
  console.log('PASS cloud teacher and student certificate pages with local GAS mocks: issue, share link, masked verification and print view');


  for(const [id,guided] of [['START-C-01',true],['START-C-01',false],['START-C-02',false],['START-C-03',false]]) {
    const c=await context.newPage();c.on('pageerror',e=>errors.push(e.message));
    await c.goto(base+'/units/start/');
    await c.evaluate(id=>{const item=START_BANK.getById(id);START_BANK.assignFault=()=>({configId:id,faultId:item.faults[0],item});},id);
    if(guided){
      await c.getByRole('button',{name:'🔨 進入練習模式'}).click();
      await c.locator('#guidedRepairBtn').click();
      assert.match(await c.locator('#repairGuide').textContent(),/①/);
      for(const width of [1440,390]){
        await c.setViewportSize({width,height:1080});
        const guideBox=await c.locator('#repairGuide').boundingBox();
        const controlsBox=await c.locator('.start-controls').boundingBox();
        assert.ok(guideBox.height>0);
        assert.ok(guideBox.y+guideBox.height<=controlsBox.y);
        assert.equal(await c.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        await c.screenshot({path:path.join(output,'start-guided-layout-'+width+'.png'),fullPage:true});
      }
      await c.setViewportSize({width:1440,height:1080});

    } else {
      await c.getByRole('button',{name:'📝 進入考評模式'}).click();await c.locator('#inputClass').fill('TEST_C');await c.locator('#inputSeat').fill('1');await c.locator('#inputLevel').selectOption('challenge');await c.getByRole('button',{name:'開始考評'}).click();
    }
    assert.equal(await c.locator('#repairBtn').isVisible(),true);
    for(const [a,b] of START_WIRES){await c.locator(`.conn-point[data-id="${a}"]`).click({force:true});await c.locator(`.conn-point[data-id="${b}"]`).click({force:true});}
      if(id==='START-C-01'){
        // Exercise the real meter recorder with fixed probes, then take fresh readings after repair.
        await c.evaluate(()=>{probeState.red.jack='volts';probeState.black.jack='com';});
        if(guided){
          await c.evaluate(()=>{igPos='IG';probeContact.red='fuse_in';probeContact.black='bat_neg';setMode(2);});
          await c.evaluate(()=>{probeContact.red='fuse_out';runSimulation();});
          assert.match(await c.locator('#repairGuide').textContent(),/②/);
        }
        await c.evaluate(()=>{igPos='OFF';runSimulation();});
        await c.locator('#isolatePowerBtn').click();
        await c.evaluate(()=>{probeContact.red='fuse_in';probeContact.black='fuse_out';setMode(2);});
        await c.evaluate(()=>setMode(4));
        assert.equal(await c.locator('#meter-display').textContent(),'1 .');
        if(guided) assert.match(await c.locator('#repairGuide').textContent(),/③/);
        await c.locator('#repairBtn').click();
        await c.locator('#repairDiagnosis').selectOption('ns_open');
        await c.locator('input[name=rep][value=ns]').check();
        await c.getByRole('button',{name:'確認更換',exact:true}).click();
        assert.match(await c.locator('#repairMsg').textContent(),/上游供電/);
        await c.locator('#repairDiagnosis').selectOption('fuse_open');
        await c.locator('input[name=rep][value=fuse]').check();
        await c.getByRole('button',{name:'確認更換',exact:true}).click();
        assert.match(await c.locator('#repairMsg').textContent(),/維修成功/);
        await c.locator('#repairDiagnosis').selectOption('ns_open');
        await c.locator('input[name=rep][value=ns]').check();
        await c.getByRole('button',{name:'確認更換',exact:true}).click();
        assert.match(await c.locator('#repairMsg').textContent(),/重新比較/);
        await c.locator('#cancelRepairBtn').click();
        await c.locator('#isolatePowerBtn').click();
        await c.evaluate(()=>{probeContact.red='ns_in';probeContact.black='bat_neg';setMode(2);});
        await c.locator('#igOnBtn').click();
        const start=await c.locator('#igStBtn').boundingBox();
        await c.mouse.move(start.x+start.width/2,start.y+start.height/2);
        await c.mouse.down();
        assert.equal(await c.locator('#meter-display').textContent(),'12.00');
        await c.evaluate(()=>{probeContact.red='ns_out';runSimulation();});
        assert.equal(await c.locator('#meter-display').textContent(),'0.00');
        await c.mouse.up();
        await c.locator('#repairBtn').click();
        await c.locator('#repairDiagnosis').selectOption('ns_open');
        await c.locator('input[name=rep][value=ns]').check();
        await c.getByRole('button',{name:'確認更換',exact:true}).click();
        assert.match(await c.locator('#repairMsg').textContent(),/維修成功/);
      } else {
    await c.locator('#repairBtn').click();assert.ok(!(await c.locator('#repairStages').innerText()).includes('保險絲斷路'));
    const stages=await c.evaluate(()=>__NTC_LAST_ITEM.stages);if(id==='START-C-03')stages.reverse();
    for(const stage of stages){
      await c.locator('#repairDiagnosis').selectOption(stage.fault);await c.locator(`input[name=rep][value="${stage.repair}"]`).check();
      await c.getByRole('button',{name:'確認更換',exact:true}).click();assert.ok((await c.locator('#repairMsg').innerText()).includes('先完成'));
      // Feed a probe event using the real circuit solver; physical dragging is covered above.
      await c.evaluate(fault=>{const rule=repairEvidenceRules[fault],pair=rule.pairs[0];igPos=rule.kind==='voltage'?'ST':'OFF';runSimulation();NTC_LOG.log('probe_measure',{red:pair[0],black:pair[1],mode:rule.kind==='voltage'?'DCV':'Ω',ignition:igPos,gear:gearPos,pressed:igPos==='ST',valid:true,reading:String(rule.kind==='voltage'?CircuitEngine.getVoltageAtNode(pair[0],true,window.__bmMech)-CircuitEngine.getVoltageAtNode(pair[1],true,window.__bmMech):CircuitEngine.getResistance(pair[0],pair[1]))});},stage.fault);
      await c.getByRole('button',{name:'確認更換',exact:true}).click();assert.ok((await c.locator('#repairMsg').innerText()).includes('維修成功'));
    }
    }
    await c.locator('#cancelRepairBtn').click();await c.locator('#igOffBtn').click();await c.locator('#igOnBtn').click();const box=await c.locator('#igStBtn').boundingBox();await c.mouse.move(box.x+box.width/2,box.y+box.height/2);await c.mouse.down();assert.equal(await c.locator('#crankAmps').innerText(),'180');await c.mouse.up();
    if(guided){assert.match(await c.locator('#repairGuide').textContent(),/完成引導查修/);await c.close();continue;}
    await c.locator('#submitAnswerBtn').click();await c.locator('#confirmSubmitBtn').click();assert.ok((await c.locator('#resultTitle').innerText()).includes('診斷正確'));assert.ok((await c.locator('#resultDetails').innerText()).includes('100 分'));await c.screenshot({path:path.join(output,id+'.png'),fullPage:true});await c.close();
  }
  console.log('PASS start C three challenge cases: evidence gate, staged repair, restored cranking and 100-point scoring');


  for(const id of ['HORN-C-01','HORN-C-02','HORN-C-03','HORN-C-04']){
    const horn=await context.newPage();horn.on('pageerror',e=>errors.push(e.message));
    await horn.goto(base+'/units/horn/');
    await horn.evaluate(id=>{
      const item=HORN_BANK.getById(id);
      HORN_BANK.assignFault=()=>({configId:id,faultId:item.faults[0],item});
    },id);
    await horn.getByRole('button',{name:'📝 進入考評模式'}).click();
    await horn.locator('#inputClass').fill('TEST_HORN');await horn.locator('#inputSeat').fill('1');
    await horn.locator('#inputPaper').selectOption('A');
    await horn.locator('#inputLevel').selectOption('challenge');
    await horn.getByRole('button',{name:'開始考評'}).click();
    for(const [a,b] of HORN_WIRES){
      await horn.locator('.conn-point[data-id="'+a+'"]').click({force:true});
      await horn.locator('.conn-point[data-id="'+b+'"]').click({force:true});
    }
    const faultsSet=await horn.evaluate(()=>__NTC_LAST_ITEM.faults.every(fault=>{
      const [field,value]=FAULT_PICK_MAP[fault];return faultState[field]===value;
    }));
    assert.equal(faultsSet,true);
    async function checkHornButton(upper,lower){
      await horn.locator('#btn-hitbox').scrollIntoViewIfNeeded();
      const box=await horn.locator('#btn-hitbox').boundingBox();
      await horn.mouse.move(box.x+box.width/2,box.y+box.height/2);await horn.mouse.down();
      assert.equal(await horn.locator('#horn1').evaluate(el=>el.classList.contains('honking')),upper);
      assert.equal(await horn.locator('#horn2').evaluate(el=>el.classList.contains('honking')),lower);
      await horn.mouse.up();
    }
    await checkHornButton(false,false);
    const evidence=await horn.evaluate(()=>__NTC_LAST_ITEM.evidencePoints.slice(0,2));
    await horn.locator('#submitAnswerBtn').click();
    await horn.locator('input[name=mdiag][value=normal]').check();
    for(const node of evidence) await horn.locator('input[name=mevd][value="'+node+'"]').check();
    assert.equal(await horn.evaluate(()=>evaluateMulti().pass),false);
    await horn.locator('#cancelSubmitBtn').click();
    const stages=await horn.evaluate(()=>__NTC_LAST_ITEM.stages);
    if(id==='HORN-C-04') stages.reverse();
    for(const [index,stage] of stages.entries()){
      await horn.locator('#repairBtn').click();
      await horn.locator('input[name=rep][value="'+stage.repair+'"]').check();
      await horn.getByRole('button',{name:'確認更換',exact:true}).click();
      assert.match(await horn.locator('#repairMsg').textContent(),/維修成功/);
      await horn.locator('#cancelRepairBtn').click();
      const upper=index===stages.length-1||id==='HORN-C-01';
      const lower=index===stages.length-1||id==='HORN-C-03'||id==='HORN-C-04';
      await checkHornButton(upper,lower);
    }
    // 2026-11-11 及格門檻：複合題也要有實際的電壓與電阻量測紀錄
    await horn.evaluate(ev=>{probeState.red.jack='volts';probeState.black.jack='com';probeContact.red=ev[0];probeContact.black='bat_neg';setMode(2);runSimulation();probeContact.red='horn1_in';probeContact.black='horn1_gnd';setMode(4);runSimulation();},evidence);
    await horn.locator('#submitAnswerBtn').click();
    for(const node of evidence) await horn.locator('input[name=mevd][value="'+node+'"]').check();
    await horn.locator('#confirmSubmitBtn').click();
    assert.match(await horn.locator('#resultTitle').textContent(),/診斷正確/);
    const last=await horn.evaluate(()=>NTC_LOG.history().at(-1));
    assert.equal(last.summary.pass,true);assert.equal(last.faultConfigId,id);
    await horn.close();
  }
  console.log('PASS horn A-paper C four cases: login faults, staged faults, repair restoration and correct submission');

  const host=await context.newPage();
  await host.goto(base+'/units/start/');
  await host.getByRole('button',{name:'🔨 進入練習模式'}).click();
  host.once('dialog',dialog=>{assert.match(dialog.message(),/拆離電瓶負極/);dialog.accept();});
  await host.locator('#benchBtn').click();
  await host.locator('#isolatePowerBtn').click();
  const original=await host.evaluate(()=>JSON.stringify({faultState,connections,repairPowerIsolated}));
  await host.evaluate(()=>{faultState.bm='Fail';});
  const popup=host.waitForEvent('popup');
  await host.locator('#benchBtn').click();
  const bench=await popup;bench.on('pageerror',e=>errors.push(e.message));await bench.waitForLoadState();
  assert.equal(await bench.locator('#scenario').inputValue(),'fail');
  await bench.locator('#recordClass').fill('TEST_BENCH');await bench.locator('#recordSeat').fill('7');
  await bench.locator('#mode').selectOption('resistance');
  for(const scenario of ['normal','fail']){
    await bench.locator('#scenario').selectOption(scenario);
    assert.equal(await bench.locator('#reading').textContent(),'OL');
    const b=await bench.locator('#manual').boundingBox();
    await bench.mouse.move(b.x+b.width/2,b.y+b.height/2);await bench.mouse.down();
    assert.equal(await bench.locator('#reading').textContent(),scenario==='normal'?'0.01 Ω':'OL');
    await bench.mouse.up();
    assert.match(await bench.locator('#records li').last().textContent(),/手動推動/);
  }
  await bench.locator('#power').click();
  assert.equal(await bench.locator('#reading').textContent(),'LIVE');
  assert.equal(await bench.locator('#record').isDisabled(),true);
  await bench.locator('#mode').selectOption('voltage');
  for(const [scenario,reading] of [['normal','0.08 V'],['fail','6.86 V']]){
    await bench.locator('#scenario').selectOption(scenario);
    const b=await bench.locator('#coil').boundingBox();
    await bench.mouse.move(b.x+b.width/2,b.y+b.height/2);await bench.mouse.down();
    assert.equal(await bench.locator('#reading').textContent(),reading);
    await bench.mouse.up();assert.match(await bench.locator('#motion').textContent(),/回位/);
  }

  await bench.locator('#scenario').selectOption('hold_open');
  const holdButton=await bench.locator('#coil').boundingBox();
  await bench.mouse.move(holdButton.x+holdButton.width/2,holdButton.y+holdButton.height/2);
  await bench.mouse.down();
  await bench.waitForFunction(()=>document.getElementById('motion').dataset.engaged==='true');
  assert.equal(await bench.locator('#reading').textContent(),'0.08 V');
  const engagedGear=await bench.locator('#pinion').getAttribute('transform');
  await bench.waitForFunction(()=>document.getElementById('motion').dataset.engaged==='false');
  assert.equal(await bench.locator('#reading').textContent(),'6.86 V');
  assert.notEqual(await bench.locator('#pinion').getAttribute('transform'),engagedGear);
  await bench.waitForFunction(()=>document.getElementById('motion').dataset.engaged==='true');
  await bench.screenshot({path:path.join(output,'start-bench-hold-failure.png'),fullPage:true});
  await bench.mouse.up();
  assert.equal(await bench.evaluate(()=>chatterTimer),null);
  assert.match(await bench.locator('#motion').textContent(),/回位/);
  await bench.locator('#coil').focus();await bench.keyboard.down('Space');
  await bench.evaluate(()=>window.dispatchEvent(new Event('pointercancel')));
  await bench.keyboard.up('Space');
  assert.equal(await bench.evaluate(()=>chatterTimer),null);
  await bench.locator('#power').click();
  await bench.locator('#mode').selectOption('resistance');
  await bench.locator('#red').selectOption('ST');
  await bench.locator('#black').selectOption('G');
  assert.equal(await bench.locator('#reading').textContent(),'OL');
  await bench.locator('#black').selectOption('M');
  assert.equal(await bench.locator('#reading').textContent(),'2.0 Ω');
  await bench.locator('#red').selectOption('B');
  const manualHold=await bench.locator('#manual').boundingBox();
  await bench.mouse.move(manualHold.x+manualHold.width/2,manualHold.y+manualHold.height/2);await bench.mouse.down();
  assert.equal(await bench.locator('#reading').textContent(),'0.01 Ω');
  await bench.mouse.up();
  await bench.locator('#scenario').selectOption('normal');
  await bench.locator('#red').selectOption('ST');await bench.locator('#black').selectOption('G');
  assert.equal(await bench.locator('#reading').textContent(),'30.0 Ω');

  await bench.locator('#scenario').selectOption('high_resistance');
  await bench.locator('#red').selectOption('B');await bench.locator('#black').selectOption('M');
  assert.equal(await bench.locator('#reading').textContent(),'OL');
  const highManual=await bench.locator('#manual').boundingBox();
  await bench.mouse.move(highManual.x+highManual.width/2,highManual.y+highManual.height/2);await bench.mouse.down();
  assert.equal(await bench.locator('#reading').textContent(),'3.0 Ω');
  await bench.mouse.up();
  await bench.locator('#power').click();
  assert.equal(await bench.locator('#reading').textContent(),'LIVE');
  await bench.locator('#mode').selectOption('voltage');
  const highCoil=await bench.locator('#coil').boundingBox();
  await bench.mouse.move(highCoil.x+highCoil.width/2,highCoil.y+highCoil.height/2);await bench.mouse.down();
  assert.equal(await bench.locator('#reading').textContent(),'5.33 V');
  assert.equal(await bench.locator('#loadCurrent').textContent(),'4.44 A');
  assert.equal(await bench.locator('#contactCurrent').textContent(),'1.78 A');
  assert.match(await bench.locator('#loadStatus').textContent(),/慢轉/);
  assert.equal(await bench.locator('#motorRotor').evaluate(el=>getComputedStyle(el).animationName),'benchMotorRotation');
  const slowPeriod=await bench.locator('#motorRotor').evaluate(el=>parseFloat(getComputedStyle(el).animationDuration));
  const circuit=await bench.evaluate(()=>{
    const nodes=benchVoltages(),drop=nodes.B-nodes.M;
    return {drop,loadVoltage:nodes.M,contactCurrent:drop/contactResistance(),pullCurrent:(nodes.ST-nodes.M)/pullResistance,loadCurrent:nodes.M/loadResistance};
  });
  assert.ok(Math.abs(circuit.drop+circuit.loadVoltage-12)<1e-9);
  assert.ok(Math.abs(circuit.contactCurrent+circuit.pullCurrent-circuit.loadCurrent)<1e-9);
  assert.ok(Math.abs(circuit.drop/circuit.contactCurrent-3)<1e-9);
  await bench.screenshot({path:path.join(output,'start-bench-high-resistance.png'),fullPage:true});
  await bench.mouse.up();
  assert.match(await bench.locator('#records li').last().textContent(),/5.33 V/);
  assert.equal(await bench.locator('#motorRotor').evaluate(el=>getComputedStyle(el).animationName),'none');
  await bench.locator('#scenario').selectOption('normal');
  await bench.mouse.move(highCoil.x+highCoil.width/2,highCoil.y+highCoil.height/2);await bench.mouse.down();
  assert.equal(await bench.locator('#reading').textContent(),'0.08 V');
  assert.equal(await bench.locator('#loadCurrent').textContent(),'7.95 A');
  assert.ok(await bench.locator('#motorRotor').evaluate(el=>parseFloat(getComputedStyle(el).animationDuration))<slowPeriod);
  await bench.mouse.up();
  await bench.locator('#scenario').selectOption('high_resistance');

  const recordedBefore=await bench.locator('#records li').count();
  const firstEntry=await bench.evaluate(()=>({...measurements[0]}));
  await bench.locator('#recordClass').fill('TEST_OTHER');
  await bench.locator('#recordSeat').fill('8');
  await bench.locator('#record').click();
  assert.equal(await bench.evaluate(()=>measurements[0].classCode),'TEST_BENCH');
  assert.equal(await bench.evaluate(()=>measurements.at(-1).classCode),'TEST_OTHER');
  assert.equal(await bench.locator('#records li').count(),recordedBefore+1);
  bench.once('dialog',dialog=>{assert.match(dialog.message(),/下載記錄 CSV/);dialog.dismiss();});
  await bench.locator('#clearRecords').click();
  assert.equal(await bench.locator('#records li').count(),recordedBefore+1);
  const csvDownload=bench.waitForEvent('download');
  await bench.locator('#downloadRecords').click();
  const benchDownload=await csvDownload;
  assert.match(benchDownload.suggestedFilename(),/^start-bench-records-.*\.csv$/);
  const benchCsvPath=path.join(output,'start-bench-records.csv');
  await benchDownload.saveAs(benchCsvPath);
  const benchCsv=fs.readFileSync(benchCsvPath,'utf8');
  assert.equal(benchCsv.charCodeAt(0),0xfeff);
  assert.ok(benchCsv.includes('"班級代號","座號"'));
  assert.ok(benchCsv.includes('"TEST_BENCH","7"'));
  assert.ok(benchCsv.includes('"TEST_OTHER","8"'));
  assert.ok(benchCsv.includes('"Asia/Taipei"'));
  assert.ok(benchCsv.includes(firstEntry.timestamp));
  assert.ok(benchCsv.includes(firstEntry.localTime));
  assert.ok(benchCsv.includes('START-BENCH-V4'));
  assert.ok(benchCsv.includes('5.33 V')&&benchCsv.includes('3.0 Ω'));
  assert.equal(benchCsv.replace(/^\uFEFF/,'').trimEnd().split('\r\n').length,recordedBefore+2);
  assert.equal(await bench.evaluate(()=>csvCell('=1+1')),'"\'=1+1"');
  const downloadCount=await bench.locator('#records li').count();
  bench.once('dialog',dialog=>{assert.match(dialog.message(),/無法復原/);dialog.accept();});
  await bench.locator('#clearRecords').click();
  assert.equal(await bench.locator('#records li').count(),0);
  assert.equal(await bench.evaluate(()=>measurements.length),0);
  assert.equal(await bench.locator('#downloadRecords').isDisabled(),true);
  assert.equal(await bench.locator('#clearRecords').isDisabled(),true);
  await bench.locator('#record').click();
  assert.equal(await bench.locator('#records li').count(),1);
  assert.ok(await bench.evaluate(()=>measurements[0].number)>downloadCount);
  assert.equal(await bench.locator('#downloadRecords').isDisabled(),false);
  await bench.screenshot({path:path.join(output,'start-bench-desktop.png'),fullPage:true});
  await bench.setViewportSize({width:390,height:844});
  assert.equal(await bench.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await bench.screenshot({path:path.join(output,'start-bench-mobile.png'),fullPage:true});await bench.close();
  await host.evaluate(()=>{faultState.bm='Normal';});
  assert.equal(await host.evaluate(()=>JSON.stringify({faultState,connections,repairPowerIsolated})),original);
  await host.close();
  const preset=await context.newPage();
  for(const scenario of ['hold_open','high_resistance']){
    await preset.goto(base+'/units/start/bench.html?contact='+scenario);
    assert.equal(await preset.locator('#scenario').inputValue(),scenario);
  }
  await preset.close();

  console.log('PASS practice bench: isolation, mechanical contact, powered voltage drop, safety, mobile and host state');

  // Touch context: tablet layout and actual Pointer Events via touchscreen taps.
  const touch=await browser.newContext({viewport:{width:1024,height:1366},hasTouch:true,isMobile:true});const tp=await touch.newPage();
  tp.on('pageerror',e=>errors.push(e.message));await tp.goto(base+'/units/start/');await tp.getByRole('button',{name:'🔨 進入練習模式'}).tap();
  await tp.locator('.conn-point[data-id="bat_pos"]').tap();await tp.locator('.conn-point[data-id="fuse_in"]').tap();assert.equal(await tp.locator('.wire').count(),1);
  const circuitBox=await tp.locator('#circuitSvg').boundingBox();assert.ok(circuitBox.x>=0 && circuitBox.x+circuitBox.width<=1024);
  await tp.screenshot({path:path.join(output,'tablet-start.png'),fullPage:true});
  await tp.setViewportSize({width:390,height:844});const mobileBox=await tp.locator('#circuitSvg').boundingBox();assert.ok(mobileBox.x>=0 && mobileBox.x+mobileBox.width<=390);
  await tp.screenshot({path:path.join(output,'mobile-start.png'),fullPage:true});await touch.close();
  console.log('PASS tablet touch wiring');
  // 2026-11-11 成績檔：老師產生代碼 → 學生通過考評後輸入代碼下載 → 老師檢查（驗證通過／內容被修改）並匯入
  {
    const {makeGAS}=require('./gas-helpers.cjs');const g2=makeGAS();
    const tp=await context.newPage();tp.on('pageerror',e=>errors.push(e.message));
    await tp.exposeFunction('gasCall',(method,args)=>{assert.ok(['listRecords','createRoster','resetCode','listRoster','previewCsv','importCsv'].includes(method));return g2.ctx[method](...args);});
    await tp.addInitScript(()=>{function chain(){let success=()=>{},failure=()=>{};let proxy;proxy=new Proxy({}, {get(_,key){if(key==='withSuccessHandler')return fn=>{success=fn;return proxy;};if(key==='withFailureHandler')return fn=>{failure=fn;return proxy;};return (...args)=>window.gasCall(key,args).then(success).catch(failure);}});return proxy;}window.google={script:{get run(){return chain();}}};});
    await tp.goto(base+'/gas/Teacher.html');
    await tp.locator('#rosterCls').fill('TEST_CSV');await tp.locator('#rosterFrom').fill('1');await tp.locator('#rosterTo').fill('3');await tp.locator('#rosterCreate').click();
    await tp.waitForFunction(()=>document.querySelectorAll('.slip').length===3);
    const code=await tp.locator('.slip b').first().textContent();assert.match(code,/^[A-Z2-9]{6}$/);
    assert.ok(!JSON.stringify(g2.sheets.get('NTC_Roster').data).includes(code));
    await tp.locator('#slipSection').screenshot({path:path.join(output,'roster-slips.png')});
    const sp=await context.newPage();sp.on('pageerror',e=>errors.push(e.message));
    const typed=['WRONG1',code.toLowerCase()];sp.on('dialog',d=>d.accept(d.type()==='prompt'?typed.shift():undefined));
    await sp.goto(base+'/units/horn/');await sp.getByRole('button',{name:'📝 進入考評模式'}).click();
    await sp.locator('#inputClass').fill('TEST_CSV');await sp.locator('#inputSeat').fill('1');await sp.locator('#inputLevel').selectOption('standard');await sp.getByRole('button',{name:'開始考評'}).click();
    for(const [a,b] of HORN_WIRES){await sp.locator('.conn-point[data-id="'+a+'"]').click({force:true});await sp.locator('.conn-point[data-id="'+b+'"]').click({force:true});}
    await sp.evaluate(()=>{probeState.red.jack='volts';probeState.black.jack='com';for(const m of [['fuse_out','bat_neg',2],['relay_87','bat_neg',2],['horn1_in','horn1_gnd',4]]){probeContact.red=m[0];probeContact.black=m[1];setMode(m[2]);runSimulation();}});
    await sp.locator('#submitAnswerBtn').click();
    const answer=await sp.evaluate(()=>currentActiveFault);await sp.locator('input[name="diagnosis"][value="'+answer+'"]').check();await sp.locator('#confirmSubmitBtn').click();
    assert.match(await sp.locator('#resultTitle').textContent(),/通過！診斷正確/);assert.ok((await sp.locator('#resultDetails').textContent()).includes('正確答案：'));
    const dl=sp.waitForEvent('download');await sp.locator('.btn-download').click();const file=path.join(output,'csv-signed.csv');await (await dl).saveAs(file);
    const txt=fs.readFileSync(file,'utf8');assert.ok(!txt.includes('未簽章'));
    const data=txt.split('\r\n')[1].split(',').at(-2);const j=JSON.parse(Buffer.from(data,'base64').toString('utf8'));j.record.summary.score=1;
    const edited=path.join(output,'csv-edited.csv');fs.writeFileSync(edited,txt.replace(data,Buffer.from(JSON.stringify(j)).toString('base64')));
    await tp.locator('#csvFiles').setInputFiles([file,edited]);await tp.locator('#csvPreview').click();
    await tp.waitForFunction(()=>document.querySelectorAll('#csvRows tr').length===2);
    assert.deepEqual(await tp.$$eval('#csvRows tr td:last-child',t=>t.map(x=>x.textContent)),['驗證通過','內容被修改']);
    await tp.locator('#csvImport').click();await tp.waitForFunction(()=>document.querySelectorAll('#rows tr').length===1);
    assert.ok((await tp.locator('#rows tr').first().innerText()).includes('✅ 驗證通過'));
    const saved=g2.ctx.listRecords();assert.equal(saved.length,1);assert.equal(saved[0].verify,'ok');assert.notEqual(saved[0].summary.score,1);
    await tp.screenshot({path:path.join(output,'teacher-csv-import.png'),fullPage:true});await tp.close();await sp.close();
    console.log('PASS roster codes, signed student CSV, tamper detection and teacher CSV import');
  }
  assert.deepEqual(errors,[]);console.log('ALL BROWSER CHECKS PASSED');await context.close();
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});
