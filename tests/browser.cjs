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
      const box=await page.locator('#igStBtn').boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      assert.equal(await page.locator('#crankAmps').textContent(),'180');
      await page.mouse.up();assert.equal(await page.locator('#crankAmps').textContent(),'0');
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
    if(unit==='start')assert.equal(await page.locator('#repairBtn').isVisible(),false);
    const sid=await page.evaluate(()=>NTC_LOG.session.id);
    await page.locator('#submitAnswerBtn').click();
    const fault=await page.evaluate(()=>window.__NTC_LAST_ITEM.faults[0]);
    await page.locator(`input[name="diagnosis"][value="${fault}"]`).check();await page.locator('#confirmSubmitBtn').click();
    assert.ok((await page.locator('#resultDetails').textContent()).includes('初評'));
    let rows=await page.evaluate(()=>NTC_LOG.history());assert.equal(rows.at(-1).sid,sid);assert.equal(rows.at(-1).summary.pass,true);assert.ok(!('name' in rows.at(-1)));
    const downloadPromise=page.waitForEvent('download');await page.locator('.btn-download').click();const download=await downloadPromise;await download.saveAs(path.join(output,`${unit}-grade.csv`));
    const csv=fs.readFileSync(path.join(output,`${unit}-grade.csv`),'utf8');assert.ok(!csv.includes('姓名'));assert.ok(csv.includes('TEST_A'));
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
  await cp.exposeFunction('gasCall',(method,args)=>{assert.ok(['listRecords','importRecords','adjustRecord','approveRecord','issueCertificate','verifyCertificate'].includes(method));return gas.ctx[method](...args);});
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
  await cp.locator('#verify').click();await cp.waitForFunction(()=>document.getElementById('verification').textContent.includes('雲端查驗通過'));
  assert.ok(!(await cp.locator('#verification').textContent()).includes('TEST_A'));
  await cp.screenshot({path:path.join(output,'cloud-teacher-local.png'),fullPage:true});await cp.close();
  console.log('PASS cloud teacher UI with local GAS mocks: import, review, approval, signed certificate and masked verification');

  // Touch context: tablet layout and actual Pointer Events via touchscreen taps.
  const touch=await browser.newContext({viewport:{width:1024,height:1366},hasTouch:true,isMobile:true});const tp=await touch.newPage();
  tp.on('pageerror',e=>errors.push(e.message));await tp.goto(base+'/units/start/');await tp.getByRole('button',{name:'🔨 進入練習模式'}).tap();
  await tp.locator('.conn-point[data-id="bat_pos"]').tap();await tp.locator('.conn-point[data-id="fuse_in"]').tap();assert.equal(await tp.locator('.wire').count(),1);
  const circuitBox=await tp.locator('#circuitSvg').boundingBox();assert.ok(circuitBox.x>=0 && circuitBox.x+circuitBox.width<=1024);
  await tp.screenshot({path:path.join(output,'tablet-start.png'),fullPage:true});
  await tp.setViewportSize({width:390,height:844});const mobileBox=await tp.locator('#circuitSvg').boundingBox();assert.ok(mobileBox.x>=0 && mobileBox.x+mobileBox.width<=390);
  await tp.screenshot({path:path.join(output,'mobile-start.png'),fullPage:true});await touch.close();
  console.log('PASS tablet touch wiring');
  assert.deepEqual(errors,[]);console.log('ALL BROWSER CHECKS PASSED');await context.close();
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});
