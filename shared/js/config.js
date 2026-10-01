/* NTC 電系實習平台共用設定（V2-P0）
 * 老師只改這檔：GAS URL、學期、單元開關、配分。
 * 凍結 API：各單元不得自行新增全域 key，統一經 NTC_CONFIG 讀取。
 */
window.NTC_CONFIG = {
  version: '2.0-P0',
  // 教師 GAS Web App URL（未設定時上傳按鈕會提示）
  gasUrl: '',
  semester: '',
  // 單元註冊表：採計勾選與學習地圖由此驅動
  units: [
    { id: 'horn', name: '喇叭系統', enabled: true },
    { id: 'start', name: '起動系統', enabled: false }
  ],
  // 評分預設權重（查修 / 綜合，P2 評分引擎使用）
  scoring: {
    diagnose: { result: 40, process: 40, conduct: 20 },
    combo: { wiring: 30, diagnose: 70 },
    wiring: { correctness: 70, neatness: 10, time: 20 },
    teacherAdjustMax: 10
  },
  // 雷達圖預設：能力五軸（教師可勾選採計單元改變計入範圍）
  radarAxes: ['配線', '量測', '診斷', '儀器操作', '安全規範']
};
