// SplitMate — Expense Splitter
// Offline-first, no server, vanilla JS

const STORAGE_KEY = 'splitmate-data';
const CURRENCY = 'NGN';
const CURRENCY_SYMBOL = '₦';

// ---- State ----
let state = {
  participants: [], // [{id, name}]
  expenses: [],     // [{id, amountCents, payerId, shareIds, timestamp}]
  balances: {}      // {id: netCents}
};

// ---- Storage ----
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) { console.error('Load failed', e); }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { console.error('Save failed', e); }
}

// ---- Helpers ----
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function formatCurrency(cents) {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2 }).format(amount);
}

function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ---- Balance calculation ----
function recalcBalances() {
  const bal = {};
  state.participants.forEach(p => bal[p.id] = 0);

  state.expenses.forEach(exp => {
    const shareCount = exp.shareIds.length;
    if (shareCount === 0) return;
    const perPerson = Math.floor(exp.amountCents / shareCount);
    const remainder = exp.amountCents - perPerson * shareCount;

    exp.shareIds.forEach(id => bal[id] -= perPerson);
    bal[exp.payerId] += exp.amountCents - perPerson * shareCount; // payer gets remainder
  });

  state.balances = bal;
}

// ---- UI Rendering ----
function refreshParticipants() {
  const list = document.getElementById('participants-list');
  const payerSelect = document.getElementById('expense-payer');
  const shareGrid = document.getElementById('expense-share');

  list.innerHTML = '';
  payerSelect.innerHTML = '';
  shareGrid.innerHTML = '';

  if (state.participants.length === 0) {
    list.innerHTML = '<li class="empty-state">No people yet. Add someone above.</li>';
  }

  state.participants.forEach(p => {
    // List item
    const li = document.createElement('li');
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = p.name.trim().charAt(0).toUpperCase();
    const span = document.createElement('span');
    span.textContent = p.name;
    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.innerHTML = '&times;';
    del.setAttribute('aria-label', `Remove ${p.name}`);
    del.addEventListener('click', () => removeParticipant(p.id));
    li.append(avatar, span, del);
    list.appendChild(li);

    // Payer option
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    payerSelect.appendChild(opt);

    // Share checkbox
    const label = document.createElement('label');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = p.id;
    chk.addEventListener('change', validateExpenseForm);
    label.append(chk, document.createTextNode(p.name));
    shareGrid.appendChild(label);
  });

  validateExpenseForm();
}

function refreshBalances() {
  const tbody = document.querySelector('#balances-table tbody');
  tbody.innerHTML = '';

  if (state.participants.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'empty-state';
    td.style.padding = '1.5rem 0';
    td.textContent = 'Add people and expenses to see balances.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  state.participants.forEach(p => {
    const net = state.balances[p.id] || 0;
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    const tdNet = document.createElement('td');

    tdName.textContent = p.name;
    tdNet.textContent = formatCurrency(net);
    tdNet.className = net > 0 ? 'net-positive' : net < 0 ? 'net-negative' : 'net-zero';

    tr.append(tdName, tdNet);
    tbody.appendChild(tr);
  });
}

function refreshUI() {
  refreshParticipants();
  refreshBalances();
  save();
}

// ---- Actions ----
function addParticipant() {
  const input = document.getElementById('new-participant');
  const name = input.value.trim();
  if (!name) return;
  if (state.participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    showToast('That name already exists');
    return;
  }
  state.participants.push({ id: uid(), name });
  input.value = '';
  recalcBalances();
  refreshUI();
  showToast(`Added ${name}`);
}

function removeParticipant(id) {
  const p = state.participants.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Remove ${p.name}? This also deletes their expenses.`)) return;
  state.participants = state.participants.filter(x => x.id !== id);
  state.expenses = state.expenses.filter(e => e.payerId !== id && !e.shareIds.includes(id));
  recalcBalances();
  refreshUI();
  showToast(`Removed ${p.name}`);
}

function validateExpenseForm() {
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const payerId = document.getElementById('expense-payer').value;
  const shareIds = Array.from(document.querySelectorAll('#expense-share input:checked')).map(c => c.value);
  const btn = document.getElementById('save-expense');
  btn.disabled = !(amount > 0 && payerId && shareIds.length > 0);
}

function saveExpense() {
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const payerId = document.getElementById('expense-payer').value;
  const shareIds = Array.from(document.querySelectorAll('#expense-share input:checked')).map(c => c.value);

  if (!(amount > 0 && payerId && shareIds.length > 0)) return;

  const cents = Math.round(amount * 100);
  state.expenses.push({ id: uid(), amountCents: cents, payerId, shareIds, timestamp: Date.now() });

  document.getElementById('expense-amount').value = '';
  document.querySelectorAll('#expense-share input:checked').forEach(c => c.checked = false);

  recalcBalances();
  refreshUI();
  showToast('Expense saved');
}

function exportSummary() {
  const lines = state.participants.map(p => {
    const net = state.balances[p.id] || 0;
    if (net === 0) return null;
    return net > 0
      ? `${p.name} is owed ${formatCurrency(net)}`
      : `${p.name} owes ${formatCurrency(Math.abs(net))}`;
  }).filter(Boolean);

  const text = lines.length ? lines.join('\n') : 'All settled up!';

  if (navigator.share) {
    navigator.share({ title: 'SplitMate Summary', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'), () => showToast('Failed to copy'));
  }
}

function backupData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `splitmate-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup downloaded');
}

function clearAll() {
  if (!confirm('Delete all people, expenses, and balances? This cannot be undone.')) return;
  state = { participants: [], expenses: [], balances: {} };
  localStorage.removeItem(STORAGE_KEY);
  refreshUI();
  showToast('All data cleared');
}

// ---- Event listeners ----
document.getElementById('add-participant').addEventListener('click', addParticipant);
document.getElementById('new-participant').addEventListener('keydown', e => { if (e.key === 'Enter') addParticipant(); });
document.getElementById('expense-amount').addEventListener('input', validateExpenseForm);
document.getElementById('expense-payer').addEventListener('change', validateExpenseForm);
document.getElementById('save-expense').addEventListener('click', saveExpense);
document.getElementById('export-btn').addEventListener('click', exportSummary);
document.getElementById('backup-btn').addEventListener('click', backupData);
document.getElementById('clear-btn').addEventListener('click', clearAll);

// ---- Init ----
load();
recalcBalances();
refreshUI();
