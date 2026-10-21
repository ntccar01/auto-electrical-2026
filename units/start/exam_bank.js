/* 起動單元題庫（V2，8+3 題；C軌第二輪）
 * ID 規則：START-{S|C|W}-NN。考評僅 S 軌（基礎/標準池）；W 軌供練習與教師預覽。
 */
window.START_BANK = (function () {
  var BANK_VERSION = '2.0';
  var FAULT_IDS = [
    'normal', 'fuse_open', 'battB_open', 'ns_open',
    'solHold_open', 'solPull_open', 'bm_fail', 'mot_open'
  ];
  var LABELS = {
    normal: '電路功能正常',
    fuse_open: '保險絲斷路',
    battB_open: 'B主電源線斷路（保險絲→電磁B）',
    ns_open: '空檔開關故障',
    solHold_open: '吸住線圈斷路',
    solPull_open: '吸入線圈斷路',
    bm_fail: 'B-M接點燒蝕',
    mot_open: '馬達本體斷路',
    wireA_open: '線束A斷路（電瓶→保險絲段配線）',
    wireB_open: '線束B斷路（點火ST鏈配線）',
    wireC_open: '線束C斷路（馬達搭鐵配線）'
  };

  var items = [
    { id: 'START-S-01', track: 'S', level: '基礎', modes: ['查修', '綜合'], faults: ['normal'], wiringTrap: null, symptoms: 'ST按下馬達正常搖轉（約180A）', evidencePoints: ['mot_M', 'bat_pos'], weight: 1, hintLevel: 1, enabled: true },
    { id: 'START-S-02', track: 'S', level: '基礎', modes: ['查修', '綜合'], faults: ['fuse_open'], wiringTrap: null, symptoms: '全車無電、ST無反應、保險絲入端有電', evidencePoints: ['fuse_in', 'fuse_out'], weight: 1, hintLevel: 1, enabled: true },
    { id: 'START-S-03', track: 'S', level: '標準', modes: ['查修', '綜合'], faults: ['battB_open'], wiringTrap: null, symptoms: '控制線圈可吸合但馬達不轉；保險絲後至電磁B的主電源配線斷路，B端可能有線圈回送電壓', evidencePoints: ['fuse_out', 'sol_B'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'START-S-04', track: 'S', level: '基礎', modes: ['查修', '綜合'], faults: ['ns_open'], wiringTrap: null, symptoms: 'ST有電到空檔入端、出端無電、不吸合', evidencePoints: ['ig_ST', 'sol_ST'], weight: 1, hintLevel: 1, enabled: true },
    { id: 'START-S-05', track: 'S', level: '標準', modes: ['查修', '綜合'], faults: ['solHold_open'], wiringTrap: null, symptoms: 'ST端有電但不吸合；ST-G電阻開路（正常約30Ω）', evidencePoints: ['sol_ST', 'sol_G'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'START-S-06', track: 'S', level: '標準', modes: ['查修', '綜合'], faults: ['solPull_open'], wiringTrap: null, symptoms: 'ST端有電但不吸合；ST-M電阻開路（正常約2Ω）', evidencePoints: ['sol_ST', 'sol_M'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'START-S-07', track: 'S', level: '標準', modes: ['查修', '綜合'], faults: ['bm_fail'], wiringTrap: null, symptoms: '有吸合聲（噠）但馬達不轉；B-M有壓降，M端僅有線圈回送電壓', evidencePoints: ['sol_B', 'sol_M'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'START-S-08', track: 'S', level: '基礎', modes: ['查修', '綜合'], faults: ['mot_open'], wiringTrap: null, symptoms: 'ST端有電但未吸合（本模型馬達斷路切斷吸入線圈搭鐵）；斷電量M-搭鐵電阻開路', evidencePoints: ['mot_M', 'mot_gnd'], weight: 1, hintLevel: 1, enabled: true },
    { id: 'START-W-01', track: 'W', level: '標準', modes: ['查修', '綜合'], faults: ['wireA_open'], wiringTrap: null, symptoms: '保險絲入端無電（電瓶→保險絲段配線斷）', evidencePoints: ['bat_pos', 'fuse_in'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'START-W-02', track: 'W', level: '標準', modes: ['查修', '綜合'], faults: ['wireB_open'], wiringTrap: null, symptoms: 'ST鏈中段無電（點火ST鏈配線斷）', evidencePoints: ['ig_ST', 'sol_ST'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'START-W-03', track: 'W', level: '標準', modes: ['查修', '綜合'], faults: ['wireC_open'], wiringTrap: null, symptoms: 'ST端有電但未吸合；馬達搭鐵配線斷路，吸入線圈迴路不通', evidencePoints: ['mot_gnd', 'bat_neg'], weight: 1, hintLevel: 2, enabled: true }
  ];

  var REPAIR_CATALOG = [
    { key: 'fuse', label: '換保險絲', fixes: ['fuse_open'] },
    { key: 'wireB', label: '換B主電源線', fixes: ['battB_open'] },
    { key: 'ns', label: '換空檔開關', fixes: ['ns_open'] },
    { key: 'solenoid', label: '換電磁開關', fixes: ['solHold_open', 'solPull_open', 'bm_fail'] },
    { key: 'motor', label: '換起動馬達', fixes: ['mot_open'] },
    { key: 'wireA', label: '換線束A', fixes: ['wireA_open'] },
    { key: 'wireB2', label: '換線束B', fixes: ['wireB_open'] },
    { key: 'wireC', label: '換線束C', fixes: ['wireC_open'] }
  ];

  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function assignFault(ctx, opts) {
    ctx = ctx || {};
    opts = opts || {};
    var pool = items.filter(function (it) {
      if (it.enabled === false) return false;
      if (opts.track && it.track !== opts.track) return false;
      if (!opts.track && it.track !== 'S') return false;
      if (opts.levels && opts.levels.indexOf(it.level) < 0) return false;
      return true;
    });
    if (!pool.length) pool = items.filter(function (it) { return it.track === 'S'; });
    var key = (ctx.cls || '') + '|' + (ctx.seat || '') + '|' + (ctx.paper || '') + '|' + (ctx.date || '') + '|' + (opts.track || 'S');
    var pick = pool[hashStr(key) % pool.length];
    return { configId: pick.id, faultId: pick.faults[0], item: pick };
  }

  function getById(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  return {
    version: BANK_VERSION, items: items, FAULT_IDS: FAULT_IDS, LABELS: LABELS,
    REPAIR_CATALOG: REPAIR_CATALOG,
    assignFault: assignFault, getById: getById, hashStr: hashStr
  };
})();
