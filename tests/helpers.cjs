const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function makeContext(seed = {}) {
  const store = new Map(Object.entries(seed));
  const elements = new Map();
  function element() {
    const classes = new Set();
    return { textContent: '', innerText: '', innerHTML: '', value: '', style: {}, dataset: {},
      classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x), toggle: (x,on) => on ? classes.add(x) : classes.delete(x) },
      addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {}, setAttribute() {}, getAttribute() { return null; },
      querySelector() { return element(); }, querySelectorAll() { return []; },
      getScreenCTM() { return { a: 1, d: 1, e: 0, f: 0 }; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
      createSVGPoint() { return {x: 0, y: 0}; }
    };
  }
  const ctx = { console, Date, Math, Set, Map, Object, JSON,
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      querySelector() { return null; }, querySelectorAll() { return []; }, createElementNS: element, addEventListener() {} },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,String(v)), removeItem: k => store.delete(k) },
    alert() {}, confirm() { return false; }, setTimeout() {}, clearTimeout() {}, addEventListener() {}, removeEventListener() {}, location: {search:''} };
  ctx.window = ctx;
  vm.createContext(ctx);
  return {ctx, store, run: code => vm.runInContext(code, ctx), load: file => vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'), ctx, {filename:file})};
}
function app(unit, seed) {
  const h = makeContext(seed);
  ['shared/js/config.js', `units/${unit}/exam_bank.js`, 'shared/js/logger.js', 'shared/js/assessment.js', unit === 'start' ? 'units/start/app-start.js' : 'shared/js/app.js'].forEach(h.load);
  h.ctx.NTC_LOG.setSession({unit});
  return h;
}
const START_WIRES = [['bat_pos','fuse_in'],['fuse_out','ig_B'],['ig_ST','ns_in'],['ns_out','sol_ST'],['fuse_out','sol_B'],['sol_M','mot_M'],['sol_G','sol_chassis'],['mot_gnd','mot_chassis']];
const HORN_WIRES = [['bat_pos','fuse_link_in'],['fuse_link_out','fuse_in'],['fuse_out','relay_30'],['fuse_out','relay_86'],['relay_85','btn_in'],['btn_out','bat_neg'],['relay_87','horn1_in'],['relay_87','horn2_in'],['horn1_gnd','bat_neg'],['horn2_gnd','bat_neg']];
function wire(h, pairs) { h.run(`connections = ${JSON.stringify(pairs)}.map(p => ({start:p[0],end:p[1],points:[]}));`); }
module.exports = { app, makeContext, wire, START_WIRES, HORN_WIRES, root };
