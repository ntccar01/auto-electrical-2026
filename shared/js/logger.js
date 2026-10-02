/* NTC 學習歷程 Logger（P1）
 * 記錄學生查修過程，供 P2 評分引擎＋教師回放＋學習歷程證明使用。
 * 單一全域：window.NTC_LOG。事件一律離散（不逐幀），上限 2000 筆，localStorage 暫存。
 */
window.NTC_LOG = (function () {
  var MAX_EVENTS = 2000;
  var LS_KEY = 'ntc-log-v1';
  var t0 = Date.now();
  var seq = 0;

  var session = {
    id: 'S' + t0.toString(36) + Math.floor(Math.random() * 1296).toString(36),
    unit: 'horn',
    startedAt: new Date(t0).toISOString(),
    mode: 'practice', // practice | exam
    student: { cls: '', name: '', seat: '' },
    paper: '',
    faultConfigId: '',
    faultId: ''
  };
  var events = [];

  function persist() {
    try {
      var payload = { session: session, events: events.slice(-MAX_EVENTS) };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch (e) { /* 空間不足或隱私模式：僅記記憶體 */ }
  }

  function log(type, data) {
    events.push({ seq: seq++, t: Date.now() - t0, type: type, data: data || {} });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    persist();
    return events[events.length - 1];
  }

  function setSession(patch) {
    for (var k in patch) {
      if (k === 'student') { for (var sk in patch.student) session.student[sk] = patch.student[sk]; }
      else session[k] = patch[k];
    }
    persist();
  }

  function count(type) {
    var n = 0;
    for (var i = 0; i < events.length; i++) if (events[i].type === type) n++;
    return n;
  }

  function elapsed() { return Date.now() - t0; }

  function filter(type) {
    return events.filter(function (e) { return e.type === type; });
  }

  function probeCoverage() {
    var seen = {};
    filter('probe_measure').forEach(function (e) {
      if (e.data.red) seen[e.data.red] = 1;
      if (e.data.black) seen[e.data.black] = 1;
    });
    return Object.keys(seen).sort();
  }

  function exportData() {
    return { version: 1, session: JSON.parse(JSON.stringify(session)), events: JSON.parse(JSON.stringify(events)) };
  }

  // 歷史封存：考評繳交後把 session 摘要存入本機歷史（教師頁＋證書用，P2）
  var HIST_KEY = 'ntc-history-v1';
  var HIST_MAX = 200;
  function archive(summary) {
    try {
      var raw = localStorage.getItem(HIST_KEY);
      var list = raw ? JSON.parse(raw) : [];
      list.push({
        sid: session.id, archivedAt: new Date().toISOString(),
        unit: session.unit, mode: session.mode,
        cls: session.student.cls, name: session.student.name, seat: session.student.seat,
        paper: session.paper, faultConfigId: session.faultConfigId, faultId: session.faultId,
        eventCount: events.length,
        measureCount: count('probe_measure'), wireCount: count('wire_connect'),
        repairOk: count('repair_ok'), repairMiss: count('repair_miss'),
        durationMs: Date.now() - t0,
        summary: summary || {}
      });
      while (list.length > HIST_MAX) list.shift();
      localStorage.setItem(HIST_KEY, JSON.stringify(list));
      return list[list.length - 1];
    } catch (e) { return null; }
  }
  function history() {
    try {
      var raw = localStorage.getItem(HIST_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function historySave(list) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function clear() {
    events = [];
    t0 = Date.now();
    seq = 0;
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  // 啟動時嘗試接續同瀏覽器暫存（僅練習模式；考評每次新 session）
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      if (saved && saved.session && saved.session.mode === 'practice' && saved.events) {
        events = saved.events;
        seq = events.length;
      }
    }
  } catch (e) {}

  return {
    session: session, events: events,
    log: log, setSession: setSession, count: count, elapsed: elapsed,
    filter: filter, probeCoverage: probeCoverage,
    exportData: exportData, clear: clear,
    archive: archive, history: history, historySave: historySave
  };
})();
