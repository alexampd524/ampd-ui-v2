// ═══════════════════════════════════════════════════════════════════════════
// AMPD BOARD — JavaScript Module (Multi-page version)
// ═══════════════════════════════════════════════════════════════════════════

// Apply saved theme immediately
try { document.documentElement.setAttribute('data-theme', localStorage.getItem('ampd-theme') || 'light'); } catch(e) {}

// Auto-highlight sidebar and mobile nav for current page
(function() {
  var path = window.location.pathname.split('/').pop() || 'index.html';
  var pageMap = {'index.html':'dashboard','cases.html':'cases','invoices.html':'invoices',
    'fees.html':'fees','rules.html':'rules','reconciliation.html':'reconciliation',
    'clients.html':'clients','notifications.html':'notifications','settings.html':'settings'};
  var currentPage = pageMap[path] || 'dashboard';
  document.querySelectorAll('.sb-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === currentPage);
  });
  document.querySelectorAll('.mob-nav-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === currentPage);
  });
})();

(function() {
  'use strict';

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 1: UTILITIES & FORMATTING
  // ───────────────────────────────────────────────────────────────────────────

  // Seeded RNG for deterministic randomness
  function seededRng(seed) {
    return function() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }
  const rng = seededRng(42);

  // Abbreviate large billing numbers (7+ digits → $X.XXM)
  function formatBillingValue(rawValue) {
    const num = parseFloat(rawValue);
    if (isNaN(num)) return '$0';
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1000000) {
      return sign + '$' + (abs / 1000000).toFixed(2) + 'M';
    }
    return sign + '$' + Math.round(abs).toLocaleString('en-US');
  }

  // Apply on load to any element with data-raw-value
  document.querySelectorAll('.billing-big[data-raw-value]').forEach(function(el) {
    el.textContent = formatBillingValue(el.dataset.rawValue);
  });

  // Abbreviate chart bar labels for large numbers
  function fmtChartNum(n) {
    n = parseInt(n) || 0;
    if (n >= 100000) return (n / 1000).toFixed(0) + 'k';
    if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return n.toString();
  }

  function fmtChartDollar(n) {
    n = parseFloat(n) || 0;
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return '$' + n.toFixed(0);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: POPOVER FACTORY
  // ───────────────────────────────────────────────────────────────────────────

  function createPopover(config) {
    const {
      trigger,
      popover,
      overlay,
      onShow,
      onPosition,
      isToggle
    } = config;

    let hideTimer = null;
    let isOpen = false;
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    function show() {
      clearTimeout(hideTimer);
      if (onShow) onShow();
      popover.classList.add('visible');
      if (overlay && isTouch) overlay.classList.add('visible');
      if (onPosition && !isTouch) onPosition();
      isOpen = true;
    }

    function hide() {
      popover.classList.remove('visible');
      if (overlay) overlay.classList.remove('visible');
      isOpen = false;
    }

    function scheduleHide() {
      hideTimer = setTimeout(hide, 150);
    }

    function cancelHide() {
      clearTimeout(hideTimer);
    }

    // Attach listeners
    if (isToggle) {
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        if (isOpen) hide();
        else show();
      });
      if (overlay) overlay.addEventListener('click', hide);
    } else {
      if (isTouch) {
        trigger.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (isOpen) hide();
          else show();
        });
        if (overlay) overlay.addEventListener('click', hide);
      } else {
        trigger.addEventListener('mouseenter', show);
        trigger.addEventListener('mouseleave', scheduleHide);
        popover.addEventListener('mouseenter', cancelHide);
        popover.addEventListener('mouseleave', scheduleHide);
      }
    }

    return { show, hide };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: CHIP FILTER FACTORY
  // ───────────────────────────────────────────────────────────────────────────

  function createChipFilter(config) {
    var onChange = config.onChange || null;
    var barEl = config.barEl || (config.containerId ? document.getElementById(config.containerId) : null);
    var allBtn = document.getElementById(config.allBtnId);
    var addBtn = document.getElementById(config.addBtnId);
    var origDropdown = document.getElementById(config.dropdownId);
    var searchInput = document.getElementById(config.searchId);
    var listEl = document.getElementById(config.listId);
    var applyBtn = document.getElementById(config.applyId);
    var clearBtn = document.getElementById(config.clearId);
    var chipsScroll = document.getElementById(config.chipsScrollId);

    // Bail out safely if required elements are missing
    if (!addBtn || !origDropdown || !listEl || !chipsScroll || !allBtn) {
      console.warn('createChipFilter: missing required DOM elements', config);
      return { getSelected: function() { return []; } };
    }

    var selectedItems = [];
    var isOpen = false;

    // Move the dropdown to document.body so it's never clipped by overflow on parents
    var dropdown = origDropdown;
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '9999';
    dropdown.style.top = '0';
    dropdown.style.left = '0';
    dropdown.style.display = 'none';
    document.body.appendChild(dropdown);

    // Populate list dynamically from items config if list is empty
    if (config.items && config.items.length > 0 && listEl.children.length === 0) {
      config.items.forEach(function(item) {
        var opt = document.createElement('label');
        opt.className = 'loc-option';
        opt.innerHTML = '<input type="checkbox" value="' + item.value + '"> <span>' + item.label + '</span>';
        listEl.appendChild(opt);
      });
    }

    function getOptions() {
      return listEl.querySelectorAll('.loc-option');
    }

    function filterOptions(q) {
      getOptions().forEach(function(opt) {
        var text = opt.querySelector('span').textContent.toLowerCase();
        opt.classList.toggle('hidden', q && text.indexOf(q) === -1);
      });
    }

    function positionDropdown() {
      var rect = addBtn.getBoundingClientRect();
      var dw = 320;
      var left = rect.left;
      // Keep within viewport
      if (left + dw > window.innerWidth - 8) left = window.innerWidth - dw - 8;
      if (left < 8) left = 8;
      dropdown.style.top = (rect.bottom + 6) + 'px';
      dropdown.style.left = left + 'px';
      dropdown.style.width = dw + 'px';
    }

    function openDropdown() {
      if (isOpen) return;
      isOpen = true;
      positionDropdown();
      dropdown.style.display = 'block';
      if (searchInput) { searchInput.value = ''; filterOptions(''); searchInput.focus(); }
    }

    function closeDropdown() {
      if (!isOpen) return;
      isOpen = false;
      dropdown.style.display = 'none';
    }

    function renderChips() {
      // Remove old dynamic chips (keep the "All" button)
      chipsScroll.querySelectorAll('.loc-chip:not(#' + config.allBtnId + ')').forEach(function(c) { c.remove(); });

      if (selectedItems.length === 0) {
        allBtn.classList.add('active');
        allBtn.style.display = '';
        if (barEl) barEl.classList.remove('filtered');
        addBtn.innerHTML = '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Filter';
      } else {
        allBtn.classList.remove('active');
        allBtn.style.display = 'none';
        if (barEl) barEl.classList.add('filtered');
        addBtn.innerHTML = '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Edit';

        selectedItems.forEach(function(item) {
          var chip = document.createElement('button');
          chip.className = 'loc-chip active';
          chip.setAttribute('role', 'option');
          chip.innerHTML = item.label + '<span class="loc-chip-x">\u2715</span>';
          chip.querySelector('.loc-chip-x').addEventListener('click', function(e) {
            e.stopPropagation();
            getOptions().forEach(function(opt) {
              if (opt.querySelector('input').value === item.value) opt.querySelector('input').checked = false;
            });
            selectedItems = selectedItems.filter(function(l) { return l.value !== item.value; });
            renderChips();
          });
          chipsScroll.appendChild(chip);
        });
      }
      if (onChange) onChange(selectedItems);
    }

    // Toggle button
    addBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      if (isOpen) { closeDropdown(); } else { openDropdown(); }
    });

    // Search
    if (searchInput) {
      searchInput.addEventListener('click', function(e) { e.stopPropagation(); });
      searchInput.addEventListener('input', function() { filterOptions(this.value.toLowerCase()); });
    }

    // Apply
    if (applyBtn) {
      applyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        selectedItems = [];
        getOptions().forEach(function(opt) {
          var cb = opt.querySelector('input');
          if (cb && cb.checked) {
            selectedItems.push({ value: cb.value, label: opt.querySelector('span').textContent.split('\u2014')[0].trim() });
          }
        });
        renderChips();
        closeDropdown();
      });
    }

    // Clear
    if (clearBtn) {
      clearBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        getOptions().forEach(function(opt) { var cb = opt.querySelector('input'); if (cb) cb.checked = false; });
        selectedItems = [];
        renderChips();
        closeDropdown();
      });
    }

    // "All" chip
    allBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      getOptions().forEach(function(opt) { var cb = opt.querySelector('input'); if (cb) cb.checked = false; });
      selectedItems = [];
      renderChips();
    });

    // Prevent clicks inside dropdown from closing it
    dropdown.addEventListener('click', function(e) { e.stopPropagation(); });

    // Close on outside click
    document.addEventListener('mousedown', function(e) {
      if (isOpen && !dropdown.contains(e.target) && !addBtn.contains(e.target)) {
        closeDropdown();
      }
    });

    // Reposition on scroll/resize
    window.addEventListener('scroll', function() { if (isOpen) positionDropdown(); }, true);
    window.addEventListener('resize', function() { if (isOpen) positionDropdown(); });

    return { getSelected: function() { return selectedItems; } };
  }

  // ── Only run dashboard-specific sections if on the dashboard page ──
  if (document.getElementById('locFilterBar')) {

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: LOCATION FILTER & KPI STRIP DATA
  // ───────────────────────────────────────────────────────────────────────────

  // Location data distribution (simulated)
  const locWeights = {
    main: 0.30, north: 0.18, south: 0.15, east: 0.12,
    west: 0.10, branch2: 0.07, branch3: 0.05, branch4: 0.03
  };

  // Different lots genuinely have different avg invol billing per repo
  const locLifetimeAvg = {
    main: 592, north: 558, south: 535, east: 575,
    west: 512, branch2: 490, branch3: 525, branch4: 468
  };

  // Store original values on first run
  let originals = {};

  function captureOriginals() {
    // Pending task tiles
    originals.taskTiles = [];
    document.querySelectorAll('.task-item').forEach(function(tile) {
      const numEl = tile.querySelector('.task-num');
      const estEl = tile.querySelector('.task-est');
      originals.taskTiles.push({
        num: parseInt(numEl.textContent) || 0,
        est: estEl ? estEl.textContent : ''
      });
    });

    // Equipment category rows
    originals.eqRows = [];
    document.querySelectorAll('.eq-cat-row[data-total]').forEach(function(row) {
      originals.eqRows.push(parseInt(row.dataset.total) || 0);
    });
    originals.eqDriveTotal = 61;
    originals.eqVehicleTotal = 17;
    originals.eqBadge = 78;

    // Payments
    originals.payCollected = 125676;
    originals.payBilled = 140492;
    originals.payOutstanding = 14816;

    // Aging
    originals.aging = [8240, 4120, 2456];

    // Resolution
    originals.cleared = 25;
    originals.toReview = 103;

    // Est missed
    originals.estMissed = 25298;

    // Recovery & Billings (post-recovery, filterable)
    originals.recovered = 178;
    originals.recoveryRate = 13.61;
    originals.avgDays = 2.3;
    originals.grossBilled = 140492;
    originals.netBilled = 134252;
    originals.denied = 6240;
    originals.avgRepo = 472;
    originals.invoiceCount = 639;
    originals.lifetimeAvg = 548;
    originals.involRepos = 152;
    originals.volImpRepos = 26;
    originals.volImpAvg = 285;
  }

  captureOriginals();

  let locationFilterState = {
    selectedLocs: []
  };

  function getFilterMultiplier() {
    if (locationFilterState.selectedLocs.length === 0) return 1;
    let total = 0;
    locationFilterState.selectedLocs.forEach(function(loc) {
      total += (locWeights[loc.value] || 0.05);
    });
    return Math.min(1, total);
  }

  function scaleNum(orig, mult) {
    return Math.max(0, Math.round(orig * mult));
  }

  function applyLocationFilter() {
    const mult = getFilterMultiplier();
    const isFiltered = locationFilterState.selectedLocs.length > 0;

    // Pending task tiles
    document.querySelectorAll('.task-item').forEach(function(tile, i) {
      if (!originals.taskTiles[i]) return;
      const numEl = tile.querySelector('.task-num');
      const estEl = tile.querySelector('.task-est');
      const orig = originals.taskTiles[i];
      const newNum = scaleNum(orig.num, mult);
      numEl.textContent = newNum;
      if (estEl && orig.est) {
        const origAmt = parseFloat(orig.est.replace(/[^0-9.]/g, '')) || 0;
        estEl.textContent = '~$' + scaleNum(origAmt, mult).toLocaleString('en-US');
      }
    });

    // Est missed header (use new ID)
    const missedEl = document.getElementById('estMissedLabel');
    if (missedEl) {
      missedEl.textContent = '~$' + scaleNum(originals.estMissed, mult).toLocaleString('en-US') + ' est. missed';
    }

    // Equipment rows
    const eqRows = document.querySelectorAll('.eq-cat-row[data-total]');
    let driveSum = 0, vehicleSum = 0;
    const driveEl = document.getElementById('eqDriveTotal');
    const vehicleEl = document.getElementById('eqVehicleTotal');
    const driveRows = driveEl ? driveEl.closest('.eq-cat-tile').querySelectorAll('.eq-cat-row') : [];

    eqRows.forEach(function(row, i) {
      const orig = originals.eqRows[i] || 0;
      const newVal = scaleNum(orig, mult);
      row.querySelector('.eq-cat-count').textContent = newVal;
      let isDrive = false;
      driveRows.forEach(function(dr) { if (dr === row) isDrive = true; });
      if (isDrive) driveSum += newVal; else vehicleSum += newVal;
    });

    if (driveEl) driveEl.textContent = driveSum + ' →';
    if (vehicleEl) vehicleEl.textContent = vehicleSum + ' →';

    const badgeEl = document.getElementById('eqBadgeCount');
    const badgeOf = document.getElementById('eqBadgeOf');
    if (badgeEl) badgeEl.textContent = driveSum + vehicleSum;
    if (badgeOf && isFiltered) {
      badgeOf.style.display = 'inline';
      badgeOf.textContent = ' of ' + originals.eqBadge;
    } else if (badgeOf) {
      badgeOf.style.display = 'none';
    }

    // Payments (use new IDs)
    const payBig = document.getElementById('paymentsBig');
    if (payBig) payBig.textContent = '$' + scaleNum(originals.payCollected, mult).toLocaleString('en-US');

    const payFill = document.getElementById('payProgressFill');
    const payPct = document.getElementById('payProgressPct');
    const payTotal = document.getElementById('payProgressTotal');
    const newCollected = scaleNum(originals.payCollected, mult);
    const newBilled = scaleNum(originals.payBilled, mult);
    const pct = newBilled > 0 ? ((newCollected / newBilled) * 100).toFixed(1) : 0;
    if (payFill) payFill.style.width = pct + '%';
    if (payPct) payPct.textContent = pct + '% collected';
    if (payTotal) payTotal.textContent = 'of $' + newBilled.toLocaleString('en-US') + ' billed';

    // Aging
    const agingVals = document.querySelectorAll('.pay-aging-val');
    originals.aging.forEach(function(orig, i) {
      if (agingVals[i]) agingVals[i].textContent = '$' + scaleNum(orig, mult).toLocaleString('en-US');
    });

    // Outstanding badge (use new ID)
    const outBadge = document.getElementById('outstandingBadge');
    if (outBadge) {
      const outAmt = scaleNum(originals.payOutstanding, mult);
      outBadge.innerHTML = '$' + outAmt.toLocaleString('en-US') + ' Outstanding →';
    }

    // Resolution status
    const clearedCount = document.querySelector('#clearedTile .task-status-count');
    const reviewCount = document.querySelector('.task-status-tile.pending .task-status-count');
    if (clearedCount) clearedCount.textContent = scaleNum(originals.cleared, mult);
    if (reviewCount) reviewCount.textContent = scaleNum(originals.toReview, mult);

    // Equipment cleared
    const eqClearedCount = document.querySelector('#eqClearedTile .task-status-count');
    if (eqClearedCount) eqClearedCount.textContent = scaleNum(18, mult);

    // ── KPI STRIP: Recovery & Billings (post-recovery) ──
    // Recovered count (use data-metric selector)
    const recoveredEl = document.querySelector('[data-metric="recovered"]');
    if (recoveredEl) {
      const newRecovered = scaleNum(originals.recovered, mult);
      recoveredEl.textContent = newRecovered;
    }

    // Recovery Rate
    const rateEl = document.getElementById('recoveryRateVal');
    if (rateEl) {
      const accepted = 1308; // stays constant
      const newRecovered2 = scaleNum(originals.recovered, mult);
      const newRate = accepted > 0 ? ((newRecovered2 / accepted) * 100).toFixed(2) : 0;
      rateEl.textContent = newRate + '%';
    }

    // Gross Billed (use new ID)
    const billingBig = document.getElementById('billingBig');
    if (billingBig) {
      const newGross = scaleNum(originals.grossBilled, mult);
      billingBig.textContent = '$' + newGross.toLocaleString('en-US');
      billingBig.dataset.rawValue = newGross;
      // Re-run abbreviation if needed
      billingBig.textContent = formatBillingValue(newGross);
    }

    // Net & Denied (use new ID)
    const billingDetail = document.getElementById('billingDetail');
    if (billingDetail) {
      const netSpans = billingDetail.querySelectorAll('[style*="font-variant-numeric"]');
      if (netSpans[0]) netSpans[0].textContent = '$' + scaleNum(originals.netBilled, mult).toLocaleString('en-US');
      if (netSpans[1]) netSpans[1].textContent = '$' + scaleNum(originals.denied, mult).toLocaleString('en-US');
    }

    // Avg / Repo — invol only (use data-metric selector)
    const avgRepoEl = document.querySelector('[data-metric="avgRepo"]');
    if (avgRepoEl) {
      if (!avgRepoEl.dataset.origAvg) avgRepoEl.dataset.origAvg = '472';
      const newInvolRepos = scaleNum(originals.involRepos, mult);
      const involBilled = scaleNum(originals.grossBilled * 0.82, mult);
      const newAvg = newInvolRepos > 0 ? Math.round(involBilled / newInvolRepos) : 0;
      avgRepoEl.textContent = '$' + newAvg.toLocaleString('en-US');
    }

    // Repos count label
    const repoLabel = document.getElementById('repoCountLabel');
    if (repoLabel) repoLabel.textContent = scaleNum(originals.involRepos, mult) + ' repos';

    // Invoice count
    const invLabel = document.getElementById('invoiceCountLabel');
    if (invLabel) invLabel.textContent = '· ' + scaleNum(originals.invoiceCount, mult) + ' Invoices';

    // Lifetime Avg — weighted blend of selected locations
    const lifetimeEl = document.getElementById('lifetimeAvg');
    if (lifetimeEl) {
      if (locationFilterState.selectedLocs.length === 0) {
        lifetimeEl.textContent = '$' + originals.lifetimeAvg;
      } else {
        let weightedSum = 0, totalWeight = 0;
        locationFilterState.selectedLocs.forEach(function(loc) {
          const w = locWeights[loc.value] || 0.05;
          const avg = locLifetimeAvg[loc.value] || originals.lifetimeAvg;
          weightedSum += avg * w;
          totalWeight += w;
        });
        const blendedAvg = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : originals.lifetimeAvg;
        lifetimeEl.textContent = '$' + blendedAvg;
      }
    }
  }

  // Initialize location filter
  const locFilter = createChipFilter({
    barEl: document.getElementById('locFilterBar'),
    allBtnId: 'locAllBtn',
    addBtnId: 'locAddBtn',
    dropdownId: 'locDropdown',
    searchId: 'locSearchInput',
    listId: 'locList',
    applyId: 'locApplyBtn',
    clearId: 'locClearBtn',
    chipsScrollId: 'locChipsScroll',
    onChange: function(selected) {
      locationFilterState.selectedLocs = selected;
      applyLocationFilter();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: KPI STRIP STICKY SHADOW
  // ───────────────────────────────────────────────────────────────────────────

  (function() {
    const strip = document.querySelector('.kpi-strip');
    if (!strip || window.innerWidth < 1024) return;
    const offset = strip.offsetTop;

    function checkScroll() {
      if (window.scrollY > offset - 92) {
        strip.classList.add('scrolled');
      } else {
        strip.classList.remove('scrolled');
      }
    }

    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
  })();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 6: TAB SYSTEM
  // ───────────────────────────────────────────────────────────────────────────

  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      // Trigger render for tabs that need it
      if (btn.dataset.tab === 'lc' && typeof lc_render === 'function') lc_render();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: SEARCH DROPDOWN
  // ───────────────────────────────────────────────────────────────────────────

  const searchTypeBtn = document.getElementById('searchTypeBtn');
  const searchDropdown = document.getElementById('searchDropdown');
  const searchTypeLabel = document.getElementById('searchTypeLabel');
  const searchInput = document.getElementById('searchInput');

  if (searchTypeBtn) {
    searchTypeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      searchDropdown.classList.toggle('open');
    });

    document.querySelectorAll('.search-option').forEach(function(opt) {
      opt.addEventListener('click', function(e) {
        e.stopPropagation();
        searchTypeLabel.textContent = this.dataset.type;
        searchInput.placeholder = this.dataset.ph;
        searchInput.focus();
        searchDropdown.classList.remove('open');
      });
    });

    document.addEventListener('click', function() { searchDropdown.classList.remove('open'); });
  }

  // Wire dashboard global search → navigate to correct page + apply filter
  // Note: window.showPage is exposed by the sidebar IIFE; safe to call on user interaction
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var type = searchTypeLabel ? searchTypeLabel.textContent.trim() : 'Case #';
      var val = this.value;
      if (!val) return; // don't navigate on empty
      if (type === 'Invoice #') {
        if (window.showPage) window.showPage('invoices');
        var inv = document.getElementById('invoicesSearch');
        if (inv) { inv.value = val; filterTableRows('invoicesTbody', val); }
      } else {
        // Case # or VIN both search the cases table
        if (window.showPage) window.showPage('cases');
        var cs = document.getElementById('casesSearch');
        if (cs) { cs.value = val; filterTableRows('casesTbody', val); }
      }
    });
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        this.value = '';
        filterTableRows('casesTbody', '');
        filterTableRows('invoicesTbody', '');
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 8: MONTH SELECTOR
  // ───────────────────────────────────────────────────────────────────────────

  const monthSelect = document.getElementById('monthSelect');
  const monthPrevBtn = document.getElementById('monthPrev');
  const monthNextBtn = document.getElementById('monthNext');
  if (monthPrevBtn) monthPrevBtn.addEventListener('click', function() {
    if (monthSelect && monthSelect.selectedIndex > 0) {
      monthSelect.selectedIndex--;
      monthSelect.dispatchEvent(new Event('change'));
    }
  });
  if (monthNextBtn) monthNextBtn.addEventListener('click', function() {
    if (monthSelect && monthSelect.selectedIndex < monthSelect.options.length - 1) {
      monthSelect.selectedIndex++;
      monthSelect.dispatchEvent(new Event('change'));
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 9: EQUIPMENT ESTIMATES
  // ───────────────────────────────────────────────────────────────────────────

  const EQ_AVG_CASE = 135;
  const EQ_BILL_RATE_LOW = 0.45;
  const EQ_BILL_RATE_HIGH = 0.65;

  function updateEqEstimates() {
    const rows = document.querySelectorAll('.eq-cat-count');
    let total = 0;
    rows.forEach(function(r) { total += parseInt(r.textContent) || 0; });

    const badgeEl = document.getElementById('eqBadgeCount');
    if (badgeEl) badgeEl.textContent = total;

    const billLow = Math.round(total * EQ_BILL_RATE_LOW);
    const billHigh = Math.round(total * EQ_BILL_RATE_HIGH);
    const revLow = billLow * EQ_AVG_CASE;
    const revHigh = billHigh * EQ_AVG_CASE;

    const ctx = document.getElementById('eqRangeContext');
    if (ctx) ctx.textContent = '~' + billLow + '–' + billHigh + ' billable of ' + total + ' · $' + EQ_AVG_CASE + ' avg/case';

    const range = document.getElementById('eqRange');
    if (range) range.textContent = '$' + revLow.toLocaleString('en-US') + ' – $' + revHigh.toLocaleString('en-US');
  }

  updateEqEstimates();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 10: EQUIPMENT CHART (STACKED BARS WITH SQRT SCALE)
  // ───────────────────────────────────────────────────────────────────────────

  (function() {
    const cols = document.querySelectorAll('#eqChart .eq-chart-col');
    const maxHeight = 60; // px

    // Find max potential for sqrt scaling
    let maxP = 0;
    cols.forEach(function(col) {
      const p = parseInt(col.dataset.potential) || 0;
      if (p > maxP) maxP = p;
    });

    const sqrtMax = Math.sqrt(maxP);

    cols.forEach(function(col) {
      const p = parseInt(col.dataset.potential) || 0;
      const b = parseInt(col.dataset.billed) || 0;
      const isCurrent = col.dataset.current === 'true';
      const bar = col.querySelector('.eq-chart-bar');
      const fill = col.querySelector('.eq-chart-bar-fill');
      const topLabel = col.querySelector('.eq-chart-bar-label');
      const fillLabel = col.querySelector('.eq-chart-bar-fill-label');
      const amtEl = col.querySelector('.eq-chart-amt');

      // Sqrt-scaled bar height (min 8px)
      const barH = Math.max(8, Math.round((Math.sqrt(p) / sqrtMax) * maxHeight));
      bar.style.height = barH + 'px';

      // Fill height as % of potential
      const fillPct = p > 0 ? Math.round((b / p) * 100) : 0;
      if (isCurrent) {
        fill.style.height = '0%';
      } else {
        fill.style.height = fillPct + '%';
      }

      // Labels - both above the bar, always visible
      topLabel.textContent = fmtChartNum(p);
      if (!isCurrent && b > 0) {
        fillLabel.textContent = fmtChartNum(b);
      } else if (isCurrent) {
        fillLabel.textContent = '—';
        fillLabel.style.color = '#f59e0b';
      } else {
        fillLabel.textContent = '0';
        fillLabel.style.opacity = '0.4';
      }

      // Dollar amount
      if (amtEl && amtEl.textContent !== 'TBD') {
        const rawAmt = parseFloat(col.dataset.amt.replace(/[$,]/g, '')) || 0;
        amtEl.textContent = fmtChartDollar(rawAmt);
      }
    });
  })();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 11: PAYMENTS COLLECTION CHART
  // ───────────────────────────────────────────────────────────────────────────

  (function() {
    const cols = document.querySelectorAll('#payChart .pay-chart-col');
    const maxHeight = 60;
    let maxBilled = 0;

    cols.forEach(function(col) {
      const b = parseInt(col.dataset.billed) || 0;
      if (b > maxBilled) maxBilled = b;
    });

    const sqrtMax = Math.sqrt(maxBilled);

    cols.forEach(function(col) {
      const billed = parseInt(col.dataset.billed) || 0;
      const collected = parseInt(col.dataset.collected) || 0;
      const isCurrent = col.classList.contains('pay-chart-current');
      const bar = col.querySelector('.pay-chart-bar');
      const fill = col.querySelector('.pay-chart-bar-fill');
      const topLabel = col.querySelector('.pay-chart-bar-label');
      const amtEl = col.querySelector('.pay-chart-amt');

      const barH = Math.max(8, Math.round((Math.sqrt(billed) / sqrtMax) * maxHeight));
      bar.style.height = barH + 'px';

      const fillPct = billed > 0 ? Math.round((collected / billed) * 100) : 0;
      fill.style.height = fillPct + '%';

      topLabel.textContent = col.dataset.rate;
      if (amtEl) {
        amtEl.textContent = fmtChartDollar(collected);
      }
    });
  })();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 12: PAYMENT CHART POPOVER
  // ───────────────────────────────────────────────────────────────────────────

  (function() {
    const pop = document.getElementById('payPop');
    const chart = document.getElementById('payChart');
    if (!pop || !chart) return;
    const cols = chart.querySelectorAll('.pay-chart-col');
    const chartWrap = chart.parentElement;
    let activeCol = null;

    function showPopContent(col) {
      const d = col.dataset;

      document.getElementById('payPopMonth').textContent = d.month;
      document.getElementById('payPopRate').textContent = d.rate + ' collected';
      document.getElementById('payPopBilled').textContent = fmtChartDollar(parseInt(d.billed));
      document.getElementById('payPopCollected').textContent = fmtChartDollar(parseInt(d.collected));
      document.getElementById('payPopOutstanding').textContent = fmtChartDollar(parseInt(d.outstanding));

      // Build client rows
      let html = '';
      if (d.clients) {
        d.clients.split('|').forEach(function(entry) {
          const parts = entry.split(':');
          html += '<div class="pay-pop-client-row"><span class="pay-pop-client-name">' + parts[0] + '</span><span class="pay-pop-client-amt">' + parts[1] + '</span></div>';
        });
      }
      document.getElementById('payPopClients').innerHTML = html;
    }

    function positionPop(col) {
      const chartRect = chartWrap.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      const popW = 220;
      let leftPos = colRect.left - chartRect.left + (colRect.width / 2) - (popW / 2);
      leftPos = Math.max(0, Math.min(leftPos, chartRect.width - popW));
      pop.style.left = leftPos + 'px';
      pop.style.bottom = (chartRect.height - chart.offsetTop + 8) + 'px';
      pop.style.top = 'auto';
    }

    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    let hideTimer = null;

    function showPop(col) {
      clearTimeout(hideTimer);
      activeCol = col;
      showPopContent(col);
      positionPop(col);
      pop.classList.add('visible');
      cols.forEach(function(c) { c.classList.remove('active'); });
      col.classList.add('active');
    }

    function hidePop() {
      hideTimer = setTimeout(function() {
        pop.classList.remove('visible');
        cols.forEach(function(c) { c.classList.remove('active'); });
      }, 150);
    }

    cols.forEach(function(col) {
      if (isTouch) {
        col.addEventListener('click', function(e) {
          e.preventDefault();
          if (pop.classList.contains('visible') && activeCol === col) { hidePop(); } else { showPop(col); }
        });
      } else {
        col.addEventListener('mouseenter', function() { showPop(col); });
        col.addEventListener('mouseleave', hidePop);
      }
    });

    pop.addEventListener('mouseenter', function() { clearTimeout(hideTimer); });
    pop.addEventListener('mouseleave', hidePop);

    document.addEventListener('click', function(e) {
      if (!pop.contains(e.target) && !chart.contains(e.target)) hidePop();
    });
  })();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 13: EQUIPMENT DATE FILTER (CHIPS + CALENDAR)
  // ───────────────────────────────────────────────────────────────────────────

  (function() {
    const wrap = document.getElementById('eqDateWrap');
    if (!wrap) return;
    const chips = wrap.querySelectorAll('.eq-date-chip:not(.eq-date-cal-btn)');
    const calBtn = document.getElementById('eqCalBtn');
    const calDrop = document.getElementById('eqCalDrop');
    const calDays = document.getElementById('eqCalDays');
    const clearBtn = document.getElementById('eqDateClear');
    const badgeCount = document.getElementById('eqBadgeCount');
    const badgeOf = document.getElementById('eqBadgeOf');
    const driveTotal = document.getElementById('eqDriveTotal');
    const vehicleTotal = document.getElementById('eqVehicleTotal');
    const catRows = document.querySelectorAll('.eq-cat-row[data-total]');
    const TOTAL_UNITS = 78;

    // MOCK: hardcoded for demo — replace with new Date().getDate() for production
    const year = 2026, month = 2;
    let todayDate = 10;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Simulate daily recovery data for March 2026 (days 1–10)
    const dailyData = {};
    catRows.forEach(function(row, idx) {
      const total = parseInt(row.dataset.total) || 0;
      const days = {};
      let remaining = total;

      for (let d = 1; d <= 10; d++) {
        if (d === 10) {
          days[d] = remaining;
        } else {
          const avg = remaining / (10 - d + 1);
          const val = Math.max(0, Math.min(remaining, Math.round(avg + (rng() - 0.5) * avg)));
          days[d] = val;
          remaining -= val;
        }
      }
      dailyData[idx] = days;
    });

    function getFilteredCounts(startDay, endDay) {
      const counts = [];
      catRows.forEach(function(row, idx) {
        let sum = 0;
        for (let d = startDay; d <= endDay; d++) {
          sum += (dailyData[idx][d] || 0);
        }
        counts.push(sum);
      });
      return counts;
    }

    function applyFilter(startDay, endDay) {
      const counts = getFilteredCounts(startDay, endDay);
      let grandTotal = 0;
      let driveSum = 0, vehicleSum = 0;
      const driveRows = driveTotal.closest('.eq-cat-tile').querySelectorAll('.eq-cat-row');
      const vehicleRows = vehicleTotal.closest('.eq-cat-tile').querySelectorAll('.eq-cat-row');

      catRows.forEach(function(row, idx) {
        const countEl = row.querySelector('.eq-cat-count');
        countEl.textContent = counts[idx];
        grandTotal += counts[idx];

        let isDrive = false;
        driveRows.forEach(function(dr) { if (dr === row) isDrive = true; });
        if (isDrive) driveSum += counts[idx];
        else vehicleSum += counts[idx];
      });

      badgeCount.textContent = grandTotal;
      badgeOf.style.display = 'inline';
      badgeOf.textContent = ' of ' + TOTAL_UNITS;
      driveTotal.textContent = driveSum + ' →';
      vehicleTotal.textContent = vehicleSum + ' →';
    }

    function resetCounts() {
      catRows.forEach(function(row) {
        const total = parseInt(row.dataset.total) || 0;
        row.querySelector('.eq-cat-count').textContent = total;
      });
      badgeCount.textContent = TOTAL_UNITS;
      badgeOf.style.display = 'none';
      driveTotal.textContent = '61 →';
      vehicleTotal.textContent = '17 →';
    }

    function buildCal() {
      calDays.innerHTML = '';
      for (let e = 0; e < firstDay; e++) {
        const empty = document.createElement('span');
        empty.className = 'eq-cal-day empty';
        calDays.appendChild(empty);
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const btn = document.createElement('button');
        btn.className = 'eq-cal-day';
        btn.textContent = d;
        btn.dataset.day = d;
        if (d === todayDate) btn.classList.add('today');
        if (d > todayDate) {
          btn.classList.add('future');
        } else {
          btn.addEventListener('click', function() {
            const day = parseInt(this.dataset.day);
            selectDay(day);
            calDrop.classList.remove('open');
            calBtn.setAttribute('aria-expanded', 'false');
          });
        }
        calDays.appendChild(btn);
      }
    }

    function clearAll() {
      chips.forEach(function(c) { c.classList.remove('active'); });
      calBtn.classList.remove('active');
      clearBtn.style.display = 'none';
      calDays.querySelectorAll('.eq-cal-day').forEach(function(d) {
        d.classList.remove('selected', 'in-range');
      });
      resetCounts();
    }

    function selectDay(day) {
      clearAll();
      calBtn.classList.add('active');
      clearBtn.style.display = 'flex';
      calDays.querySelectorAll('.eq-cal-day').forEach(function(d) {
        if (parseInt(d.dataset.day) === day) d.classList.add('selected');
      });
      applyFilter(day, day);
    }

    function highlightRange(startDay, endDay) {
      calDays.querySelectorAll('.eq-cal-day').forEach(function(d) {
        const day = parseInt(d.dataset.day);
        if (isNaN(day)) return;
        d.classList.remove('selected', 'in-range');
        if (day >= startDay && day <= endDay) d.classList.add('in-range');
        if (day === endDay) { d.classList.remove('in-range'); d.classList.add('selected'); }
      });
      applyFilter(startDay, endDay);
    }

    chips.forEach(function(chip) {
      chip.addEventListener('click', function() {
        clearAll();
        chip.classList.add('active');
        clearBtn.style.display = 'flex';
        calDrop.classList.remove('open');
        calBtn.setAttribute('aria-expanded', 'false');

        const filter = chip.dataset.filter;
        if (filter === 'today') {
          highlightRange(todayDate, todayDate);
        } else if (filter === 'yesterday') {
          highlightRange(todayDate - 1, todayDate - 1);
        } else if (filter === '7days') {
          highlightRange(Math.max(1, todayDate - 6), todayDate);
        }
      });
    });

    calBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      calDrop.classList.toggle('open');
      calBtn.setAttribute('aria-expanded', calDrop.classList.contains('open'));
    });

    clearBtn.addEventListener('click', function() {
      clearAll();
      calDrop.classList.remove('open');
      calBtn.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('click', function(e) {
      if (!wrap.contains(e.target)) {
        calDrop.classList.remove('open');
        calBtn.setAttribute('aria-expanded', 'false');
      }
    });

    buildCal();
  })();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 14: CLEARED TILE POPOVER
  // ───────────────────────────────────────────────────────────────────────────

  (function() {
    const tile = document.getElementById('clearedTile');
    const pop = document.getElementById('clearedPop');
    const overlay = document.getElementById('clearedPopOverlay');
    if (!tile || !pop) return;

    createPopover({
      trigger: tile,
      popover: pop,
      overlay: overlay,
      isToggle: true
    });
  })();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 15: EQUIPMENT CLEARED TILE POPOVER
  // ───────────────────────────────────────────────────────────────────────────

  (function() {
    const tile = document.getElementById('eqClearedTile');
    const pop = document.getElementById('eqClearedPop');
    const overlay = document.getElementById('eqClearedPopOverlay');
    if (!tile || !pop) return;

    createPopover({
      trigger: tile,
      popover: pop,
      overlay: overlay,
      isToggle: true
    });
  })();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 16: EQUIPMENT CHART POPOVER
  // ───────────────────────────────────────────────────────────────────────────

  (function() {
    const pop = document.getElementById('eqPop');
    const overlay = document.getElementById('eqPopOverlay');
    const cols = document.querySelectorAll('#eqChart .eq-chart-col');
    const chart = document.getElementById('eqChart');
    if (!pop || !chart) return;
    let activeCol = null;

    function showPopContent(col) {
      const d = col.dataset;
      const isCurrent = d.current === 'true';

      document.getElementById('eqPopMonth').textContent = d.month;
      document.getElementById('eqPopPotential').textContent = fmtChartNum(d.potential);
      document.getElementById('eqPopBilled').textContent = isCurrent ? '—' : fmtChartNum(d.billed);
      document.getElementById('eqPopAmt').textContent = d.amt;
      document.getElementById('eqPopRate').textContent = d.rate;

      pop.classList.toggle('current-month', isCurrent);

      const pNum = parseInt(d.potential) || 1;
      const bNum = parseInt(d.billed) || 0;
      const barWrap = document.getElementById('eqPopBarWrap');
      const barFill = document.getElementById('eqPopBarFill');
      const fillPct = pNum > 0 ? Math.round((bNum / pNum) * 100) : 0;
      barFill.style.height = isCurrent ? '0%' : fillPct + '%';

      if (isCurrent) {
        barWrap.style.background = 'rgba(245,158,11,0.12)';
        barWrap.style.borderColor = 'rgba(245,158,11,0.35)';
        barFill.style.background = 'rgba(245,158,11,0.3)';
      } else {
        barWrap.style.background = '';
        barWrap.style.borderColor = '';
        barFill.style.background = '';
      }
    }

    function positionPop(col) {
      const chartRect = chart.parentElement.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      const popW = 200;
      let leftPos = colRect.left - chartRect.left + (colRect.width / 2) - (popW / 2);
      leftPos = Math.max(0, Math.min(leftPos, chartRect.width - popW));
      pop.style.left = leftPos + 'px';
      pop.style.bottom = (chartRect.height - chart.offsetTop + 8) + 'px';
      pop.style.top = 'auto';
    }

    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    let hideTimer = null;

    function showPop(col) {
      clearTimeout(hideTimer);
      activeCol = col;
      showPopContent(col);
      positionPop(col);
      pop.classList.add('visible');
      if (overlay && isTouch) overlay.classList.add('visible');
      cols.forEach(function(c) { c.classList.remove('active'); });
      col.classList.add('active');
    }

    function hidePop() {
      hideTimer = setTimeout(function() {
        pop.classList.remove('visible');
        if (overlay) overlay.classList.remove('visible');
        cols.forEach(function(c) { c.classList.remove('active'); });
      }, 150);
    }

    cols.forEach(function(col) {
      if (isTouch) {
        col.addEventListener('click', function(e) {
          e.preventDefault();
          if (pop.classList.contains('visible') && activeCol === col) { hidePop(); } else { showPop(col); }
        });
      } else {
        col.addEventListener('mouseenter', function() { showPop(col); });
        col.addEventListener('mouseleave', hidePop);
      }
    });

    pop.addEventListener('mouseenter', function() { clearTimeout(hideTimer); });
    pop.addEventListener('mouseleave', hidePop);
    if (overlay) overlay.addEventListener('click', hidePop);

    document.addEventListener('click', function(e) {
      if (!pop.contains(e.target) && !chart.contains(e.target)) hidePop();
    });
  })();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 17: SERVICE CATEGORY & CLIENT FILTER
  // ───────────────────────────────────────────────────────────────────────────

  const categoryColors = {
    "Recovery": "#f97316", "Keys": "#eab308", "Equipment": "#ef4444",
    "Storage": "#14b8a6", "Redemption / Personal Property": "#a855f7",
    "Fuel / Bonus": "#f9a8d4", "Administration & Misc": "#3b82f6",
    "Transport": "#7dd3fc", "Mileage / Close": "#22c55e",
    "Pics / CR / Field": "#d1d5db", "Tax": "#9ca3af", "Advanced Funds": "#a16207"
  };

  const categoryIcons = {
    "Recovery": "auto_towing", "Keys": "vpn_key", "Equipment": "build",
    "Storage": "warehouse", "Redemption / Personal Property": "inventory",
    "Fuel / Bonus": "local_gas_station", "Administration & Misc": "admin_panel_settings",
    "Transport": "local_shipping", "Mileage / Close": "speed",
    "Pics / CR / Field": "camera_alt", "Tax": "receipt", "Advanced Funds": "account_balance"
  };

  const allData = {
    all: [
      { cat: "Recovery", billables: 72106, payments: 70784, deltaBill: -3898, deltaPay: -1798, cases: 175 },
      { cat: "Keys", billables: 29732, payments: 24234, deltaBill: -3651, deltaPay: -4921, cases: 148 },
      { cat: "Equipment", billables: 9699, payments: 5527, deltaBill: 401, deltaPay: -2814, cases: 62 },
      { cat: "Storage", billables: 8585, payments: 7570, deltaBill: -2781, deltaPay: -2788, cases: 44 },
      { cat: "Redemption / Personal Property", billables: 5584, payments: 4257, deltaBill: 1149, deltaPay: 257, cases: 31 },
      { cat: "Fuel / Bonus", billables: 3988, payments: 3791, deltaBill: 645, deltaPay: 1264, cases: 58 },
      { cat: "Administration & Misc", billables: 2661, payments: 3091, deltaBill: 1187, deltaPay: 1876, cases: 29 },
      { cat: "Transport", billables: 1603, payments: 2598, deltaBill: -1135, deltaPay: 408, cases: 12 },
      { cat: "Mileage / Close", billables: 1171, payments: 669, deltaBill: -269, deltaPay: -979, cases: 38 },
      { cat: "Pics / CR / Field", billables: 200, payments: 400, deltaBill: -1206, deltaPay: -821, cases: 14 },
      { cat: "Tax", billables: 45, payments: 0, deltaBill: -149, deltaPay: -289, cases: 6 },
      { cat: "Advanced Funds", billables: 0, payments: 1420, deltaBill: -886, deltaPay: 1099, cases: 9 }
    ],
    "Loss Prevention Services MS, LP": [
      { cat: "Recovery", billables: 25400, payments: 25400, deltaBill: 1200, deltaPay: 1200, cases: 62 },
      { cat: "Keys", billables: 9800, payments: 9800, deltaBill: -400, deltaPay: -400, cases: 49 },
      { cat: "Fuel / Bonus", billables: 1200, payments: 1200, deltaBill: 300, deltaPay: 300, cases: 20 },
      { cat: "Storage", billables: 800, payments: 800, deltaBill: -100, deltaPay: -100, cases: 10 },
      { cat: "Mileage / Close", billables: 427, payments: 427, deltaBill: -50, deltaPay: -50, cases: 12 }
    ],
    "Ally Servicing LLC": [
      { cat: "Recovery", billables: 10200, payments: 10200, deltaBill: -1100, deltaPay: -1100, cases: 68 },
      { cat: "Keys", billables: 3800, payments: 3200, deltaBill: -500, deltaPay: -400, cases: 42 },
      { cat: "Storage", billables: 1111, payments: 900, deltaBill: -200, deltaPay: -150, cases: 18 }
    ],
    "GM Financial": [
      { cat: "Recovery", billables: 6500, payments: 3000, deltaBill: 800, deltaPay: -200, cases: 27 },
      { cat: "Keys", billables: 2700, payments: 500, deltaBill: 400, deltaPay: -100, cases: 22 },
      { cat: "Equipment", billables: 1100, payments: 0, deltaBill: 200, deltaPay: 0, cases: 11 },
      { cat: "Mileage / Close", billables: 425, payments: 0, deltaBill: 50, deltaPay: 0, cases: 9 }
    ]
  };

  const clients = ["Loss Prevention Services MS, LP", "Ally Servicing LLC", "GM Financial"];

  // Service Category Client Filter
  let svcClientFilter = null;

  (function() {
    const filterWrap = document.getElementById('svcClientFilter');
    const listEl = document.getElementById('svcClientList');
    if (!filterWrap || !listEl) return;

    // Build client options
    clients.forEach(function(c) {
      const label = document.createElement('label');
      label.className = 'loc-option';
      label.innerHTML = '<input type="checkbox" value="' + c + '" /> <span>' + c + '</span>';
      listEl.appendChild(label);
    });

    svcClientFilter = createChipFilter({
      barEl: filterWrap,
      allBtnId: 'svcAllClientsBtn',
      addBtnId: 'svcClientAddBtn',
      dropdownId: 'svcClientDropdown',
      searchId: 'svcClientSearch',
      listId: 'svcClientList',
      applyId: 'svcClientApply',
      clearId: 'svcClientClear',
      chipsScrollId: 'svcClientChips',
      onChange: svc_render
    });
  })();

  function svc_fmt(n) { return '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

  function svc_deltaHtml(raw, prior) {
    if (raw === 0) return '<span class="delta-primary delta-neutral">—</span><span class="delta-sub">vs. prior mo.</span>';
    const dir = raw > 0 ? '↑' : '↓';
    const cls = raw > 0 ? 'delta-up' : 'delta-down';
    const sign = raw > 0 ? '+' : '-';
    const pct = prior && prior !== 0 ? Math.round((Math.abs(raw) / Math.abs(prior)) * 100) : null;
    const pctStr = pct !== null ? ' (' + (raw > 0 ? '+' : '-') + pct + '%)' : '';
    return '<span class="delta-primary ' + cls + '">' + dir + ' ' + sign + svc_fmt(raw) + pctStr + '</span><span class="delta-sub">vs. prior mo.</span>';
  }

  function svc_getPctCls(p) { return p >= 85 ? 'pct-positive' : (p >= 50 ? 'pct-mid' : 'pct-low'); }

  function svc_render() {
    const selected = svcClientFilter.getSelected ? svcClientFilter.getSelected() : [];
    const selectedNames = selected.map(item => item.value);
    let rows, label;

    if (selectedNames.length === 0) {
      rows = allData['all'];
      label = 'All Clients (MTD)';
    } else if (selectedNames.length === 1) {
      rows = allData[selectedNames[0]] || allData['all'];
      label = selectedNames[0] + ' (MTD)';
    } else {
      // Aggregate multiple clients
      const merged = {};
      selectedNames.forEach(function(client) {
        const cData = allData[client] || [];
        cData.forEach(function(r) {
          if (!merged[r.cat]) {
            merged[r.cat] = { cat: r.cat, billables: 0, payments: 0, deltaBill: 0, deltaPay: 0, cases: 0 };
          }
          merged[r.cat].billables += r.billables;
          merged[r.cat].payments += r.payments;
          merged[r.cat].deltaBill += r.deltaBill;
          merged[r.cat].deltaPay += r.deltaPay;
          merged[r.cat].cases += r.cases;
        });
      });
      rows = Object.keys(merged).map(function(k) { return merged[k]; });
      rows.sort(function(a, b) { return b.billables - a.billables; });
      label = selectedNames.length + ' Clients (MTD)';
    }

    document.getElementById('tableLabel').textContent = 'All Categories — ' + label;

    const maxB = Math.max.apply(null, rows.map(function(r){ return r.billables; })) || 1;
    const totalBill = rows.reduce(function(s,r){ return s + r.billables; }, 0);
    const totalPay = rows.reduce(function(s,r){ return s + r.payments; }, 0);
    const portColl = totalBill > 0 ? Math.round((totalPay / totalBill) * 100) : 0;
    const portCls = svc_getPctCls(portColl);
    document.getElementById('portfolioCollected').innerHTML = '<span class="' + portCls + '">' + portColl + '%</span>';

    const tbody = document.getElementById('tableBody');
    let html = '';

    rows.forEach(function(r) {
      const collPct = r.billables > 0 ? Math.round((r.payments / r.billables) * 100) : (r.payments > 0 ? 999 : 0);
      const collDisp = collPct === 999 ? '—' : collPct + '%';
      const collCls = collPct === 999 ? 'pct-mid' : svc_getPctCls(collPct);
      const avgCase = r.cases > 0 ? Math.round(r.billables / r.cases) : 0;
      const barPct = Math.round((r.billables / maxB) * 100);
      const color = categoryColors[r.cat] || '#9ca3af';
      const priorB = r.billables - r.deltaBill;
      const priorP = r.payments - r.deltaPay;

      const icon = categoryIcons[r.cat] || 'category';

      html += '<tr>';
      html += '<td><div class="cat-name"><span class="mat-icon mat-icon-sm" style="color:' + color + '">' + icon + '</span>' + r.cat + '</div></td>';
      html += '<td class="bar-cell"><div class="bar-bg" style="width:' + barPct + '%"></div><div class="bar-content">' + (r.billables > 0 ? svc_fmt(r.billables) : '<span style="color:#9ca3af">$0</span>') + '</div></td>';
      html += '<td>' + (r.payments > 0 ? svc_fmt(r.payments) : '<span style="color:#9ca3af">$0</span>') + '</td>';
      html += '<td><span class="' + collCls + '">' + collDisp + '</span></td>';
      html += '<td class="avg-val">' + (avgCase > 0 ? svc_fmt(avgCase) : '—') + '</td>';
      html += '<td>' + svc_deltaHtml(r.deltaBill, priorB) + '</td>';
      html += '<td>' + svc_deltaHtml(r.deltaPay, priorP) + '</td>';
      html += '</tr>';
    });

    const totalDeltaBill = rows.reduce(function(s,r){ return s + r.deltaBill; }, 0);
    const totalDeltaPay = rows.reduce(function(s,r){ return s + r.deltaPay; }, 0);
    const totalCases = rows.reduce(function(s,r){ return s + r.cases; }, 0);
    const totalAvg = totalCases > 0 ? Math.round(totalBill / totalCases) : 0;
    const priorTotalB = totalBill - totalDeltaBill;
    const priorTotalP = totalPay - totalDeltaPay;

    html += '<tr class="footer-row">'
      + '<td><div class="cat-name">Total</div></td>'
      + '<td><strong>' + svc_fmt(totalBill) + '</strong></td>'
      + '<td><strong>' + svc_fmt(totalPay) + '</strong></td>'
      + '<td><span class="' + portCls + '"><strong>' + portColl + '%</strong></span></td>'
      + '<td class="avg-val">' + (totalAvg > 0 ? svc_fmt(totalAvg) : '—') + '</td>'
      + '<td>' + svc_deltaHtml(totalDeltaBill, priorTotalB) + '</td>'
      + '<td>' + svc_deltaHtml(totalDeltaPay, priorTotalP) + '</td>'
      + '</tr>';

    tbody.innerHTML = html;
  }

  svc_render();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 18: TOP CLIENTS TABLE
  // ───────────────────────────────────────────────────────────────────────────

  const allClients = [
    { name: "Loss Prevention Services MS, LP (Primary)", types: ["repossess","lpr"], assigned: 64, recovered: 62, avgInvoice: 412, billablesMTD: 26427, advFunds: 0, billedDelta: 6596, billedDeltaPct: 33, lifetimeOutstanding: 0, outstandingAge: 0, lastPayment: "Mar 7", collectedPct: 99, collectedDelta: 14, voluntaryAssigned: 8, voluntaryRecovered: 8, voluntaryBillables: 3200 },
    { name: "Primeritius-IBEAM", types: ["repossess"], assigned: 80, recovered: 49, avgInvoice: 288, billablesMTD: 23045, advFunds: 0, billedDelta: -2846, billedDeltaPct: -11, lifetimeOutstanding: 9797, outstandingAge: 62, lastPayment: "Jan 12", collectedPct: 57, collectedDelta: -8, voluntaryAssigned: 0, voluntaryRecovered: 0, voluntaryBillables: 0 },
    { name: "Ally Servicing LLC", types: ["voluntary","repossess"], assigned: 71, recovered: 68, avgInvoice: 213, billablesMTD: 15111, advFunds: 0, billedDelta: -5111, billedDeltaPct: -25, lifetimeOutstanding: 0, outstandingAge: 0, lastPayment: "Mar 5", collectedPct: 165, collectedDelta: 28, voluntaryAssigned: 18, voluntaryRecovered: 18, voluntaryBillables: 4100 },
    { name: "Secure Collateral Management LLC", types: ["repossess","skip"], assigned: 44, recovered: 38, avgInvoice: 372, billablesMTD: 14164, advFunds: 0, billedDelta: 6524, billedDeltaPct: 85, lifetimeOutstanding: 6287, outstandingAge: 38, lastPayment: "Feb 14", collectedPct: 56, collectedDelta: -5, voluntaryAssigned: 4, voluntaryRecovered: 4, voluntaryBillables: 1200 },
    { name: "GM Financial", types: ["repossess","lpr"], assigned: 38, recovered: 27, avgInvoice: 360, billablesMTD: 9725, advFunds: 0, billedDelta: 3594, billedDeltaPct: 59, lifetimeOutstanding: 4950, outstandingAge: 71, lastPayment: "Jan 28", collectedPct: 49, collectedDelta: -9, voluntaryAssigned: 0, voluntaryRecovered: 0, voluntaryBillables: 0 },
    { name: "United Recovery and Remarketing", types: ["voluntary","repossess"], assigned: 35, recovered: 31, avgInvoice: 308, billablesMTD: 9553, advFunds: 0, billedDelta: 770, billedDeltaPct: 9, lifetimeOutstanding: 2728, outstandingAge: 28, lastPayment: "Mar 2", collectedPct: 71, collectedDelta: -3, voluntaryAssigned: 10, voluntaryRecovered: 10, voluntaryBillables: 2800 },
    { name: "PAR North America", types: ["repossess"], assigned: 22, recovered: 22, avgInvoice: 314, billablesMTD: 6914, advFunds: 0, billedDelta: 111, billedDeltaPct: 2, lifetimeOutstanding: 0, outstandingAge: 0, lastPayment: "Mar 6", collectedPct: 114, collectedDelta: 9, voluntaryAssigned: 3, voluntaryRecovered: 3, voluntaryBillables: 800 },
    { name: "Loss Prevention Services MS, LP (Secondary)", types: ["impound","lpr"], assigned: 12, recovered: 9, avgInvoice: 466, billablesMTD: 4195, advFunds: 1645, billedDelta: 2316, billedDeltaPct: 123, lifetimeOutstanding: 4195, outstandingAge: 18, lastPayment: "Feb 1", collectedPct: 38, collectedDelta: -12, voluntaryAssigned: 0, voluntaryRecovered: 0, voluntaryBillables: 0 },
    { name: "LUXURY LEASING COMPANY", types: ["impound"], assigned: 3, recovered: 3, avgInvoice: 1371, billablesMTD: 4114, advFunds: 890, billedDelta: 3219, billedDeltaPct: 360, lifetimeOutstanding: 4114, outstandingAge: 18, lastPayment: "Never", collectedPct: 0, collectedDelta: -100, voluntaryAssigned: 0, voluntaryRecovered: 0, voluntaryBillables: 0 },
    { name: "PK Willis", types: ["skip","repossess"], assigned: 18, recovered: 11, avgInvoice: 331, billablesMTD: 3640, advFunds: 0, billedDelta: -1615, billedDeltaPct: -31, lifetimeOutstanding: 1635, outstandingAge: 45, lastPayment: "Feb 20", collectedPct: 55, collectedDelta: -6, voluntaryAssigned: 2, voluntaryRecovered: 2, voluntaryBillables: 600 },
    { name: "First Alliance Bank", types: ["voluntary"], assigned: 24, recovered: 24, avgInvoice: 180, billablesMTD: 4320, advFunds: 0, billedDelta: 420, billedDeltaPct: 11, lifetimeOutstanding: 0, outstandingAge: 0, lastPayment: "Mar 3", collectedPct: 100, collectedDelta: 0, voluntaryAssigned: 24, voluntaryRecovered: 24, voluntaryBillables: 4320 },
    { name: "Regional Auto Finance", types: ["repossess","lpr"], assigned: 15, recovered: 11, avgInvoice: 295, billablesMTD: 3245, advFunds: 0, billedDelta: -310, billedDeltaPct: -9, lifetimeOutstanding: 1800, outstandingAge: 55, lastPayment: "Feb 8", collectedPct: 62, collectedDelta: -4, voluntaryAssigned: 0, voluntaryRecovered: 0, voluntaryBillables: 0 },
    { name: "Suncoast Credit Union", types: ["voluntary","repossess"], assigned: 19, recovered: 17, avgInvoice: 220, billablesMTD: 2980, advFunds: 0, billedDelta: 180, billedDeltaPct: 6, lifetimeOutstanding: 420, outstandingAge: 22, lastPayment: "Mar 1", collectedPct: 88, collectedDelta: 3, voluntaryAssigned: 9, voluntaryRecovered: 9, voluntaryBillables: 1620 },
    { name: "Delta Recovery Group", types: ["skip","lpr"], assigned: 11, recovered: 7, avgInvoice: 410, billablesMTD: 2870, advFunds: 0, billedDelta: -430, billedDeltaPct: -13, lifetimeOutstanding: 3100, outstandingAge: 78, lastPayment: "Dec 14", collectedPct: 44, collectedDelta: -11, voluntaryAssigned: 0, voluntaryRecovered: 0, voluntaryBillables: 0 },
  ];

  const badgeConfig = {
    green:  { cls: 'badge-green',  label: 'Current',     tip: 'All invoices within 30 days. No action needed.' },
    yellow: { cls: 'badge-yellow', label: 'Late',         tip: 'One or more invoices 30–60 days unpaid. Follow up recommended.' },
    red:    { cls: 'badge-red',    label: 'Overdue',      tip: 'One or more invoices 60–90 days unpaid. Escalate to collections.' },
    black:  { cls: 'badge-black',  label: 'Collections',  tip: 'One or more invoices exceed 90 days unpaid. Immediate action required.' },
  };

  function tc_getBadge(age, outstanding) {
    if (outstanding === 0) return badgeConfig.green;
    if (age < 30) return badgeConfig.green;
    if (age < 60) return badgeConfig.yellow;
    if (age < 90) return badgeConfig.red;
    return badgeConfig.black;
  }

  function tc_getAgeDotCls(days) {
    if (days === 0 || days < 30) return 'age-current';
    if (days < 60) return 'age-late';
    if (days < 90) return 'age-overdue';
    return 'age-collections';
  }

  function tc_getPctCls(p) { return p >= 85 ? 'pct-positive' : (p >= 50 ? 'pct-mid' : 'pct-low'); }
  function tc_fmt(n) { return '$' + Math.max(0, n).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

  function tc_deltaHtml(rawDelta, pctDelta) {
    if (rawDelta === 0) return '<span class="delta-neutral">— vs. prior mo.</span>';
    const dir = rawDelta > 0 ? '↑' : '↓';
    const cls = rawDelta > 0 ? 'delta-up' : 'delta-down';
    const sign = rawDelta > 0 ? '+' : '';
    const abs = Math.abs(rawDelta).toLocaleString();
    return '<span class="' + cls + '">' + dir + ' ' + sign + '$' + abs + ' (' + sign + pctDelta + '%) vs. prior mo.</span>';
  }

  function tc_pctDeltaHtml(delta) {
    if (delta === 0) return '<span class="delta-neutral">— vs. prior mo.</span>';
    const dir = delta > 0 ? '↑' : '↓';
    const cls = delta > 0 ? 'delta-up' : 'delta-down';
    const sign = delta > 0 ? '+' : '';
    return '<span class="' + cls + '">' + dir + ' ' + sign + delta + '% vs. prior mo.</span>';
  }

  let advFundsOn = false;

  function tc_toggleAdvFunds() {
    advFundsOn = !advFundsOn;
    const pill = document.getElementById("tc_advFundsPill");
    pill.classList.toggle('active', advFundsOn);
    pill.textContent = advFundsOn ? '✓ Advanced Funds' : '+ Advanced Funds';
    document.getElementById("tc_advInfo").style.display = advFundsOn ? 'inline-flex' : 'none';
    tc_render();
  }

  const tcAdvFundsPill = document.getElementById("tc_advFundsPill");
  if (tcAdvFundsPill) tcAdvFundsPill.addEventListener('click', tc_toggleAdvFunds);

  const tcOrderTypePills = document.getElementById("tc_orderTypePills");
  if (tcOrderTypePills) tcOrderTypePills.addEventListener('click', function(e) {
    if (e.target.classList.contains('pill')) {
      e.target.classList.toggle('active');
      tc_render();
    }
  });

  function tc_getActiveTypes() {
    return Array.from(document.querySelectorAll('#tc_orderTypePills .pill.active')).map(function(p) { return p.dataset.type; });
  }

  function tc_render() {
    const activeTypes = tc_getActiveTypes();
    const allTypes = ['voluntary','repossess','lpr','skip','impound'];
    const isAll = allTypes.every(function(t) { return activeTypes.indexOf(t) > -1; });
    const noVoluntary = activeTypes.indexOf('voluntary') === -1;
    const highValue = ['repossess','lpr','skip'].every(function(t) { return activeTypes.indexOf(t) > -1; }) && noVoluntary && activeTypes.indexOf('impound') === -1;

    const typeLabel = isAll ? 'All Job Types' : (activeTypes.map(function(t) { return t.charAt(0).toUpperCase() + t.slice(1); }).join(', ') || 'None');
    const rankLabel = advFundsOn ? 'Total Capital Deployed' : 'Billed (MTD)';
    const extraTag = highValue ? ' ⚡ High-value job types' : '';
    document.getElementById("tc_tableLabel").textContent = 'Top 10 Clients by ' + rankLabel + ' — ' + typeLabel + extraTag;

    const clientsList = allClients.map(function(c) {
      const typeMatch = c.types.some(function(t) { return activeTypes.indexOf(t) > -1; });
      if (!typeMatch) return null;
      const assigned = c.assigned - (noVoluntary ? c.voluntaryAssigned : 0);
      const recovered = c.recovered - (noVoluntary ? c.voluntaryRecovered : 0);
      const billables = c.billablesMTD - (noVoluntary ? c.voluntaryBillables : 0) + (advFundsOn ? c.advFunds : 0);
      return Object.assign({}, c, {
        adjAssigned: Math.max(0, assigned),
        adjRecovered: Math.max(0, recovered),
        adjBillables: Math.max(0, billables)
      });
    }).filter(Boolean);

    clientsList.sort(function(a,b) { return b.adjBillables - a.adjBillables; });

    const top10 = clientsList.slice(0, 10);
    const others = clientsList.slice(10);
    const maxB = top10.length > 0 ? top10[0].adjBillables : 1;

    const rates = top10.map(function(c) { return c.adjAssigned > 0 ? (c.adjRecovered / c.adjAssigned) * 100 : 0; });
    const avgRate = rates.length > 0 ? rates.reduce(function(s,r) { return s+r; }, 0) / rates.length : 0;
    document.getElementById("tc_avgRateVal").textContent = Math.round(avgRate) + '%';

    const tbody = document.getElementById("tc_tableBody");
    let html = '';

    top10.forEach(function(c) {
      const rate = c.adjAssigned > 0 ? Math.round((c.adjRecovered / c.adjAssigned) * 100) : 0;
      const rateDiff = rate - avgRate;
      const rateCls = rateDiff >= 10 ? 'rate-high' : (rateDiff <= -10 ? 'rate-low' : 'rate-mid');
      const badge = tc_getBadge(c.outstandingAge, c.lifetimeOutstanding);
      const barPct = Math.round((c.adjBillables / maxB) * 100);
      const dotCls = tc_getAgeDotCls(c.outstandingAge);
      const pctCls = tc_getPctCls(c.collectedPct);

      const outDisplay = c.lifetimeOutstanding === 0
        ? '<span style="color:#10b981;font-weight:600;">$0</span>'
        : '<span class="age-dot ' + dotCls + '"></span>' + tc_fmt(c.lifetimeOutstanding) + '<span class="age-label">' + c.outstandingAge + 'd</span>';

      html += '<tr>';
      html += '<td class="client-name">' + c.name + '</td>';
      html += '<td>' + c.adjAssigned + ' / ' + c.adjRecovered + ' <span class="' + rateCls + '">(' + rate + '%)</span></td>';
      html += '<td>' + tc_fmt(c.avgInvoice) + '</td>';
      html += '<td class="bar-cell"><div class="bar-bg" style="width:' + barPct + '%"></div><div class="bar-content"><span class="billed-primary">' + tc_fmt(c.adjBillables) + '</span><span class="billed-delta">' + tc_deltaHtml(c.billedDelta, c.billedDeltaPct) + '</span></div></td>';
      html += '<td>' + outDisplay + '</td>';
      html += '<td class="last-payment">' + c.lastPayment + '</td>';
      html += '<td><span class="collected-primary ' + pctCls + '">' + c.collectedPct + '%</span><span class="collected-delta">' + tc_pctDeltaHtml(c.collectedDelta) + '</span></td>';
      html += '<td><div class="badge-wrap"><span class="badge ' + badge.cls + '">' + badge.label + '</span><div class="tooltip">' + badge.tip + '</div></div></td>';
      html += '</tr>';
    });

    const otherAsgn = others.reduce(function(s,c){return s+c.adjAssigned;},0);
    const otherRec = others.reduce(function(s,c){return s+c.adjRecovered;},0);
    const otherBill = others.reduce(function(s,c){return s+c.adjBillables;},0);
    const otherOut = others.reduce(function(s,c){return s+c.lifetimeOutstanding;},0);
    const otherRate = otherAsgn > 0 ? Math.round((otherRec/otherAsgn)*100) : 0;
    const otherAvg = otherRec > 0 ? Math.round(otherBill/otherRec) : 0;
    const otherColl = otherBill > 0 ? Math.round(others.reduce(function(s,c){return s+(c.collectedPct/100*c.adjBillables);},0)/otherBill*100) : 0;

    html += '<tr class="footer-row">'
      + '<td class="client-name">All Other Clients (' + others.length + ')</td>'
      + '<td>' + otherAsgn + ' / ' + otherRec + ' <span style="font-size:11px;font-weight:700;color:#f59e0b;">(' + otherRate + '%)</span></td>'
      + '<td>' + (otherAvg > 0 ? tc_fmt(otherAvg) : '—') + '</td>'
      + '<td>' + tc_fmt(otherBill) + '</td>'
      + '<td>' + (otherOut > 0 ? tc_fmt(otherOut) : '$0') + '</td>'
      + '<td>—</td>'
      + '<td>' + otherColl + '%</td>'
      + '<td><div class="badge-wrap"><span class="badge badge-yellow">Monitor</span><div class="tooltip">Combined status of remaining clients.</div></div></td>'
      + '</tr>';

    tbody.innerHTML = html;
  }

  tc_render();

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 19: THEME TOGGLE
  // ───────────────────────────────────────────────────────────────────────────

  function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    try { localStorage.setItem('ampd-theme', isDark ? 'light' : 'dark'); } catch(e) {}
    swapTableSourceLogos(!isDark);
  }

  // Apply saved theme on load
  (function() {
    let saved = 'light';
    try { saved = localStorage.getItem('ampd-theme') || 'light'; } catch(e) {}
    document.documentElement.setAttribute('data-theme', saved);
  })();

  // Attach theme toggle button listener
  const themeToggleBtn = document.getElementById('themeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // ── Card Minimize / Collapse ──
  function initCardCollapse(cardId, btnId) {
    const card = document.getElementById(cardId);
    const btn = document.getElementById(btnId);
    if (!card || !btn) return;

    const storageKey = 'ampd_collapsed_' + cardId;

    // Restore saved state
    if (localStorage.getItem(storageKey) === '1') {
      card.classList.add('collapsed');
      btn.title = 'Expand card';
      btn.setAttribute('aria-label', btn.getAttribute('aria-label').replace('Collapse', 'Expand'));
    }

    btn.addEventListener('click', function() {
      const isCollapsed = card.classList.toggle('collapsed');
      localStorage.setItem(storageKey, isCollapsed ? '1' : '0');
      btn.title = isCollapsed ? 'Expand card' : 'Collapse card';
      const label = btn.getAttribute('aria-label');
      btn.setAttribute('aria-label', isCollapsed ? label.replace('Collapse', 'Expand') : label.replace('Expand', 'Collapse'));
    });
  }

  // Initialize Payments Collected card collapse
  initCardCollapse('paymentsCard', 'paymentsMinBtn');
  initCardCollapse('pendingCard', 'pendingMinBtn');
  initCardCollapse('equipmentCard', 'equipmentMinBtn');
  initCardCollapse('tableCard', 'tableMinBtn');

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION: LIENHOLDER PERFORMANCE
  // ───────────────────────────────────────────────────────────────────────────
  (function() {
    // Alias map: canonical name → { client → [aliases with per-alias data] }
    window.LH_ALIASES = {
      'Santander': {
        'Santander': [
          { alias: 'Santander Consumer USA', assigned: 22, recovered: 19, billed: 8800, collected: 8400, balance: 800, advFunds: 0, ageDays: 10, lotDays: 4, types: ['repossess','voluntary','lpr','skip'] }
        ],
        'PAR': [
          { alias: 'SCUSA1', assigned: 14, recovered: 11, billed: 4800, collected: 4300, balance: 900, advFunds: 0, ageDays: 18, lotDays: 9, types: ['repossess','lpr','skip'] },
          { alias: 'SCUSA2', assigned: 12, recovered: 9, billed: 4100, collected: 3700, balance: 1000, advFunds: 0, ageDays: 22, lotDays: 12, types: ['repossess','voluntary'] },
          { alias: 'SCUSA3', assigned: 8, recovered: 5, billed: 2800, collected: 2400, balance: 700, advFunds: 600, ageDays: 14, lotDays: 12, types: ['repossess','impound'] },
          { alias: 'Santander', assigned: 4, recovered: 3, billed: 1400, collected: 1300, balance: 300, advFunds: 0, ageDays: 10, lotDays: 4, types: ['voluntary'] },
          { alias: 'Santander1', assigned: 2, recovered: 2, billed: 600, collected: 600, balance: 200, advFunds: 0, ageDays: 8, lotDays: 6, types: ['repossess'] },
          { alias: 'Saantander2', assigned: 2, recovered: 1, billed: 500, collected: 500, balance: 100, advFunds: 0, ageDays: 6, lotDays: 3, types: ['lpr'] }
        ],
        'PK Willis': [
          { alias: 'Santander Consumer USA', assigned: 18, recovered: 14, billed: 6100, collected: 5400, balance: 1400, advFunds: 0, ageDays: 12, lotDays: 4, types: ['repossess','voluntary','lpr'] }
        ],
        'SCM': [
          { alias: 'Santander', assigned: 28, recovered: 22, billed: 9800, collected: 8200, balance: 2800, advFunds: 0, ageDays: 35, lotDays: 12, types: ['repossess','skip','lpr','voluntary'] }
        ],
        'LPS': [
          { alias: 'Santander Consumer', assigned: 15, recovered: 11, billed: 4600, collected: 4100, balance: 800, advFunds: 0, ageDays: 8, lotDays: 3, types: ['repossess','voluntary'] }
        ]
      },
      'Capital One': {
        'Capital One': [
          { alias: 'Capital One Auto Finance', assigned: 30, recovered: 26, billed: 11400, collected: 10800, balance: 1200, advFunds: 0, ageDays: 14, lotDays: 3, types: ['repossess','voluntary','lpr'] }
        ],
        'PAR': [
          { alias: 'Capital One Auto', assigned: 36, recovered: 28, billed: 12400, collected: 11200, balance: 3200, advFunds: 0, ageDays: 22, lotDays: 6, types: ['repossess','lpr','skip','voluntary'] },
          { alias: 'Cap One Auto Finance', assigned: 20, recovered: 16, billed: 6500, collected: 6000, balance: 1600, advFunds: 1600, ageDays: 18, lotDays: 6, types: ['repossess','impound'] }
        ],
        'SCM': [
          { alias: 'Capital One Auto Finance', assigned: 32, recovered: 26, billed: 11200, collected: 9800, balance: 3100, advFunds: 0, ageDays: 42, lotDays: 15, types: ['repossess','voluntary','lpr','skip'] }
        ],
        'LPS': [
          { alias: 'CapOne', assigned: 12, recovered: 10, billed: 4200, collected: 3900, balance: 700, advFunds: 0, ageDays: 14, lotDays: 12, types: ['repossess','lpr'] },
          { alias: 'Capital One AF', assigned: 9, recovered: 7, billed: 3200, collected: 3000, balance: 500, advFunds: 700, ageDays: 10, lotDays: 6, types: ['voluntary','impound'] }
        ]
      },
      'Ally Financial': {
        'Ally Financial': [
          { alias: 'Ally Financial', assigned: 18, recovered: 15, billed: 6600, collected: 6200, balance: 800, advFunds: 0, ageDays: 12, lotDays: 5, types: ['repossess','voluntary','lpr'] }
        ],
        'PAR': [
          { alias: 'Ally Financial', assigned: 24, recovered: 18, billed: 8200, collected: 7300, balance: 1800, advFunds: 0, ageDays: 16, lotDays: 7, types: ['repossess','lpr','voluntary'] },
          { alias: 'Ally Auto', assigned: 14, recovered: 11, billed: 4200, collected: 3800, balance: 800, advFunds: 0, ageDays: 12, lotDays: 3, types: ['repossess','skip'] }
        ],
        'SCM': [
          { alias: 'Ally Financial Services', assigned: 22, recovered: 18, billed: 7800, collected: 6400, balance: 2200, advFunds: 0, ageDays: 48, lotDays: 15, types: ['repossess','voluntary','lpr','skip'] }
        ],
        'PK Willis': [
          { alias: 'Ally Auto Finance', assigned: 14, recovered: 11, billed: 4800, collected: 4500, balance: 600, advFunds: 0, ageDays: 10, lotDays: 6, types: ['repossess','voluntary'] }
        ],
        'LPS': [
          { alias: 'Ally', assigned: 19, recovered: 15, billed: 6200, collected: 5800, balance: 900, advFunds: 1300, ageDays: 15, lotDays: 7, types: ['repossess','lpr','impound'] }
        ]
      },
      'Westlake Financial': {
        'PAR': [
          { alias: 'Westlake Financial', assigned: 22, recovered: 16, billed: 7200, collected: 5800, balance: 2800, advFunds: 0, ageDays: 55, lotDays: 18, types: ['repossess','skip','lpr'] },
          { alias: 'Westlake Fin Svcs', assigned: 12, recovered: 8, billed: 3600, collected: 2800, balance: 1400, advFunds: 800, ageDays: 50, lotDays: 20, types: ['voluntary','impound'] }
        ],
        'SCM': [
          { alias: 'Westlake Financial Services', assigned: 20, recovered: 15, billed: 6400, collected: 5200, balance: 2100, advFunds: 0, ageDays: 38, lotDays: 13, types: ['repossess','voluntary','lpr'] }
        ],
        'LPS': [
          { alias: 'Westlake', assigned: 12, recovered: 9, billed: 3800, collected: 3400, balance: 800, advFunds: 0, ageDays: 20, lotDays: 8, types: ['repossess','voluntary'] }
        ]
      },
      'DriveTime': {
        'PAR': [
          { alias: 'DriveTime Automotive', assigned: 16, recovered: 12, billed: 5200, collected: 4700, balance: 1200, advFunds: 0, ageDays: 14, lotDays: 10, types: ['repossess','voluntary','lpr'] },
          { alias: 'DT Auto', assigned: 10, recovered: 8, billed: 3200, collected: 2900, balance: 600, advFunds: 0, ageDays: 10, lotDays: 5, types: ['repossess','skip'] }
        ],
        'SCM': [
          { alias: 'DriveTime', assigned: 18, recovered: 14, billed: 5600, collected: 5100, balance: 900, advFunds: 1200, ageDays: 22, lotDays: 11, types: ['repossess','voluntary','impound'] }
        ],
        'PK Willis': [
          { alias: 'DriveTime Auto Group', assigned: 10, recovered: 8, billed: 3200, collected: 2900, balance: 500, advFunds: 0, ageDays: 8, lotDays: 3, types: ['repossess','voluntary'] }
        ]
      },
      'Chase Auto': {
        'Chase Auto': [
          { alias: 'Chase Auto Finance', assigned: 16, recovered: 14, billed: 6200, collected: 5900, balance: 600, advFunds: 0, ageDays: 8, lotDays: 3, types: ['repossess','voluntary','lpr'] }
        ],
        'PAR': [
          { alias: 'Chase Auto Finance', assigned: 20, recovered: 17, billed: 7600, collected: 7100, balance: 1000, advFunds: 0, ageDays: 12, lotDays: 6, types: ['repossess','lpr','voluntary'] },
          { alias: 'JPM Chase Auto', assigned: 10, recovered: 8, billed: 3600, collected: 3300, balance: 600, advFunds: 0, ageDays: 10, lotDays: 4, types: ['repossess','skip'] }
        ],
        'SCM': [
          { alias: 'Chase Auto', assigned: 16, recovered: 13, billed: 5800, collected: 5200, balance: 1100, advFunds: 0, ageDays: 28, lotDays: 15, types: ['repossess','voluntary','lpr'] }
        ],
        'LPS': [
          { alias: 'Chase Auto Lending', assigned: 11, recovered: 9, billed: 3900, collected: 3600, balance: 500, advFunds: 0, ageDays: 10, lotDays: 5, types: ['repossess','voluntary'] }
        ]
      },
      'TD Auto Finance': {
        'PAR': [
          { alias: 'TD Auto', assigned: 14, recovered: 11, billed: 4800, collected: 4400, balance: 800, advFunds: 0, ageDays: 18, lotDays: 12, types: ['repossess','voluntary','lpr'] },
          { alias: 'TD Auto Finance', assigned: 8, recovered: 6, billed: 2600, collected: 2400, balance: 400, advFunds: 0, ageDays: 14, lotDays: 11, types: ['repossess'] }
        ],
        'SCM': [
          { alias: 'TD Auto Finance', assigned: 14, recovered: 11, billed: 4600, collected: 4100, balance: 800, advFunds: 0, ageDays: 25, lotDays: 9, types: ['repossess','voluntary','skip'] }
        ],
        'LPS': [
          { alias: 'TD Auto Fin', assigned: 8, recovered: 6, billed: 2400, collected: 2200, balance: 400, advFunds: 0, ageDays: 12, lotDays: 4, types: ['repossess','lpr'] }
        ]
      },
      'American Honda Finance': {
        'PAR': [
          { alias: 'Honda Financial', assigned: 12, recovered: 10, billed: 4400, collected: 4200, balance: 500, advFunds: 0, ageDays: 10, lotDays: 4, types: ['repossess','voluntary'] },
          { alias: 'American Honda Finance', assigned: 8, recovered: 6, billed: 2800, collected: 2600, balance: 300, advFunds: 0, ageDays: 8, lotDays: 3, types: ['repossess','lpr'] }
        ],
        'SCM': [
          { alias: 'Honda Finance Corp', assigned: 12, recovered: 10, billed: 4400, collected: 4100, balance: 600, advFunds: 900, ageDays: 16, lotDays: 6, types: ['repossess','voluntary','impound'] }
        ],
        'LPS': [
          { alias: 'AHFC', assigned: 7, recovered: 5, billed: 2200, collected: 2000, balance: 300, advFunds: 0, ageDays: 8, lotDays: 6, types: ['repossess','voluntary'] }
        ]
      },
      'Toyota Motor Credit': {
        'PAR': [
          { alias: 'Toyota Financial', assigned: 14, recovered: 11, billed: 5200, collected: 4900, balance: 600, advFunds: 0, ageDays: 14, lotDays: 7, types: ['repossess','voluntary','lpr'] },
          { alias: 'Toyota Motor Credit', assigned: 10, recovered: 8, billed: 3400, collected: 3200, balance: 400, advFunds: 0, ageDays: 12, lotDays: 5, types: ['repossess','skip'] }
        ],
        'SCM': [
          { alias: 'TMCC', assigned: 10, recovered: 8, billed: 3400, collected: 3200, balance: 400, advFunds: 0, ageDays: 20, lotDays: 10, types: ['repossess','voluntary'] },
          { alias: 'Toyota Motor Credit', assigned: 6, recovered: 5, billed: 2200, collected: 2000, balance: 300, advFunds: 500, ageDays: 16, lotDays: 12, types: ['lpr','impound'] }
        ],
        'PK Willis': [
          { alias: 'Toyota Financial Services', assigned: 9, recovered: 7, billed: 3100, collected: 2900, balance: 400, advFunds: 0, ageDays: 10, lotDays: 7, types: ['repossess','voluntary'] }
        ]
      },
      'Prestige Financial': {
        'PAR': [
          { alias: 'Prestige Financial', assigned: 10, recovered: 7, billed: 3000, collected: 2400, balance: 1400, advFunds: 0, ageDays: 62, lotDays: 21, types: ['repossess','lpr'] },
          { alias: 'Prestige Fin', assigned: 8, recovered: 5, billed: 2400, collected: 1800, balance: 1000, advFunds: 0, ageDays: 58, lotDays: 21, types: ['repossess','voluntary'] }
        ],
        'SCM': [
          { alias: 'Prestige Financial Services', assigned: 14, recovered: 10, billed: 4200, collected: 3100, balance: 1800, advFunds: 0, ageDays: 58, lotDays: 21, types: ['repossess','voluntary','skip'] }
        ],
        'LPS': [
          { alias: 'Prestige', assigned: 8, recovered: 5, billed: 2600, collected: 1800, balance: 1200, advFunds: 0, ageDays: 45, lotDays: 16, types: ['repossess','voluntary'] }
        ]
      }
    };

    // Build ALL_CLIENTS dynamically from data (excludes direct = client matches lienholder)
    const ALL_CLIENTS_SET = new Set();
    Object.keys(LH_ALIASES).forEach(function(lh) {
      Object.keys(LH_ALIASES[lh]).forEach(function(c) { ALL_CLIENTS_SET.add(c); });
    });
    const ALL_CLIENTS = Array.from(ALL_CLIENTS_SET).sort();
    const ALL_JOB_TYPES = ['voluntary', 'repossess', 'lpr', 'skip', 'impound'];
    let lhView = 'combined';
    const lhExpanded = {}; // track expanded rows by key
    var lhSortKey = 'billed'; // default sort column
    var lhSortDir = 'desc'; // 'asc' or 'desc'
    var lhAdvFundsOn = false; // advanced funds toggle

    // Helper: is this a direct relationship (client name === canonical lienholder name)
    function lh_isDirect(lhName, clientName) { return lhName === clientName; }

    // ── Lienholder Filter Dropdown ──
    var lhFilterSelected = []; // selected lienholder names
    var lhFilterOpen = false;
    (function() {
      var btn = document.getElementById('lhLienholderBtn');
      var drop = document.getElementById('lhLienholderDrop');
      var searchInput = document.getElementById('lhLienholderSearch');
      var listEl = document.getElementById('lhLienholderList');
      var applyBtn = document.getElementById('lhLienholderApply');
      var clearBtn = document.getElementById('lhLienholderClear');
      if (!btn || !drop || !listEl) return;

      // Move dropdown to body to avoid overflow clipping
      drop.style.position = 'fixed';
      drop.style.zIndex = '9999';
      document.body.appendChild(drop);

      // Populate lienholder list
      var lhNames = Object.keys(LH_ALIASES).sort();
      lhNames.forEach(function(name) {
        var item = document.createElement('label');
        item.className = 'lh-filter-item';
        item.innerHTML = '<input type="checkbox" value="' + name + '"> <span>' + name + '</span>';
        listEl.appendChild(item);
      });

      function positionDrop() {
        var rect = btn.getBoundingClientRect();
        var dw = 280;
        var left = rect.left;
        if (left + dw > window.innerWidth - 8) left = window.innerWidth - dw - 8;
        if (left < 8) left = 8;
        drop.style.top = (rect.bottom + 6) + 'px';
        drop.style.left = left + 'px';
      }

      function openDrop() {
        if (lhFilterOpen) return;
        lhFilterOpen = true;
        positionDrop();
        drop.style.display = 'block';
        if (searchInput) { searchInput.value = ''; filterItems(''); searchInput.focus(); }
      }

      function closeDrop() {
        if (!lhFilterOpen) return;
        lhFilterOpen = false;
        drop.style.display = 'none';
      }

      function filterItems(q) {
        listEl.querySelectorAll('.lh-filter-item').forEach(function(el) {
          var text = el.querySelector('span').textContent.toLowerCase();
          el.classList.toggle('hidden', q && text.indexOf(q) === -1);
        });
      }

      function updateBtn() {
        if (lhFilterSelected.length === 0) {
          btn.textContent = 'All Lienholders ';
          btn.innerHTML += '<span class="mat-icon" style="font-size:12px;vertical-align:middle;margin-left:2px;">arrow_drop_down</span>';
          btn.classList.remove('has-selection');
        } else {
          var label = lhFilterSelected.length === 1 ? lhFilterSelected[0] : lhFilterSelected.length + ' Selected';
          btn.textContent = label + ' ';
          btn.innerHTML += '<span class="mat-icon" style="font-size:12px;vertical-align:middle;margin-left:2px;">arrow_drop_down</span>';
          btn.classList.add('has-selection');
        }
      }

      btn.addEventListener('click', function(e) { e.stopPropagation(); if (lhFilterOpen) closeDrop(); else openDrop(); });
      if (searchInput) {
        searchInput.addEventListener('click', function(e) { e.stopPropagation(); });
        searchInput.addEventListener('input', function() { filterItems(this.value.toLowerCase()); });
      }
      if (applyBtn) applyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        lhFilterSelected = [];
        listEl.querySelectorAll('.lh-filter-item input:checked').forEach(function(cb) { lhFilterSelected.push(cb.value); });
        updateBtn();
        closeDrop();
        lh_render();
      });
      if (clearBtn) clearBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        listEl.querySelectorAll('.lh-filter-item input').forEach(function(cb) { cb.checked = false; });
        lhFilterSelected = [];
        updateBtn();
        closeDrop();
        lh_render();
      });
      drop.addEventListener('click', function(e) { e.stopPropagation(); });
      document.addEventListener('mousedown', function(e) {
        if (lhFilterOpen && !drop.contains(e.target) && !btn.contains(e.target)) closeDrop();
      });
      window.addEventListener('scroll', function() { if (lhFilterOpen) positionDrop(); }, true);
      window.addEventListener('resize', function() { if (lhFilterOpen) positionDrop(); });
    })();

    // ── Direct / Forwarder Type Toggle ──
    var lhTypeFilter = 'all'; // 'all', 'direct', 'forwarder'
    (function() {
      var pillWrap = document.getElementById('lh_typePills');
      if (!pillWrap) return;
      pillWrap.addEventListener('click', function(e) {
        var pill = e.target.closest('.pill');
        if (!pill || !pill.dataset.dtype) return;
        pillWrap.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        lhTypeFilter = pill.dataset.dtype;
        lh_render();
      });
    })();

    // ── Advanced Funds Toggle ──
    (function() {
      var pill = document.getElementById('lh_advFundsPill');
      var info = document.getElementById('lh_advInfo');
      if (!pill) return;
      pill.addEventListener('click', function() {
        lhAdvFundsOn = !lhAdvFundsOn;
        pill.classList.toggle('active', lhAdvFundsOn);
        pill.textContent = lhAdvFundsOn ? '\u2713 Adv Funds' : '+ Adv Funds';
        if (info) info.style.display = lhAdvFundsOn ? 'inline-flex' : 'none';
        lh_render();
      });
    })();

    function lh_getActiveJobTypes() {
      return Array.from(document.querySelectorAll('#lh_jobTypePills .pill.active')).map(function(p) { return p.dataset.type; });
    }

    function lh_fmt(n) { return '$' + n.toLocaleString('en-US'); }

    function lh_pctCls(pct) {
      if (pct >= 90) return 'lh-pct-good';
      if (pct >= 70) return 'lh-pct-mid';
      return 'lh-pct-bad';
    }

    function lh_statusHtml(ageDays) {
      if (ageDays <= 30) return '<span class="lh-status-current">Current</span>';
      if (ageDays <= 60) return '<span class="lh-status-slow">Slow</span>';
      return '<span class="lh-status-risk">At Risk</span>';
    }

    function lh_velocityHtml(days) {
      if (days <= 0) return '<span class="lh-velocity">—</span>';
      var cls, icon;
      if (days <= 7) { cls = 'lh-vel-fast'; icon = 'speed'; }
      else if (days <= 14) { cls = 'lh-vel-mid'; icon = 'two_wheeler'; }
      else { cls = 'lh-vel-slow'; icon = 'directions_walk'; }
      return '<span class="lh-velocity ' + cls + '"><span class="mat-icon lh-gauge">' + icon + '</span>' + days + 'd</span>';
    }

    // Filter alias data by job types — returns scaled data
    function lh_filterAlias(a, activeTypes) {
      const matchTypes = a.types.filter(function(t) { return activeTypes.indexOf(t) > -1; });
      if (matchTypes.length === 0) return null;
      const scale = matchTypes.length / a.types.length;
      var advAmt = lhAdvFundsOn ? Math.round((a.advFunds || 0) * scale) : 0;
      return {
        alias: a.alias, client: '', ageDays: a.ageDays, lotDays: a.lotDays || 0, types: a.types,
        assigned: Math.round(a.assigned * scale),
        recovered: Math.round(a.recovered * scale),
        billed: Math.round(a.billed * scale) + advAmt,
        collected: Math.round(a.collected * scale),
        balance: Math.round(a.balance * scale),
        advFunds: advAmt
      };
    }

    function lh_buildRow(r, maxBilled, isCombined, hasChildren) {
      const rate = r.assigned > 0 ? Math.round((r.recovered / r.assigned) * 100) : 0;
      const collPct = r.billed > 0 ? Math.round((r.collected / r.billed) * 100) : 0;
      const avg = r.recovered > 0 ? Math.round(r.billed / r.recovered) : 0;
      const barPct = Math.round((r.billed / (maxBilled || 1)) * 100);

      let html = '<td><div class="lh-name">';
      if (hasChildren) {
        const isOpen = lhExpanded[r._key] ? 'open' : '';
        html += '<button class="lh-expand-btn ' + isOpen + '" data-key="' + r._key + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 6 15 12 9 18"/></svg></button>';
      } else {
        html += '<span style="display:inline-block;width:16px;flex-shrink:0"></span>';
      }
      html += '<span class="mat-icon">account_balance</span>' + r.lh;
      // In By Client view, show alias count badge when 2+ aliases
      if (!isCombined && r.aliasCount > 1) {
        html += ' <span class="lh-alias-count">' + r.aliasCount + ' aliases</span>';
      }
      if (isCombined && r.clientCount > 0) {
        html += ' <span class="lh-alias-count">' + r.aliasCount + (r.aliasCount === 1 ? ' alias' : ' aliases') + ' · ' + r.clientCount + (r.clientCount === 1 ? ' client' : ' clients') + '</span>';
        // Direct vs Forwarder mini comparison
        if (r.directRate !== undefined && r.fwdRate !== undefined) {
          html += '<span class="lh-dvf-summary">';
          if (r.directRate >= 0) html += '<span class="lh-dvf-item"><span class="lh-dvf-dot direct"></span>Direct ' + r.directRate + '%</span>';
          if (r.fwdRate >= 0) html += '<span class="lh-dvf-item"><span class="lh-dvf-dot forwarder"></span>Fwd ' + r.fwdRate + '%</span>';
          html += '</span>';
        }
      }
      html += '</div></td>';
      html += '<td class="lh-col-alias"' + (isCombined ? ' style="display:none"' : '') + '><span class="lh-alias-tag">' + (r.aliasLabel || '') + '</span></td>';
      html += '<td>' + r.assigned + '</td>';
      html += '<td>' + r.recovered + '</td>';
      html += '<td><span class="' + lh_pctCls(rate) + '">' + rate + '%</span></td>';
      html += '<td class="lh-bar-cell"><div class="lh-bar-bg" style="width:' + barPct + '%"></div><div class="lh-bar-content">' + lh_fmt(r.billed) + '</div></td>';
      html += '<td>' + lh_fmt(r.collected) + '</td>';
      html += '<td><span class="' + lh_pctCls(collPct) + '">' + collPct + '%</span></td>';
      html += '<td>' + (avg > 0 ? lh_fmt(avg) : '—') + '</td>';
      html += '<td>' + lh_fmt(r.balance) + '</td>';
      html += '<td>' + lh_statusHtml(r.ageDays) + '</td>';
      html += '<td>' + lh_velocityHtml(r.lotDays || 0) + '</td>';
      return html;
    }

    function lh_buildChildRow(child, maxBilled, isCombined) {
      const rate = child.assigned > 0 ? Math.round((child.recovered / child.assigned) * 100) : 0;
      const collPct = child.billed > 0 ? Math.round((child.collected / child.billed) * 100) : 0;
      const avg = child.recovered > 0 ? Math.round(child.billed / child.recovered) : 0;
      const barPct = Math.round((child.billed / (maxBilled || 1)) * 100);

      let html = '<td><div class="lh-child-name"><span class="lh-child-indent">└</span>';
      // In combined view, child = one client row; show client name + Direct/Forwarder tag
      if (isCombined) {
        html += child.client;
        if (child._isDirect) {
          html += ' <span class="lh-type-tag lh-type-direct">Direct</span>';
        } else {
          html += ' <span class="lh-type-tag lh-type-forwarder">Forwarder</span>';
        }
        if (child.aliasCount > 1) html += ' <span class="lh-alias-count">' + child.aliasCount + ' aliases</span>';
      } else {
        html += child.alias;
        if (child.client) html += ' <span class="lh-client-tag">' + child.client + '</span>';
      }
      html += '</div></td>';
      html += '<td class="lh-col-alias"' + (isCombined ? ' style="display:none"' : '') + '></td>';
      html += '<td>' + child.assigned + '</td>';
      html += '<td>' + child.recovered + '</td>';
      html += '<td><span class="' + lh_pctCls(rate) + '">' + rate + '%</span></td>';
      html += '<td class="lh-bar-cell"><div class="lh-bar-bg" style="width:' + barPct + '%"></div><div class="lh-bar-content">' + lh_fmt(child.billed) + '</div></td>';
      html += '<td>' + lh_fmt(child.collected) + '</td>';
      html += '<td><span class="' + lh_pctCls(collPct) + '">' + collPct + '%</span></td>';
      html += '<td>' + (avg > 0 ? lh_fmt(avg) : '—') + '</td>';
      html += '<td>' + lh_fmt(child.balance) + '</td>';
      html += '<td>' + lh_statusHtml(child.ageDays) + '</td>';
      html += '<td>' + lh_velocityHtml(child.lotDays || 0) + '</td>';
      return html;
    }

    function lh_render() {
      const filterClients = ALL_CLIENTS;
      const activeTypes = lh_getActiveJobTypes();
      const isCombined = lhView === 'combined';
      const filterLH = lhFilterSelected.length > 0 ? lhFilterSelected : null; // null = all

      // Alias column visibility handled by applyColumns() after render

      const rows = []; // used by Combined view
      const clientGroups = {}; // used by By Client view
      const lienholders = Object.keys(LH_ALIASES);

      lienholders.forEach(function(lh) {
        // Lienholder filter
        if (filterLH && filterLH.indexOf(lh) === -1) return;

        const clientMap = LH_ALIASES[lh];

        if (isCombined) {
          let assigned = 0, recovered = 0, billed = 0, collected = 0, balance = 0, maxAge = 0, clientCount = 0, aliasCount = 0, lotSum = 0, lotCount = 0;
          // Track Direct vs Forwarder totals for summary
          let directAssigned = 0, directRecovered = 0, fwdAssigned = 0, fwdRecovered = 0;
          // Children = one row per client (not per alias)
          const children = [];

          filterClients.forEach(function(client) {
            if (!clientMap[client]) return;
            var isDirect = lh_isDirect(lh, client);
            // Direct/Forwarder type filter
            if (lhTypeFilter === 'direct' && !isDirect) return;
            if (lhTypeFilter === 'forwarder' && isDirect) return;
            let cAssigned = 0, cRecovered = 0, cBilled = 0, cCollected = 0, cBalance = 0, cMaxAge = 0, cAliasCount = 0, cLotSum = 0, cLotCount = 0;
            clientMap[client].forEach(function(a) {
              const filtered = lh_filterAlias(a, activeTypes);
              if (!filtered) return;
              cAssigned += filtered.assigned;
              cRecovered += filtered.recovered;
              cBilled += filtered.billed;
              cCollected += filtered.collected;
              cBalance += filtered.balance;
              if (a.ageDays > cMaxAge) cMaxAge = a.ageDays;
              if (a.lotDays > 0 && filtered.recovered > 0) { cLotSum += a.lotDays * filtered.recovered; cLotCount += filtered.recovered; }
              cAliasCount++;
            });
            if (cAssigned === 0 && cBilled === 0) return;
            var cLotDays = cLotCount > 0 ? Math.round(cLotSum / cLotCount) : 0;
            // Aggregate into parent totals
            assigned += cAssigned; recovered += cRecovered; billed += cBilled; collected += cCollected; balance += cBalance;
            if (cMaxAge > maxAge) maxAge = cMaxAge;
            aliasCount += cAliasCount;
            clientCount++;
            if (cLotDays > 0 && cLotCount > 0) { lotSum += cLotDays * cLotCount; lotCount += cLotCount; }
            // Track direct vs forwarder
            if (isDirect) { directAssigned += cAssigned; directRecovered += cRecovered; }
            else { fwdAssigned += cAssigned; fwdRecovered += cRecovered; }
            // One child per client
            children.push({
              client: client, _isDirect: isDirect, aliasCount: cAliasCount,
              assigned: cAssigned, recovered: cRecovered, billed: cBilled, collected: cCollected,
              balance: cBalance, ageDays: cMaxAge, lotDays: cLotDays
            });
          });

          if (assigned === 0 && billed === 0) return;
          // Compute Direct vs Forwarder recovery rates
          const directRate = directAssigned > 0 ? Math.round((directRecovered / directAssigned) * 100) : -1;
          const fwdRate = fwdAssigned > 0 ? Math.round((fwdRecovered / fwdAssigned) * 100) : -1;
          rows.push({
            _key: 'c_' + lh, lh: lh, client: '', aliasLabel: '',
            assigned: assigned, recovered: recovered, billed: billed, collected: collected,
            balance: balance, ageDays: maxAge, lotDays: lotCount > 0 ? Math.round(lotSum / lotCount) : 0,
            clientCount: clientCount, aliasCount: aliasCount, directRate: directRate, fwdRate: fwdRate,
            children: children.length > 1 ? children : [] // only expandable if 2+ clients
          });
        } else {
          // By Client: group lienholders under each client
          // We'll build into clientGroups instead of rows
          filterClients.forEach(function(client) {
            if (!clientMap[client]) return;
            var isDirect = lh_isDirect(lh, client);
            if (lhTypeFilter === 'direct' && !isDirect) return;
            if (lhTypeFilter === 'forwarder' && isDirect) return;
            const aliases = clientMap[client];
            let assigned = 0, recovered = 0, billed = 0, collected = 0, balance = 0, maxAge = 0, bcLotSum = 0, bcLotCount = 0;
            const children = [];

            aliases.forEach(function(a) {
              const filtered = lh_filterAlias(a, activeTypes);
              if (!filtered) return;
              assigned += filtered.assigned;
              recovered += filtered.recovered;
              billed += filtered.billed;
              collected += filtered.collected;
              balance += filtered.balance;
              if (a.ageDays > maxAge) maxAge = a.ageDays;
              if (a.lotDays > 0 && filtered.recovered > 0) { bcLotSum += a.lotDays * filtered.recovered; bcLotCount += filtered.recovered; }
              children.push({ alias: a.alias, client: '', assigned: filtered.assigned, recovered: filtered.recovered, billed: filtered.billed, collected: filtered.collected, balance: filtered.balance, ageDays: a.ageDays, lotDays: a.lotDays || 0 });
            });

            if (assigned === 0 && billed === 0) return;
            const aliasNames = aliases.map(function(a) { return a.alias; }).join(', ');
            if (!clientGroups[client]) clientGroups[client] = { assigned: 0, recovered: 0, billed: 0, collected: 0, lienholders: [] };
            clientGroups[client].assigned += assigned;
            clientGroups[client].recovered += recovered;
            clientGroups[client].billed += billed;
            clientGroups[client].collected += collected;
            clientGroups[client].lienholders.push({
              _key: 'bc_' + lh + '_' + client, lh: lh, client: client, aliasLabel: aliasNames,
              _isDirect: lh_isDirect(lh, client),
              assigned: assigned, recovered: recovered, billed: billed, collected: collected,
              balance: balance, ageDays: maxAge, lotDays: bcLotCount > 0 ? Math.round(bcLotSum / bcLotCount) : 0,
              clientCount: 1, aliasCount: aliases.length,
              children: children.length > 1 ? children : [] // only expandable if 2+ aliases
            });
          });
        }
      });

      let totalAssigned = 0, totalRecovered = 0, totalBilled = 0, totalCollected = 0, totalBalance = 0;
      let html = '';

      // Sort helper — extracts sortable value from a row
      function lh_sortVal(row) {
        var k = lhSortKey;
        if (k === 'recoveryRate') return row.assigned > 0 ? (row.recovered / row.assigned) : 0;
        if (k === 'collectedPct') return row.billed > 0 ? (row.collected / row.billed) : 0;
        if (k === 'avgPerRecovery') return row.recovered > 0 ? (row.billed / row.recovered) : 0;
        return row[k] || 0;
      }
      function lh_sortCmp(a, b) {
        var va = lh_sortVal(a), vb = lh_sortVal(b);
        return lhSortDir === 'asc' ? (va - vb) : (vb - va);
      }

      if (isCombined) {
        // Combined view: sorted by current sort key
        rows.sort(lh_sortCmp);
        const maxBilled = rows.length > 0 ? rows[0].billed : 1;

        rows.forEach(function(r) {
          totalAssigned += r.assigned;
          totalRecovered += r.recovered;
          totalBilled += r.billed;
          totalCollected += r.collected;
          totalBalance += r.balance;

          const hasChildren = r.children && r.children.length > 0;
          html += '<tr>' + lh_buildRow(r, maxBilled, true, hasChildren) + '</tr>';

          if (hasChildren && lhExpanded[r._key]) {
            r.children.sort(function(a, b) { return b.billed - a.billed; });
            r.children.forEach(function(child) {
              html += '<tr class="lh-child-row">' + lh_buildChildRow(child, maxBilled, true) + '</tr>';
            });
          }
        });
      } else {
        // By Client view: 3-level tree — Client → Lienholder → Aliases
        // Pre-compute balance + lotDays on groups for sorting
        Object.keys(clientGroups).forEach(function(c) {
          var g = clientGroups[c], bal = 0, mAge = 0, lSum = 0, lCnt = 0;
          g.lienholders.forEach(function(r) { bal += r.balance; if (r.ageDays > mAge) mAge = r.ageDays; if (r.lotDays > 0 && r.recovered > 0) { lSum += r.lotDays * r.recovered; lCnt += r.recovered; } });
          g.balance = bal; g.ageDays = mAge; g.lotDays = lCnt > 0 ? Math.round(lSum / lCnt) : 0;
        });
        const sortedClients = Object.keys(clientGroups).sort(function(a, b) {
          return lh_sortCmp(clientGroups[a], clientGroups[b]);
        });
        // Global max for bar sizing
        let globalMaxBilled = 1;
        sortedClients.forEach(function(client) {
          if (clientGroups[client].billed > globalMaxBilled) globalMaxBilled = clientGroups[client].billed;
        });

        sortedClients.forEach(function(client) {
          const grp = clientGroups[client];
          const isDirect = grp.lienholders.length > 0 && grp.lienholders[0]._isDirect;
          const clientKey = 'client_' + client;
          const grpRate = grp.assigned > 0 ? Math.round((grp.recovered / grp.assigned) * 100) : 0;
          const grpCollPct = grp.billed > 0 ? Math.round((grp.collected / grp.billed) * 100) : 0;
          const grpAvg = grp.recovered > 0 ? Math.round(grp.billed / grp.recovered) : 0;
          const barPct = Math.round((grp.billed / globalMaxBilled) * 100);
          const hasLienholders = grp.lienholders.length > 0;

          totalAssigned += grp.assigned;
          totalRecovered += grp.recovered;
          totalBilled += grp.billed;
          totalCollected += grp.collected;
          // sum balance from lienholders
          let grpBalance = 0, grpMaxAge = 0, grpLotSum = 0, grpLotCount = 0;
          grp.lienholders.forEach(function(r) { grpBalance += r.balance; if (r.ageDays > grpMaxAge) grpMaxAge = r.ageDays; if (r.lotDays > 0 && r.recovered > 0) { grpLotSum += r.lotDays * r.recovered; grpLotCount += r.recovered; } });
          var grpLotDays = grpLotCount > 0 ? Math.round(grpLotSum / grpLotCount) : 0;
          totalBalance += grpBalance;

          // --- Client parent row (level 1) ---
          html += '<tr class="lh-client-row">';
          html += '<td><div class="lh-name">';
          if (hasLienholders) {
            const isOpen = lhExpanded[clientKey] ? 'open' : '';
            html += '<button class="lh-expand-btn ' + isOpen + '" data-key="' + clientKey + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 6 15 12 9 18"/></svg></button>';
          } else {
            html += '<span style="display:inline-block;width:16px;flex-shrink:0"></span>';
          }
          html += '<span class="mat-icon">' + (isDirect ? 'verified' : 'business') + '</span>' + client;
          if (isDirect) html += ' <span class="lh-type-tag lh-type-direct">Direct</span>';
          else html += ' <span class="lh-type-tag lh-type-forwarder">Forwarder</span>';
          html += ' <span class="lh-client-meta">' + grp.lienholders.length + ' lienholder' + (grp.lienholders.length !== 1 ? 's' : '') + '</span>';
          html += '</div></td>';
          // Alias column (empty for client row)
          html += '<td></td>';
          html += '<td>' + grp.assigned + '</td>';
          html += '<td>' + grp.recovered + '</td>';
          html += '<td><span class="' + lh_pctCls(grpRate) + '">' + grpRate + '%</span></td>';
          html += '<td class="lh-bar-cell"><div class="lh-bar-bg" style="width:' + barPct + '%"></div><div class="lh-bar-content">' + lh_fmt(grp.billed) + '</div></td>';
          html += '<td>' + lh_fmt(grp.collected) + '</td>';
          html += '<td><span class="' + lh_pctCls(grpCollPct) + '">' + grpCollPct + '%</span></td>';
          html += '<td>' + (grpAvg > 0 ? lh_fmt(grpAvg) : '—') + '</td>';
          html += '<td>' + lh_fmt(grpBalance) + '</td>';
          html += '<td>' + lh_statusHtml(grpMaxAge) + '</td>';
          html += '<td>' + lh_velocityHtml(grpLotDays) + '</td>';
          html += '</tr>';

          // --- Lienholder child rows (level 2) if expanded ---
          if (hasLienholders && lhExpanded[clientKey]) {
            grp.lienholders.sort(function(a, b) { return b.billed - a.billed; });
            grp.lienholders.forEach(function(r) {
              const lhRate = r.assigned > 0 ? Math.round((r.recovered / r.assigned) * 100) : 0;
              const lhCollPct = r.billed > 0 ? Math.round((r.collected / r.billed) * 100) : 0;
              const lhAvg = r.recovered > 0 ? Math.round(r.billed / r.recovered) : 0;
              const lhBarPct = Math.round((r.billed / globalMaxBilled) * 100);
              const hasAliases = r.children && r.children.length > 0;

              html += '<tr class="lh-lh-child">';
              html += '<td><div class="lh-name">';
              if (hasAliases) {
                const isOpen = lhExpanded[r._key] ? 'open' : '';
                html += '<button class="lh-expand-btn ' + isOpen + '" data-key="' + r._key + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 6 15 12 9 18"/></svg></button>';
              } else {
                html += '<span style="display:inline-block;width:16px;flex-shrink:0"></span>';
              }
              html += '<span class="mat-icon" style="font-size:13px;">account_balance</span>' + r.lh;
              if (r.aliasCount > 1) html += ' <span class="lh-alias-count">' + r.aliasCount + ' aliases</span>';
              html += '</div></td>';
              html += '<td><span class="lh-alias-tag">' + (r.aliasLabel || '') + '</span></td>';
              html += '<td>' + r.assigned + '</td>';
              html += '<td>' + r.recovered + '</td>';
              html += '<td><span class="' + lh_pctCls(lhRate) + '">' + lhRate + '%</span></td>';
              html += '<td class="lh-bar-cell"><div class="lh-bar-bg" style="width:' + lhBarPct + '%"></div><div class="lh-bar-content">' + lh_fmt(r.billed) + '</div></td>';
              html += '<td>' + lh_fmt(r.collected) + '</td>';
              html += '<td><span class="' + lh_pctCls(lhCollPct) + '">' + lhCollPct + '%</span></td>';
              html += '<td>' + (lhAvg > 0 ? lh_fmt(lhAvg) : '—') + '</td>';
              html += '<td>' + lh_fmt(r.balance) + '</td>';
              html += '<td>' + lh_statusHtml(r.ageDays) + '</td>';
              html += '<td>' + lh_velocityHtml(r.lotDays || 0) + '</td>';
              html += '</tr>';

              // --- Alias child rows (level 3) if expanded ---
              if (hasAliases && lhExpanded[r._key]) {
                r.children.sort(function(a, b) { return b.billed - a.billed; });
                r.children.forEach(function(alias) {
                  const aRate = alias.assigned > 0 ? Math.round((alias.recovered / alias.assigned) * 100) : 0;
                  const aCollPct = alias.billed > 0 ? Math.round((alias.collected / alias.billed) * 100) : 0;
                  const aAvg = alias.recovered > 0 ? Math.round(alias.billed / alias.recovered) : 0;
                  const aBarPct = Math.round((alias.billed / globalMaxBilled) * 100);

                  html += '<tr class="lh-alias-child">';
                  html += '<td><div class="lh-child-name"><span class="lh-child-indent">└</span>' + alias.alias + '</div></td>';
                  html += '<td></td>';
                  html += '<td>' + alias.assigned + '</td>';
                  html += '<td>' + alias.recovered + '</td>';
                  html += '<td><span class="' + lh_pctCls(aRate) + '">' + aRate + '%</span></td>';
                  html += '<td class="lh-bar-cell"><div class="lh-bar-bg" style="width:' + aBarPct + '%"></div><div class="lh-bar-content">' + lh_fmt(alias.billed) + '</div></td>';
                  html += '<td>' + lh_fmt(alias.collected) + '</td>';
                  html += '<td><span class="' + lh_pctCls(aCollPct) + '">' + aCollPct + '%</span></td>';
                  html += '<td>' + (aAvg > 0 ? lh_fmt(aAvg) : '—') + '</td>';
                  html += '<td>' + lh_fmt(alias.balance) + '</td>';
                  html += '<td>' + lh_statusHtml(alias.ageDays) + '</td>';
                  html += '<td>' + lh_velocityHtml(alias.lotDays || 0) + '</td>';
                  html += '</tr>';
                });
              }
            });
          }
        });
      }

      // Footer
      const totalRate = totalAssigned > 0 ? Math.round((totalRecovered / totalAssigned) * 100) : 0;
      const totalCollPct = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;
      const totalAvg = totalRecovered > 0 ? Math.round(totalBilled / totalRecovered) : 0;
      const colSpan = '<td class="lh-col-alias"' + (isCombined ? ' style="display:none"' : '') + '></td>';
      const rowCountLabel = isCombined ? rows.length + ' lienholders' : Object.keys(clientGroups).length + ' clients';
      html += '<tr class="footer-row">';
      html += '<td>Total (' + rowCountLabel + ')</td>' + colSpan;
      html += '<td><strong>' + totalAssigned + '</strong></td>';
      html += '<td><strong>' + totalRecovered + '</strong></td>';
      html += '<td><span class="' + lh_pctCls(totalRate) + '"><strong>' + totalRate + '%</strong></span></td>';
      html += '<td><strong>' + lh_fmt(totalBilled) + '</strong></td>';
      html += '<td><strong>' + lh_fmt(totalCollected) + '</strong></td>';
      html += '<td><span class="' + lh_pctCls(totalCollPct) + '"><strong>' + totalCollPct + '%</strong></span></td>';
      html += '<td>' + (totalAvg > 0 ? lh_fmt(totalAvg) : '—') + '</td>';
      html += '<td><strong>' + lh_fmt(totalBalance) + '</strong></td>';
      html += '<td></td>';
      html += '<td></td>';
      html += '</tr>';

      const tbody = document.getElementById('lh_tableBody');
      tbody.innerHTML = html;
      document.getElementById('lh_portfolioCollected').innerHTML = '<span class="' + lh_pctCls(totalCollPct) + '">' + totalCollPct + '%</span>';

      // Update label
      const viewLabel = isCombined ? 'Combined View' : 'By Client';
      const typeLabel = activeTypes.length === ALL_JOB_TYPES.length ? 'All Job Types' : activeTypes.map(function(t) { return t.charAt(0).toUpperCase() + t.slice(1); }).join(', ');
      const lhLabel = filterLH ? (filterLH.length === 1 ? filterLH[0] : filterLH.length + ' Lienholders') : 'All Lienholders';
      const dtLabel = lhTypeFilter === 'all' ? '' : (lhTypeFilter === 'direct' ? ' — Direct Only' : ' — Forwarders Only');
      document.getElementById('lh_tableLabel').textContent = 'Client / Lienholder Health — ' + viewLabel + ' — ' + lhLabel + dtLabel + ' — ' + typeLabel + ' (MTD)';

      // Expand/collapse click delegation
      tbody.onclick = function(e) {
        const btn = e.target.closest('.lh-expand-btn');
        if (!btn) return;
        const key = btn.dataset.key;
        lhExpanded[key] = !lhExpanded[key];
        lh_render();
      };
    }

    // View toggle pills
    const viewPills = document.getElementById('lh_viewPills');
    if (viewPills) {
      viewPills.addEventListener('click', function(e) {
        if (e.target.classList.contains('pill')) {
          viewPills.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('active'); });
          e.target.classList.add('active');
          lhView = e.target.dataset.view;
          lh_render();
        }
      });
    }

    // Job Type toggle pills
    const jobTypePills = document.getElementById('lh_jobTypePills');
    if (jobTypePills) {
      jobTypePills.addEventListener('click', function(e) {
        if (e.target.classList.contains('pill')) {
          e.target.classList.toggle('active');
          lh_render();
        }
      });
    }

    // ── Column toggle ──
    (function() {
      const LH_COLUMNS = [
        { key: 'alias',     label: 'Alias',          colIndex: 1, hideable: true,  defaultOn: true },
        { key: 'assigned',  label: 'Assigned',       colIndex: 2, hideable: true,  defaultOn: true },
        { key: 'recovered', label: 'Recovered',      colIndex: 3, hideable: true,  defaultOn: true },
        { key: 'rate',      label: 'Recovery Rate',  colIndex: 4, hideable: true,  defaultOn: true },
        { key: 'billed',    label: 'Billed (MTD)',   colIndex: 5, hideable: true,  defaultOn: true },
        { key: 'collected', label: 'Collected (MTD)',colIndex: 6, hideable: true,  defaultOn: true },
        { key: 'collPct',   label: 'Collected %',    colIndex: 7, hideable: true,  defaultOn: true },
        { key: 'avg',       label: 'Avg $/Recovery', colIndex: 8, hideable: true,  defaultOn: true },
        { key: 'balance',   label: 'Balance Owed',   colIndex: 9, hideable: true,  defaultOn: true },
        { key: 'status',    label: 'Status',         colIndex: 10, hideable: true, defaultOn: true },
        { key: 'velocity',  label: 'Lot Velocity',   colIndex: 11, hideable: true, defaultOn: true }
      ];
      const STORAGE_KEY = 'ampd_lh_hidden_cols';
      const btn = document.getElementById('lhColToggleBtn');
      const pop = document.getElementById('lhColTogglePop');
      if (!btn || !pop) return;

      function getHiddenCols() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch(e) { return []; }
      }

      function applyColumns() {
        const hidden = getHiddenCols();
        const table = document.querySelector('.lh-table');
        if (!table) return;
        var isCombined = lhView === 'combined';
        LH_COLUMNS.forEach(function(col) {
          var isHidden = hidden.indexOf(col.key) > -1;
          // In Combined view, alias is always hidden
          if (col.key === 'alias' && isCombined) isHidden = true;
          // Hide/show header
          var ths = table.querySelectorAll('thead th');
          if (ths[col.colIndex]) ths[col.colIndex].style.display = isHidden ? 'none' : '';
          // Hide/show all body cells at this index
          table.querySelectorAll('tbody tr').forEach(function(tr) {
            var tds = tr.querySelectorAll('td');
            if (tds[col.colIndex]) tds[col.colIndex].style.display = isHidden ? 'none' : '';
          });
        });
      }

      function buildPopover() {
        var hidden = getHiddenCols();
        var html = '';
        LH_COLUMNS.forEach(function(col) {
          if (!col.hideable) return;
          var isActive = hidden.indexOf(col.key) === -1;
          html += '<div class="lh-col-toggle-item ' + (isActive ? 'active' : '') + '" data-col="' + col.key + '">';
          html += '<span class="lh-col-check"></span>';
          html += col.label;
          html += '</div>';
        });
        pop.innerHTML = html;
      }

      buildPopover();

      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var isOpen = pop.style.display !== 'none';
        pop.style.display = isOpen ? 'none' : 'block';
      });

      pop.addEventListener('click', function(e) {
        var item = e.target.closest('.lh-col-toggle-item');
        if (!item) return;
        e.stopPropagation();
        var col = item.dataset.col;
        var hidden = getHiddenCols();
        var idx = hidden.indexOf(col);
        if (idx > -1) { hidden.splice(idx, 1); item.classList.add('active'); }
        else { hidden.push(col); item.classList.remove('active'); }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
        applyColumns();
      });

      document.addEventListener('click', function(e) {
        if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
          pop.style.display = 'none';
        }
      });

      // Apply after every render
      var origRender = lh_render;
      lh_render = function() { origRender(); applyColumns(); };
    })();

    // ── Column Sort Click Handling ──
    (function() {
      var thead = document.querySelector('.lh-table thead');
      if (!thead) return;

      function updateSortArrows() {
        thead.querySelectorAll('.lh-sortable').forEach(function(th) {
          th.classList.remove('sort-asc', 'sort-desc', 'sort-active');
          if (th.dataset.sort === lhSortKey) {
            th.classList.add('sort-active', lhSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
          }
        });
      }

      thead.addEventListener('click', function(e) {
        var th = e.target.closest('.lh-sortable');
        if (!th || !th.dataset.sort) return;
        // Don't sort if they clicked the info icon
        if (e.target.closest('.info-icon') || e.target.closest('.th-tip')) return;
        var key = th.dataset.sort;
        if (lhSortKey === key) {
          lhSortDir = lhSortDir === 'desc' ? 'asc' : 'desc';
        } else {
          lhSortKey = key;
          lhSortDir = 'desc'; // default to desc for new column
        }
        updateSortArrows();
        lh_render();
      });

      // Set initial arrow state
      updateSortArrows();
    })();

    // Initial render
    lh_render();
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // ██  LIFE CYCLE TAB
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Life Cycle: Service Matrix ──
  // Defines which services are realistically billable per layer
  var LC_REPO_SERVICES = [
    { key: 'repoFee',    label: 'Repo Fee',          avgFee: 350, alwaysExpected: true },
    { key: 'fuel',       label: 'Fuel',               avgFee: 25,  alwaysExpected: false },
    { key: 'bonus',      label: 'Bonus / Incentive',  avgFee: 50,  alwaysExpected: false },
    { key: 'equipment',  label: 'Equipment (Flatbed/Dolly)', avgFee: 75, alwaysExpected: false },
    { key: 'mileage',    label: 'Mileage',            avgFee: 40,  alwaysExpected: false }
  ];
  var LC_DISPOSITION_SERVICES = [
    { key: 'keys',       label: 'Keys',               avgFee: 45,  condition: 'keysObtained' },
    { key: 'storage',    label: 'Storage',             avgFee: 120, condition: 'heldDays' },
    { key: 'personalProp', label: 'Personal Property', avgFee: 35,  condition: 'ppReleased' },
    { key: 'condReport', label: 'Pics / CR',           avgFee: 55,  condition: 'crDone' },
    { key: 'transport',  label: 'Transport / Delivery', avgFee: 95, condition: 'delivered' },
    { key: 'admin',      label: 'Admin / Misc',       avgFee: 20,  condition: 'adminApplicable' }
  ];
  var LC_PRE_RECOVERY_SERVICES = [
    { key: 'fieldCR',     label: 'Field Pics / CR',    avgFee: 55,  condition: 'fieldCR' },
    { key: 'advFunds',    label: 'Advanced Funds',     avgFee: 200, condition: 'impound' }
  ];

  // ── Life Cycle: Mock Data ──
  var LC_MOCK = {
    recoveries: [
      // Delivered to Auction
      { id: 1, disposition: 'Delivered to Auction', type: 'involuntary', keysObtained: true, heldDays: 8, ppReleased: true, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 50, equipment: 75, mileage: 40, admin: 0, keys: 45, storage: 120, personalProp: 35, condReport: 55, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 2, disposition: 'Delivered to Auction', type: 'involuntary', keysObtained: true, heldDays: 5, ppReleased: false, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: true,
        billed: { repoFee: 350, fuel: 25, bonus: 0, equipment: 0, mileage: 40, admin: 20, keys: 45, storage: 120, personalProp: 0, condReport: 0, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 3, disposition: 'Delivered to Auction', type: 'involuntary', keysObtained: false, heldDays: 12, ppReleased: true, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 50, equipment: 75, mileage: 0, admin: 0, keys: 0, storage: 120, personalProp: 35, condReport: 55, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 4, disposition: 'Delivered to Auction', type: 'involuntary', keysObtained: true, heldDays: 3, ppReleased: false, crDone: true, delivered: true, fieldCR: true, impound: false, adminApplicable: true,
        billed: { repoFee: 350, fuel: 0, bonus: 50, equipment: 0, mileage: 40, admin: 20, keys: 0, storage: 120, personalProp: 0, condReport: 55, transport: 0, fieldCR: 55, advFunds: 0 }},
      { id: 5, disposition: 'Delivered to Auction', type: 'involuntary', keysObtained: true, heldDays: 6, ppReleased: true, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 0, equipment: 75, mileage: 40, admin: 0, keys: 45, storage: 120, personalProp: 0, condReport: 55, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 6, disposition: 'Delivered to Auction', type: 'involuntary', keysObtained: true, heldDays: 10, ppReleased: false, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: true,
        billed: { repoFee: 350, fuel: 25, bonus: 50, equipment: 0, mileage: 0, admin: 20, keys: 45, storage: 0, personalProp: 0, condReport: 55, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 7, disposition: 'Delivered to Auction', type: 'voluntary', keysObtained: true, heldDays: 2, ppReleased: false, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 0, bonus: 0, equipment: 0, mileage: 0, admin: 0, keys: 45, storage: 120, personalProp: 0, condReport: 55, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 8, disposition: 'Delivered to Auction', type: 'voluntary', keysObtained: true, heldDays: 4, ppReleased: true, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 0, bonus: 0, equipment: 0, mileage: 0, admin: 0, keys: 45, storage: 120, personalProp: 35, condReport: 0, transport: 95, fieldCR: 0, advFunds: 0 }},

      // Delivered to Client
      { id: 9, disposition: 'Delivered to Client', type: 'involuntary', keysObtained: true, heldDays: 5, ppReleased: false, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 50, equipment: 0, mileage: 40, admin: 0, keys: 45, storage: 120, personalProp: 0, condReport: 55, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 10, disposition: 'Delivered to Client', type: 'involuntary', keysObtained: true, heldDays: 7, ppReleased: true, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: true,
        billed: { repoFee: 350, fuel: 25, bonus: 0, equipment: 75, mileage: 0, admin: 20, keys: 0, storage: 120, personalProp: 35, condReport: 55, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 11, disposition: 'Delivered to Client', type: 'involuntary', keysObtained: false, heldDays: 3, ppReleased: false, crDone: false, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 50, equipment: 0, mileage: 40, admin: 0, keys: 0, storage: 0, personalProp: 0, condReport: 0, transport: 95, fieldCR: 0, advFunds: 0 }},

      // Delivered to Customer (take-back)
      { id: 12, disposition: 'Delivered to Customer', type: 'involuntary', keysObtained: true, heldDays: 1, ppReleased: false, crDone: false, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 0, equipment: 0, mileage: 40, admin: 0, keys: 45, storage: 0, personalProp: 0, condReport: 0, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 13, disposition: 'Delivered to Customer', type: 'voluntary', keysObtained: true, heldDays: 0, ppReleased: false, crDone: false, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 0, bonus: 0, equipment: 0, mileage: 0, admin: 0, keys: 45, storage: 0, personalProp: 0, condReport: 0, transport: 0, fieldCR: 0, advFunds: 0 }},

      // Redeemed (customer picks up at lot)
      { id: 14, disposition: 'Redeemed', type: 'involuntary', keysObtained: true, heldDays: 4, ppReleased: true, crDone: true, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 50, equipment: 0, mileage: 40, admin: 0, keys: 45, storage: 120, personalProp: 35, condReport: 55, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 15, disposition: 'Redeemed', type: 'involuntary', keysObtained: true, heldDays: 2, ppReleased: false, crDone: false, delivered: false, fieldCR: false, impound: false, adminApplicable: true,
        billed: { repoFee: 350, fuel: 25, bonus: 0, equipment: 75, mileage: 0, admin: 20, keys: 0, storage: 120, personalProp: 0, condReport: 0, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 16, disposition: 'Redeemed', type: 'involuntary', keysObtained: true, heldDays: 6, ppReleased: true, crDone: true, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 0, bonus: 50, equipment: 0, mileage: 40, admin: 0, keys: 45, storage: 0, personalProp: 35, condReport: 55, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 17, disposition: 'Redeemed', type: 'voluntary', keysObtained: true, heldDays: 1, ppReleased: false, crDone: false, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 0, bonus: 0, equipment: 0, mileage: 0, admin: 0, keys: 45, storage: 120, personalProp: 0, condReport: 0, transport: 0, fieldCR: 0, advFunds: 0 }},

      // Impound cases
      { id: 18, disposition: 'Delivered to Auction', type: 'impound', keysObtained: false, heldDays: 15, ppReleased: true, crDone: true, delivered: true, fieldCR: true, impound: true, adminApplicable: true,
        billed: { repoFee: 350, fuel: 25, bonus: 0, equipment: 0, mileage: 0, admin: 20, keys: 0, storage: 120, personalProp: 35, condReport: 55, transport: 95, fieldCR: 55, advFunds: 200 }},
      { id: 19, disposition: 'Redeemed', type: 'impound', keysObtained: false, heldDays: 8, ppReleased: false, crDone: true, delivered: false, fieldCR: true, impound: true, adminApplicable: true,
        billed: { repoFee: 350, fuel: 0, bonus: 0, equipment: 0, mileage: 0, admin: 0, keys: 0, storage: 120, personalProp: 0, condReport: 0, transport: 0, fieldCR: 0, advFunds: 200 }},
      { id: 20, disposition: 'Delivered to Client', type: 'impound', keysObtained: false, heldDays: 20, ppReleased: false, crDone: true, delivered: true, fieldCR: true, impound: true, adminApplicable: true,
        billed: { repoFee: 350, fuel: 0, bonus: 0, equipment: 0, mileage: 40, admin: 0, keys: 0, storage: 120, personalProp: 0, condReport: 55, transport: 0, fieldCR: 55, advFunds: 0 }},

      // Released to Transporter (someone else hauls — agent can't bill transport)
      { id: 21, disposition: 'Released to Transporter', type: 'involuntary', keysObtained: true, heldDays: 6, ppReleased: true, crDone: true, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 50, equipment: 0, mileage: 40, admin: 0, keys: 45, storage: 120, personalProp: 35, condReport: 55, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 22, disposition: 'Released to Transporter', type: 'involuntary', keysObtained: true, heldDays: 10, ppReleased: false, crDone: true, delivered: false, fieldCR: false, impound: false, adminApplicable: true,
        billed: { repoFee: 350, fuel: 25, bonus: 0, equipment: 75, mileage: 0, admin: 20, keys: 0, storage: 120, personalProp: 0, condReport: 55, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 23, disposition: 'Released to Transporter', type: 'involuntary', keysObtained: false, heldDays: 8, ppReleased: false, crDone: true, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 0, bonus: 50, equipment: 0, mileage: 40, admin: 0, keys: 0, storage: 120, personalProp: 0, condReport: 0, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 24, disposition: 'Released to Transporter', type: 'voluntary', keysObtained: true, heldDays: 3, ppReleased: false, crDone: true, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 0, bonus: 0, equipment: 0, mileage: 0, admin: 0, keys: 45, storage: 120, personalProp: 0, condReport: 55, transport: 0, fieldCR: 0, advFunds: 0 }},

      // More involuntary variety
      { id: 25, disposition: 'Delivered to Auction', type: 'involuntary', keysObtained: true, heldDays: 9, ppReleased: true, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: true,
        billed: { repoFee: 350, fuel: 25, bonus: 50, equipment: 0, mileage: 40, admin: 20, keys: 45, storage: 120, personalProp: 0, condReport: 55, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 26, disposition: 'Redeemed', type: 'involuntary', keysObtained: true, heldDays: 3, ppReleased: false, crDone: true, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 0, equipment: 0, mileage: 0, admin: 0, keys: 45, storage: 120, personalProp: 0, condReport: 0, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 27, disposition: 'Delivered to Auction', type: 'involuntary', keysObtained: true, heldDays: 7, ppReleased: false, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 0, bonus: 50, equipment: 75, mileage: 40, admin: 0, keys: 0, storage: 120, personalProp: 0, condReport: 55, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 28, disposition: 'Delivered to Client', type: 'involuntary', keysObtained: true, heldDays: 4, ppReleased: true, crDone: true, delivered: true, fieldCR: false, impound: false, adminApplicable: true,
        billed: { repoFee: 350, fuel: 25, bonus: 50, equipment: 0, mileage: 0, admin: 20, keys: 45, storage: 120, personalProp: 35, condReport: 55, transport: 95, fieldCR: 0, advFunds: 0 }},
      { id: 29, disposition: 'Delivered to Customer', type: 'involuntary', keysObtained: true, heldDays: 2, ppReleased: false, crDone: false, delivered: true, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 0, equipment: 0, mileage: 40, admin: 0, keys: 45, storage: 0, personalProp: 0, condReport: 0, transport: 0, fieldCR: 0, advFunds: 0 }},

      // Stored (still on lot — stagnant lifecycle, services accumulating but may not be billed yet)
      { id: 30, disposition: 'Stored', type: 'involuntary', keysObtained: true, heldDays: 14, ppReleased: true, crDone: true, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 50, equipment: 0, mileage: 40, admin: 0, keys: 45, storage: 120, personalProp: 35, condReport: 55, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 31, disposition: 'Stored', type: 'involuntary', keysObtained: true, heldDays: 22, ppReleased: false, crDone: true, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 25, bonus: 0, equipment: 75, mileage: 0, admin: 0, keys: 0, storage: 0, personalProp: 0, condReport: 0, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 32, disposition: 'Stored', type: 'involuntary', keysObtained: true, heldDays: 9, ppReleased: false, crDone: false, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 0, bonus: 0, equipment: 0, mileage: 40, admin: 0, keys: 0, storage: 120, personalProp: 0, condReport: 0, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 33, disposition: 'Stored', type: 'voluntary', keysObtained: true, heldDays: 18, ppReleased: true, crDone: true, delivered: false, fieldCR: false, impound: false, adminApplicable: false,
        billed: { repoFee: 350, fuel: 0, bonus: 0, equipment: 0, mileage: 0, admin: 0, keys: 45, storage: 0, personalProp: 0, condReport: 55, transport: 0, fieldCR: 0, advFunds: 0 }},
      { id: 34, disposition: 'Stored', type: 'impound', keysObtained: false, heldDays: 30, ppReleased: false, crDone: true, delivered: false, fieldCR: true, impound: true, adminApplicable: true,
        billed: { repoFee: 350, fuel: 0, bonus: 0, equipment: 0, mileage: 0, admin: 20, keys: 0, storage: 120, personalProp: 0, condReport: 55, transport: 0, fieldCR: 55, advFunds: 200 }}
    ]
  };

  // ── Life Cycle: State ──
  var lcView = 'byDisposition'; // 'byDisposition' | 'byService'
  var lcLayer = 'post';          // 'post' | 'all'
  var lcTypeFilter = 'all';      // 'all' | 'involuntary' | 'voluntary' | 'impound'
  var lcCollapsed = {};           // disposition name → collapsed boolean

  // ── Life Cycle: Helpers ──
  function lc_getServices() {
    var svcs = LC_REPO_SERVICES.concat(LC_DISPOSITION_SERVICES);
    if (lcLayer === 'all') svcs = svcs.concat(LC_PRE_RECOVERY_SERVICES);
    return svcs;
  }

  function lc_isServiceExpected(svc, rec) {
    // Repo-layer services
    if (svc.alwaysExpected) return true;
    if (LC_REPO_SERVICES.indexOf(svc) > -1) return true; // all repo services are "expected" (optional but billable)
    // Pre-recovery
    if (svc.key === 'fieldCR') return rec.fieldCR;
    if (svc.key === 'advFunds') return rec.impound;
    // Disposition services — check conditions
    if (svc.condition === 'keysObtained') return rec.keysObtained;
    if (svc.condition === 'heldDays') return rec.heldDays > 0;
    if (svc.condition === 'ppReleased') return rec.ppReleased;
    if (svc.condition === 'crDone') return rec.crDone;
    if (svc.condition === 'delivered') return rec.delivered;
    if (svc.condition === 'adminApplicable') return rec.adminApplicable;
    return false;
  }

  function lc_wasBilled(svc, rec) {
    return (rec.billed[svc.key] || 0) > 0;
  }

  function lc_pctClass(pct) {
    if (pct >= 80) return 'green';
    if (pct >= 50) return 'yellow';
    return 'red';
  }

  function lc_fmt(n) {
    return '$' + n.toLocaleString('en-US');
  }

  // ── Life Cycle: Render ──
  function lc_render() {
    var recs = LC_MOCK.recoveries;
    // Type filter
    if (lcTypeFilter !== 'all') {
      recs = recs.filter(function(r) { return r.type === lcTypeFilter; });
    }

    var services = lc_getServices();
    var totalRecoveries = recs.length;
    var totalExpected = 0, totalCaptured = 0, totalRevenue = 0, totalMissedVal = 0;

    // Compute per-service aggregate stats across all recs
    var svcStats = {};
    services.forEach(function(s) {
      svcStats[s.key] = { expected: 0, billed: 0, revenue: 0, missed: 0 };
    });

    // Compute per-disposition aggregate stats
    var dispMap = {};
    recs.forEach(function(r) {
      if (!dispMap[r.disposition]) dispMap[r.disposition] = { recs: [], count: 0 };
      dispMap[r.disposition].recs.push(r);
      dispMap[r.disposition].count++;

      services.forEach(function(s) {
        var expected = lc_isServiceExpected(s, r);
        var billed = lc_wasBilled(s, r);
        if (expected) {
          totalExpected++;
          svcStats[s.key].expected++;
          if (billed) {
            totalCaptured++;
            svcStats[s.key].billed++;
            svcStats[s.key].revenue += (r.billed[s.key] || 0);
            totalRevenue += (r.billed[s.key] || 0);
          } else {
            svcStats[s.key].missed++;
            totalMissedVal += s.avgFee;
          }
        } else if (billed) {
          // Billed even though not "expected" — still count revenue
          svcStats[s.key].revenue += (r.billed[s.key] || 0);
          totalRevenue += (r.billed[s.key] || 0);
        }
      });
    });

    // KPIs
    var overallCapture = totalExpected > 0 ? Math.round((totalCaptured / totalExpected) * 100) : 0;
    document.getElementById('lc_kpiRecoveries').textContent = totalRecoveries;
    document.getElementById('lc_kpiCapture').textContent = overallCapture + '%';
    document.getElementById('lc_kpiCapture').className = 'lc-kpi-val lc-pct ' + lc_pctClass(overallCapture);
    document.getElementById('lc_kpiCaptured').textContent = lc_fmt(totalRevenue);
    document.getElementById('lc_kpiMissed').textContent = lc_fmt(totalMissedVal);

    // Build table
    var thead = document.getElementById('lc_thead');
    var tbody = document.getElementById('lc_tableBody');

    if (lcView === 'byDisposition') {
      lc_renderByDisposition(thead, tbody, dispMap, services, recs);
    } else {
      lc_renderByService(thead, tbody, svcStats, services, totalRecoveries);
    }

    // Update label
    var typeLabel = lcTypeFilter === 'all' ? 'All Types' : lcTypeFilter.charAt(0).toUpperCase() + lcTypeFilter.slice(1);
    var layerLabel = lcLayer === 'all' ? 'All Layers' : 'Post-Recovery';
    document.getElementById('lc_tableLabel').textContent =
      (lcView === 'byDisposition' ? 'By Disposition' : 'By Service') + ' — ' + typeLabel + ' — ' + layerLabel + ' (MTD)';
  }

  function lc_renderByDisposition(thead, tbody, dispMap, services, allRecs) {
    thead.innerHTML = '<tr>'
      + '<th style="min-width:180px;">Disposition / Service</th>'
      + '<th>Cases</th>'
      + '<th>Expected</th>'
      + '<th>Billed</th>'
      + '<th>Capture Rate</th>'
      + '<th>Revenue</th>'
      + '<th>Est. Missed</th>'
      + '</tr>';

    var html = '';
    var dispOrder = ['Delivered to Auction', 'Delivered to Client', 'Delivered to Customer', 'Released to Transporter', 'Redeemed', 'Stored'];

    dispOrder.forEach(function(disp) {
      var group = dispMap[disp];
      if (!group || group.count === 0) return;

      // Compute disposition-level totals
      var dExpected = 0, dBilled = 0, dRevenue = 0, dMissed = 0;
      var svcBreakdown = {};
      services.forEach(function(s) { svcBreakdown[s.key] = { expected: 0, billed: 0, revenue: 0, missed: 0 }; });

      group.recs.forEach(function(r) {
        services.forEach(function(s) {
          var expected = lc_isServiceExpected(s, r);
          var billed = lc_wasBilled(s, r);
          if (expected) {
            dExpected++;
            svcBreakdown[s.key].expected++;
            if (billed) {
              dBilled++;
              svcBreakdown[s.key].billed++;
              svcBreakdown[s.key].revenue += (r.billed[s.key] || 0);
              dRevenue += (r.billed[s.key] || 0);
            } else {
              svcBreakdown[s.key].missed++;
              dMissed += s.avgFee;
            }
          } else if (billed) {
            svcBreakdown[s.key].revenue += (r.billed[s.key] || 0);
            dRevenue += (r.billed[s.key] || 0);
          }
        });
      });

      var dPct = dExpected > 0 ? Math.round((dBilled / dExpected) * 100) : 0;
      var isCollapsed = lcCollapsed[disp];

      html += '<tr class="lc-disp-header' + (isCollapsed ? ' collapsed' : '') + '" data-disp="' + disp + '">'
        + '<td><span class="lc-toggle-icon">\u25BC</span>' + disp + '</td>'
        + '<td>' + group.count + '</td>'
        + '<td>' + dExpected + '</td>'
        + '<td>' + dBilled + '</td>'
        + '<td><span class="lc-pct ' + lc_pctClass(dPct) + '">' + dPct + '%</span>'
        + '<div class="lc-capture-bar-wrap"><div class="lc-capture-bar ' + lc_pctClass(dPct) + '" style="width:' + dPct + '%;"></div></div></td>'
        + '<td>' + lc_fmt(dRevenue) + '</td>'
        + '<td style="color:#ef4444;font-weight:600;">' + (dMissed > 0 ? lc_fmt(dMissed) : '\u2014') + '</td>'
        + '</tr>';

      // Service rows
      if (!isCollapsed) {
        services.forEach(function(s) {
          var sb = svcBreakdown[s.key];
          if (sb.expected === 0 && sb.revenue === 0) return; // skip services with no relevance to this disposition
          var sPct = sb.expected > 0 ? Math.round((sb.billed / sb.expected) * 100) : 0;
          var isMissed = sb.missed > 0;
          html += '<tr class="lc-svc-row' + (isMissed ? ' lc-svc-missed' : '') + '">'
            + '<td>' + s.label + '</td>'
            + '<td>\u2014</td>'
            + '<td>' + sb.expected + '</td>'
            + '<td>' + sb.billed + '</td>'
            + '<td><span class="lc-pct ' + lc_pctClass(sPct) + '">' + (sb.expected > 0 ? sPct + '%' : '\u2014') + '</span>'
            + (sb.expected > 0 ? '<div class="lc-capture-bar-wrap"><div class="lc-capture-bar ' + lc_pctClass(sPct) + '" style="width:' + sPct + '%;"></div></div>' : '')
            + '</td>'
            + '<td>' + (sb.revenue > 0 ? lc_fmt(sb.revenue) : '\u2014') + '</td>'
            + '<td>' + (sb.missed > 0 ? lc_fmt(sb.missed * s.avgFee) + '</td>' : '\u2014</td>')
            + '</tr>';
        });
      }
    });

    tbody.innerHTML = html;
  }

  function lc_renderByService(thead, tbody, svcStats, services, totalRecs) {
    thead.innerHTML = '<tr>'
      + '<th style="min-width:180px;">Service</th>'
      + '<th>Layer</th>'
      + '<th>Expected</th>'
      + '<th>Billed</th>'
      + '<th>Capture Rate</th>'
      + '<th>Revenue</th>'
      + '<th>Est. Missed</th>'
      + '</tr>';

    var html = '';
    services.forEach(function(s) {
      var st = svcStats[s.key];
      if (st.expected === 0 && st.revenue === 0) return;
      var pct = st.expected > 0 ? Math.round((st.billed / st.expected) * 100) : 0;
      var isMissed = st.missed > 0;
      var layer = LC_REPO_SERVICES.indexOf(s) > -1 ? 'Recovery' : (LC_PRE_RECOVERY_SERVICES.indexOf(s) > -1 ? 'Pre-Recovery' : 'Post-Recovery');
      html += '<tr class="lc-svc-view-row' + (isMissed ? ' lc-svc-missed' : '') + '">'
        + '<td>' + s.label + '</td>'
        + '<td><span style="font-size:10px;padding:2px 7px;border-radius:4px;background:' + (layer === 'Recovery' ? 'rgba(79,110,247,0.10);color:#4f6ef7' : layer === 'Pre-Recovery' ? 'rgba(234,179,8,0.12);color:#ca8a04' : 'rgba(16,163,74,0.10);color:#16a34a') + ';">' + layer + '</span></td>'
        + '<td>' + st.expected + '</td>'
        + '<td>' + st.billed + '</td>'
        + '<td><span class="lc-pct ' + lc_pctClass(pct) + '">' + (st.expected > 0 ? pct + '%' : '\u2014') + '</span>'
        + (st.expected > 0 ? '<div class="lc-capture-bar-wrap"><div class="lc-capture-bar ' + lc_pctClass(pct) + '" style="width:' + pct + '%;"></div></div>' : '')
        + '</td>'
        + '<td>' + (st.revenue > 0 ? lc_fmt(st.revenue) : '\u2014') + '</td>'
        + '<td style="color:#ef4444;font-weight:600;">' + (st.missed > 0 ? lc_fmt(st.missed * s.avgFee) : '\u2014') + '</td>'
        + '</tr>';
    });

    tbody.innerHTML = html;
  }

  // ── Life Cycle: Event Handlers ──
  (function() {
    // View toggle
    var viewPills = document.getElementById('lc_viewPills');
    if (viewPills) viewPills.addEventListener('click', function(e) {
      var pill = e.target.closest('.pill');
      if (!pill || !pill.dataset.view) return;
      viewPills.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      lcView = pill.dataset.view;
      lc_render();
    });

    // Layer toggle
    var layerPills = document.getElementById('lc_layerPills');
    if (layerPills) layerPills.addEventListener('click', function(e) {
      var pill = e.target.closest('.pill');
      if (!pill || !pill.dataset.layer) return;
      layerPills.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      lcLayer = pill.dataset.layer;
      lc_render();
    });

    // Type filter
    var typePills = document.getElementById('lc_typePills');
    if (typePills) typePills.addEventListener('click', function(e) {
      var pill = e.target.closest('.pill');
      if (!pill || !pill.dataset.jtype) return;
      typePills.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      lcTypeFilter = pill.dataset.jtype;
      lc_render();
    });

    // Disposition row expand/collapse
    document.addEventListener('click', function(e) {
      var header = e.target.closest('.lc-disp-header');
      if (!header) return;
      var disp = header.dataset.disp;
      lcCollapsed[disp] = !lcCollapsed[disp];
      lc_render();
    });

    // Make sure tab switching renders LC when it becomes active
    var tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
    tabBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (btn.dataset.tab === 'lc') {
          setTimeout(lc_render, 10);
        }
      });
    });
  })();

  // Initial render (deferred until tab is visible)
  // lc_render() will be called when the tab is first activated

  // ═══════════════════════════════════════════════════════════════════════════
  // ██  AMPD SIGNAL ENGINE
  // ═══════════════════════════════════════════════════════════════════════════
  (function() {
    var beacon    = document.getElementById('signalBeaconBtn');
    var dot       = document.getElementById('signalBeaconDot');
    var countBadge = document.getElementById('signalCountBadge');
    var overlay = document.getElementById('signalOverlay');
    var panel   = document.getElementById('signalPanel');
    var closeBtn = document.getElementById('signalPanelClose');
    var body    = document.getElementById('signalPanelBody');
    var ts      = document.getElementById('signalTimestamp');
    if (!beacon || !overlay) return;

    var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // ── Mobile: seed the panel off-screen using inline styles.
    // We own ALL transforms from JS so CSS can never interfere (no !important clash).
    if (isTouchDevice) {
      panel.style.transition = 'none';
      panel.style.transform = 'translateY(110%)';
      panel.getBoundingClientRect(); // force a layout commit before any transition fires
    }

    function openPanel() {
      if (isTouchDevice) {
        // window.innerHeight = actual visible height on iOS — vh units are NOT reliable
        panel.style.maxHeight = Math.round(window.innerHeight * 0.91) + 'px';
        panel.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
        panel.style.transform = 'translateY(0)';
        // Do NOT add .open class on mobile — desktop's .open CSS has a conflicting transform
      } else {
        panel.classList.add('open');
      }
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closePanel() {
      if (isTouchDevice) {
        panel.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
        panel.style.transform = 'translateY(110%)';
        // Clear max-height after animation finishes
        setTimeout(function() { panel.style.maxHeight = ''; }, 360);
      } else {
        panel.classList.remove('open');
      }
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      dot.classList.remove('pulse');
    }

    closeBtn.addEventListener('click', closePanel);
    // Desktop only: backdrop click to close
    if (!isTouchDevice) {
      overlay.addEventListener('click', closePanel);
    }

    // ── Swipe-down to dismiss (mobile bottom sheet) ──
    if (isTouchDevice) {
      var swipeStartY = 0;
      var swipeCurrent = 0;
      var isSwiping = false;

      panel.addEventListener('touchstart', function(e) {
        // Only initiate swipe from the banner/handle area
        var banner = panel.querySelector('.signal-panel-banner');
        if (!banner) return;
        var touch = e.touches[0];
        var bannerRect = banner.getBoundingClientRect();
        if (touch.clientY > bannerRect.bottom + 10) return; // not from banner
        swipeStartY = touch.clientY;
        swipeCurrent = 0;
        isSwiping = true;
        panel.style.transition = 'none';
      }, { passive: true });

      panel.addEventListener('touchmove', function(e) {
        if (!isSwiping) return;
        var dy = e.touches[0].clientY - swipeStartY;
        if (dy < 0) dy = 0; // no upward swipe
        swipeCurrent = dy;
        panel.style.transform = 'translateY(' + dy + 'px)';
      }, { passive: true });

      panel.addEventListener('touchend', function() {
        if (!isSwiping) return;
        isSwiping = false;
        if (swipeCurrent > 100) {
          closePanel();
        } else {
          // Snap back to open position with animation
          panel.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
          panel.style.transform = 'translateY(0)';
        }
      });
    }

    // ── Signal Generator ──
    function generateSignals() {
      var signals = [];

      // ── Pull from Life Cycle data ──
      var storedRecs = LC_MOCK.recoveries.filter(function(r) { return r.disposition === 'Stored'; });
      var storedUnbilled = storedRecs.filter(function(r) {
        return (r.keysObtained && !r.billed.keys) ||
               (r.heldDays > 0 && !r.billed.storage) ||
               (r.ppReleased && !r.billed.personalProp);
      });
      if (storedUnbilled.length > 0) {
        var estMissed = storedUnbilled.reduce(function(sum, r) {
          var m = 0;
          if (r.keysObtained && !r.billed.keys) m += 45;
          if (r.heldDays > 0 && !r.billed.storage) m += 120;
          if (r.ppReleased && !r.billed.personalProp) m += 35;
          return sum + m;
        }, 0);
        signals.push({
          tier: 'red',
          icon: 'warning',
          title: storedUnbilled.length + ' Stored Vehicle' + (storedUnbilled.length > 1 ? 's' : '') + ' Have Unbilled Services',
          body: 'Vehicles sitting on your lot have services performed but not yet invoiced — including keys, storage, and personal property fees. Every day this goes unbilled is money at risk.',
          action: 'Review Stored cases in Life Cycle tab'
        });
      }

      // Long-stored vehicle check
      var longStored = storedRecs.filter(function(r) { return r.heldDays > 20; });
      if (longStored.length > 0) {
        signals.push({
          tier: 'red',
          icon: 'schedule',
          title: longStored.length + ' Vehicle' + (longStored.length > 1 ? 's' : '') + ' Stored Over 20 Days',
          body: 'Cases sitting this long without a disposition are a liability. Storage is accumulating, lot space is occupied, and the lifecycle is stalled. These need immediate follow-up with the lienholder.',
          action: 'Follow up on disposition status'
        });
      }

      // ── Life Cycle capture rate check ──
      var services = lc_getServices();
      var totalExpected = 0, totalCaptured = 0;
      LC_MOCK.recoveries.forEach(function(r) {
        services.forEach(function(s) {
          if (lc_isServiceExpected(s, r)) {
            totalExpected++;
            if (lc_wasBilled(s, r)) totalCaptured++;
          }
        });
      });
      var captureRate = totalExpected > 0 ? Math.round((totalCaptured / totalExpected) * 100) : 0;
      if (captureRate < 70) {
        signals.push({
          tier: 'red',
          icon: 'trending_down',
          title: 'Overall Capture Rate is ' + captureRate + '%',
          body: 'Your service capture rate is below 70% this month — meaning nearly 1 in 3 billable services are going uninvoiced. This is based on what was realistically billable for each vehicle\'s actual outcome, not a theoretical maximum.',
          action: 'Drill into Life Cycle \u2192 By Service'
        });
      } else if (captureRate < 85) {
        signals.push({
          tier: 'yellow',
          icon: 'trending_flat',
          title: 'Capture Rate at ' + captureRate + '% — Room to Improve',
          body: 'You\'re capturing most billable services but leaving some revenue on the table. Check the Life Cycle tab to see which specific services and dispositions are dragging the rate down.',
          action: 'Review Life Cycle \u2192 By Disposition'
        });
      } else {
        signals.push({
          tier: 'green',
          icon: 'check_circle',
          title: 'Strong Service Capture Rate: ' + captureRate + '%',
          body: 'You\'re billing nearly everything that\'s realistically billable given your vehicle outcomes this month. Keep it up.',
          action: null
        });
      }

      // ── LH: Collection rate check ──
      var lhNames = Object.keys(LH_ALIASES);
      var slowPayers = [];
      lhNames.forEach(function(lh) {
        var clients = LH_ALIASES[lh];
        var totalBilled = 0, totalCollected = 0;
        Object.keys(clients).forEach(function(c) {
          clients[c].forEach(function(a) {
            totalBilled += a.billed;
            totalCollected += a.collected;
          });
        });
        var collPct = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 100;
        if (collPct < 70) slowPayers.push({ name: lh, pct: collPct, balance: totalBilled - totalCollected });
      });
      if (slowPayers.length > 0) {
        slowPayers.sort(function(a, b) { return a.pct - b.pct; });
        var worst = slowPayers[0];
        signals.push({
          tier: 'red',
          icon: 'payments',
          title: worst.name + ' Collection Rate at ' + worst.pct + '%',
          body: '$' + worst.balance.toLocaleString() + ' in outstanding invoices. ' + (slowPayers.length > 1 ? (slowPayers.length - 1) + ' other lienholder' + (slowPayers.length > 2 ? 's' : '') + ' also below 70% collection.' : 'This lienholder is your biggest AR risk this month.'),
          action: 'Review in Client / Lienholder Health'
        });
      }

      // ── LH: High balance check ──
      var highBalance = [];
      lhNames.forEach(function(lh) {
        var clients = LH_ALIASES[lh];
        var totalBalance = 0;
        Object.keys(clients).forEach(function(c) {
          clients[c].forEach(function(a) { totalBalance += a.balance; });
        });
        if (totalBalance > 3000) highBalance.push({ name: lh, balance: totalBalance });
      });
      if (highBalance.length > 0) {
        highBalance.sort(function(a, b) { return b.balance - a.balance; });
        var topBalance = highBalance[0];
        signals.push({
          tier: 'yellow',
          icon: 'account_balance_wallet',
          title: topBalance.name + ' Has $' + topBalance.balance.toLocaleString() + ' Outstanding',
          body: highBalance.length === 1
            ? 'This is your largest single AR balance this month. If it\'s aging past 30 days, it\'s time to follow up.'
            : highBalance.length + ' lienholders are carrying balances over $3,000. Review payment timelines and follow up on aging invoices.',
          action: 'Check Balance Owed column in LH Health'
        });
      }

      // ── LH: Recovery rate check ──
      var lowRecovery = [];
      lhNames.forEach(function(lh) {
        var clients = LH_ALIASES[lh];
        var totalAssigned = 0, totalRecovered = 0;
        Object.keys(clients).forEach(function(c) {
          clients[c].forEach(function(a) {
            totalAssigned += a.assigned;
            totalRecovered += a.recovered;
          });
        });
        var rate = totalAssigned > 5 ? Math.round((totalRecovered / totalAssigned) * 100) : null;
        if (rate !== null && rate < 60) lowRecovery.push({ name: lh, rate: rate, assigned: totalAssigned });
      });
      if (lowRecovery.length > 0) {
        lowRecovery.sort(function(a, b) { return a.rate - b.rate; });
        signals.push({
          tier: 'yellow',
          icon: 'car_crash',
          title: lowRecovery[0].name + ' Recovery Rate at ' + lowRecovery[0].rate + '%',
          body: 'Recovery rate below 60% with ' + lowRecovery[0].assigned + ' cases assigned suggests either difficult inventory, aging cases, or cases that need a status review. Consider a close rate audit.',
          action: 'Review in Client / Lienholder Health'
        });
      }

      // ── Positive: high collection ──
      var topCollectors = [];
      lhNames.forEach(function(lh) {
        var clients = LH_ALIASES[lh];
        var totalBilled = 0, totalCollected = 0;
        Object.keys(clients).forEach(function(c) {
          clients[c].forEach(function(a) {
            totalBilled += a.billed;
            totalCollected += a.collected;
          });
        });
        var pct = totalBilled > 1000 ? Math.round((totalCollected / totalBilled) * 100) : 0;
        if (pct >= 90) topCollectors.push({ name: lh, pct: pct });
      });
      if (topCollectors.length > 0) {
        topCollectors.sort(function(a, b) { return b.pct - a.pct; });
        signals.push({
          tier: 'green',
          icon: 'star',
          title: topCollectors[0].name + ' Collecting at ' + topCollectors[0].pct + '%',
          body: topCollectors.length === 1
            ? 'Excellent collection performance from this lienholder. Payments are coming in clean and on time.'
            : topCollectors.length + ' lienholders are collecting at 90% or better this month. Strong payment relationships.',
          action: null
        });
      }

      // ── Transport missed on delivered vehicles ──
      var transportMissed = LC_MOCK.recoveries.filter(function(r) {
        return r.delivered && !r.billed.transport;
      });
      if (transportMissed.length > 0) {
        signals.push({
          tier: 'yellow',
          icon: 'local_shipping',
          title: transportMissed.length + ' Delivered Vehicle' + (transportMissed.length > 1 ? 's' : '') + ' Missing Transport Fee',
          body: 'You delivered ' + (transportMissed.length > 1 ? 'these vehicles' : 'this vehicle') + ' but no transport or delivery fee was invoiced. If the agent performed the delivery, this is billable revenue being left behind.',
          action: 'Review Life Cycle \u2192 By Disposition'
        });
      }

      return signals;
    }

    // ── Render Signal Panel ──
    function renderSignals() {
      var signals = generateSignals();
      var urgent = signals.filter(function(s) { return s.tier === 'red'; });
      var watch  = signals.filter(function(s) { return s.tier === 'yellow'; });
      var good   = signals.filter(function(s) { return s.tier === 'green'; });

      // Update count badge (red + yellow = actionable)
      var actionable = urgent.length + watch.length;
      if (countBadge) {
        if (actionable > 0) {
          countBadge.textContent = actionable + ' to review';
          countBadge.style.display = '';
        } else {
          countBadge.style.display = 'none';
        }
      }

      var now = new Date();
      var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      ts.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ' \u2014 ' + urgent.length + ' item' + (urgent.length !== 1 ? 's' : '') + ' need' + (urgent.length === 1 ? 's' : '') + ' attention';

      function renderSection(label, cls, items) {
        if (items.length === 0) return '';
        var html = '<div class="signal-section">';
        html += '<div class="signal-section-label ' + cls + '"><span class="signal-section-dot ' + cls + '"></span>' + label + '</div>';
        items.forEach(function(sig) {
          html += '<div class="signal-item ' + cls + '">';
          html += '<div class="signal-item-head">';
          html += '<span class="mat-icon signal-item-icon ' + cls + '">' + sig.icon + '</span>';
          html += '<span class="signal-item-title">' + sig.title + '</span>';
          html += '</div>';
          html += '<div class="signal-item-body">' + sig.body + '</div>';
          if (sig.action) {
            html += '<span class="signal-item-action ' + cls + '">\u2192 ' + sig.action + '</span>';
          }
          html += '</div>';
        });
        html += '</div>';
        return html;
      }

      var html = '';
      html += renderSection('Needs Attention', 'red', urgent);
      html += renderSection('On Your Radar', 'yellow', watch);
      html += renderSection('All Clear', 'green', good);
      if (!html) html = '<div class="signal-empty">No signals found. Check back when more data is available.</div>';

      body.innerHTML = html;
    }

    // ── Mobile filter bar: pin exactly below header ──
    (function() {
      var header = document.querySelector('.dash-header');
      var filterBar = document.getElementById('locFilterBar');
      var pageBody = document.querySelector('.page-body');
      function pinFilterBar() {
        if (window.innerWidth > 767) return;
        var hh = header ? header.getBoundingClientRect().height : 60;
        if (filterBar) filterBar.style.top = hh + 'px';
        var fbh = filterBar ? filterBar.getBoundingClientRect().height : 38;
        if (pageBody) pageBody.style.paddingTop = (14 + fbh) + 'px';
      }
      pinFilterBar();
      window.addEventListener('resize', pinFilterBar);
    })();

    // Auto-open on load — direct setTimeout since script is at bottom of body
    setTimeout(function() {
      renderSignals();
      openPanel();
    }, 800);

    // Re-render each time beacon or count badge is clicked
    if (countBadge) {
      countBadge.addEventListener('click', function() { renderSignals(); openPanel(); });
    }
    beacon.addEventListener('click', function() { renderSignals(); openPanel(); });
  })();

  // ── Global Smart Tooltip System ──
  // Replaces all CSS-only tooltips with a single positioned element
  (function() {
    // Create the tooltip container once
    var tip = document.createElement('div');
    tip.className = 'g-tooltip';
    tip.style.cssText = 'display:none;position:fixed;z-index:99999;background:#1a1a2e;color:#fff;font-size:11px;font-weight:400;padding:8px 11px;border-radius:7px;line-height:1.45;max-width:260px;width:max-content;box-shadow:0 4px 14px rgba(0,0,0,0.22);pointer-events:none;transition:opacity 0.12s;opacity:0;';
    document.body.appendChild(tip);

    var showTimer = null;
    var hideTimer = null;
    var activeTarget = null;

    function positionTip(anchor) {
      var r = anchor.getBoundingClientRect();
      var tw = tip.offsetWidth;
      var th = tip.offsetHeight;
      var pad = 8;
      var gap = 8;

      // Try below the icon first
      var top = r.bottom + gap;
      var left = r.left + (r.width / 2) - (tw / 2);

      // If it goes off bottom, show above
      if (top + th > window.innerHeight - pad) {
        top = r.top - th - gap;
      }
      // If it goes off top, force below
      if (top < pad) {
        top = r.bottom + gap;
      }
      // Keep within horizontal bounds
      if (left < pad) left = pad;
      if (left + tw > window.innerWidth - pad) left = window.innerWidth - tw - pad;

      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
    }

    function showTip(anchor, text) {
      clearTimeout(hideTimer);
      if (activeTarget === anchor) return;
      activeTarget = anchor;
      tip.textContent = text;
      tip.style.display = 'block';
      // Force layout so we can measure
      tip.offsetHeight;
      positionTip(anchor);
      tip.style.opacity = '1';
    }

    function hideTip() {
      activeTarget = null;
      tip.style.opacity = '0';
      hideTimer = setTimeout(function() { tip.style.display = 'none'; }, 120);
    }

    // Map of trigger selectors → tooltip child selectors
    var tipMap = [
      { trigger: '.info-icon',      findWrap: '.th-wrap',        findTip: '.th-tip' },
      { trigger: '.adv-info-icon',  findWrap: '.adv-info-wrap',  findTip: '.adv-info-tooltip' },
      { trigger: '.avg-tip-wrap',   findWrap: null,              findTip: '.avg-tooltip' },
      { trigger: '.eq-tip-wrap',    findWrap: null,              findTip: '.eq-tooltip' },
      { trigger: '.task-info-wrap', findWrap: null,              findTip: '.task-info-tip' },
      { trigger: '.badge-wrap',     findWrap: null,              findTip: '.tooltip' }
    ];

    function findTrigger(el) {
      if (!el || !el.closest) return null;
      for (var i = 0; i < tipMap.length; i++) {
        var m = tipMap[i];
        var triggerEl = el.closest(m.trigger);
        if (triggerEl) {
          var wrap = m.findWrap ? triggerEl.closest(m.findWrap) : triggerEl;
          if (!wrap) continue;
          var tipEl = wrap.querySelector(m.findTip);
          if (!tipEl) continue;
          return { anchor: triggerEl, text: tipEl.textContent.trim() };
        }
      }
      return null;
    }

    document.addEventListener('mouseenter', function(e) {
      var match = findTrigger(e.target);
      if (match) {
        clearTimeout(hideTimer);
        showTimer = setTimeout(function() { showTip(match.anchor, match.text); }, 180);
      }
    }, true);

    document.addEventListener('mouseleave', function(e) {
      var match = findTrigger(e.target);
      if (match) {
        clearTimeout(showTimer);
        hideTip();
      }
    }, true);

    // Hide on scroll or resize
    window.addEventListener('scroll', function() { clearTimeout(showTimer); hideTip(); }, true);
    window.addEventListener('resize', function() { clearTimeout(showTimer); hideTip(); });

    // Dark theme support
    var observer = new MutationObserver(function() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      tip.style.background = isDark ? '#0d1117' : '#1a1a2e';
      tip.style.border = isDark ? '1px solid rgba(255,255,255,0.1)' : 'none';
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  })();

  // ── View Settings (Card Visibility) ──
  (function() {
    const btn = document.getElementById('viewSettingsBtn');
    const pop = document.getElementById('viewSettingsPop');
    if (!btn || !pop) return;

    const STORAGE_KEY = 'ampd_hidden_cards';
    const HIDDEN_CLASS_MAP = {
      'pendingCard': 'card-hidden',
      'equipmentCard': 'card-hidden',
      'paymentsCard': 'card-hidden',
      'tableCard': 'table-section-hidden'
    };

    function getHidden() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch(e) { return []; }
    }

    function saveHidden(arr) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch(e) {}
    }

    // Restore saved visibility on load
    const hidden = getHidden();
    hidden.forEach(function(cardId) {
      const card = document.getElementById(cardId);
      const toggle = pop.querySelector('.view-toggle[data-target="' + cardId + '"]');
      if (card) card.classList.add(HIDDEN_CLASS_MAP[cardId] || 'card-hidden');
      if (toggle) toggle.classList.remove('on');
    });

    // Toggle popover
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const isOpen = pop.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close on outside click
    document.addEventListener('click', function(e) {
      if (!pop.contains(e.target) && e.target !== btn) {
        pop.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    // Toggle switches
    pop.querySelectorAll('.view-toggle').forEach(function(toggle) {
      toggle.addEventListener('click', function(e) {
        e.stopPropagation();
        const cardId = toggle.dataset.target;
        const card = document.getElementById(cardId);
        if (!card) return;

        const isOn = toggle.classList.toggle('on');
        const hiddenCls = HIDDEN_CLASS_MAP[cardId] || 'card-hidden';

        if (isOn) {
          card.classList.remove(hiddenCls);
          const arr = getHidden().filter(function(id) { return id !== cardId; });
          saveHidden(arr);
        } else {
          card.classList.add(hiddenCls);
          const arr = getHidden();
          if (arr.indexOf(cardId) === -1) arr.push(cardId);
          saveHidden(arr);
        }
      });
    });
  })();

  } // end isDashboard guard

})(); // end main IIFE

