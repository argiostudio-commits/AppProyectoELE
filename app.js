/* =========================================================================
   app.js — lógica de la aplicación "Presupuestos"
   Vanilla JS, sin dependencias externas. Ver storage.js para la capa de
   datos (DB) y los formateadores (formatMoney, formatDateAR, etc.)
   ========================================================================= */

const state = {
  view: 'home',
  step: 1,
  draft: null,          // presupuesto en edición (objeto completo)
  editingBudgetId: null, // si no es null, estamos editando un presupuesto ya guardado
  currentAmbienteId: null,
  editingJobId: null,    // id del trabajo que se está editando en el modal (null = nuevo)
  editingCatalogId: null,
  confirmCallback: null
};

let autosaveTimer = null;

document.addEventListener('DOMContentLoaded', init);

function init(){
  renderTopbar();
  bindNav();
  bindHomeView();
  bindBudgetsView();
  bindEditorView();
  bindDetailView();
  bindPricesView();
  bindSettingsView();
  bindModalsGeneric();
  checkForDraft();
  goToView('home');
  registerServiceWorker();
}

/* =========================================================================
   TOP BAR / MARCA
   ========================================================================= */
function renderTopbar(){
  const cfg = DB.getConfig();
  const nameEl = document.getElementById('brandName');
  const subEl = document.getElementById('brandSub');
  const logoEl = document.getElementById('brandLogo');
  nameEl.textContent = cfg.companyName || 'Presupuestos';
  subEl.textContent = [cfg.phone, cfg.locality].filter(Boolean).join(' · ');
  if(cfg.logo){
    logoEl.src = cfg.logo;
    logoEl.hidden = false;
  }else{
    logoEl.hidden = true;
  }
}

/* =========================================================================
   NAVEGACIÓN ENTRE VISTAS
   ========================================================================= */
function bindNav(){
  document.querySelectorAll('.navbtn').forEach(btn => {
    btn.addEventListener('click', () => goToView(btn.dataset.view));
  });
}

