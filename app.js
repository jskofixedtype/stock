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

    // 이력 파생 시 입력 필드에 반영 + 읽기전용 표시
    var derived = !!state._derived;
    $('avgPrice').value = derived ? (Math.round(state.avgPrice * 100) / 100) : $('avgPrice').value;
    $('quantity').value = derived ? Math.round(state.quantity) : $('quantity').value;
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
        $(id).addEventListener('input', function () { saveSettings(); renderAll(); });
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
      }
    });

    $('clearHist').addEventListener('click', function () {
      if (!history.length) return;
      if (confirm('거래 이력을 모두 삭제할까요?')) {
        history = [];
        IBStore.saveHistory(history);
        renderAll();
      }
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
