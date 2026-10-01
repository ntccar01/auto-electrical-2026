/* 喇叭單元題庫（V2.1，17 題）
 * ID 規則：HORN-{S|C|W}-NN（S 單一 / C 複合 / W 配線陷阱・線束）
 * 考評預設僅從 S 軌（8 題）均勻指派；C/W 軌供練習與教師預覽，維修解鎖（P2）啟用。
 */
window.HORN_BANK = (function () {
  var BANK_VERSION = '2.1';
  // 與舊 faultOptions 對應的故障碼（順序保留，修掉試卷缺號問題）
  var FAULT_IDS = [
    'normal', 'fuse_link_open', 'fuse_open', 'relay_coil_open',
    'relay_switch_fail', 'btn_open', 'horn1_open', 'horn2_open'
  ];
  var LABELS = {
    normal: '電路功能正常',
    fuse_link_open: '易熔絲斷路',
    fuse_open: '保險絲斷路',
    relay_coil_open: '繼電器線圈斷路 (85-86)',
    relay_switch_fail: '繼電器開關接點故障 (30-87)',
    btn_open: '按鈕開關內部斷路',
    horn1_open: '上喇叭內部線圈斷路',
    horn2_open: '下喇叭內部線圈斷路',
    wireA_open: '線束A斷路（電瓶→保險絲段配線）',
    wireB_open: '線束B斷路（繼電器→按鈕段配線）',
    wireC_open: '線束C斷路（下喇叭→搭鐵配線）'
  };

  var items = [
    { id: 'HORN-S-01', track: 'S', level: '基礎', modes: ['查修', '綜合'], faults: ['normal'], wiringTrap: null, symptoms: '按鈕按下兩顆喇叭皆響', evidencePoints: ['horn1_in', 'horn2_in'], weight: 1, hintLevel: 1, enabled: true },
    { id: 'HORN-S-02', track: 'S', level: '基礎', modes: ['查修', '綜合'], faults: ['fuse_link_open'], wiringTrap: null, symptoms: '全車無電、按鈕無反應', evidencePoints: ['fuse_link_out', 'fuse_in'], weight: 1, hintLevel: 1, enabled: true },
    { id: 'HORN-S-03', track: 'S', level: '基礎', modes: ['查修', '綜合'], faults: ['fuse_open'], wiringTrap: null, symptoms: '按鈕無反應、易熔絲後端有電', evidencePoints: ['fuse_out', 'relay_30'], weight: 1, hintLevel: 1, enabled: true },
    { id: 'HORN-S-04', track: 'S', level: '標準', modes: ['查修', '綜合'], faults: ['relay_coil_open'], wiringTrap: null, symptoms: '繼電器不吸合、喇叭不響', evidencePoints: ['relay_85', 'relay_86'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'HORN-S-05', track: 'S', level: '標準', modes: ['查修', '綜合'], faults: ['relay_switch_fail'], wiringTrap: null, symptoms: '繼電器吸合但喇叭不響', evidencePoints: ['relay_30', 'relay_87'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'HORN-S-06', track: 'S', level: '標準', modes: ['查修', '綜合'], faults: ['btn_open'], wiringTrap: null, symptoms: '按鈕按下線圈迴路不通', evidencePoints: ['btn_in', 'btn_out'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'HORN-S-07', track: 'S', level: '標準', modes: ['查修', '綜合'], faults: ['horn1_open'], wiringTrap: null, symptoms: '僅下喇叭響', evidencePoints: ['horn1_in', 'horn1_gnd'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'HORN-S-08', track: 'S', level: '標準', modes: ['查修', '綜合'], faults: ['horn2_open'], wiringTrap: null, symptoms: '僅上喇叭響', evidencePoints: ['horn2_in', 'horn2_gnd'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'HORN-C-01', track: 'C', level: '挑戰', modes: ['查修', '綜合'], faults: ['relay_coil_open', 'horn2_open'], wiringTrap: null, symptoms: '繼電器不吸合（主因）；修復後仍僅上喇叭響', evidencePoints: ['relay_86', 'horn2_in'], weight: 2, hintLevel: 3, enabled: true },
    { id: 'HORN-C-02', track: 'C', level: '挑戰', modes: ['查修', '綜合'], faults: ['fuse_open', 'btn_open'], wiringTrap: null, symptoms: '全迴路無電（主因）；修復後按鈕仍不通', evidencePoints: ['fuse_out', 'btn_out'], weight: 2, hintLevel: 3, enabled: true },
    { id: 'HORN-C-03', track: 'C', level: '挑戰', modes: ['查修', '綜合'], faults: ['relay_switch_fail', 'horn1_open'], wiringTrap: null, symptoms: '繼電器吸合但無聲（主因）；修復後僅下喇叭響', evidencePoints: ['relay_87', 'horn1_in'], weight: 2, hintLevel: 3, enabled: true },
    { id: 'HORN-C-04', track: 'C', level: '挑戰', modes: ['查修', '綜合'], faults: ['horn1_open', 'horn2_open'], wiringTrap: null, symptoms: '繼電器正常吸合但雙喇叭皆不響', evidencePoints: ['relay_87', 'horn1_in', 'horn2_in'], weight: 2, hintLevel: 3, enabled: true },
    { id: 'HORN-W-01', track: 'W', level: '標準', modes: ['綜合'], faults: ['normal'], wiringTrap: 'ground_missing', symptoms: '喇叭搭鐵漏接、時響時不響', evidencePoints: ['horn1_gnd', 'horn2_gnd'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'HORN-W-02', track: 'W', level: '挑戰', modes: ['綜合'], faults: ['normal'], wiringTrap: 'relay_30_87_swapped', symptoms: '繼電器 30/87 對調、主迴路異常', evidencePoints: ['relay_30', 'relay_87'], weight: 1, hintLevel: 3, enabled: true },
    { id: 'HORN-W-03', track: 'W', level: '標準', modes: ['查修', '綜合'], faults: ['wireA_open'], wiringTrap: null, symptoms: '易熔絲入端無電（電瓶→保險絲段配線斷，須先配好該段線才會發作）', evidencePoints: ['bat_pos', 'fuse_link_in'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'HORN-W-04', track: 'W', level: '標準', modes: ['查修', '綜合'], faults: ['wireB_open'], wiringTrap: null, symptoms: '繼電器不吸合（繼電器→按鈕段配線斷，線圈迴路不通）', evidencePoints: ['relay_85', 'btn_in'], weight: 1, hintLevel: 2, enabled: true },
    { id: 'HORN-W-05', track: 'W', level: '標準', modes: ['查修', '綜合'], faults: ['wireC_open'], wiringTrap: null, symptoms: '僅上喇叭響（下喇叭→搭鐵配線斷，搭鐵迴路不通）', evidencePoints: ['horn2_gnd', 'horn2_chassis'], weight: 1, hintLevel: 2, enabled: true }
  ];

  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
    return h;
  }

  // 依班級+座號+試卷+日期均勻指派；預設僅 S 軌（8 題全覆蓋，修掉舊版缺號問題）
  function assignFault(ctx, opts) {
    ctx = ctx || {};
    opts = opts || {};
    var pool = items.filter(function (it) {
      if (it.enabled === false) return false;
      if (opts.track) return it.track === opts.track;
      return it.track === 'S';
    });
    if (!pool.length) pool = items.slice(0, 8);
    var key = (ctx.cls || '') + '|' + (ctx.seat || '') + '|' + (ctx.paper || '') + '|' + (ctx.date || '');
    var pick = pool[hashStr(key) % pool.length];
    return { configId: pick.id, faultId: pick.faults[0], item: pick };
  }

  function getById(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  return {
    version: BANK_VERSION, items: items, FAULT_IDS: FAULT_IDS, LABELS: LABELS,
    assignFault: assignFault, getById: getById, hashStr: hashStr
  };
})();
