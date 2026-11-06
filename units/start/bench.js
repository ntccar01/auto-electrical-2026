'use strict';
const $ = id => document.getElementById(id);
let powered = false;
let coilHeld = false;
let manualHeld = false;
let result = '';
const measurements = [];
let nextRecordNumber = 1;
let chatterTimer = null;
let chatterEngaged = false;
const supplyVoltage = 12;
const loadResistance = 1.5;
const pullResistance = 2;
const holdResistance = 30;
const normalContactResistance = 0.01;
const highContactResistance = 3;

const initial = new URLSearchParams(location.search).get('contact');
if (['fail', 'hold_open', 'high_resistance'].includes(initial)) $('scenario').value = initial;

function plungerEngaged() {
    return manualHeld || (coilHeld && ($('scenario').value !== 'hold_open' || chatterEngaged));
}

function contactClosed() {
    return plungerEngaged() && $('scenario').value !== 'fail';
}

function contactResistance() {
    return $('scenario').value === 'high_resistance' ? highContactResistance : normalContactResistance;
}

function benchVoltages() {
    if (!powered) return { B: 0, M: 0, ST: 0, G: 0 };
    const contactConductance = contactClosed() ? 1 / contactResistance() : 0;
    const pullConductance = coilHeld ? 1 / pullResistance : 0;
    // B and energized ST both feed M; the pull-in path can still carry current across a resistive main contact.
    const motorVoltage = supplyVoltage * (contactConductance + pullConductance) /
        (contactConductance + pullConductance + 1 / loadResistance);
    return { B: supplyVoltage, M: motorVoltage, ST: coilHeld ? supplyVoltage : 0, G: 0 };
}

function stopChatter() {
    clearInterval(chatterTimer);
    chatterTimer = null;
    chatterEngaged = false;
}

function startChatter() {
    stopChatter();
    if ($('scenario').value !== 'hold_open') return;
    // Slow teaching sequence, conditional on the pull-in coil being able to move the plunger alone.
    chatterTimer = setInterval(() => {
        chatterEngaged = !chatterEngaged;
        render();
    }, 650);
}

function render() {
    const closed = contactClosed();
    const engaged = plungerEngaged();
    const chattering = coilHeld && $('scenario').value === 'hold_open';
    const voltage = benchVoltages();
    const loadCurrent = voltage.M / loadResistance;
    const contactCurrent = powered && closed ? (voltage.B - voltage.M) / contactResistance() : 0;
    const normalCurrent = supplyVoltage / loadResistance;
    const driving = powered && closed;
    $('loadCurrent').textContent = loadCurrent.toFixed(2) + ' A';
    $('contactCurrent').textContent = contactCurrent.toFixed(2) + ' A';
    $('loadStatus').textContent = !powered ? '台架斷電，模擬負載停止' :
        !closed ? '主接點未供電，可能仍有線圈回送電流' :
        $('scenario').value === 'high_resistance' ? '接點高阻，負載電流下降／慢轉示意' : '主接點供電，正常驅動示意';
    $('motorRotor').classList.toggle('rotating', driving);
    $('motorRotor').style.animationDuration = driving ? (normalCurrent / loadCurrent).toFixed(2) + 's' : '';
    $('power').textContent = powered ? '斷開台架電源' : '接通台架電源';
    $('power').setAttribute('aria-pressed', String(powered));
    $('powerState').textContent = powered ? '台架電源已接通' : '台架電源已斷開';
    $('coil').disabled = !powered;
    $('manual').disabled = powered;
    $('motion').textContent = chattering ? '無法保持：柱塞與小齒輪反覆吸合、回位（慢速教學示意）' :
        engaged ? '柱塞已推動，請量測確認主接點導通' : '柱塞已回位';
    $('motion').dataset.engaged = String(engaged);
    $('holdLabel').textContent = $('scenario').value === 'hold_open' ? '吸住線圈 ST–G 開路' : '吸住線圈 ST–G 30Ω';
    $('pinion').setAttribute('transform', engaged ? 'translate(270 330)' : 'translate(210 330)');
    // Mechanical closure is visible even when the electrical contact has failed.
    $('contact').setAttribute('d', engaged ? 'M100 230H385' : 'M100 230L300 190');
    $('plunger').setAttribute('y', engaged ? '200' : '160');

    const red = $('red').value;
    const black = $('black').value;
    const resistance = $('mode').value === 'resistance';
    const blocked = resistance && powered;
    $('warning').hidden = !blocked;
    $('warning').textContent = blocked ? '台架仍通電。已停止 Ω 檔量測，請斷開台架電源，並以電壓檔確認無電壓。' : '';
    $('record').disabled = blocked;
    if (blocked) {
        result = 'LIVE';
    } else if (resistance) {
        const ohms = benchResistance(red, black);
        result = ohms == null ? 'OL' : ohms.toFixed(ohms < 1 ? 2 : 1) + ' Ω';
    } else {
        result = (voltage[red] - voltage[black]).toFixed(2) + ' V';
    }
    $('reading').textContent = result;
}

function benchResistance(red, black) {
    const graph = { ST: [['M', pullResistance]], G: [], M: [['ST', pullResistance]], B: [] };
    if ($('scenario').value !== 'hold_open') {
        graph.ST.push(['G', holdResistance]);
        graph.G.push(['ST', holdResistance]);
    }
    if (contactClosed()) {
        graph.B.push(['M', contactResistance()]);
        graph.M.push(['B', contactResistance()]);
    }
    const queue = [[red, 0]];
    const visited = new Set();
    while (queue.length) {
        const [node, ohms] = queue.shift();
        if (node === black) return ohms;
        if (visited.has(node)) continue;
        visited.add(node);
        for (const [next, resistance] of graph[node]) queue.push([next, ohms + resistance]);
    }
    return null;
}