function goToView(view){
  if((state.view === 'editor') && view !== 'editor'){
    // al salir del editor por la nav, el borrador ya quedó autoguardado
  }
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
  document.querySelectorAll('.navbtn').forEach(b => {
    const active = b.dataset.view === view;
    b.toggleAttribute('aria-current', active);
    if(active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if(view === 'home') renderHome();
  if(view === 'budgets') renderBudgetsList();
  if(view === 'prices') renderCatalogList();
  if(view === 'settings') renderSettings();
  window.scrollTo(0, 0);
}

/* =========================================================================
   TOAST + CONFIRMACIÓN GENÉRICA
   ========================================================================= */
let toastTimer = null;
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function bindModalsGeneric(){
  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
  document.getElementById('confirmOk').addEventListener('click', () => {
    const cb = state.confirmCallback;
    closeConfirm();
    if(cb) cb();
  });
}

function askConfirm(message, onConfirm){
  document.getElementById('confirmMessage').textContent = message;
  state.confirmCallback = onConfirm;
  document.getElementById('confirmOverlay').hidden = false;
}
function closeConfirm(){
  document.getElementById('confirmOverlay').hidden = true;
  state.confirmCallback = null;
}

/* =========================================================================
   INICIO
   ========================================================================= */
function bindHomeView(){
  document.getElementById('btnNewBudgetHome').addEventListener('click', startNewBudget);
  document.getElementById('btnResumeDraft').addEventListener('click', resumeDraft);
  document.getElementById('btnDiscardDraft').addEventListener('click', () => {
    askConfirm('¿Descartar el presupuesto sin terminar? Esta acción no se puede deshacer.', () => {
      DB.clearDraft();
      checkForDraft();
      showToast('Borrador descartado');
    });
  });
}

function checkForDraft(){
  const draft = DB.getDraft();
  const banner = document.getElementById('draftBanner');
  if(draft && !state.editingBudgetId){
    banner.hidden = false;
    const info = document.getElementById('draftInfo');
    const clientName = draft.client && draft.client.name ? draft.client.name : 'Sin nombre de cliente';
    info.textContent = `${clientName} · ${formatDateAR(draft.date)}`;
  }else{
    banner.hidden = true;
  }
}

function renderHome(){
  checkForDraft();
  const budgets = DB.getBudgets().slice(0, 5);
  const wrap = document.getElementById('homeRecentList');
  const emptyHint = document.getElementById('homeEmptyHint');
  wrap.innerHTML = '';
  emptyHint.hidden = budgets.length > 0;
  budgets.forEach(b => wrap.appendChild(buildBudgetCard(b)));
}

function buildBudgetCard(b){
  const card = document.createElement('div');
  card.className = 'budget-card';
  card.innerHTML = `
    <div class="budget-card-main">
      <div class="budget-card-client">${escapeHTML(b.client.name || 'Sin nombre')}</div>
      <div class="budget-card-meta">${formatDateAR(b.date)}</div>
    </div>
    <div class="budget-card-total">${formatMoney(b.totals.total)}</div>
  `;
  card.addEventListener('click', () => openDetail(b.id));
  return card;
}

function escapeHTML(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

/* =========================================================================
   LISTADO COMPLETO DE PRESUPUESTOS
   ========================================================================= */
function bindBudgetsView(){
  document.getElementById('btnNewBudgetList').addEventListener('click', startNewBudget);
  document.getElementById('budgetSearch').addEventListener('input', renderBudgetsList);
}

function renderBudgetsList(){
  const query = (document.getElementById('budgetSearch').value || '').trim().toLowerCase();
  let budgets = DB.getBudgets();
  if(query){
    budgets = budgets.filter(b => (b.client.name || '').toLowerCase().includes(query));
  }
  const wrap = document.getElementById('allBudgetsList');
  const emptyHint = document.getElementById('allBudgetsEmptyHint');
  wrap.innerHTML = '';
  emptyHint.hidden = budgets.length > 0;
  budgets.forEach(b => wrap.appendChild(buildBudgetCard(b)));
}

/* =========================================================================
   EDITOR DE PRESUPUESTO — helpers de creación / cálculo
   ========================================================================= */
function emptyBudget(){
  return {
    id: uid(),
    client: { name: '', phone: '', address: '' },
    date: todayISO(),
    useAmbientes: false,
    ambientes: [],
    jobs: [],
    materials: { mode: 'no_incluidos' },
    useSplit: false,
    laborTotal: 0,
    materialsTotal: 0,
    useRecargo: false,
    recargoPercent: 0,
    recargoFixed: 0,
    useDescuento: false,
    descuentoPercent: 0,
    descuentoFixed: 0,
    useConditions: false,
    conditionsText: '',
    totals: { subtotal: 0, recargo: 0, descuento: 0, total: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function startNewBudget(){
  state.draft = emptyBudget();
  state.editingBudgetId = null;
  state.currentAmbienteId = null;
  document.getElementById('draftBanner').hidden = true;
  openEditor(1);
}

function resumeDraft(){
  const draft = DB.getDraft();
  if(!draft) return;
  state.editingBudgetId = draft.__editingId || null;
  delete draft.__editingId;
  state.draft = draft;
  state.currentAmbienteId = draft.ambientes && draft.ambientes[0] ? draft.ambientes[0].id : null;
  openEditor(1);
}

function editExistingBudget(id){
  const b = DB.getBudget(id);
  if(!b) return;
  state.draft = JSON.parse(JSON.stringify(b));
  state.editingBudgetId = id;
  state.currentAmbienteId = state.draft.ambientes && state.draft.ambientes[0] ? state.draft.ambientes[0].id : null;
  openEditor(1);
}

function openEditor(step){
  fillEditorFromDraft();
  goToStep(step || 1);
  goToView('editor');
}

function bindEditorView(){
  document.getElementById('btnEditorClose').addEventListener('click', () => {
    askConfirm('¿Salir? El progreso queda guardado como borrador y podés continuar más tarde.', () => {
      goToView(state.editingBudgetId ? 'detail' : 'home');
    });
  });

  document.querySelectorAll('.step').forEach(s => {
    s.addEventListener('click', () => {
      const target = parseInt(s.dataset.step, 10);
      if(target < state.step || s.classList.contains('done')) goToStep(target);
    });
  });

  // ---- Paso 1 ----
  ['clientName', 'clientPhone', 'clientAddress', 'budgetDate'].forEach(id => {
    document.getElementById(id).addEventListener('input', syncStep1ToDraft);
  });
  document.getElementById('useAmbientes').addEventListener('change', onToggleAmbientes);
  document.getElementById('btnStep1Next').addEventListener('click', () => {
    syncStep1ToDraft();
    if(!state.draft.client.name.trim()){
      showToast('Ingresá el nombre del cliente para continuar');
      document.getElementById('clientName').focus();
      return;
    }
    goToStep(2);
  });

  // ---- Paso 2 ----
  document.getElementById('btnAddJob').addEventListener('click', () => openJobModal(null));
  document.getElementById('btnAddAmbiente').addEventListener('click', addAmbiente);
  document.getElementById('btnStep2Back').addEventListener('click', () => goToStep(1));
  document.getElementById('btnStep2Next').addEventListener('click', () => goToStep(3));

  // ---- Paso 3 ----
  document.querySelectorAll('#materialsMode .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.draft.materials.mode = btn.dataset.value;
      renderMaterialsMode();
      autosaveDraft();
    });
  });
  document.getElementById('useSplit').addEventListener('change', (e) => {
    state.draft.useSplit = e.target.checked;
    if(state.draft.useSplit && !state.draft.laborTotal){
      state.draft.laborTotal = round2(computeJobsSubtotal());
    }
    document.getElementById('splitFields').hidden = !state.draft.useSplit;
    recalcTotals();
    autosaveDraft();
  });
  document.getElementById('laborTotal').addEventListener('input', (e) => {
    state.draft.laborTotal = parseMoneyInput(e.target.value);
    recalcTotals(); autosaveDraft();
  });
  document.getElementById('materialsTotal').addEventListener('input', (e) => {
    state.draft.materialsTotal = parseMoneyInput(e.target.value);
    recalcTotals(); autosaveDraft();
  });

  document.getElementById('useRecargo').addEventListener('change', (e) => {
    state.draft.useRecargo = e.target.checked;
    document.getElementById('recargoFields').hidden = !state.draft.useRecargo;
    recalcTotals(); autosaveDraft();
  });
  document.getElementById('recargoPercent').addEventListener('input', (e) => {
    state.draft.recargoPercent = parseMoneyInput(e.target.value);
    recalcTotals(); autosaveDraft();
  });
  document.getElementById('recargoFixed').addEventListener('input', (e) => {
    state.draft.recargoFixed = parseMoneyInput(e.target.value);
    recalcTotals(); autosaveDraft();
  });

  document.getElementById('useDescuento').addEventListener('change', (e) => {
    state.draft.useDescuento = e.target.checked;
    document.getElementById('descuentoFields').hidden = !state.draft.useDescuento;
    recalcTotals(); autosaveDraft();
  });
  document.getElementById('descuentoPercent').addEventListener('input', (e) => {
    state.draft.descuentoPercent = parseMoneyInput(e.target.value);
    recalcTotals(); autosaveDraft();
  });
  document.getElementById('descuentoFixed').addEventListener('input', (e) => {
    state.draft.descuentoFixed = parseMoneyInput(e.target.value);
    recalcTotals(); autosaveDraft();
  });

  document.getElementById('useConditions').addEventListener('change', (e) => {
    state.draft.useConditions = e.target.checked;
    if(state.draft.useConditions && !state.draft.conditionsText){
      state.draft.conditionsText = DB.getConfig().conditionsTemplate || '';
      document.getElementById('conditionsText').value = state.draft.conditionsText;
    }
    document.getElementById('conditionsField').hidden = !state.draft.useConditions;
    autosaveDraft();
  });
  document.getElementById('conditionsText').addEventListener('input', (e) => {
    state.draft.conditionsText = e.target.value;
    autosaveDraft();
  });

  document.getElementById('btnStep3Back').addEventListener('click', () => goToStep(2));
  document.getElementById('btnSaveBudget').addEventListener('click', () => saveBudget(false));
  document.getElementById('btnSavePdf').addEventListener('click', () => saveBudget(true));

  bindJobModal();
}

function syncStep1ToDraft(){
  if(!state.draft) return;
  state.draft.client.name = document.getElementById('clientName').value;
  state.draft.client.phone = document.getElementById('clientPhone').value;
  state.draft.client.address = document.getElementById('clientAddress').value;
  state.draft.date = document.getElementById('budgetDate').value || todayISO();
  autosaveDraft();
}

function fillEditorFromDraft(){
  const d = state.draft;
  document.getElementById('clientName').value = d.client.name || '';
  document.getElementById('clientPhone').value = d.client.phone || '';
  document.getElementById('clientAddress').value = d.client.address || '';
  document.getElementById('budgetDate').value = d.date || todayISO();
  document.getElementById('useAmbientes').checked = !!d.useAmbientes;
  document.getElementById('ambientesWrap').hidden = !d.useAmbientes;

  renderAmbientesTabs();
  renderJobsList();

  // Paso 3
  renderMaterialsMode();
  document.getElementById('useSplit').checked = !!d.useSplit;
  document.getElementById('splitFields').hidden = !d.useSplit;
  document.getElementById('laborTotal').value = d.laborTotal ? formatPlainNumber(d.laborTotal) : '';
  document.getElementById('materialsTotal').value = d.materialsTotal ? formatPlainNumber(d.materialsTotal) : '';

  document.getElementById('useRecargo').checked = !!d.useRecargo;
  document.getElementById('recargoFields').hidden = !d.useRecargo;
  document.getElementById('recargoPercent').value = d.recargoPercent || '';
  document.getElementById('recargoFixed').value = d.recargoFixed ? formatPlainNumber(d.recargoFixed) : '';

  document.getElementById('useDescuento').checked = !!d.useDescuento;
  document.getElementById('descuentoFields').hidden = !d.useDescuento;
  document.getElementById('descuentoPercent').value = d.descuentoPercent || '';
  document.getElementById('descuentoFixed').value = d.descuentoFixed ? formatPlainNumber(d.descuentoFixed) : '';

  document.getElementById('useConditions').checked = !!d.useConditions;
  document.getElementById('conditionsField').hidden = !d.useConditions;
  document.getElementById('conditionsText').value = d.conditionsText || '';

  recalcTotals();
}

function formatPlainNumber(n){
  // para precargar inputs editables sin el símbolo $, con coma decimal
  const num = Number(n) || 0;
  return num % 1 === 0 ? String(num) : String(num).replace('.', ',');
}

function goToStep(step){
  state.step = step;
  [1,2,3].forEach(n => {
    document.getElementById('panel-' + n).hidden = (n !== step);
  });
  document.querySelectorAll('.step').forEach(s => {
    const n = parseInt(s.dataset.step, 10);
    s.classList.toggle('current', n === step);
    s.classList.toggle('done', n < step);
  });
  window.scrollTo(0, 0);
}

/* ---------------- Ambientes ---------------- */
function onToggleAmbientes(e){
  const on = e.target.checked;
  const d = state.draft;
  if(on && !d.useAmbientes){
    // migrar trabajos sueltos a un primer ambiente
    const amb = { id: uid(), name: 'Ambiente 1', jobs: d.jobs.slice() };
    d.ambientes = [amb];
    d.jobs = [];
    state.currentAmbienteId = amb.id;
  }else if(!on && d.useAmbientes){
    // aplanar todos los trabajos de los ambientes
    const allJobs = [];
    d.ambientes.forEach(a => allJobs.push(...a.jobs));
    d.jobs = allJobs;
    d.ambientes = [];
    state.currentAmbienteId = null;
  }
  d.useAmbientes = on;
  document.getElementById('ambientesWrap').hidden = !on;
  renderAmbientesTabs();
  renderJobsList();
  autosaveDraft();
}

function addAmbiente(){
  const name = 'Ambiente ' + (state.draft.ambientes.length + 1);
  const amb = { id: uid(), name, jobs: [] };
  state.draft.ambientes.push(amb);
  state.currentAmbienteId = amb.id;
  renderAmbientesTabs();
  renderJobsList();
  autosaveDraft();
}

function renderAmbientesTabs(){
  const d = state.draft;
  const wrap = document.getElementById('ambientesTabs');
  wrap.innerHTML = '';
  if(!d.useAmbientes) return;
  if(!state.currentAmbienteId && d.ambientes[0]) state.currentAmbienteId = d.ambientes[0].id;
  d.ambientes.forEach(a => {
    const tab = document.createElement('button');
    tab.className = 'ambiente-tab' + (a.id === state.currentAmbienteId ? ' active' : '');
    tab.innerHTML = `<span>${escapeHTML(a.name)}</span>` +
      (d.ambientes.length > 1 ? `<span class="ambiente-remove" data-id="${a.id}">×</span>` : '');
    tab.addEventListener('click', (ev) => {
      if(ev.target.classList.contains('ambiente-remove')){
        ev.stopPropagation();
        askConfirm(`¿Eliminar "${a.name}" y sus trabajos?`, () => {
          d.ambientes = d.ambientes.filter(x => x.id !== a.id);
          if(state.currentAmbienteId === a.id) state.currentAmbienteId = d.ambientes[0] ? d.ambientes[0].id : null;
          renderAmbientesTabs(); renderJobsList(); autosaveDraft();
        });
        return;
      }
      state.currentAmbienteId = a.id;
      renderAmbientesTabs();
      renderJobsList();
    });
    wrap.appendChild(tab);
  });
}

function getActiveJobsArray(){
  const d = state.draft;
  if(!d.useAmbientes) return d.jobs;
  const amb = d.ambientes.find(a => a.id === state.currentAmbienteId);
  return amb ? amb.jobs : [];
}

/* ---------------- Lista de trabajos (paso 2) ---------------- */
function renderJobsList(){
  const jobs = getActiveJobsArray();
  const wrap = document.getElementById('jobsList');
  const emptyHint = document.getElementById('jobsEmptyHint');
  const title = document.getElementById('jobsSectionTitle');
  const d = state.draft;
  if(d.useAmbientes){
    const amb = d.ambientes.find(a => a.id === state.currentAmbienteId);
    title.textContent = amb ? `Trabajos — ${amb.name}` : 'Trabajos';
  }else{
    title.textContent = 'Trabajos';
  }
  wrap.innerHTML = '';
  emptyHint.hidden = jobs.length > 0;
  jobs.forEach(job => wrap.appendChild(buildJobCard(job)));
  updateStickyTotal();
}

function buildJobCard(job){
  const card = document.createElement('div');
  card.className = 'job-card';
  card.innerHTML = `
    <div class="job-card-top">
      <div>
        <div class="job-card-cat">${escapeHTML(job.category)}</div>
        <div class="job-card-title">${escapeHTML(job.description)}</div>
      </div>
      <div class="job-card-sub">${formatMoney(job.subtotal)}</div>
    </div>
    <div class="job-card-meta">${formatPlainNumber(job.quantity)} ${escapeHTML(job.unit)} × ${formatMoney(job.price)}</div>
    <div class="job-card-actions">
      <button class="btn btn-ghost btn-small" data-act="edit">Editar</button>
      <button class="btn btn-danger btn-small" data-act="del">Eliminar</button>
    </div>
  `;
  card.querySelector('[data-act="edit"]').addEventListener('click', () => openJobModal(job.id));
  card.querySelector('[data-act="del"]').addEventListener('click', () => {
    askConfirm('¿Eliminar este trabajo del presupuesto?', () => {
      const arr = getActiveJobsArray();
      const idx = arr.findIndex(j => j.id === job.id);
      if(idx >= 0) arr.splice(idx, 1);
      renderJobsList();
      autosaveDraft();
    });
  });
  return card;
}

function computeJobsSubtotal(){
  const d = state.draft;
  let jobs = [];
  if(d.useAmbientes){
    d.ambientes.forEach(a => jobs.push(...a.jobs));
  }else{
    jobs = d.jobs;
  }
  return jobs.reduce((sum, j) => sum + (j.subtotal || 0), 0);
}

function updateStickyTotal(){
  document.getElementById('stickyTotal').textContent = formatMoney(computeJobsSubtotal());
}

/* ---------------- Modal: agregar / editar trabajo ---------------- */
function bindJobModal(){
  document.getElementById('jobModalClose').addEventListener('click', closeJobModal);
  document.getElementById('jobModalCancel').addEventListener('click', closeJobModal);
  document.getElementById('jobFromCatalog').addEventListener('change', onCatalogPick);
  ['jobQuantity', 'jobPrice'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateJobSubtotalPreview);
  });
  document.getElementById('jobModalSave').addEventListener('click', saveJobFromModal);
}

function openJobModal(jobId){
  state.editingJobId = jobId;
  const modal = document.getElementById('jobModalOverlay');
  const title = document.getElementById('jobModalTitle');
  document.getElementById('jobModalError').hidden = true;

  // poblar categorías
  const catSelect = document.getElementById('jobCategory');
  catSelect.innerHTML = DB.getCategories().map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');

  // poblar catálogo agrupado por categoría
  const catalog = DB.getCatalog();
  const bySel = document.getElementById('jobFromCatalog');
  const groups = {};
  catalog.forEach(item => { (groups[item.category] = groups[item.category] || []).push(item); });
  let optionsHTML = '<option value="">— Trabajo nuevo / manual —</option>';
  Object.keys(groups).forEach(cat => {
    optionsHTML += `<optgroup label="${escapeHTML(cat)}">`;
    groups[cat].forEach(it => {
      optionsHTML += `<option value="${it.id}">${escapeHTML(it.name)}</option>`;
    });
    optionsHTML += '</optgroup>';
  });
  bySel.innerHTML = optionsHTML;

  if(jobId){
    title.textContent = 'Editar trabajo';
    const job = getActiveJobsArray().find(j => j.id === jobId);
    bySel.value = '';
    catSelect.value = job.category;
    document.getElementById('jobDescription').value = job.description;
    document.getElementById('jobUnit').value = job.unit;
    document.getElementById('jobQuantity').value = formatPlainNumber(job.quantity);
    document.getElementById('jobPrice').value = job.price ? formatPlainNumber(job.price) : '';
  }else{
    title.textContent = 'Agregar trabajo';
    bySel.value = '';
    catSelect.value = DB.getCategories()[0] || '';
    document.getElementById('jobDescription').value = '';
    document.getElementById('jobUnit').value = 'm²';
    document.getElementById('jobQuantity').value = '';
    document.getElementById('jobPrice').value = '';
  }
  updateJobSubtotalPreview();
  modal.hidden = false;
}

function closeJobModal(){
  document.getElementById('jobModalOverlay').hidden = true;
  state.editingJobId = null;
}

function onCatalogPick(e){
  const id = e.target.value;
  if(!id) return;
  const item = DB.getCatalog().find(i => i.id === id);
  if(!item) return;
  document.getElementById('jobCategory').value = item.category;
  document.getElementById('jobDescription').value = item.description || item.name;
  document.getElementById('jobUnit').value = item.unit;
  document.getElementById('jobPrice').value = formatPlainNumber(item.price);
  updateJobSubtotalPreview();
}

function updateJobSubtotalPreview(){
  const qty = parseMoneyInput(document.getElementById('jobQuantity').value);
  const price = parseMoneyInput(document.getElementById('jobPrice').value);
  document.getElementById('jobSubtotalPreview').textContent = formatMoney(qty * price);
}

function saveJobFromModal(){
  const category = document.getElementById('jobCategory').value;
  const description = document.getElementById('jobDescription').value.trim();
  const unit = document.getElementById('jobUnit').value;
  const qty = parseMoneyInput(document.getElementById('jobQuantity').value);
  const price = parseMoneyInput(document.getElementById('jobPrice').value);
  const errEl = document.getElementById('jobModalError');

  if(!description){
    errEl.textContent = 'Escribí una descripción del trabajo.';
    errEl.hidden = false; return;
  }
  if(!qty || qty <= 0){
    errEl.textContent = 'La cantidad tiene que ser mayor a cero.';
    errEl.hidden = false; return;
  }
  if(qty < 0 || price < 0){
    errEl.textContent = 'No se permiten valores negativos.';
    errEl.hidden = false; return;
  }
  if(price === 0){
    errEl.textContent = 'Falta cargar el precio unitario.';
    errEl.hidden = false; return;
  }
  errEl.hidden = true;

  const arr = getActiveJobsArray();
  const subtotal = round2(qty * price);
  if(state.editingJobId){
    const job = arr.find(j => j.id === state.editingJobId);
    Object.assign(job, { category, description, unit, quantity: qty, price, subtotal });
  }else{
    arr.push({ id: uid(), category, description, unit, quantity: qty, price, subtotal });
  }
  closeJobModal();
  renderJobsList();
  recalcTotals();
  autosaveDraft();
}

/* ---------------- Paso 3: materiales / recargos / totales ---------------- */
function renderMaterialsMode(){
  const mode = state.draft.materials.mode || 'no_incluidos';
  document.querySelectorAll('#materialsMode .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === mode);
  });
}

function recalcTotals(){
  const d = state.draft;
  const jobsSubtotal = computeJobsSubtotal();
  let subtotal = jobsSubtotal;
  if(d.useSplit){
    subtotal = round2((d.laborTotal || 0) + (d.materialsTotal || 0));
  }
  let recargo = 0;
  if(d.useRecargo){
    recargo = round2(subtotal * ((d.recargoPercent || 0) / 100) + (d.recargoFixed || 0));
  }
  let descuento = 0;
  if(d.useDescuento){
    descuento = round2(subtotal * ((d.descuentoPercent || 0) / 100) + (d.descuentoFixed || 0));
  }
  const total = round2(subtotal + recargo - descuento);
  d.totals = { subtotal: round2(subtotal), recargo, descuento, total, jobsSubtotal: round2(jobsSubtotal) };

  document.getElementById('totSubtotal').textContent = formatMoney(d.totals.subtotal);
  document.getElementById('totRecargoRow').hidden = recargo === 0;
  document.getElementById('totRecargo').textContent = formatMoney(recargo);
  document.getElementById('totDescuentoRow').hidden = descuento === 0;
  document.getElementById('totDescuento').textContent = '- ' + formatMoney(descuento);
  document.getElementById('totFinal').textContent = formatMoney(total);
  updateStickyTotal();
}

/* ---------------- Autoguardado ---------------- */
function autosaveDraft(){
  if(!state.draft) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const toSave = JSON.parse(JSON.stringify(state.draft));
    toSave.__editingId = state.editingBudgetId;
    DB.saveDraft(toSave);
  }, 300);
}

