/*
 * price.js — Finnhub 가격 조회 모듈 (provider 추상화)
 * window.IBPrice 로 노출.
 *
 * Finnhub 무료 티어: GET /api/v1/quote?symbol=TQQQ&token=KEY
 *   응답 { c: 현재가, pc: 전일종가, ... }
 * 실패/키 없음 시 호출부에서 수동 입력값으로 폴백한다.
 */
(function (root) {
  'use strict';

  var ENDPOINT = 'https://finnhub.io/api/v1/quote';

  /**
   * @param {string} symbol  기본 'TQQQ'
   * @param {string} apiKey  Finnhub API 키
   * @returns {Promise<{current:number, prevClose:number, at:number}>}
   */
  function fetchPrice(symbol, apiKey) {
    symbol = symbol || 'TQQQ';
    if (!apiKey) {
      return Promise.reject(new Error('Finnhub API 키가 없습니다. 수동 입력을 사용하세요.'));
    }
    var url = ENDPOINT + '?symbol=' + encodeURIComponent(symbol) +
      '&token=' + encodeURIComponent(apiKey);

    return fetch(url).then(function (res) {
      if (!res.ok) {
        throw new Error('가격 조회 실패 (HTTP ' + res.status + ')');
      }
      return res.json();
    }).then(function (data) {
      var current = parseFloat(data && data.c);
      var prevClose = parseFloat(data && data.pc);
      if (!isFinite(current) || current === 0) {
        throw new Error('유효한 시세를 받지 못했습니다 (심볼/키/한도 확인).');
      }
      return {
        current: current,
        prevClose: isFinite(prevClose) ? prevClose : current,
        at: Date.now()
      };
    });
  }

  root.IBPrice = { fetchPrice: fetchPrice, ENDPOINT: ENDPOINT };
})(typeof window !== 'undefined' ? window : this);
