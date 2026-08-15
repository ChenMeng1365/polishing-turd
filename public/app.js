/**
 * app.js — OPAD v2 前端逻辑
 *
 * 改造说明：
 *   - 原单页版数据存 localStorage；改造后统一通过 REST API 与后端 SQLite 交互。
 *   - 页面逻辑与 v2 原版保持一致（看板顺序、故事编辑面板、成就系统等）。
 */

'use strict';

// ===================== STATE =====================
let state = null;
let currentMood = 3;
let currentDragId = null;
let currentCardStoryId = null;
let selectedStoryId = null;
let onboardingStep = 0;
let currentRetroSprint = null;

const HATS = {
  po: { name: 'PO帽', items: ['明确产品愿景和用户画像', '编写至少2个用户故事', '对Backlog进行优先级排序', '为每个故事制定验收标准'] },
  sm: { name: 'SM帽', items: ['检查Sprint目标是否清晰', '记录并跟踪当前障碍', '更新看板和燃尽图', '准备回顾会议要点'] },
  dev: { name: 'Dev帽', items: ['完成技术方案设计', '遵循编码规范', '编写单元测试', '代码自测通过并提交'] },
  qa: { name: 'QA帽', items: ['设计测试用例覆盖主要场景', '构建评估集/测试集', '执行质量门禁检查', '给出发布质量建议'] },
  tl: { name: 'TL帽', items: ['做出或记录架构决策', '识别并登记技术债务', '完成关键代码审查', '更新技术标准和文档'] },
};

// ===================== API =====================
async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败 (' + res.status + ')');
  return data;
}

// ===================== UTILS =====================
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return todayStr(); }
function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }
function showToast(msg, type = 'success') {
  const c = document.getElementById('toastContainer'); const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg; c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function escAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function statusLabel(s) { const map = { todo: '待办', inprogress: '进行中', review: '评审中', done: '已完成' }; return map[s] || s; }

async function reloadState() {
  state = await api('/state');
  return state;
}

// ===================== NAV =====================
function navTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  const na = document.querySelector('.nav-item[data-page="' + page + '"]'); if (na) na.classList.add('active');
  if (page === 'dashboard') renderDashboard();
  if (page === 'backlog') renderBacklog();
  if (page === 'board') { renderBoard(); renderEditPanel(); }
  if (page === 'standup') renderStandup();
  if (page === 'roles') renderHats();
  if (page === 'retro') renderRetro();
  if (page === 'motivation') renderMotivation();
  if (page === 'settings') renderSettings();
  document.getElementById('sidebar').classList.remove('open');
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ===================== MODAL =====================
function showModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ===================== DASHBOARD =====================
function renderDashboard() {
  const s = state.settings; const sp = state.sprints.find(x => x.num === s.currentSprintNum) || state.sprints[state.sprints.length - 1];
  const today = todayStr();
  const dayIndex = sp ? daysBetween(sp.startDate, today) + 1 : 1;
  const totalDays = s.sprintDuration;
  const remain = sp ? daysBetween(today, sp.endDate) + 1 : totalDays;
  document.getElementById('dashOwnerName').textContent = s.ownerName;
  document.getElementById('dashSprintNum').textContent = '#' + s.currentSprintNum;
  document.getElementById('dashSprintDays').textContent = sp && sp.status === 'active' ? '第' + Math.max(1, dayIndex) + '天 / 剩余 ' + Math.max(0, remain) + ' 天' : 'Sprint未激活';
  document.getElementById('dashSprintGoal').textContent = sp ? 'Sprint目标：' + sp.goal : '';
  const currentStories = state.backlog.filter(b => b.sprint === s.currentSprintNum);
  const donePoints = currentStories.filter(b => b.status === 'done').reduce((a, b) => a + b.storyPoints, 0);
  const totalPoints = currentStories.reduce((a, b) => a + b.storyPoints, 0);
  document.getElementById('dashWeekPoints').textContent = donePoints + ' / ' + totalPoints;
  document.getElementById('dashTotalPoints').textContent = state.motivation.totalStoryPoints;
  document.getElementById('dashBacklogCount').textContent = state.backlog.filter(b => b.sprint === null || b.sprint === undefined).length;
  let hatEmoji = '💻', hatName = 'Dev帽 · 开发日', hatDesc = '专注于编码实现，推进任务到完成。';
  if (dayIndex <= 1) { hatEmoji = '🎩'; hatName = 'PO帽 · 计划日'; hatDesc = '明确Sprint目标，细化用户故事。'; }
  else if (remain <= 0 || dayIndex >= totalDays) { hatEmoji = '🔍'; hatName = 'QA帽 + 回顾日'; hatDesc = '质量检查，准备回顾，总结经验。'; }
  document.getElementById('dashHatEmoji').textContent = hatEmoji;
  document.getElementById('dashHatName').textContent = hatName;
  document.getElementById('dashHatDesc').textContent = hatDesc;
  drawBurnup();
}
function drawBurnup() {
  const canvas = document.getElementById('burnupCanvas'); const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect(); canvas.width = rect.width * 2; canvas.height = rect.height * 2;
  ctx.scale(2, 2); const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  const s = state.settings; const sp = state.sprints.find(x => x.num === s.currentSprintNum);
  if (!sp) return;
  const stories = state.backlog.filter(b => b.sprint === s.currentSprintNum);
  const total = stories.reduce((a, b) => a + b.storyPoints, 0);
  const days = s.sprintDuration;
  const pad = { l: 40, t: 20, r: 20, b: 30 };
  const chartW = W - pad.l - pad.r, chartH = H - pad.t - pad.b;
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
  for (let i = 0; i <= days; i++) { const x = pad.l + (i / days) * chartW; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + chartH); ctx.stroke(); }
  for (let i = 0; i <= 5; i++) { const y = pad.t + (i / 5) * chartH; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + chartW, y); ctx.stroke(); }
  ctx.strokeStyle = '#334155'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t + chartH); ctx.lineTo(pad.l + chartW, pad.t); ctx.stroke(); ctx.setLineDash([]);
  const today = todayStr(); let acc = 0; const pts = [];
  for (let i = 0; i <= days; i++) {
    const d = addDays(sp.startDate, i);
    if (d > today && sp.status === 'active') break;
    acc = stories.filter(b => b.status === 'done' && b.createdAt <= d).reduce((a, b) => a + b.storyPoints, 0);
    pts.push({ i, acc });
  }
  if (total > 0) {
    ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((p, idx) => { const x = pad.l + (p.i / days) * chartW; const y = pad.t + chartH - (p.acc / total) * chartH; if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = '#00d4ff';
    pts.forEach(p => { const x = pad.l + (p.i / days) * chartW; const y = pad.t + chartH - (p.acc / total) * chartH; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); });
  }
  ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i <= days; i++) { const x = pad.l + (i / days) * chartW; ctx.fillText('D' + i, x, H - 8); }
}