/* ---------------- Guardar presupuesto ---------------- */
function saveBudget(thenPrint){
  syncStep1ToDraft();
  const d = state.draft;
  if(!d.client.name.trim()){
    showToast('Falta el nombre del cliente');
    goToStep(1);
    return;
  }
  recalcTotals();
  d.updatedAt = new Date().toISOString();
  DB.upsertBudget(d);
  DB.clearDraft();
  const wasEditing = !!state.editingBudgetId;
  state.editingBudgetId = d.id;
  showToast(wasEditing ? 'Presupuesto actualizado' : 'Presupuesto guardado');
  if(thenPrint){
    printBudget(d);
  }
  openDetail(d.id, true);
}

/* =========================================================================
   FICHA DE DETALLE DE UN PRESUPUESTO GUARDADO
   ========================================================================= */
function bindDetailView(){
  document.getElementById('btnDetailClose').addEventListener('click', () => goToView('budgets'));
  document.getElementById('btnDetailEdit').addEventListener('click', () => {
    editExistingBudget(state.detailId);
  });
  document.getElementById('btnDetailDuplicate').addEventListener('click', () => {
    const b = DB.getBudget(state.detailId);
    if(!b) return;
    const copy = JSON.parse(JSON.stringify(b));
    copy.id = uid();
    copy.date = todayISO();
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    DB.upsertBudget(copy);
    showToast('Presupuesto duplicado');
    openDetail(copy.id);
  });
  document.getElementById('btnDetailPdf').addEventListener('click', () => {
    const b = DB.getBudget(state.detailId);
    if(b) printBudget(b);
  });
  document.getElementById('btnDetailDelete').addEventListener('click', () => {
    askConfirm('¿Eliminar este presupuesto? No se puede deshacer.', () => {
      DB.deleteBudget(state.detailId);
      showToast('Presupuesto eliminado');
      goToView('budgets');
    });
  });
}