// ── Create Invoice Modal ────────────────────────────────────────────────────────
function openCreateInvoiceModal() {
  // Read case context from open drawer
  var caseClient = (document.getElementById('drawerClient') || {}).textContent || '—';
  var existing = document.getElementById('ciBackdrop');
  if (existing) existing.remove();

  var backdrop = document.createElement('div');
  backdrop.className = 'ci-backdrop';
  backdrop.id = 'ciBackdrop';
  backdrop.innerHTML =
    '<div class="ci-modal" role="dialog" aria-modal="true" aria-labelledby="ciTitle">' +
      '<div class="ci-header">' +
        '<h2 id="ciTitle">Create Invoice</h2>' +
      '</div>' +
      '<div class="ci-body">' +
        '<div class="ci-field">' +
          '<label class="ci-label">Case Client</label>' +
          '<div class="ci-input-wrap">' +
            '<input class="ci-input" id="ciCaseClient" type="text" value="' + caseClient + '" readonly>' +
          '</div>' +
        '</div>' +
        '<div class="ci-field">' +
          '<label class="ci-label">Bill To Client <span class="req">*</span> <span class="ci-label-note">**</span></label>' +
          '<div class="ci-input-wrap">' +
            '<input class="ci-input" id="ciBillToClient" type="text" placeholder="' + caseClient + '">' +
            '<span class="material-symbols-outlined ci-icon">account_balance</span>' +
          '</div>' +
          '<span class="ci-hint">Defines service catalog and rates</span>' +
        '</div>' +
        '<div class="ci-field">' +
          '<label class="ci-label">Service (from Bill To Client) <span class="req">*</span></label>' +
          '<div class="ci-input-wrap">' +
            '<select class="ci-select" id="ciService" onchange="ciRecalc()">' +
              '<option value="">— Select service —</option>' +
              '<option value="Repossession Fee">Repossession Fee</option>' +
              '<option value="Keys Obtained">Keys Obtained</option>' +
              '<option value="Storage Fee">Storage Fee</option>' +
              '<option value="Transport Fee">Transport Fee</option>' +
              '<option value="Close Fee">Close Fee</option>' +
              '<option value="Personal Property">Personal Property</option>' +
              '<option value="Skip Trace">Skip Trace</option>' +
              '<option value="Impound Release">Impound Release</option>' +
              '<option value="Long Distance Transport">Long Distance Transport</option>' +
            '</select>' +
            '<span class="material-symbols-outlined ci-icon">build</span>' +
          '</div>' +
          '<span class="ci-hint">Services are based on the selected Bill To Client</span>' +
        '</div>' +
        '<div class="ci-row">' +
          '<div class="ci-field">' +
            '<label class="ci-label">Quantity <span class="req">*</span></label>' +
            '<input class="ci-input" id="ciQty" type="number" min="1" value="1" oninput="ciRecalc()">' +
          '</div>' +
          '<div class="ci-field">' +
            '<label class="ci-label">Rate <span class="req">*</span></label>' +
            '<input class="ci-input" id="ciRate" type="number" min="0" step="0.01" placeholder="0.00" oninput="ciRecalc()">' +
          '</div>' +
        '</div>' +
        '<div class="ci-field">' +
          '<label class="ci-label">Tax Rate (%)</label>' +
          '<input class="ci-input" id="ciTaxRate" type="number" min="0" step="0.01" placeholder="0" oninput="ciRecalc()">' +
        '</div>' +
        '<div class="ci-field ci-total-field">' +
          '<label class="ci-label">Total</label>' +
          '<input class="ci-input" id="ciTotal" type="text" value="$0.00" readonly>' +
        '</div>' +
        '<div class="ci-field">' +
          '<label class="ci-label">Notes <span class="ci-label-note">(pushed to RDN invoice notes)</span></label>' +
          '<textarea class="ci-input ci-textarea" id="ciNotes" rows="3" placeholder="Optional notes…"></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="ci-footer">' +
        '<button class="ci-btn-cancel" onclick="closeCreateInvoiceModal()">Cancel</button>' +
        '<button class="ci-btn-create" id="ciBtnCreate" disabled onclick="submitCreateInvoice()">Create</button>' +
      '</div>' +
    '</div>';

  // Close on backdrop click (not modal card)
  backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop) closeCreateInvoiceModal();
  });
  document.body.appendChild(backdrop);

  // Pre-fill Bill To Client with Case Client value
  var billTo = document.getElementById('ciBillToClient');
  if (billTo) billTo.value = caseClient !== '—' ? caseClient : '';

  ciRecalc();
  setTimeout(function() {
    var f = document.getElementById('ciBillToClient');
    if (f) f.focus();
  }, 50);
}

