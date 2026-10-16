/* V2-P0: extracted V52 logic + 2 patches (GAS config, hash assignment) */

        // 設定區：請填入您的 Google Apps Script 網址
        const TEACHER_GOOGLE_SCRIPT_URL = (window.NTC_CONFIG && window.NTC_CONFIG.gasUrl) || '';

        function openSetupGuide() {
            const w = window.open('', '_blank', 'width=800,height=600');
            const html = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>Google 試算表上傳設定教學</title><style>body { font-family: "Microsoft JhengHei", sans-serif; padding: 20px; line-height: 1.6; color: #333; } h2 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; } ol { padding-left: 20px; } li { margin-bottom: 10px; } code { background: #f1f1f1; padding: 2px 5px; border-radius: 3px; font-family: monospace; color: #e74c3c; } pre { background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 5px; overflow-x: auto; font-family: monospace; } .highlight { color: #f1c40f; font-weight: bold; }</style></head><body><h2>☁️ 如何設定成績上傳至 Google 試算表</h2><p>請依照以下步驟建立後端接收程式，完成後即可讓學生上傳考評結果。</p><ol><li>在 Google Drive 建立一個新的 <strong>Google 試算表</strong>。</li><li>在第一列建立標題：<code>時間</code>, <code>班級</code>, <code>姓名</code>, <code>座號</code>, <code>診斷結果</code>, <code>正確答案</code>, <code>是否通過</code>。</li><li>點擊上方選單 <strong>擴充功能 (Extensions)</strong> &gt; <strong>Apps Script</strong>。</li><li>將編輯器內的程式碼全部刪除，貼上以下代碼：</li></ol><pre>function doPost(e) { var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet(); var data = JSON.parse(e.postData.contents); var timestamp = new Date(); sheet.appendRow([ timestamp, data.studentClass, data.studentName, data.seatNumber, data.userDiagnosis, data.correctFault, data.isPass ? "通過" : "未通過" ]); return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);}</pre><ol start="5"><li>點擊右上角 <strong>部署 (Deploy)</strong> &gt; <strong>新增部署 (New deployment)</strong>。</li><li>點擊齒輪圖示 &gt; 選擇 <strong>網頁應用程式 (Web app)</strong>。</li><li><strong>⚠️ 關鍵設定：</strong><ul><li>執行身分 (Execute as)：<strong>我 (Me)</strong></li><li>誰可以存取 (Who has access)：<span class="highlight">任何人 (Anyone)</span> &lt;-- 務必選這個！</li></ul></li><li>點擊 <strong>部署</strong>，複製產生的 <strong>網頁應用程式網址 (Web App URL)</strong>。</li><li>回到本模擬器的程式碼中，找到最下方的 <code>const TEACHER_GOOGLE_SCRIPT_URL = '';</code>，將網址貼入單引號中。</li></ol><p>完成後，重新整理模擬器網頁，即可測試上傳功能。</p></body></html>`;
            w.document.write(html); w.document.close();
        }

        const faultOptions = [
            { id: 'normal', label: '電路功能正常' },
            { id: 'fuse_link_open', label: '易熔絲斷路' },
            { id: 'fuse_open', label: '保險絲斷路' },
            { id: 'relay_coil_open', label: '繼電器線圈斷路 (85-86)' },
            { id: 'relay_switch_fail', label: '繼電器開關接點故障 (30-87)' },
            { id: 'btn_open', label: '按鈕開關內部斷路' },
            { id: 'horn1_open', label: '上喇叭內部線圈斷路' },
            { id: 'horn2_open', label: '下喇叭內部線圈斷路' }
        ];
        
        let currentActiveFault = 'normal';
        let studentInfo = { class: '', name: '', seat: '' };
        let isAssessmentMode = false;
        let lastResultData = null;

        function choosePracticeMode() {
            isAssessmentMode = false;
            currentActiveFault = 'normal';
            document.getElementById('modeDisplay').textContent = "練習模式";
            document.getElementById('modeDisplay').className = "mode-indicator mode-practice";
            document.getElementById('studentDisplay').textContent = "自由練習";
            document.getElementById('faultBtn').classList.remove('hidden');
            document.getElementById('toExamBtn').classList.remove('hidden');
            document.getElementById('setupGuideBtn').classList.remove('hidden'); 
            document.getElementById('oemBtn').classList.remove('hidden');
            document.getElementById('submitAnswerBtn').classList.add('hidden');
            document.getElementById('repairBtn').classList.add('hidden');
            document.getElementById('toPracticeBtn').classList.add('hidden');
            document.getElementById('loginModal').classList.add('hidden');
            if (window.NTC_LOG) NTC_LOG.setSession({ mode: 'practice' });
            runSimulation();
        }

        function chooseExamMode() {
            document.getElementById('stepSelectMode').classList.add('hidden');
            document.getElementById('stepLogin').classList.remove('hidden');
        }

        function backToModeSelect() {
            document.getElementById('stepLogin').classList.add('hidden');
            document.getElementById('stepSelectMode').classList.remove('hidden');
        }

        function switchModeToExam() {
            if(confirm("確定要切換至考評模式嗎？這將清除目前的連線。")) {
                setModeUI(true);
                resetSimulation();
                document.getElementById('loginModal').classList.remove('hidden');
                document.getElementById('stepSelectMode').classList.add('hidden');
                document.getElementById('stepLogin').classList.remove('hidden');
            }
        }

        function switchModeToPractice() {
            if(confirm("確定要切換至練習模式嗎？這將放棄目前的進度。")) {
                resetSimulation();
                choosePracticeMode();
            }
        }

        function setModeUI(isExam) {
            isAssessmentMode = isExam;
            const faultPanel = document.getElementById('faultPanel');
            faultPanel.classList.remove('visible');
            // P0-hotfix：考評模式徹底隱藏教師故障面板並停用其下拉選單，
            // 避免學生誤以為要在左側作答（作答唯一入口為「繳交診斷報告」）。
            faultPanel.style.display = isExam ? 'none' : '';
            faultPanel.querySelectorAll('select, input, button').forEach(function (s) { s.disabled = isExam; });
            const faultBtn = document.getElementById('faultBtn');
            const submitBtn = document.getElementById('submitAnswerBtn');
            const toExamBtn = document.getElementById('toExamBtn');
            const toPracticeBtn = document.getElementById('toPracticeBtn');
            const guideBtn = document.getElementById('setupGuideBtn');

            const repairBtn = document.getElementById('repairBtn');
            if (isExam) {
                faultBtn.classList.add('hidden');
                toExamBtn.classList.add('hidden');
                guideBtn.classList.add('hidden');
                submitBtn.classList.remove('hidden');
                toPracticeBtn.classList.remove('hidden');
                repairBtn.classList.remove('hidden');
            } else {
                faultBtn.classList.remove('hidden');
                toExamBtn.classList.remove('hidden');
                guideBtn.classList.remove('hidden');
                submitBtn.classList.add('hidden');
                toPracticeBtn.classList.add('hidden');
                repairBtn.classList.add('hidden');
            }
            if (window.OEM) OEM.setExam(isExam);
        }

        function resetSimulation() {
            const wireLayer = document.getElementById('wire-layer');
            wireLayer.innerHTML = '';
            connections = [];
            isDrawing = false;
            currentPath = [];
            document.querySelectorAll('.conn-point.active').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.flowing').forEach(el => el.classList.remove('flowing'));
            runSimulation();
        }

        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            studentInfo.class = document.getElementById('inputClass').value;
            studentInfo.name = document.getElementById('inputName').value;
            studentInfo.seat = document.getElementById('inputSeat').value;
            const paperCode = document.getElementById('inputPaper').value;
            const levelCode = document.getElementById('inputLevel').value;
            const _pool = levelCode === 'challenge' ? { track: 'C' } : levelCode === 'standard' ? { track: 'S', levels: ['標準'] } : { track: 'S', levels: ['基礎'] };
            const _ctx = { cls: studentInfo.class, seat: studentInfo.seat, paper: paperCode,
                date: new Date().toISOString().slice(0,10) };
            
            if(!studentInfo.name) { alert("請輸入姓名"); return; }
            
            if (window.HORN_BANK && typeof window.HORN_BANK.assignFault === 'function') {
                const _asg = window.HORN_BANK.assignFault(_ctx, _pool);
                currentActiveFault = _asg.faultId;
                try { window.__NTC_LAST_ITEM = _asg.item; } catch (e) {}
                initRepairProgress(_asg.item);
                if (window.NTC_LOG) { NTC_LOG.clear(); NTC_LOG.setSession({ mode: 'exam', level: levelCode, student: { cls: studentInfo.class, name: studentInfo.name, seat: studentInfo.seat }, paper: paperCode, faultConfigId: _asg.configId, faultId: _asg.faultId }); NTC_LOG.log('exam_start', { paper: paperCode, faultConfigId: _asg.configId, level: levelCode }); }
            } else {
                const _s = (_ctx.cls || '') + '|' + (_ctx.seat || '') + '|' + (_ctx.paper || '') + '|' + (_ctx.date || '');
                let _h = 5381;
                for (let _i = 0; _i < _s.length; _i++) _h = (((_h << 5) + _h) + _s.charCodeAt(_i)) >>> 0;
                currentActiveFault = faultOptions[_h % faultOptions.length].id;
                try { repairProgress = null; } catch (e) {}
            }
            try { window.__NTC_LAST_CTX = _ctx; } catch (e) {}
            updateFaultStateFromRandom();

            document.getElementById('modeDisplay').textContent = "考評模式";
            document.getElementById('modeDisplay').className = "mode-indicator mode-exam";
            document.getElementById('studentDisplay').textContent = `考生：${studentInfo.class} ${studentInfo.name} (${studentInfo.seat})`;
            setModeUI(true);
            document.getElementById('loginModal').classList.add('hidden');
            
            runSimulation();
        });

        // 故障狀態：元件 7 項＋配線段 3 段
        // wireA 電瓶→保險絲段配線 / wireB 繼電器→按鈕段配線 / wireC 下喇叭→搭鐵配線
        // 線段斷路設在「學生配好的線」上（配好線後斷），須有對應配線才會發作
        function freshFaultState() {
            return { fuse_link: 'Normal', fuse: 'Normal', relay_coil: 'Normal', relay_switch: 'Normal', btn_switch: 'Normal', horn1: 'Normal', horn2: 'Normal', wireA: 'Normal', wireB: 'Normal', wireC: 'Normal' };
        }
        let faultState = freshFaultState();

        // 車身搭鐵網：電瓶負極為源，各元件下方搭鐵接點全車導通（學生接到任一搭鐵點即完成搭鐵）
        const GROUND_NET = ['bat_neg', 'horn1_chassis', 'horn2_chassis', 'btn_chassis'];
        // 線段定義：端點群組配對（學生配線兩端落在此配對即屬該段）
        const WIRE_SEGS = {
            A: { label: '線束A（電瓶→保險絲）', a: ['bat_pos'], b: ['fuse_link_in'] },
            B: { label: '線束B（繼電器→按鈕）', a: ['relay_85', 'relay_86'], b: ['btn_in'] },
            C: { label: '線束C（下喇叭→搭鐵）', a: ['horn2_gnd'], b: ['bat_neg', 'horn1_chassis', 'horn2_chassis', 'btn_chassis'] }
        };
        function connSeg(conn) {
            for (const k of ['A', 'B', 'C']) {
                const s = WIRE_SEGS[k];
                if ((s.a.includes(conn.start) && s.b.includes(conn.end)) || (s.a.includes(conn.end) && s.b.includes(conn.start))) return k;
            }
            return null;
        }
        function isConnBroken(conn) {
            const s = connSeg(conn);
            return !!(s && faultState['wire' + s] === 'Open');
        }
        // 該線段故障已設定、但學生尚未配出對應線（dormant）
        function dormantSegs() {
            const out = [];
            for (const k of ['A', 'B', 'C']) {
                if (faultState['wire' + k] !== 'Open') continue;
                const has = connections.some(c => connSeg(c) === k);
                if (!has) out.push(k);
            }
            return out;
        }

        // 練習模式故障面板（分組 radio，B 方案）與狀態雙向同步
        const FAULT_PICK_MAP = {
            fuse_link_open: ['fuse_link', 'Open'], fuse_open: ['fuse', 'Open'],
            relay_coil_open: ['relay_coil', 'Open'], relay_switch_fail: ['relay_switch', 'Fail'],
            btn_open: ['btn_switch', 'Open'], horn1_open: ['horn1', 'Open'], horn2_open: ['horn2', 'Open'],
            wireA_open: ['wireA', 'Open'], wireB_open: ['wireB', 'Open'], wireC_open: ['wireC', 'Open']
        };

        function resetFaultPanelUI() {
            const r = document.querySelector('input[name="faultpick"][value="normal"]');
            if (r) r.checked = true;
        }

        function clearFault() {
            if (isAssessmentMode) return;
            resetFaultPanelUI();
            setFault();
        }

        function setFault() {
            if(isAssessmentMode) return;
            const sel = document.querySelector('input[name="faultpick"]:checked');
            const v = sel ? sel.value : 'normal';
            faultState = freshFaultState();
            if (FAULT_PICK_MAP[v]) faultState[FAULT_PICK_MAP[v][0]] = FAULT_PICK_MAP[v][1];
            currentActiveFault = v;
            if (window.NTC_LOG) NTC_LOG.log('fault_set', { value: v });
            runSimulation();
        }

        function updateFaultStateFromRandom() {
            faultState = freshFaultState();
            if(currentActiveFault === 'fuse_link_open') faultState.fuse_link = 'Open';
            if(currentActiveFault === 'fuse_open') faultState.fuse = 'Open';
            if(currentActiveFault === 'relay_coil_open') faultState.relay_coil = 'Open';
            if(currentActiveFault === 'relay_switch_fail') faultState.relay_switch = 'Fail';
            if(currentActiveFault === 'btn_open') faultState.btn_switch = 'Open';
            if(currentActiveFault === 'horn1_open') faultState.horn1 = 'Open';
            if(currentActiveFault === 'horn2_open') faultState.horn2 = 'Open';
            if(currentActiveFault === 'wireA_open') faultState.wireA = 'Open';
            if(currentActiveFault === 'wireB_open') faultState.wireB = 'Open';
            if(currentActiveFault === 'wireC_open') faultState.wireC = 'Open';
        }

        // P2 複合故障＋分段維修：同時設定多個故障；repairProgress 追蹤各階段
        let repairProgress = null; // {configId, stages:[{fault,repair,done}], parallel}
        function applyFaultCode(code) {
            if (FAULT_PICK_MAP[code]) faultState[FAULT_PICK_MAP[code][0]] = FAULT_PICK_MAP[code][1];
        }
        function applyFaultList(list) {
            faultState = freshFaultState();
            (list || []).forEach(applyFaultCode);
        }
        function initRepairProgress(item) {
            repairProgress = null;
            if (!item || item.track !== 'C' || !item.stages) {
                updateFaultStateFromRandom();
                return;
            }
            applyFaultList(item.faults);
            currentActiveFault = '__multi__';
            repairProgress = { configId: item.id, parallel: !!item.parallel, stages: item.stages.map(s => ({ fault: s.fault, repair: s.repair, done: false })) };
        }
        function repairStageDoneCount() {
            if (!repairProgress) return 0;
            return repairProgress.stages.filter(s => s.done).length;
        }
        // 申請維修：repairKey 來自 REPAIR_CATALOG；回傳 {ok, msg}
        function requestRepair(repairKey) {
            if (!repairProgress) return { ok: false, msg: '本次考評無需維修，直接繳交診斷報告即可。' };
            const cat = (window.HORN_BANK && window.HORN_BANK.REPAIR_CATALOG) || [];
            const entry = cat.find(c => c.key === repairKey);
            if (!entry) return { ok: false, msg: '未知的維修項目。' };
            const openStages = repairProgress.stages.map((s, i) => ({ s, i })).filter(o => !o.s.done);
            if (!openStages.length) return { ok: false, msg: '所有階段皆已修復，請繳交診斷報告。' };
            // 非並聯題只能修當前第一階段；並聯題任一未修階段皆可
            const candidates = repairProgress.parallel ? openStages : [openStages[0]];
            const hit = candidates.find(o => entry.fixes.includes(o.s.fault));
            if (window.NTC_LOG) NTC_LOG.log(hit ? 'repair_ok' : 'repair_miss', { repair: repairKey, stage: hit ? hit.i : candidates[0].i });
            if (!hit) return { ok: false, msg: '更換後故障依舊（試誤一次，已記錄）。請重新量測確認。' };
            hit.s.done = true;
            const inv = FAULT_PICK_MAP[hit.s.fault];
            if (inv) faultState[inv[0]] = 'Normal';
            runSimulation();
            const left = repairProgress.stages.filter(s => !s.done).length;
            return { ok: true, msg: '維修成功：' + entry.label + '完成，相關故障已排除。' + (left ? '還有 ' + left + ' 個階段，請繼續查修。' : '全部修復完成，請繳交診斷報告。') };
        }

        document.getElementById('faultBtn').addEventListener('click', () => { document.getElementById('faultPanel').classList.toggle('visible'); });
        (function(){ const fp = document.getElementById('faultPanel'); const h = fp ? fp.querySelector('h3') : null; if (h && !h.querySelector('.fp-close')) { const b = document.createElement('button'); b.className = 'fp-close'; b.textContent = '✕'; b.title = '關閉'; b.setAttribute('aria-label', '關閉故障設定'); b.onclick = () => fp.classList.remove('visible'); h.appendChild(b); } })();
        document.getElementById('submitAnswerBtn').addEventListener('click', () => { openQuizModal(); });
        document.getElementById('cancelSubmitBtn').addEventListener('click', () => { document.getElementById('quizModal').classList.add('hidden'); });
        document.getElementById('repairBtn').addEventListener('click', () => { openRepairModal(); });
        document.getElementById('cancelRepairBtn').addEventListener('click', () => { document.getElementById('repairModal').classList.add('hidden'); });

        // P2-S3：複選診斷＋證據＋維修 modal
        const EVIDENCE_NODES = [
            ['bat_pos','電瓶正極'],['fuse_link_in','易熔絲入端'],['fuse_link_out','易熔絲出端'],
            ['fuse_in','保險絲入端'],['fuse_out','保險絲出端'],['relay_86','繼電器86'],['relay_85','繼電器85'],
            ['relay_30','繼電器30'],['relay_87','繼電器87'],['btn_in','按鈕入端'],['btn_out','按鈕出端'],
            ['horn1_in','上喇叭正端'],['horn1_gnd','上喇叭搭鐵'],['horn2_in','下喇叭正端'],['horn2_gnd','下喇叭搭鐵']
        ];
        function faultLabel(id) {
            const f = faultOptions.find(x => x.id === id);
            if (f) return f.label;
            const L = (window.HORN_BANK && window.HORN_BANK.LABELS) || {};
            return L[id] || id;
        }
        function openQuizModal() {
            const multi = !!repairProgress;
            document.getElementById('quizSingle').classList.toggle('hidden', multi);
            document.getElementById('quizMulti').classList.toggle('hidden', !multi);
            document.getElementById('quizHint').textContent = multi ? '複合故障診斷：勾選所有找出的故障＋量測證據' : '請根據檢測結果，選擇電路的故障原因：';
            if (multi) buildMultiQuiz();
            document.getElementById('quizModal').classList.remove('hidden');
        }
        function buildMultiQuiz() {
            const doneFaults = repairProgress.stages.filter(s => s.done).map(s => s.fault);
            const allFaults = ['normal','fuse_link_open','fuse_open','relay_coil_open','relay_switch_fail','btn_open','horn1_open','horn2_open','wireA_open','wireB_open','wireC_open'];
            document.getElementById('quizMultiFaults').innerHTML = allFaults.map(f => {
                const dis = doneFaults.includes(f) ? ' checked disabled' : '';
                return `<div class="radio-item"><label><input type="checkbox" name="mdiag" value="${f}"${dis}> ${faultLabel(f)}${doneFaults.includes(f) ? '（已維修✓）' : ''}</label></div>`;
            }).join('');
            document.getElementById('quizEvidence').innerHTML = EVIDENCE_NODES.map(n => `<div class="radio-item"><label><input type="checkbox" name="mevd" value="${n[0]}"> ${n[1]}</label></div>`).join('');
        }
        function stageHtml() {
            const st = repairProgress.stages.map((s, i) => `${i + 1}. ${faultLabel(s.fault)}：${s.done ? '已修復✓' : '待查修'}`).join('<br>');
            return `<strong>${repairProgress.configId} 階段進度</strong><br>${st}`;
        }
        function openRepairModal() {
            if (!repairProgress) { alert('本次考評為單一故障，無需維修，直接繳交診斷報告即可。'); return; }
            document.getElementById('repairStages').innerHTML = stageHtml();
            const cat = window.HORN_BANK.REPAIR_CATALOG;
            document.getElementById('repairList').innerHTML = cat.map(c => `<div class="radio-item repair-item"><label><input type="radio" name="rep" value="${c.key}"> ${c.label}</label></div>`).join('') + `<button class="btn-primary" onclick="doRepair()">確認更換</button>`;
            document.getElementById('repairMsg').textContent = '';
            document.getElementById('repairModal').classList.remove('hidden');
        }
        function doRepair() {
            const sel = document.querySelector('input[name="rep"]:checked');
            const msg = document.getElementById('repairMsg');
            if (!sel) { msg.textContent = '請先選擇要更換的零件。'; msg.style.color = '#c0392b'; return; }
            const r = requestRepair(sel.value);
            msg.textContent = r.msg;
            msg.style.color = r.ok ? '#27ae60' : '#c0392b';
            if (r.ok) document.getElementById('repairStages').innerHTML = stageHtml();
        }
        function evaluateMulti() {
            const item = window.__NTC_LAST_ITEM || {};
            const correct = item.faults || [];
            const checked = Array.from(document.querySelectorAll('input[name="mdiag"]:checked')).map(x => x.value);
            const evd = Array.from(document.querySelectorAll('input[name="mevd"]:checked')).map(x => x.value);
            const hits = correct.filter(f => checked.includes(f));
            const extras = checked.filter(f => f !== 'normal' && !correct.includes(f));
            const evHits = (item.evidencePoints || []).filter(p => evd.includes(p));
            const pass = hits.length === correct.length && extras.length === 0 && evd.length >= 2 && evHits.length >= 1;
            return { correct, checked, evd, hits, extras, evHits, pass };
        }
        function submitMulti() {
            const ev = evaluateMulti();
            const item = window.__NTC_LAST_ITEM || {};
            const resultTitle = document.getElementById('resultTitle');
            const resultText = document.getElementById('resultText');
            const resultDetails = document.getElementById('resultDetails');
            const list = (arr) => arr.map(faultLabel).join('、') || '（無）';
            if (ev.pass) { resultTitle.textContent = "🎉 恭喜！診斷正確"; resultTitle.className = "result-success"; resultText.textContent = "複合故障全部找出，證據充分！"; }
            else { resultTitle.textContent = "❌ 診斷未完全正確"; resultTitle.className = "result-fail"; resultText.textContent = "故障或證據有缺漏，請看明細。"; }
            const rOk = window.NTC_LOG ? NTC_LOG.count('repair_ok') : 0;
            const rMiss = window.NTC_LOG ? NTC_LOG.count('repair_miss') : 0;
            resultDetails.innerHTML = `<strong>考生：</strong>${studentInfo.class} ${studentInfo.name}<br><strong>找出的故障：</strong>${list(ev.checked)}<br><strong>正確故障：</strong><span style="color:red">${list(ev.correct)}</span><br><strong>量測證據：</strong>${ev.evd.length} 點（命中關鍵 ${ev.evHits.length}）<br><strong>維修紀錄：</strong>成功 ${rOk}／試誤 ${rMiss}`;
            lastResultData = { studentClass: studentInfo.class, studentName: studentInfo.name, seatNumber: studentInfo.seat, multi: true, configId: item.id || '', track: 'C', userFaults: ev.checked, correctFaults: ev.correct, faultHits: ev.hits.length, faultExtras: ev.extras.length, evidence: ev.evd, evidenceHits: ev.evHits.length, repairOk: rOk, repairMiss: rMiss, isPass: ev.pass, userDiagnosis: list(ev.checked), correctFault: list(ev.correct) };
            finishSubmit({ choice: ev.checked.join('+'), correct: ev.pass });
        }
        function finishSubmit(extra) {
            if (window.NTC_LOG) {
                lastResultData.measureCount = NTC_LOG.count('probe_measure');
                lastResultData.wireCount = NTC_LOG.count('wire_connect');
                lastResultData.hintCount = 0;
                lastResultData.logEvents = NTC_LOG.exportData().events.length;
                lastResultData.durationMs = NTC_LOG.elapsed();
                lastResultData.level = (NTC_LOG.session && NTC_LOG.session.level) || '';
                lastResultData.resubmits = NTC_LOG.count('diagnosis_submit');
                if (window.ASSESS && typeof ASSESS.score === 'function') lastResultData.score = ASSESS.score(lastResultData);
                NTC_LOG.log('diagnosis_submit', Object.assign({ measureCount: lastResultData.measureCount, wireCount: lastResultData.wireCount }, extra || {}));
                NTC_LOG.archive({ pass: !!lastResultData.isPass, score: (lastResultData.score && lastResultData.score.total) || null, parts: (lastResultData.score && lastResultData.score.parts) || null, multi: !!lastResultData.multi });
            }
            if (lastResultData.score) {
                const s = lastResultData.score;
                const rows = Object.keys(s.parts).map(k => `${k}：${s.parts[k]}`).join('<br>');
                document.getElementById('resultDetails').innerHTML += `<br><br><strong>評分（初評）：${s.total} 分</strong><br>${rows}`;
            }
            document.getElementById('quizModal').classList.add('hidden');
            document.getElementById('resultModal').classList.remove('hidden');
        }

        document.getElementById('confirmSubmitBtn').addEventListener('click', () => {
            if (repairProgress) { submitMulti(); return; }
            const selected = document.querySelector('input[name="diagnosis"]:checked');
            if (!selected) { alert("請選擇一個診斷結果！"); return; }
            const userChoice = selected.value;
            const isCorrect = (userChoice === currentActiveFault);
            const resultTitle = document.getElementById('resultTitle');
            const resultText = document.getElementById('resultText');
            const resultDetails = document.getElementById('resultDetails');
            
            if (isCorrect) { resultTitle.textContent = "🎉 恭喜！診斷正確"; resultTitle.className = "result-success"; resultText.textContent = "您成功找出了電路的問題！"; }
            else { resultTitle.textContent = "❌ 診斷錯誤"; resultTitle.className = "result-fail"; resultText.textContent = "很遺憾，判斷不正確。"; }
            
            const correctLabel = faultOptions.find(f => f.id === currentActiveFault).label;
            const userLabel = faultOptions.find(f => f.id === userChoice).label;
            resultDetails.innerHTML = `<strong>考生：</strong>${studentInfo.class} ${studentInfo.name}<br><strong>您的答案：</strong>${userLabel}<br><strong>正確答案：</strong><span style="color:red">${correctLabel}</span>`;
            
            lastResultData = { studentClass: studentInfo.class, studentName: studentInfo.name, seatNumber: studentInfo.seat, multi: false, track: 'S', userDiagnosis: userLabel, correctFault: correctLabel, isPass: isCorrect };
            finishSubmit({ choice: userChoice, correct: isCorrect });
        });

        function downloadCSV() {
            if(!lastResultData) return;
            const bom = "\uFEFF"; 
            const header = "班級,姓名,座號,考生診斷,正確答案,結果\n";
            const row = `${lastResultData.studentClass},${lastResultData.studentName},${lastResultData.seatNumber},${lastResultData.userDiagnosis},${lastResultData.correctFault},${lastResultData.isPass ? '通過' : '未通過'}\n`;
            const blob = new Blob([bom + header + row], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `診斷結果_${lastResultData.studentName}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        function uploadToGoogle() {
            if(!lastResultData) return;
            if(!TEACHER_GOOGLE_SCRIPT_URL || TEACHER_GOOGLE_SCRIPT_URL.length < 10) { alert("錯誤：教師尚未設定 Google Script 網址。"); return; }
            const btn = document.querySelector('.btn-upload');
            btn.textContent = "上傳中...";
            btn.disabled = true;
            fetch(TEACHER_GOOGLE_SCRIPT_URL, {
                method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastResultData)
            }).then(() => { alert("成績已發送至雲端！"); btn.textContent = "上傳成功"; }).catch(err => { console.error(err); alert("上傳失敗，請檢查網路或腳本設定。"); btn.textContent = "上傳失敗"; btn.disabled = false; });
        }

        const CircuitEngine = {
            componentResistance: { 'fusible_link': 0.1, 'fuse': 0.1, 'relay_coil': 80.0, 'relay_switch': 0.1, 'horn': 4.0, 'button': 0.1 },
            isConnected: function(n1, n2, graph) {
                if (n1 === n2) return true;
                if (!graph[n1]) return false;
                let queue = [n1], visited = new Set([n1]);
                while(queue.length > 0) {
                    let node = queue.shift();
                    if(node === n2) return true;
                    if(graph[node]) { for(let n of graph[node]) if(!visited.has(n)) { visited.add(n); queue.push(n); } }
                }
                return false;
            },
            buildGraph: function(buttonPressed, relayClosed) {
                let adj = {};
                const addEdge = (u, v) => { if(!adj[u]) adj[u]=[]; if(!adj[v]) adj[v]=[]; adj[u].push(v); adj[v].push(u); };
                connections.forEach(conn => { if (!isConnBroken(conn)) addEdge(conn.start, conn.end); });
                if (faultState.fuse_link === 'Normal') addEdge('fuse_link_in', 'fuse_link_out');
                if (faultState.fuse === 'Normal') addEdge('fuse_in', 'fuse_out'); 
                if(relayClosed && faultState.relay_switch === 'Normal') addEdge('relay_30', 'relay_87');
                if(buttonPressed && faultState.btn_switch === 'Normal') addEdge('btn_in', 'btn_out');
                for (let gi = 1; gi < GROUND_NET.length; gi++) addEdge(GROUND_NET[0], GROUND_NET[gi]);
                return adj;
            },
            getVoltageAtNode: function(targetNode, buttonPressed, relayClosed) {
                if (targetNode === 'bat_neg' || targetNode === 'btn_out' || targetNode.includes('_gnd')) return 0.0;
                let graph = this.buildGraph(buttonPressed, relayClosed);
                if (faultState.relay_coil === 'Normal') {
                    if(!graph['relay_85']) graph['relay_85']=[]; graph['relay_85'].push('relay_86');
                    if(!graph['relay_86']) graph['relay_86']=[]; graph['relay_86'].push('relay_85');
                }
                let connectedToPos = this.isConnected('bat_pos', targetNode, graph);
                let connectedToNeg = this.isConnected('bat_neg', targetNode, graph);
                if (!connectedToPos) return 0.0; 
                if (!connectedToNeg) return 12.0; 
                const lowSideNodes = ['relay_85', 'btn_in'];
                if (lowSideNodes.includes(targetNode) && this.isConnected(targetNode, 'btn_out', graph)) return 0.0; 
                return 12.0; 
            },
            getResistance: function(n1, n2) {
                if (n1 === n2) return 0.0;
                const nodes = [n1, n2].sort(); const a = nodes[0]; const b = nodes[1];
                if ((a === 'relay_85' && b === 'relay_86') || (a === 'relay_86' && b === 'relay_85')) return faultState.relay_coil === 'Open' ? -1 : 80.0;
                const isHornPair = (hIn, hGnd) => (a === hIn && b === hGnd) || (a === hGnd && b === hIn);
                if (isHornPair('horn1_in', 'horn1_gnd')) return faultState.horn1 === 'Open' ? -1 : 4.0;
                if (isHornPair('horn2_in', 'horn2_gnd')) return faultState.horn2 === 'Open' ? -1 : 4.0;
                const gndNodes = ['bat_neg', 'btn_out', 'horn1_gnd', 'horn2_gnd'];
                if ((a.includes('horn') && gndNodes.includes(b)) || (b.includes('horn') && gndNodes.includes(a))) {
                     return (faultState.horn1 === 'Open' && a.includes('horn1')) || (faultState.horn2 === 'Open' && a.includes('horn2')) ? -1 : 4.0;
                }
                if (a.includes('fuse_link') && b.includes('fuse_link')) return faultState.fuse_link === 'Open' ? -1 : 0.1;
                if (a.includes('fuse') && b.includes('fuse') && !a.includes('link')) return faultState.fuse === 'Open' ? -1 : 0.1;
                if ((a === 'relay_30' && b === 'relay_87') || (a === 'relay_87' && b === 'relay_30')) {
                    let isActive = document.getElementById('relay').classList.contains('relay-active');
                    if (isActive && faultState.relay_switch === 'Fail') return -1;
                    return isActive ? 0.1 : -1;
                }
                if ((a === 'btn_in' && b === 'btn_out') || (a === 'btn_out' && b === 'btn_in')) {
                    if (isButtonPressed && faultState.btn_switch === 'Open') return -1;
                    return isButtonPressed ? 0.1 : -1;
                }
                let graph = this.buildGraph(isButtonPressed, document.getElementById('relay').classList.contains('relay-active'));
                if (this.isConnected(a, b, graph)) return 0.0;
                return -1; 
            }
        };

        let isButtonPressed = false;
        const statusMsg = document.getElementById('statusMsg');
        function runSimulation() {
            let v86 = CircuitEngine.getVoltageAtNode('relay_86', isButtonPressed, false);
            // 接地唯一源：電瓶負極（喇叭搭鐵與按鈕 btn_out 均須由學生自行配線接回 bat_neg）
            let checkGnd = (node) => {
                let g = CircuitEngine.buildGraph(isButtonPressed, false);
                return CircuitEngine.isConnected(node, 'bat_neg', g);
            };
            let p85_gnd = checkGnd('relay_85');
            let p86_gnd = checkGnd('relay_86');
            let v85 = CircuitEngine.getVoltageAtNode('relay_85', isButtonPressed, false);
            let coilOK = faultState.relay_coil === 'Normal';
            let relayEnergized = coilOK && ((v86 > 10 && p85_gnd) || (v85 > 10 && p86_gnd));

            const relayGroup = document.getElementById('relay');
            if (relayEnergized) relayGroup.classList.add('relay-active');
            else relayGroup.classList.remove('relay-active');

            let switchOK = faultState.relay_switch === 'Normal';
            let h1Active = false, h2Active = false;

            if (relayEnergized && switchOK) {
                let vH1 = CircuitEngine.getVoltageAtNode('horn1_in', isButtonPressed, true);
                let vH2 = CircuitEngine.getVoltageAtNode('horn2_in', isButtonPressed, true);
                // 喇叭要有聲：本體正常＋電源有送達＋搭鐵迴路有接回電瓶負極
                let gFull = CircuitEngine.buildGraph(isButtonPressed, true);
                let h1Gnd = CircuitEngine.isConnected('horn1_gnd', 'bat_neg', gFull);
                let h2Gnd = CircuitEngine.isConnected('horn2_gnd', 'bat_neg', gFull);
                let h1OK = faultState.horn1 === 'Normal';
                let h2OK = faultState.horn2 === 'Normal';
                if (vH1 > 10 && h1OK && h1Gnd) h1Active = true;
                if (vH2 > 10 && h2OK && h2Gnd) h2Active = true;
            }

            const h1El = document.getElementById('horn1'); const h2El = document.getElementById('horn2');
            if (h1Active) h1El.classList.add('honking'); else h1El.classList.remove('honking');
            if (h2Active) h2El.classList.add('honking'); else h2El.classList.remove('honking');

            if (h1Active || h2Active) { statusMsg.innerText = "電路運作中"; statusMsg.style.color = "#2ecc71"; }
            else if (!isAssessmentMode) {
                const dorm = dormantSegs();
                if (dorm.length) { statusMsg.innerText = "已設定" + dorm.map(k => WIRE_SEGS[k].label).join('、') + "斷路，但該段尚未配線（先完成配線才會發作）"; statusMsg.style.color = "#f39c12"; }
                else { statusMsg.innerText = "準備就緒"; statusMsg.style.color = "#bdc3c7"; }
            }
            else { statusMsg.innerText = "考評進行中..."; statusMsg.style.color = "#bdc3c7"; }

            updateFlowAnimation(relayEnergized && switchOK);
            renderWireBreaks();
            updateMultimeterReading(relayEnergized);
        }

        // 配線段斷線視覺：在斷掉的學生配線上畫缺口徽章（練習模式才顯示，考評隱藏）
        function renderWireBreaks() {
            document.querySelectorAll('.wire-break').forEach(el => el.remove());
            if (isAssessmentMode) return;
            const layer = document.getElementById('wire-layer');
            const wires = document.querySelectorAll('.wire');
            connections.forEach((conn, index) => {
                if (!isConnBroken(conn) || !wires[index]) return;
                const pts = (wires[index].getAttribute('points') || '').trim().split(/\s+/).map(p => p.split(',').map(Number));
                if (pts.length < 2 || pts.some(p => p.some(isNaN))) return;
                const si = Math.floor((pts.length - 1) / 2);
                const mid = [(pts[si][0] + pts[si + 1][0]) / 2, (pts[si][1] + pts[si + 1][1]) / 2];
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.setAttribute('class', 'wire-break');
                g.setAttribute('transform', `translate(${mid[0]},${mid[1]})`);
                g.setAttribute('pointer-events', 'none');
                g.innerHTML = '<rect x="-24" y="-11" width="48" height="22" rx="5" class="break-gap"/><text x="0" y="4" text-anchor="middle" class="break-x break-x-badge">✖斷線</text>';
                layer.appendChild(g);
            });
        }

        function updateFlowAnimation(relayClosed) {
            document.querySelectorAll('.flowing').forEach(el => el.classList.remove('flowing'));
            if (isAssessmentMode) return; 
            let graph = {};
            const link = (u, v) => { if(!graph[u]) graph[u]=[]; if(!graph[v]) graph[v]=[]; graph[u].push(v); graph[v].push(u); };
            connections.forEach(conn => { if (!isConnBroken(conn)) link(conn.start, conn.end); });
            if (faultState.fuse_link === 'Normal') link('fuse_link_in', 'fuse_link_out');
            if (faultState.fuse === 'Normal') link('fuse_in', 'fuse_out');
            if (faultState.relay_coil === 'Normal') link('relay_85', 'relay_86');
            if (relayClosed) link('relay_30', 'relay_87');
            if (isButtonPressed && faultState.btn_switch === 'Normal') link('btn_in', 'btn_out');
            for (let gi = 1; gi < GROUND_NET.length; gi++) link(GROUND_NET[0], GROUND_NET[gi]);
            const isPowered = (node) => { let q=[node], v=new Set([node]); while(q.length) { let n=q.shift(); if(n==='bat_pos') return true; if(graph[n]) for(let nb of graph[n]) if(!v.has(nb)){v.add(nb);q.push(nb);} } return false; };
            const isGrounded = (node) => { let q=[node], v=new Set([node]); while(q.length) { let n=q.shift(); if(n==='bat_neg') return true; if(graph[n]) for(let nb of graph[n]) if(!v.has(nb)){v.add(nb);q.push(nb);} } return false; };
            const wires = document.querySelectorAll('.wire');
            connections.forEach((conn, index) => {
                let p1 = isPowered(conn.start) && isGrounded(conn.end);
                let p2 = isPowered(conn.end) && isGrounded(conn.start);
                let p3 = isPowered(conn.start) && isGrounded(conn.start);
                let targetHornBroken = false;
                if ((conn.end.includes('horn1') && faultState.horn1 === 'Open') || (conn.start.includes('horn1') && faultState.horn1 === 'Open')) targetHornBroken = true;
                if ((conn.end.includes('horn2') && (faultState.horn2 === 'Open' || faultState.wireC === 'Open')) || (conn.start.includes('horn2') && (faultState.horn2 === 'Open' || faultState.wireC === 'Open'))) targetHornBroken = true;
                if (!targetHornBroken && (p1 || p2 || p3)) wires[index].classList.add('flowing');
            });
            if (faultState.fuse_link === 'Normal' && faultState.wireA === 'Normal') { if(isPowered('fuse_link_in') && isGrounded('fuse_link_out')) document.getElementById('path_fusible_link').classList.add('flowing'); }
            if (faultState.fuse === 'Normal') { if(isPowered('fuse_in') && isGrounded('fuse_out')) document.getElementById('path_fuse').classList.add('flowing'); }
            if (faultState.relay_coil === 'Normal' && ((isPowered('relay_86') && isGrounded('relay_85')) || (isPowered('relay_85') && isGrounded('relay_86')))) {
                document.getElementById('path_relay_coil_1').classList.add('flowing');
                document.getElementById('path_relay_coil_2').classList.add('flowing');
                document.getElementById('path_relay_coil_3').classList.add('flowing');
            }
            if (relayClosed && isPowered('relay_30')) {
                 document.getElementById('path_relay_sw_1').classList.add('flowing');
                 document.getElementById('path_relay_sw_2').classList.add('flowing');
            }
        }

        let probeContact = { red: null, black: null };
        function checkProbeContact() {
            const points = document.querySelectorAll('.conn-point');
            probeContact.red = null; probeContact.black = null;
            points.forEach(p => p.classList.remove('probing'));
            ['red', 'black'].forEach(color => {
                const s = probeState[color];
                const pt = meterSvg.createSVGPoint();
                const angleRad = s.angle * Math.PI / 180;
                pt.x = s.x - 40 * Math.sin(angleRad); pt.y = s.y + 40 * Math.cos(angleRad);
                const CTM = meterSvg.getScreenCTM();
                const screenTipX = pt.x * CTM.a + CTM.e; const screenTipY = pt.y * CTM.d + CTM.f;
                points.forEach(p => {
                    const pRect = p.getBoundingClientRect();
                    const pX = pRect.left + pRect.width/2; const pY = pRect.top + pRect.height/2;
                    if (Math.sqrt(Math.pow(screenTipX - pX, 2) + Math.pow(screenTipY - pY, 2)) < 20) { probeContact[color] = p.getAttribute('data-id'); p.classList.add('probing'); }
                });
            });
            const _prR = probeContact._lr, _prB = probeContact._lb;
            runSimulation();
            // 接觸組合改變才記一次量測事件（含當時檔位與讀值，避免拖曳洗版）
            if (window.NTC_LOG && (probeContact.red !== _prR || probeContact.black !== _prB) && (probeContact.red || probeContact.black)) {
                NTC_LOG.log('probe_measure', { red: probeContact.red, black: probeContact.black, mode: knobModes[currentModeIndex].label, reading: document.getElementById('meter-display').textContent, pressed: isButtonPressed });
            }
            probeContact._lr = probeContact.red; probeContact._lb = probeContact.black;
        }
        function updateMultimeterReading(relayEnergized) {
            const mode = knobModes[currentModeIndex];
            const display = document.getElementById('meter-display');
            if (mode.type === 'off') { display.textContent = ""; return; }
            if (probeState.red.jack !== 'volts' || probeState.black.jack !== 'com') { display.textContent = "0.00"; return; }
            if (!probeContact.red || !probeContact.black) { if (mode.type === 'res') display.textContent = "1 ."; else display.textContent = "0.00"; return; }
            if (mode.type === 'dcv') {
                let vRed = CircuitEngine.getVoltageAtNode(probeContact.red, isButtonPressed, relayEnergized);
                let vBlack = CircuitEngine.getVoltageAtNode(probeContact.black, isButtonPressed, relayEnergized);
                let coilOk = faultState.relay_coil === 'Normal';
                if (coilOk && !isButtonPressed && probeContact.red === 'relay_85' && CircuitEngine.getVoltageAtNode('relay_86', false, false) > 10) vRed = 12.0;
                if (coilOk && !isButtonPressed && probeContact.red === 'relay_86' && CircuitEngine.getVoltageAtNode('relay_85', false, false) > 10) vRed = 12.0;
                display.textContent = (vRed - vBlack).toFixed(2);
            } else if (mode.type === 'res') {
                let r = CircuitEngine.getResistance(probeContact.red, probeContact.black);
                if (r === -1) display.textContent = "1 ."; else if (r >= 1000) display.textContent = (r/1000).toFixed(2) + "k"; else display.textContent = r.toFixed(1);
            } else { display.textContent = "0.00"; }
        }
        const meterSvg = document.getElementById('meterSvg'); const meterKnob = document.getElementById('meter-knob'); const meterDisplay = document.getElementById('meter-display'); const meterScalesGroup = document.getElementById('meter-scales'); const knobModes = [ { label: "OFF", angle: 0, type: 'off' }, { label: "2V", angle: -30, type: 'dcv' }, { label: "20V", angle: -50, type: 'dcv' }, { label: "200V", angle: -70, type: 'dcv' }, { label: "200Ω", angle: -100, type: 'res' }, { label: "2KΩ", angle: -120, type: 'res' }, { label: "200K", angle: -140, type: 'res' }, { label: "2M", angle: -160, type: 'res' }, { label: "2mA", angle: 22, type: 'amp' }, { label: "20mA", angle: 50, type: 'amp' }, { label: "200mA", angle: 78, type: 'amp' }, { label: "20A", angle: 106, type: 'amp' }, ]; let currentModeIndex = 0; function initMeterScales() { const radiusDot = 65; const radiusText = 82; knobModes.forEach((mode, index) => { const group = document.createElementNS("http://www.w3.org/2000/svg", "g"); group.setAttribute("class", "scale-group"); group.addEventListener("click", () => setMode(index)); const rad = (mode.angle - 90) * Math.PI / 180; const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle"); dot.setAttribute("cx", radiusDot * Math.cos(rad)); dot.setAttribute("cy", radiusDot * Math.sin(rad)); dot.setAttribute("r", 2.5); dot.setAttribute("class", "scale-tick"); group.appendChild(dot); const text = document.createElementNS("http://www.w3.org/2000/svg", "text"); text.setAttribute("x", radiusText * Math.cos(rad)); text.setAttribute("y", radiusText * Math.sin(rad)); text.setAttribute("class", "scale-label"); text.textContent = mode.label; text.setAttribute("transform", `rotate(${mode.angle}, ${radiusText * Math.cos(rad)}, ${radiusText * Math.sin(rad)})`); text.setAttribute("dy", "0.35em"); group.appendChild(text); meterScalesGroup.appendChild(group); }); } function setMode(index) { if (window.NTC_LOG && window.__ntcKnobReady) NTC_LOG.log('knob_change', { label: knobModes[index].label }); currentModeIndex = index; meterKnob.style.transition = "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)"; meterKnob.style.transform = `translate(125px, 240px) rotate(${knobModes[index].angle}deg)`; updateMultimeterReading(false); } initMeterScales(); setMode(0); window.__ntcKnobReady = true; let selectedElement = null; let offset = { x: 0, y: 0 }; const jacks = { 'com': { x: 25+60, y: 20+370 }, 'volts': { x: 25+125, y: 20+370 }, 'amps': { x: 25+190, y: 20+370 } }; const probeState = { red: { plugId: 'plug-red-obj', tipId: 'tip-red-obj', wireId: 'wire-red', jack: null, plugX: 80, plugY: 470, x: 200, y: 470, angle: 0 }, black: { plugId: 'plug-black-obj', tipId: 'tip-black-obj', wireId: 'wire-black', jack: null, plugX: 50, plugY: 470, x: 230, y: 470, angle: 0 } }; function updateElementPosition(color) { const s = probeState[color]; const plug = document.getElementById(s.plugId); plug.setAttribute("transform", `translate(${s.plugX}, ${s.plugY})`); const tip = document.getElementById(s.tipId); tip.setAttribute("transform", `translate(${s.x}, ${s.y}) rotate(${s.angle})`); const wire = document.getElementById(s.wireId); const x1 = s.plugX; const y1 = s.plugY - 15; const rad = s.angle * Math.PI / 180; const tx = s.x + 40 * Math.sin(rad); const ty = s.y - 40 * Math.cos(rad); const cx = (x1 + tx) / 2; const cy = Math.max(y1, ty) + 50; wire.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${tx} ${ty}`); } updateElementPosition('red'); updateElementPosition('black'); function makeDraggable(elementId, type, color) { const elem = document.getElementById(elementId); elem.addEventListener('pointerdown', (e) => { e.preventDefault(); const CTM = meterSvg.getScreenCTM(); const mx = (e.clientX - CTM.e) / CTM.a; const my = (e.clientY - CTM.f) / CTM.d; if(type === 'tip') { offset.x = mx - probeState[color].x; offset.y = my - probeState[color].y; } else { offset.x = mx - probeState[color].plugX; offset.y = my - probeState[color].plugY; } selectedElement = { type: type, color: color, sx: e.clientX, sy: e.clientY, st: Date.now() }; elem.style.cursor = "grabbing"; }); } makeDraggable('plug-red-obj', 'plug', 'red'); makeDraggable('plug-black-obj', 'plug', 'black'); makeDraggable('tip-red-obj', 'tip', 'red'); makeDraggable('tip-black-obj', 'tip', 'black'); window.addEventListener('pointermove', (e) => { if (selectedElement) { e.preventDefault(); const CTM = meterSvg.getScreenCTM(); const mx = (e.clientX - CTM.e) / CTM.a; const my = (e.clientY - CTM.f) / CTM.d; const s = probeState[selectedElement.color]; if (selectedElement.type === 'tip') { s.x = mx - offset.x; s.y = my - offset.y; checkProbeContact(); } else { s.plugX = mx - offset.x; s.plugY = my - offset.y; s.jack = null; } updateElementPosition(selectedElement.color); } }); window.addEventListener('pointerup', (e) => { try { if (selectedElement) { const s = probeState[selectedElement.color]; const elem = document.getElementById(selectedElement.type === 'plug' ? s.plugId : s.tipId); elem.style.cursor = "grab"; if (selectedElement.type === 'plug') { const jacksAbs = { 'com': {x:85,y:390}, 'volts':{x:150,y:390}, 'amps':{x:215,y:390} }; const tipX = s.plugX; const tipY = s.plugY + 18; let snapped = false; for (const [key, pos] of Object.entries(jacksAbs)) { if (Math.sqrt(Math.pow(tipX - pos.x, 2) + Math.pow(tipY - pos.y, 2)) < 30) { s.plugX = pos.x; s.plugY = pos.y - 18; s.jack = key; snapped = true; break; } } if(!snapped) s.jack = null; updateElementPosition(selectedElement.color); runSimulation(); } if (selectedElement.type === 'tip' && Math.hypot(e.clientX - selectedElement.sx, e.clientY - selectedElement.sy) < 8 && (Date.now() - selectedElement.st) < 350) { s.angle = (s.angle + 15) % 360; updateElementPosition(selectedElement.color); checkProbeContact(); } } } catch(err) { console.error(err); } finally { selectedElement = null; } });
        const circuitSvg = document.getElementById('circuitSvg'); const wireLayer = document.getElementById('wire-layer'); const points = document.querySelectorAll('.conn-point'); const btnGroup = document.getElementById('button'); const btnHitbox = document.getElementById('btn-hitbox'); let isDrawing = false; let currentPath = []; let previewLine = null; let startNodeId = null; let connections = []; function getCircuitMousePos(evt) { const CTM = circuitSvg.getScreenCTM(); return { x: (evt.clientX - CTM.e) / CTM.a, y: (evt.clientY - CTM.f) / CTM.d }; } function getPointPosition(circle) { const CTM = circuitSvg.getScreenCTM(); const r = circle.getBoundingClientRect(); return { x: (r.left + r.width/2 - CTM.e) / CTM.a, y: (r.top + r.height/2 - CTM.f) / CTM.d }; } function applySmartSnap(prevPoint, currPoint) { if (!prevPoint) return currPoint; const dx = currPoint.x - prevPoint.x, dy = currPoint.y - prevPoint.y; const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI); if (angle < 5 || angle > 175) return { x: currPoint.x, y: prevPoint.y }; if (Math.abs(angle - 90) < 5) return { x: prevPoint.x, y: currPoint.y }; return currPoint; }
        points.forEach(point => { point.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (deleteMode) return; const pos = getPointPosition(point); const pid = point.getAttribute('data-id'); if (!isDrawing) { isDrawing = true; startNodeId = pid; currentPath = [pos]; previewLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline"); previewLine.setAttribute("class", "wire-preview"); previewLine.setAttribute("points", `${pos.x},${pos.y} ${pos.x},${pos.y}`); wireLayer.appendChild(previewLine); point.classList.add('active'); } else { if (pid === startNodeId) { isDrawing = false; currentPath = []; startNodeId = null; if (previewLine) { previewLine.remove(); previewLine = null; } document.querySelectorAll('.conn-point.active').forEach(p => p.classList.remove('active')); return; } currentPath.push(pos); connections.push({ start: startNodeId, end: pid, points: currentPath.map(p => ({x: p.x, y: p.y})) }); if (window.NTC_LOG) NTC_LOG.log('wire_connect', { start: startNodeId, end: pid }); const realWire = document.createElementNS("http://www.w3.org/2000/svg", "polyline"); realWire.setAttribute("class", "wire"); const pointsStr = currentPath.map(p => `${p.x},${p.y}`).join(' '); realWire.setAttribute("points", pointsStr); realWire.setAttribute("data-idx", connections.length - 1); wireLayer.appendChild(realWire); isDrawing = false; currentPath = []; startNodeId = null; if (previewLine) { previewLine.remove(); previewLine = null; } document.querySelectorAll('.conn-point.active').forEach(p => p.classList.remove('active')); runSimulation(); } }); });
        circuitSvg.addEventListener('pointerdown', (e) => { if (isDrawing) { let mp = getCircuitMousePos(e); mp = applySmartSnap(currentPath[currentPath.length - 1], mp); currentPath.push(mp); if (previewLine) previewLine.setAttribute("points", currentPath.map(p => `${p.x},${p.y}`).join(' ') + ` ${mp.x},${mp.y}`); } });
        circuitSvg.addEventListener('pointermove', (e) => { if (isDrawing && previewLine) { let mp = getCircuitMousePos(e); mp = applySmartSnap(currentPath[currentPath.length - 1], mp); previewLine.setAttribute("points", currentPath.map(p => `${p.x},${p.y}`).join(' ') + ` ${mp.x},${mp.y}`); } });
        circuitSvg.addEventListener('contextmenu', (e)=>{ e.preventDefault(); const t = (e.target && e.target.closest) ? e.target.closest('.wire') : null; if (t && t.dataset.idx !== undefined) { removeWireAt(parseInt(t.dataset.idx, 10)); return; } isDrawing=false; currentPath = []; if(previewLine){previewLine.remove(); previewLine=null;} document.querySelectorAll('.conn-point.active').forEach(p => p.classList.remove('active')); });
        document.getElementById('clearBtn').addEventListener('click', () => { if(confirm('確定要清除所有連線嗎？')) { if (deleteMode) toggleDeleteMode(); if (window.NTC_LOG) NTC_LOG.log('wire_clear_all', { count: connections.length }); wireLayer.innerHTML = ''; connections = []; isDrawing = false; currentPath = []; if(previewLine) { previewLine.remove(); previewLine = null; } document.querySelectorAll('.conn-point.active').forEach(p => p.classList.remove('active')); runSimulation(); } });
        btnHitbox.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); btnGroup.classList.add('btn-pressed'); isButtonPressed = true; if (window.NTC_LOG) NTC_LOG.log('button_press', {}); runSimulation(); });
        window.addEventListener('pointerup', () => { if(isButtonPressed) { btnGroup.classList.remove('btn-pressed'); isButtonPressed = false; runSimulation(); } });

        // 單線刪除模式（練習/考評皆可刪自己的線）
        let deleteMode = false;
        function toggleDeleteMode() {
            deleteMode = !deleteMode;
            if (deleteMode && isDrawing) { isDrawing = false; currentPath = []; startNodeId = null; if (previewLine) { previewLine.remove(); previewLine = null; } document.querySelectorAll('.conn-point.active').forEach(p => p.classList.remove('active')); }
            const b = document.getElementById('deleteWireBtn');
            if (b) { b.classList.toggle('active-del', deleteMode); b.textContent = deleteMode ? '完成刪線' : '刪除單線'; }
            document.getElementById('circuitSvg').classList.toggle('delete-mode', deleteMode);
        }
        function renderWires() {
            wireLayer.innerHTML = '';
            connections.forEach((conn, i) => {
                if (!conn.points) return;
                const w = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                w.setAttribute('class', 'wire');
                w.setAttribute('data-idx', i);
                w.setAttribute('points', conn.points.map(p => `${p.x},${p.y}`).join(' '));
                wireLayer.appendChild(w);
            });
        }
        function removeWireAt(i) {
            if (isNaN(i) || i < 0 || i >= connections.length) return;
            const _rm = connections[i];
            connections.splice(i, 1);
            if (window.NTC_LOG) NTC_LOG.log('wire_delete', { start: _rm.start, end: _rm.end });
            renderWires();
            runSimulation();
        }
        wireLayer.addEventListener('click', (e) => {
            if (!deleteMode) return;
            const t = (e.target && e.target.closest) ? e.target.closest('.wire') : null;
            if (t && t.dataset.idx !== undefined) removeWireAt(parseInt(t.dataset.idx, 10));
        });
    