function openDetail(id, replaceView){
  state.detailId = id;
  const b = DB.getBudget(id);
  if(!b) return;
  document.getElementById('detailTitle').textContent = b.client.name || 'Presupuesto';
  document.getElementById('detailContent').innerHTML = buildDetailHTML(b);
  state.view = 'detail';
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === 'detail'));
  document.querySelectorAll('.navbtn').forEach(b2 => b2.removeAttribute('aria-current'));
  window.scrollTo(0, 0);
}

function buildDetailHTML(b){
  const jobsHTML = (jobs) => jobs.map(j => `
    <div class="detail-row"><span>${escapeHTML(j.description)} (${formatPlainNumber(j.quantity)} ${escapeHTML(j.unit)})</span><strong>${formatMoney(j.subtotal)}</strong></div>
  `).join('');

  let jobsBlock = '';
  if(b.useAmbientes){
    jobsBlock = b.ambientes.map(a => `
      <div class="detail-block">
        <h3>${escapeHTML(a.name)}</h3>
        ${jobsHTML(a.jobs)}
      </div>
    `).join('');
  }else{
    jobsBlock = `<div class="detail-block"><h3>Trabajos</h3>${jobsHTML(b.jobs)}</div>`;
  }

  const materialsLabel = { incluidos: 'Incluidos', no_incluidos: 'No incluidos', a_cargo_cliente: 'A cargo del cliente' }[b.materials.mode] || '';

  return `
    <div class="detail-block">
      <h3>Cliente</h3>
      <div class="detail-row"><span>Nombre</span><strong>${escapeHTML(b.client.name)}</strong></div>
      ${b.client.phone ? `<div class="detail-row"><span>Teléfono</span><strong>${escapeHTML(b.client.phone)}</strong></div>` : ''}
      ${b.client.address ? `<div class="detail-row"><span>Dirección</span><strong>${escapeHTML(b.client.address)}</strong></div>` : ''}
      <div class="detail-row"><span>Fecha</span><strong>${formatDateAR(b.date)}</strong></div>
    </div>
    ${jobsBlock}
    <div class="detail-block">
      <h3>Materiales</h3>
      <div class="detail-row"><span>Condición</span><strong>${materialsLabel}</strong></div>
      ${b.useSplit ? `
        <div class="detail-row"><span>Mano de obra</span><strong>${formatMoney(b.laborTotal)}</strong></div>
        <div class="detail-row"><span>Materiales</span><strong>${formatMoney(b.materialsTotal)}</strong></div>
      ` : ''}
    </div>
    <div class="detail-block">
      <h3>Totales</h3>
      <div class="detail-row"><span>Subtotal</span><strong>${formatMoney(b.totals.subtotal)}</strong></div>
      ${b.totals.recargo ? `<div class="detail-row"><span>Recargo</span><strong>${formatMoney(b.totals.recargo)}</strong></div>` : ''}
      ${b.totals.descuento ? `<div class="detail-row"><span>Descuento</span><strong>- ${formatMoney(b.totals.descuento)}</strong></div>` : ''}
      <div class="detail-row totals-final"><span>TOTAL</span><strong>${formatMoney(b.totals.total)}</strong></div>
    </div>
    ${b.useConditions && b.conditionsText ? `
      <div class="detail-block"><h3>Condiciones</h3><p style="white-space:pre-wrap;font-size:13.5px;color:var(--text-muted);">${escapeHTML(b.conditionsText)}</p></div>
    ` : ''}
  `;
}

