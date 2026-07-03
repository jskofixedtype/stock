/*
 * calc.js — 무한매수법 계산 엔진 (순수 함수, 외부 의존성 없음)
 *
 * CLAUDE.md의 "무한매수법 용어정리 / 원리"를 공식으로 구현한다.
 * 브라우저에서는 window.IBCalc 로 노출된다.
 */
(function (root) {
  'use strict';

  // 매수 수량은 예산 초과 방지를 위해 내림(floor), 매도 수량은 반올림(round).
  var BUY_ROUND = Math.floor;
  var SELL_ROUND = Math.round;
  var FIRST_DAY_FACTOR = 1.10; // 원리 6: 첫날 기준가 = 전일 종가 × 1.10
  var SELL_UNIT = 0.25;        // 원리 3·4·5: 보유수량의 1/4 단위

  function num(v, def) {
    var n = parseFloat(v);
    return isFinite(n) ? n : (def || 0);
  }

  /**
   * 파생값 계산.
   * @param {{seed:number, divisions:number, targetRate:number, avgPrice:number, quantity:number}} inputs
   */
  function computeDerived(inputs) {
    var seed = num(inputs.seed);
    var divisions = num(inputs.divisions);
    var targetRate = num(inputs.targetRate);
    var avgPrice = num(inputs.avgPrice);
    var quantity = num(inputs.quantity);

    var dailyBuy = divisions > 0 ? seed / divisions : 0;
    var totalBought = avgPrice * quantity;
    var progress = seed > 0 ? totalBought / seed : 0; // 진행률 (0~1)
    var sellPoint = avgPrice * (1 + targetRate / 100); // 매도점
    var starPct = targetRate * (1 - 2 * progress);     // 별퍼센트(%)
    var starSellPoint = avgPrice * (1 + starPct / 100); // 별퍼센트 매도점
    var remaining = seed - totalBought;                 // 남은 예산
    var round = dailyBuy > 0 ? totalBought / dailyBuy : 0; // 회차(진행일수)

    return {
      dailyBuy: dailyBuy,
      totalBought: totalBought,
      progress: progress,
      sellPoint: sellPoint,
      starPct: starPct,
      starSellPoint: starSellPoint,
      remaining: remaining,
      round: round,
      seedExhausted: progress >= 1
    };
  }

  /**
   * 오늘의 매수/매도 주문 산출.
   * @param inputs  설정/보유 상태
   * @param price   {current, prevClose} (Finnhub 또는 수동)
   * @param derived computeDerived 결과 (없으면 내부 계산)
   */
  function computeOrders(inputs, price, derived) {
    derived = derived || computeDerived(inputs);
    price = price || {};
    var avgPrice = num(inputs.avgPrice);
    var quantity = num(inputs.quantity);
    var prevClose = num(price.prevClose);
    var current = num(price.current);
    var dailyBuy = derived.dailyBuy;

    var isFirstDay = quantity <= 0; // 보유 수량이 없으면 첫날
    var buys = [];
    var sells = [];
    var forceSell = null;

    if (isFirstDay) {
      // 원리 6: 첫날은 전일 종가의 1.10배 기준으로 일일매수금액만큼 매수
      var base = prevClose * FIRST_DAY_FACTOR;
      var q = base > 0 ? BUY_ROUND(dailyBuy / base) : 0;
      buys.push(order('buy', 'LOC매수', '첫날 매수', base, q));
    } else {
      // 원리 1·2: 일일매수금액을 절반씩 양방향 LOC 매수
      var half = dailyBuy / 2;
      var q1 = avgPrice > 0 ? BUY_ROUND(half / avgPrice) : 0;
      var q2 = derived.starSellPoint > 0 ? BUY_ROUND(half / derived.starSellPoint) : 0;
      buys.push(order('buy', 'LOC매수', '평단 매수', avgPrice, q1));
      buys.push(order('buy', 'LOC매수', '별퍼센트 매수', derived.starSellPoint, q2));

      // 원리 3: 별퍼센트 매도점 초과 시 보유수량 1/4 LOC 매도
      var sQ1 = SELL_ROUND(quantity * SELL_UNIT);
      // 원리 4: 장중 매도점 도달 시 나머지(약 3/4) 지정가 매도
      var sQ2 = quantity - sQ1;
      sells.push(order('sell', 'LOC매도', '별퍼센트 매도 (1/4)', derived.starSellPoint, sQ1));
      sells.push(order('sell', '지정가매도', '전량 매도 (3/4)', derived.sellPoint, sQ2));

      // 원리 5: SEED 소진 후 매도점 미도달 시 종가 강제매도 1/4
      if (derived.seedExhausted) {
        forceSell = order('sell', '종가매도', 'SEED 소진 강제매도 (1/4)', current, SELL_ROUND(quantity * SELL_UNIT));
      }
    }

    return {
      isFirstDay: isFirstDay,
      buys: buys,
      sells: sells,
      forceSell: forceSell
    };
  }

  function order(kind, orderType, label, price, qty) {
    price = num(price);
    qty = num(qty);
    return {
      kind: kind,           // 'buy' | 'sell'
      orderType: orderType, // 'LOC매수' | 'LOC매도' | '지정가매도' | '종가매도'
      label: label,
      price: price,
      qty: qty,
      amount: price * qty
    };
  }

  root.IBCalc = {
    computeDerived: computeDerived,
    computeOrders: computeOrders,
    _num: num,
    FIRST_DAY_FACTOR: FIRST_DAY_FACTOR,
    SELL_UNIT: SELL_UNIT
  };
})(typeof window !== 'undefined' ? window : this);
