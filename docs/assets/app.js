/* Golf 7.5 CZCA — справочник. Vanilla, zero dependencies, offline-safe.
 * Data comes from window.GOLF (assets/data.js or inlined in the offline build). */
(function () {
  'use strict';

  var G = window.GOLF;
  var HAS_GRAPH = !!window.GOLF_HAS_GRAPH; // full build only

  /* ── indices ──────────────────────────────────────────────── */
  var byId = {};
  var kids = {};
  var cross = {};
  G.nodes.forEach(function (n) { byId[n.id] = n; });
  G.nodes.forEach(function (n) {
    if (!n.parent) return;
    (kids[n.parent] = kids[n.parent] || []).push(n.id);
  });
  G.links.forEach(function (l) {
    if (l.kind !== 'cross') return;
    (cross[l.source] = cross[l.source] || []).push({ id: l.target, label: l.label });
    (cross[l.target] = cross[l.target] || []).push({ id: l.source, label: l.label });
  });

  var TYPE = {
    root: 'автомобиль', category: 'раздел', pr_list: 'PR-коды',
    engine_main: 'двигатель', repair_group: 'группа мануала', torque: 'момент затяжки',
    gap: 'пробел в данных', ecu: 'блок управления', fuse: 'предохранитель',
    mod: 'доработка', part_bucket: 'узел', part: 'деталь',
    journal_bucket: 'раздел журнала', journal_item: 'запись', todo: 'план'
  };

  var SECTIONS = [
    { route: '', id: 'car', title: 'Обзор', nav: 'Обзор' },
    { route: 'engine', id: 'cat_engine', title: 'Двигатель и мануал', nav: 'Двигатель' },
    { route: 'ecu', id: 'cat_ecu', title: 'Блоки управления', nav: 'Блоки управления' },
    { route: 'fuses', id: 'cat_fuse', title: 'Предохранители', nav: 'Предохранители' },
    { route: 'pr', id: 'cat_pr', title: 'PR-коды', nav: 'PR-коды' },
    { route: 'parts', id: 'cat_parts', title: 'Каталог деталей', nav: 'Детали ETKA' },
    { route: 'mods', id: 'cat_mod', title: 'Мои доработки', nav: 'Доработки' },
    { route: 'journal', id: 'cat_journal', title: 'Журнал и траты', nav: 'Журнал' }
  ];

  /* fuses touched by the owner's own wiring — derived, not hard-coded */
  var MINE = {};
  Object.keys(cross).forEach(function (id) {
    if (byId[id] && byId[id].type !== 'fuse') return;
    cross[id].forEach(function (c) {
      if (byId[c.id] && byId[c.id].type === 'mod') MINE[id] = byId[c.id].id;
    });
  });

  /* ── helpers ──────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function lbl(n) { return (n.label || '').replace(/\n/g, ' '); }
  function href(id) { return '#/n/' + encodeURIComponent(id); }
  function count(id) { return (kids[id] || []).length; }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function ampNum(a) {
    if (!a || a === '–') return null;
    var m = String(a).replace(',', '.').match(/[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }
  function fold(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }

  /* ── search index ─────────────────────────────────────────── */
  var INDEX = [];
  G.nodes.forEach(function (n) {
    var parts = [lbl(n), n.id, TYPE[n.type] || n.type];
    Object.keys(n.meta || {}).forEach(function (k) { parts.push(k, n.meta[k]); });
    INDEX.push({
      hay: fold(parts.join(' ')),
      title: lbl(n),
      key: TYPE[n.type] || n.type,
      url: href(n.id)
    });
  });
  (G.pr || []).forEach(function (grp) {
    grp.items.forEach(function (it) {
      INDEX.push({
        hay: fold(it[0] + ' ' + it[1] + ' ' + it[2] + ' ' + grp.g + ' pr-код'),
        title: it[0] + ' · ' + it[1],
        key: 'PR-код',
        url: '#/pr/' + encodeURIComponent(it[0])
      });
    });
  });

  function search(q, limit) {
    var f = fold(q).trim();
    if (f.length < 2) return [];
    var terms = f.split(/\s+/);
    var out = [];
    for (var i = 0; i < INDEX.length && out.length < (limit || 25); i++) {
      var ok = true;
      for (var t = 0; t < terms.length; t++) {
        if (INDEX[i].hay.indexOf(terms[t]) === -1) { ok = false; break; }
      }
      if (ok) out.push(INDEX[i]);
    }
    return out;
  }

  /* ── render primitives ────────────────────────────────────── */
  function head(title, lede, meta) {
    return '<header class="head">' +
      '<h1>' + esc(title) + '</h1>' +
      (lede ? '<p class="head__lede">' + lede + '</p>' : '') +
      (meta ? '<div class="head__meta">' + meta + '</div>' : '') +
      '</header>';
  }

  function rowLink(n, sub, key) {
    return '<a class="row" href="' + href(n.id) + '">' +
      '<span class="row__t">' + esc(lbl(n)) + '</span>' +
      '<span class="row__k">' + (key || '') + '</span>' +
      (sub ? '<span class="row__s">' + sub + '</span>' : '') +
      '</a>';
  }

  function firstMeta(n) {
    var k = Object.keys(n.meta || {});
    return k.length ? n.meta[k[0]] : '';
  }

  /* type-aware row for a leaf node: mono key on the right, detail underneath */
  function leafRow(c) {
    var m = c.meta || {};
    var key, sub;
    if (c.type === 'ecu') {
      key = m['Адрес блока'] ? 'адрес ' + m['Адрес блока'] : '';
      sub = [m['Номер детали'], m['Версия прошивки'] ? 'ПО ' + m['Версия прошивки'] : ''].filter(Boolean).join(' · ');
    } else if (c.type === 'part') {
      key = m['Артикул'] || '';
      sub = [m['Наименование'], m['Примечание']].filter(Boolean).join(' — ');
    } else if (c.type === 'mod') {
      key = m['Стоимость'] || m['Статус'] || '';
      sub = m['Что сделано'] || m['Что ставим'] || firstMeta(c);
    } else if (c.type === 'todo') {
      key = m['Оценка'] || m['Статус'] || '';
      sub = m['Статус'] || '';
    } else {
      key = TYPE[c.type] || '';
      sub = firstMeta(c);
    }
    return rowLink(c, esc(sub), esc(key));
  }

  function groupHead(t, n) {
    return '<div class="gh"><h2>' + esc(t) + '</h2>' +
      (n ? '<span class="gh__n">' + esc(n) + '</span>' : '') + '</div>';
  }

  function colophon() {
    return '<footer class="colophon">' +
      '<p><b>Golf 7.5 · BQ12HZ · VIN WVWZZZAUZKP041455</b> — 1.4 TSI CZCA, 92 кВт, DSG-7 DQ200 (0CW), передний привод. ' +
      'Сборка Zwickau/Mosel, 02.11.2018. Данные собраны из ETKA по VIN, ремонтного мануала семейства CZCA/CZDA/CZDB/DJKA/CZDC, ' +
      'Owner’s Manual VW Golf 2019 (номиналы предохранителей), логов CarPort и личных замеров. ' +
      Object.keys(byId).length + ' ' + plural(Object.keys(byId).length, 'узел', 'узла', 'узлов') + ' · ' +
      (G.pr || []).reduce(function (a, g) { return a + g.items.length; }, 0) + ' PR-кодов · ' +
      G.links.length + ' связей. ' +
      'Артикулы, прочитанные со скриншотов ETKA, помечены в карточке — сверяй перед заказом. ' +
      'Ничего не грузится извне: шрифты и данные лежат рядом с этим файлом.</p>' +
      '</footer>';
  }

  /* ── views ────────────────────────────────────────────────── */
  function viewOverview() {
    var car = byId.car;
    var m = car.meta || {};
    var plate = '<dl class="plate__grid">' + Object.keys(m).map(function (k) {
      return '<div><dt>' + esc(k) + '</dt><dd>' + esc(m[k]) + '</dd></div>';
    }).join('') + '</dl>';

    var rows = SECTIONS.slice(1).map(function (s) {
      var n = byId[s.id];
      var c = s.id === 'cat_pr'
        ? (G.pr || []).reduce(function (a, g) { return a + g.items.length; }, 0) + ' кодов'
        : deepCount(s.id) + ' ' + plural(deepCount(s.id), 'запись', 'записи', 'записей');
      return '<a class="row" href="#/' + s.route + '">' +
        '<span class="row__t">' + esc(s.title) + '</span>' +
        '<span class="row__k">' + esc(c) + '</span>' +
        '<span class="row__s">' + esc(sectionLede(s.route)) + '</span>' +
        '</a>';
    }).join('');

    return head('Golf 7.5 · 2019',
        'Справочник по конкретной машине: что стоит, куда подключено, что уже сделано и почём. ' +
        'Всё листается офлайн, ничего не подгружается из сети.',
        '<span class="mono">CZCA 1.4 TSI</span><span class="mono">DSG-7 DQ200</span>' +
        '<span class="mono">02.11.2018</span><span class="mono">Zwickau/Mosel</span>') +
      '<section class="plate">' + plate + '</section>' +
      '<nav class="index" aria-label="Разделы">' + rows + '</nav>' +
      '<div class="note" style="margin-top:var(--space-xl)">' +
        '<span class="note__k">С чего начать</span>' +
        'Ищи по всему справочнику через поле поиска — оно находит и узлы, и PR-коды. ' +
        'Клавиша <b>/</b> ставит курсор в поиск. Для блока предохранителей есть ' +
        '<a href="#/fuses/pro" style="color:var(--color-accent)">расширенный режим</a> с фильтрами по статусу, клемме и номиналу.' +
      '</div>' +
      colophon();
  }

  function deepCount(id) {
    var n = 0;
    (kids[id] || []).forEach(function (c) { n += 1 + deepCount(c); });
    return n;
  }

  function sectionLede(route) {
    return {
      engine: 'Паспорт CZCA, разделы ремонтного мануала и моменты затяжки.',
      ecu: 'Адреса, номера деталей, версии железа и прошивок по CarPort.',
      fuses: 'Блок C: 53 гнезда — номинал, клемма, что питает, свободно ли.',
      pr: 'Заводская комплектация по VIN, сгруппированная по системам.',
      parts: 'Артикулы ETKA по узлам с пометкой о достоверности источника.',
      mods: 'Что переделано своими руками и на чём оно висит.',
      journal: 'Покупка, расходники, ремонты, траты и планы.'
    }[route] || '';
  }

  /* — generic section: renders a category subtree — */
  function viewSection(s) {
    var children = kids[s.id] || [];
    if (!children.length) return viewNode(s.id);

    var leaves = children.filter(function (id) { return !(kids[id] || []).length; });
    var branches = children.filter(function (id) { return (kids[id] || []).length; });
    var body = '';

    if (leaves.length) {
      body += '<div class="index">' + leaves.map(function (id) { return leafRow(byId[id]); }).join('') + '</div>';
    }

    branches.forEach(function (gid) {
      var g = byId[gid];
      var gk = kids[gid] || [];
      var total = g.meta && (g.meta['Итого по разделу'] || g.meta['Итого по покупкам']);
      body += groupHead(lbl(g), total || (gk.length + ' ' + plural(gk.length, 'позиция', 'позиции', 'позиций')));
      body += '<div class="index">' + gk.map(function (cid) { return leafRow(byId[cid]); }).join('') + '</div>';
    });

    return head(s.title, esc(sectionLede(s.route))) + body + colophon();
  }

  /* — engine: specs + manual groups + torques — */
  function viewEngine() {
    var eng = byId.eng_czca;
    var m = eng.meta || {};
    var specs = '<dl class="plate__grid">' + Object.keys(m).map(function (k) {
      return '<div><dt>' + esc(k) + '</dt><dd>' + esc(m[k]) + '</dd></div>';
    }).join('') + '</dl>';

    var groups = (kids.eng_czca || []).filter(function (id) { return byId[id].type === 'repair_group'; });
    var gapNode = (kids.eng_czca || []).filter(function (id) { return byId[id].type === 'gap'; })[0];

    var body = groupHead('Разделы ремонтного мануала', groups.length + ' ' + plural(groups.length, 'группа', 'группы', 'групп'));
    body += '<div class="index">' + groups.map(function (id) {
      var g = byId[id];
      var tq = (kids[id] || []).length;
      return rowLink(g, esc(firstMeta(g)), tq ? tq + ' ' + plural(tq, 'момент', 'момента', 'моментов') : '');
    }).join('') + '</div>';

    var torques = [];
    groups.forEach(function (gid) {
      (kids[gid] || []).forEach(function (t) { if (byId[t].type === 'torque') torques.push(byId[t]); });
    });
    if (torques.length) {
      body += groupHead('Моменты затяжки', torques.length + ' ' + plural(torques.length, 'позиция', 'позиции', 'позиций'));
      body += '<div class="tablewrap"><table class="data"><thead><tr>' +
        '<th>Соединение</th><th>Момент / примечание</th><th>Раздел</th></tr></thead><tbody>' +
        torques.map(function (t) {
          var val = t.meta['Момент затяжки / примечание'] || '';
          return '<tr><td><a href="' + href(t.id) + '">' + esc(lbl(t)) + '</a></td>' +
            '<td class="c-fn">' + esc(val) + '</td>' +
            '<td class="c-amp">' + esc(lbl(byId[t.parent]).split(' · ')[0]) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    if (gapNode) {
      var gm = byId[gapNode].meta || {};
      body += '<div class="note" style="margin-top:var(--space-xl)"><span class="note__k">' +
        esc(lbl(byId[gapNode])) + '</span>' +
        Object.keys(gm).map(function (k) { return '<b>' + esc(k) + ':</b> ' + esc(gm[k]); }).join('<br>') +
        '</div>';
    }

    return head('Двигатель CZCA · 1.4 TSI EA211',
        'Заводской паспорт агрегата, структура ремонтного мануала и все моменты затяжки, которые в нём есть.') +
      '<section class="plate">' + specs + '</section>' + body + colophon();
  }

  /* — fuses: compact list + доступ к расширенному режиму — */
  function viewFuses() {
    var fuses = (kids.cat_fuse || []).map(function (id) { return byId[id]; });
    var occ = fuses.filter(function (f) { return f.status === 'occ'; }).length;
    var emp = fuses.filter(function (f) { return f.status === 'emp'; }).length;
    var non = fuses.filter(function (f) { return f.status === 'none'; }).length;

    var body = '<div class="filters__row" style="margin-bottom:var(--space-lg)">' +
      '<a class="btn" href="#/fuses/pro">Расширенный режим · фильтры</a>' +
      '<span class="tally"><b>' + occ + '</b> занято · <b>' + emp + '</b> свободно · <b>' + non + '</b> нет гнезда</span>' +
      '</div>';

    body += '<div class="fusemap">' + fuses.map(slotHTML).join('') + '</div>';

    body += '<div class="tablewrap"><table class="data"><thead><tr>' +
      '<th>Гнездо</th><th>Ток</th><th>Клемма</th><th>Функция</th></tr></thead><tbody>' +
      fuses.map(function (f) { return fuseRow(f); }).join('') +
      '</tbody></table></div>';

    body += '<div class="note" style="margin-top:var(--space-xl)">' +
      '<span class="note__k">Как читать клеммы</span>' +
      '<b>Клемма 30</b> — постоянный плюс, не зависит от зажигания. <b>Клемма 15</b> — плюс появляется только с зажиганием. ' +
      'Где стоит «н/д» — источник не указывает клемму, проверяй мультиметром. ' +
      'Гнёзда со штриховой рамкой (F29–F31, F46, F50, F51) не встречаются ни в одном источнике по блоку C — физического гнезда там, скорее всего, нет.' +
      '</div>';

    return head('Предохранители · блок C (-SC-)',
        'Салонный блок, 53 гнезда. Номиналы — из Owner’s Manual VW Golf 2019, статусы «занято / пусто» — по фактической проверке этой машины.',
        '<span class="mono">53 гнезда</span><span class="mono">блок C</span><span class="mono">-SC-</span>') +
      body + colophon();
  }

  function slotHTML(f) {
    var amp = (f.amp || '–').replace(' A', '');
    return '<a class="slot" href="' + href(f.id) + '" data-status="' + esc(f.status) + '"' +
      (MINE[f.id] ? ' data-mine="1"' : '') +
      ' data-id="' + esc(f.id) + '" title="' + esc(lbl(f) + ' — ' + (f.meta['Функция'] || '')) + '">' +
      '<span class="slot__id">' + esc(lbl(f)) + '</span>' +
      '<span class="slot__a">' + esc(amp) + '</span></a>';
  }

  var TERM = {
    'клемма 30 — постоянный плюс': ['t30', '30 · пост.'],
    'клемма 15 — плюс с зажиганием': ['t15', '15 · заж.'],
    'не определена': ['tu', 'н/д']
  };

  function fuseRow(f) {
    var t = TERM[f.meta['Питание']] || ['tu', 'н/д'];
    var note = f.meta['Заметка по твоей машине'];
    return '<tr data-status="' + esc(f.status) + '" data-id="' + esc(f.id) + '">' +
      '<td class="c-id"><a href="' + href(f.id) + '">' + esc(lbl(f)) + '</a></td>' +
      '<td class="c-amp">' + esc(f.meta['Номинал'] || '–') + '</td>' +
      '<td><span class="tag tag--' + t[0] + '">' + esc(t[1]) + '</span></td>' +
      '<td class="c-fn">' + esc(f.meta['Функция'] || '') +
        (MINE[f.id] ? '<span class="mine">моя доработка</span>' : '') +
        (note ? '<small>' + esc(note) + '</small>' : '') + '</td>' +
      '</tr>';
  }

  /* — fuses PRO: filters — */
  var FP = { status: 'all', term: 'all', amp: 'all', q: '', mine: false, sort: 'num' };

  function viewFusesPro() {
    var fuses = (kids.cat_fuse || []).map(function (id) { return byId[id]; });
    var amps = [];
    fuses.forEach(function (f) {
      var a = f.meta['Номинал'] || '–';
      if (amps.indexOf(a) === -1) amps.push(a);
    });
    amps.sort(function (a, b) { return (ampNum(a) || 999) - (ampNum(b) || 999); });

    function chipRow(labelText, group, opts) {
      return '<div class="filters__row"><span class="filters__lab">' + labelText + '</span>' +
        opts.map(function (o) {
          return '<button type="button" class="chip" data-fp="' + group + '" data-val="' + esc(o[0]) + '"' +
            ' aria-pressed="' + (FP[group] === o[0]) + '">' + esc(o[1]) + '</button>';
        }).join('') + '</div>';
    }

    var bar = '<div class="filters" id="fpBar">' +
      '<div class="filters__row">' +
        '<div class="search"><label class="vh" for="fpq">Поиск по блоку</label>' +
        '<input id="fpq" type="search" placeholder="функция, номер, заметка…" value="' + esc(FP.q) + '" autocomplete="off"></div>' +
        '<button type="button" class="chip" data-fp="mine" data-val="toggle" aria-pressed="' + FP.mine + '">мои доработки</button>' +
        '<button type="button" class="chip" id="fpReset">сбросить</button>' +
        '<span class="tally" id="fpTally"></span>' +
      '</div>' +
      chipRow('Статус', 'status', [['all', 'все'], ['emp', 'свободно'], ['occ', 'занято'], ['none', 'нет гнезда']]) +
      chipRow('Клемма', 'term', [['all', 'все'], ['t30', '30 · пост.'], ['t15', '15 · заж.'], ['tu', 'н/д']]) +
      chipRow('Номинал', 'amp', [['all', 'все']].concat(amps.map(function (a) { return [a, a.replace(' A', ' А')]; }))) +
      chipRow('Сортировка', 'sort', [['num', 'по номеру'], ['amp', 'по номиналу'], ['status', 'по статусу']]) +
      '</div>';

    return head('Предохранители · расширенный режим',
        'Фильтры по статусу, клемме и номиналу. Карта блока сверху подсвечивает то, что осталось после фильтра — ' +
        'удобно, когда ищешь, куда воткнуться.',
        '<span class="mono">блок C</span><span class="mono">53 гнезда</span>' +
        '<a class="mono" href="#/fuses" style="color:var(--color-accent)">← обычный вид</a>') +
      bar +
      '<div class="fusemap" id="fpMap">' + fuses.map(slotHTML).join('') + '</div>' +
      '<div class="tablewrap"><table class="data"><thead><tr>' +
        '<th>Гнездо</th><th>Ток</th><th>Клемма</th><th>Функция</th></tr></thead>' +
        '<tbody id="fpBody"></tbody></table></div>' +
      '<div class="empty" id="fpEmpty" hidden>Под эти фильтры ничего не попало. Сбрось часть условий.</div>' +
      colophon();
  }

  function fpApply() {
    var body = document.getElementById('fpBody');
    if (!body) return;
    var fuses = (kids.cat_fuse || []).map(function (id) { return byId[id]; });
    var q = fold(FP.q).trim();

    var kept = fuses.filter(function (f) {
      if (FP.status !== 'all' && f.status !== FP.status) return false;
      if (FP.mine && !MINE[f.id]) return false;
      if (FP.term !== 'all') {
        var t = (TERM[f.meta['Питание']] || ['tu'])[0];
        if (t !== FP.term) return false;
      }
      if (FP.amp !== 'all' && (f.meta['Номинал'] || '–') !== FP.amp) return false;
      if (q) {
        var hay = fold(lbl(f) + ' ' + Object.keys(f.meta).map(function (k) { return f.meta[k]; }).join(' '));
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var order = { emp: 0, occ: 1, none: 2 };
    kept.sort(function (a, b) {
      if (FP.sort === 'amp') {
        var d = (ampNum(a.amp) || 999) - (ampNum(b.amp) || 999);
        if (d) return d;
      } else if (FP.sort === 'status') {
        var s = order[a.status] - order[b.status];
        if (s) return s;
      }
      return parseInt(lbl(a).slice(1), 10) - parseInt(lbl(b).slice(1), 10);
    });

    body.innerHTML = kept.map(fuseRow).join('');

    var keep = {};
    kept.forEach(function (f) { keep[f.id] = 1; });
    Array.prototype.forEach.call(document.querySelectorAll('#fpMap .slot'), function (el) {
      el.classList.toggle('is-dim', !keep[el.getAttribute('data-id')]);
    });

    var tally = document.getElementById('fpTally');
    if (tally) {
      var free = kept.filter(function (f) { return f.status === 'emp'; }).length;
      tally.innerHTML = 'показано <b>' + kept.length + '</b> из ' + fuses.length +
        (free ? ' · свободно <b>' + free + '</b>' : '');
    }
    var empty = document.getElementById('fpEmpty');
    if (empty) empty.hidden = kept.length > 0;

    Array.prototype.forEach.call(document.querySelectorAll('[data-fp]'), function (el) {
      var g = el.getAttribute('data-fp');
      if (g === 'mine') el.setAttribute('aria-pressed', String(FP.mine));
      else el.setAttribute('aria-pressed', String(FP[g] === el.getAttribute('data-val')));
    });
  }

  function fpBind() {
    var bar = document.getElementById('fpBar');
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fp], #fpReset');
      if (!b) return;
      if (b.id === 'fpReset') {
        FP = { status: 'all', term: 'all', amp: 'all', q: '', mine: false, sort: 'num' };
        var i = document.getElementById('fpq'); if (i) i.value = '';
      } else if (b.getAttribute('data-fp') === 'mine') {
        FP.mine = !FP.mine;
      } else {
        FP[b.getAttribute('data-fp')] = b.getAttribute('data-val');
      }
      fpApply();
    });
    var inp = document.getElementById('fpq');
    if (inp) inp.addEventListener('input', function () { FP.q = inp.value; fpApply(); });
    fpApply();
  }

  /* — PR codes — */
  var PRQ = '';
  function viewPR(focus) {
    if (focus) PRQ = focus;
    var total = (G.pr || []).reduce(function (a, g) { return a + g.items.length; }, 0);
    var bar = '<div class="filters" id="prBar"><div class="filters__row">' +
      '<div class="search"><label class="vh" for="prq">Фильтр PR-кодов</label>' +
      '<input id="prq" type="search" placeholder="код или слово из описания…" value="' + esc(PRQ) + '" autocomplete="off"></div>' +
      '<span class="tally" id="prTally"></span></div></div>';

    var body = (G.pr || []).map(function (g, gi) {
      return '<section data-prgroup="' + gi + '">' +
        groupHead(g.g, g.items.length + ' ' + plural(g.items.length, 'код', 'кода', 'кодов')) +
        '<div class="tablewrap"><table class="data"><tbody>' +
        g.items.map(function (it) {
          return '<tr data-pr="' + esc(fold(it[0] + ' ' + it[1] + ' ' + it[2])) + '" id="pr-' + esc(it[0]) + '">' +
            '<td class="c-id" style="color:var(--color-accent)">' + esc(it[0]) + '</td>' +
            '<td class="c-fn"><b style="font-weight:600">' + esc(it[1]) + '</b><small>' + esc(it[2]) + '</small></td>' +
            '</tr>';
        }).join('') + '</tbody></table></div></section>';
    }).join('');

    return head('PR-коды · заводская комплектация',
        'Полный список из ' + total + ' кодов по VIN, сгруппированный по системам. Это то, что реально стоит на машине с завода — ' +
        'по нему подбираются детали и проверяются гипотезы «а есть ли у меня…».') +
      bar + body +
      '<div class="empty" id="prEmpty" hidden>Ничего не нашлось. Попробуй часть кода или слово из описания.</div>' +
      colophon();
  }

  function prApply() {
    var inp = document.getElementById('prq');
    if (!inp) return;
    var q = fold(inp.value).trim();
    var shown = 0, total = 0;
    Array.prototype.forEach.call(document.querySelectorAll('[data-prgroup]'), function (sec) {
      var vis = 0;
      Array.prototype.forEach.call(sec.querySelectorAll('tr[data-pr]'), function (tr) {
        total++;
        var ok = !q || tr.getAttribute('data-pr').indexOf(q) !== -1;
        tr.hidden = !ok;
        if (ok) { vis++; shown++; }
      });
      sec.hidden = vis === 0;
    });
    var t = document.getElementById('prTally');
    if (t) t.innerHTML = 'показано <b>' + shown + '</b> из ' + total;
    var e = document.getElementById('prEmpty');
    if (e) e.hidden = shown > 0;
  }

  function prBind(focus) {
    var inp = document.getElementById('prq');
    if (!inp) return;
    inp.addEventListener('input', function () { PRQ = inp.value; prApply(); });
    prApply();
    if (focus) {
      var row = document.getElementById('pr-' + focus);
      if (row) row.scrollIntoView({ block: 'center' });
    }
  }

  /* — journal: three levels deep, so render the tree recursively — */
  function journalRow(it) {
    var m = it.meta || {};
    var key = m['Стоимость'] || m['Цена'] || m['Итого'] || m['Оценка'] || m['Статус'] || '';
    var sub = m['Подробности'] || m['Моторное масло и фильтр'] || (m['Статус'] !== key ? m['Статус'] : '') || '';
    return rowLink(it, esc(sub), esc(key));
  }

  function journalTree(ids, depth) {
    var leaves = ids.filter(function (id) { return !(kids[id] || []).length; });
    var branches = ids.filter(function (id) { return (kids[id] || []).length; });
    var out = '';
    if (leaves.length) {
      out += '<div class="index">' + leaves.map(function (id) { return journalRow(byId[id]); }).join('') + '</div>';
    }
    branches.forEach(function (bid) {
      var b = byId[bid];
      var m = b.meta || {};
      var total = m['Итого по разделу'] || m['Итого по покупкам'];
      var n = (kids[bid] || []).length;
      out += '<div class="gh"><h' + Math.min(depth + 2, 4) + '>' + esc(lbl(b)) + '</h' + Math.min(depth + 2, 4) + '>' +
        '<span class="gh__n">' + esc(total || (n + ' ' + plural(n, 'позиция', 'позиции', 'позиций'))) + '</span></div>';
      out += journalTree(kids[bid], depth + 1);
    });
    return out;
  }

  function viewJournal() {
    var spent = (kids.cat_journal || []).reduce(function (a, id) {
      var m = byId[id].meta || {};
      return a + ((m['Итого по разделу'] || m['Итого по покупкам']) ? 1 : 0);
    }, 0);
    return head('Журнал: история и траты',
        'Покупка машины, расходники по пробегу, ремонты, всё докупленное и всё, что ещё в планах. ' +
        'Суммы по разделам стоят рядом с заголовками — они посчитаны по записям внутри.',
        spent ? '<span class="mono">' + spent + ' ' + plural(spent, 'раздел с итогом', 'раздела с итогами', 'разделов с итогами') + '</span>' : '') +
      journalTree(kids.cat_journal || [], 0) + colophon();
  }

  /* — node detail — */
  function viewNode(id) {
    var n = byId[id];
    if (!n) return head('Не найдено', 'Такого узла в справочнике нет.') + colophon();

    var chain = [];
    var p = n.parent;
    while (p && byId[p]) { chain.unshift(byId[p]); p = byId[p].parent; }
    var crumbs = '<nav class="crumbs" aria-label="Хлебные крошки">' +
      chain.map(function (c) {
        return '<a href="' + routeFor(c.id) + '">' + esc(lbl(c)) + '</a><span class="sep">/</span>';
      }).join('') +
      '<span>' + esc(lbl(n)) + '</span></nav>';

    var m = n.meta || {};
    var fields = Object.keys(m).length
      ? '<dl class="fields">' + Object.keys(m).map(function (k) {
          return '<div class="field"><dt>' + esc(k) + '</dt><dd>' + esc(m[k]) + '</dd></div>';
        }).join('') + '</dl>'
      : '';

    var body = '';
    var ch = kids[id] || [];
    if (ch.length) {
      body += groupHead('Внутри', ch.length + ' ' + plural(ch.length, 'позиция', 'позиции', 'позиций'));
      body += '<div class="index">' + ch.map(function (cid) {
        var c = byId[cid];
        return rowLink(c, esc(firstMeta(c)), esc(TYPE[c.type] || ''));
      }).join('') + '</div>';
    }

    var cl = cross[id] || [];
    if (cl.length) {
      body += groupHead('Связи', cl.length + ' ' + plural(cl.length, 'связь', 'связи', 'связей'));
      body += '<div class="index">' + cl.map(function (c) {
        var o = byId[c.id];
        if (!o) return '';
        return '<a class="row" href="' + href(o.id) + '">' +
          '<span class="row__t">' + esc(lbl(o)) + '</span>' +
          '<span class="row__k">' + esc(c.label) + '</span>' +
          '<span class="row__s">' + esc(TYPE[o.type] || o.type) + (firstMeta(o) ? ' · ' + esc(firstMeta(o)) : '') + '</span>' +
          '</a>';
      }).join('') + '</div>';
    }

    var flags = [];
    if (n.type === 'part' && n.verified === false) flags.push('источник — скриншот ETKA');
    if (MINE[id]) flags.push('затронуто твоей доработкой');

    return crumbs +
      head(lbl(n), '', '<span class="mono">' + esc(TYPE[n.type] || n.type) + '</span>' +
        (n.amp ? '<span class="mono">' + esc(n.amp) + '</span>' : '') +
        flags.map(function (f) { return '<span class="mono">' + esc(f) + '</span>'; }).join('')) +
      fields + body + colophon();
  }

  function routeFor(id) {
    for (var i = 0; i < SECTIONS.length; i++) {
      if (SECTIONS[i].id === id) return '#/' + SECTIONS[i].route;
    }
    return href(id);
  }

  /* ── router ───────────────────────────────────────────────── */
  function route() {
    var h = (location.hash || '#/').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    var view = document.getElementById('view');
    var html, after = null, active = parts[0] || '';

    if (parts[0] === 'n') {
      html = viewNode(parts[1]);
      active = sectionOf(parts[1]);
    } else if (parts[0] === 'fuses' && parts[1] === 'pro') {
      html = viewFusesPro(); after = fpBind; active = 'fuses';
    } else if (parts[0] === 'fuses') {
      html = viewFuses();
    } else if (parts[0] === 'pr') {
      html = viewPR(parts[1] || PRQ);
      after = function () { prBind(parts[1]); };
    } else if (parts[0] === 'engine') {
      html = viewEngine();
    } else if (parts[0] === 'journal') {
      html = viewJournal();
    } else if (!parts.length) {
      html = viewOverview();
    } else {
      var s = SECTIONS.filter(function (x) { return x.route === parts[0]; })[0];
      html = s ? viewSection(s) : viewNode(parts[0]);
    }

    view.innerHTML = html;
    if (after) after();
    markNav(active);
    document.title = (view.querySelector('h1') ? view.querySelector('h1').textContent + ' · ' : '') + 'Golf 7.5 CZCA';
    window.scrollTo(0, 0);
  }

  function sectionOf(id) {
    var n = byId[id];
    while (n) {
      for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === n.id) return SECTIONS[i].route;
      n = n.parent ? byId[n.parent] : null;
    }
    return '';
  }

  function markNav(route) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-route]'), function (a) {
      if (a.getAttribute('data-route') === route) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* ── nav + search wiring ──────────────────────────────────── */
  function navHTML() {
    var html = SECTIONS.map(function (s) {
      var c = s.route === 'pr'
        ? (G.pr || []).reduce(function (a, g) { return a + g.items.length; }, 0)
        : (s.route === '' ? '' : deepCount(s.id));
      return '<a class="navlink" data-route="' + s.route + '" href="#/' + s.route + '">' +
        '<span class="navlink__t">' + esc(s.nav) + '</span>' +
        (c ? '<span class="navlink__n">' + c + '</span>' : '') + '</a>';
    }).join('');
    if (HAS_GRAPH) {
      html += '<a class="navlink" href="graph.html">' +
        '<span class="navlink__t">Граф связей</span><span class="navlink__n">↗</span></a>';
    }
    return html;
  }

  function buildSearch(host, id) {
    host.innerHTML = '<div class="search">' +
      '<label class="vh" for="' + id + '">Поиск по справочнику</label>' +
      '<input id="' + id + '" type="search" placeholder="поиск · /" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="' + id + '-r">' +
      '<div class="results" id="' + id + '-r" role="listbox"></div></div>';

    var inp = host.querySelector('input');
    var res = host.querySelector('.results');
    var idx = -1;

    function close() { res.classList.remove('is-open'); inp.setAttribute('aria-expanded', 'false'); idx = -1; }
    function open(items) {
      if (!items.length) {
        res.innerHTML = '<p class="none">Ничего не нашлось.</p>';
      } else {
        res.innerHTML = items.map(function (r) {
          return '<a href="' + r.url + '" role="option"><span class="rt">' + esc(r.title) +
            '</span><span class="rk">' + esc(r.key) + '</span></a>';
        }).join('');
      }
      res.classList.add('is-open');
      inp.setAttribute('aria-expanded', 'true');
      idx = -1;
    }

    inp.addEventListener('input', function () {
      var q = inp.value.trim();
      if (q.length < 2) { close(); return; }
      open(search(q, 20));
    });
    inp.addEventListener('keydown', function (e) {
      var opts = res.querySelectorAll('a');
      if (e.key === 'Escape') { close(); inp.blur(); return; }
      if (!opts.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        idx = e.key === 'ArrowDown'
          ? Math.min(idx + 1, opts.length - 1)
          : Math.max(idx - 1, 0);
        Array.prototype.forEach.call(opts, function (o, i) { o.classList.toggle('is-active', i === idx); });
        opts[idx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        (opts[idx < 0 ? 0 : idx]).click();
      }
    });
    res.addEventListener('click', function (e) {
      if (e.target.closest('a')) { close(); inp.value = ''; inp.blur(); }
    });
    document.addEventListener('click', function (e) {
      if (!host.contains(e.target)) close();
    });
    return inp;
  }

  /* ── theme ────────────────────────────────────────────────── */
  function themeInit() {
    var btns = document.querySelectorAll('[data-theme-toggle]');
    if (!btns.length) return;
    function paint() {
      var light = document.documentElement.getAttribute('data-theme') === 'light';
      Array.prototype.forEach.call(btns, function (b) {
        b.textContent = light ? '☾' : '☀';
        var t = light ? 'Включить тёмную тему' : 'Включить светлую тему';
        b.setAttribute('aria-label', t);
        b.title = t;
      });
    }
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () {
        var light = document.documentElement.getAttribute('data-theme') === 'light';
        if (light) document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', 'light');
        try { localStorage.setItem('golf-theme', light ? 'dark' : 'light'); } catch (err) { /* file:// */ }
        paint();
      });
    });
    paint();
  }

  /* ── boot ─────────────────────────────────────────────────── */
  function boot() {
    document.getElementById('railNav').innerHTML = navHTML();
    document.getElementById('tabNav').innerHTML = navHTML();

    var railInput = buildSearch(document.getElementById('railSearch'), 'q1');
    var topInput = buildSearch(document.getElementById('topSearch'), 'q2');

    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        (window.innerWidth >= 900 ? railInput : topInput).focus();
      }
    });

    themeInit();
    window.addEventListener('hashchange', route);
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
