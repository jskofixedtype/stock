/*
 * app.js — 통합: 입력/이력 이벤트 → 상태 갱신 → calc → DOM·차트 렌더
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var lastPrice = { current: NaN, prevClose: NaN, at: 0 };
  var history = [];

  /* ---------- 포맷 ---------- */
  function usd(v) { return isFinite(v) ? '$' + (Math.round(v * 100) / 100).toFixed(2) : '—'; }
  function pct(v) { return isFinite(v) ? (Math.round(v * 100) / 100) + '%' : '—'; }
  function int(v) { return isFinite(v) ? Math.round(v).toLocaleString() : '—'; }

  /* ---------- 상태 수집 ---------- */
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  function settingsFromInputs() {
    return {
      seed: num($('seed').value),
      divisions: num($('divisions').value),
      targetRate: num($('targetRate').value),
      avgPrice: num($('avgPrice').value),
      quantity: num($('quantity').value)
    };
  }

  // 이력이 있으면 평단·수량은 이력에서 재계산, 없으면 입력값 사용
  function currentState() {
    var s = settingsFromInputs();
    if (history.length) {
      var r = IBHistory.recalcFromHistory(history, s.seed);
      s.avgPrice = r.avgPrice;
      s.quantity = r.quantity;
      s._derived = true;
      s._realizedPnl = r.realizedPnl;
    }
    return s;
  }

  function currentPrice() {
    var mCur = parseFloat($('mCurrent').value);
    var mPrev = parseFloat($('mPrev').value);
    return {
      current: isFinite(mCur) ? mCur : lastPrice.current,
      prevClose: isFinite(mPrev) ? mPrev : lastPrice.prevClose
    };
  }

  /* ---------- 렌더 ---------- */
  function renderAll() {
    var state = currentState();
    var price = currentPrice();
    var d = IBCalc.computeDerived(state);
    var orders = IBCalc.computeOrders(state, price, d);

    // 이력 파생 시에만 입력 필드에 값을 덮어쓴다.
    // (수동 입력 중에는 재대입하지 않아야 소수점 등 입력 도중 커서가 튀지 않음)
    var derived = !!state._derived;
    if (derived) {
      $('avgPrice').value = Math.round(state.avgPrice * 100) / 100;
      $('quantity').value = Math.round(state.quantity);
    }
    $('avgPrice').readOnly = derived;
    $('quantity').readOnly = derived;
    $('stateSource').textContent = derived
      ? '평단·수량은 거래 이력에서 자동 계산됩니다.'
      : '평단·수량을 직접 입력하세요 (이력 추가 시 자동 전환).';

    renderSummary(d);
    renderOrders(orders);
    IBChart.render($('chart'), {
      avgPrice: state.avgPrice,
      sellPoint: d.sellPoint,
      starSellPoint: d.starSellPoint,
      current: price.current
    });
    renderHistory(state);
  }

  function renderSummary(d) {
    $('sDaily').textContent = usd(d.dailyBuy);
    $('sTotal').textContent = usd(d.totalBought);
    $('sProgress').textContent = pct(d.progress * 100);
    $('sRound').textContent = isFinite(d.round) ? (Math.round(d.round * 10) / 10) + '회' : '—';
    $('sSellPoint').textContent = usd(d.sellPoint);
    $('sStarPct').textContent = pct(d.starPct);
    $('sStarPoint').textContent = usd(d.starSellPoint);
    $('sRemaining').textContent = usd(d.remaining);
  }

  function orderRow(o) {
    var tr = document.createElement('tr');
    var tagCls = o.kind === 'buy' ? 'buy' : 'sell';
    var tagTxt = o.kind === 'buy' ? '매수' : '매도';
    tr.innerHTML =
      '<td><span class="tag ' + tagCls + '">' + tagTxt + '</span> ' + escape(o.label) + '</td>' +
      '<td>' + escape(o.orderType) + '</td>' +
      '<td class="num">' + usd(o.price) + '</td>' +
      '<td class="num">' + int(o.qty) + '</td>' +
      '<td class="num">' + usd(o.amount) + '</td>';
    return tr;
  }

  function renderOrders(orders) {
    var bt = $('buyTable').querySelector('tbody');
    var st = $('sellTable').querySelector('tbody');
    bt.innerHTML = ''; st.innerHTML = '';
    orders.buys.forEach(function (o) { bt.appendChild(orderRow(o)); });
    orders.sells.forEach(function (o) { st.appendChild(orderRow(o)); });
    if (!orders.sells.length) {
      st.innerHTML = '<tr><td colspan="5" class="hint">첫날에는 매도 주문이 없습니다.</td></tr>';
    }

    var banner = $('forceSellBanner');
    if (orders.forceSell) {
      banner.hidden = false;
      banner.textContent = '⚠ SEED 소진 & 매도점 미도달: 종가에 ' +
        int(orders.forceSell.qty) + '주(1/4) 강제매도 (' + usd(orders.forceSell.price) + ')';
    } else {
      banner.hidden = true;
    }
  }

  function renderHistory(state) {
    var seed = num($('seed').value);
    var r = IBHistory.recalcFromHistory(history, seed);
    var tb = $('histTable').querySelector('tbody');
    tb.innerHTML = '';
    if (!history.length) {
      tb.innerHTML = '<tr><td colspan="8" class="hint">거래 이력이 없습니다.</td></tr>';
    } else {
      r.steps.forEach(function (s) {
        var tr = document.createElement('tr');
        var tagCls = s.side === 'buy' ? 'buy' : 'sell';
        var tagTxt = s.side === 'buy' ? '매수' : '매도';
        tr.innerHTML =
          '<td>' + escape(s.date) + '</td>' +
          '<td><span class="tag ' + tagCls + '">' + tagTxt + '</span></td>' +
          '<td>' + escape(s.orderType || '') + '</td>' +
          '<td class="num">' + usd(s.price) + '</td>' +
          '<td class="num">' + int(s.qty) + '</td>' +
          '<td class="num">' + usd(s.avgPrice) + '</td>' +
          '<td class="num">' + int(s.quantity) + '</td>' +
          '<td class="num"><button class="row-del" data-i="' + s.index + '" title="삭제">✕</button></td>';
        tb.appendChild(tr);
      });
    }
    $('realizedPnl').textContent = history.length
      ? '실현손익: ' + usd(r.realizedPnl) : '';
  }

  function escape(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- JSON 파일 백업 ---------- */
  function jsonStatus(msg, kind) {
    var el = $('jsonStatus');
    el.textContent = msg;
    el.classList.remove('ok', 'err');
    if (kind) el.classList.add(kind);
  }

  function exportJson() {
    try {
      var data = gatherData();
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'infinite-buying-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      jsonStatus('내보내기 완료: ' + a.download, 'ok');
    } catch (e) {
      jsonStatus('내보내기 실패: ' + e.message, 'err');
    }
  }

  function importJson(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || (!data.settings && !data.history)) {
          throw new Error('올바른 백업 파일이 아닙니다.');
        }
        if (!confirm('현재 설정·거래 이력을 파일 내용으로 덮어씁니다. 계속할까요?')) {
          jsonStatus('가져오기 취소됨.', null);
          return;
        }
        applyData(data);
        jsonStatus('가져오기 완료' +
          (data.savedAt ? ' (' + new Date(data.savedAt).toLocaleString() + ')' : ''), 'ok');
      } catch (e) {
        jsonStatus('가져오기 실패: ' + e.message, 'err');
      }
    };
    reader.onerror = function () { jsonStatus('파일을 읽지 못했습니다.', 'err'); };
    reader.readAsText(file);
  }

  /* ---------- Google Drive 동기화 ---------- */
  var autoSyncTimer = null;

  // 동기화 대상: 설정 + 거래 이력 (Finnhub 키는 포함하지 않음)
  function gatherData() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      settings: {
        seed: $('seed').value,
        divisions: $('divisions').value,
        targetRate: $('targetRate').value,
        avgPrice: $('avgPrice').value,
        quantity: $('quantity').value,
        mCurrent: $('mCurrent').value,
        mPrev: $('mPrev').value
      },
      history: history
    };
  }

  function applyData(data) {
    if (!data) return false;
    var s = data.settings || {};
    if ($('seed')) $('seed').value = s.seed || '';
    if (s.divisions) $('divisions').value = s.divisions;
    $('targetRate').value = s.targetRate || '';
    $('avgPrice').value = s.avgPrice || '';
    $('quantity').value = s.quantity || '';
    $('mCurrent').value = s.mCurrent || '';
    $('mPrev').value = s.mPrev || '';
    history = Array.isArray(data.history) ? data.history : [];
    IBStore.saveSettings(s);
    IBStore.saveHistory(history);
    renderAll();
    return true;
  }

  function driveStatus(msg, kind) {
    var el = $('gStatus');
    el.textContent = msg;
    el.classList.remove('ok', 'err');
    if (kind) el.classList.add(kind);
  }

  function updateDriveButtons() {
    var connected = IBDrive.isConnected();
    $('gBackup').disabled = !connected;
    $('gRestore').disabled = !connected;
    $('gSignout').disabled = !connected;
  }

  function driveConnect() {
    var cid = $('gClientId').value.trim();
    if (!cid) { driveStatus('Client ID를 입력하세요.', 'err'); return; }
    IBStore.saveDriveClientId(cid);
    IBDrive.setClientId(cid);
    driveStatus('연결 중…');
    IBDrive.connect().then(function () {
      driveStatus('연결됨. 백업/복원을 사용할 수 있습니다.', 'ok');
      updateDriveButtons();
    }).catch(function (err) {
      driveStatus('연결 실패: ' + err.message, 'err');
      updateDriveButtons();
    });
  }

  function driveBackup(silent) {
    if (!IBDrive.isConnected()) { if (!silent) driveStatus('먼저 연결하세요.', 'err'); return; }
    if (!silent) driveStatus('백업 중…');
    IBDrive.backup(gatherData()).then(function () {
      driveStatus('백업 완료: ' + new Date().toLocaleTimeString(), 'ok');
    }).catch(function (err) {
      driveStatus('백업 실패: ' + err.message, 'err');
    });
  }

  function driveRestore() {
    if (!IBDrive.isConnected()) { driveStatus('먼저 연결하세요.', 'err'); return; }
    driveStatus('복원 중…');
    IBDrive.restore().then(function (data) {
      if (!data) { driveStatus('Drive에 백업 파일이 없습니다.', 'err'); return; }
      applyData(data);
      driveStatus('복원 완료 (' + (data.savedAt ? new Date(data.savedAt).toLocaleString() : '') + ')', 'ok');
      updateDriveButtons();
    }).catch(function (err) {
      driveStatus('복원 실패: ' + err.message, 'err');
    });
  }

  function maybeAutoSync() {
    if (!$('gAutoSync').checked || !IBDrive.isConnected()) return;
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(function () { driveBackup(true); }, 1500);
  }

  /* ---------- 저장/복원 ---------- */
  function saveSettings() {
    IBStore.saveSettings({
      seed: $('seed').value,
      divisions: $('divisions').value,
      targetRate: $('targetRate').value,
      avgPrice: $('avgPrice').value,
      quantity: $('quantity').value,
      mCurrent: $('mCurrent').value,
      mPrev: $('mPrev').value
    });
  }

  function restore() {
    var s = IBStore.loadSettings();
    if (s) {
      $('seed').value = s.seed || '';
      $('divisions').value = s.divisions || '40';
      $('targetRate').value = s.targetRate || '';
      $('avgPrice').value = s.avgPrice || '';
      $('quantity').value = s.quantity || '';
      $('mCurrent').value = s.mCurrent || '';
      $('mPrev').value = s.mPrev || '';
    }
    $('apiKey').value = IBStore.loadApiKey() || '';
    history = IBStore.loadHistory() || [];
    $('hDate').value = new Date().toISOString().slice(0, 10);

    var cid = IBStore.loadDriveClientId() || '';
    $('gClientId').value = cid;
    if (cid) IBDrive.setClientId(cid);
    $('gAutoSync').checked = !!IBStore.loadDriveAutoSync();
  }

  /* ---------- 가격 조회 ---------- */
  function refreshPrice() {
    var key = $('apiKey').value.trim();
    var msg = $('priceMsg');
    msg.textContent = '조회 중…';
    IBPrice.fetchPrice('TQQQ', key).then(function (p) {
      lastPrice = p;
      $('curPrice').textContent = usd(p.current);
      $('prevClose').textContent = usd(p.prevClose);
      msg.textContent = '업데이트: ' + new Date(p.at).toLocaleTimeString();
      renderAll();
    }).catch(function (err) {
      msg.textContent = '⚠ ' + err.message + ' (수동 입력값을 사용합니다)';
      renderAll();
    });
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    ['seed', 'divisions', 'targetRate', 'avgPrice', 'quantity', 'mCurrent', 'mPrev']
      .forEach(function (id) {
        $(id).addEventListener('input', function () { saveSettings(); renderAll(); maybeAutoSync(); });
      });

    $('apiKey').addEventListener('input', function () {
      IBStore.saveApiKey($('apiKey').value.trim());
    });

    $('refreshBtn').addEventListener('click', refreshPrice);

    $('histForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var entry = IBHistory.makeEntry(
        $('hDate').value, $('hSide').value, $('hType').value,
        $('hPrice').value, $('hQty').value
      );
      history.push(entry);
      IBStore.saveHistory(history);
      $('hPrice').value = ''; $('hQty').value = '';
      renderAll();
      maybeAutoSync();
    });

    // 매수/매도 선택 시 주문유형 기본값 보정
    $('hSide').addEventListener('change', function () {
      $('hType').value = $('hSide').value === 'buy' ? 'LOC매수' : 'LOC매도';
    });

    $('histTable').addEventListener('click', function (e) {
      var btn = e.target.closest('.row-del');
      if (!btn) return;
      var i = parseInt(btn.getAttribute('data-i'), 10);
      if (i >= 0 && i < history.length) {
        history.splice(i, 1);
        IBStore.saveHistory(history);
        renderAll();
        maybeAutoSync();
      }
    });

    $('clearHist').addEventListener('click', function () {
      if (!history.length) return;
      if (confirm('거래 이력을 모두 삭제할까요?')) {
        history = [];
        IBStore.saveHistory(history);
        renderAll();
        maybeAutoSync();
      }
    });

    // JSON 파일 백업
    $('jsonExport').addEventListener('click', exportJson);
    $('jsonImport').addEventListener('click', function () { $('jsonFile').click(); });
    $('jsonFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      importJson(f);
      e.target.value = ''; // 같은 파일 재선택 허용
    });

    // Google Drive 동기화
    $('gClientId').addEventListener('input', function () {
      var v = $('gClientId').value.trim();
      IBStore.saveDriveClientId(v);
      IBDrive.setClientId(v);
    });
    $('gConnect').addEventListener('click', driveConnect);
    $('gBackup').addEventListener('click', function () { driveBackup(false); });
    $('gRestore').addEventListener('click', driveRestore);
    $('gSignout').addEventListener('click', function () {
      IBDrive.signOut();
      updateDriveButtons();
      driveStatus('연결 해제됨.', null);
    });
    $('gAutoSync').addEventListener('change', function () {
      IBStore.saveDriveAutoSync($('gAutoSync').checked);
      if ($('gAutoSync').checked) maybeAutoSync();
    });
  }

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    restore();
    bind();
    renderAll();
    if ($('apiKey').value) refreshPrice();
  });
})();
