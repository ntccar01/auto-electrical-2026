/* NTC 評分引擎（P2-S4，混合制自動初評）
 * 輸入：app.js 繳交時整理的 lastResultData（含 Logger 統計）
 * 輸出：{ total, parts }，parts 中文鍵供結果頁直接顯示。
 * 單一題：結果40＋覆蓋25＋檔位5＋配線10＋時間10＋重繳10
 * 複合題：結果30＋證據10＋覆蓋15＋檔位5＋維修20＋時間10＋重繳10
 */
window.ASSESS = (function () {
  var CLOSE_PAIRS = {
    fuse_open: ['fuse_link_open'], fuse_link_open: ['fuse_open'],
    horn1_open: ['horn2_open'], horn2_open: ['horn1_open', 'wireC_open'], wireC_open: ['horn2_open'],
    relay_coil_open: ['relay_switch_fail', 'btn_open'], relay_switch_fail: ['relay_coil_open'],
    btn_open: ['relay_coil_open']
  };
  var TIME_TARGET = { basic: 8 * 60 * 1000, standard: 10 * 60 * 1000, challenge: 20 * 60 * 1000 };
  var GROUND_ANY = ['bat_neg', 'horn1_chassis', 'horn2_chassis', 'btn_chassis'];
  // 配線檢核：必要導通群組（喇叭單元標準配線）
  var WIRING_GROUPS = [
    ['bat_pos', 'fuse_link_in'], ['fuse_link_out', 'fuse_in'],
    ['fuse_out', 'relay_30'], ['fuse_out', 'relay_86'],
    ['relay_85', 'btn_in'], ['relay_86', 'btn_in'],
    ['btn_out', 'bat_neg'],
    ['relay_87', 'horn1_in'], ['relay_87', 'horn2_in'],
    ['horn1_gnd', 'bat_neg'], ['horn2_gnd', 'bat_neg']
  ];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function graphNow() {
    try {
      var pressed = (typeof isButtonPressed !== 'undefined') ? isButtonPressed : false;
      var relayOn = document.getElementById('relay').classList.contains('relay-active');
      return CircuitEngine.buildGraph(pressed, relayOn);
    } catch (e) { return {}; }
  }

  // 任一端在群組內即視為該要求達成（搭鐵網任一點皆可）
  function groupOk(a, b, g) {
    var ga = (GROUND_ANY.indexOf(a) >= 0) ? GROUND_ANY : [a];
    var gb = (GROUND_ANY.indexOf(b) >= 0) ? GROUND_ANY : [b];
    for (var i = 0; i < ga.length; i++)
      for (var j = 0; j < gb.length; j++) {
        if (ga[i] === gb[j]) return true;
        try { if (CircuitEngine.isConnected(ga[i], gb[j], g)) return true; } catch (e) {}
      }
    return false;
  }

  function checkWiring() {
    var g = graphNow();
    var ok = 0;
    var missing = [];
    // relay_85/86 任一接到按鈕即算控制段完成（取較佳者）
    var ctrl = groupOk('relay_85', 'btn_in', g) || groupOk('relay_86', 'btn_in', g);
    var rest = WIRING_GROUPS.filter(function (p) {
      return !(p[0] === 'relay_85' || p[0] === 'relay_86');
    });
    rest.forEach(function (p) {
      if (groupOk(p[0], p[1], g)) ok++;
      else missing.push(p[0] + '↔' + p[1]);
    });
    var total = rest.length + 1;
    if (ctrl) ok++;
    else missing.push('relay_85/86↔btn_in');
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
    var rel = ['bat_pos', 'fuse_out', 'relay_30', 'relay_87', 'btn_in', 'horn1_in', 'horn2_in']
      .concat(evidencePoints || []);
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
      return (window.HORN_BANK && HORN_BANK.getById(id)) || null;
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

  return { score: score, checkWiring: checkWiring, CLOSE_PAIRS: CLOSE_PAIRS };
})();
