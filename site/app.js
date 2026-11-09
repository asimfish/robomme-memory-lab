import { STATUS, OUTCOME, COVERAGE, escapeHtml as e, safeUrl, validateProject, statistics, toCsv, planWorkload } from './model.js?v=0.4.0';

const main = document.querySelector('#main');
const storageKey = 'astra-memory-lab:v1:' + location.pathname.replace(/index\.html$/, '');
let project, repositoryProject, repositoryFingerprint, draftBaseFingerprint, dirty = false, stale = false, saved = true;
let taskSearch = '', suiteFilter = '', statusFilter = '', coverageFilter = '', resultTask = '', logOutcome = '', logMethod = '';
let editingTrial = null, toastTimer, openTasks = new Set(), page = 'overview', activeTask = '';
const names = { overview: '研究方案', method: 'FDS 方法对齐', tasks: '任务与进度', coverage: '能力覆盖', results: '实验结果', protocol: '评测协议', maintain: '维护与导出' };
const fingerprint = value => {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
};
const options = (items, selected = '') => items.map(([value, label]) => '<option value="' + e(value) + '"' + (value === selected ? ' selected' : '') + '>' + e(label) + '</option>').join('');
const list = (items, ordered = false) => '<' + (ordered ? 'ol' : 'ul') + '>' + items.map(x => '<li>' + e(x) + '</li>').join('') + '</' + (ordered ? 'ol' : 'ul') + '>';
const button = (action, label, style = 'secondary') => '<button class="button ' + style + '" type="button" data-action="' + action + '">' + label + '</button>';
const intro = (kicker, title, description) => '<div class="page-intro"><span class="eyebrow">' + kicker + '</span><h1>' + title + '</h1><p>' + description + '</p></div>';
const section = (index, title, description = '', right = '') => '<div class="section-heading"><div><h2><span class="section-index">' + index + '</span>' + title + '</h2>' + (description ? '<p>' + description + '</p>' : '') + '</div>' + right + '</div>';
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
  return '<ol class="reference-list">' + project.sources.map(s => '<li><a href="' + e(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer">' + e(s.title) + ' ↗</a><p>' + e(s.note) + '</p></li>').join('') + '</ol>';
}

function methods(cardsOnly = false) {
  const rows = project.methods.filter(m => ['contract-off', 'ours', 'direct', 'history'].includes(m.id));
  return '<div class="table-panel"><table class="data-table method-table"><thead><tr><th>设置</th><th>比较内容</th><th>用途</th></tr></thead><tbody>' + rows.map(m => '<tr><td><strong>' + e(m.name) + '</strong></td><td><p>' + e(m.description) + '</p><small>' + e(m.control) + '</small></td><td>' + (m.id === 'direct' ? '可选系统参考' : '主要对照') + '</td></tr>').join('') + '</tbody></table></div>' + (cardsOnly ? '' : '<p class="caption">F0 / F1 隔离决策契约的影响。Astra-Direct 用于系统整体比较；Memory、Skill 与 RSI 的独立贡献需要另外的受控实验。</p>');
}

const chapterLinks = [
  ['study-overview', '概览'], ['study-method', '1. 方法与对照'], ['study-tasks', '2. 四类真机实验'],
  ['study-operation', '3. 人工操作与评测'], ['study-coverage', '4. 能力覆盖与边界'],
  ['study-results', '5. 实验结果'], ['study-references', '参考资料']
];

function taskDiagram(id) {
  const diagrams = {
    T1: '<rect x="58" y="86" width="72" height="8" rx="2" class="svg-pad"/><rect x="80" y="62" width="28" height="24" rx="2" class="svg-block"/><path d="M58 67C22 30 74 6 116 28M116 28l-15-1m15 1-5-13M126 44c37 38-11 69-57 46M69 90l15 1m-15-1 5 13" class="svg-path"/><text x="94" y="128">实际完成 → 计数 +1</text>',
    T2: '<path d="M40 54Q70 2 130 47" class="svg-path dashed"/><path d="M130 47l-12-4m12 4-2-13" class="svg-path"/><rect x="18" y="62" width="32" height="32" rx="3" class="svg-box"/><rect x="59" y="62" width="32" height="32" rx="3" class="svg-box"/><rect x="100" y="62" width="32" height="32" rx="3" class="svg-box"/><rect x="141" y="62" width="32" height="32" rx="3" class="svg-box"/><circle cx="116" cy="77" r="7" class="svg-block"/><path d="M14 59h40m1 0h40m1 0h40m1 0h40" class="svg-path"/><text x="94" y="128">新证据 → 更新位置</text>',
    T3: '<path d="M18 60h156" class="svg-path"/><path d="M67 60V22h26l-7 9 7 10H67" class="svg-path"/><circle cx="39" cy="60" r="6" class="svg-box"/><circle cx="105" cy="60" r="7" class="svg-block"/><circle cx="153" cy="60" r="6" class="svg-box"/><text x="39" y="86">之前</text><text x="105" y="86">首次</text><text x="153" y="86">之后</text><text x="94" y="128">翻牌后，首次真正释放</text>',
    T4: '<path d="M51 21v72m43-72v72m43-72v72M51 21h86M51 57h86M51 93h86" class="svg-grid"/><path d="M51 93V21h86v72" class="svg-path"/>' + [[51,21],[94,21],[137,21],[51,57],[94,57],[137,57],[51,93],[94,93],[137,93]].map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="4" class="svg-node"/>').join('') + '<circle cx="51" cy="93" r="6" class="svg-block"/><text x="94" y="128">记住顺序，核对棒尖</text>'
  };
  return '<svg class="task-diagram" viewBox="0 0 190 144" role="img" aria-label="' + e(id) + ' 任务示意">' + (diagrams[id] || '') + '</svg>';
}

function summaryResults() {
  const display = project.methods.filter(m => (project.planning?.methodIds || ['history', 'ours']).includes(m.id));
  return '<div class="table-panel"><table class="data-table result-summary"><thead><tr><th>任务</th><th>条件</th>' + display.map(m => '<th>' + e(m.name) + '</th>').join('') + '</tr></thead><tbody>' + project.tasks.flatMap(t => t.conditions.map(c => '<tr><td>' + e(t.id) + '</td><td>' + e(c.label) + '</td>' + display.map(m => '<td>' + resultCell(project.trials.filter(r => r.taskId === t.id && r.conditionId === c.id && r.methodId === m.id), m.id === 'ours') + '</td>').join('') + '</tr>')).join('') + '</tbody></table></div>';
}

function renderOverview() {
  const a = project.methodAlignment;
  const workload = planWorkload(project, project.planning?.scenesPerTask || 10, project.planning?.methodIds || ['history', 'ours']);
  const valid = project.trials.filter(t => t.phase === 'test' && t.outcome !== 'invalid');
  return '<header class="paper-header"><div class="paper-breadcrumb">RESEARCH PLAN <span>/</span> ASTRA · FRANKA · ROBOMME-PLUS</div><p class="paper-meta">实验方案 v' + e(project.meta.version) + ' <span>·</span> ' + e(project.meta.updatedAt) + '</p><h1>FDS：面向 Franka 的记忆与决策实验</h1><p class="paper-subtitle">以四类真机任务，检验记忆、证据核对与错误修正如何影响 Astra 的行动。</p><p class="paper-stage">' + e(project.meta.phase) + '</p><div class="resource-links"><a href="#study-tasks">四类实验</a><a href="' + e(safeUrl(a?.repository || project.meta.repositoryUrl)) + '" target="_blank" rel="noopener noreferrer">方法代码 ↗<small>需仓库权限</small></a><a href="https://robomme.github.io/plus.html" target="_blank" rel="noopener noreferrer">RoboMME-Plus ↗</a><a href="#results">实验记录</a></div></header>' +
    '<div class="paper-layout"><nav class="paper-toc" aria-label="文章目录"><span>目录</span>' + chapterLinks.map(([id, title]) => '<a href="#' + id + '">' + title + '</a>').join('') + '</nav><article class="paper-body">' +
    '<section id="study-overview" class="paper-section"><div class="key-points"><h2>本轮实验要回答什么</h2><ul><li><strong>记忆正确，是否就足够？</strong>固定同一套记忆与控制接口，比较 FDS 契约关闭（F0）与开启（F1）。</li><li><strong>证据不足时，系统会如何行动？</strong>观察是否过早决策、使用旧状态，以及失败后能否修正。</li><li><strong>真机上能否重复操作？</strong>只做四类任务，人手示范提前录制，执行期间不要求人工移物。</li></ul></div><h2>概览</h2><p>本方案将 RoboMME-Plus 中的代表性记忆机制落到 Franka 真机：完成事件计数、藏物位置更新、事件边界指代和轨迹顺序复现。重点是让历史信息影响一次可观察、可评分的真实行动。</p><p>首轮计划 <strong>' + (workload?.episodes || 80) + ' 次主对比</strong>：四类任务，每类 10 个独立场景，F0 / F1 配对执行；两个条件各 5 个场景。T2–T4 共用 30 段预录示范，16 次独立开发试跑另计。可选 Astra-Direct 追加 40 次执行。</p><p class="caption">本页是实验设计与记录文档。' + (valid.length ? '当前已有 ' + valid.length + ' 条有效正式执行记录。' : '当前没有真机实测结果，不能据此判断方法效果。') + '</p></section>' +
    '<section id="study-method" class="paper-section"><h2>1. 方法与对照</h2><p>' + e(a?.positioning || '当前草稿尚未包含完整 FDS 方法对齐，请导出保留后恢复共享版本。') + '</p><figure class="method-figure"><div class="method-line"><span>观察与历史</span><i>→</i><span>显式记忆</span><i>→</i><span class="highlight">FDS 决策契约</span><i>→</i><span>动作与反馈</span></div><figcaption>方法结构示意。两组共享观察、记忆与控制；F1 额外检查决策依据，并依据反馈修正。</figcaption></figure>' + methods(true) + '<p>Host 检查格式、引用与声明之间的关系；合法引用仍可能包含错误判断。命令执行完毕，也不等于完成了物理任务。因此，契约校验和真实任务成功分别评分。</p><a class="read-more" href="#method">实现依据、off / full 配置与待接入项 →</a></section>' +
    '<section id="study-tasks" class="paper-section"><h2>2. 四类真机实验</h2><p>每类只改变一个主要条件。以下为任务示意，展开可查看指令、评分规则、人工操作与准备进度。</p><div class="task-list paper-tasks">' + project.tasks.map(taskCard).join('') + '</div><p class="caption">示意图只说明任务结构，不代表真实场景或已完成的实验。</p></section>' +
    '<section id="study-operation" class="paper-section"><h2>3. 人工操作与评测</h2><p>把人工工作集中到开局与回合之间：场务负责示范、摆放与复位，控制台负责启动、确认停稳与记录。T1 无需示范；T2–T4 将同一段视频提供给两种方法，再匹配视频终态进行真实执行。</p><ol class="workflow-list">' + (project.operatorWorkflow || []).map(p => '<li><h3>' + e(p.title) + '</h3><p>' + e(p.body) + '</p></li>').join('') + '</ol><p><strong>主要指标：</strong>配对场景下的自主成功率、首次终止错误、依据不足仍行动的比例、真实失败后的恢复，以及时间和 token 成本。人工布置、复位耗时单独记录。</p><a class="read-more" href="#protocol">查看统一协议、冻结设置和完整指标 →</a></section>' +
    '<section id="study-coverage" class="paper-section"><h2>4. 能力覆盖与边界</h2><p>四类任务提供代表性机制证据，不能等同于完整复刻 RoboMME-Plus。仿真中的完整基准结论与真机上的机制结论分开报告。</p><div class="table-panel"><table class="data-table"><thead><tr><th>真机任务</th><th>主要检验</th><th>本轮边界</th></tr></thead><tbody><tr><td>T1 · 重复取放</td><td>完成事件计数</td><td>不评估实时按键与摆动周期。</td></tr><tr><td>T2 · 藏物追踪</td><td>位置更新、旧记忆失效</td><td>预录转移；不做执行期人手移物。</td></tr><tr><td>T3 · 事件指代</td><td>完成边界、翻牌后首次放置</td><td>不覆盖任意第 k 次事件查询。</td></tr><tr><td>T4 · 轨迹复现</td><td>节点顺序、执行进度与棒尖位置</td><td>固定网格；不含工具迁移或动态绕障。</td></tr></tbody></table></div><a class="read-more" href="#coverage">查看全部 16 项基准的对应关系与缺口 →</a></section>' +
    '<section id="study-results" class="paper-section"><h2>5. 实验结果</h2><p>' + (valid.length ? '以下汇总正式执行记录。' : '实验尚未录入，所有条件保留为“待测”。') + '开发回合不计入成功率，人工干预计为非自主成功。配对差异需要按场景另外分析。</p>' + summaryResults() + '<p class="caption">表中显示成功率及成功数 / 有效执行数；仅独立场景显示 Wilson 区间。重复场景需聚类分析。</p><a class="read-more" href="#results">录入、核对或导出逐回合记录 →</a></section>' +
    '<section id="study-references" class="paper-section"><h2>参考资料</h2>' + sourceCards() + '</section></article></div>';
}


function renderMethod() {
  const a = project.methodAlignment;
  if (!a) return intro('METHOD ALIGNMENT', '当前草稿尚未包含 FDS 对齐。', '先导出旧草稿保存记录，再恢复共享方案查看新的方法依据。');
  const cards = rows => '<div class="protocol-grid">' + rows.map(x => '<article class="protocol-card"><span class="chip outline">' + e(x.status) + '</span><h3>' + e(x.title) + '</h3><p>' + e(x.body) + '</p>' + (x.source ? '<a class="task-link" href="' + e(safeUrl(x.source)) + '" target="_blank" rel="noopener noreferrer">固定提交中的实现 ↗</a>' : '') + '</article>').join('') + '</div>';
  return intro('FDS × FRANKA', 'FDS 方法与实现依据', a.positioning) +
    '<div class="method-provenance"><span class="chip green">已核对代码</span><span>FDS <code>' + e(a.commit.slice(0, 7)) + '</code> · ' + e(a.reviewedAt) + '</span><a href="' + e(safeUrl(a.repository)) + '" target="_blank" rel="noopener noreferrer">方法仓库（需访问权限） ↗</a></div>' +
    '<div class="evidence-flow" aria-label="公开观察经过显式记忆、决策契约、真实行动和反馈更新形成闭环">' + ['公开观察', '显式记忆', '决策契约', '真实行动', '反馈与修正'].map((x, i) => '<div><small>0' + (i + 1) + '</small><strong>' + x + '</strong></div>').join('') + '</div>' +
    '<div class="notice orange"><strong>当前证据边界：</strong>host 核验格式、引用和声明之间的关系；合法证据引用不保证语义正确，命令完成不保证任务成功。Franka 适配仍需接入，页面尚无真实结果。</div>' +
    section('01', '代码已经做了什么', '区分仓库中的实现、论文假设与真机接入工作。') + cards(a.facts) +
    section('02', '主对比只切换一个因素', '固定 Harness=1、Memory=1、Skill=0、测试期 RSI=0。') +
    '<div class="protocol-grid">' + a.configs.map(c => '<article class="protocol-card"><h3>' + e(c.title) + '</h3><pre class="config-code"><code>' + e(c.code) + '</code></pre><p>' + e(c.body) + '</p></article>').join('') + '</div>' +
    '<div class="maintenance-card method-controls"><h3>两组共同固定</h3>' + list(a.controls, true) + '</div>' +
    section('03', '消融要有真实开关', '首轮硬件只做 F0/F1；其他机制优先在仿真或离线完成。') + cards(a.ablations) +
    section('04', '正式真机实验前的接入项', '这些是待完成事项，不代表仓库已经支持 Franka 执行。') + cards(a.readiness) +
    '<div class="notice">若论文主张仍以“记忆增强”为主，应另外证明 Memory 的贡献。仅 F0/F1 能隔离 FDS 效果，F1 与原始 Astra-Direct 的差异是系统整体效果。</div>';
}

function taskCard(t) {
  const done = t.preparation.filter(x => x.done).length;
  const opened = openTasks.has(t.id) || activeTask === t.id;
  return '<article class="task-card" id="task-' + e(t.id) + '"><details data-task-details="' + e(t.id) + '"' + (opened ? ' open' : '') + '><summary><div class="task-preview">' + taskDiagram(t.id) + '<div class="task-preview-copy"><span class="task-card-kicker">' + e(t.id) + ' <span> / </span>' + e(t.englishTitle) + '</span><h3>' + e(t.title) + '</h3><p>' + e(t.purpose) + '</p><div class="task-conditions">' + t.conditions.map(c => e(c.label)).join(' <span>vs.</span> ') + '</div><span class="task-open-label">流程与操作卡 <span aria-hidden="true">↓</span></span></div></div></summary><div class="task-detail"><h4>任务指令 / PROMPT</h4><div class="prompt-box" lang="en">' + e(t.prompt) + '</div><div class="detail-grid">' +
    '<div class="detail-block"><h4><span>01</span>场景与道具</h4>' + list(t.props) + '</div><div class="detail-block"><h4><span>02</span>执行流程</h4>' + list(t.steps, true) + '</div>' +
    '<div class="detail-block"><h4><span>03</span>测试条件 · 计划每条件 ' + e(t.targetPerCondition) + ' 个场景</h4><div class="condition-list">' + t.conditions.map((c, i) => '<div class="condition"><span class="chip ' + (i < 2 ? '' : 'blue') + '">' + (i < 2 ? '主条件' : '扩展 / 消融') + '</span><strong>' + e(c.label) + '</strong><p>' + e(c.change) + '</p></div>').join('') + '</div></div>' +
    '<div class="detail-block"><h4><span>04</span>成功判定</h4>' + list(t.success) + '<h4 style="margin-top:18px"><span>05</span>任务专属指标</h4>' + list(t.metrics) + '</div>' +
    '<div class="detail-block"><h4><span>06</span>失败标签</h4><div>' + t.failures.map(f => '<span class="chip outline" style="margin:0 5px 6px 0">' + e(f) + '</span>').join('') + '</div></div>' +
    '<div class="detail-block"><h4><span>07</span>设计与控制要点</h4>' + list(t.designNotes) + '</div></div>' +
    renderOperations(t) +
    '<div class="task-edit-area"><div class="task-edit-heading"><h4>准备进度 <span class="text-muted">' + done + ' / ' + t.preparation.length + '</span></h4><select id="status-' + e(t.id) + '" data-status="' + e(t.id) + '" aria-label="' + e(t.id) + ' 任务状态">' + options(Object.entries(STATUS), t.status) + '</select></div><div class="checklist">' + t.preparation.map(x => '<label><input id="prep-' + e(t.id) + '-' + e(x.id) + '" type="checkbox" data-prep-task="' + e(t.id) + '" data-prep-id="' + e(x.id) + '"' + (x.done ? ' checked' : '') + '>' + e(x.label) + '</label>').join('') + '</div><div class="task-note-fields"><label class="field"><span>负责人</span><input data-task-owner="' + e(t.id) + '" value="' + e(t.owner) + '" placeholder="待分配" maxlength="200"></label><label class="field"><span>实验备注 / 场景与视频链接</span><textarea data-task-notes="' + e(t.id) + '" placeholder="记录设置变化、待确认参数或视频链接…" maxlength="20000">' + e(t.notes) + '</textarea></label></div><div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:12px"><div class="text-muted" style="font-size:10px">对应仿真：' + e(t.benchmark.join(' / ')) + '</div><button class="button small secondary" data-action="record-task" data-task="' + e(t.id) + '">记录执行 ↗</button></div></div></div></details><div class="task-progress" aria-label="准备完成 ' + done + ' 项"><span style="width:' + (done / t.preparation.length * 100) + '%"></span></div></article>';
}

function renderOperations(t) {
  if (!t.operations) return '';
  const o = t.operations;
  return '<section class="operator-card"><div class="operator-heading"><div><span class="eyebrow">HUMAN OPERATION</span><h3>人怎么操作，下一回合怎么复位</h3></div><span class="chip green">' + e(o.mode) + '</span></div><div class="detail-grid"><div class="detail-block"><h4>执行前 · 人工准备</h4>' + list(o.humanBefore, true) + '</div><div class="detail-block"><h4>结束后 · 人工复位</h4>' + list(o.reset, true) + '</div></div><div class="notice"><strong>机器人执行中：</strong>' + e(o.duringExecution) + '</div><div class="detail-block"><h4>可复现性核对</h4>' + list(o.consistency) + '</div></section>';
}

function renderTasks() {
  const suites = [...new Set(project.tasks.map(t => t.suite))];
  return intro('TASKS & PROGRESS', '四类任务与操作卡', '本轮只保留四类。展开任务可查看人工准备、机器人执行期分工和回合后复位；执行过程中不要求人同步移动目标。') +
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
  return intro('BENCHMARK COVERAGE', 'RoboMME-Plus 能力覆盖', '对照 RoboMME-Plus 全部 16 项任务，标明当前设计的对应关系与缺口。任务映射不等同于完整复刻，更不表示已经取得实测结果。') +
    '<div class="coverage-summary">' + Object.entries(COVERAGE).map(([k, label]) => '<span><strong>' + counts[k] + '</strong>' + label + '</span>').join('') + '</div><div class="toolbar"><select id="coverage-filter" aria-label="筛选对应程度">' + options([['', '全部对应关系'], ...Object.entries(COVERAGE)], coverageFilter) + '</select><span class="filter-summary">方案对应关系 · 实测以实验结果页为准</span></div>' +
    '<div class="table-panel"><table class="data-table"><thead><tr><th>SUITE</th><th>RoboMME-Plus 任务</th><th>真机任务</th><th>设计对应</th><th>已覆盖的设计与剩余缺口</th></tr></thead><tbody>' + rows.map(c => '<tr><td class="coverage-suite">' + e(c.suite) + '</td><td class="mono">' + e(c.benchmark) + '</td><td>' + (taskLinks(c.tasks) || '<span class="text-muted">—</span>') + '</td><td><span class="chip coverage-' + e(c.level) + '">' + e(COVERAGE[c.level]) + '</span></td><td class="coverage-note">' + e(c.note) + '</td></tr>').join('') + '</tbody></table></div>' +
    '<div class="notice orange">本轮有意收敛：实时按键、摆动周期、可见物体高亮 / repick、滚球与工具迁移、精密插入和动态绕障未列入正式真机实验。矩阵保留这些缺口，不为凑齐 16 项增加操作负担。</div>' +
    section('01', '如何使用这张矩阵', '先证明关键记忆机制能迁移到硬件，再据实际结果界定能力范围。') +
    '<div class="protocol-grid"><article class="protocol-card"><div class="protocol-number">SIMULATION</div><h3>完整基准表现</h3><p>仿真若完成官方 16 项任务与 800 个固定测试回合，可用于支持整体基准结论。零样本与适配设置分别记录。</p></article><article class="protocol-card"><div class="protocol-number">REAL WORLD</div><h3>硬件上的机制证据</h3><p>真机评估计数、藏物更新、事件指代和顺序执行中的决策可靠性；经验仅限 episode 内。离线诊断不能当作真实执行收益。</p></article></div>';
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
  const methodIds = project.methods.filter(m => ['baseline', 'ours'].includes(m.kind) || project.trials.some(t => t.methodId === m.id)).map(m => m.id);
  const displayMethods = methodIds.map(id => project.methods.find(m => m.id === id)).filter(Boolean);
  const logs = filteredLogs();
  const tasks = project.tasks.filter(t => !resultTask || t.id === resultTask);
  const tableRows = tasks.flatMap(t => t.conditions.map(c => {
    const records = project.trials.filter(r => r.taskId === t.id && r.conditionId === c.id);
    return '<tr><td><strong>' + e(t.id) + '</strong><small>' + e(t.title) + '</small></td><td>' + e(c.label) + '</td>' + displayMethods.map(m => '<td>' + resultCell(records.filter(r => r.methodId === m.id), m.id === 'ours') + '</td>').join('') + '</tr>';
  }));
  return intro('EXPERIMENT RESULTS', '实验结果与执行记录', '按任务与条件展示正式执行结果。开发回合不计入 SR，人工干预计为非自主成功；无效回合保留排除理由。') +
    '<p class="record-count">' + project.trials.length + ' 条执行记录 · ' + valid.length + ' 条有效正式执行 · ' + uniqueScenes.size + ' 个场景。' + (project.trials.length ? '' : '当前没有实测数据。') + '</p>' +
    section('01', '主结果表', '显示成功率、成功数 / 有效执行数；独立场景给出 95% Wilson 区间。', button('record', '+ 记录执行', 'primary')) +
    '<div class="toolbar"><select id="result-task" aria-label="筛选结果任务">' + options([['', '全部任务'], ...project.tasks.map(t => [t.id, t.id + ' · ' + t.title])], resultTask) + '</select><span class="filter-summary">主要对照：同版本 F0 vs F1</span></div>' +
    '<div class="table-panel"><table class="data-table"><thead><tr><th>任务</th><th>测试条件</th>' + displayMethods.map(m => '<th>' + e(m.name) + '</th>').join('') + '</tr></thead><tbody>' + tableRows.join('') + '</tbody></table></div>' +
    '<div class="notice">表中区间以独立场景为前提。同一方法、任务与条件存在重复场景时，不展示逐执行 Wilson 区间；配对差异和重复场景的区间需另外按场景分析。零记录表示“待测”，不等于 0% 成功。</div>' +
    section('02', '逐回合记录', '下面的筛选仅影响记录列表和 CSV 导出，不改变上方 SR 的分母。', button('csv', '导出 CSV')) +
    '<div class="toolbar"><select id="log-method" aria-label="筛选记录方法">' + options([['', '全部方法'], ...project.methods.map(m => [m.id, m.name])], logMethod) + '</select><select id="log-outcome" aria-label="筛选记录结果">' + options([['', '全部结果'], ...Object.entries(OUTCOME)], logOutcome) + '</select><span class="filter-summary">显示最近 ' + Math.min(logs.length, 50) + ' 条 / 共 ' + logs.length + ' 条</span></div>' +
    '<div class="table-panel trial-log"><table class="data-table"><thead><tr><th>场景 / 任务</th><th>方法 / 阶段</th><th>结果</th><th>总时长 / TOKEN</th><th>备注与证据</th><th>维护</th></tr></thead><tbody>' +
    (logs.length ? [...logs].reverse().slice(0, 50).map(t => {
      const method = project.methods.find(m => m.id === t.methodId);
      const task = project.tasks.find(x => x.id === t.taskId);
      const cond = task.conditions.find(c => c.id === t.conditionId);
      return '<tr><td><strong>' + e(t.scenarioId) + '</strong><small>' + e(t.taskId + ' · ' + cond.label) + (t.demoId ? '<br>示范 ' + e(t.demoId) : '') + '<br>重复 #' + t.repeatIndex + '</small></td><td>' + e(method.name) + '<small>' + (t.phase === 'test' ? '正式测试' : '开发回合') + '</small></td><td class="outcome-' + e(t.outcome) + '">' + e(OUTCOME[t.outcome]) + '</td><td>' + (t.durationSec == null ? '—' : e(t.durationSec) + ' s') + '<small>' + (t.tokens == null ? '未记录 token' : t.tokens.toLocaleString() + ' token') + '</small>' + (t.setupSec != null || t.resetSec != null ? '<small>人工布置 / 复位：' + e(t.setupSec ?? '—') + ' / ' + e(t.resetSec ?? '—') + ' s</small>' : '') + '</td><td>' + e(t.notes || '—') + '<small>' + e(t.failureTags.join(' / ')) + '</small>' + (safeUrl(t.videoUrl) ? '<a class="task-link" href="' + e(safeUrl(t.videoUrl)) + '" target="_blank" rel="noopener noreferrer">视频 ↗</a>' : '') + '</td><td><button class="button small secondary" data-edit-trial="' + e(t.id) + '">编辑</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="text-muted">暂无符合条件的记录。</td></tr>') + '</tbody></table></div>';
}

function renderProtocol() {
  const workflow = project.operatorWorkflow || [];
  return intro('EVALUATION & HUMAN OPERATION', '人工操作与统一评测协议', '人工负责预录示范、开局核对和停机后复位。机器人执行时不再变化场景，不要求人和模型推理延迟同步。') +
    section('01', '一轮实验的人工操作', '同一演示和终态跨方法复用；任务演示与额外救援分别记录。') +
    '<div class="protocol-grid">' + workflow.map((p, i) => '<article class="protocol-card"><div class="protocol-number">OPERATOR ' + String(i + 1).padStart(2, '0') + '</div><h3>' + e(p.title) + '</h3><p>' + e(p.body) + '</p></article>').join('') + '</div>' +
    section('02', '统一评测协议', '演示 ID、人工复位与机器人执行需要分别记录。') +
    '<div class="protocol-grid">' + project.protocol.map((p, i) => '<article class="protocol-card"><div class="protocol-number">' + String(i + 1).padStart(2, '0') + '</div><h3>' + e(p.title) + '</h3><p>' + e(p.body) + '</p></article>').join('') + '</div>' +
    section('03', '统一指标', '人工布置 / 复位耗时与机器人回合耗时分开。') + '<div class="metrics-list">' + project.metrics.map(m => '<div class="metric-row"><strong>' + e(m.name) + '</strong><p>' + e(m.definition) + '</p></div>').join('') + '</div>' +
    section('04', '方法设置') + methods() +
    '<div class="notice">四类仅代表选择的记忆机制。预录人手动态示范 + 真实执行是视频条件真机任务，不等同于在真人持续移物时实时闭环控制。</div>';
}

function renderMaintain() {
  const repo = project.meta.repositoryUrl;
  const coreCount = project.tasks.filter(t => t.priority === '核心').length;
  return intro('MAINTAIN THE WORKSPACE', '数据维护与导出', 'GitHub 中的 project.json 是团队共享版本。本机编辑后导出并提交，GitHub Pages 自动更新。') +
    '<div class="maintenance-grid"><section class="maintenance-card"><span class="eyebrow">LOCAL DRAFT → SHARED VERSION</span><h3 style="margin-top:10px">维护与发布</h3><p>编辑任务进度、复位备注和逐回合结果。导入文件整体替换本机草稿，不会直接修改 GitHub。</p><div class="maintenance-actions">' + button('export', '导出 project.json', 'primary') + button('import', '导入数据') + button('csv', '导出结果 CSV') + '</div><ol class="maintenance-steps"><li>编辑完成，点击<strong>导出 project.json</strong>。</li><li>替换 GitHub 的 <code>site/data/project.json</code> 并提交。</li><li>等待 Actions 验证和部署，再刷新共享版本。</li></ol>' +
    (repo ? '<a class="button small orange" style="margin-top:18px" href="' + e(repo + '/edit/main/site/data/project.json') + '" target="_blank" rel="noopener noreferrer">在 GitHub 编辑数据 ↗</a>' : '') +
    '<br><button class="danger-link" data-action="reset">恢复仓库版本，清除本机草稿</button></section>' +
    '<section class="maintenance-card"><span class="eyebrow">SMALLER EXPERIMENT BUDGET</span><h3 style="margin-top:10px">先跑四类，样本按预算增加</h3><p>按每类总场景数估算，两个条件共享这些场景。不是每条件各做所填数量；同一场景在不同方法下独立复位执行。</p><div id="budget-display"></div><div class="budget-controls"><label>每类总场景 <input id="budget-n" type="number" min="2" max="1000" value="' + (project.planning?.scenesPerTask || 10) + '"></label><label>对照设置 <select id="budget-methods"><option value="primary">主对比：F0 / F1</option><option value="all">追加参考：F0 / F1 / Direct</option></select></label></div><div class="notice">' + coreCount + ' 类首轮建议每类 10 个场景；资源允许再补到 20 个。预实验、额外真机消融另计，不能保证小样本显著。</div></section></div>' +
    section('01', '项目设置', '保存到本机草稿，导出后进入版本管理。') +
    '<section class="maintenance-card"><div class="form-grid">' + [
      ['robot', '机器人与夹爪'], ['cameras', '相机设置'], ['modelVersion', '模型版本'], ['configurationRevision', '提示 / 配置版本'], ['repositoryUrl', 'GitHub 仓库地址'], ['version', '方案版本']
    ].map(([key, label]) => '<label class="field"><span>' + label + '</span><input data-meta="' + key + '" value="' + e(project.meta[key]) + '"></label>').join('') + '<label class="field span-two"><span>项目说明</span><textarea data-meta="notes">' + e(project.meta.notes) + '</textarea></label></div></section>' +
    section('02', '操作卡与归档') + '<div class="maintenance-card"><p>任务详情里的人工操作卡可直接打印。场景视频、终态照片和隐藏答案在实验端按场景 ID 管理；策略只接收允许的观察，网页不预填评分答案。</p><div class="maintenance-actions">' + button('print', '打印当前页面 / 保存 PDF') + '</div></div>';
}

function updateBudget() {
  if (!document.querySelector('#budget-display')) return;
  const n = Number(document.querySelector('#budget-n').value);
  const primary = project.planning?.methodIds || ['history', 'ours'];
  const selected = document.querySelector('#budget-methods').value === 'primary' ? primary : [...new Set([...primary, 'direct'])].filter(id => project.methods.some(m => m.id === id));
  const estimate = planWorkload(project, n, selected);
  if (!estimate) { document.querySelector('#budget-display').innerHTML = '<p class="notice">请输入至少 2 个独立场景。</p>'; return; }
  const split = estimate.allocations[0]?.conditions.map(c => c.scenes).join(' + ') || '';
  document.querySelector('#budget-display').innerHTML = '<div class="budget-total">' + estimate.episodes.toLocaleString() + '<small>预计真机回合</small></div><p class="budget-equation">' + estimate.tasks + ' 类 × 每类 ' + n + ' 场景 × ' + estimate.methods + ' 方法<br>每类两个条件分配 ' + split + ' 个场景；共 ' + estimate.independentScenes + ' 个独立场景。<br>需要 ' + estimate.demoClips + ' 段人手示范视频，跨方法复用。</p>';
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
  const renderers = { overview: renderOverview, method: renderMethod, tasks: renderTasks, coverage: renderCoverage, results: renderResults, protocol: renderProtocol, maintain: renderMaintain };
  main.classList.toggle('document-view', page === 'overview');
  main.innerHTML = (page === 'overview' ? '' : '<a class="back-to-paper" href="#overview">← 返回研究方案</a>') + (stale ? '<div class="notice orange stale-banner"><strong>共享方案已更新为 v' + e(repositoryProject.meta.version) + '（' + repositoryProject.tasks.length + ' 类）。</strong>当前显示的是旧本机草稿，请先导出保留，再恢复共享版本。 ' + button('reset', '恢复共享方案') + '</div>' : '') + renderers[page]();
  if (page === 'tasks') refreshTasks();
  if (page === 'maintain') updateBudget();
  updateChrome();
  document.querySelector('#page-name').textContent = names[page];
  document.title = names[page] + ' · ' + project.meta.title;
  document.querySelectorAll('[data-route]').forEach(a => {
    const active = a.dataset.route === page;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  observeChapters();
}

let chapterObserver;
function observeChapters() {
  chapterObserver?.disconnect();
  if (page !== 'overview') return;
  chapterObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      document.querySelectorAll('.paper-toc a').forEach(a => {
        const active = a.hash === '#' + entry.target.id;
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-5% 0px -70% 0px' });
  document.querySelectorAll('.paper-section').forEach(el => chapterObserver.observe(el));
}

function route() {
  const parts = location.hash.slice(1).split('/');
  const chapter = chapterLinks.find(([id]) => id === parts[0])?.[0];
  const previousPage = page;
  page = Object.hasOwn(names, parts[0]) ? parts[0] : 'overview';
  activeTask = page === 'tasks' && /^T[1-9][0-9]*$/.test(parts[1] || '') ? parts[1] : '';
  if (activeTask) {
    taskSearch = ''; suiteFilter = ''; statusFilter = '';
    openTasks.add(activeTask);
  }
  document.querySelector('.tools-menu').open = false;
  // Same-document jumps preserve expanded tasks and in-progress fields.
  if (!(chapter && previousPage === 'overview' && document.querySelector('#' + chapter))) render();
  if (chapter) requestAnimationFrame(() => document.getElementById(chapter)?.scrollIntoView({ block: 'start', behavior: 'instant' }));
  else if (activeTask) requestAnimationFrame(() => document.querySelector('#task-' + activeTask)?.scrollIntoView({ block: 'start', behavior: 'instant' }));
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
    inputField('demoId', '示范 ID（T1 可空）', t.demoId || '', 'text', 'maxlength="200"') +
    selectField('resetVerified', '起始 / 终态复位是否核对', [['', '未记录'], ['true', '已核对匹配'], ['false', '发现不匹配']], String(t.resetVerified ?? '')) +
    inputField('setupSec', '人工布置耗时 / 秒（可空）', t.setupSec, 'number', 'min="0" step="any"') +
    inputField('resetSec', '人工复位耗时 / 秒（可空）', t.resetSec, 'number', 'min="0" step="any"') +
    inputField('durationSec', '机器人回合耗时 / 秒（不含布置复位）', t.durationSec, 'number', 'min="0" step="any"') +
    inputField('inferenceSec', '推理等待 / 秒（可空）', t.inferenceSec, 'number', 'min="0" step="any"') +
    inputField('motionSec', '运动耗时 / 秒（可空）', t.motionSec, 'number', 'min="0" step="any"') +
    inputField('tokens', '总 token（可空）', t.tokens, 'number', 'min="0" step="1"') +
    selectField('targetCorrect', '首次目标是否正确', [['', '未评分'], ['true', '正确'], ['false', '错误']], String(t.targetCorrect ?? '')) +
    selectField('orderCorrect', '操作顺序是否正确', [['', '未评分'], ['true', '正确'], ['false', '错误']], String(t.orderCorrect ?? '')) +
    selectField('staleMemoryUsed', '是否使用失效记忆', [['', '未评分'], ['true', '是'], ['false', '否']], String(t.staleMemoryUsed ?? '')) +
    inputField('decisionRejections', '协议拒绝数（未统计留空）', t.decisionRejections, 'number', 'min="0" step="1"') +
    inputField('decisionRecoveries', '恢复通过校验的序列数', t.decisionRecoveries, 'number', 'min="0" step="1"') +
    selectField('semanticFailureObserved', '是否发生可观察物理 / 语义失败', [['', '未标注'], ['true', '是'], ['false', '否']], String(t.semanticFailureObserved ?? '')) +
    selectField('prematureAction', '依据不足是否仍采取依赖动作', [['', '未标注'], ['true', '是'], ['false', '否']], String(t.prematureAction ?? '')) +
    '<p class="field-note span-two">协议恢复只表示重新通过校验；真实失败后的恢复结合最终结果单独分析。F0 没有 FDS 契约，契约专属指标为 N/A。</p>' +
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
    demoId: text('demoId'), resetVerified: bool('resetVerified'), setupSec: num('setupSec'), resetSec: num('resetSec'),
    durationSec: num('durationSec'), inferenceSec: num('inferenceSec'), motionSec: num('motionSec'), tokens: num('tokens'),
    decisionRejections: num('decisionRejections'), decisionRecoveries: num('decisionRecoveries'),
    semanticFailureObserved: bool('semanticFailureObserved'), prematureAction: bool('prematureAction'),
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
  if (el.id === 'budget-methods') updateBudget();
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
  if (event.target.closest('.skip-link')) { event.preventDefault(); main.focus(); main.scrollIntoView({ block: 'start' }); return; }
  if (!event.target.closest('.tools-menu') || event.target.closest('.tools-menu a')) document.querySelector('.tools-menu').open = false;
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

document.addEventListener('keydown', event => {
  const menu = document.querySelector('.tools-menu');
  if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
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
