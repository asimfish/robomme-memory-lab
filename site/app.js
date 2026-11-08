import { STATUS, OUTCOME, COVERAGE, escapeHtml as e, safeUrl, validateProject, statistics, toCsv, trialKey } from './model.js';

const main = document.querySelector('#main');
const storageKey = 'astra-memory-lab:v1:' + location.pathname.replace(/index\.html$/, '');
let project, repositoryProject, repositoryFingerprint, draftBaseFingerprint, dirty = false, stale = false, saved = true;
let taskSearch = '', suiteFilter = '', statusFilter = '', coverageFilter = '', resultTask = '', logOutcome = '', logMethod = '';
let editingTrial = null, toastTimer, openTasks = new Set(), page = 'overview', activeTask = '';
const names = { overview: '实验总览', tasks: '任务与进度', coverage: '能力覆盖', results: '实验结果', protocol: '评测协议', maintain: '维护与导出' };
const fingerprint = value => {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
};
const options = (items, selected = '') => items.map(([value, label]) => '<option value="' + e(value) + '"' + (value === selected ? ' selected' : '') + '>' + e(label) + '</option>').join('');
const status = task => '<span class="status-tag ' + e(task.status) + '">' + e(STATUS[task.status]) + '</span>';
const list = (items, ordered = false) => '<' + (ordered ? 'ol' : 'ul') + '>' + items.map(x => '<li>' + e(x) + '</li>').join('') + '</' + (ordered ? 'ol' : 'ul') + '>';
const button = (action, label, style = 'secondary') => '<button class="button ' + style + '" type="button" data-action="' + action + '">' + label + '</button>';
const intro = (kicker, title, description) => '<div class="page-intro"><span class="eyebrow">' + kicker + '</span><h1>' + title + '</h1><p>' + description + '</p></div>';
const section = (index, title, description = '', right = '') => '<div class="section-heading"><div><h2><span class="section-index">' + index + '</span>' + title + '</h2>' + (description ? '<p>' + description + '</p>' : '') + '</div>' + right + '</div>';
const stat = (label, value, note, unit = '') => '<div class="stat-card"><div class="label">' + label + '<span aria-hidden="true">↗</span></div><div class="stat-value">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div><div class="stat-note">' + note + '</div></div>';
const taskLinks = ids => ids.map(id => '<a class="task-link" href="#tasks/' + e(id) + '">' + e(id) + '</a>').join('');

function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 4800);
}

function updateChrome() {
  document.querySelector('#version-label').textContent = 'PLAN v' + project.meta.version;
  document.querySelector('#sidebar-phase').textContent = project.meta.phase;
  document.querySelector('#updated-date').textContent = '更新于 ' + project.meta.updatedAt;
  document.querySelector('.nav-count').textContent = String(project.tasks.length).padStart(2, '0');
  const indicator = document.querySelector('#draft-indicator');
  indicator.textContent = !saved ? '草稿未持久保存 · 请导出' : dirty ? (stale ? '本机草稿 · 仓库已更新' : '本机草稿已保存') : '仓库版本';
  indicator.classList.toggle('dirty', dirty);
  const repo = document.querySelector('#repository-link');
  repo.textContent = project.meta.repositoryUrl ? 'GitHub 源码 ↗' : '配置 GitHub 仓库 ↗';
  repo.href = project.meta.repositoryUrl || '#maintain';
  if (project.meta.repositoryUrl) { repo.target = '_blank'; repo.rel = 'noopener noreferrer'; }
  else { repo.removeAttribute('target'); repo.removeAttribute('rel'); }
}

function persist() {
  dirty = true;
  saved = true;
  try { localStorage.setItem(storageKey, JSON.stringify({ baseFingerprint: draftBaseFingerprint, project })); }
  catch { saved = false; toast('浏览器无法保存草稿，请先导出 project.json 保留修改。'); }
  updateChrome();
}

function mutate(change, redraw = true) {
  const next = structuredClone(project);
  change(next);
  next.meta.updatedAt = new Date().toISOString().slice(0, 10);
  try { validateProject(next); }
  catch (error) { toast(error.message); return false; }
  project = next;
  persist();
  if (redraw) render();
  return true;
}

