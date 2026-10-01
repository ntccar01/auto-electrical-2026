/* OEM 浮動線路圖（P1）
 * 可拖曳・縮放・最小化・線路圖/正常值分頁。考評模式隱藏（P2 接難度連動）。
 */
window.OEM = (function () {
  var W = 380, MINW = 280, MAXW = 640;
  function el(id) { return document.getElementById(id); }

  function toggle(force) {
    var f = el('oemFloat');
    if (!f) return;
    var show = (force !== undefined) ? force : f.classList.contains('hidden');
    f.classList.toggle('hidden', !show);
    if (show && window.NTC_LOG) NTC_LOG.log('oem_open', {});
  }
  function zoom(d) {
    W = Math.min(MAXW, Math.max(MINW, W + d));
    el('oemFloat').style.width = W + 'px';
  }
  function minimize() { el('oemBody').classList.toggle('hidden'); }
  function tab(name) {
    el('oemTabDiagram').classList.toggle('hidden', name !== 'diagram');
    el('oemTabValues').classList.toggle('hidden', name !== 'values');
    var btns = document.querySelectorAll('#oemFloat .oem-tab');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-tab') === name);
  }
  function setExam(isExam) {
    var b = el('oemBtn');
    if (b) b.classList.toggle('hidden', isExam);
    if (isExam) toggle(false);
  }

  function initDrag() {
    var head = el('oemHead'), box = el('oemFloat');
    if (!head || !box || head.dataset.dragInit) return;
    head.dataset.dragInit = '1';
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    head.addEventListener('pointerdown', function (e) {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      var r = box.getBoundingClientRect(), pr = box.parentElement.getBoundingClientRect();
      ox = r.left - pr.left; oy = r.top - pr.top;
      box.style.left = ox + 'px'; box.style.top = oy + 'px'; box.style.right = 'auto';
      try { head.setPointerCapture(e.pointerId); } catch (err) {}
    });
    head.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      e.preventDefault();
      box.style.left = (ox + e.clientX - sx) + 'px';
      box.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
    });
    head.addEventListener('pointerup', function () { dragging = false; });
    head.addEventListener('pointercancel', function () { dragging = false; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDrag);
  else initDrag();

  return { toggle: toggle, zoom: zoom, minimize: minimize, tab: tab, setExam: setExam };
})();
