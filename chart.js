/*
 * chart.js — 평단·매도점·별퍼센트 가격·현재가 기준선 차트 (인라인 SVG, 의존성 0)
 * window.IBChart 로 노출.
 *
 * 가격(세로축) 위에 각 기준선을 그리고 우측에 직접 라벨을 붙인다.
 * 색은 각 "개체(entity)"에 고정 배정하며, 모든 선에 직접 라벨을 달아
 * 색만으로 의미를 전달하지 않는다(접근성). 색 값은 styles.css의 .viz-root 참조.
 */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // 개체별 고정 배정 (색은 CSS 클래스로, 여기서는 역할만 지정)
  var SERIES = [
    { key: 'avgPrice',      name: '평단',        cls: 'avg' },
    { key: 'starSellPoint', name: '별퍼센트 매도', cls: 'star' },
    { key: 'sellPoint',     name: '매도점',      cls: 'sell' },
    { key: 'current',       name: '현재가',      cls: 'current' }
  ];

  function fmt(v) {
    return '$' + (Math.round(v * 100) / 100).toFixed(2);
  }

  function el(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    for (var k in attrs) { if (attrs.hasOwnProperty(k)) node.setAttribute(k, attrs[k]); }
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * @param {HTMLElement} container
   * @param {{avgPrice:number, sellPoint:number, starSellPoint:number, current:number}} data
   */
  function render(container, data) {
    if (!container) return;
    container.innerHTML = '';

    var points = SERIES.map(function (s) {
      return { series: s, value: parseFloat(data[s.key]) };
    }).filter(function (p) { return isFinite(p.value) && p.value > 0; });

    if (points.length < 2) {
      container.appendChild(el('div', { class: 'chart-empty' }));
      container.lastChild.textContent = '평단/현재가가 입력되면 기준선이 표시됩니다.';
      return;
    }

    var W = 340, H = 260;
    var padT = 18, padB = 18, padL = 14, padR = 132;
    var plotH = H - padT - padB;
    var axisX = padL;
    var lineRight = W - padR;

    var vals = points.map(function (p) { return p.value; });
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    if (min === max) { min *= 0.98; max *= 1.02; }
    var pad = (max - min) * 0.15;
    min -= pad; max += pad;

    function y(v) { return padT + (max - v) / (max - min) * plotH; }

    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      width: '100%',
      role: 'img',
      'aria-label': '무한매수법 기준가 차트',
      class: 'viz-svg'
    });

    // 세로 축(baseline)
    svg.appendChild(el('line', {
      x1: axisX, y1: padT - 6, x2: axisX, y2: H - padB + 6, class: 'viz-axis'
    }));

    // 라벨 겹침 방지: y좌표 순으로 정렬 후 최소 간격 확보
    var sorted = points.slice().sort(function (a, b) { return y(a.value) - y(b.value); });
    var minGap = 30, lastLabelY = -Infinity; // 이름+값 2줄이 겹치지 않을 최소 간격

    sorted.forEach(function (p) {
      var yy = y(p.value);
      var isCurrent = p.series.key === 'current';

      // 기준선
      svg.appendChild(el('line', {
        x1: axisX, y1: yy, x2: lineRight, y2: yy,
        class: 'viz-line ' + p.series.cls + (isCurrent ? ' is-current' : '')
      }));
      // 마커(끝점)
      svg.appendChild(el('circle', {
        cx: lineRight, cy: yy, r: isCurrent ? 5 : 4,
        class: 'viz-dot ' + p.series.cls
      }));

      // 라벨 위치 (겹치면 아래로 밀기)
      var labelY = Math.max(yy, lastLabelY + minGap);
      lastLabelY = labelY;

      var name = el('text', {
        x: lineRight + 10, y: labelY - 2,
        class: 'viz-label-name ' + p.series.cls
      }, p.series.name);
      var val = el('text', {
        x: lineRight + 10, y: labelY + 12,
        class: 'viz-label-val'
      }, fmt(p.value));
      svg.appendChild(name);
      svg.appendChild(val);
    });

    container.appendChild(svg);
  }

  root.IBChart = { render: render };
})(typeof window !== 'undefined' ? window : this);