function closeCreateInvoiceModal() {
  var el = document.getElementById('ciBackdrop');
  if (el) el.remove();
}

function ciRecalc() {
  var qty    = parseFloat(document.getElementById('ciQty').value) || 0;
  var rate   = parseFloat(document.getElementById('ciRate').value) || 0;
  var tax    = parseFloat(document.getElementById('ciTaxRate').value) || 0;
  var sub    = qty * rate;
  var total  = sub + (sub * tax / 100);
  document.getElementById('ciTotal').value = '$' + total.toFixed(2);

  // Enable Create when required fields are filled
  var svc    = (document.getElementById('ciService').value || '').trim();
  var bill   = (document.getElementById('ciBillToClient').value || '').trim();
  var valid  = svc !== '' && bill !== '' && rate > 0 && qty > 0;
  document.getElementById('ciBtnCreate').disabled = !valid;
}

function submitCreateInvoice() {
  // Payload mirrors RDN invoice creation — notes field pushed to RDN invoice notes
  var payload = {
    billToClient: (document.getElementById('ciBillToClient').value || '').trim(),
    service:      document.getElementById('ciService').value,
    qty:          parseFloat(document.getElementById('ciQty').value) || 1,
    rate:         parseFloat(document.getElementById('ciRate').value) || 0,
    taxRate:      parseFloat(document.getElementById('ciTaxRate').value) || 0,
    total:        document.getElementById('ciTotal').value,
    notes:        (document.getElementById('ciNotes').value || '').trim()  // → RDN invoice notes
  };
  console.log('Create Invoice payload:', payload); // Stub — POST to AMPD API in production
  closeCreateInvoiceModal();
}