function taipeiTime(date) {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).format(date);
}

function updateRecordControls() {
    $('recordCount').textContent = '目前 ' + measurements.length + ' 筆';
    $('downloadRecords').disabled = measurements.length === 0;
    $('clearRecords').disabled = measurements.length === 0;
}

function saveMeasurement() {
    if ($('record').disabled) return;
    const classCode = $('recordClass').value.trim();
    const seat = $('recordSeat').value.trim();
    if ((classCode && !/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,29}$/u.test(classCode)) ||
        (seat && !/^[1-9]\d{0,2}$/.test(seat))) {
        $('recordStatus').textContent = '未記錄。班級代號限中英文字、數字、底線與連字號；座號限1～999。';
        return;
    }
    const now = new Date();
    const voltage = benchVoltages();
    const entry = {
        number: nextRecordNumber++, version: 'START-BENCH-V4',
        timestamp: now.toISOString(), localTime: taipeiTime(now), timezone: 'Asia/Taipei',
        classCode, seat, scenario: $('scenario').value,
        scenarioLabel: $('scenario').selectedOptions[0].textContent,
        action: coilHeld ? '線圈通電' : manualHeld ? '手動推動' : '柱塞回位',
        powered, engaged: plungerEngaged(),
        mode: $('mode').selectedOptions[0].textContent,
        red: $('red').value, black: $('black').value, reading: result,
        contactCurrent: powered && contactClosed() ? (voltage.B - voltage.M) / contactResistance() : 0,
        loadCurrent: voltage.M / loadResistance
    };
    measurements.push(entry);
    const item = document.createElement('li');
    item.textContent = entry.localTime + '／' + (entry.classCode || '未填班級') + '／' +
        (entry.seat || '未填座號') + '／' + entry.scenarioLabel + '／' + entry.action + '／' +
        entry.red + '–' + entry.black + '／' + entry.reading +
        (entry.powered ? '／主接點電流 ' + entry.contactCurrent.toFixed(2) + ' A／負載電流 ' + entry.loadCurrent.toFixed(2) + ' A' : '');
    $('records').append(item);
    updateRecordControls();
    $('recordStatus').textContent = entry.classCode && entry.seat ? '已記錄。' :
        '已記錄，但這筆班級或座號未填；後續填寫不會追溯變更既有記錄。';
}

function csvCell(value) {
    const raw = String(value ?? '');
    const safe = typeof value === 'string' && /^\s*[=+@-]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
}

function downloadMeasurements() {
    if (measurements.length === 0) return;
    const headers = ['記錄類型', '版本', '序號', 'UTC時間', '台北日期時間', '時區', '班級代號', '座號',
        '情境代碼', '情境', '操作', '台架電源', '柱塞狀態', '電表檔位', '紅探棒', '黑探棒', '讀值',
        'B-M主接點電流_A', '模擬負載總電流_A'];
    const rows = measurements.map(entry => ['台架練習／教師參考', entry.version, entry.number,
        entry.timestamp, entry.localTime, entry.timezone, entry.classCode, entry.seat,
        entry.scenario, entry.scenarioLabel, entry.action, entry.powered ? '接通' : '斷開',
        entry.engaged ? '推動' : '回位', entry.mode, entry.red, entry.black, entry.reading,
        entry.contactCurrent, entry.loadCurrent]);
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'start-bench-records-' + taipeiTime(new Date()).replace(/[ :]/g, '-') + '.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('recordStatus').textContent = '已下載 ' + measurements.length + ' 筆 CSV，可交給教師參考。' +
        (measurements.some(entry => !entry.classCode || !entry.seat) ? '部分記錄未填班級或座號。' : '');
}

function clearMeasurements() {
    if (measurements.length === 0) return;
    if (!confirm('確定清空目前 ' + measurements.length + ' 筆記錄？清空後無法復原，請先按「下載記錄 CSV」保存。')) return;
    measurements.length = 0;
    $('records').replaceChildren();
    updateRecordControls();
    $('recordStatus').textContent = '記錄已清空，可繼續操作。';
}

function releaseControls() {
    if (coilHeld || manualHeld) saveMeasurement();
    coilHeld = false;
    manualHeld = false;
    stopChatter();
    render();
}

function setupHold(id, isManual) {
    const button = $(id);
    const begin = () => {
        if (button.disabled) return;
        if (isManual) manualHeld = true;
        else {
            if (coilHeld) return;
            coilHeld = true;
            startChatter();
        }
        render();
    };
    button.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        begin();
    });
    button.addEventListener('keydown', event => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        begin();
    });
    button.addEventListener('keyup', event => {
        if (event.key === ' ' || event.key === 'Enter') releaseControls();
    });
    button.addEventListener('blur', releaseControls);
}
$('power').addEventListener('click', () => {
    powered = !powered;
    releaseControls();
});
$('scenario').addEventListener('change', releaseControls);
for (const id of ['mode', 'red', 'black']) $(id).addEventListener('change', render);
setupHold('coil', false);
setupHold('manual', true);
window.addEventListener('pointerup', releaseControls);
window.addEventListener('pointercancel', releaseControls);
window.addEventListener('blur', releaseControls);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseControls();
});
$('record').addEventListener('click', saveMeasurement);
$('downloadRecords').addEventListener('click', downloadMeasurements);
$('clearRecords').addEventListener('click', clearMeasurements);
updateRecordControls();
render();