/* =========================================================================
   CATÁLOGO DE PRECIOS
   ========================================================================= */
function bindPricesView(){
  document.getElementById('btnAddCatalogItem').addEventListener('click', () => openCatalogModal(null));
  document.getElementById('catalogModalClose').addEventListener('click', closeCatalogModal);
  document.getElementById('catalogModalCancel').addEventListener('click', closeCatalogModal);
  document.getElementById('catalogModalSave').addEventListener('click', saveCatalogModal);
  document.getElementById('catalogModalDelete').addEventListener('click', () => {
    askConfirm('¿Eliminar este trabajo del catálogo? No afecta a presupuestos ya guardados.', () => {
      DB.deleteCatalogItem(state.editingCatalogId);
      closeCatalogModal();
      renderCatalogList();
      showToast('Trabajo eliminado del catálogo');
    });
  });

  document.getElementById('btnUpdatePrices').addEventListener('click', openBulkPrices);
  document.getElementById('bulkPricesClose').addEventListener('click', closeBulkPrices);
  document.getElementById('bulkPricesCancel').addEventListener('click', closeBulkPrices);
  document.getElementById('bulkPricesSave').addEventListener('click', saveBulkPrices);
}

function renderCatalogList(){
  const items = DB.getCatalog();
  const wrap = document.getElementById('catalogList');
  const emptyHint = document.getElementById('catalogEmptyHint');
  wrap.innerHTML = '';
  emptyHint.hidden = items.length > 0;
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'catalog-card';
    card.innerHTML = `
      <div>
        <div class="catalog-card-cat">${escapeHTML(item.category)}</div>
        <div class="catalog-card-name">${escapeHTML(item.name)}</div>
      </div>
      <div class="catalog-card-price">${formatMoney(item.price)}<small>por ${escapeHTML(item.unit)}</small></div>
    `;
    card.addEventListener('click', () => openCatalogModal(item.id));
    wrap.appendChild(card);
  });
}