// ── Source logo swap — global so it runs on all pages ──────────────────────────
function swapTableSourceLogos(dark) {
  document.querySelectorAll('.tbl-src-logo').forEach(function(img) {
    img.src = dark ? 'img/ampd-logo-white-sm.png' : 'img/ampd-logo-sm.png';
  });
}
// Apply on initial load
(function() {
  var theme = 'light';
  try { theme = localStorage.getItem('ampd-theme') || 'light'; } catch(e) {}
  if (theme === 'dark') { swapTableSourceLogos(true); }
})();

// ── Inject period badge into every page-kpi-strip ──
(function() {
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function injectPeriodBadges() {
    var strips = document.querySelectorAll('.page-kpi-strip');
    if (!strips.length) return;
    var now = new Date();
    var label = MONTHS[now.getMonth()] + ' ' + now.getFullYear();
    strips.forEach(function(strip) {
      if (strip.querySelector('.page-kpi-period')) return; // already injected
      var badge = document.createElement('div');
      badge.className = 'page-kpi-period';
      badge.innerHTML =
        '<span class="mat-icon">calendar_today</span>' +
        '<span class="page-kpi-period-label">' + label + '</span>' +
        '<span class="page-kpi-period-dot">·</span>' +
        '<span class="page-kpi-period-range">Month to Date</span>';
      strip.insertBefore(badge, strip.firstChild);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPeriodBadges);
  } else {
    injectPeriodBadges();
  }
})();

// ── Mobile "More" bottom sheet ──
function mobMoreOpen() {
  if (document.getElementById('mobMoreSheet')) return;

  var MORE_ITEMS = [
    { page: 'rules',          icon: 'rule',            label: 'Rules',          href: 'rules.html' },
    { page: 'reconciliation', icon: 'account_balance', label: 'Reconcile',      href: 'reconciliation.html' },
    { page: 'clients',        icon: 'people',          label: 'Clients',        href: 'clients.html' },
    { page: 'notifications',  icon: 'notifications',   label: 'Notifications',  href: 'notifications.html' },
    { page: 'settings',       icon: 'settings',        label: 'Settings',       href: 'settings.html' },
  ];

  // Detect current "More" page for highlight
  var activePage = '';
  MORE_ITEMS.forEach(function(item) {
    if (document.getElementById('page-' + item.page)) activePage = item.page;
  });

  var itemsHTML = MORE_ITEMS.map(function(item) {
    var cls = 'mob-more-item' + (item.page === activePage ? ' active' : '');
    return '<div class="' + cls + '" onclick="window.location.href=\'' + item.href + '\'">' +
      '<span class="mat-icon">' + item.icon + '</span>' +
      '<span class="mob-more-item-label">' + item.label + '</span>' +
      '</div>';
  }).join('');

  var backdrop = document.createElement('div');
  backdrop.className = 'mob-more-backdrop';
  backdrop.id = 'mobMoreBackdrop';
  backdrop.onclick = mobMoreClose;

  var sheet = document.createElement('div');
  sheet.className = 'mob-more-sheet';
  sheet.id = 'mobMoreSheet';
  sheet.innerHTML =
    '<div class="mob-more-handle"></div>' +
    '<div class="mob-more-title">More</div>' +
    '<div class="mob-more-grid">' + itemsHTML + '</div>';

  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      backdrop.classList.add('open');
      sheet.classList.add('open');
    });
  });
}