function sourceCards() {
  return '<div class="source-grid">' + project.sources.map(s => '<a class="source-card" href="' + e(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer"><strong>' + e(s.title) + '<span aria-hidden="true">↗</span></strong><p>' + e(s.note) + '</p></a>').join('') + '</div>';
}

function methods(cardsOnly = false) {
  const mainMethods = project.methods.filter(m => ['direct', 'history', 'ours'].includes(m.id));
  const cards = '<div class="method-grid">' + mainMethods.map(m => '<article class="method-card ' + (m.kind === 'ours' ? 'ours' : '') + '"><div class="method-label">' + (m.kind === 'ours' ? 'OUR SYSTEM' : 'BASELINE / ' + e(m.id.toUpperCase())) + '</div><h3>' + e(m.name) + '</h3><p>' + e(m.description) + '</p><small>' + e(m.control) + '</small></article>').join('') + '</div>';
  return cards + (cardsOnly ? '' : '<div class="notice">主要比较：Ours vs Astra-History。Summary 与 Frozen 为补充基线 / 机制消融，方法与动作设置均需在测试前冻结。</div>');
}

function renderOverview() {
  const core = project.tasks.filter(t => t.priority === '核心');
  const completed = project.tasks.filter(t => t.status === 'completed').length;
  const testTrials = project.trials.filter(t => t.phase === 'test' && t.outcome !== 'invalid');
  const ready = project.tasks.reduce((sum, t) => sum + t.preparation.filter(x => x.done).length, 0);
  const total = project.tasks.reduce((sum, t) => sum + t.preparation.length, 0);
  return '<section class="hero"><div class="hero-copy"><div class="hero-meta"><span class="eyebrow">MEMORY IN MOTION</span><span class="chip orange">方案 v' + e(project.meta.version) + '</span></div><h1>让记忆，<br>成为<span>可验证的能力。</span></h1><p>在同一 Astra 与 Franka 控制接口下，检验记忆系统能否更可靠地保存历史、检索事件，并把新的观察转化为正确行动。</p><div class="hero-actions"><a class="button primary" href="#tasks">查看实验任务 <span aria-hidden="true">↗</span></a><a class="button secondary" href="#coverage">检查能力覆盖</a></div></div><div class="memory-visual" aria-label="记忆保存、历史检索和状态更新共同指导下一次行动"><div class="visual-top"><span>AN EPISODE OF MEMORY</span><span>OBSERVE → ACT</span></div><div class="memory-track"><div class="memory-node"><span aria-hidden="true">▧</span><strong>保存历史</strong><small>WRITE</small></div><span class="memory-arrow" aria-hidden="true">→</span><div class="memory-node"><span aria-hidden="true">⌕</span><strong>检索事件</strong><small>RETRIEVE</small></div><span class="memory-arrow" aria-hidden="true">→</span><div class="memory-node"><span aria-hidden="true">↻</span><strong>更新状态</strong><small>UPDATE</small></div></div><div class="visual-bottom"><span>PAST OBSERVATIONS</span><span>NEXT CORRECT ACTION ↗</span></div></div></section>' +
    '<div class="stat-grid">' + stat('核心任务', core.length, '另含 ' + (project.tasks.length - core.length) + ' 项可选能力边界') + stat('基准对应', '16', '覆盖矩阵逐项说明缺口', '项') + stat('任务完成', completed, ready + ' / ' + total + ' 项准备工作完成', '/ ' + project.tasks.length) + stat('正式执行', testTrials.length || '—', testTrials.length ? '按逐回合真实记录统计' : '尚未录入实验结果', testTrials.length ? '回合' : '') + '</div>' +
    '<div class="overview-columns"><section class="panel"><div class="panel-title"><h3>优先推进的实验</h3><a href="#tasks">全部任务 ↗</a></div>' + ['T1', 'T2', 'T4', 'T7'].map(id => project.tasks.find(t => t.id === id)).filter(Boolean).map(t => '<a class="compact-task" href="#tasks/' + e(t.id) + '"><span class="task-number">' + e(t.id) + '</span><div class="compact-task-copy"><h4>' + e(t.title) + '</h4><p>' + e(t.suite) + ' · ' + e(t.englishTitle) + '</p></div>' + status(t) + '<span class="compact-arrow" aria-hidden="true">↗</span></a>').join('') + '</section><section class="focus-panel"><span class="eyebrow">THE CENTRAL COMPARISON</span><h3>比完整历史，更有效地记忆</h3><p>直接控制是能力参照；完整历史是主要强基线。观察新系统是否减少旧记忆错误，而非仅增加可见信息。</p><div class="comparison-row"><strong>Astra-History</strong><span>→</span><strong>Astra + harness</strong></div><ul class="focus-list"><li><span>01</span>相同终态，不同历史：动作是否随历史改变？</li><li><span>02</span>旧关联失效：系统是否使用最新有效信息？</li><li><span>03</span>效果提升：需要多少额外时间与 token？</li></ul></section></div>' +
    section('01', '三组主要对照', '同一模型、同一执行接口，明确历史与记忆的差异。') + methods(true) +
    section('02', '研究依据', '官方定义与本项目方案分开记录。') + sourceCards() +
    '<div class="notice">' + e(project.meta.notes) + ' 当前任务对应关系不表示已经完成真机验证。</div>';
}

function taskCard(t) {
  const done = t.preparation.filter(x => x.done).length;
  const opened = openTasks.has(t.id) || activeTask === t.id;
  return '<article class="task-card" id="task-' + e(t.id) + '"><div class="task-card-top"><div class="task-card-kicker"><span class="task-number">' + e(t.id) + '</span><span class="chip">' + e(t.suite) + '</span><span class="chip ' + (t.priority === '核心' ? 'outline' : 'blue') + '">' + e(t.priority) + '</span></div><select id="status-' + e(t.id) + '" data-status="' + e(t.id) + '" aria-label="' + e(t.id) + ' 任务状态">' + options(Object.entries(STATUS), t.status) + '</select></div>' +
    '<details data-task-details="' + e(t.id) + '"' + (opened ? ' open' : '') + '><summary><div><h3>' + e(t.title) + '</h3><span class="english">' + e(t.englishTitle) + '</span><p>' + e(t.purpose) + '</p></div><span class="expand-icon" aria-hidden="true">+</span></summary><div class="task-detail"><h4>任务指令 / PROMPT</h4><div class="prompt-box" lang="en">' + e(t.prompt) + '</div><div class="detail-grid">' +
    '<div class="detail-block"><h4><span>01</span>场景与道具</h4>' + list(t.props) + '</div><div class="detail-block"><h4><span>02</span>执行流程</h4>' + list(t.steps, true) + '</div>' +
    '<div class="detail-block"><h4><span>03</span>测试条件 · 计划每条件 ' + e(t.targetPerCondition) + ' 个场景</h4><div class="condition-list">' + t.conditions.map((c, i) => '<div class="condition"><span class="chip ' + (i < 2 ? '' : 'blue') + '">' + (i < 2 ? '主条件' : '扩展 / 消融') + '</span><strong>' + e(c.label) + '</strong><p>' + e(c.change) + '</p></div>').join('') + '</div></div>' +
    '<div class="detail-block"><h4><span>04</span>成功判定</h4>' + list(t.success) + '<h4 style="margin-top:18px"><span>05</span>任务专属指标</h4>' + list(t.metrics) + '</div>' +
    '<div class="detail-block"><h4><span>06</span>失败标签</h4><div>' + t.failures.map(f => '<span class="chip outline" style="margin:0 5px 6px 0">' + e(f) + '</span>').join('') + '</div></div>' +
    '<div class="detail-block"><h4><span>07</span>设计与控制要点</h4>' + list(t.designNotes) + '</div></div>' +
    '<div class="task-edit-area"><h4>准备进度 <span class="text-muted">' + done + ' / ' + t.preparation.length + '</span></h4><div class="checklist">' + t.preparation.map(x => '<label><input id="prep-' + e(t.id) + '-' + e(x.id) + '" type="checkbox" data-prep-task="' + e(t.id) + '" data-prep-id="' + e(x.id) + '"' + (x.done ? ' checked' : '') + '>' + e(x.label) + '</label>').join('') + '</div><div class="task-note-fields"><label class="field"><span>负责人</span><input data-task-owner="' + e(t.id) + '" value="' + e(t.owner) + '" placeholder="待分配" maxlength="200"></label><label class="field"><span>实验备注 / 场景与视频链接</span><textarea data-task-notes="' + e(t.id) + '" placeholder="记录设置变化、待确认参数或视频链接…" maxlength="20000">' + e(t.notes) + '</textarea></label></div><div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:12px"><div class="text-muted" style="font-size:10px">对应仿真：' + e(t.benchmark.join(' / ')) + '</div><button class="button small secondary" data-action="record-task" data-task="' + e(t.id) + '">记录执行 ↗</button></div></div></div></details><div class="task-progress" aria-label="准备完成 ' + done + ' 项"><span style="width:' + (done / t.preparation.length * 100) + '%"></span></div></article>';
}

function renderTasks() {
  const suites = [...new Set(project.tasks.map(t => t.suite))];
  return intro('TASKS & PROGRESS', '把能力拆成可执行的实验。', '每个任务保留指令、条件、评分与准备进度。状态和备注在本机编辑，导出后提交到 GitHub 即可同步。') +
    '<div class="toolbar"><label class="search-wrap"><span aria-hidden="true">⌕</span><input id="task-search" type="search" value="' + e(taskSearch) + '" placeholder="搜索任务、能力或仿真名称…" aria-label="搜索任务"></label><select id="suite-filter" aria-label="按能力筛选">' + options([['', '全部能力'], ...suites.map(s => [s, s])], suiteFilter) + '</select><select id="status-filter" aria-label="按状态筛选">' + options([['', '全部状态'], ...Object.entries(STATUS)], statusFilter) + '</select><span class="filter-summary" id="task-filter-summary"></span></div><div class="task-list" id="task-list"></div>';
}

function refreshTasks() {
  const query = taskSearch.toLowerCase();
  const filtered = project.tasks.filter(t => (!suiteFilter || t.suite === suiteFilter) && (!statusFilter || t.status === statusFilter) && [t.id, t.title, t.englishTitle, t.purpose, ...t.benchmark].join(' ').toLowerCase().includes(query));
  document.querySelector('#task-list').innerHTML = filtered.length ? filtered.map(taskCard).join('') : '<div class="empty-state"><h3>没有匹配的任务</h3><p>试试其他关键词或筛选条件。</p></div>';
  document.querySelector('#task-filter-summary').textContent = filtered.length + ' / ' + project.tasks.length + ' 个任务';
}

function renderCoverage() {
  const counts = Object.fromEntries(Object.keys(COVERAGE).map(k => [k, project.coverage.filter(c => c.level === k).length]));
  const rows = project.coverage.filter(c => !coverageFilter || c.level === coverageFilter);
  return intro('BENCHMARK COVERAGE', '四类记忆，逐项看清边界。', '对照 RoboMME-Plus 全部 16 项任务，标明当前设计的对应关系与缺口。任务映射不等同于完整复刻，更不表示已经取得实测结果。') +
    '<div class="coverage-summary">' + Object.entries(COVERAGE).map(([k, label]) => '<span><strong>' + counts[k] + '</strong>' + label + '</span>').join('') + '</div><div class="toolbar"><select id="coverage-filter" aria-label="筛选对应程度">' + options([['', '全部对应关系'], ...Object.entries(COVERAGE)], coverageFilter) + '</select><span class="filter-summary">方案对应关系 · 实测以实验结果页为准</span></div>' +
    '<div class="table-panel"><table class="data-table"><thead><tr><th>SUITE</th><th>RoboMME-Plus 任务</th><th>真机任务</th><th>设计对应</th><th>已覆盖的设计与剩余缺口</th></tr></thead><tbody>' + rows.map(c => '<tr><td class="coverage-suite">' + e(c.suite) + '</td><td class="mono">' + e(c.benchmark) + '</td><td>' + (taskLinks(c.tasks) || '<span class="text-muted">—</span>') + '</td><td><span class="chip coverage-' + e(c.level) + '">' + e(COVERAGE[c.level]) + '</span></td><td class="coverage-note">' + e(c.note) + '</td></tr>').join('') + '</tbody></table></div>' +
    '<div class="notice orange">明确缺口：SwingXtimes 的方向与摆动周期、InsertPeg 的抓取端与精密插入尚未设计；StopCube 为可选边界。动态障碍、按钮触发及部分工具变体也需独立补充。</div>' +
    section('01', '如何使用这张矩阵', '先证明关键记忆机制能迁移到硬件，再据实际结果界定能力范围。') +
    '<div class="protocol-grid"><article class="protocol-card"><div class="protocol-number">SIMULATION</div><h3>完整基准表现</h3><p>仿真若完成官方 16 项任务与 800 个固定测试回合，可用于支持整体基准结论。零样本与适配设置分别记录。</p></article><article class="protocol-card"><div class="protocol-number">REAL WORLD</div><h3>硬件上的机制证据</h3><p>真机重点评估历史保存、事件检索、连续更新和经验利用。只有离线观察回放的实验，应标注为离线诊断。</p></article></div>';
}

function resultCell(trials, ours) {
  const s = statistics(trials);
  if (!s.count) return '<span class="pending-cell">待测</span>';
  const interval = s.interval ? (s.interval[0] * 100).toFixed(1) + '–' + (s.interval[1] * 100).toFixed(1) + '%' : '重复场景 · CI 需聚类估计';
  return '<div class="results-number ' + (ours ? 'ours' : '') + '">' + (s.rate * 100).toFixed(1) + '%<span class="fraction">' + s.successes + '/' + s.count + '</span></div><small>' + interval + '</small>';
}

function filteredLogs() {
  return project.trials.filter(t => (!resultTask || t.taskId === resultTask) && (!logMethod || t.methodId === logMethod) && (!logOutcome || t.outcome === logOutcome));
}

function renderResults() {
  const valid = project.trials.filter(t => t.phase === 'test' && t.outcome !== 'invalid');
  const uniqueScenes = new Set(valid.map(t => JSON.stringify([t.taskId, t.conditionId, t.scenarioId])));
  const testedTasks = new Set(valid.map(t => t.taskId));
  const methodIds = ['direct', 'history', 'ours', ...['summary', 'frozen'].filter(id => project.trials.some(t => t.methodId === id))];
  const displayMethods = methodIds.map(id => project.methods.find(m => m.id === id)).filter(Boolean);
  const logs = filteredLogs();
  const tasks = project.tasks.filter(t => !resultTask || t.id === resultTask);
  const tableRows = tasks.flatMap(t => t.conditions.map(c => {
    const records = project.trials.filter(r => r.taskId === t.id && r.conditionId === c.id);
    return '<tr><td><strong>' + e(t.id) + '</strong><small>' + e(t.title) + '</small></td><td>' + e(c.label) + '</td>' + displayMethods.map(m => '<td>' + resultCell(records.filter(r => r.methodId === m.id), m.id === 'ours') + '</td>').join('') + '</tr>';
  }));
  return intro('EXPERIMENT RESULTS', '让每一个结果，都有记录可循。', '按任务与条件展示正式执行结果。开发回合不计入 SR，人工干预计为非自主成功；无效回合保留排除理由。') +
    '<div class="stat-grid">' + stat('全部执行记录', project.trials.length, '包含开发、正式与无效回合') + stat('正式有效执行', valid.length, '成功 / 失败 / 人工干预') + stat('已记录场景', uniqueScenes.size, '按任务 × 条件 × 场景去重') + stat('已测试任务', testedTasks.size, '仅统计有效正式测试', '/ ' + project.tasks.length) + '</div>' +
    (project.trials.length ? '' : '<div class="empty-state"><div class="empty-mark" aria-hidden="true">↗</div><h3>第一份实验结果，从这里开始。</h3><p>目前只保存实验方案，没有预填成功率。记录一次真实执行后，结果表会自动按条件汇总。</p>' + button('record', '记录一次执行', 'primary') + '</div>') +
    section('01', '主结果表', '显示成功率、成功数 / 有效执行数；独立场景给出 95% Wilson 区间。', button('record', '+ 记录执行', 'primary')) +
    '<div class="toolbar"><select id="result-task" aria-label="筛选结果任务">' + options([['', '全部任务'], ...project.tasks.map(t => [t.id, t.id + ' · ' + t.title])], resultTask) + '</select><span class="filter-summary">主要对照：Ours vs Astra-History</span></div>' +
    '<div class="table-panel"><table class="data-table"><thead><tr><th>任务</th><th>测试条件</th>' + displayMethods.map(m => '<th>' + e(m.name) + '</th>').join('') + '</tr></thead><tbody>' + tableRows.join('') + '</tbody></table></div>' +
    '<div class="notice">表中区间以独立场景为前提。同一方法、任务与条件存在重复场景时，不展示逐执行 Wilson 区间；配对差异和重复场景的区间需另外按场景分析。零记录表示“待测”，不等于 0% 成功。</div>' +
    section('02', '逐回合记录', '下面的筛选仅影响记录列表和 CSV 导出，不改变上方 SR 的分母。', button('csv', '导出 CSV')) +
    '<div class="toolbar"><select id="log-method" aria-label="筛选记录方法">' + options([['', '全部方法'], ...project.methods.map(m => [m.id, m.name])], logMethod) + '</select><select id="log-outcome" aria-label="筛选记录结果">' + options([['', '全部结果'], ...Object.entries(OUTCOME)], logOutcome) + '</select><span class="filter-summary">显示最近 ' + Math.min(logs.length, 50) + ' 条 / 共 ' + logs.length + ' 条</span></div>' +
    '<div class="table-panel trial-log"><table class="data-table"><thead><tr><th>场景 / 任务</th><th>方法 / 阶段</th><th>结果</th><th>总时长 / TOKEN</th><th>备注与证据</th><th>维护</th></tr></thead><tbody>' +
    (logs.length ? [...logs].reverse().slice(0, 50).map(t => {
      const method = project.methods.find(m => m.id === t.methodId);
      const task = project.tasks.find(x => x.id === t.taskId);
      const cond = task.conditions.find(c => c.id === t.conditionId);
      return '<tr><td><strong>' + e(t.scenarioId) + '</strong><small>' + e(t.taskId + ' · ' + cond.label) + '<br>重复 #' + t.repeatIndex + '</small></td><td>' + e(method.name) + '<small>' + (t.phase === 'test' ? '正式测试' : '开发回合') + '</small></td><td class="outcome-' + e(t.outcome) + '">' + e(OUTCOME[t.outcome]) + '</td><td>' + (t.durationSec == null ? '—' : e(t.durationSec) + ' s') + '<small>' + (t.tokens == null ? '未记录 token' : t.tokens.toLocaleString() + ' token') + '</small></td><td>' + e(t.notes || '—') + '<small>' + e(t.failureTags.join(' / ')) + '</small>' + (safeUrl(t.videoUrl) ? '<a class="task-link" href="' + e(safeUrl(t.videoUrl)) + '" target="_blank" rel="noopener noreferrer">视频 ↗</a>' : '') + '</td><td><button class="button small secondary" data-edit-trial="' + e(t.id) + '">编辑</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="text-muted">暂无符合条件的记录。</td></tr>') + '</tbody></table></div>';
}

function renderProtocol() {
  return intro('EVALUATION PROTOCOL', '固定比较条件，让结论可信。', '在正式测试前冻结任务、提示、记忆策略与评分标准。记录所有计划内测试，区分感知、记忆、规划和运动执行错误。') +
    '<div class="protocol-grid">' + project.protocol.map((p, i) => '<article class="protocol-card"><div class="protocol-number">' + String(i + 1).padStart(2, '0') + '</div><h3>' + e(p.title) + '</h3><p>' + e(p.body) + '</p></article>').join('') + '</div>' +
    section('01', '统一指标', '每个任务的专属指标另见任务详情。') + '<div class="metrics-list">' + project.metrics.map(m => '<div class="metric-row"><strong>' + e(m.name) + '</strong><p>' + e(m.definition) + '</p></div>').join('') + '</div>' +
    section('02', '方法设置') + methods() +
    '<div class="notice">建议保留 model version、prompt / config revision、动作与推理预算、历史截断规则、场景 ID、视频与执行日志。Astra 的开发范围内外条件，不直接称为其未知预训练分布的 ID / OOD。</div>';
}

function renderMaintain() {
  const repo = project.meta.repositoryUrl;
  return intro('MAINTAIN THE WORKSPACE', '方案、进度、结果，一份数据维护。', 'GitHub 中的 project.json 是团队共享版本。这里的修改先保存在当前浏览器，导出并提交后，GitHub Pages 自动更新。') +
    (stale ? '<div class="notice orange">仓库已经更新，本机草稿基于旧版本。请先导出草稿，与仓库版本合并后提交，或恢复仓库版本。</div>' : '') +
    '<div class="maintenance-grid"><section class="maintenance-card"><span class="eyebrow">LOCAL DRAFT → SHARED VERSION</span><h3 style="margin-top:10px">维护与发布</h3><p>进度、负责人、备注和逐回合结果均可编辑。导入文件会整体替换本机草稿，不会直接修改 GitHub。</p><div class="maintenance-actions">' + button('export', '导出 project.json', 'primary') + button('import', '导入数据') + button('csv', '导出结果 CSV') + '</div><ol class="maintenance-steps"><li>完成本机编辑，点击<strong>导出 project.json</strong>。</li><li>在 GitHub 用新文件替换 <code>site/data/project.json</code> 并提交。</li><li>Actions 验证并部署，刷新网页查看共享版本。</li></ol>' +
    (repo ? '<a class="button small orange" style="margin-top:18px" href="' + e(repo + '/edit/main/site/data/project.json') + '" target="_blank" rel="noopener noreferrer">在 GitHub 编辑数据 ↗</a>' : '<p style="margin-top:18px">配置仓库地址后，这里会显示 GitHub 数据编辑入口。</p>') +
    '<br><button class="danger-link" data-action="reset">恢复仓库版本，清除本机草稿</button></section>' +
    '<section class="maintenance-card"><span class="eyebrow">EXPERIMENT BUDGET</span><h3 style="margin-top:10px">先估算规模，再冻结测试条件</h3><p>按每个核心任务前两个主条件估算；扩展条件、额外消融与预实验另计。T7 的第三组使用 Frozen。</p><div id="budget-display"></div><div class="budget-controls"><label>每条件场景 <input id="budget-n" type="number" min="1" max="1000" value="20"></label><label>任务范围 <select id="budget-scope"><option value="all">7 项核心任务</option><option value="priority">优先 T1 / T2 / T4 / T7</option></select></label></div><div class="notice">20 个场景是起步预算，不能预先保证统计显著。每项变化分别建条件，不把所有因素做全排列。</div></section></div>' +
    section('01', '项目设置', '保存到本机草稿；导出后与实验数据一起进入版本管理。') +
    '<section class="maintenance-card"><div class="form-grid">' + [
      ['robot', '机器人与夹爪'], ['cameras', '相机设置'], ['modelVersion', '模型版本'], ['configurationRevision', '提示 / 配置版本'], ['repositoryUrl', 'GitHub 仓库地址'], ['version', '方案版本']
    ].map(([key, label]) => '<label class="field"><span>' + label + '</span><input data-meta="' + key + '" value="' + e(project.meta[key]) + '" ' + (key === 'repositoryUrl' ? 'type="url" placeholder="https://github.com/owner/robomme-memory-lab"' : '') + '></label>').join('') + '<label class="field span-two"><span>项目说明</span><textarea data-meta="notes">' + e(project.meta.notes) + '</textarea></label></div></section>' +
    section('02', '文档与归档') + '<div class="maintenance-card"><p>支持打印当前页面为 PDF。视频与原始采集数据保留在各自存储位置，逐回合记录填写可访问的证据链接。</p><div class="maintenance-actions">' + button('print', '打印当前页面 / 保存 PDF') + '</div></div>';
}

function updateBudget() {
  if (!document.querySelector('#budget-display')) return;
  const n = Number(document.querySelector('#budget-n').value);
  const scope = document.querySelector('#budget-scope').value;
  const tasks = scope === 'priority' ? project.tasks.filter(t => ['T1', 'T2', 'T4', 'T7'].includes(t.id)) : project.tasks.filter(t => t.priority === '核心');
  const conditions = tasks.reduce((sum, t) => sum + Math.min(2, t.conditions.length), 0);
  document.querySelector('#budget-display').innerHTML = '<div class="budget-total">' + (Number.isInteger(n) && n > 0 ? (conditions * n * 3).toLocaleString() : '—') + '<small>预计真机回合</small></div><p class="budget-equation">' + tasks.length + ' 任务 · ' + conditions + ' 个主条件 × ' + e(n || '—') + ' 场景 × 3 方法</p>';
}

function rememberOpen() {
  document.querySelectorAll('[data-task-details]').forEach(el => {
    if (el.open) openTasks.add(el.dataset.taskDetails);
    else openTasks.delete(el.dataset.taskDetails);
  });
}

function render() {
  rememberOpen();
  const focusId = document.activeElement?.id;
  const renderers = { overview: renderOverview, tasks: renderTasks, coverage: renderCoverage, results: renderResults, protocol: renderProtocol, maintain: renderMaintain };
  main.innerHTML = renderers[page]();
  if (page === 'tasks') refreshTasks();
  if (page === 'maintain') updateBudget();
  updateChrome();
  document.querySelector('#page-name').textContent = names[page];
  document.title = names[page] + ' · Astra Memory Lab';
  document.querySelectorAll('[data-route]').forEach(a => {
    const active = a.dataset.route === page;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

function route() {
  const parts = location.hash.slice(1).split('/');
  page = Object.hasOwn(names, parts[0]) ? parts[0] : 'overview';
  activeTask = page === 'tasks' && /^T[1-9][0-9]*$/.test(parts[1] || '') ? parts[1] : '';
  if (activeTask) {
    taskSearch = ''; suiteFilter = ''; statusFilter = '';
    openTasks.add(activeTask);
  }
  render();
  if (activeTask) requestAnimationFrame(() => document.querySelector('#task-' + activeTask)?.scrollIntoView({ block: 'start' }));
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

function download(content, name, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function inputField(name, label, value = '', type = 'text', attrs = '') {
  return '<label class="field"><span>' + label + '</span><input name="' + name + '" type="' + type + '" value="' + e(value ?? '') + '" ' + attrs + '></label>';
}

function selectField(name, label, values, selected = '', attrs = '') {
  return '<label class="field"><span>' + label + '</span><select name="' + name + '" ' + attrs + '>' + options(values, selected) + '</select></label>';
}

function showTrial(taskId = '', trial = null) {
  editingTrial = trial?.id || null;
  const t = trial || {};
  const chosenTask = project.tasks.find(x => x.id === (t.taskId || taskId)) || project.tasks[0];
  document.querySelector('#trial-title').textContent = trial ? '编辑执行记录' : '记录一次执行';
  document.querySelector('#trial-error').textContent = '';
  document.querySelector('#trial-fields').innerHTML = '<div class="form-grid">' +
    selectField('taskId', '任务', project.tasks.map(x => [x.id, x.id + ' · ' + x.title]), chosenTask.id, 'id="trial-task"') +
    selectField('conditionId', '测试条件', chosenTask.conditions.map(c => [c.id, c.label]), t.conditionId || chosenTask.conditions[0].id, 'id="trial-condition"') +
    selectField('methodId', '方法', project.methods.map(m => [m.id, m.name]), t.methodId || 'ours') +
    selectField('phase', '阶段', [['test', '正式测试'], ['development', '开发回合（不计入 SR）']], t.phase || 'test') +
    inputField('scenarioId', '场景 ID', t.scenarioId, 'text', 'required maxlength="200" placeholder="例如 T2-S001"') +
    inputField('repeatIndex', '同场景重复编号', t.repeatIndex || 1, 'number', 'required min="1" step="1"') +
    selectField('outcome', '执行结果', Object.entries(OUTCOME), t.outcome || 'success', 'id="trial-outcome"') +
    inputField('durationSec', '总耗时 / 秒（可空）', t.durationSec, 'number', 'min="0" step="any"') +
    inputField('inferenceSec', '推理等待 / 秒（可空）', t.inferenceSec, 'number', 'min="0" step="any"') +
    inputField('motionSec', '运动耗时 / 秒（可空）', t.motionSec, 'number', 'min="0" step="any"') +
    inputField('tokens', '总 token（可空）', t.tokens, 'number', 'min="0" step="1"') +
    selectField('targetCorrect', '首次目标是否正确', [['', '未评分'], ['true', '正确'], ['false', '错误']], String(t.targetCorrect ?? '')) +
    selectField('orderCorrect', '操作顺序是否正确', [['', '未评分'], ['true', '正确'], ['false', '错误']], String(t.orderCorrect ?? '')) +
    selectField('staleMemoryUsed', '是否使用失效记忆', [['', '未评分'], ['true', '是'], ['false', '否']], String(t.staleMemoryUsed ?? '')) +
    inputField('modelVersion', '模型版本', t.modelVersion || project.meta.modelVersion) +
    inputField('configRevision', '提示 / 配置版本', t.configRevision || project.meta.configurationRevision) +
    '<label class="field span-two"><span>失败标签（以中文或英文逗号分隔）</span><input name="failureTags" value="' + e((t.failureTags || []).join('，')) + '" placeholder="例如：使用旧位置，抓取失败" maxlength="2000"></label>' +
    '<label class="field span-two"><span>视频或证据链接（可空）</span><input name="videoUrl" type="url" value="' + e(t.videoUrl || '') + '" placeholder="https://…" maxlength="4000"></label>' +
    '<label class="field span-two"><span>备注 / 无效回合的排除理由</span><textarea name="notes" id="trial-notes" maxlength="20000">' + e(t.notes || '') + '</textarea></label></div>';
  document.querySelector('#trial-dialog').showModal();
}

document.querySelector('#trial-form').addEventListener('submit', event => {
  event.preventDefault();
  const f = new FormData(event.currentTarget);
  const text = key => String(f.get(key) || '').trim();
  const num = key => text(key) === '' ? null : Number(text(key));
  const bool = key => text(key) === '' ? null : text(key) === 'true';
  const old = project.trials.find(t => t.id === editingTrial);
  const trial = {
    id: old?.id || crypto.randomUUID(), taskId: text('taskId'), conditionId: text('conditionId'), methodId: text('methodId'),
    scenarioId: text('scenarioId'), repeatIndex: num('repeatIndex'), phase: text('phase'), outcome: text('outcome'),
    durationSec: num('durationSec'), inferenceSec: num('inferenceSec'), motionSec: num('motionSec'), tokens: num('tokens'),
    targetCorrect: bool('targetCorrect'), orderCorrect: bool('orderCorrect'), staleMemoryUsed: bool('staleMemoryUsed'),
    failureTags: text('failureTags').split(/[,，]/).map(s => s.trim()).filter(Boolean),
    notes: text('notes'), videoUrl: text('videoUrl'), modelVersion: text('modelVersion'), configRevision: text('configRevision'),
    createdAt: old?.createdAt || new Date().toISOString()
  };
  const next = structuredClone(project);
  if (old) next.trials[next.trials.findIndex(t => t.id === old.id)] = trial;
  else next.trials.push(trial);
  try { validateProject(next); }
  catch (error) { document.querySelector('#trial-error').textContent = error.message; return; }
  const ok = mutate(p => { p.trials = next.trials; });
  if (ok) { document.querySelector('#trial-dialog').close(); toast('执行记录已保存到本机草稿。'); }
});

document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'task-search') { rememberOpen(); taskSearch = el.value; refreshTasks(); }
  if (el.id === 'budget-n') updateBudget();
});

document.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'suite-filter') { rememberOpen(); suiteFilter = el.value; refreshTasks(); }
  if (el.id === 'status-filter') { rememberOpen(); statusFilter = el.value; refreshTasks(); }
  if (el.id === 'coverage-filter') { coverageFilter = el.value; render(); }
  if (el.id === 'result-task') { resultTask = el.value; render(); }
  if (el.id === 'log-method') { logMethod = el.value; render(); }
  if (el.id === 'log-outcome') { logOutcome = el.value; render(); }
  if (el.id === 'budget-scope') updateBudget();
  if (el.dataset.status) mutate(p => { p.tasks.find(t => t.id === el.dataset.status).status = el.value; });
  if (el.dataset.prepTask) mutate(p => { p.tasks.find(t => t.id === el.dataset.prepTask).preparation.find(x => x.id === el.dataset.prepId).done = el.checked; });
  if (el.dataset.taskOwner) mutate(p => { p.tasks.find(t => t.id === el.dataset.taskOwner).owner = el.value; }, false);
  if (el.dataset.taskNotes) mutate(p => { p.tasks.find(t => t.id === el.dataset.taskNotes).notes = el.value; }, false);
  if (el.dataset.meta) {
    const ok = mutate(p => { p.meta[el.dataset.meta] = el.value.trim(); }, false);
    if (!ok) el.value = project.meta[el.dataset.meta];
  }
  if (el.id === 'trial-task') {
    const task = project.tasks.find(t => t.id === el.value);
    document.querySelector('#trial-condition').innerHTML = options(task.conditions.map(c => [c.id, c.label]));
  }
  if (el.id === 'trial-outcome') document.querySelector('#trial-notes').required = el.value === 'invalid';
});

document.addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-trial]');
  if (edit) { showTrial('', project.trials.find(t => t.id === edit.dataset.editTrial)); return; }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === 'export') {
    download(JSON.stringify(project, null, 2) + '\n', 'project.json', 'application/json;charset=utf-8');
    toast('数据已导出；提交为 site/data/project.json 后同步到团队网页。');
  }
  if (action === 'import') document.querySelector('#import-file').click();
  if (action === 'csv') download(toCsv(filteredLogs()), 'experiment-trials.csv', 'text/csv;charset=utf-8');
  if (action === 'record' || action === 'record-task') showTrial(actionButton.dataset.task || '');
  if (action === 'close-dialog') document.querySelector('#trial-dialog').close();
  if (action === 'reset') document.querySelector('#confirm-dialog').showModal();
  if (action === 'cancel-reset') document.querySelector('#confirm-dialog').close();
  if (action === 'confirm-reset') {
    try { localStorage.removeItem(storageKey); }
    catch { toast('浏览器无法清除存储，请通过浏览器设置清除本机草稿。'); return; }
    project = structuredClone(repositoryProject); draftBaseFingerprint = repositoryFingerprint; dirty = false; stale = false; saved = true;
    document.querySelector('#confirm-dialog').close(); render(); toast('已恢复仓库版本。');
  }
  if (action === 'print') window.print();
});