function openCatalogModal(id){
  state.editingCatalogId = id;
  const catSelect = document.getElementById('catCategory');
  catSelect.innerHTML = DB.getCategories().map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
  document.getElementById('catalogModalError').hidden = true;
  document.getElementById('catalogModalDelete').style.display = id ? 'inline-flex' : 'none';

  if(id){
    const item = DB.getCatalog().find(i => i.id === id);
    document.getElementById('catalogModalTitle').textContent = 'Editar trabajo';
    catSelect.value = item.category;
    document.getElementById('catName').value = item.name;
    document.getElementById('catDescription').value = item.description || '';
    document.getElementById('catUnit').value = item.unit;
    document.getElementById('catPrice').value = formatPlainNumber(item.price);
  }else{
    document.getElementById('catalogModalTitle').textContent = 'Agregar trabajo';
    catSelect.value = DB.getCategories()[0] || '';
    document.getElementById('catName').value = '';
    document.getElementById('catDescription').value = '';
    document.getElementById('catUnit').value = 'm²';
    document.getElementById('catPrice').value = '';
  }
  document.getElementById('catalogModalOverlay').hidden = false;
}

function closeCatalogModal(){
  document.getElementById('catalogModalOverlay').hidden = true;
  state.editingCatalogId = null;
}

function saveCatalogModal(){
  const category = document.getElementById('catCategory').value;
  const name = document.getElementById('catName').value.trim();
  const description = document.getElementById('catDescription').value.trim();
  const unit = document.getElementById('catUnit').value;
  const price = parseMoneyInput(document.getElementById('catPrice').value);
  const errEl = document.getElementById('catalogModalError');

  if(!name){
    errEl.textContent = 'Escribí el nombre del trabajo.'; errEl.hidden = false; return;
  }
  if(price < 0){
    errEl.textContent = 'El precio no puede ser negativo.'; errEl.hidden = false; return;
  }
  errEl.hidden = true;

  const item = {
    id: state.editingCatalogId || uid(),
    category, name, description: description || name, unit, price
  };
  DB.upsertCatalogItem(item);
  closeCatalogModal();
  renderCatalogList();
  showToast('Catálogo actualizado');
}