// ===================== BACKLOG =====================
function renderBacklog() {
  const fp = document.getElementById('backlogFilterPriority').value;
  const fs = document.getElementById('backlogFilterStatus').value;
  let items = state.backlog.slice();
  if (fp) items = items.filter(b => b.priority === fp);
  if (fs) items = items.filter(b => b.status === fs);
  const tbody = document.getElementById('backlogTable'); tbody.innerHTML = '';
  items.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(b.id)}</td><td>${esc(b.title)}</td>
      <td><span class="badge badge-${b.priority.toLowerCase()}">${b.priority}</span></td>
      <td>${b.storyPoints}</td>
      <td>${statusLabel(b.status)}</td>
      <td>${b.sprint || '-'}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editStory('${b.id}')">编辑</button>
        <button class="btn btn-sm btn-outline" onclick="toggleSprintAssign('${b.id}')">${b.sprint ? '移出' : '加入Sprint'}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteStory('${b.id}')">删除</button>
      </td>`;
    tbody.appendChild(tr);
  });
}
function openStoryModal() {
  document.getElementById('storyEditId').value = '';
  document.getElementById('storyModalTitle').textContent = '新增用户故事';
  document.getElementById('stTitle').value = '';
  document.getElementById('stRole').value = '';
  document.getElementById('stWant').value = '';
  document.getElementById('stSoThat').value = '';
  document.getElementById('stPriority').value = 'P1';
  document.getElementById('stPoints').value = '3';
  document.getElementById('stAC').value = '';
  document.getElementById('stSprint').value = '';
  showModal('storyModal');
}
function openStoryModalForBoard() {
  openStoryModal();
  document.getElementById('stSprint').value = state.settings.currentSprintNum;
}
async function deleteSelectedStory() {
  if (!selectedStoryId) { showToast('请先在看板中选择一个故事', 'error'); return; }
  if (!confirm('确定删除故事 ' + selectedStoryId + '？此操作不可撤销。')) return;
  try {
    await api('/stories/' + selectedStoryId, { method: 'DELETE' });
    clearStorySelection();
    await reloadState();
    renderBoard(); renderBacklog(); renderDashboard();
    showToast('已删除');
  } catch (e) { showToast(e.message, 'error'); }
}
async function removeSelectedFromSprint() {
  if (!selectedStoryId) { showToast('请先在看板中选择一个故事', 'error'); return; }
  const b = state.backlog.find(x => x.id === selectedStoryId);
  if (!b) return;
  if (!b.sprint) { showToast('该故事已在Backlog中', 'error'); return; }
  try {
    await api('/stories/' + selectedStoryId, { method: 'PUT', body: { sprint: null } });
    clearStorySelection();
    await reloadState();
    renderBoard(); renderBacklog(); renderDashboard();
    showToast('已移出Sprint，回到Backlog');
  } catch (e) { showToast(e.message, 'error'); }
}
function editStory(id) {
  const b = state.backlog.find(x => x.id === id); if (!b) return;
  document.getElementById('storyEditId').value = id;
  document.getElementById('storyModalTitle').textContent = '编辑用户故事';
  document.getElementById('stTitle').value = b.title;
  document.getElementById('stRole').value = b.role || '';
  document.getElementById('stWant').value = b.want || '';
  document.getElementById('stSoThat').value = b.soThat || '';
  document.getElementById('stPriority').value = b.priority;
  document.getElementById('stPoints').value = b.storyPoints;
  document.getElementById('stAC').value = (b.acceptanceCriteria || []).map(c => typeof c === 'string' ? c : c.text).join('\n');
  document.getElementById('stSprint').value = b.sprint || '';
  showModal('storyModal');
}
async function saveStory() {
  const id = document.getElementById('storyEditId').value;
  const payload = {
    title: document.getElementById('stTitle').value.trim(),
    role: document.getElementById('stRole').value.trim(),
    want: document.getElementById('stWant').value.trim(),
    soThat: document.getElementById('stSoThat').value.trim(),
    priority: document.getElementById('stPriority').value,
    storyPoints: parseFloat(document.getElementById('stPoints').value) || 1,
    acceptanceCriteria: document.getElementById('stAC').value.split('\n').map(x => x.trim()).filter(Boolean),
    sprint: document.getElementById('stSprint').value ? parseInt(document.getElementById('stSprint').value) : null
  };
  if (!payload.title) { showToast('请填写标题', 'error'); return; }
  try {
    if (id) {
      await api('/stories/' + id, { method: 'PUT', body: payload });
      showToast('故事已更新');
    } else {
      await api('/stories', { method: 'POST', body: payload });
      showToast('故事已创建');
    }
    await reloadState();
    closeModal('storyModal'); renderBacklog(); renderBoard(); renderDashboard();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteStory(id) {
  if (!confirm('确定删除此故事？')) return;
  try {
    await api('/stories/' + id, { method: 'DELETE' });
    await reloadState();
    renderBacklog(); renderBoard();
    showToast('已删除');
  } catch (e) { showToast(e.message, 'error'); }
}
async function toggleSprintAssign(id) {
  const b = state.backlog.find(x => x.id === id); if (!b) return;
  const nextSprint = b.sprint ? null : state.settings.currentSprintNum;
  try {
    await api('/stories/' + id, { method: 'PUT', body: { sprint: nextSprint, boardOrder: nextSprint ? Date.now() : b.boardOrder } });
    await reloadState();
    renderBacklog(); renderBoard();
    showToast(nextSprint ? '已加入当前Sprint' : '已移回Backlog');
  } catch (e) { showToast(e.message, 'error'); }
}

// ===================== BOARD =====================
function renderBoard() {
  const s = state.settings;
  document.getElementById('boardSprintNum').textContent = s.currentSprintNum;
  const cols = { todo: [], inprogress: [], review: [], done: [] };
  state.backlog.filter(b => b.sprint === s.currentSprintNum).forEach(b => { if (cols[b.status]) cols[b.status].push(b); });
  ['todo', 'inprogress', 'review', 'done'].forEach(st => {
    cols[st].sort((a, b) => (a.boardOrder || 0) - (b.boardOrder || 0));
    const container = document.getElementById('col-' + st); container.innerHTML = '';
    document.getElementById('count-' + st).textContent = cols[st].length;
    document.getElementById('sp-' + st).textContent = cols[st].reduce((a, b) => a + b.storyPoints, 0) + ' SP';
    cols[st].forEach(b => {
      const el = document.createElement('div'); el.className = 'kanban-card'; el.draggable = true; el.dataset.id = b.id;
      const pcolor = { P0: '#f87171', P1: '#fbbf24', P2: '#60a5fa', P3: '#94a3b8' }[b.priority] || '#94a3b8';
      el.innerHTML = `<div class="priority-bar" style="background:${pcolor}"></div><span class="edit-indicator">✏️</span><div style="padding-left:10px;">
        <div class="card-id">${b.id}</div>
        <div class="card-title">${esc(b.title)}</div>
        <div class="card-meta"><span class="sp">${b.storyPoints} SP</span><span class="badge badge-${b.priority.toLowerCase()}">${b.priority}</span></div>
      </div>`;
      el.addEventListener('dragstart', e => { currentDragId = b.id; el.classList.add('dragging'); });
      el.addEventListener('dragend', e => { currentDragId = null; el.classList.remove('dragging'); });
      el.addEventListener('click', () => selectStoryForEdit(b.id));
      container.appendChild(el);
    });
  });
  if (selectedStoryId) {
    const sel = document.querySelector('.kanban-card[data-id="' + selectedStoryId + '"]');
    if (sel) sel.classList.add('selected');
  }
}
function allowDrop(e) { e.preventDefault(); }
async function dropCard(e) {
  e.preventDefault(); if (!currentDragId) return;
  const col = e.currentTarget.dataset.status;
  const b = state.backlog.find(x => x.id === currentDragId); if (!b) return;
  try {
    await api('/stories/' + currentDragId, { method: 'PUT', body: { status: col, boardOrder: Date.now() } });
    await reloadState();
    renderBoard(); renderBacklog(); renderDashboard(); renderEditPanel();
    showToast('已移动到 ' + statusLabel(col));
  } catch (err) { showToast(err.message, 'error'); }
}
function openCardDetail(id) {
  const b = state.backlog.find(x => x.id === id); if (!b) return; currentCardStoryId = id;
  document.getElementById('cardModalTitle').textContent = b.id + ' ' + b.title;
  const acList = (b.acceptanceCriteria || []);
  const ac = acList.map((c, i) => {
    const text = typeof c === 'string' ? c : c.text || '';
    const checked = typeof c === 'object' ? !!c.checked : false;
    return `<li style="margin:4px 0;"><input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleAC('${id}',${i})"> ${esc(text)}</li>`;
  }).join('');
  document.getElementById('cardModalBody').innerHTML = `<p><strong>角色：</strong>${esc(b.role || '')}</p>
    <p><strong>希望：</strong>${esc(b.want || '')}</p>
    <p><strong>以便：</strong>${esc(b.soThat || '')}</p>
    <p><strong>故事点：</strong>${b.storyPoints} · <strong>优先级：</strong><span class="badge badge-${b.priority.toLowerCase()}">${b.priority}</span></p>
    <p style="margin-top:10px;"><strong>验收标准：</strong></p><ul style="padding-left:18px;">${ac || '<li style="color:var(--text-dim)">暂无</li>'}</ul>`;
  showModal('cardModal');
}
async function toggleAC(id, idx) {
  const b = state.backlog.find(x => x.id === id); if (!b) return;
  if (!Array.isArray(b.acceptanceCriteria)) return;
  const item = b.acceptanceCriteria[idx];
  let next;
  if (typeof item === 'string') { next = { text: item, checked: true }; }
  else if (typeof item === 'object') { next = { ...item, checked: !item.checked }; }
  const ac = b.acceptanceCriteria.map((c, i) => (i === idx ? next : c));
  try {
    await api('/stories/' + id, { method: 'PUT', body: { acceptanceCriteria: ac } });
    await reloadState();
  } catch (e) { showToast(e.message, 'error'); }
}
function editCurrentStory() { closeModal('cardModal'); editStory(currentCardStoryId); }