document.querySelector('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('文件超过 5 MiB，请拆分归档后再导入。');
    const data = validateProject(JSON.parse(await file.text()));
    project = structuredClone(data); draftBaseFingerprint = repositoryFingerprint; stale = false; persist(); render();
    toast('已导入本机草稿，GitHub 仓库尚未改变。');
  } catch (error) { toast('导入失败：' + error.message); }
  event.target.value = '';
});

window.addEventListener('hashchange', route);

async function init() {
  try {
    const response = await fetch('./data/project.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('方案数据请求失败：HTTP ' + response.status);
    repositoryProject = validateProject(await response.json());
    repositoryFingerprint = fingerprint(repositoryProject);
    draftBaseFingerprint = repositoryFingerprint;
    project = structuredClone(repositoryProject);
    try {
      const local = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (local) {
        validateProject(local.project);
        project = local.project; dirty = true;
        draftBaseFingerprint = local.baseFingerprint;
        stale = local.baseFingerprint !== repositoryFingerprint;
      }
    } catch { toast('无法读取本机草稿，已加载仓库版本。可重新导入已导出的数据。'); }
    route();
    if (stale) toast('仓库有新版本。本机草稿仍保留，请到维护页导出合并。');
  } catch (error) {
    main.innerHTML = '<div class="empty-state"><h2>方案暂时无法加载</h2><p>' + e(error.message) + '</p><p>本地请通过 HTTP 服务打开：npm run serve。也可以检查 data/project.json 是否有效。</p><button class="button primary" id="retry-load">重新加载</button></div>';
    document.querySelector('#retry-load').addEventListener('click', () => location.reload());
  }
}
init();