function openBulkPrices(){
  const items = DB.getCatalog();
  const wrap = document.getElementById('bulkPricesList');
  wrap.innerHTML = items.map(item => `
    <div class="bulk-price-row" data-id="${item.id}">
      <div class="bulk-price-row-info">
        <div class="bulk-price-row-name">${escapeHTML(item.name)}</div>
        <div class="bulk-price-row-unit">${escapeHTML(item.category)} · por ${escapeHTML(item.unit)}</div>
      </div>
      <input type="text" inputmode="decimal" class="input bulk-price-input" value="${formatPlainNumber(item.price)}">
    </div>
  `).join('');
  document.getElementById('bulkPricesOverlay').hidden = false;
}
function closeBulkPrices(){
  document.getElementById('bulkPricesOverlay').hidden = true;
}
function saveBulkPrices(){
  const rows = document.querySelectorAll('#bulkPricesList .bulk-price-row');
  const items = DB.getCatalog();
  rows.forEach(row => {
    const id = row.dataset.id;
    const val = parseMoneyInput(row.querySelector('.bulk-price-input').value);
    const item = items.find(i => i.id === id);
    if(item && val >= 0) item.price = val;
  });
  DB.saveCatalog(items);
  closeBulkPrices();
  renderCatalogList();
  showToast('Precios actualizados');
}

/* =========================================================================
   CONFIGURACIÓN
   ========================================================================= */
function bindSettingsView(){
  document.getElementById('btnSaveCompany').addEventListener('click', () => {
    const cfg = DB.getConfig();
    cfg.companyName = document.getElementById('cfgCompanyName').value.trim();
    cfg.phone = document.getElementById('cfgPhone').value.trim();
    cfg.locality = document.getElementById('cfgLocality').value.trim();
    DB.saveConfig(cfg);
    renderTopbar();
    showToast('Datos de la empresa guardados');
  });

  document.getElementById('cfgLogoInput').addEventListener('change', onLogoSelected);
  document.getElementById('btnRemoveLogo').addEventListener('click', () => {
    const cfg = DB.getConfig();
    cfg.logo = '';
    DB.saveConfig(cfg);
    renderTopbar();
    renderSettings();
    showToast('Logo quitado');
  });

  document.getElementById('btnSaveConditions').addEventListener('click', () => {
    const cfg = DB.getConfig();
    cfg.conditionsTemplate = document.getElementById('cfgConditionsTemplate').value;
    DB.saveConfig(cfg);
    showToast('Plantilla de condiciones guardada');
  });

  document.getElementById('btnAddCategory').addEventListener('click', () => {
    const input = document.getElementById('newCategoryInput');
    const val = input.value.trim();
    if(!val) return;
    DB.addCategory(val);
    input.value = '';
    renderCategoriesChips();
  });

  document.getElementById('btnExportBackup').addEventListener('click', exportBackup);
  document.getElementById('importBackupInput').addEventListener('change', onImportBackupSelected);
}

function renderSettings(){
  const cfg = DB.getConfig();
  document.getElementById('cfgCompanyName').value = cfg.companyName || '';
  document.getElementById('cfgPhone').value = cfg.phone || '';
  document.getElementById('cfgLocality').value = cfg.locality || '';
  const preview = document.getElementById('cfgLogoPreview');
  if(cfg.logo){ preview.src = cfg.logo; preview.hidden = false; } else { preview.hidden = true; }
  document.getElementById('cfgConditionsTemplate').value = cfg.conditionsTemplate || DEFAULT_CONDITIONS;
  renderCategoriesChips();
}

