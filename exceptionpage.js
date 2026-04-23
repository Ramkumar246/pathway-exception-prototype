$(function () {
  'use strict';

  /* ──────────────────────────────────────────────
     STATE
  ────────────────────────────────────────────── */
  let allData = [];
  let filtered = [];
  let currentPage = 1;
  let pageSize = 10;
  let sortKey = 'exception_datetime';
  let sortDir = 'desc';
  let viewMode = 'table'; // 'table' | 'cards'

  const CARDS_PER_PAGE = 5;

  const TITLE_LABELS = {
    PREDICTION_CHANGE_DELAY_INCREASE: 'Delay Increase',
    PREDICTION_CHANGE_DELAY_DECREASE: 'Delay Decrease',
    EQUIPMENT_WARNING: 'Equipment Warning',
  };

  const TYPE_LABELS = {
    CONTAINER_DELAY_NOTIFICATION: 'Container Delay',
    TRANSPORT_WARNING: 'Transport Warning',
  };

  const EVENT_LABELS = {
    ARRI: 'Arrival',
    DISC: 'Discharge',
    GTOT: 'Gate Out',
  };

  const CALL_TYPE_LABELS = {
    PORT_OF_DESTINATION: 'Port of Destination',
    INTERMEDIATE_PORT: 'Intermediate Port',
  };


  /* ──────────────────────────────────────────────
     INIT
  ────────────────────────────────────────────── */
  $.getJSON('sample.json', function (json) {
    allData = json.exceptions || [];
    buildLocationFilter();
    applyFilters();
    buildCharts();
  }).fail(function () {
    $('#tableBody').html('<tr><td colspan="9" class="text-center text-danger py-4">Failed to load sample.json</td></tr>');
  });

  /* Flatpickr */
  flatpickr('.flatpickr', { dateFormat: 'd-m-Y', allowInput: false });

  /* ──────────────────────────────────────────────
     BUILD LOCATION FILTER OPTIONS
  ────────────────────────────────────────────── */
  function buildLocationFilter() {
    const codes = [...new Set(
      allData
        .map(e => e.data && e.data.un_location_code)
        .filter(Boolean)
    )].sort();
    codes.forEach(code => {
      $('#filterLocation').append(`<option value="${code}">${code}</option>`);
    });
  }

  /* ──────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────── */
  function getContainer(item) {
    return item.data
      ? (item.data.equipment_reference || item.data.reference || '–')
      : '–';
  }

  function getLocation(item) {
    return item.data ? (item.data.un_location_code || '–') : '–';
  }

  function getEventCode(item) {
    return item.data ? (item.data.event_type_code || '–') : '–';
  }

  function getCallType(item) {
    return item.data ? (item.data.transport_call_type || '–') : '–';
  }

  function fmtDateTime(dt) {
    if (!dt) return '–';
    const d = new Date(dt);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDate(dt) {
    if (!dt) return '–';
    const d = new Date(dt);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function titleBadge(title) {
    const map = {
      PREDICTION_CHANGE_DELAY_INCREASE: 'badge-increase',
      PREDICTION_CHANGE_DELAY_DECREASE: 'badge-decrease',
      EQUIPMENT_WARNING: 'badge-equip',
    };
    const label = TITLE_LABELS[title] || title;
    const cls = map[title] || 'badge-secondary';
    return `<span class="ex-badge ${cls}">${label}</span>`;
  }

  function typeBadge(type) {
    const cls = type === 'TRANSPORT_WARNING' ? 'badge-type-tw' : 'badge-type-cdn';
    const label = TYPE_LABELS[type] || type;
    return `<span class="ex-badge ${cls}">${label}</span>`;
  }

  /* ──────────────────────────────────────────────
     APPLY FILTERS + SORT
  ────────────────────────────────────────────── */
  function applyFilters() {
    const type = $('#filterType').val();
    const title = $('#filterTitle').val();
    const event = $('#filterEvent').val();
    const location = $('#filterLocation').val();
    const search = $('#globalSearch').val().toLowerCase().trim();

    const fromVal = $('#filterFrom').val();
    const toVal = $('#filterTo').val();
    const fromDate = fromVal ? flatpickr.parseDate(fromVal, 'd-m-Y') : null;
    const toDate = toVal ? flatpickr.parseDate(toVal, 'd-m-Y') : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    filtered = allData.filter(item => {
      if (type && item.exception_type !== type) return false;
      if (title && item.title !== title) return false;
      if (event && getEventCode(item) !== event) return false;
      if (location && getLocation(item) !== location) return false;

      if (fromDate || toDate) {
        const dt = new Date(item.exception_datetime);
        if (fromDate && dt < fromDate) return false;
        if (toDate && dt > toDate) return false;
      }

      if (search) {
        const haystack = [
          getContainer(item),
          item.data && item.data.transport_id,
          getLocation(item),
          item.title,
          item.exception_type,
          item.detail,
        ].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });

    /* sort */
    filtered.sort((a, b) => {
      let va, vb;
      if (sortKey === 'exception_datetime') {
        va = new Date(a.exception_datetime).getTime();
        vb = new Date(b.exception_datetime).getTime();
      } else {
        va = (a[sortKey] || '').toLowerCase();
        vb = (b[sortKey] || '').toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    currentPage = 1;
    render();
  }

  /* ──────────────────────────────────────────────
     RENDER (route to table or cards)
  ────────────────────────────────────────────── */
  function render() {
    const total = filtered.length;
    $('#recordCount').text(`Showing ${total} exception${total !== 1 ? 's' : ''}`);
    if (viewMode === 'table') renderTable();
    else renderCards();
  }

  /* ──────────────────────────────────────────────
     TABLE VIEW
  ────────────────────────────────────────────── */
  function renderTable() {
    pageSize = parseInt($('#pageSize').val(), 10);
    const start = (currentPage - 1) * pageSize;
    const page = filtered.slice(start, start + pageSize);

    const rows = page.map((item, idx) => {
      const container = getContainer(item);
      const transport = item.data ? (item.data.transport_id || '–') : '–';
      const location = getLocation(item);
      const eventCode = getEventCode(item);
      const callType = getCallType(item);
      const i = start + idx;

      return `<tr class="exception-row" data-idx="${i}">
        <td class="text-nowrap">${fmtDateTime(item.exception_datetime)}</td>
        <td>${typeBadge(item.exception_type)}</td>
        <td>${titleBadge(item.title)}</td>
        <td class="mono">${container}</td>
        <td class="transport-id" title="${transport}">${transport}</td>
        <td><span class="location-badge">${location}</span></td>
        <td><span class="event-badge">${eventCode}</span> <small class="text-muted">${EVENT_LABELS[eventCode] || ''}</small></td>
        <td class="small text-muted">${CALL_TYPE_LABELS[callType] || callType}</td>
        <td><button class="btn btn-xs btn-outline-primary btn-view" data-idx="${i}">View</button></td>
      </tr>`;
    }).join('');

    $('#tableBody').html(rows || '<tr><td colspan="9" class="text-center text-muted py-4">No exceptions match the current filters.</td></tr>');
    renderPagination('#pagination', filtered.length, pageSize);
  }

  /* ──────────────────────────────────────────────
     CARDS VIEW
  ────────────────────────────────────────────── */
  function renderCards() {
    const start = (currentPage - 1) * CARDS_PER_PAGE;
    const page = filtered.slice(start, start + CARDS_PER_PAGE);

    const cards = page.map((item, idx) => {
      const container = getContainer(item);
      const location  = getLocation(item);
      const transport = item.data ? (item.data.transport_id || '–') : '–';
      const eventCode = getEventCode(item);
      const callType  = CALL_TYPE_LABELS[getCallType(item)] || getCallType(item);
      const i = start + idx;

      const isIncrease = item.title === 'PREDICTION_CHANGE_DELAY_INCREASE';
      const isDecrease = item.title === 'PREDICTION_CHANGE_DELAY_DECREASE';

      /* per-type colour theme */
      const theme = isIncrease ? 'card-theme-danger'
                  : isDecrease ? 'card-theme-success'
                  : 'card-theme-warning';

      /* event code colour */
      const eventColor = { ARRI: 'ec-arri', DISC: 'ec-disc', GTOT: 'ec-gtot' }[eventCode] || 'ec-default';

      /* delta timing */
      let timingHtml = '';
      if (item.data && item.data.previous_event_datetime && item.data.new_event_datetime) {
        const diff    = Math.round((new Date(item.data.new_event_datetime) - new Date(item.data.previous_event_datetime)) / 86400000);
        const sign    = diff > 0 ? `+${diff}` : `${diff}`;
        const pill    = diff > 0 ? 'delta-pill--up' : 'delta-pill--down';
        const icon    = diff > 0 ? 'bi-arrow-up-circle-fill' : 'bi-arrow-down-circle-fill';
        const prevStyle = diff > 0 ? 'style="text-decoration:line-through;color:#DC2626;"' : '';
        timingHtml = `
          <div class="card-timing-inline">
            <div class="timing-block">
              <span class="timing-label">PREV</span>
              <span class="timing-val" ${prevStyle}>${fmtDate(item.data.previous_event_datetime)}</span>
            </div>
            <div class="timing-pill-wrap">
              <span class="delta-pill ${pill}"><i class="bi ${icon}"></i> ${sign}d</span>
            </div>
            <div class="timing-block">
              <span class="timing-label">NEW</span>
              <span class="timing-val">${fmtDate(item.data.new_event_datetime)}</span>
            </div>
          </div>`;
      }

      return `<div class="col-12">
        <div class="exception-card ${theme}" data-idx="${i}">

          <!-- Col 1: ID + Container + Transport + Sub-type badge (vertical left block) -->
          <div class="card-col card-col--ref">
            <div class="d-flex align-items-center gap-2 mb-1">
              <span class="card-type-dot"></span>
              <span class="card-id-text">#${item.data ? item.data.id : '–'}</span>
            </div>
            <div class="card-container"><i class="bi bi-box-seam card-ref-icon"></i>${container}</div>
            <div class="card-transport-text mt-1"><i class="bi bi-ship"></i>${transport}</div>
            <div class="mt-2">${titleBadge(item.title)}</div>
          </div>

          <!-- Col 2: Location → Event Code + Call type below (hidden for TRANSPORT_WARNING) -->
          ${item.exception_type !== 'TRANSPORT_WARNING' ? `
          <div class="card-col card-col--chips">
            <div class="card-col-label">Route / Event</div>
            <div class="card-route-row">
              <span class="card-chip card-chip--loc"><i class="bi bi-geo-alt-fill"></i>${location}</span>
              <span class="card-route-arrow"><i class="bi bi-arrow-right"></i></span>
              <span class="card-chip ${eventColor}">${eventCode}</span>
            </div>
            <div class="mt-1 card-calltype-text">${callType}</div>
          </div>` : ''}

          <!-- Col 3: Schedule Change (hidden for TRANSPORT_WARNING) -->
          ${item.exception_type !== 'TRANSPORT_WARNING' ? `
          <div class="card-col card-col--timing">
            <div class="card-col-label">Schedule Change</div>
            ${timingHtml || '<span class="card-no-change">No schedule change</span>'}
          </div>` : ''}

          <!-- Col 4: Detail message -->
          <div class="card-col card-col--detail">
            <div class="card-col-label">Detail</div>
            <div class="card-detail">${item.detail || '–'}</div>
          </div>

          <!-- Col 5: Reported time -->
          <div class="card-col card-col--action">
            <div class="card-col-label">Reported</div>
            <span class="card-footer-time"><i class="bi bi-clock"></i>${fmtDateTime(item.exception_datetime)}</span>
          </div>

        </div>
      </div>`;
    }).join('');

    $('#cardsGrid').html(cards || '<div class="col-12 text-center text-muted py-4">No exceptions match the current filters.</div>');
    renderPagination('#paginationCards', filtered.length, CARDS_PER_PAGE);
  }

  /* ──────────────────────────────────────────────
     PAGINATION
  ────────────────────────────────────────────── */
  function renderPagination(selector, total, size) {
    const pages = Math.ceil(total / size);
    if (pages <= 1) { $(selector).html(''); return; }

    const MAX_VISIBLE = 7;
    let html = '';

    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage - 1}">&laquo;</a></li>`;

    if (pages <= MAX_VISIBLE) {
      for (let i = 1; i <= pages; i++) {
        html += pageItem(i);
      }
    } else {
      html += pageItem(1);
      if (currentPage > 4) html += '<li class="page-item disabled"><span class="page-link">…</span></li>';
      const start = Math.max(2, currentPage - 2);
      const end = Math.min(pages - 1, currentPage + 2);
      for (let i = start; i <= end; i++) html += pageItem(i);
      if (currentPage < pages - 3) html += '<li class="page-item disabled"><span class="page-link">…</span></li>';
      html += pageItem(pages);
    }

    html += `<li class="page-item ${currentPage === pages ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage + 1}">&raquo;</a></li>`;

    $(selector).html(html);
  }

  function pageItem(n) {
    return `<li class="page-item ${n === currentPage ? 'active' : ''}">
      <a class="page-link" href="#" data-page="${n}">${n}</a></li>`;
  }

  /* ──────────────────────────────────────────────
     DETAIL MODAL
  ────────────────────────────────────────────── */
  function openDetail(idx) {
    const item = filtered[idx];
    if (!item) return;

    const data = item.data || {};
    const prevDt = data.previous_event_datetime;
    const newDt = data.new_event_datetime;

    let deltaHtml = '';
    if (prevDt && newDt) {
      const diffMs = new Date(newDt) - new Date(prevDt);
      const diffDays = Math.round(diffMs / 86400000);
      const sign = diffDays > 0 ? '+' : '';
      deltaHtml = `<div class="alert ${diffDays > 0 ? 'alert-danger' : 'alert-success'} py-2 mt-3">
        <strong>Schedule Change:</strong> ${sign}${diffDays} day${Math.abs(diffDays) !== 1 ? 's' : ''}
        (${fmtDateTime(prevDt)} → ${fmtDateTime(newDt)})
      </div>`;
    }

    const rows = (pairs) => pairs.map(([k, v]) => v
      ? `<tr><th class="text-muted fw-normal" style="width:40%">${k}</th><td>${v}</td></tr>`
      : ''
    ).join('');

    const html = `
      <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
        ${typeBadge(item.exception_type)} ${titleBadge(item.title)}
        <span class="text-muted small">${fmtDateTime(item.exception_datetime)}</span>
      </div>
      <div class="alert alert-light py-2"><em>${item.detail || '–'}</em></div>
      ${deltaHtml}
      <h6 class="mt-3 mb-2 text-muted fw-semibold">Exception Data</h6>
      <table class="table table-sm table-bordered">
        <tbody>
          ${rows([
            ['Container / Ref', getContainer(item)],
            ['Transport ID', data.transport_id],
            ['UN Location Code', data.un_location_code],
            ['Event Type Code', data.event_type_code ? `${data.event_type_code} – ${EVENT_LABELS[data.event_type_code] || ''}` : null],
            ['Transport Call Type', CALL_TYPE_LABELS[data.transport_call_type] || data.transport_call_type],
            ['Previous Event Time', prevDt ? fmtDateTime(prevDt) : null],
            ['New Event Time', newDt ? fmtDateTime(newDt) : null],
            ['Carrier Code', data.vessel_operator_carrier_code],
            ['Status Code', data.status_code],
            ['Record ID', data.id],
          ])}
        </tbody>
      </table>
      <div class="text-muted small mt-2">Docs: <a href="${item.type}" target="_blank">${item.type}</a></div>
    `;

    $('#detailModalLabel').text(item.title.replace(/_/g, ' '));
    $('#modalBody').html(html);
    new bootstrap.Modal(document.getElementById('detailModal')).show();
  }

  /* ──────────────────────────────────────────────
     KPI WIDGETS
  ────────────────────────────────────────────── */
  function buildCharts() {
    const totalExceptions = allData.length; // 500 from JSON
    const totalRequests   = 25;
    const totalSuccess    = 20;
    const todayFailed     = 5;
    $('#statRequests').text(totalRequests);
    $('#statRequestsSub').text('Sent to OceanIO API today');
    $('#statSuccess').text(totalSuccess);
    $('#statSuccessSub').html('<span class="kpi-ok">&#10003;</span> Tracking active');
    $('#statExceptions').text(todayFailed);
    $('#statExceptionsSub').html('<span class="kpi-fail">&#9888;</span> Requires attention');
    $('#statRate').text(totalExceptions.toLocaleString());
    $('#statRateSub').text('');
  }

  /* ──────────────────────────────────────────────
     EXPORT CSV
  ────────────────────────────────────────────── */
  function exportCSV() {
    const headers = ['Exception DateTime', 'Exception Type', 'Title', 'Container/Ref', 'Transport ID', 'UN Location', 'Event Code', 'Call Type', 'Previous Event DT', 'New Event DT', 'Detail'];
    const rows = filtered.map(item => {
      const d = item.data || {};
      return [
        item.exception_datetime,
        item.exception_type,
        item.title,
        getContainer(item),
        d.transport_id || '',
        d.un_location_code || '',
        d.event_type_code || '',
        d.transport_call_type || '',
        d.previous_event_datetime || '',
        d.new_event_datetime || '',
        (item.detail || '').replace(/,/g, ';'),
      ];
    });

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exceptions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ──────────────────────────────────────────────
     EVENT BINDINGS
  ────────────────────────────────────────────── */

  /* Filter dropdown toggle */
  $('#btnFilterToggle').on('click', function (e) {
    e.stopPropagation();
    const $d = $('#filterDropdown');
    const open = $d.hasClass('open');
    $d.toggleClass('open', !open);
    $('#triggerChevron').toggleClass('rotated', !open);
  });

  /* Close on outside click */
  $(document).on('click', function (e) {
    if (!$(e.target).closest('.filter-trigger-wrap').length) {
      $('#filterDropdown').removeClass('open');
      $('#triggerChevron').removeClass('rotated');
    }
  });

  /* Chip filter clicks */
  $(document).on('click', '.filter-chip', function () {
    const $chip = $(this);
    const $group = $chip.closest('.filter-chips');
    const groupId = $group.attr('id');
    const val = $chip.data('val');

    $group.find('.filter-chip').removeClass('active');
    $chip.addClass('active');

    const selectMap = { chipType: '#filterType', chipTitle: '#filterTitle', chipEvent: '#filterEvent' };
    if (selectMap[groupId]) $(selectMap[groupId]).val(val);

    updateActiveBadge();
    applyFilters();
  });

  /* Hidden select + location + date still drive applyFilters */
  $('#filterLocation').on('change', function () { updateActiveBadge(); applyFilters(); });
  $('#globalSearch').on('input', debounce(applyFilters, 300));
  $('#filterFrom, #filterTo').on('change', function () { updateActiveBadge(); applyFilters(); });

  function updateActiveBadge() {
    let count = 0;
    if ($('#filterType').val()) count++;
    if ($('#filterTitle').val()) count++;
    if ($('#filterEvent').val()) count++;
    if ($('#filterLocation').val()) count++;
    if ($('#filterFrom').val()) count++;
    if ($('#filterTo').val()) count++;
    if (count > 0) {
      $('#filterActiveBadge').text(count + ' active').removeClass('d-none');
    } else {
      $('#filterActiveBadge').addClass('d-none');
    }
  }

  /* Reset */
  $('#btnResetFilters').on('click', function () {
    $('#filterType, #filterTitle, #filterEvent, #filterLocation').val('');
    $('#globalSearch').val('');
    $('.filter-chip').removeClass('active');
    $('.filter-chip[data-val=""]').addClass('active');
    try { document.querySelector('#filterFrom')._flatpickr.clear(); } catch(e) {}
    try { document.querySelector('#filterTo')._flatpickr.clear(); } catch(e) {}
    $('#filterFrom, #filterTo').val('');
    $('#filterActiveBadge').addClass('d-none');
    applyFilters();
  });


  /* Sort */
  $(document).on('click', '.sortable', function () {
    const key = $(this).data('sort');
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = 'asc'; }
    $('.sortable .sort-icon').removeClass('bi-arrow-up bi-arrow-down').addClass('bi-arrow-down-up');
    $(this).find('.sort-icon')
      .removeClass('bi-arrow-down-up')
      .addClass(sortDir === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down');
    applyFilters();
  });

  /* Pagination */
  $(document).on('click', '.page-link', function (e) {
    e.preventDefault();
    const p = parseInt($(this).data('page'), 10);
    if (isNaN(p)) return;
    currentPage = p;
    render();
    $('html, body').animate({ scrollTop: 0 }, 200);
  });

  /* Row click — table only */
  $(document).on('click', '.btn-view', function () {
    openDetail(parseInt($(this).data('idx'), 10));
  });
  $(document).on('click', '.exception-row', function (e) {
    if ($(e.target).closest('button').length) return;
    openDetail(parseInt($(this).data('idx'), 10));
  });

  /* View toggle */
  $('#btnTable').on('click', function () {
    viewMode = 'table';
    $('#tableView').removeClass('d-none');
    $('#cardsView').addClass('d-none');
    $('#btnTable').addClass('btn-primary active').removeClass('btn-outline-secondary');
    $('#btnCards').addClass('btn-outline-secondary').removeClass('btn-primary active');
    currentPage = 1;
    render();
  });

  $('#btnCards').on('click', function () {
    viewMode = 'cards';
    $('#cardsView').removeClass('d-none');
    $('#tableView').addClass('d-none');
    $('#btnCards').addClass('btn-primary active').removeClass('btn-outline-secondary');
    $('#btnTable').addClass('btn-outline-secondary').removeClass('btn-primary active');
    currentPage = 1;
    render();
  });

  /* Page size */
  $('#pageSize').on('change', function () {
    currentPage = 1;
    render();
  });

  /* Export */
  $('#btnExport').on('click', exportCSV);

  /* ──────────────────────────────────────────────
     UTILITY
  ────────────────────────────────────────────── */
  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }
});