function mobMoreClose() {
  var backdrop = document.getElementById('mobMoreBackdrop');
  var sheet    = document.getElementById('mobMoreSheet');
  if (!backdrop || !sheet) return;
  backdrop.classList.remove('open');
  sheet.classList.remove('open');
  setTimeout(function() {
    if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    if (sheet.parentNode)    sheet.parentNode.removeChild(sheet);
  }, 300);
}

// ── Global utilities (called from inline onclick/oninput throughout all pages) ──

function switchNotifTab(btn, tabId) {
  document.querySelectorAll('.notif-tab').forEach(function(t) {
    t.style.color = '#9ca3af';
    t.style.borderBottomColor = 'transparent';
  });
  btn.style.color = '#4f6ef7';
  btn.style.borderBottomColor = '#4f6ef7';
  document.querySelectorAll('.notif-tab-content').forEach(function(c) { c.style.display = 'none'; });
  var el = document.getElementById('notif-' + tabId);
  if (el) el.style.display = 'block';
}

function filterTableRows(tbodyId, query) {
  var tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  var q = query.trim().toLowerCase();
  tbody.querySelectorAll('tr').forEach(function(row) {
    var text = row.textContent.toLowerCase();
    var dataText = '';
    for (var key in row.dataset) { dataText += ' ' + row.dataset[key]; }
    row.style.display = (!q || text.indexOf(q) !== -1 || dataText.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
  });
}

function sortTable(tbodyId, th) {
  var tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  var col  = parseInt(th.dataset.col);
  var type = th.dataset.type || 'text';
  var thead = th.closest('thead');
  var asc = th.classList.contains('sort-desc') ? true : !th.classList.contains('sort-asc');
  thead.querySelectorAll('th[data-col]').forEach(function(t) { t.classList.remove('sort-asc', 'sort-desc'); });
  th.classList.add(asc ? 'sort-asc' : 'sort-desc');
  var rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort(function(a, b) {
    var aVal = (a.cells[col] ? a.cells[col].textContent.trim() : '');
    var bVal = (b.cells[col] ? b.cells[col].textContent.trim() : '');
    if (type === 'num') {
      return asc ? (parseFloat(aVal.replace(/[^0-9.-]/g,''))||0) - (parseFloat(bVal.replace(/[^0-9.-]/g,''))||0)
                 : (parseFloat(bVal.replace(/[^0-9.-]/g,''))||0) - (parseFloat(aVal.replace(/[^0-9.-]/g,''))||0);
    }
    if (type === 'date') {
      var aD = new Date(aVal)||0, bD = new Date(bVal)||0;
      return asc ? aD - bD : bD - aD;
    }
    if (aVal === '—' && bVal !== '—') return 1;
    if (bVal === '—' && aVal !== '—') return -1;
    return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });
  rows.forEach(function(r) { tbody.appendChild(r); });
}

// ── Sidebar Navigation ──
  (function() {
    var sidebar = document.getElementById('appSidebar');
    var toggleBtn = document.getElementById('sbToggleBtn');
    var items = document.querySelectorAll('.sb-item[data-page]');
    var icon = toggleBtn.querySelector('.mat-icon');
    var label = toggleBtn.querySelector('.sb-toggle-label');
    var isCompact = false;

    function showPage(name) {
      // Multi-page site — navigation is handled by real href links
      // This stub exists so any legacy calls don't throw errors
      var map = {dashboard:'index.html',cases:'cases.html',invoices:'invoices.html',
        fees:'fees.html',rules:'rules.html',reconciliation:'reconciliation.html',
        clients:'clients.html',notifications:'notifications.html',settings:'settings.html'};
      if (map[name]) window.location.href = map[name];
    }

    items.forEach(function(item) {
      item.addEventListener('click', function() { showPage(item.dataset.page); });
    });

    toggleBtn.addEventListener('click', function() {
      isCompact = !isCompact;
      sidebar.classList.toggle('compact', isCompact);
      icon.textContent = isCompact ? 'chevron_right' : 'chevron_left';
      if (label) label.textContent = isCompact ? '' : 'Collapse';
    });

    // ── Compact sidebar nav tooltips ──
    (function() {
      var tip = document.createElement('div');
      tip.id = 'sb-tooltip';
      document.body.appendChild(tip);
      var hideTimer;
      document.querySelectorAll('.sb-item[data-tooltip]').forEach(function(el) {
        el.addEventListener('mouseenter', function() {
          if (!sidebar.classList.contains('compact')) return;
          clearTimeout(hideTimer);
          var r = el.getBoundingClientRect();
          tip.textContent = el.dataset.tooltip;
          tip.style.left = (r.right + 10) + 'px';
          tip.style.top = Math.round(r.top + r.height / 2) + 'px';
          tip.style.transform = 'translateY(-50%)';
          tip.classList.add('visible');
        });
        el.addEventListener('mouseleave', function() {
          hideTimer = setTimeout(function() { tip.classList.remove('visible'); }, 80);
        });
      });
    })();

    // Expose showPage globally so other code (e.g. drawer close, dashboard search) can call it
    window.showPage = showPage;

    // ── Hook showPage to also sync the mobile bottom nav ──
    var _origShowPage = window.showPage;
    window.showPage = function(pageId) {
      _origShowPage(pageId);
      // Sync mob-nav active state
      document.querySelectorAll('.mob-nav-item').forEach(function(item) {
        item.classList.toggle('active', item.dataset.page === pageId);
      });
      // Also sync sidebar sb-items (in case sidebar is visible on larger screens)
    };
  })();

  // ── Mobile bottom nav tap handler ──
  function mobNavGo(el) {
    var map = {dashboard:'index.html',cases:'cases.html',invoices:'invoices.html',
      fees:'fees.html',rules:'rules.html',reconciliation:'reconciliation.html',
      clients:'clients.html',notifications:'notifications.html',settings:'settings.html'};
    var page = el.dataset.page;
    if (page === 'more') { mobMoreOpen(); return; }
    if (map[page]) window.location.href = map[page];
  }

  // ── Mobile: auto-activate More button on "More" pages ──
  (function() {
    var morePages = ['rules','reconciliation','clients','notifications','settings'];
    var isMorePage = morePages.some(function(p) {
      return document.getElementById('page-' + p) !== null;
    });
    if (isMorePage) {
      var moreBtn = document.querySelector('.mob-nav-item[data-page="more"]');
      if (moreBtn) moreBtn.classList.add('active');
    }
  })();

  // ── Mobile: sync mob-nav to sidebar sb-item clicks ──
  document.querySelectorAll('.sb-item[data-page]').forEach(function(sbItem) {
    sbItem.addEventListener('click', function() {
      document.querySelectorAll('.mob-nav-item').forEach(function(m) {
        m.classList.toggle('active', m.dataset.page === sbItem.dataset.page);
      });
    });
  });

  // ── Mobile header logo: white on dark, dark on light — swaps with theme ──
  (function() {
    var mobLogo  = document.getElementById('mobHeaderLogo');
    var whiteSrc = (document.querySelector('.sb-logo img') || {}).src || '';
    var darkSrc  = (document.getElementById('mobHeaderLogoDarkSrc') || {}).src || '';

    function syncLogo() {
      if (!mobLogo) return;
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark'
                || document.body.getAttribute('data-theme') === 'dark';
      mobLogo.src = isDark ? whiteSrc : darkSrc;
    }

    syncLogo();

    // Re-sync after theme toggle settles
    var themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.addEventListener('click', function() {
      setTimeout(syncLogo, 50);
    });
  })();

  // ── Mobile: add data-label attributes to all table tds from thead ──
  (function() {
    document.querySelectorAll('.data-table').forEach(function(table) {
      var headers = Array.from(table.querySelectorAll('thead th')).map(function(th) {
        // Clone and strip mat-icon spans + sort arrows before reading text
        var clone = th.cloneNode(true);
        clone.querySelectorAll('.mat-icon, .sort-icon, svg').forEach(function(el) { el.remove(); });
        return clone.textContent.replace(/[▲▼↑↓⬆⬇]/g, '').trim();
      });
      table.querySelectorAll('tbody tr').forEach(function(tr) {
        Array.from(tr.querySelectorAll('td')).forEach(function(td, i) {
          if (headers[i]) td.setAttribute('data-label', headers[i]);
        });
      });
    });
  })();

  // ── Filter chip single-select helper ──
  function chipToggle(el) {
    var toolbar = el.closest('.dt-toolbar');
    if (!toolbar) return;
    toolbar.querySelectorAll('.dt-chip').forEach(function(c) { c.classList.remove('on'); });
    el.classList.add('on');
  }

  // ── Rule toggle switches ──
  document.querySelectorAll('.rule-card .view-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() { btn.classList.toggle('on'); });
  });

  // ── Settings notification toggles ──
  document.querySelectorAll('.settings-section .view-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() { btn.classList.toggle('on'); });
  });



  /* ============================================================
     CASE DRAWER — open / close / populate
     ============================================================ */
  (function() {

    /* ----------------------------------------------------------
       Mock case data keyed by case number
    ---------------------------------------------------------- */
    var MOCK_CASES = {
      'C-48819': {
        client: 'Coastal Recovery LLC', lienholder: 'Ally Financial',
        account: 'AF-99284711', condReport: 'Yes', photos: 'Yes',
        vin: '1HGBH41JXMN109186', year: '2021', make: 'Honda', model: 'Accord',
        driveType: 'FWD', keyType: 'Smart Key', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Repossessed',
        dates: { order: 'Jan 14, 2024', recovery: 'Feb 2, 2024', release: 'Feb 9, 2024' },
        daysRecover: 19, daysStored: 7,
        invoices: [
          { num: 'INV-001482', status: 'Paid', date: 'Feb 10, 2024', total: '$575.00', paid: true,
            rule: 'Repo + Storage Auto-Invoice',
            clientPayments: [
              { date: 'Feb 22, 2024', amount: '$575.00', meta: 'ACH — Capital One Auto Finance' }
            ],
            lineItems: [
              { name: 'Repossession Fee', amt: '$375.00', rate: '$375.00', qty: 1, tax: '0%', notes: '' },
              { name: 'Storage (7 days @ $20)', amt: '$140.00', rate: '$20.00', qty: 7, tax: '0%', notes: '' },
              { name: 'Administrative Fee', amt: '$60.00', rate: '$60.00', qty: 1, tax: '0%', notes: '' }
            ]
          }
        ],
        fees: [
          { type: 'Key Retrieval', status: 'Approved', date: 'Feb 3, 2024', amount: '$85.00',
            feeType: 'KEY_RETRIEVAL', approvedDate: 'Feb 5, 2024', bankCode: 'AF-KR', source: 'Key Retrieval Auto-Request' },
          { type: 'Long Distance Transport', status: 'Pending', date: 'Mar 6, 2025', amount: '$520.00',
            feeType: 'TRANSPORT', approvedDate: null, bankCode: null, source: 'Transport Fee Rule' }
        ]
      },
      'C-48815': {
        client: 'Metro Repo Services', lienholder: 'Capital One Auto',
        account: 'CO-44129876', condReport: 'Yes', photos: 'Yes',
        vin: '2T1BURHE0JC033742', year: '2019', make: 'Toyota', model: 'Corolla',
        driveType: 'FWD', keyType: 'Standard', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'In Storage',
        dates: { order: 'Feb 20, 2024', recovery: 'Mar 5, 2024', release: null },
        daysRecover: 14, daysStored: 18,
        invoices: [],
        fees: []
      },
      'C-48804': {
        client: 'Coastal Recovery LLC', lienholder: 'TD Auto Finance',
        account: 'TD-76234500', condReport: 'No', photos: 'No',
        vin: '3VWFE21C04M000001', year: '2020', make: 'Volkswagen', model: 'Jetta',
        driveType: 'FWD', keyType: 'Smart Key', eBrake: 'Yes', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Repossessed',
        dates: { order: 'Mar 1, 2024', recovery: 'Mar 12, 2024', release: 'Mar 18, 2024' },
        daysRecover: 11, daysStored: 6,
        invoices: [
          { num: 'INV-001521', status: 'Pending', date: 'Mar 19, 2024', total: '$445.00', paid: false,
            rule: 'Standard Repo Invoice',
            lineItems: [
              { name: 'Repossession Fee', amt: '$375.00', rate: '$375.00', qty: 1, tax: '0%', notes: '' },
              { name: 'Storage (6 days @ $20)', amt: '$120.00', rate: '$20.00', qty: 6, tax: '0%', notes: 'Per contract' }
            ]
          }
        ],
        fees: [
          { type: 'Skip Trace Fee', status: 'Pending', date: 'Mar 13, 2024', amount: '$100.00',
            feeType: 'SKIP_TRACE', approvedDate: null, bankCode: null }
        ]
      },
      'C-48799': {
        client: 'Premier Recovery Group', lienholder: 'Chase Auto',
        account: 'CH-55982133', condReport: 'Yes', photos: 'Yes',
        vin: '1FTFW1ET5DFC10312', year: '2022', make: 'Ford', model: 'F-150',
        driveType: '4WD', keyType: 'Smart Key', eBrake: 'Yes', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Released',
        dates: { order: 'Jan 5, 2024', recovery: 'Jan 22, 2024', release: 'Feb 1, 2024' },
        daysRecover: 17, daysStored: 10,
        invoices: [
          { num: 'INV-001400', status: 'Paid', date: 'Feb 2, 2024', total: '$875.00', paid: true,
            rule: 'Repo + Storage Auto-Invoice',
            clientPayments: [
              { date: 'Feb 9, 2024', amount: '$500.00', meta: 'ACH — Westlake Financial Partners' },
              { date: 'Feb 16, 2024', amount: '$375.00', meta: 'ACH — Westlake Financial Partners' }
            ],
            lineItems: [
              { name: 'Repossession Fee', amt: '$500.00', rate: '$500.00', qty: 1, tax: '0%', notes: 'Heavy vehicle rate' },
              { name: 'Storage (10 days @ $25)', amt: '$250.00', rate: '$25.00', qty: 10, tax: '0%', notes: '' },
              { name: 'Gate Fee', amt: '$75.00', rate: '$75.00', qty: 1, tax: '0%', notes: '' },
              { name: 'Administrative Fee', amt: '$50.00', rate: '$50.00', qty: 1, tax: '0%', notes: '' }
            ]
          }
        ],
        fees: [
          { type: 'Fuel Surcharge', status: 'Approved', date: 'Jan 23, 2024', amount: '$55.00',
            feeType: 'FUEL_SURCHARGE', approvedDate: 'Jan 25, 2024', bankCode: 'CH-FS' },
          { type: 'Winch Fee', status: 'Denied', date: 'Jan 23, 2024', amount: '$150.00',
            feeType: 'WINCH', approvedDate: null, bankCode: null },
          { type: 'Skip Trace', status: 'Pending', date: 'Mar 5, 2025', amount: '$150.00',
            feeType: 'SKIP_TRACE', approvedDate: null, bankCode: null }
        ]
      },
      'C-48789': {
        client: 'Metro Repo Services', lienholder: 'Santander Consumer',
        account: 'SC-18844201', condReport: 'No', photos: 'Yes',
        vin: '5XXGN4A73CG022222', year: '2018', make: 'Kia', model: 'Optima',
        driveType: 'FWD', keyType: 'Standard', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Voluntary Surrender', status: 'Closed',
        dates: { order: 'Dec 10, 2023', recovery: 'Dec 10, 2023', release: 'Dec 20, 2023' },
        daysRecover: 0, daysStored: 10,
        invoices: [
          { num: 'INV-001320', status: 'Paid', date: 'Dec 21, 2023', total: '$310.00', paid: true,
            rule: null,
            clientPayments: [
              { date: 'Jan 4, 2024', amount: '$310.00', meta: 'Check #4471' }
            ],
            lineItems: [
              { name: 'Storage (10 days @ $25)', amt: '$250.00', rate: '$25.00', qty: 10, tax: '0%', notes: '' },
              { name: 'Administrative Fee', amt: '$60.00', rate: '$60.00', qty: 1, tax: '0%', notes: '' }
            ]
          }
        ],
        fees: []
      },
      'C-48783': {
        client: 'Coastal Recovery LLC', lienholder: 'JPMorgan Chase',
        account: 'JP-31874402', condReport: 'No', photos: 'Yes',
        vin: '1C4RJEAG2JC438291', year: '2020', make: 'Jeep', model: 'Grand Cherokee',
        driveType: '4WD', keyType: 'Smart Key', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Declined',
        dates: { order: 'Feb 20, 2025', recovery: null, release: null },
        daysRecover: null, daysStored: null,
        invoices: [],
        fees: [
          { type: 'After-Hours Recovery', status: 'Denied', date: 'Mar 1, 2025', amount: '$100.00',
            feeType: 'AFTER_HOURS', approvedDate: null, bankCode: null }
        ]
      },
      'C-48821': {
        client: 'Metro Repo Services', lienholder: 'Capital One',
        account: 'CO-88203411', condReport: 'Yes', photos: 'Yes',
        vin: '1G1ZD5ST8JF241872', year: '2018', make: 'Chevrolet', model: 'Malibu',
        driveType: 'FWD', keyType: 'Standard', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Repossessed',
        dates: { order: 'Feb 28, 2025', recovery: 'Mar 5, 2025', release: null },
        daysRecover: 5, daysStored: null,
        invoices: [
          { num: 'RDN-9821', status: 'Pending', date: 'Mar 6, 2025', total: '$325.00', paid: false,
            rule: 'Repo Auto-Invoice',
            lineItems: [
              { name: 'Repossession Fee', amt: '$325.00', rate: '$325.00', qty: 1, tax: '0%', notes: '' }
            ]
          }
        ],
        fees: []
      },
      'C-48807': {
        client: 'Premier Recovery Group', lienholder: 'Capital One',
        account: 'CO-55109234', condReport: 'Yes', photos: 'Yes',
        vin: '3FADP4BJ8GM181432', year: '2016', make: 'Ford', model: 'Fiesta',
        driveType: 'FWD', keyType: 'Standard', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Repossessed',
        dates: { order: 'Feb 18, 2025', recovery: 'Feb 27, 2025', release: null },
        daysRecover: 9, daysStored: 8,
        invoices: [
          { num: 'RDN-9820', status: 'Submitted', date: 'Mar 6, 2025', total: '$45.00', paid: true,
            clientPayments: [
              { date: 'Mar 14, 2025', amount: '$45.00', meta: 'ACH — Capital One Auto Finance' }
            ],
            rule: 'Keys Obtained Auto-Invoice',
            lineItems: [
              { name: 'Keys Obtained', amt: '$45.00', rate: '$45.00', qty: 1, tax: '0%', notes: '' }
            ]
          },
          { num: 'RDN-9809', status: 'Pending', date: 'Mar 2, 2025', total: '$150.00', paid: false,
            rule: 'Storage Auto-Invoice',
            lineItems: [
              { name: 'Storage — 5 days', amt: '$150.00', rate: '$30.00', qty: 5, tax: '0%', notes: '' }
            ]
          }
        ],
        fees: []
      },
      'C-48794': {
        client: 'Coastal Recovery LLC', lienholder: 'Ford Credit',
        account: 'FC-29017744', condReport: 'Yes', photos: 'Yes',
        vin: '1FTEW1EP5JFA22341', year: '2018', make: 'Ford', model: 'F-150',
        driveType: '4WD', keyType: 'Smart Key', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Released',
        dates: { order: 'Feb 24, 2025', recovery: 'Mar 3, 2025', release: 'Mar 7, 2025' },
        daysRecover: 7, daysStored: 4,
        invoices: [
          { num: 'RDN-9815', status: 'Submitted', date: 'Mar 4, 2025', total: '$300.00', paid: true,
            clientPayments: [
              { date: 'Mar 12, 2025', amount: '$300.00', meta: 'ACH — Ally Bank' }
            ],
            rule: 'Repo Auto-Invoice',
            lineItems: [
              { name: 'Repossession Fee', amt: '$300.00', rate: '$300.00', qty: 1, tax: '0%', notes: '' }
            ]
          },
          { num: 'RDN-9814', status: 'Pending', date: 'Mar 4, 2025', total: '$125.00', paid: false,
            rule: 'Transport Auto-Invoice',
            lineItems: [
              { name: 'Transport Fee', amt: '$125.00', rate: '$125.00', qty: 1, tax: '0%', notes: '' }
            ]
          }
        ],
        fees: []
      },
      'C-48810': {
        client: 'Metro Repo Services', lienholder: 'Westlake Financial Partners',
        account: 'WF-44901233', condReport: 'No', photos: 'Yes',
        vin: '2HGFC2F59GH541037', year: '2016', make: 'Honda', model: 'Civic',
        driveType: 'FWD', keyType: 'Standard', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Repossessed',
        dates: { order: 'Feb 22, 2025', recovery: 'Mar 2, 2025', release: null },
        daysRecover: 8, daysStored: null,
        invoices: [
          { num: 'RDN-9812', status: 'Submitted', date: 'Mar 3, 2025', total: '$300.00', paid: false,
            rule: 'Repo Auto-Invoice',
            lineItems: [
              { name: 'Repossession Fee', amt: '$300.00', rate: '$300.00', qty: 1, tax: '0%', notes: '' }
            ]
          }
        ],
        fees: []
      },
      'C-48777': {
        client: 'Premier Recovery Group', lienholder: 'Westlake Financial Partners',
        account: 'WF-33827104', condReport: 'Yes', photos: 'Yes',
        vin: '5NPE34AF8JH612984', year: '2018', make: 'Hyundai', model: 'Sonata',
        driveType: 'FWD', keyType: 'Standard', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Released',
        dates: { order: 'Feb 15, 2025', recovery: 'Feb 25, 2025', release: 'Mar 3, 2025' },
        daysRecover: 10, daysStored: 6,
        invoices: [
          { num: 'RDN-9805', status: 'Submitted', date: 'Mar 1, 2025', total: '$275.00', paid: true,
            clientPayments: [
              { date: 'Mar 10, 2025', amount: '$275.00', meta: 'ACH — JPMorgan Chase' }
            ],
            rule: 'Repo Auto-Invoice',
            lineItems: [
              { name: 'Repossession Fee', amt: '$275.00', rate: '$275.00', qty: 1, tax: '0%', notes: '' }
            ]
          }
        ],
        fees: []
      },
      'C-48765': {
        client: 'Coastal Recovery LLC', lienholder: 'Ally Bank',
        account: 'AB-70012894', condReport: 'Yes', photos: 'No',
        vin: '1N4AL3AP8JC231095', year: '2018', make: 'Nissan', model: 'Altima',
        driveType: 'FWD', keyType: 'Standard', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Repossessed',
        dates: { order: 'Feb 14, 2025', recovery: 'Feb 26, 2025', release: null },
        daysRecover: 12, daysStored: null,
        invoices: [
          { num: 'RDN-9798', status: 'Submitted', date: 'Feb 27, 2025', total: '$325.00', paid: false,
            rule: 'Repo Auto-Invoice',
            lineItems: [
              { name: 'Repossession Fee', amt: '$325.00', rate: '$325.00', qty: 1, tax: '0%', notes: '' }
            ]
          }
        ],
        fees: []
      },
      'C-48771': {
        client: 'Premier Recovery Group', lienholder: 'Westlake Financial Partners',
        account: 'WF-20918843', condReport: 'Yes', photos: 'Yes',
        vin: '3VWFE21C04M000122', year: '2019', make: 'Volkswagen', model: 'Jetta',
        driveType: 'FWD', keyType: 'Standard', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Released',
        dates: { order: 'Feb 10, 2025', recovery: 'Feb 20, 2025', release: 'Feb 26, 2025' },
        daysRecover: 10, daysStored: 6,
        invoices: [
          { num: 'RDN-9780', status: 'Submitted', date: 'Feb 26, 2025', total: '$300.00', paid: true,
            clientPayments: [
              { date: 'Mar 5, 2025', amount: '$300.00', meta: 'ACH — Westlake Financial Partners' }
            ],
            rule: 'Repo Auto-Invoice',
            lineItems: [
              { name: 'Repossession Fee', amt: '$300.00', rate: '$300.00', qty: 1, tax: '0%', notes: '' }
            ]
          }
        ],
        fees: [
          { type: 'Fuel Surcharge', status: 'Approved', date: 'Feb 21, 2025', amount: '$55.00',
            feeType: 'FUEL_SURCHARGE', approvedDate: 'Feb 22, 2025', bankCode: 'WF-FS' }
        ]
      },
      'C-48759': {
        client: 'Metro Repo Services', lienholder: 'Ally Bank',
        account: 'AB-55381209', condReport: 'No', photos: 'No',
        vin: '1HGCM56826A800001', year: '2006', make: 'Honda', model: 'Accord',
        driveType: 'FWD', keyType: 'Standard', eBrake: 'No', fuel: 'Gasoline',
        orderType: 'Repossession', status: 'Declined',
        dates: { order: 'Feb 15, 2025', recovery: null, release: null },
        daysRecover: null, daysStored: null,
        invoices: [],
        fees: [
          { type: 'Skip Trace Fee', status: 'Denied', date: 'Feb 23, 2025', amount: '$100.00',
            feeType: 'SKIP_TRACE', approvedDate: null, bankCode: null }
        ]
      }
    };

    // Generic fallback for unknown case numbers
    function fallbackCase(caseNum) {
      return {
        client: 'Unknown Client', lienholder: 'Unknown Lienholder',
        account: '—', condReport: '—', photos: '—',
        vin: '—', year: '—', make: '—', model: '—',
        driveType: '—', keyType: '—', eBrake: '—', fuel: '—',
        orderType: 'Repossession', status: 'Open',
        dates: { order: '—', recovery: '—', release: null },
        daysRecover: null, daysStored: null,
        invoices: [], fees: []
      };
    }

    /* ----------------------------------------------------------
       Open / close
    ---------------------------------------------------------- */
    window.openDrawer = function(caseNum) {
      var data = MOCK_CASES[caseNum] || fallbackCase(caseNum);
      populateDrawer(caseNum, data);
      document.getElementById('drawerBackdrop').classList.add('open');
      document.getElementById('caseDrawer').classList.add('open');
      document.getElementById('drawerBody').scrollTop = 0;
      document.body.style.overflow = 'hidden';
    };

    window.closeDrawer = function() {
      document.getElementById('drawerBackdrop').classList.remove('open');
      document.getElementById('caseDrawer').classList.remove('open');
      document.body.style.overflow = '';
      document.querySelectorAll('.data-table tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
    };

    // ESC key closes both drawers
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { closeDrawer(); if (window.closeRuleDrawer) closeRuleDrawer(); }
    });

    // Click outside the drawer panel closes it.
    // Because the backdrop is pointer-events:none, clicks land on the actual page content.
    // We only close if the click is clearly outside both drawer panels.
    document.addEventListener('click', function(e) {
      var backdrop = document.getElementById('drawerBackdrop');
      if (!backdrop || !backdrop.classList.contains('open')) return;
      var caseDrawer = document.getElementById('caseDrawer');
      var ruleDrawer = document.getElementById('ruleDrawer');
      var inCase = caseDrawer && caseDrawer.contains(e.target);
      var inRule = ruleDrawer && ruleDrawer.contains(e.target);
      // Also ignore clicks on row triggers (they handle their own open/switch logic)
      var isRowTrigger = e.target.closest && e.target.closest('tr[data-case-id], tr[data-rule-id]');
      if (!inCase && !inRule && !isRowTrigger) {
        closeDrawer();
        if (window.closeRuleDrawer) closeRuleDrawer();
      }
    }, true); // capture phase so it runs before row onclick handlers

    /* ----------------------------------------------------------
       Populate drawer with case data
    ---------------------------------------------------------- */
    function set(id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val || '—';
    }

    function populateDrawer(caseNum, d) {
      // Header
      document.getElementById('drawerCaseNum').textContent = 'Case #' + caseNum;
      var rdnBase = 'https://app.recoverydatabase.net/alpha_rdn/module/default/case2/?case_id=' + caseNum;
      var rdnLink = document.getElementById('drawerRdnLink');
      rdnLink.href = rdnBase + '&tab=0#';
      var rdnPhotos = document.getElementById('drawerRdnPhotos');
      if (rdnPhotos) rdnPhotos.href = rdnBase + '&tab=14';
      var rdnCR = document.getElementById('drawerRdnConditionReport');
      if (rdnCR) rdnCR.href = rdnBase + '&tab=2';
      var rdnInv = document.getElementById('drawerRdnInvoices');
      if (rdnInv) rdnInv.href = rdnBase + '&tab=85';

      // Lifecycle badges
      var statusBadge = document.getElementById('drawerStatusBadge');
      var statusLabel = document.getElementById('drawerStatusLabel');
      statusLabel.textContent = d.status;
      statusBadge.className = 'lc-badge';
      var s = (d.status || '').toLowerCase();
      if (s.includes('repossess')) statusBadge.classList.add('repossessed');
      else if (s.includes('close') || s.includes('release')) statusBadge.classList.add('closed');
      else if (s.includes('pending') || s.includes('storage')) statusBadge.classList.add('pending');
      document.getElementById('drawerOrderTypeLabel').textContent = d.orderType || 'Repossession';

      // Timeline
      var hasRecovery = d.dates.recovery && d.dates.recovery !== '—';
      var hasRelease = d.dates.release && d.dates.release !== null && d.dates.release !== '—';
      document.getElementById('tlDate1').textContent = d.dates.order || '—';
      document.getElementById('tlDate2').textContent = d.dates.recovery || '—';
      document.getElementById('tlDate3').textContent = d.dates.release || '—';
      document.getElementById('tlStep1').className = 'tl-step done';
      document.getElementById('tlStep2').className = 'tl-step' + (hasRecovery ? ' done' : '');
      document.getElementById('tlConn1').style.background = hasRecovery ? '#4caf50' : '#e0e0e0';
      document.getElementById('tlStep3').className = 'tl-step' + (hasRelease ? ' done' : '');
      document.getElementById('tlConn2').style.background = hasRelease ? '#4caf50' : '#e0e0e0';

      // Metrics
      var metricsEl = document.getElementById('drawerMetrics');
      if (d.daysRecover !== null || d.daysStored !== null) {
        metricsEl.style.display = 'grid';
        document.getElementById('drawerDaysRecover').textContent = d.daysRecover !== null ? d.daysRecover : '—';
        document.getElementById('drawerDaysStored').textContent = d.daysStored !== null ? d.daysStored : '—';
      } else {
        metricsEl.style.display = 'none';
      }

      // Case details
      set('drawerClient', d.client);
      set('drawerLienholder', d.lienholder);
      set('drawerAccount', d.account);
      set('drawerCondReport', d.condReport);
      set('drawerPhotos', d.photos);
      set('drawerVin', d.vin);
      set('drawerYear', d.year);
      set('drawerMake', d.make);
      set('drawerModel', d.model);
      set('drawerDriveType', d.driveType);
      set('drawerKeyType', d.keyType);
      set('drawerEBrake', d.eBrake);
      set('drawerFuel', d.fuel);

      // Invoices
      buildInvoiceCards('drawerInvoicesList', 'drawerInvoiceTotal', d.invoices, 'invoiceTotal');

      // Fees
      buildFeeCards('drawerFeesList', 'drawerFeesTotal', d.fees);
    }

    /* ----------------------------------------------------------
       Build invoice cards
    ---------------------------------------------------------- */
    function buildInvoiceCards(listId, totalId, invoices, totalKey) {
      var list = document.getElementById(listId);
      var totalEl = document.getElementById(totalId);
      if (!invoices || !invoices.length) {
        list.innerHTML = '<div class="drawer-empty">No invoices for this case.</div>';
        totalEl.style.display = 'none';
        return;
      }
      list.innerHTML = '';
      var grandTotal = 0;
      invoices.forEach(function(inv, idx) {
        var card = document.createElement('div');
        card.className = 'inv-card';
        var liHtml = '';
        if (inv.lineItems && inv.lineItems.length) {
          liHtml = inv.lineItems.map(function(li, liIdx) {
            var detailId = 'li_' + listId + '_' + idx + '_' + liIdx;
            return '<div class="li-item">' +
              '<button class="li-toggle" onclick="toggleLineItem(\'' + detailId + '\', this)">' +
                '<span class="li-name">' + esc(li.name) + '</span>' +
                '<span class="li-amt">' + esc(li.amt) + '</span>' +
                '<span class="material-symbols-outlined li-chevron">expand_more</span>' +
              '</button>' +
              '<div class="li-details" id="' + detailId + '">' +
                '<span class="k">Rate</span><span class="v">' + esc(li.rate) + '</span>' +
                '<span class="k">Qty</span><span class="v">' + esc(String(li.qty)) + '</span>' +
                '<span class="k">Tax</span><span class="v">' + esc(li.tax) + '</span>' +
                (li.notes ? '<span class="k">Notes</span><span class="v">' + esc(li.notes) + '</span>' : '') +
              '</div>' +
            '</div>';
          }).join('');
        }
        var paidBadge = inv.paid ? '<span class="paid-badge">Paid</span>' : '';
        var ruleHtml = inv.rule ? '<div class="inv-rule"><img src="img/ampd-logo-white-sm.png" class="inv-source-logo" alt="AMPD"><a href="#">' + esc(inv.rule) + '</a></div>' : '';
        // Payment history block
        var payHtml = '';
        if (inv.clientPayments && inv.clientPayments.length) {
          var rows = inv.clientPayments.map(function(p) {
            var metaHtml = p.meta ? '<span class="payment-history-meta">' + esc(p.meta) + '</span>' : '';
            return '<div class="payment-history-row">' +
              '<span class="payment-history-date">' + esc(p.date) + '</span>' +
              '<span class="payment-history-amount">' + esc(p.amount) + '</span>' +
              metaHtml +
            '</div>';
          }).join('');
          var footerHtml = '';
          if (inv.clientPayments.length > 1) {
            var total = inv.clientPayments.reduce(function(s, p) {
              return s + (parseFloat((p.amount || '').replace(/[$,]/g, '')) || 0);
            }, 0);
            footerHtml = '<div class="payment-history-footer">' +
              '<span class="payment-history-footer-label">Total paid</span>' +
              '<span class="payment-history-footer-amount">$' + total.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</span>' +
            '</div>';
          }
          payHtml = '<div class="invoice-payment-history">' +
            '<div class="payment-history-heading">Payment History</div>' +
            '<div class="payment-history-list">' + rows + '</div>' +
            footerHtml +
          '</div>';
        }
        card.innerHTML =
          '<div class="inv-card-summary">' +
            '<div class="inv-card-top">' +
              '<div class="inv-num">' + esc(inv.num) + paidBadge + '</div>' +
              '<div class="inv-meta">' +
                '<span class="inv-status ' + invStatusClass(inv.status) + '">' + esc(inv.status) + '</span>' +
                '<span class="inv-date">' + esc(inv.date) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="inv-total">' + esc(inv.total) + '</div>' +
            ruleHtml +
          '</div>' +
          payHtml +
          liHtml;
        list.appendChild(card);

        // Accumulate total (strip $ and commas)
        var amt = parseFloat((inv.total || '').replace(/[$,]/g, '')) || 0;
        grandTotal += amt;
      });
      totalEl.textContent = 'Invoice Total: $' + grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      totalEl.style.display = 'block';
    }

    /* ----------------------------------------------------------
       Build fee cards
    ---------------------------------------------------------- */
    function buildFeeCards(listId, totalId, fees) {
      var list = document.getElementById(listId);
      var totalEl = document.getElementById(totalId);
      if (!fees || !fees.length) {
        list.innerHTML = '<div class="drawer-empty">No fee requests for this case.</div>';
        totalEl.style.display = 'none';
        return;
      }
      list.innerHTML = '';
      var grandTotal = 0;
      var wrap = document.createElement('div');
      wrap.className = 'inv-card';
      fees.forEach(function(fee, idx) {
        var detailId = 'fee_' + listId + '_' + idx;
        var extraKeys = '';
        if (fee.approvedDate) extraKeys += '<span class="k">Approved</span><span class="v">' + esc(fee.approvedDate) + '</span>';
        if (fee.bankCode) extraKeys += '<span class="k">Bank Code</span><span class="v">' + esc(fee.bankCode) + '</span>';
        var feeSourceHtml = fee.source ? '<div class="inv-rule"><img src="img/ampd-logo-white-sm.png" class="inv-source-logo" alt="AMPD"><a href="#">' + esc(fee.source) + '</a></div>' : '';
        var item = document.createElement('div');
        item.className = 'li-item';
        item.innerHTML =
          '<button class="li-toggle" onclick="toggleLineItem(\'' + detailId + '\', this)">' +
            '<span class="li-name">' + esc(fee.type) + '</span>' +
            '<span class="li-fee-meta">' +
              '<span class="inv-status ' + invStatusClass(fee.status) + '">' + esc(fee.status) + '</span>' +
              '<span class="inv-date">' + esc(fee.date) + '</span>' +
              '<span class="li-amt">' + esc(fee.amount) + '</span>' +
            '</span>' +
            '<span class="material-symbols-outlined li-chevron">expand_more</span>' +
          '</button>' +
          '<div class="li-details" id="' + detailId + '">' +
            '<span class="k">Fee Type</span><span class="v">' + esc(fee.feeType || fee.type) + '</span>' +
            '<span class="k">Status</span><span class="v">' + esc(fee.status) + '</span>' +
            '<span class="k">Date Added</span><span class="v">' + esc(fee.date) + '</span>' +
            extraKeys +
          '</div>' +
          feeSourceHtml;
        wrap.appendChild(item);
        var amt = parseFloat((fee.amount || '').replace(/[$,]/g, '')) || 0;
        grandTotal += amt;
      });
      list.appendChild(wrap);
      totalEl.textContent = 'Fee Requests Total: $' + grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      totalEl.style.display = 'block';
    }

    /* ----------------------------------------------------------
       Line item accordion toggle
    ---------------------------------------------------------- */
    window.toggleLineItem = function(detailId, btn) {
      var el = document.getElementById(detailId);
      if (!el) return;
      var isOpen = el.classList.contains('open');
      el.classList.toggle('open', !isOpen);
      btn.classList.toggle('expanded', !isOpen);
    };

    /* ----------------------------------------------------------
       Helpers
    ---------------------------------------------------------- */
    function invStatusClass(status) {
      var s = (status || '').toLowerCase();
      if (s === 'paid' || s === 'approved') return 'paid';
      if (s === 'pending' || s === 'draft') return 'pending';
      if (s === 'denied' || s === 'rejected' || s === 'cancelled') return 'denied';
      return '';
    }

    function esc(str) {
      return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* ----------------------------------------------------------
       Event delegation — single listener handles all pages always
    ---------------------------------------------------------- */
    function setActiveRow(row) {
      // Clear any previously active row across all tables
      document.querySelectorAll('.data-table tr.row-active').forEach(function(r) {
        r.classList.remove('row-active');
      });
      if (row) row.classList.add('row-active');
    }

    document.addEventListener('click', function(e) {
      // Walk up from click target to find a tr with data-case-id or data-rule-id
      var el = e.target;
      while (el && el.tagName !== 'TR') {
        // Stop if user clicked a checkbox, button, or link
        if (el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.tagName === 'A') return;
        el = el.parentElement;
      }
      if (!el || !el.dataset) return;
      if (el.dataset.caseId) {
        setActiveRow(el);
        openDrawer(el.dataset.caseId);
      } else if (el.dataset.ruleId) {
        setActiveRow(el);
        openRuleDrawer(el.dataset.ruleId);
      }
    });

    // Add pointer cursor to all case rows via CSS injection
    (function() {
      var s = document.createElement('style');
      s.textContent = 'tr[data-case-id] { cursor: pointer; }';
      document.head.appendChild(s);
    })();

  })();

  

  /* ============================================================
     RULE DRAWER — open / close / populate / simulate
     ============================================================ */
  (function() {

    var MOCK_RULES = {
      'rule-1': {
        name: 'Repossession — Standard', eventType: 'draftInvoice',
        enabled: true, pushRDN: true,
        client: 'Capital One Auto Finance', billToClient: 'Capital One',
        statuses: ['Recovered'], dispositions: [], orderTypes: ['Repossess'],
        lienholders: ['Capital One'], lprFlag: 'all',
        service: 'repossession_fee', rate: 325, taxRate: 0,
        calcType: 'flat', notes: '',
        requiresFeeApproval: false, sendEmail: false,
        isNew: false
      },
      'rule-2': {
        name: 'Keys Obtained', eventType: 'draftInvoice',
        enabled: true, pushRDN: true,
        client: 'Capital One Auto Finance', billToClient: 'Capital One',
        statuses: ['Recovered'], dispositions: [], orderTypes: ['Repossess'],
        lienholders: ['Capital One'], lprFlag: 'all',
        service: 'keys_obtained', rate: 45, taxRate: 0,
        calcType: 'flat', notes: '',
        requiresFeeApproval: false, sendEmail: false,
        isNew: false
      },
      'rule-3': {
        name: 'Storage — Per Day', eventType: 'draftInvoice',
        enabled: true, pushRDN: false,
        client: '', billToClient: '',
        statuses: ['Recovered'], dispositions: ['Stored'], orderTypes: [],
        lienholders: [], lprFlag: 'all',
        service: 'storage_fee', rate: 30, taxRate: 0,
        calcType: 'calculateStoredDays', minThreshold: 1, maxThreshold: null, notes: '',
        requiresFeeApproval: false, sendEmail: false,
        isNew: false
      },
      'rule-4': {
        name: 'Repossession — Ally', eventType: 'draftInvoice',
        enabled: true, pushRDN: true,
        client: 'Ally Financial', billToClient: 'Ally Bank',
        statuses: ['Recovered'], dispositions: [], orderTypes: ['Repossess', 'LPR'],
        lienholders: ['Ally Bank'], lprFlag: 'all',
        service: 'repossession_fee', rate: 300, taxRate: 0,
        calcType: 'flat', notes: '',
        requiresFeeApproval: false, sendEmail: false,
        isNew: false
      },
      'rule-5': {
        name: 'Close Fee — Declined', eventType: 'draftFee',
        enabled: true, pushRDN: true,
        client: 'Chase Auto Finance', billToClient: 'JPMorgan Chase',
        statuses: ['Declined'], dispositions: [], orderTypes: ['Repossess'],
        lienholders: ['JPMorgan Chase'], lprFlag: 'all',
        service: 'close_fee', feeAmount: 50, bankCode: 'CH-CF', feeComments: '',
        isNew: false
      },
      'rule-6': {
        name: 'Personal Property Release', eventType: 'draftInvoice',
        enabled: false, pushRDN: false,
        client: '', billToClient: '',
        statuses: ['Recovered'], dispositions: ['Stored'], orderTypes: [],
        lienholders: [], lprFlag: 'all',
        service: 'personal_property', rate: 35, taxRate: 0,
        calcType: 'flat', notes: 'Service warning — may be unavailable',
        requiresFeeApproval: false, sendEmail: false,
        isNew: false
      },
      'rule-7': {
        name: 'Transport — Long Distance', eventType: 'draftInvoice',
        enabled: true, pushRDN: true,
        client: 'Ford Motor Credit', billToClient: 'Ford Credit',
        statuses: ['Recovered'], dispositions: ['Delivered'], orderTypes: ['Repossess'],
        lienholders: ['Ford Credit'], lprFlag: 'all',
        service: 'transport_fee', rate: 125, taxRate: 0,
        calcType: 'flat', notes: '',
        requiresFeeApproval: false, sendEmail: false,
        isNew: false
      }
    };

    function setVal(id, val) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = val || '';
    }

    function setMultiSelect(id, vals) {
      var el = document.getElementById(id);
      if (!el) return;
      var arr = vals || [];
      for (var i = 0; i < el.options.length; i++) {
        el.options[i].selected = arr.indexOf(el.options[i].value) !== -1;
      }
    }

    window.openRuleDrawer = function(ruleId) {
      var isNew = !ruleId || ruleId === 'new';
      var data = isNew ? null : MOCK_RULES[ruleId];
      populateRuleDrawer(isNew, data);
      document.getElementById('drawerBackdrop').classList.add('open');
      document.getElementById('ruleDrawer').classList.add('open');
      document.body.style.overflow = 'hidden';
      // Reset scroll after the browser has had a chance to render
      var body = document.getElementById('ruleDrawerBody');
      body.scrollTop = 0;
      requestAnimationFrame(function() { body.scrollTop = 0; });
    };

    window.closeRuleDrawer = function() {
      document.getElementById('drawerBackdrop').classList.remove('open');
      document.getElementById('ruleDrawer').classList.remove('open');
      document.body.style.overflow = '';
      document.querySelectorAll('.data-table tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
    };

    function populateRuleDrawer(isNew, d) {
      document.getElementById('ruleDrawerTitle').textContent = isNew ? 'Create New Rule' : 'Edit Rule';
      document.getElementById('rfDeleteBtn').style.display = isNew ? 'none' : '';
      document.getElementById('rfSimResult').style.display = 'none';
      document.getElementById('rfSimCaseId').value = '';

      if (isNew || !d) {
        // Clear all fields
        ['rfName','rfClient','rfBillToClient','rfAccountFilter','rfRate',
         'rfTaxRate','rfNotes','rfFeeAmount','rfBankCode','rfFeeComments',
         'rfEmailRecipients','rfModel','rfYear'].forEach(function(id) { setVal(id, ''); });
        ['rfEnabled','rfPushRDN','rfRequiresFeeApproval','rfSendEmail',
         'rfHasCR','rfHasPics','rfHasTransport'].forEach(function(id) { setVal(id, false); });
        setVal('rfEventType', 'draftInvoice');
        setVal('rfLprFlag', 'all');
        setVal('rfEBrake', 'all');
        setVal('rfCalcType', 'flat');
        setVal('rfService', '');
        ['rfStatus','rfDisposition','rfOrderType','rfLienholders',
         'rfKeyType','rfMake','rfVehicleType','rfDriveType','rfRecoveryState'].forEach(function(id) {
          setMultiSelect(id, []);
        });
      } else {
        setVal('rfName', d.name);
        setVal('rfEventType', d.eventType);
        setVal('rfEnabled', d.enabled);
        setVal('rfPushRDN', d.pushRDN);
        setVal('rfClient', d.client);
        setVal('rfBillToClient', d.billToClient);
        setVal('rfLprFlag', d.lprFlag || 'all');
        setVal('rfAccountFilter', d.accountFilter || '');
        setVal('rfModel', d.model || '');
        setVal('rfYear', d.year || '');
        setVal('rfEBrake', d.eBrake || 'all');
        setMultiSelect('rfStatus', d.statuses || []);
        setMultiSelect('rfDisposition', d.dispositions || []);
        setMultiSelect('rfOrderType', d.orderTypes || []);
        setMultiSelect('rfLienholders', d.lienholders || []);
        setMultiSelect('rfKeyType', d.keyTypes || []);
        setMultiSelect('rfMake', d.makes || []);
        setMultiSelect('rfVehicleType', d.vehicleTypes || []);
        setMultiSelect('rfDriveType', d.driveTypes || []);
        setMultiSelect('rfRecoveryState', d.recoveryStates || []);
        setVal('rfService', d.service || '');

        if (d.eventType === 'draftInvoice') {
          setVal('rfRequiresFeeApproval', d.requiresFeeApproval);
          setVal('rfRate', d.rate);
          setVal('rfTaxRate', d.taxRate);
          setVal('rfCalcType', d.calcType || 'flat');
          setVal('rfMinThreshold', d.minThreshold || '');
          setVal('rfMaxThreshold', d.maxThreshold || '');
          setVal('rfNotes', d.notes || '');
          setVal('rfSendEmail', d.sendEmail);
          setVal('rfEmailRecipients', d.emailRecipients || '');
        } else {
          setVal('rfFeeAmount', d.feeAmount || '');
          setVal('rfBankCode', d.bankCode || '');
          setVal('rfFeeComments', d.feeComments || '');
        }
      }
      ruleEventTypeChanged();
      ruleCalcTypeChanged();
      ruleEmailToggle();
    }

    window.ruleEventTypeChanged = function() {
      var type = document.getElementById('rfEventType').value;
      var invoiceFields = document.getElementById('rfInvoiceFields');
      var feeFields = document.getElementById('rfFeeFields');
      var notifSection = document.getElementById('rfNotificationsSection');
      if (invoiceFields) invoiceFields.style.display = type === 'draftInvoice' ? '' : 'none';
      if (feeFields) feeFields.style.display = type === 'draftFee' ? '' : 'none';
      if (notifSection) notifSection.style.display = type === 'draftInvoice' ? '' : 'none';
    };

    window.ruleCalcTypeChanged = function() {
      var calc = document.getElementById('rfCalcType').value;
      var thresh = document.getElementById('rfThresholdFields');
      if (thresh) thresh.style.display = (calc !== 'flat') ? '' : 'none';
    };

    window.ruleEmailToggle = function() {
      var checked = document.getElementById('rfSendEmail').checked;
      var field = document.getElementById('rfEmailRecipientsField');
      if (field) field.style.display = checked ? '' : 'none';
    };

    window.runRuleSimulation = function() {
      var caseId = document.getElementById('rfSimCaseId').value.trim();
      if (!caseId) { alert('Please enter an RDN Case ID to simulate'); return; }
      var resultEl = document.getElementById('rfSimResult');
      var triggered = Math.random() > 0.4;
      var rate = parseFloat(document.getElementById('rfRate').value) || 0;
      var qty = document.getElementById('rfCalcType').value === 'calculateStoredDays' ? 7 : 1;
      var total = (rate * qty).toFixed(2);
      var serviceName = document.getElementById('rfService');
      var svc = serviceName.options[serviceName.selectedIndex] ? serviceName.options[serviceName.selectedIndex].text : 'Service';
      resultEl.className = 'rule-sim-result ' + (triggered ? 'triggered' : 'not-triggered');
      if (triggered) {
        resultEl.innerHTML = '<strong>Triggered:</strong> Yes<br>' +
          '<strong>Event:</strong> ' + document.getElementById('rfEventType').value + '<br>' +
          '<strong>Invoice Simulation:</strong>' +
          '<table class="rule-sim-table"><thead><tr><th>Service</th><th>Qty</th><th>Rate</th><th>Tax%</th><th>Total</th></tr></thead>' +
          '<tbody><tr><td>' + esc(svc) + '</td><td>' + qty + '</td><td>$' + rate.toFixed(2) + '</td><td>0</td><td>$' + total + '</td></tr></tbody>' +
          '<tfoot><tr><td colspan="4"><strong>Total</strong></td><td><strong>$' + total + '</strong></td></tr></tfoot></table>';
      } else {
        resultEl.innerHTML = '<strong>Triggered:</strong> No<br><span style="color:#c62828;">Rule conditions not met for case ' + esc(caseId) + '</span>';
      }
      resultEl.style.display = 'block';
    };

    window.saveRule = function() {
      var name = document.getElementById('rfName').value.trim();
      if (!name) { alert('Rule name is required'); return; }
      var billTo = document.getElementById('rfBillToClient').value.trim();
      if (!billTo) { alert('Bill To Client is required'); return; }
      closeRuleDrawer();
      // In production this would POST/PUT to the API
    };

    function esc(s) {
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Wire up ESC key (extend existing handler)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeRuleDrawer();
    });

  })();

  