function renderCategoriesChips(){
  const cats = DB.getCategories();
  const wrap = document.getElementById('categoriesList');
  wrap.innerHTML = '';
  cats.forEach(cat => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<span>${escapeHTML(cat)}</span><button aria-label="Eliminar categoría">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      askConfirm(`¿Eliminar la categoría "${cat}"? Los trabajos ya cargados con esta categoría no se modifican.`, () => {
        DB.removeCategory(cat);
        renderCategoriesChips();
      });
    });
    wrap.appendChild(chip);
  });
}

function onLogoSelected(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      // Redimensionar a un máximo razonable para no ocupar demasiado espacio
      const maxSize = 300;
      let { width, height } = img;
      if(width > maxSize || height > maxSize){
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const dataURL = canvas.toDataURL('image/png');
      const cfg = DB.getConfig();
      cfg.logo = dataURL;
      DB.saveConfig(cfg);
      renderTopbar();
      renderSettings();
      showToast('Logo actualizado');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function exportBackup(){
  const data = DB.exportBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = todayISO();
  a.href = url;
  a.download = `presupuestos-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Copia de seguridad descargada');
}

function onImportBackupSelected(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    let data;
    try{
      data = JSON.parse(ev.target.result);
    }catch(err){
      showToast('El archivo no es una copia de seguridad válida');
      return;
    }
    askConfirm('Esto va a reemplazar los datos actuales (empresa, precios y presupuestos) por los del archivo. ¿Continuar?', () => {
      try{
        DB.importBackup(data);
        showToast('Copia de seguridad importada correctamente');
        renderTopbar();
        renderSettings();
        renderHome();
      }catch(err){
        showToast('No se pudo importar el archivo');
      }
    });
    e.target.value = '';
  };
  reader.readAsText(file);
}

/* =========================================================================
   IMPRESIÓN / PDF
   ========================================================================= */
function printBudget(b){
  const cfg = DB.getConfig();
  const printArea = document.getElementById('printArea');

  const rows = (jobs) => jobs.map(j => `
    <tr>
      <td>${escapeHTML(j.category)}</td>
      <td>${escapeHTML(j.description)}</td>
      <td class="num">${formatPlainNumber(j.quantity)}</td>
      <td>${escapeHTML(j.unit)}</td>
      <td class="num">${formatMoney(j.price)}</td>
      <td class="num">${formatMoney(j.subtotal)}</td>
    </tr>
  `).join('');

  const tableHead = `
    <tr><th>Tipo</th><th>Descripción</th><th class="num">Cant.</th><th>Unidad</th><th class="num">Precio</th><th class="num">Total</th></tr>
  `;

  let jobsHTML = '';
  if(b.useAmbientes){
    jobsHTML = b.ambientes.map(a => `
      <div class="print-ambiente-title">${escapeHTML(a.name)}</div>
      <table class="print-table"><thead>${tableHead}</thead><tbody>${rows(a.jobs)}</tbody></table>
    `).join('');
  }else{
    jobsHTML = `<table class="print-table"><thead>${tableHead}</thead><tbody>${rows(b.jobs)}</tbody></table>`;
  }

  const materialsLabel = { incluidos: 'Incluidos', no_incluidos: 'No incluidos', a_cargo_cliente: 'A cargo del cliente' }[b.materials.mode] || '';

  let materialsHTML = `<div class="print-materials"><strong>Materiales:</strong> ${materialsLabel}</div>`;
  if(b.useSplit){
    materialsHTML += `
      <div class="print-totals" style="margin-top:6px;">
        <div class="row"><span>Mano de obra</span><span>${formatMoney(b.laborTotal)}</span></div>
        <div class="row"><span>Materiales</span><span>${formatMoney(b.materialsTotal)}</span></div>
      </div>`;
  }

  const totalsHTML = `
    <div class="print-totals">
      <div class="row"><span>Subtotal</span><span>${formatMoney(b.totals.subtotal)}</span></div>
      ${b.totals.recargo ? `<div class="row"><span>Recargo</span><span>${formatMoney(b.totals.recargo)}</span></div>` : ''}
      ${b.totals.descuento ? `<div class="row"><span>Descuento</span><span>- ${formatMoney(b.totals.descuento)}</span></div>` : ''}
      <div class="row final"><span>TOTAL</span><span>${formatMoney(b.totals.total)}</span></div>
    </div>
  `;

  const conditionsHTML = (b.useConditions && b.conditionsText)
    ? `<div class="print-conditions">${escapeHTML(b.conditionsText)}</div>` : '';

  printArea.innerHTML = `
    <div class="print-header">
      ${cfg.logo ? `<img src="${cfg.logo}">` : ''}
      <div>
        <h1>${escapeHTML(cfg.companyName || 'Presupuesto')}</h1>
        <p>${escapeHTML([cfg.phone, cfg.locality].filter(Boolean).join(' · '))}</p>
      </div>
    </div>
    <div class="print-title">PRESUPUESTO</div>
    <div class="print-client">
      <div><span>Cliente: </span>${escapeHTML(b.client.name)}</div>
      <div><span>Fecha: </span>${formatDateAR(b.date)}</div>
      ${b.client.phone ? `<div><span>Teléfono: </span>${escapeHTML(b.client.phone)}</div>` : ''}
      ${b.client.address ? `<div><span>Dirección: </span>${escapeHTML(b.client.address)}</div>` : ''}
    </div>
    ${jobsHTML}
    ${totalsHTML}
    ${materialsHTML}
    ${conditionsHTML}
  `;

  setTimeout(() => window.print(), 50);
}

/* =========================================================================
   PWA — SERVICE WORKER
   ========================================================================= */
function registerServiceWorker(){
  if('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {
        /* si falla (por ejemplo abierto como archivo local), la app sigue funcionando igual */
      });
    });
  }
}
