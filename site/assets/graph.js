/* Граф связей — радиальная кладограмма дерева + пучковые дуги перекрёстных связей.
 * Иерархия детерминирована (это дерево, а не физическая симуляция), поэтому
 * картинка одинаковая при каждом открытии — по ней можно ориентироваться. */
(function () {
  'use strict';

  var G = window.GOLF;
  var svgEl = document.getElementById('gsvg');
  if (!G || !svgEl || typeof d3 === 'undefined') return;

  var BRANCH = {
    cat_engine: '--color-b-engine',
    cat_ecu: '--color-b-ecu',
    cat_fuse: '--color-b-fuse',
    cat_pr: '--color-b-pr',
    cat_mod: '--color-b-mod',
    cat_parts: '--color-b-parts',
    cat_journal: '--color-b-journal'
  };
  var BRANCH_NAME = {
    cat_engine: 'Двигатель',
    cat_ecu: 'Блоки управления',
    cat_fuse: 'Предохранители',
    cat_pr: 'PR-коды',
    cat_mod: 'Доработки',
    cat_parts: 'Детали ETKA',
    cat_journal: 'Журнал'
  };

  function tok(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function lbl(n) { return (n.label || '').replace(/\n/g, ' '); }
  function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  var byId = {};
  G.nodes.forEach(function (n) { byId[n.id] = n; });

  function branchOf(id) {
    var n = byId[id];
    while (n && n.parent && n.parent !== 'car') n = byId[n.parent];
    return n && n.parent === 'car' ? n.id : (n ? n.id : 'car');
  }

  var root = d3.stratify().id(function (d) { return d.id; })
    .parentId(function (d) { return d.parent; })(G.nodes);
  root.sort(function (a, b) { return d3.ascending(lbl(a.data), lbl(b.data)); });

  var R = 620;
  d3.cluster().size([2 * Math.PI, R - 190])(root);

  var nodeByIdH = {};
  root.each(function (d) { nodeByIdH[d.id] = d; });

  /* пути для пучковых дуг перекрёстных связей */
  var crossPaths = G.links.filter(function (l) { return l.kind === 'cross'; })
    .map(function (l) {
      var a = nodeByIdH[l.source], b = nodeByIdH[l.target];
      if (!a || !b) return null;
      return { a: a, b: b, label: l.label, path: a.path(b) };
    }).filter(Boolean);

  var line = d3.lineRadial()
    .curve(d3.curveBundle.beta(0.75))
    .radius(function (d) { return d.y; })
    .angle(function (d) { return d.x; });

  var svg = d3.select(svgEl)
    .attr('viewBox', [-R, -R, R * 2, R * 2])
    .attr('preserveAspectRatio', 'xMidYMid meet');
  svg.selectAll('*').remove();

  var zoomG = svg.append('g');
  var gTree = zoomG.append('g').attr('class', 'g-tree');
  var gCross = zoomG.append('g').attr('class', 'g-cross');
  var gNode = zoomG.append('g').attr('class', 'g-node');

  /* ветви дерева */
  gTree.selectAll('path')
    .data(root.links())
    .join('path')
    .attr('fill', 'none')
    .attr('stroke', function (d) { return tok(BRANCH[branchOf(d.target.id)] || '--color-rule'); })
    .attr('stroke-opacity', 0.28)
    .attr('stroke-width', 1)
    .attr('d', d3.linkRadial().angle(function (d) { return d.x; }).radius(function (d) { return d.y; }));

  /* перекрёстные связи */
  var crossSel = gCross.selectAll('path')
    .data(crossPaths)
    .join('path')
    .attr('fill', 'none')
    .attr('stroke', tok('--color-accent'))
    .attr('stroke-opacity', 0.5)
    .attr('stroke-width', 1.2)
    .attr('d', function (d) { return line(d.path); });

  /* узлы + подписи */
  var node = gNode.selectAll('a')
    .data(root.descendants())
    .join('a')
    .attr('href', function (d) { return 'index.html#/n/' + encodeURIComponent(d.id); })
    .attr('transform', function (d) {
      return 'rotate(' + (d.x * 180 / Math.PI - 90) + ') translate(' + d.y + ',0)';
    });

  node.append('circle')
    .attr('r', function (d) { return d.depth === 0 ? 5 : d.children ? 3.2 : 2.2; })
    .attr('fill', function (d) {
      return d.depth === 0 ? tok('--color-ink') : tok(BRANCH[branchOf(d.id)] || '--color-muted');
    });

  node.append('text')
    .attr('dy', '0.31em')
    .attr('x', function (d) { return d.x < Math.PI ? 7 : -7; })
    .attr('text-anchor', function (d) { return d.x < Math.PI ? 'start' : 'end'; })
    .attr('transform', function (d) { return d.x >= Math.PI ? 'rotate(180)' : null; })
    .attr('font-size', function (d) { return d.depth <= 1 ? 12 : d.children ? 10 : 8.6; })
    .attr('font-weight', function (d) { return d.depth <= 1 ? 700 : d.children ? 600 : 400; })
    .attr('fill', function (d) {
      return d.depth <= 2 ? tok('--color-ink') : tok('--color-ink-2');
    })
    .text(function (d) { return clip(lbl(d.data), d.depth <= 1 ? 40 : 30); });

  node.append('title').text(function (d) {
    var m = d.data.meta || {};
    var k = Object.keys(m);
    return lbl(d.data) + (k.length ? '\n' + k.slice(0, 4).map(function (x) {
      return x + ': ' + m[x];
    }).join('\n') : '');
  });

  /* подсветка по наведению */
  node.on('pointerenter', function (e, d) { highlight(d.id); })
      .on('pointerleave', function () { highlight(null); })
      .on('focus', function (e, d) { highlight(d.id); })
      .on('blur', function () { highlight(null); });

  function highlight(id) {
    if (!id) {
      crossSel.attr('stroke-opacity', 0.5).attr('stroke-width', 1.2);
      node.attr('opacity', 1);
      status('');
      return;
    }
    var linked = {};
    linked[id] = 1;
    var n = 0;
    crossPaths.forEach(function (c) {
      if (c.a.id === id || c.b.id === id) { linked[c.a.id] = 1; linked[c.b.id] = 1; n++; }
    });
    crossSel
      .attr('stroke-opacity', function (c) { return (c.a.id === id || c.b.id === id) ? 0.95 : 0.06; })
      .attr('stroke-width', function (c) { return (c.a.id === id || c.b.id === id) ? 2 : 1; });
    node.attr('opacity', function (d) { return linked[d.id] ? 1 : 0.22; });
    status(lbl(byId[id]) + (n ? ' · ' + n + ' ' + plural(n, 'перекрёстная связь', 'перекрёстные связи', 'перекрёстных связей') : ' · перекрёстных связей нет'));
  }

  function status(t) {
    var el = document.getElementById('gstatus');
    if (el) el.textContent = t;
  }

  /* зум и панорама */
  var zoom = d3.zoom().scaleExtent([0.35, 6]).on('zoom', function (e) {
    zoomG.attr('transform', e.transform);
  });
  svg.call(zoom);

  function reset() { svg.transition().duration(320).call(zoom.transform, d3.zoomIdentity); }
  document.getElementById('gFit').addEventListener('click', reset);
  document.getElementById('gIn').addEventListener('click', function () {
    svg.transition().duration(180).call(zoom.scaleBy, 1.4);
  });
  document.getElementById('gOut').addEventListener('click', function () {
    svg.transition().duration(180).call(zoom.scaleBy, 1 / 1.4);
  });

  /* легенда — фильтр по ветке */
  var off = {};
  var legend = document.getElementById('glegend');
  legend.innerHTML = Object.keys(BRANCH_NAME).map(function (k) {
    return '<button type="button" class="chip" data-branch="' + k + '" aria-pressed="true">' +
      '<span class="dot" style="background:var(' + BRANCH[k] + ')"></span>' + BRANCH_NAME[k] + '</button>';
  }).join('');
  legend.addEventListener('click', function (e) {
    var b = e.target.closest('[data-branch]');
    if (!b) return;
    var k = b.getAttribute('data-branch');
    off[k] = !off[k];
    b.setAttribute('aria-pressed', String(!off[k]));
    node.attr('display', function (d) { return off[branchOf(d.id)] ? 'none' : null; });
    gTree.selectAll('path').attr('display', function (d) {
      return off[branchOf(d.target.id)] ? 'none' : null;
    });
    crossSel.attr('display', function (c) {
      return (off[branchOf(c.a.id)] || off[branchOf(c.b.id)]) ? 'none' : null;
    });
  });

  /* тема меняет токены — перекрашиваем */
  new MutationObserver(function () {
    gTree.selectAll('path').attr('stroke', function (d) {
      return tok(BRANCH[branchOf(d.target.id)] || '--color-rule');
    });
    crossSel.attr('stroke', tok('--color-accent'));
    node.select('circle').attr('fill', function (d) {
      return d.depth === 0 ? tok('--color-ink') : tok(BRANCH[branchOf(d.id)] || '--color-muted');
    });
    node.select('text').attr('fill', function (d) {
      return d.depth <= 2 ? tok('--color-ink') : tok('--color-ink-2');
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