// ═══════════════════════════════════════════════════════════════════════════
// FilterSystem — matches filter-config.ts from git source
// ═══════════════════════════════════════════════════════════════════════════
var FS = (function() {
  'use strict';

  // Service category options (from service-category.component.ts)
  var SC_OPTS = [
    {val:'ADMINISTRATION_MISC', label:'Administration & Misc'},
    {val:'ADVANCED_FUNDS',      label:'Advanced Funds'},
    {val:'EQUIPMENT',           label:'Equipment'},
    {val:'FUEL_BONUS',          label:'Fuel / Bonus'},
    {val:'KEYS',                label:'Keys'},
    {val:'MILEAGE_CLOSE',       label:'Mileage / Close'},
    {val:'PICS_CR_FIELD',       label:'Pics / CR / Field'},
    {val:'RECOVERY',            label:'Recovery'},
    {val:'REDEMPTION_PROPERTY', label:'Redemption / Personal Property'},
    {val:'STORAGE',             label:'Storage'},
    {val:'TAX',                 label:'Tax'},
    {val:'TRANSPORT',           label:'Transport'}
  ];

  // Drive type options (from drive-type.component.ts)
  var DT_OPTS = ['AWD','FWD','RWD','2WD','4WD','UNKNOWN'];

  // Case status options — from table data (API-driven in real app)
  var CASE_STATUSES = ['Open','Recovered','Declined','Redeemed','Pending'];

  // Invoice status display values (from invoice-status.pipe.ts + table data)
  var INV_STATUSES = ['Pending','Submitted','Approved','Paid','Denied','Failed','Draft'];

  // Fee status options
  var FEE_STATUSES = ['Pending','Approved','Denied'];

  // ── Filter configs keyed by tbodyId ──────────────────────────────────────
  // primary = shown as chips by default  |  extra = via "+ Filter"
  // Order matches Angular component filter arrays (filter-config.ts / *.component.ts)
  var CONFIGS = {

    // ── Cases (matches assignments.component.ts filters[]) ─────────────────
    casesTbody: {
      primary: [
        {key:'caseNumber',  label:'Case Number',  icon:'tag',            type:'text',     col:3},
        {key:'caseStatus',  label:'Case Status',  icon:'list_alt',       type:'select',   col:2, opts:CASE_STATUSES},
        {key:'client',      label:'Client',        icon:'business',       type:'text',     col:5},
        {key:'disposition', label:'Disposition',   icon:'warehouse',      type:'select',   col:null, opts:['Stored','Released','Auctioned','Secured']},
        {key:'orderType',   label:'Order Type',    icon:'category',       type:'select',   col:null, opts:['Repossess','Repossess LPR','Voluntary','Voluntary LPR']},
        {key:'vin',         label:'VIN',           icon:'directions_car', type:'text',     data:'vin'},
        {key:'receivedDate',label:'Received Date', icon:'calendar_today', type:'daterange',col:1}
      ],
      extra: [
        {key:'storageDays',         label:'> Storage Days',                  icon:'schedule',       type:'num',      col:4},
        {key:'lienholder',          label:'Lienholder',                      icon:'account_balance',type:'text',     col:6},
        {key:'invoiceCount',        label:'Invoices (Quantity)',              icon:'receipt_long',   type:'num',      col:null},
        {key:'serviceCategory',     label:'Service Line Item Category',      icon:'category',       type:'multi',    col:7,   opts:SC_OPTS},
        {key:'driveType',           label:'Drive Type',                      icon:'settings',       type:'multi',    col:null,opts:DT_OPTS.map(function(v){return {val:v,label:v};})},
        {key:'eBrake',              label:'E-Brake',                         icon:'warning',        type:'bool',     col:null},
        {key:'photos',              label:'Photos',                          icon:'photo_camera',   type:'bool',     col:null},
        {key:'crFlag',              label:'CR',                              icon:'flag',           type:'bool',     col:null},
        {key:'repoDate',            label:'Recovery Date',                   icon:'event',          type:'daterange',col:null},
        {key:'closedDate',          label:'Closed Date',                     icon:'event_available',type:'daterange',col:null},
        {key:'transportDate',       label:'Released/Transport Date',         icon:'local_shipping', type:'daterange',col:null},
        {key:'missingServiceCategory',label:'Missing Service Line Item Category',icon:'warning_amber',type:'multi',col:null,opts:SC_OPTS},
        {key:'feeApprovedCategory', label:'Fee Approved Category',           icon:'payments',       type:'multi',    col:8,   opts:SC_OPTS}
      ]
    },

    // ── Invoices (matches invoices.component.ts filters[]) ─────────────────
    invoicesTbody: {
      primary: [
        {key:'invoiceClient',    label:'Client',           icon:'business',       type:'text',     col:6},
        {key:'invoiceStatus',    label:'Invoice Status',   icon:'list_alt',       type:'select',   col:1, opts:INV_STATUSES},
        {key:'invoiceVin',       label:'VIN',              icon:'directions_car', type:'text',     data:'vin'},
        {key:'invoiceLienholder',label:'Lienholder',       icon:'account_balance',type:'text',     col:7},
        {key:'invoiceService',   label:'Service',          icon:'build',          type:'text',     col:8},
        {key:'invoiceCreatedDate',label:'Created Date',    icon:'calendar_today', type:'daterange',col:0},
        {key:'invoicePayment',   label:'Payment',          icon:'payments',       type:'bool',     col:2}
      ],
      extra: [
        {key:'invoiceServiceCategory',  label:'Service Category',   icon:'category', type:'multi', col:null, opts:SC_OPTS},
        {key:'invoiceUpdatedDate',      label:'Updated Date',       icon:'update',   type:'daterange', col:null},
        {key:'invoiceRdnInvoiceNumber', label:'RDN Invoice Number', icon:'receipt',  type:'text',  col:3}
      ]
    },

    // ── Fee Requests (matches fees.component.ts filters[]) ─────────────────
    feesTbody: {
      primary: [
        {key:'feeClient',    label:'Client',       icon:'business',       type:'text',   col:5},
        {key:'feeStatus',    label:'Fee Status',   icon:'list_alt',       type:'select', col:1, opts:FEE_STATUSES},
        {key:'feeCaseStatus',label:'Case Status',  icon:'list_alt',       type:'select', col:4, opts:CASE_STATUSES},
        {key:'feeOrderType', label:'Order Type',   icon:'category',       type:'text',   col:3},
        {key:'feeVin',       label:'VIN',          icon:'directions_car', type:'text',   col:7},
        {key:'feeLienholder',label:'Lienholder',   icon:'account_balance',type:'text',   col:6},
        {key:'feeType',      label:'Fee Type',     icon:'build',          type:'text',   col:8},
        {key:'feeAmount',    label:'Fee Amount',   icon:'attach_money',   type:'num',    col:9}
      ],
      extra: [
        {key:'feeTypeLabel',    label:'Fee Type Label',  icon:'label',        type:'text',      col:8},
        {key:'feeAddedDate',    label:'Fee Added Date',  icon:'calendar_today',type:'daterange', col:0},
        {key:'feeCreatedDate',  label:'Created Date',    icon:'calendar_today',type:'daterange', col:0},
        {key:'feeApprovedDate', label:'Approved Date',   icon:'check_circle', type:'daterange', col:null},
        {key:'feeDeniedDate',   label:'Denied Date',     icon:'cancel',       type:'daterange', col:null},
        {key:'feeSource',       label:'Source',          icon:'source',       type:'text',      col:10},
        {key:'feeHasComments',  label:'Has Comments',    icon:'comment',      type:'bool',      col:null},
        {key:'feeRuleName',     label:'Rule Name',       icon:'rule',         type:'text',      col:null},
        {key:'feeAccountNumber',label:'Account Number',  icon:'tag',          type:'text',      col:null},
        {key:'feeBankCode',     label:'Bank Code',       icon:'account_balance',type:'text',    col:null}
      ]
    },

    // ── Rules (matches rules.component.ts filters[]) ────────────────────────
    rulesTbody: {
      primary: [
        {key:'ruleEnabled',   label:'Enabled',     icon:'toggle_on',      type:'bool', col:0},
        {key:'rulePushToRDN', label:'Push to RDN', icon:'sync',           type:'bool', col:1},
        {key:'ruleClient',    label:'Client',      icon:'business',       type:'text', col:4},
        {key:'ruleEventType', label:'Event Type',  icon:'category',       type:'select',col:3,
          opts:[{val:'draftInvoice',label:'Invoice'},{val:'draftFee',label:'Fee'}]},
        {key:'ruleCaseStatus',label:'Case Status', icon:'list_alt',       type:'select',col:6, opts:CASE_STATUSES}
      ],
      extra: [
        {key:'ruleName',       label:'Rule Name',   icon:'label',          type:'text', col:2},
        {key:'ruleLienholder', label:'Lienholder',  icon:'account_balance',type:'text', col:5},
        {key:'ruleDisposition',label:'Disposition', icon:'warehouse',      type:'text', col:7},
        {key:'ruleOrderType',  label:'Order Type',  icon:'category',       type:'text', col:8},
        {key:'ruleService',    label:'Service',     icon:'build',          type:'text', col:9}
      ]
    }
  };

  // ── State ─────────────────────────────────────────────────────────────────
  var _state = {};   // { tbodyId: { key: value } }
  var _ctx   = {};   // current open popover context
  var _addTbody = '';
  var _popover, _addPanel, _openChipEl, _openAddEl;

  function _init() {
    _popover  = document.getElementById('fs-popover');
    _addPanel = document.getElementById('fs-add-panel');
    document.addEventListener('mousedown', function(e) {
      if (_popover && _popover.style.display !== 'none') {
        if (!_popover.contains(e.target) && !(_openChipEl && _openChipEl.contains(e.target)))
          closePopover();
      }
      if (_addPanel && _addPanel.style.display !== 'none') {
        if (!_addPanel.contains(e.target) && !(_openAddEl && _openAddEl.contains(e.target)))
          closeAddPanel();
      }
    }, true);
  }

  // ── Lookup helpers ────────────────────────────────────────────────────────
  function _cfg(id) { return CONFIGS[id] || {primary:[],extra:[]}; }
  function _def(tbodyId, key) {
    var all = _cfg(tbodyId).primary.concat(_cfg(tbodyId).extra);
    for (var i=0; i<all.length; i++) { if (all[i].key===key) return all[i]; }
    return null;
  }
  function _optLabel(filter, val) {
    // For select/multi with {val,label} objects find the label
    if (!filter.opts) return val;
    for (var i=0; i<filter.opts.length; i++) {
      var o = filter.opts[i];
      if (typeof o === 'object' && o.val === val) return o.label;
    }
    return val;
  }

  // ── Cell value extraction ─────────────────────────────────────────────────
  function _cellVal(row, filter) {
    if (filter.data) return (row.dataset[filter.data] || '').toLowerCase();
    if (filter.col !== null && filter.col !== undefined) {
      var c = row.cells[filter.col];
      return c ? c.textContent.trim().toLowerCase() : '';
    }
    return row.textContent.toLowerCase();
  }

  // ── Row matching ──────────────────────────────────────────────────────────
  function _matches(row, filter, val) {
    var cv = _cellVal(row, filter);
    if (filter.type === 'text')   return !val || cv.indexOf(val.toLowerCase()) !== -1;
    if (filter.type === 'select') return !val || cv.indexOf(val.toLowerCase()) !== -1;
    if (filter.type === 'multi') {
      if (!val || !val.length) return true;
      return val.some(function(v) {
        var label = _optLabel(filter, v).toLowerCase();
        return cv.indexOf(label) !== -1 || cv.indexOf(v.toLowerCase()) !== -1;
      });
    }
    if (filter.type === 'bool') {
      if (val === null || val === undefined || val === '') return true;
      return val === 'true' ? /\by\b|yes|enabled|true/i.test(cv)
                            : /\bn\b|no|disabled|false/i.test(cv);
    }
    if (filter.type === 'num') {
      if (!val || (val.min==='' && val.max==='')) return true;
      var raw = cv.replace(/[^0-9.-]/g,'');
      if (!raw) return true;
      var n = parseFloat(raw)||0;
      if (val.min!==''&&val.min!==undefined&&parseFloat(val.min)>n) return false;
      if (val.max!==''&&val.max!==undefined&&parseFloat(val.max)<n) return false;
      return true;
    }
    if (filter.type === 'daterange') {
      if (!val||(val.from===''&&val.to==='')) return true;
      var d = new Date(cv);
      if (isNaN(d)) return true;
      if (val.from){var df=new Date(val.from);if(!isNaN(df)&&d<df)return false;}
      if (val.to  ){var dt=new Date(val.to);  if(!isNaN(dt)&&d>dt)return false;}
      return true;
    }
    return true;
  }

  // ── Apply all active filters ──────────────────────────────────────────────
  function _applyFilters(tbodyId) {
    var tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    var filters = _state[tbodyId] || {};
    var rows = tbody.querySelectorAll('tr');
    var visible = 0;
    rows.forEach(function(row) {
      var show = true;
      Object.keys(filters).forEach(function(key) {
        if (!show) return;
        var f = _def(tbodyId, key);
        if (f) show = _matches(row, f, filters[key]);
      });
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    var countEl = document.getElementById('fs-count-'+tbodyId);
    if (countEl) countEl.textContent = visible + ' result'+(visible!==1?'s':'');
    var clearEl = document.getElementById('fs-clear-'+tbodyId);
    if (clearEl) clearEl.style.display = Object.keys(filters).length ? '' : 'none';
  }

  // ── Set filter ────────────────────────────────────────────────────────────
  function _set(tbodyId, key, val) {
    if (!_state[tbodyId]) _state[tbodyId]={};
    var empty = val===null||val===undefined||val===''||
      (Array.isArray(val)&&!val.length)||
      (val&&typeof val==='object'&&!Array.isArray(val)&&
       (val.from===''||!val.from)&&(val.to===''||!val.to)&&
       (val.min===''||!val.min)&&(val.max===''||!val.max));
    if (empty) delete _state[tbodyId][key];
    else _state[tbodyId][key]=val;
    _updateChip(tbodyId,key);
    _applyFilters(tbodyId);
  }

  function _valLabel(filter, val) {
    if (filter.type==='bool')      return val==='true'?'Yes':'No';
    if (filter.type==='select')    return _optLabel(filter, val);
    if (filter.type==='text')      return '"'+val+'"';
    if (filter.type==='multi')     return val.map(function(v){return _optLabel(filter,v);}).join(', ');
    if (filter.type==='num')       return (val.min||'')+(val.min&&val.max?'–':'')+(val.max||'');
    if (filter.type==='daterange') return (val.from||'')+(val.from&&val.to?' → ':' ')+(val.to||'');
    return String(val);
  }

  function _updateChip(tbodyId, key) {
    var bar = document.getElementById('fs-bar-'+tbodyId);
    if (!bar) return;
    var chip = bar.querySelector('[data-fkey="'+key+'"]');
    if (!chip) return;
    var filter = _def(tbodyId,key);
    if (!filter) return;
    var val = _state[tbodyId]&&_state[tbodyId][key];
    var lbl = chip.querySelector('.fs-chip-label');
    var hasVal = val!==undefined&&val!==null&&val!==''&&!(Array.isArray(val)&&!val.length);
    if (hasVal) {
      chip.classList.add('fs-active');
      if (lbl) lbl.textContent = filter.label+': '+_valLabel(filter,val);
      if (!chip.querySelector('.fs-chip-x')) {
        var x=document.createElement('span');
        x.className='fs-chip-x mat-icon'; x.textContent='close';
        x.addEventListener('click',function(e){e.stopPropagation();_set(tbodyId,key,null);closePopover();});
        chip.appendChild(x);
      }
    } else {
      chip.classList.remove('fs-active');
      if (lbl) lbl.textContent=filter.label;
      var xe=chip.querySelector('.fs-chip-x'); if(xe) xe.remove();
    }
  }

  // ── Position popover ──────────────────────────────────────────────────────
  function _pos(el, panel) {
    panel.style.display='block';
    var r=el.getBoundingClientRect();
    var top=r.bottom+6; var left=r.left;
    var pw=panel.offsetWidth||260;
    if (left+pw>window.innerWidth-12) left=window.innerWidth-pw-12;
    if (left<8) left=8;
    panel.style.top=top+'px'; panel.style.left=left+'px';
  }

  function closePopover()  { if(_popover)  _popover.style.display='none';  _openChipEl=null; }
  function closeAddPanel() { if(_addPanel) _addPanel.style.display='none'; _openAddEl=null; }

  // ── Open chip ─────────────────────────────────────────────────────────────
  function openChip(el) {
    if (!_popover) _init();
    var tbodyId=el.dataset.ftbody, key=el.dataset.fkey;
    var filter=_def(tbodyId,key);
    if (!filter) return;
    if (_openChipEl===el&&_popover.style.display!=='none'){closePopover();return;}
    closePopover(); closeAddPanel();
    _openChipEl=el; _ctx={tbodyId:tbodyId,key:key};
    var curVal=(_state[tbodyId]&&_state[tbodyId][key])||null;
    _popover.innerHTML=_build(filter,curVal);
    _pos(el,_popover);
  }

  function _e(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  function _build(filter, curVal) {
    var hdr='<div class="fp-header">'
      +'<span><span class="mat-icon" style="font-size:13px;vertical-align:middle;margin-right:4px;">'+filter.icon+'</span>'+_e(filter.label)+'</span>'
      +'<button class="fp-close mat-icon" onclick="FS.closePopover()" style="font-size:16px;">close</button>'
      +'</div>';
    var body='<div class="fp-body">';
    var hasVal=curVal!==null&&curVal!==undefined&&curVal!==''&&!(Array.isArray(curVal)&&!curVal.length);

    if (filter.type==='text') {
      body+='<input class="fp-input" id="fp-inp" type="text" placeholder="Search '+_e(filter.label.toLowerCase())+'..." value="'+_e(curVal||'')+'">'
           +'<button class="fp-apply" onclick="FS.applyText()">Apply</button>';
      if (hasVal) body+='<button class="fp-apply danger" onclick="FS.clearCur()">Clear</button>';
    }
    else if (filter.type==='select') {
      var opts=filter.opts||[];
      body+='<div class="fp-options">';
      opts.forEach(function(opt) {
        var v=typeof opt==='object'?opt.val:opt;
        var lbl=typeof opt==='object'?opt.label:opt;
        var sel=curVal===v;
        body+='<div class="fp-option'+(sel?' selected':'')+'" data-val="'+_e(v)+'" onclick="FS.applySelectOpt(this)">'
             +'<span class="fp-check">'+(sel?'&#10003;':'')+'</span>'+_e(lbl)+'</div>';
      });
      body+='</div>';
      if (hasVal) body+='<button class="fp-apply danger" onclick="FS.clearCur()">Clear Filter</button>';
    }
    else if (filter.type==='multi') {
      var opts=filter.opts||[];
      var selected=Array.isArray(curVal)?curVal:[];
      body+='<input class="fp-input fp-multi-search" id="fp-msearch" type="text" placeholder="Search options..." oninput="FS.multiSearch(this)">'
           +'<div class="fp-options" id="fp-mopts">';
      opts.forEach(function(opt) {
        var v=typeof opt==='object'?opt.val:opt;
        var lbl=typeof opt==='object'?opt.label:opt;
        var sel=selected.indexOf(v)!==-1;
        body+='<div class="fp-option'+(sel?' selected':'')+'" data-val="'+_e(v)+'" onclick="FS.applyMultiOpt(this)">'
             +'<span class="fp-check">'+(sel?'&#10003;':'')+'</span>'+_e(lbl)+'</div>';
      });
      body+='</div>';
      if (selected.length) body+='<button class="fp-apply" onclick="FS.applyMulti()" style="margin-top:6px;">Apply ('+selected.length+' selected)</button>';
      else body+='<button class="fp-apply" onclick="FS.applyMulti()" style="margin-top:6px;">Apply</button>';
      if (hasVal) body+='<button class="fp-apply danger" onclick="FS.clearCur()">Clear All</button>';
    }
    else if (filter.type==='bool') {
      body+='<div class="fp-bool-row">'
           +'<button class="fp-bool-btn'+(curVal==='true'?' selected':'')+'" data-val="true" onclick="FS.applyBoolOpt(this)">Yes</button>'
           +'<button class="fp-bool-btn'+(curVal==='false'?' selected':'')+'" data-val="false" onclick="FS.applyBoolOpt(this)">No</button>'
           +'</div>';
      if (hasVal) body+='<button class="fp-apply danger" style="margin-top:8px;" onclick="FS.clearCur()">Clear Filter</button>';
    }
    else if (filter.type==='num') {
      var minV=(curVal&&curVal.min)?_e(curVal.min):'';
      var maxV=(curVal&&curVal.max)?_e(curVal.max):'';
      body+='<div class="fp-row">'
           +'<div><label>Min</label><input class="fp-input" id="fp-nmin" type="number" placeholder="Min" value="'+minV+'" style="margin-bottom:0;"></div>'
           +'<div><label>Max</label><input class="fp-input" id="fp-nmax" type="number" placeholder="Max" value="'+maxV+'" style="margin-bottom:0;"></div>'
           +'</div>'
           +'<button class="fp-apply" onclick="FS.applyNum()">Apply</button>';
      if (hasVal) body+='<button class="fp-apply danger" onclick="FS.clearCur()">Clear</button>';
    }
    else if (filter.type==='daterange') {
      var fv=(curVal&&curVal.from)?_e(curVal.from):'';
      var tv=(curVal&&curVal.to)?_e(curVal.to):'';
      body+='<label style="font-size:11px;color:#6b7280;margin-bottom:3px;display:block;">From</label>'
           +'<input class="fp-input" id="fp-dfrom" type="date" value="'+fv+'" style="margin-bottom:8px;color-scheme:light dark;">'
           +'<label style="font-size:11px;color:#6b7280;margin-bottom:3px;display:block;">To</label>'
           +'<input class="fp-input" id="fp-dto"   type="date" value="'+tv+'" style="margin-bottom:8px;color-scheme:light dark;">'
           +'<button class="fp-apply" onclick="FS.applyDate()">Apply</button>';
      if (hasVal) body+='<button class="fp-apply danger" onclick="FS.clearCur()">Clear</button>';
    }

    return hdr+body+'</div>';
  }

  // ── Apply handlers (read from _ctx / DOM — no string-param injections) ────
  function applyText() {
    var inp=document.getElementById('fp-inp'); if(!inp)return;
    _set(_ctx.tbodyId,_ctx.key,inp.value.trim()); closePopover();
  }
  function applySelectOpt(el) {
    var v=el.dataset.val;
    if ((_state[_ctx.tbodyId]||{})[_ctx.key]===v){clearCur();return;}
    _set(_ctx.tbodyId,_ctx.key,v); closePopover();
  }
  function applyBoolOpt(el) {
    var v=el.dataset.val;
    if ((_state[_ctx.tbodyId]||{})[_ctx.key]===v){clearCur();return;}
    _set(_ctx.tbodyId,_ctx.key,v); closePopover();
  }
  function applyNum() {
    var mi=document.getElementById('fp-nmin'), ma=document.getElementById('fp-nmax');
    _set(_ctx.tbodyId,_ctx.key,{min:mi?mi.value.trim():'',max:ma?ma.value.trim():''}); closePopover();
  }
  function applyDate() {
    var fd=document.getElementById('fp-dfrom'), td=document.getElementById('fp-dto');
    _set(_ctx.tbodyId,_ctx.key,{from:fd?fd.value:'',to:td?td.value:''}); closePopover();
  }
  function applyMultiOpt(el) {
    // Toggle this option in the pending selection shown in the popover
    el.classList.toggle('selected');
    var check=el.querySelector('.fp-check');
    if (check) check.innerHTML=el.classList.contains('selected')?'&#10003;':'';
    // Update apply button count
    var opts=_popover.querySelectorAll('.fp-options .fp-option.selected');
    var btn=_popover.querySelector('.fp-apply:not(.danger)');
    if (btn) btn.textContent='Apply'+(opts.length?' ('+opts.length+' selected)':'');
  }
  function applyMulti() {
    var opts=_popover.querySelectorAll('.fp-options .fp-option.selected');
    var vals=[];
    opts.forEach(function(o){vals.push(o.dataset.val);});
    _set(_ctx.tbodyId,_ctx.key,vals); closePopover();
  }
  function multiSearch(inp) {
    var q=inp.value.toLowerCase();
    var opts=document.getElementById('fp-mopts');
    if(!opts)return;
    opts.querySelectorAll('.fp-option').forEach(function(o){
      o.style.display=o.textContent.toLowerCase().indexOf(q)!==-1?'':'none';
    });
  }
  function clearCur() { _set(_ctx.tbodyId,_ctx.key,null); closePopover(); }

  // ── Clear all ─────────────────────────────────────────────────────────────
  function clearAll(tbodyId) {
    _state[tbodyId]={};
    var bar=document.getElementById('fs-bar-'+tbodyId);
    if (bar) bar.querySelectorAll('[data-fkey]').forEach(function(c){ _updateChip(tbodyId,c.dataset.fkey); });
    _applyFilters(tbodyId); closePopover(); closeAddPanel();
  }

  // ── Add Filter panel ──────────────────────────────────────────────────────
  function openAddPanel(btnEl, tbodyId) {
    if (!_addPanel) _init();
    if (_openAddEl===btnEl&&_addPanel.style.display!=='none'){closeAddPanel();return;}
    closePopover(); closeAddPanel();
    _openAddEl=btnEl; _addTbody=tbodyId;
    var bar=document.getElementById('fs-bar-'+tbodyId);
    var shown={};
    if (bar) bar.querySelectorAll('[data-fkey]').forEach(function(c){shown[c.dataset.fkey]=true;});
    var extras=_cfg(tbodyId).extra.filter(function(f){return!shown[f.key];});
    var inner='<div class="fp-header"><span>Add Filter</span>'
      +'<button class="fp-close mat-icon" onclick="FS.closeAddPanel()" style="font-size:16px;">close</button></div>';
    if (!extras.length) {
      inner+='<div class="fp-body" style="color:#9ca3af;font-size:12px;">All filters are already shown.</div>';
    } else {
      inner+='<div class="fa-grid">';
      extras.forEach(function(f){
        inner+='<div class="fa-chip" data-fkey="'+_e(f.key)+'" onclick="FS.addExtraChip(this)">'
              +'<span class="mat-icon" style="font-size:12px;">'+f.icon+'</span> '+_e(f.label)+'</div>';
      });
      inner+='</div>';
    }
    _addPanel.innerHTML=inner;
    _pos(btnEl,_addPanel);
  }

  function addExtraChip(el) {
    var key=el.dataset.fkey, f=_def(_addTbody,key);
    if (!f) return;
    var bar=document.getElementById('fs-bar-'+_addTbody);
    if (!bar||bar.querySelector('[data-fkey="'+key+'"]')){closeAddPanel();return;}
    var addBtn=bar.querySelector('.dt-chip-add');
    var chip=document.createElement('button');
    chip.className='dt-chip'; chip.dataset.ftbody=_addTbody; chip.dataset.fkey=key;
    chip.innerHTML='<span class="mat-icon" style="font-size:13px;">'+f.icon+'</span> <span class="fs-chip-label">'+_e(f.label)+'</span>';
    chip.addEventListener('click',function(){FS.openChip(chip);});
    var row=bar.querySelector('.filter-chips-row');
    if (addBtn) row.insertBefore(chip,addBtn); else row.appendChild(chip);
    closeAddPanel(); openChip(chip);
  }

  document.addEventListener('DOMContentLoaded', _init);

  return {
    openChip:      openChip,
    closePopover:  closePopover,
    closeAddPanel: closeAddPanel,
    openAddPanel:  openAddPanel,
    addExtraChip:  addExtraChip,
    applyText:     applyText,
    applySelectOpt:applySelectOpt,
    applyBoolOpt:  applyBoolOpt,
    applyNum:      applyNum,
    applyDate:     applyDate,
    applyMultiOpt: applyMultiOpt,
    applyMulti:    applyMulti,
    multiSearch:   multiSearch,
    clearCur:      clearCur,
    clearAll:      clearAll
  };
})();

