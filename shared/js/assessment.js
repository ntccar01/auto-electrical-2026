/* NTC 評分引擎（P2-S4，混合制自動初評）
 * 輸入：app.js 繳交時整理的 lastResultData（含 Logger 統計）
 * 輸出：{ total, parts }，parts 中文鍵供結果頁直接顯示。
 * 單一題：結果40＋覆蓋25＋檔位5＋配線10＋時間10＋重繳10
 * 複合題：結果30＋證據10＋覆蓋15＋檔位5＋維修20＋時間10＋重繳10
 */
window.ASSESS = (function () {
  var CLOSE_PAIRS = {
    fuse_open: ['fuse_link_open', 'battB_open', 'wireA_open'], fuse_link_open: ['fuse_open'],
    horn1_open: ['horn2_open'], horn2_open: ['horn1_open', 'wireC_open'], wireC_open: ['horn2_open'],
    relay_coil_open: ['relay_switch_fail', 'btn_open'], relay_switch_fail: ['relay_coil_open'],
    btn_open: ['relay_coil_open'],
    battB_open: ['fuse_open', 'wireA_open'], wireA_open: ['fuse_open', 'battB_open'],
    ns_open: ['solHold_open', 'solPull_open', 'wireB_open'], wireB_open: ['ns_open'],
    solHold_open: ['solPull_open', 'ns_open'], solPull_open: ['solHold_open', 'ns_open'],
    bm_fail: ['mot_open'], mot_open: ['bm_fail', 'wireC_open']
  };
  var TIME_TARGET = { basic: 8 * 60 * 1000, standard: 10 * 60 * 1000, challenge: 20 * 60 * 1000 };
  var GROUND_SETS = {
    horn: ['bat_neg', 'horn1_chassis', 'horn2_chassis', 'btn_chassis'],
    start: ['bat_neg', 'mot_chassis', 'sol_chassis']
  };
  // 配線檢核：必要導通群組（分單元標準配線）
  var WIRING_SETS = {
    horn: [
      ['bat_pos', 'fuse_link_in'], ['fuse_link_out', 'fuse_in'],
      ['fuse_out', 'relay_30'], ['fuse_out', 'relay_86'],
      ['relay_85', 'btn_in'], ['relay_86', 'btn_in'],
      ['btn_out', 'bat_neg'],
      ['relay_87', 'horn1_in'], ['relay_87', 'horn2_in'],
      ['horn1_gnd', 'bat_neg'], ['horn2_gnd', 'bat_neg']
    ],
    start: [
      ['bat_pos', 'fuse_in'], ['fuse_out', 'ig_B'], ['fuse_out', 'sol_B'],
      ['ig_ST', 'ns_in'], ['ns_out', 'sol_ST'],
      ['sol_M', 'mot_M'], ['mot_gnd', 'bat_neg'], ['sol_G', 'bat_neg']
    ]
  };
  var REL_NODES = {
    horn: ['bat_pos', 'fuse_out', 'relay_30', 'relay_87', 'btn_in', 'horn1_in', 'horn2_in'],
    start: ['bat_pos', 'fuse_out', 'ig_B', 'ig_ST', 'ns_out', 'sol_ST', 'sol_B', 'sol_M', 'mot_M']
  };

  function unitNow() {
    try { return (NTC_LOG.session && NTC_LOG.session.unit) || 'horn'; }
    catch (e) { return 'horn'; }
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // 配線檢核只看「學生接上的線」，不受故障設定影響（2026-11-11）。
  // 原本用通電圖檢核，B 主電源線斷路等「設在學生配線上的斷路故障」會讓已接好的線被判為未完成，
  // 導致該題即使診斷正確也無法通過及格門檻。
  function wiringGraph() {
    var adj = {};
    try {
      var list = (typeof connections !== 'undefined' && Array.isArray(connections)) ? connections : [];
      list.forEach(function (c) {
        if (!c || !c.start || !c.end) return;
        (adj[c.start] = adj[c.start] || []).push(c.end);
        (adj[c.end] = adj[c.end] || []).push(c.start);
      });
    } catch (e) {}
    return adj;
  }

  // 任一端在群組內即視為該要求達成（搭鐵網任一點皆可）
  function groupOk(a, b, g, grounds) {
    var ga = (grounds.indexOf(a) >= 0) ? grounds : [a];
    var gb = (grounds.indexOf(b) >= 0) ? grounds : [b];
    for (var i = 0; i < ga.length; i++)
      for (var j = 0; j < gb.length; j++) {
        if (ga[i] === gb[j]) return true;
        try { if (CircuitEngine.isConnected(ga[i], gb[j], g)) return true; } catch (e) {}
      }
    return false;
  }

  function checkWiring() {
    var u = unitNow();
    var groups = WIRING_SETS[u] || WIRING_SETS.horn;
    var grounds = GROUND_SETS[u] || GROUND_SETS.horn;
    var g = wiringGraph();
    var ok = 0;
    var missing = [];
    var ctrl = true;
    var rest = groups;
    if (u === 'horn') {
      // relay_85/86 任一接到按鈕即算控制段完成（取較佳者）
      ctrl = groupOk('relay_85', 'btn_in', g, grounds) || groupOk('relay_86', 'btn_in', g, grounds);
      rest = groups.filter(function (p) {
        return !(p[0] === 'relay_85' || p[0] === 'relay_86');
      });
    }
    rest.forEach(function (p) {
      if (groupOk(p[0], p[1], g, grounds)) ok++;
      else missing.push(p[0] + '↔' + p[1]);
    });
    var total = rest.length + (u === 'horn' ? 1 : 0);
    if (u === 'horn') {
      if (ctrl) ok++;
      else missing.push('relay_85/86↔btn_in');
    }
    return { score10: Math.round(ok / total * 10), ok: ok, total: total, missing: missing };
  }

  function probeModes() {
    var modes = {};
    try {
      NTC_LOG.filter('probe_measure').forEach(function (e) {
        if (e.data && e.data.mode) modes[e.data.mode] = 1;
      });
    } catch (e) {}
    return Object.keys(modes);
  }

  function knobScore(maxV) {
    var modes = probeModes().join(' ');
    var hasV = /V/.test(modes), hasR = /Ω|K/.test(modes);
    if (hasV && hasR) return maxV;
    if (hasV || hasR) return Math.round(maxV * 0.6);
    return 0;
  }

  function coverageScore(maxV, evidencePoints) {
    var rel = (REL_NODES[unitNow()] || REL_NODES.horn).concat(evidencePoints || []);
    var seen = {};
    try {
      NTC_LOG.probeCoverage().forEach(function (n) { seen[n] = 1; });
    } catch (e) {}
    var hit = rel.filter(function (n) { return seen[n]; }).length;
    return Math.round(clamp(hit / 4, 0, 1) * maxV);
  }

  function timeScore(durationMs, level) {
    var target = TIME_TARGET[level] || TIME_TARGET.standard;
    if (!durationMs || durationMs <= 0) return 5;
    if (durationMs <= target) return 10;
    return Math.round(clamp(10 * (2 - durationMs / target), 0, 10));
  }

  function retryScore(resubmits) {
    return clamp(10 - 5 * (resubmits || 0), 0, 10);
  }

  function itemOf(r) {
    try {
      var id = (r.configId) || (NTC_LOG.session && NTC_LOG.session.faultConfigId) || '';
      return ((window.HORN_BANK && HORN_BANK.getById(id)) || (window.START_BANK && START_BANK.getById(id)) || null);
    } catch (e) { return null; }
  }

  function scoreSingle(r) {
    var parts = {};
    var choice = '';
    try {
      var sel = document.querySelector('input[name="diagnosis"]:checked');
      choice = sel ? sel.value : '';
    } catch (e) {}
    var correct = (window.__NTC_LAST_ITEM && window.__NTC_LAST_ITEM.faults[0]) || '';
    if (r.isPass) parts['結果正確'] = 40;
    else if (choice && (CLOSE_PAIRS[correct] || []).includes(choice)) parts['結果相近'] = 15;
    else parts['結果正確'] = 0;
    var item = itemOf(r);
    parts['量測覆蓋'] = coverageScore(25, item && item.evidencePoints);
    parts['檔位運用'] = knobScore(5);
    var w = checkWiring();
    parts['配線完整'] = w.score10;
    parts['用時'] = timeScore(r.durationMs, r.level);
    parts['一次繳交'] = retryScore(r.resubmits);
    var total = 0;
    for (var k in parts) total += parts[k];
    return { total: clamp(total, 0, 100), parts: parts, wiring: w };
  }

  function scoreMulti(r) {
    var parts = {};
    var item = itemOf(r);
    var n = (item && item.faults.length) || 2;
    if(unitNow()==='start' && item && item.track==='C') {
      var count=item.faults.length;
      parts['故障找出']=Math.round(clamp(((r.faultHits||0)-0.5*(r.faultExtras||0))/count,0,1)*30);
      parts['量測證據']=Math.round(clamp((r.evidenceStages||0)/count,0,1)*25);
      parts['分段維修']=clamp(Math.round((r.repairOk||0)/count*25)-5*(r.repairMiss||0),0,25);
      parts['配線完整']=checkWiring().score10;
      parts['功能確認']=r.finalConfirmed?10:0;
      return {total:Object.keys(parts).reduce(function(sum,k){return sum+parts[k];},0),parts:parts};
    }

    var hitRate = clamp(((r.faultHits || 0) - 0.5 * (r.faultExtras || 0)) / n, 0, 1);
    parts['故障找出'] = Math.round(hitRate * 30);
    parts['量測證據'] = (r.evidenceHits >= 2) ? 10 : (r.evidenceHits === 1 ? 5 : 0);
    parts['量測覆蓋'] = coverageScore(15, item && item.evidencePoints);
    parts['檔位運用'] = knobScore(5);
    var stages = (item && item.stages.length) || n;
    var miss = r.repairMiss || 0;
    parts['分段維修'] = clamp(Math.round((r.repairOk >= stages ? 20 : (r.repairOk / stages) * 20) - 5 * miss), 0, 20);
    parts['用時'] = timeScore(r.durationMs, r.level || 'challenge');
    parts['一次繳交'] = retryScore(r.resubmits);
    var total = 0;
    for (var k in parts) total += parts[k];
    return { total: clamp(total, 0, 100), parts: parts };
  }

  function score(r) {
    return r.multi ? scoreMulti(r) : scoreSingle(r);
  }

  // ===== 考評重考紀錄（2026-11-11）=====
  // 同一單元／班級／座號／試卷／難度在同一天的繳交次數，跨「重新開始」保留，
  // 避免重新登入後繳交次數歸零。存在本機瀏覽器；清除瀏覽器資料或換電腦仍會重算，
  // 教師端歷史紀錄仍會保留每一次繳交。
  var ATTEMPT_KEY = 'ntc-attempts-v1';
  var ATTEMPT_KEEP_DAYS = 60;
  function attemptKey(ctx, level) {
    ctx = ctx || {};
    return [unitNow(), ctx.cls || '', ctx.seat || '', ctx.paper || '', level || '', ctx.date || ''].join('|');
  }
  function attemptStore() {
    try { return JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function priorAttempts(ctx, level) {
    var hit = attemptStore()[attemptKey(ctx, level)];
    return (hit && hit.n) || 0;
  }
  function recordAttempt(ctx, level) {
    var store = attemptStore(), key = attemptKey(ctx, level), now = Date.now();
    var limit = now - ATTEMPT_KEEP_DAYS * 86400000;
    Object.keys(store).forEach(function (k) { if (!store[k] || store[k].last < limit) delete store[k]; });
    store[key] = { n: ((store[key] && store[key].n) || 0) + 1, last: now };
    try { localStorage.setItem(ATTEMPT_KEY, JSON.stringify(store)); } catch (e) {}
    return store[key].n;
  }

  // ===== 考評及格門檻（2026-11-11）=====
  // 通過＝①診斷正確 ②配線完成 ③至少 2 筆有效量測，且電壓檔、電阻檔都用過 ④總分 ≥ 60。
  // 有效量測：紅黑探棒都接觸量測點、檔位為電壓或電阻、有讀值、插孔正確（valid 不為 false）。
  var PASS_SCORE = 60, MIN_VALID_MEASURES = 2;
  function isVoltMode(m) { return /V$/.test(m || ''); }
  function isOhmMode(m) { return /Ω|K$|M$/.test(m || ''); }
  function validMeasures() {
    var list = [];
    try {
      NTC_LOG.filter('probe_measure').forEach(function (e) {
        var d = e.data || {};
        if (d.red && d.black && d.valid !== false && d.reading !== '' && d.reading != null && (isVoltMode(d.mode) || isOhmMode(d.mode))) list.push(d);
      });
    } catch (e) {}
    return list;
  }
  function passGate(r) {
    var reasons = [];
    var diagnosisOk = !!r.diagnosisCorrect;
    if (!diagnosisOk) {
      if (r.multi) {
        if ((r.faultHits || 0) < ((r.correctFaults && r.correctFaults.length) || 2) || (r.faultExtras || 0) > 0) reasons.push('故障尚未全部正確找出（可能有遺漏或多選）');
        if (r.evidenceHits === 0 || (r.evidence && r.evidence.length < 2)) reasons.push('量測證據不足，請以量測結果支持你的判斷');
        if (!reasons.length) reasons.push('複合故障診斷未完全正確');
      } else reasons.push('診斷結果不正確');
    }
    var w = checkWiring();
    var wiringOk = w.ok >= w.total;
    if (!wiringOk) reasons.push('配線尚未完成（' + w.ok + '／' + w.total + ' 段）');
    var vm = validMeasures();
    var hasV = vm.some(function (d) { return isVoltMode(d.mode); });
    var hasR = vm.some(function (d) { return isOhmMode(d.mode); });
    var measureOk = vm.length >= MIN_VALID_MEASURES && hasV && hasR;
    if (!vm.length) reasons.push('沒有有效的量測紀錄，請先用電表找證據再作答');
    else {
      if (vm.length < MIN_VALID_MEASURES) reasons.push('有效量測不足 ' + MIN_VALID_MEASURES + ' 筆');
      if (!hasV) reasons.push('沒有使用電壓檔量測');
      if (!hasR) reasons.push('沒有使用電阻檔量測');
    }
    var total = (r.score && typeof r.score.total === 'number') ? r.score.total : 0;
    var scoreOk = total >= PASS_SCORE;
    if (!scoreOk) reasons.push('總分未達 ' + PASS_SCORE + ' 分');
    return { pass: diagnosisOk && wiringOk && measureOk && scoreOk, reasons: reasons,
      checks: { diagnosis: diagnosisOk, wiring: wiringOk, measure: measureOk, score: scoreOk, validMeasures: vm.length } };
  }
  function examFeedback(r) { return passGate(r).reasons; }

  return { score: score, checkWiring: checkWiring, CLOSE_PAIRS: CLOSE_PAIRS,
    priorAttempts: priorAttempts, recordAttempt: recordAttempt, examFeedback: examFeedback,
    passGate: passGate, validMeasures: validMeasures, PASS_SCORE: PASS_SCORE };
})();