// ===================== STORY EDITOR PANEL =====================
function selectStoryForEdit(id) {
  selectedStoryId = id;
  document.querySelectorAll('.kanban-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector('.kanban-card[data-id="' + id + '"]');
  if (card) card.classList.add('selected');
  renderEditPanel();
  const panel = document.getElementById('storyEditorPanel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function clearStorySelection() {
  selectedStoryId = null;
  document.querySelectorAll('.kanban-card').forEach(c => c.classList.remove('selected'));
  renderEditPanel();
}
function renderEditPanel() {
  const panel = document.getElementById('storyEditorPanel');
  const body = document.getElementById('editorBody');
  const idBadge = document.getElementById('editorStoryId');
  const title = document.getElementById('editorTitle');
  const saveBtn = document.getElementById('editorSaveBtn');
  const cancelBtn = document.getElementById('editorCancelBtn');
  const meta = document.getElementById('editorMeta');

  if (!selectedStoryId) {
    panel.classList.add('empty');
    idBadge.style.display = 'none';
    title.textContent = '用户故事编辑器';
    meta.textContent = '';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
    body.innerHTML = '<div class="story-editor-empty-hint"><div class="emoji">👆</div><div>点击上方看板中的任意用户故事卡片，在此处查看和编辑其详细内容</div></div>';
    return;
  }

  const b = state.backlog.find(x => x.id === selectedStoryId);
  if (!b) { clearStorySelection(); return; }

  panel.classList.remove('empty');
  idBadge.style.display = 'inline-flex';
  idBadge.textContent = b.id;
  title.textContent = b.title || '未命名故事';
  meta.textContent = '创建于 ' + (b.createdAt || '') + ' · 修改后点击「保存修改」生效';
  saveBtn.style.display = 'inline-flex';
  cancelBtn.style.display = 'inline-flex';

  const acText = (b.acceptanceCriteria || []).map(c => {
    if (typeof c === 'string') return c;
    return (c.text || '') + (c.checked ? ' ✅' : '');
  }).join('\n');

  body.innerHTML =
    '<div class="story-editor-form">' +
      '<div class="form-row-top">' +
        '<div class="form-group"><label>Sprint</label><input type="number" id="edSprint" value="' + (b.sprint || '') + '" placeholder="-"></div>' +
        '<div class="form-group"><label>标题</label><input id="edTitle" value="' + escAttr(b.title) + '" placeholder="简洁描述需求"></div>' +
        '<div class="form-group"><label>优先级</label><select id="edPriority">' +
          '<option value="P0" ' + (b.priority === 'P0' ? 'selected' : '') + '>P0</option>' +
          '<option value="P1" ' + (b.priority === 'P1' ? 'selected' : '') + '>P1</option>' +
          '<option value="P2" ' + (b.priority === 'P2' ? 'selected' : '') + '>P2</option>' +
          '<option value="P3" ' + (b.priority === 'P3' ? 'selected' : '') + '>P3</option>' +
        '</select></div>' +
        '<div class="form-group"><label>故事点</label><input type="number" id="edPoints" min="0" step="0.5" value="' + b.storyPoints + '"></div>' +
        '<div class="form-group"><label>状态</label><select id="edStatus">' +
          '<option value="todo" ' + (b.status === 'todo' ? 'selected' : '') + '>待办</option>' +
          '<option value="inprogress" ' + (b.status === 'inprogress' ? 'selected' : '') + '>进行中</option>' +
          '<option value="review" ' + (b.status === 'review' ? 'selected' : '') + '>评审中</option>' +
          '<option value="done" ' + (b.status === 'done' ? 'selected' : '') + '>已完成</option>' +
        '</select></div>' +
      '</div>' +
      '<div class="form-row-main">' +
        '<div class="left-stack">' +
          '<div class="form-group"><label>作为（角色）</label><input id="edRole" value="' + escAttr(b.role || '') + '" placeholder="作为..."></div>' +
          '<div class="form-group"><label>我希望（需求）</label><input id="edWant" value="' + escAttr(b.want || '') + '" placeholder="我希望..."></div>' +
          '<div class="form-group"><label>以便（价值）</label><input id="edSoThat" value="' + escAttr(b.soThat || '') + '" placeholder="以便..."></div>' +
        '</div>' +
        '<div class="form-group ac-cell"><label>验收标准（每行一条，✅=已勾选）</label><textarea id="edAC" placeholder="- 当...时，...">' + esc(acText) + '</textarea></div>' +
      '</div>' +
    '</div>';
}
async function saveStoryFromPanel() {
  if (!selectedStoryId) return;
  const b = state.backlog.find(x => x.id === selectedStoryId);
  if (!b) return;

  const title = document.getElementById('edTitle').value.trim();
  if (!title) { showToast('请填写标题', 'error'); return; }

  const newStatus = document.getElementById('edStatus').value;
  const oldAC = b.acceptanceCriteria || [];
  const newLines = document.getElementById('edAC').value.split('\n').map(x => x.trim()).filter(Boolean);
  const acceptanceCriteria = newLines.map(line => {
    const checked = line.endsWith(' ✅');
    const text = checked ? line.slice(0, -2).trim() : line;
    const oldMatch = oldAC.find(c => {
      const t = typeof c === 'string' ? c : (c.text || '');
      return t === text;
    });
    const wasChecked = oldMatch && typeof oldMatch === 'object' ? !!oldMatch.checked : checked;
    return { text, checked: wasChecked };
  });
  const sprintVal = document.getElementById('edSprint').value;

  try {
    await api('/stories/' + selectedStoryId, {
      method: 'PUT',
      body: {
        title,
        role: document.getElementById('edRole').value.trim(),
        want: document.getElementById('edWant').value.trim(),
        soThat: document.getElementById('edSoThat').value.trim(),
        priority: document.getElementById('edPriority').value,
        storyPoints: parseFloat(document.getElementById('edPoints').value) || 1,
        status: newStatus,
        boardOrder: newStatus !== b.status ? Date.now() : b.boardOrder,
        acceptanceCriteria,
        sprint: sprintVal ? parseInt(sprintVal) : null,
      }
    });
    await reloadState();
    renderBoard();
    renderBacklog();
    renderDashboard();
    selectStoryForEdit(selectedStoryId);
    showToast('故事已保存');
  } catch (e) { showToast(e.message, 'error'); }
}

// ===================== STANDUP =====================
function renderStandup() {
  const today = todayStr(); document.getElementById('standupDate').textContent = today;
  const yesterday = addDays(today, -1);
  const yesterdayLog = state.standupLog.find(x => x.date === yesterday);
  document.getElementById('yesterdayHint').textContent = yesterdayLog ? '昨日：' + (yesterdayLog.today || '').substring(0, 60) + ((yesterdayLog.today || '').length > 60 ? '...' : '') : '昨日无记录';
  const inProg = state.backlog.filter(b => b.sprint === state.settings.currentSprintNum && b.status === 'inprogress');
  document.getElementById('todayHint').textContent = inProg.length ? '进行中：' + inProg.map(x => x.title).join('、') : '无进行中的故事';
  const hist = document.getElementById('standupHistory'); hist.innerHTML = '';
  state.standupLog.slice().reverse().forEach(l => {
    const el = document.createElement('div'); el.style.cssText = 'padding:12px; border-bottom:1px solid #334155;';
    el.innerHTML = `<div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">${l.date} · 情绪 ${'★'.repeat(l.mood)}${'☆'.repeat(5 - l.mood)}</div>
      <div style="font-size:13px;"><strong>昨天：</strong>${esc(l.yesterday)}</div>
      <div style="font-size:13px;"><strong>今天：</strong>${esc(l.today)}</div>
      <div style="font-size:13px;"><strong>阻碍：</strong>${esc(l.blockers) || '无'}</div>`;
    hist.appendChild(el);
  });
}
function startStandup() { currentMood = 3; updateMoodStars(); document.getElementById('suYesterday').value = ''; document.getElementById('suToday').value = ''; document.getElementById('suBlockers').value = ''; }
function setMood(v) { currentMood = v; updateMoodStars(); }
function updateMoodStars() { document.querySelectorAll('#moodStars .star').forEach(s => { s.classList.toggle('active', parseInt(s.dataset.v) <= currentMood); }); }
async function saveStandup() {
  const today = todayStr();
  const entry = {
    date: today,
    yesterday: document.getElementById('suYesterday').value.trim(),
    today: document.getElementById('suToday').value.trim(),
    blockers: document.getElementById('suBlockers').value.trim(),
    mood: currentMood
  };
  try {
    await api('/standup', { method: 'POST', body: entry });
    await reloadState();
    renderStandup();
    showToast('站会记录已保存');
  } catch (e) { showToast(e.message, 'error'); }
}

// ===================== ROLES / HATS =====================
function renderHats() {
  ['po', 'sm', 'dev', 'qa', 'tl'].forEach(hat => {
    const list = document.querySelector('.checklist[data-hat="' + hat + '"]'); if (!list) return;
    const items = HATS[hat].items;
    const prog = state.hatProgress[hat] || [];
    list.innerHTML = '';
    items.forEach((text, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<input type="checkbox" id="chk-' + hat + '-' + i + '" ' + (prog[i] ? 'checked' : '') + ' onchange="toggleHatItem(\'' + hat + '\',' + i + ')">' + '<label for="chk-' + hat + '-' + i + '">' + text + '</label>';
      list.appendChild(li);
    });
    const done = (prog.filter(Boolean).length);
    const pct = Math.round((done / items.length) * 100);
    const fill = document.getElementById('progress-' + hat); if (fill) fill.style.width = pct + '%';
    const txt = document.getElementById('progressText-' + hat); if (txt) txt.textContent = done + '/' + items.length + ' (' + pct + '%)';
  });
}
function switchHat(hat) {
  document.querySelectorAll('#hatContents .tab-content').forEach(t => t.classList.remove('active'));
  const tc = document.getElementById('hat-' + hat); if (tc) tc.classList.add('active');
  document.querySelectorAll('#page-roles .tab').forEach(t => t.classList.remove('active'));
  const map = { po: 0, sm: 1, dev: 2, qa: 3, tl: 4 };
  const tabs = document.querySelectorAll('#page-roles .tab');
  if (tabs[map[hat]]) tabs[map[hat]].classList.add('active');
}
async function toggleHatItem(hat, idx) {
  if (!state.hatProgress[hat]) state.hatProgress[hat] = [false, false, false, false];
  state.hatProgress[hat][idx] = !state.hatProgress[hat][idx];
  try {
    await api('/hats/' + hat, { method: 'PUT', body: { data: state.hatProgress[hat] } });
    await reloadState();
    renderHats();
  } catch (e) { showToast(e.message, 'error'); }
}

// ===================== RETRO =====================
function renderRetro() {
  const tabs = document.getElementById('retroSprintTabs'); tabs.innerHTML = '';
  // 回顾页也隐藏已归档 Sprint，但可用「显示已归档」切换
  const showArchived = document.getElementById('showArchivedToggle') && document.getElementById('showArchivedToggle').checked;
  const list = state.sprints.filter(sp => showArchived || sp.status !== 'archived');
  list.forEach(sp => {
    const btn = document.createElement('button'); btn.className = 'tab' + (sp.num === state.settings.currentSprintNum ? ' active' : '');
    btn.textContent = 'Sprint ' + sp.num; btn.onclick = () => { selectRetroSprint(sp.num); };
    tabs.appendChild(btn);
  });
  if (currentRetroSprint === null) currentRetroSprint = state.settings.currentSprintNum;
  selectRetroSprint(currentRetroSprint);
}
function selectRetroSprint(num) {
  currentRetroSprint = num;
  const sp = state.sprints.find(x => x.num === num); if (!sp) return;
  document.querySelectorAll('#retroSprintTabs .tab').forEach((t, i) => { t.classList.toggle('active', state.sprints[i] && state.sprints[i].num === num); });
  const goodList = document.getElementById('retroGoodList'); goodList.innerHTML = '';
  sp.retrospective.wentWell.forEach((item, i) => {
    const el = document.createElement('div'); el.className = 'retro-item retro-good';
    el.innerHTML = esc(item) + '<span class="del" onclick="removeRetroItem(\'good\',' + i + ')">×</span>';
    goodList.appendChild(el);
  });
  const badList = document.getElementById('retroBadList'); badList.innerHTML = '';
  sp.retrospective.needsImprovement.forEach((item, i) => {
    const el = document.createElement('div'); el.className = 'retro-item retro-bad';
    el.innerHTML = esc(item) + '<span class="del" onclick="removeRetroItem(\'bad\',' + i + ')">×</span>';
    badList.appendChild(el);
  });
  const tbody = document.getElementById('retroActionTable'); tbody.innerHTML = '';
  sp.retrospective.actionItems.forEach((a, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + esc(a.text) + '</td><td>' + (a.sprint || '-') + '</td>' +
      '<td><select onchange="updateActionStatus(' + num + ',' + i + ',this.value)" style="background:#0f0f1a;border:1px solid #334155;color:#e2e8f0;border-radius:4px;padding:2px 6px;">' +
      '<option value="todo" ' + (a.status === 'todo' ? 'selected' : '') + '>待办</option>' +
      '<option value="doing" ' + (a.status === 'doing' ? 'selected' : '') + '>进行中</option>' +
      '<option value="done" ' + (a.status === 'done' ? 'selected' : '') + '>完成</option></select></td>' +
      '<td><button class="btn btn-sm btn-danger" onclick="removeActionItem(' + num + ',' + i + ')">删除</button></td>';
    tbody.appendChild(tr);
  });
  drawMoodChart();
  const btn = document.getElementById('completeSprintBtn');
  if (btn) btn.style.display = (num === state.settings.currentSprintNum && sp.status === 'active') ? 'inline-flex' : 'none';
}
async function addRetroItem(type) {
  const inputId = type === 'good' ? 'retroGoodInput' : 'retroBadInput';
  const val = document.getElementById(inputId).value.trim(); if (!val) return;
  const sp = state.sprints.find(x => x.num === currentRetroSprint); if (!sp) return;
  sp.retrospective[type === 'good' ? 'wentWell' : 'needsImprovement'].push(val);
  document.getElementById(inputId).value = '';
  await saveSprintRetro(sp);
  selectRetroSprint(currentRetroSprint); showToast('已添加');
}
async function removeRetroItem(type, idx) {
  const sp = state.sprints.find(x => x.num === currentRetroSprint); if (!sp) return;
  const arr = type === 'good' ? sp.retrospective.wentWell : sp.retrospective.needsImprovement;
  arr.splice(idx, 1);
  await saveSprintRetro(sp);
  selectRetroSprint(currentRetroSprint);
}
async function addRetroAction() {
  const val = document.getElementById('retroActionInput').value.trim(); if (!val) return;
  const sp = state.sprints.find(x => x.num === currentRetroSprint); if (!sp) return;
  sp.retrospective.actionItems.push({ text: val, sprint: currentRetroSprint + 1, status: 'todo' });
  document.getElementById('retroActionInput').value = '';
  await saveSprintRetro(sp);
  selectRetroSprint(currentRetroSprint); showToast('改进项已添加');
}
async function updateActionStatus(sprintNum, idx, status) {
  const sp = state.sprints.find(x => x.num === sprintNum); if (!sp) return;
  sp.retrospective.actionItems[idx].status = status;
  await saveSprintRetro(sp);
}
async function removeActionItem(sprintNum, idx) {
  const sp = state.sprints.find(x => x.num === sprintNum); if (!sp) return;
  sp.retrospective.actionItems.splice(idx, 1);
  await saveSprintRetro(sp);
  selectRetroSprint(currentRetroSprint);
}
async function saveSprintRetro(sp) {
  try {
    await api('/sprints/' + sp.num, { method: 'PUT', body: { retrospective: sp.retrospective } });
    await reloadState();
  } catch (e) { showToast(e.message, 'error'); }
}
async function completeSprint() {
  if (!confirm('确定要完成当前Sprint吗？这会触发成就检查和统计更新。')) return;
  const sp = state.sprints.find(x => x.num === state.settings.currentSprintNum); if (!sp) return;
  sp.status = 'completed';
  const stories = state.backlog.filter(b => b.sprint === sp.num);
  const completedPoints = stories.filter(b => b.status === 'done').reduce((a, b) => a + b.storyPoints, 0);
  const totalPoints = stories.reduce((a, b) => a + b.storyPoints, 0);
  state.motivation.totalStoryPoints += completedPoints;
  state.motivation.totalSprints += 1;
  state.motivation.streakSprints += 1;
  const lastStandup = state.standupLog[state.standupLog.length - 1];
  sp.retrospective.mood = lastStandup ? lastStandup.mood : 3;
  try {
    await api('/sprints/' + sp.num, { method: 'PUT', body: { status: 'completed', retrospective: sp.retrospective } });
    await api('/motivation', { method: 'PUT', body: state.motivation });
    await reloadState();
    showToast('Sprint 已完成！');
    renderRetro(); renderMotivation(); renderDashboard(); renderSettings(); renderSprintTabs();
  } catch (e) { showToast(e.message, 'error'); }
}
function drawMoodChart() {
  const canvas = document.getElementById('moodCanvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect(); canvas.width = rect.width * 2; canvas.height = rect.height * 2;
  ctx.scale(2, 2); const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  const data = state.sprints.filter(s => s.status === 'completed' && s.retrospective.mood > 0).map((s, i) => ({ i, sn: s.num, m: s.retrospective.mood }));
  if (data.length < 2) { ctx.fillStyle = '#94a3b8'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('完成至少2个Sprint后显示情绪趋势', W / 2, H / 2); return; }
  const pad = { l: 30, t: 20, r: 20, b: 25 }; const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i++) { const y = pad.t + cH - (i / 5) * cH; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke(); }
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((d, idx) => { const x = pad.l + (idx / (data.length - 1)) * cW; const y = pad.t + cH - (d.m / 5) * cH; if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.stroke();
  ctx.fillStyle = '#00d4ff';
  data.forEach((d, idx) => { const x = pad.l + (idx / (data.length - 1)) * cW; const y = pad.t + cH - (d.m / 5) * cH; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  data.forEach((d, idx) => { const x = pad.l + (idx / (data.length - 1)) * cW; ctx.fillText('S' + d.sn, x, H - 6); });
}

// ===================== MOTIVATION =====================
function renderMotivation() {
  const streakEl = document.getElementById('motStreak'); if (streakEl) streakEl.childNodes[0].textContent = state.motivation.streakSprints + ' ';
  const flame = document.getElementById('flameIcon'); if (flame) flame.style.display = state.motivation.streakSprints >= 3 ? 'inline' : 'none';
  const mtp = document.getElementById('motTotalPoints'); if (mtp) mtp.textContent = state.motivation.totalStoryPoints;
  const mts = document.getElementById('motTotalSprints'); if (mts) mts.textContent = state.motivation.totalSprints;
  const grid = document.getElementById('achievementGrid'); if (grid) {
    grid.innerHTML = '';
    state.achievements.forEach(a => {
      const el = document.createElement('div'); el.className = 'achievement-card' + (a.unlocked ? ' unlocked' : '');
      const emoji = a.id === 'first_sprint' ? '🎯' : a.id === 'speed_star' ? '⚡' : a.id === 'three_streak' ? '🔥' : a.id === 'story_master' ? '📝' : a.id === 'zero_bug' ? '🧹' : a.id === 'early_bird' ? '🏃' : a.id === 'multihat' ? '🎩' : a.id === 'data_driven' ? '📊' : a.id === 'fast_iter' ? '🚀' : '💎';
      el.innerHTML = '<div class="emoji">' + emoji + '</div><div class="name">' + a.name + '</div><div class="desc">' + a.desc + '</div>';
      grid.appendChild(el);
    });
  }
  drawVelocityChart();
  const tbody = document.getElementById('sprintHistoryTable'); if (tbody) {
    tbody.innerHTML = '';
    state.sprints.filter(s => s.status === 'completed').forEach(s => {
      const pts = state.backlog.filter(b => b.sprint === s.num && b.status === 'done').reduce((a, b) => a + b.storyPoints, 0);
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>#' + s.num + '</td><td>' + esc(s.goal) + '</td><td>' + pts + '</td><td><span style="color:#7ee787">已完成</span></td>';
      tbody.appendChild(tr);
    });
  }
  const vi = document.getElementById('visionInput'); if (vi) vi.value = state.vision || '';
}
async function saveVision() {
  try {
    await api('/vision', { method: 'PUT', body: { vision: document.getElementById('visionInput').value } });
    state.vision = document.getElementById('visionInput').value;
  } catch (e) { showToast(e.message, 'error'); }
}
function drawVelocityChart() {
  const canvas = document.getElementById('velocityCanvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect(); canvas.width = rect.width * 2; canvas.height = rect.height * 2;
  ctx.scale(2, 2); const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  const done = state.sprints.filter(s => s.status === 'completed');
  if (done.length === 0) { ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center'; ctx.font = '14px sans-serif'; ctx.fillText('暂无已完成Sprint数据', W / 2, H / 2); return; }
  const data = done.map(s => state.backlog.filter(b => b.sprint === s.num && b.status === 'done').reduce((a, b) => a + b.storyPoints, 0));
  const pad = { l: 30, t: 20, r: 20, b: 25 }; const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const max = Math.max(...data, 10);
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) { const y = pad.t + (i / 5) * cH; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke(); }
  ctx.fillStyle = '#00d4ff';
  const barW = Math.min(40, cW / data.length - 10);
  data.forEach((v, i) => {
    const x = pad.l + (cW / data.length) * i + (cW / data.length - barW) / 2;
    const h = (v / max) * cH;
    ctx.fillRect(x, pad.t + cH - h, barW, h);
    ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('S' + done[i].num, x + barW / 2, H - 6);
    ctx.fillStyle = '#00d4ff';
  });
}

// ===================== SETTINGS =====================
function sprintStatusLabel(s) {
  const map = { active: '进行中', completed: '已完成', archived: '已归档' };
  return map[s] || s;
}
function renderSettings() {
  document.getElementById('setName').value = state.settings.ownerName;
  document.getElementById('setDuration').value = state.settings.sprintDuration;
  const sel = document.getElementById('setSprintNum');
  sel.innerHTML = '';
  // 下拉只显示未归档的 Sprint
  state.sprints.filter(sp => sp.status !== 'archived').forEach(sp => {
    const opt = document.createElement('option');
    opt.value = sp.num;
    opt.textContent = 'Sprint ' + sp.num + ' · ' + sp.goal + ' (' + sprintStatusLabel(sp.status) + ')';
    if (sp.num === state.settings.currentSprintNum) opt.selected = true;
    sel.appendChild(opt);
  });
  document.getElementById('setStartDate').value = state.settings.sprintStartDate;
  renderSprintManageTable();
}
function renderSprintManageTable() {
  const showArchived = document.getElementById('showArchivedToggle') && document.getElementById('showArchivedToggle').checked;
  const tbody = document.getElementById('sprintManageTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  let list = state.sprints.slice();
  if (!showArchived) list = list.filter(sp => sp.status !== 'archived');
  list.forEach(sp => {
    const storyCount = state.backlog.filter(b => b.sprint === sp.num).length;
    const isCurrent = sp.num === state.settings.currentSprintNum;
    const tr = document.createElement('tr');
    let actions = '';
    if (sp.status === 'active') {
      actions = '<span style="color:var(--text-dim);font-size:12px;">当前活跃</span>';
    } else if (sp.status === 'completed') {
      actions = '<button class="btn btn-sm btn-outline" onclick="archiveSprint(' + sp.num + ')">📦 归档</button> ';
      if (!isCurrent) actions += '<button class="btn btn-sm btn-danger" onclick="deleteSprint(' + sp.num + ')">🗑️ 删除</button>';
    } else if (sp.status === 'archived') {
      actions = '<button class="btn btn-sm btn-outline" onclick="unarchiveSprint(' + sp.num + ')">📥 取消归档</button> ';
      if (!isCurrent) actions += '<button class="btn btn-sm btn-danger" onclick="deleteSprint(' + sp.num + ')">🗑️ 删除</button>';
    }
    const statusColor = sp.status === 'active' ? 'var(--success)' : sp.status === 'completed' ? 'var(--accent)' : 'var(--text-dim)';
    tr.innerHTML = '<td>#' + sp.num + '</td>' +
      '<td>' + esc(sp.goal) + '</td>' +
      '<td><span style="color:' + statusColor + '">' + sprintStatusLabel(sp.status) + '</span></td>' +
      '<td>' + (sp.startDate || '-') + '</td>' +
      '<td>' + (sp.endDate || '-') + '</td>' +
      '<td>' + storyCount + '</td>' +
      '<td>' + actions + '</td>';
    tbody.appendChild(tr);
  });
}
async function saveSettings() {
  try {
    await api('/settings', {
      method: 'PUT',
      body: {
        ownerName: document.getElementById('setName').value || 'Solo Founder',
        sprintDuration: parseInt(document.getElementById('setDuration').value) || 7,
        sprintStartDate: document.getElementById('setStartDate').value || todayStr(),
      }
    });
    await reloadState();
    renderDashboard(); showToast('设置已保存');
  } catch (e) { showToast(e.message, 'error'); }
}
async function switchSprint(num) {
  num = parseInt(num);
  const sp = state.sprints.find(x => x.num === num);
  if (!sp) return;
  try {
    await api('/settings', { method: 'PUT', body: { currentSprintNum: num } });
    await reloadState();
    selectedStoryId = null;
    renderDashboard(); renderBoard(); renderBacklog(); renderRetro(); renderSettings(); renderSprintTabs(); renderEditPanel();
    const spInfo = state.sprints.find(x => x.num === state.settings.currentSprintNum);
    document.getElementById('sidebarSprintInfo').textContent = spInfo ? 'Sprint ' + spInfo.num + ' · ' + sprintStatusLabel(spInfo.status) : '无活跃Sprint';
    showToast('已切换到 Sprint ' + num);
  } catch (e) { showToast(e.message, 'error'); }
}
function renderSprintTabs() {
  const bar = document.getElementById('sprintTabsBar');
  if (!bar) return;
  let html = '';
  // 标签栏只显示未归档的 Sprint
  state.sprints.filter(sp => sp.status !== 'archived').forEach(sp => {
    const isActive = sp.num === state.settings.currentSprintNum;
    const dotClass = sp.status === 'active' ? 'active-dot' : 'completed-dot';
    const tabClass = 'sprint-tab' + (isActive ? ' active' : '') + (sp.status !== 'active' ? ' completed' : '');
    html += `<button class="${tabClass}" onclick="switchSprint(${sp.num})" title="${escAttr(sp.goal)}"><span class="dot ${dotClass}"></span>Sprint ${sp.num}</button>`;
  });
  html += `<button class="sprint-tab-add" onclick="showModal('newSprintModal')" title="开始新 Sprint">+</button>`;
  bar.innerHTML = html;
}
async function createNewSprint() {
  const goal = document.getElementById('nsGoal').value.trim();
  const start = document.getElementById('nsStart').value || todayStr();
  const dur = parseInt(document.getElementById('nsDuration').value) || 7;
  if (!goal) { showToast('请填写Sprint目标', 'error'); return; }
  try {
    await api('/sprints', { method: 'POST', body: { goal, startDate: start, duration: dur } });
    await reloadState();
    closeModal('newSprintModal'); renderDashboard(); renderBoard(); renderRetro(); renderSettings(); renderSprintTabs();
    showToast('新Sprint已开始！');
  } catch (e) { showToast(e.message, 'error'); }
}
async function archiveSprint(num) {
  if (!confirm('确定归档 Sprint ' + num + '？归档后将从标签栏隐藏，可在设置页取消归档。')) return;
  try {
    await api('/sprints/' + num, { method: 'PUT', body: { status: 'archived' } });
    await reloadState();
    renderSettings(); renderSprintTabs(); renderRetro();
    showToast('Sprint ' + num + ' 已归档');
  } catch (e) { showToast(e.message, 'error'); }
}
async function unarchiveSprint(num) {
  try {
    await api('/sprints/' + num, { method: 'PUT', body: { status: 'completed' } });
    await reloadState();
    renderSettings(); renderSprintTabs(); renderRetro();
    showToast('Sprint ' + num + ' 已取消归档');
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteSprint(num) {
  const sp = state.sprints.find(x => x.num === num);
  if (!sp) return;
  const storyCount = state.backlog.filter(b => b.sprint === num).length;
  const msg = storyCount > 0
    ? '确定删除 Sprint ' + num + '？该 Sprint 下的 ' + storyCount + ' 个故事将移回 Backlog。此操作不可撤销。'
    : '确定删除 Sprint ' + num + '？此操作不可撤销。';
  if (!confirm(msg)) return;
  try {
    await api('/sprints/' + num, { method: 'DELETE' });
    await reloadState();
    renderSettings(); renderSprintTabs(); renderRetro(); renderDashboard();
    showToast('Sprint ' + num + ' 已删除');
  } catch (e) { showToast(e.message, 'error'); }
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'solo-agile-backup-' + todayStr() + '.json'; a.click(); URL.revokeObjectURL(url); showToast('数据已导出');
}
async function importData(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.version) throw new Error('格式错误');
      await api('/import', { method: 'POST', body: data });
      await reloadState();
      location.reload();
    } catch (err) { showToast('导入失败：' + err.message, 'error'); }
  };
  reader.readAsText(file); input.value = '';
}
async function resetData() {
  if (!confirm('确定重置所有数据？此操作不可恢复！')) return;
  try {
    await api('/reset', { method: 'POST' });
    await reloadState();
    location.reload();
  } catch (e) { showToast(e.message, 'error'); }
}

// ===================== ONBOARDING =====================
const obSteps = [
  { title: '欢迎使用一人敏捷工作台', text: '这是一个专为独立开发者和一人公司设计的敏捷工具。你将扮演多个角色（PO、SM、Dev、QA、TL），用最小的流程开销获得最大的产出聚焦。' },
  { title: '你的5顶帽子', text: '「帽子工坊」是核心创新功能。每天根据Sprint阶段切换帽子，确保流程完整：计划日戴PO帽，开发日戴Dev帽，收尾日戴QA帽。每顶帽子有专属检查清单。' },
  { title: '开始你的第一个Sprint', text: '先在Backlog中创建用户故事，然后规划到Sprint中。每天进行站会记录，拖拽卡片更新状态。Sprint结束时在回顾页总结经验。祝你敏捷之旅顺利！' }
];
function startOnboarding() { if (state._obDone) return; onboardingStep = 0; showOb(); }
function showOb() {
  const s = obSteps[onboardingStep];
  document.getElementById('obStep').textContent = '步骤 ' + (onboardingStep + 1) + ' / ' + obSteps.length;
  document.getElementById('obTitle').textContent = s.title;
  document.getElementById('obText').textContent = s.text;
  document.getElementById('obNext').textContent = onboardingStep === obSteps.length - 1 ? '开始' : '下一步';
  document.getElementById('onboarding').classList.add('active');
}
function nextOnboarding() { onboardingStep++; if (onboardingStep >= obSteps.length) { endOnboarding(); } else showOb(); }
async function endOnboarding() {
  state._obDone = true;
  try { await api('/onboarding', { method: 'PUT', body: { done: true } }); } catch (e) {}
  document.getElementById('onboarding').classList.remove('active');
}

// ===================== INIT =====================
(async function init() {
  try {
    await reloadState();
    renderDashboard();
    renderSprintTabs();
    startOnboarding();
    const spInfo = state.sprints.find(x => x.num === state.settings.currentSprintNum);
    document.getElementById('sidebarSprintInfo').textContent = spInfo ? 'Sprint ' + spInfo.num + ' · ' + sprintStatusLabel(spInfo.status) : '无活跃Sprint';
    document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); }));
  } catch (e) {
    showToast('加载数据失败：' + e.message, 'error');
  }
})();