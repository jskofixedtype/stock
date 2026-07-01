/*
 * history.js — 거래 이력 관리 + 평단/수량/진행률 재계산
 * window.IBHistory 로 노출.
 *
 * 이력 항목: { date, side:'buy'|'sell', orderType, price, qty }
 * 이력을 순서대로 적용해 현재 평단·수량을 산출한다.
 *   매수: 가중평균으로 평단 갱신, 수량 증가
 *   매도: 수량 차감(평단 유지), 전량 매도 시 사이클 리셋(평단·수량 0)
 */
(function (root) {
  'use strict';

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  /**
   * 이력으로부터 현재 보유 상태와 스텝별 스냅샷을 계산.
   * @param {Array} history
   * @param {number} seed  진행률 계산용 (선택)
   */
  function recalcFromHistory(history, seed) {
    history = Array.isArray(history) ? history : [];
    seed = num(seed);
    var quantity = 0;
    var avgPrice = 0;
    var realizedPnl = 0; // 매도 실현손익 누적
    var steps = [];

    for (var i = 0; i < history.length; i++) {
      var e = history[i];
      var price = num(e.price);
      var qty = num(e.qty);
      if (e.side === 'buy') {
        var newQty = quantity + qty;
        avgPrice = newQty > 0 ? (avgPrice * quantity + price * qty) / newQty : 0;
        quantity = newQty;
      } else if (e.side === 'sell') {
        var sellQty = Math.min(qty, quantity);
        realizedPnl += (price - avgPrice) * sellQty;
        quantity -= sellQty;
        if (quantity <= 0) { quantity = 0; avgPrice = 0; } // 전량 매도 → 사이클 리셋
      }
      var totalBought = avgPrice * quantity;
      steps.push({
        index: i,
        date: e.date,
        side: e.side,
        orderType: e.orderType,
        price: price,
        qty: qty,
        avgPrice: avgPrice,
        quantity: quantity,
        totalBought: totalBought,
        progress: seed > 0 ? totalBought / seed : 0,
        realizedPnl: realizedPnl
      });
    }

    var totalBoughtNow = avgPrice * quantity;
    return {
      quantity: quantity,
      avgPrice: avgPrice,
      totalBought: totalBoughtNow,
      progress: seed > 0 ? totalBoughtNow / seed : 0,
      realizedPnl: realizedPnl,
      steps: steps
    };
  }

  function makeEntry(date, side, orderType, price, qty) {
    return {
      date: date || new Date().toISOString().slice(0, 10),
      side: side,
      orderType: orderType || (side === 'buy' ? 'LOC매수' : 'LOC매도'),
      price: num(price),
      qty: num(qty)
    };
  }

  root.IBHistory = {
    recalcFromHistory: recalcFromHistory,
    makeEntry: makeEntry
  };
})(typeof window !== 'undefined' ? window : this);
