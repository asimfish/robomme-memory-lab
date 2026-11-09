import { STATUS, OUTCOME, COVERAGE, escapeHtml as e, safeUrl, validateProject, statistics, toCsv, planWorkload } from './model.js?v=0.4.1';

const main = document.querySelector('#main');
const storageKey = 'astra-memory-lab:v1:' + location.pathname.replace(/index\.html$/, '');
let project, repositoryProject, repositoryFingerprint, draftBaseFingerprint, dirty = false, stale = false, saved = true;
let taskSearch = '', suiteFilter = '', statusFilter = '', coverageFilter = '', resultTask = '', logOutcome = '', logMethod = '';
let editingTrial = null, toastTimer, openTasks = new Set(), page = 'overview', activeTask = '';
const names = { overview: '研究方案', method: '方法与代码依据', tasks: '四类任务与操作卡', coverage: '基准来源与覆盖', results: '实验记录', protocol: '现场流程与评测', maintain: '数据维护与导出' };
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
  return '<div class="table-panel"><table class="data-table method-table"><thead><tr><th>实验设置</th><th>工作方式与控制条件</th><th>实验角色</th></tr></thead><tbody>' + rows.map(m => '<tr><td><strong>' + e(m.name) + '</strong></td><td><p>' + e(m.description) + '</p><small>' + e(m.control) + '</small></td><td>' + (m.id === 'direct' ? '可选系统参考' : '主对比组') + '</td></tr>').join('') + '</tbody></table></div>' + (cardsOnly ? '' : '<p class="caption">F0（不启用 FDS）与 F1（启用 FDS）共享同一套显式记忆和底层控制，仅切换 FDS 契约。Astra-Direct 用于观察整套系统的总体表现；Memory、Skill 与训练期自改进的独立贡献需另做受控消融。</p>');
}

const chapterLinks = [
  ['study-overview', '问题与概览'], ['study-method', '1. 方法与两组对照'], ['study-tasks', '2. 四类真机任务'],
  ['study-operation', '3. 现场流程与评分'], ['study-coverage', '4. 任务来源与边界'],
  ['study-results', '5. 实验结果'], ['study-references', '参考资料']
];

function taskDiagram(id) {
  const diagrams = {
    T1: '<rect x="58" y="86" width="72" height="8" rx="2" class="svg-pad"/><rect x="80" y="62" width="28" height="24" rx="2" class="svg-block"/><path d="M58 67C22 30 74 6 116 28M116 28l-15-1m15 1-5-13M126 44c37 38-11 69-57 46M69 90l15 1m-15-1 5 13" class="svg-path"/><text x="94" y="128">完成抓放松爪 → 计数 +1</text>',
    T2: '<path d="M40 54Q70 2 130 47" class="svg-path dashed"/><path d="M130 47l-12-4m12 4-2-13" class="svg-path"/><rect x="18" y="62" width="32" height="32" rx="3" class="svg-box"/><rect x="59" y="62" width="32" height="32" rx="3" class="svg-box"/><rect x="100" y="62" width="32" height="32" rx="3" class="svg-box"/><rect x="141" y="62" width="32" height="32" rx="3" class="svg-box"/><circle cx="116" cy="77" r="7" class="svg-block"/><path d="M14 59h40m1 0h40m1 0h40m1 0h40" class="svg-path"/><text x="94" y="128">看清换盒 → 更新位置</text>',
    T3: '<path d="M18 60h156" class="svg-path"/><path d="M67 60V22h26l-7 9 7 10H67" class="svg-path"/><circle cx="39" cy="60" r="6" class="svg-box"/><circle cx="105" cy="60" r="7" class="svg-block"/><circle cx="153" cy="60" r="6" class="svg-box"/><text x="39" y="86">翻牌前</text><text x="105" y="86">首次松手</text><text x="153" y="86">后续动作</text><text x="94" y="128">翻牌后，首次放下并松手</text>',
    T4: '<path d="M51 21v72m43-72v72m43-72v72M51 21h86M51 57h86M51 93h86" class="svg-grid"/><path d="M51 93V21h86v72" class="svg-path"/>' + [[51,21],[94,21],[137,21],[51,57],[94,57],[137,57],[51,93],[94,93],[137,93]].map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="4" class="svg-node"/>').join('') + '<circle cx="51" cy="93" r="6" class="svg-block"/><text x="94" y="128">按序走点，核对棒尖</text>'
  };
  return '<svg class="task-diagram" viewBox="0 0 190 144" role="img" aria-label="' + e(id) + ' 任务示意">' + (diagrams[id] || '') + '</svg>';
}

function summaryResults() {
  const display = project.methods.filter(m => (project.planning?.methodIds || ['history', 'ours']).includes(m.id));
  return '<div class="table-panel"><table class="data-table result-summary"><thead><tr><th>任务</th><th>测试条件</th>' + display.map(m => '<th>' + e(m.name) + '</th>').join('') + '</tr></thead><tbody>' + project.tasks.flatMap(t => t.conditions.map(c => '<tr><td>' + e(t.id) + '</td><td>' + e(c.label) + '</td>' + display.map(m => '<td>' + resultCell(project.trials.filter(r => r.taskId === t.id && r.conditionId === c.id && r.methodId === m.id), m.id === 'ours') + '</td>').join('') + '</tr>')).join('') + '</tbody></table></div>';
}

function renderOverview() {
  const a = project.methodAlignment;
  const workload = planWorkload(project, project.planning?.scenesPerTask || 10, project.planning?.methodIds || ['history', 'ours']);
  const valid = project.trials.filter(t => t.phase === 'test' && t.outcome !== 'invalid');
  return '<header class="paper-header"><div class="paper-breadcrumb">RESEARCH PLAN <span>/</span> ASTRA · FRANKA · ROBOMME-PLUS</div><p class="paper-meta">实验方案 v' + e(project.meta.version) + ' <span>·</span> ' + e(project.meta.updatedAt) + '</p><h1>FDS × Franka：真机实验方案</h1><p class="paper-subtitle">通过四类真机任务，对比不启用 FDS（F0）与启用 FDS（F1）对 Astra 行动的影响。</p><p class="paper-stage">' + e(project.meta.phase) + '</p><div class="resource-links"><a href="#study-tasks">四类真机任务</a><a href="' + e(safeUrl(a?.repository || project.meta.repositoryUrl)) + '" target="_blank" rel="noopener noreferrer">方法代码 ↗<small>需仓库权限</small></a><a href="https://robomme.github.io/plus.html" target="_blank" rel="noopener noreferrer">RoboMME-Plus 基准 ↗</a><a href="#results">实验记录</a></div></header>' +
    '<div class="paper-layout"><nav class="paper-toc" aria-label="文章目录"><span>目录</span>' + chapterLinks.map(([id, title]) => '<a href="#' + id + '">' + title + '</a>').join('') + '</nav><article class="paper-body">' +
    '<section id="study-overview" class="paper-section"><h2>核心问题与概览</h2><p>两组都保留同一套显式记忆与基础格式纠正。<strong>F0 不启用 FDS</strong>；<strong>F1 启用 FDS</strong>，要求模型按契约结构输出动作依据，经系统检查后再执行，并在下一轮接收执行反馈。本方案通过四类真机任务，检验开启 FDS 能否减少依据不足仍行动、旧状态误用与计数偏差。</p><div class="key-points"><h2>本轮实验重点观察三件事</h2><ul><li><strong>已有记忆时，开启 FDS 是否有增益？</strong>固定同一套显式记忆、关键帧容量与格式纠正，对比不启用 FDS（F0）与启用 FDS（F1）。</li><li><strong>重点观察哪些失误？</strong>检验机器人是否把抓空计入完成次数（T1）、换盒后仍按旧位置揭盖（T2）、把经过托盘当成已完成放置（T3），或按控制器报告的末端位置（TCP）而非棒尖位置过早跳步（T4）。</li><li><strong>真机如何可重复操作？</strong>只做四类任务；人手演示提前录制供两组复用，人工仅负责开局摆场与停机复位，执行期间不移动桌面道具。</li></ul></div><p>首轮计划 <strong>' + (workload?.episodes || 80) + ' 次配对测试</strong>：4 类任务 × 每类 10 个独立场景（两条件各 5 个）× F0 / F1 各执行 1 次。T2–T4 共用 30 段预录演示，16 次开发试跑另计；可同场景追加 40 次 Astra-Direct 系统参考。</p><p class="caption">本页是实验设计与记录文档。' + (valid.length ? '当前已录入 ' + valid.length + ' 条有效正式测试记录。' : '真机接口尚待接入，当前尚无实测结果。') + '</p></section>' +
    '<section id="study-method" class="paper-section"><h2>1. 方法与两组对照</h2><p>' + e(a?.positioning || '当前草稿尚未包含完整 FDS 方法说明，请先导出保留后恢复共享版本。') + '</p><figure class="method-figure"><div class="method-line"><span>观察与演示画面</span><i>→</i><span>结构化显式记忆</span><i>→</i><span class="highlight">FDS 决策契约（F1 开启）</span><i>→</i><span>机械臂动作与状态反馈</span></div><figcaption>方法结构示意。两组共享相同的初始观察、显式记忆与底层控制；F1 额外包含结构化契约输出、系统检查与执行后反馈。动作分叉后各自看到的后续画面可不同。</figcaption></figure>' + methods(true) + '<p>系统（Host）检查契约格式、引用与声明关系，不会自动判断图像内容是否支持结论；动作执行完毕或重写通过校验（<code>decision_recovered</code>）也不等于物理任务成功。因此，契约检查与真实任务结果分开统计。</p><a class="read-more" href="#method">查看代码核对依据、F0 / F1 具体配置与真机接入清单 →</a></section>' +
    '<section id="study-tasks" class="paper-section"><h2>2. 四类真机任务</h2><p>四类任务分别对应四个官方大类：<strong>计数（Counting）</strong>、<strong>藏物追踪（Permanence）</strong>、<strong>历史指代（Reference）</strong>和<strong>动作模仿（Imitation）</strong>。每类只设两个测试条件；展开任务卡可查看操作步骤、评分规则与准备进度。</p><div class="task-list paper-tasks">' + project.tasks.map(taskCard).join('') + '</div><p class="caption">卡片配图仅说明任务结构，不代表实拍画面或已完成的实验结果。</p></section>' +
    '<section id="study-operation" class="paper-section"><h2>3. 现场流程与评分</h2><p>动态演示在实验前录成固定视频；现场人工仅负责开局摆放与停机复位，执行期间不改动桌面。</p><ol class="workflow-list">' + (project.operatorWorkflow || []).map(p => '<li><h3>' + e(p.title) + '</h3><p>' + e(p.body) + '</p></li>').join('') + '</ol><p><strong>主要指标：</strong>同场景下 F1 相对 F0 的自主成功率差值、导致测试失败的第一次错误、依据不足仍采取动作的比例、真实失误后的自主恢复率，以及单回合耗时与完整开销。人工摆场与复位耗时单独登记。</p><a class="read-more" href="#protocol">查看完整现场规程、盲标流程与指标定义 →</a></section>' +
    '<section id="study-coverage" class="paper-section"><h2>4. 任务来源与能力边界</h2><p>四类任务均改编自 <a href="https://robomme.github.io/plus.html" target="_blank" rel="noopener noreferrer">RoboMME-Plus</a> 的四个官方类别：<strong>计数（Counting）</strong>、<strong>藏物追踪（Permanence）</strong>、<strong>历史指代（Reference）</strong>与<strong>动作模仿（Imitation）</strong>。为适应真机操作与复位，本方案对原任务做了真机化改编，用于检验代表性记忆与决策机制，<strong>不等同于完整覆盖 RoboMME-Plus 全部 16 项任务</strong>。</p><div class="table-panel"><table class="data-table"><thead><tr><th>真机任务</th><th>官方类别（Suite）</th><th>主要来源</th><th>官方设定与本轮真机改编</th></tr></thead><tbody><tr><td><strong>T1 · 抓放积木，完成指定次数</strong></td><td>计数（Counting）</td><td class="mono">PickXtimes</td><td>官方任务要求将目标抓放指定次数（Easy 为固定目标 6–8 次，较难条件含移动目标）。真机版固定单个积木与定位垫，设 3 次和 6 次两档，按完整“抓起—离桌—放回—松爪”计数。</td></tr><tr><td><strong>T2 · 打开藏着目标积木的盒子</strong></td><td>藏物追踪（Permanence）</td><td class="mono">VideoUnmaskSwap</td><td>官方任务跟随盒子交换追踪隐藏目标。真机版改为播放预录演示、按录像终态摆好四个带底小盒后一次揭盖，并新增“中途换盒”条件检验旧记忆更新。</td></tr><tr><td><strong>T3 · 找出翻牌后首次放下积木的托盘</strong></td><td>历史指代（Reference）</td><td class="mono">VideoPlaceButton</td><td>官方任务按按钮事件记住放置位置并跟踪目标环交换。真机版改为固定四个托盘、以翻动事件牌为分界，并加入经过或触碰不松手的干扰动作。</td></tr><tr><td><strong>T4 · 用指示棒重走示范路线</strong></td><td>动作模仿（Imitation）</td><td class="mono">PatternLock</td><td>官方任务采用 5×5 网格且较难条件含布局变换与换工具。真机版改为固定 3×3 点阵板上的 4 / 7 节点无痕路线复现，共用同一轻质指示棒并按真实棒尖轨迹评分。</td></tr></tbody></table></div><a class="read-more" href="#coverage">查看 RoboMME-Plus 全部 16 项任务的逐项对应与缺口矩阵 →</a></section>' +
    '<section id="study-results" class="paper-section"><h2>5. 实验结果</h2><p>' + (valid.length ? '以下汇总已录入的正式测试记录。' : '当前尚无实测记录，表中各条件均显示为“待测”。') + '开发试跑不计入正式成功率分母；执行中若由人工帮助或扶正，计入有效分母但算作非自主成功。同场景配对差值按场景成对统计。</p>' + summaryResults() + '<p class="caption">表中展示自主成功率及成功数 / 有效测试数；仅在不包含同场景重复测试时显示 95% Wilson 区间。</p><a class="read-more" href="#results">录入、筛选或导出逐回合记录 →</a></section>' +
    '<section id="study-references" class="paper-section"><h2>参考资料</h2>' + sourceCards() + '</section></article></div>';
}


function renderMethod() {
  const a = project.methodAlignment;
  if (!a) return intro('METHOD ALIGNMENT', '当前草稿尚未包含 FDS 方法说明。', '请先导出旧草稿保存记录，再恢复仓库版本查看完整的方法与代码依据。');
  const cards = rows => '<div class="protocol-grid">' + rows.map(x => '<article class="protocol-card"><span class="chip outline">' + e(x.status) + '</span><h3>' + e(x.title) + '</h3><p>' + e(x.body) + '</p>' + (x.source ? '<a class="task-link" href="' + e(safeUrl(x.source)) + '" target="_blank" rel="noopener noreferrer">对应代码实现 ↗</a>' : '') + '</article>').join('') + '</div>';
  return intro('FDS × FRANKA', '方法说明与代码核对依据', a.positioning) +
    '<div class="method-provenance"><span class="chip green">已核对代码</span><span>FDS <code>' + e(a.commit.slice(0, 7)) + '</code> · ' + e(a.reviewedAt) + '</span><a href="' + e(safeUrl(a.repository)) + '" target="_blank" rel="noopener noreferrer">方法仓库（需访问权限） ↗</a></div>' +
    '<div class="evidence-flow" aria-label="观察与演示画面经过结构化显式记忆、FDS 决策契约、机械臂动作和状态反馈形成闭环">' + ['观察与演示画面', '结构化显式记忆', 'FDS 决策契约', '机械臂动作', '状态反馈与修正'].map((x, i) => '<div><small>0' + (i + 1) + '</small><strong>' + x + '</strong></div>').join('') + '</div>' +
    '<div class="notice orange"><strong>核对边界说明：</strong>系统（Host）只检查契约字段、画面/记忆引用编号以及模型声明的前提关系是否自洽，不会自动看图判断画面内容真假；动作执行完毕也不等于物理任务成功。真机接口尚待接入，页面尚无实测结果。</div>' +
    section('01', '现有代码实际实现了什么', '基于固定提交 13a36d2 逐项核对，明确哪些机制已在代码中运行、哪些属于人工评分或待接入工作。') + cards(a.facts) +
    section('02', '主实验只切换 FDS 契约开关', '两组共用同一套执行框架与显式记忆，不加载技能库（skills=[]），测试期不做跨任务更新。') +
    '<div class="protocol-grid">' + a.configs.map(c => '<article class="protocol-card"><h3>' + e(c.title) + '</h3><pre class="config-code"><code>' + e(c.code) + '</code></pre><p>' + e(c.body) + '</p></article>').join('') + '</div>' +
    '<div class="maintenance-card method-controls"><h3>两组完全一致的固定条件</h3>' + list(a.controls, true) + '</div>' +
    section('03', '消融实验安排：真机聚焦主对比，细粒度拆解放在仿真', '当前代码仅提供 off 与 full 两档契约开关；需要改代码的消融优先在仿真或离线完成。') + cards(a.ablations) +
    section('04', '正式上机前需完成的接入与验收事项', '以下五项为开测前的准备清单，验收通过并完成 16 次开发试跑后再启动 80 次正式测试。') + cards(a.readiness) +
    '<div class="notice">如果论文除了讨论 FDS 决策契约外，还需要论证“显式记忆模块本身”的独立贡献，应在仿真中补充记忆模块的受控消融实验。真机上的 F0 与 F1 专门用于隔离 FDS 的作用；F1 与原始 Astra-Direct 的差距则反映整套系统的综合表现。</div>';
}

function taskCard(t) {
  const done = t.preparation.filter(x => x.done).length;
  const opened = openTasks.has(t.id) || activeTask === t.id;
  return '<article class="task-card" id="task-' + e(t.id) + '"><details data-task-details="' + e(t.id) + '"' + (opened ? ' open' : '') + '><summary><div class="task-preview">' + taskDiagram(t.id) + '<div class="task-preview-copy"><span class="task-card-kicker">' + e(t.id) + ' · ' + e(t.suite) + ' <span> / </span>' + e(t.englishTitle) + '</span><h3>' + e(t.title) + '</h3><p>' + e(t.purpose) + '</p><div class="task-conditions">' + t.conditions.map(c => e(c.label)).join(' <span>vs.</span> ') + '</div><span class="task-open-label">查看操作步骤 <span aria-hidden="true">↓</span></span></div></div></summary><div class="task-detail"><h4>英文任务指令 / PROMPT</h4><div class="prompt-box" lang="en">' + e(t.prompt) + '</div>' +
    renderOperations(t) +
    '<div class="detail-grid">' +
    '<div class="detail-block"><h4><span>07</span>测试条件 · 每条件计划 ' + e(t.targetPerCondition) + ' 个独立场景</h4><div class="condition-list">' + t.conditions.map((c, i) => '<div class="condition"><span class="chip ' + (i < 2 ? '' : 'blue') + '">' + (i < 2 ? '主条件' : '扩展 / 消融') + '</span><strong>' + e(c.label) + '</strong><p>' + e(c.change) + '</p></div>').join('') + '</div></div>' +
    '<div class="detail-block"><h4><span>08</span>记录哪些指标</h4>' + list(t.metrics) + '</div>' +
    '<div class="detail-block"><h4><span>09</span>常见失败标签</h4><div>' + t.failures.map(f => '<span class="chip outline" style="margin:0 5px 6px 0">' + e(f) + '</span>').join('') + '</div></div>' +
    '<div class="detail-block"><h4><span>10</span>实验控制与公平性要点</h4>' + list(t.designNotes) + '</div></div>' +
    '<div class="task-edit-area"><div class="task-edit-heading"><h4>准备进度 <span class="text-muted">' + done + ' / ' + t.preparation.length + '</span></h4><select id="status-' + e(t.id) + '" data-status="' + e(t.id) + '" aria-label="' + e(t.id) + ' 任务状态">' + options(Object.entries(STATUS), t.status) + '</select></div><div class="checklist">' + t.preparation.map(x => '<label><input id="prep-' + e(t.id) + '-' + e(x.id) + '" type="checkbox" data-prep-task="' + e(t.id) + '" data-prep-id="' + e(x.id) + '"' + (x.done ? ' checked' : '') + '>' + e(x.label) + '</label>').join('') + '</div><div class="task-note-fields"><label class="field"><span>负责人</span><input data-task-owner="' + e(t.id) + '" value="' + e(t.owner) + '" placeholder="待分配" maxlength="200"></label><label class="field"><span>实验备注 / 场景与视频链接</span><textarea data-task-notes="' + e(t.id) + '" placeholder="记录设置变化、待确认参数或视频链接…" maxlength="20000">' + e(t.notes) + '</textarea></label></div><div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:12px"><div class="text-muted" style="font-size:10px">相关基准任务：' + e(t.benchmark.join(' / ')) + '</div><button class="button small secondary" data-action="record-task" data-task="' + e(t.id) + '">记录执行 ↗</button></div></div></div></details><div class="task-progress" aria-label="准备完成 ' + done + ' 项"><span style="width:' + (done / t.preparation.length * 100) + '%"></span></div></article>';
}

function renderOperations(t) {
  const o = t.operations;
  const missing = '<p class="text-muted">该旧草稿未填写</p>';
  return '<section class="operator-card"><div class="operator-heading"><div><span class="eyebrow">OPERATION CARD</span><h3>实验操作卡</h3></div>' + (o ? '<span class="chip green">' + e(o.mode) + '</span>' : '') + '</div><div class="detail-grid">' +
    '<div class="detail-block"><h4><span>01</span>准备什么（道具与场景布置）</h4>' + list(t.props) + '</div>' +
    '<div class="detail-block"><h4><span>02</span>人先做什么（录制与开局摆放）</h4>' + (o ? list(o.humanBefore, true) : missing) + '</div>' +
    '<div class="detail-block"><h4><span>03</span>机器人做什么（自主执行步骤）</h4>' + list(t.steps, true) + (o ? '<div class="notice"><strong>执行期间人工规则：</strong>' + e(o.duringExecution) + '</div>' : '') + '</div>' +
    '<div class="detail-block"><h4><span>04</span>怎样算成功（完成标准）</h4>' + list(t.success) + '</div>' +
    '<div class="detail-block"><h4><span>05</span>怎样复位（停机后恢复原状）</h4>' + (o ? list(o.reset, true) : missing) + '</div>' +
    (o ? '<div class="detail-block"><h4><span>06</span>现场一致性核对要点</h4>' + list(o.consistency) + '</div>' : '') +
    '</div></section>';
}

function renderTasks() {
  const suites = [...new Set(project.tasks.map(t => t.suite))];
  return intro('TASKS & PROGRESS', '四类任务与现场操作卡', '本轮真机实验聚焦四类改编任务。展开任一任务卡即可查看实验操作卡、评分规则并勾选准备进度。') +
    '<div class="toolbar"><label class="search-wrap"><span aria-hidden="true">⌕</span><input id="task-search" type="search" value="' + e(taskSearch) + '" placeholder="搜索任务、类别或基准名称…" aria-label="搜索任务"></label><select id="suite-filter" aria-label="按类别筛选">' + options([['', '全部类别'], ...suites.map(s => [s, s])], suiteFilter) + '</select><select id="status-filter" aria-label="按状态筛选">' + options([['', '全部状态'], ...Object.entries(STATUS)], statusFilter) + '</select><span class="filter-summary" id="task-filter-summary"></span></div><div class="task-list" id="task-list"></div>';
}

function refreshTasks() {
  const query = taskSearch.toLowerCase();
  const filtered = project.tasks.filter(t => (!suiteFilter || t.suite === suiteFilter) && (!statusFilter || t.status === statusFilter) && [t.id, t.title, t.englishTitle, t.suite, t.purpose, ...t.benchmark].join(' ').toLowerCase().includes(query));
  document.querySelector('#task-list').innerHTML = filtered.length ? filtered.map(taskCard).join('') : '<div class="empty-state"><h3>没有匹配的任务</h3><p>试试其他关键词或筛选条件。</p></div>';
  document.querySelector('#task-filter-summary').textContent = filtered.length + ' / ' + project.tasks.length + ' 个任务';
}

function renderCoverage() {
  const counts = Object.fromEntries(Object.keys(COVERAGE).map(k => [k, project.coverage.filter(c => c.level === k).length]));
  const rows = project.coverage.filter(c => !coverageFilter || c.level === coverageFilter);
  return intro('BENCHMARK COVERAGE', 'RoboMME-Plus 任务来源与真机覆盖矩阵', '对照 RoboMME-Plus 四大官方类别（Counting / Permanence / Reference / Imitation）全部 16 项仿真任务，逐项说明本方案四类真机任务的改编来源、已覆盖机制与未纳入项。') +
    '<div class="coverage-summary">' + Object.entries(COVERAGE).map(([k, label]) => '<span><strong>' + counts[k] + '</strong>' + label + '</span>').join('') + '</div><div class="toolbar"><select id="coverage-filter" aria-label="筛选对应程度">' + options([['', '全部对应关系'], ...Object.entries(COVERAGE)], coverageFilter) + '</select><span class="filter-summary">方案设计对应关系 · 真机实测数据以实验结果页为准</span></div>' +
    '<div class="table-panel"><table class="data-table"><thead><tr><th>官方类别（SUITE）</th><th>RoboMME-Plus 任务</th><th>对应真机任务</th><th>对应程度</th><th>官方原设定与本轮真机改编说明</th></tr></thead><tbody>' + rows.map(c => '<tr><td class="coverage-suite">' + e(c.suite) + '</td><td class="mono">' + e(c.benchmark) + '</td><td>' + (taskLinks(c.tasks) || '<span class="text-muted">—</span>') + '</td><td><span class="chip coverage-' + e(c.level) + '">' + e(COVERAGE[c.level]) + '</span></td><td class="coverage-note">' + e(c.note) + '</td></tr>').join('') + '</tbody></table></div>' +
    '<div class="notice orange"><strong>真机改编与收敛说明：</strong>“中途把积木换到另一盒（T2）”“翻动双面事件牌与经过不松手干扰（T3）”“固定 3×3 无痕点阵（T4）”是我们在官方任务基础上为适应真机操作与检验记忆更新/事件边界所做的改编，并非官方原设定。同时，实时按键、摆动周期、多物体高亮/重抓、更换工具、精密插装和动态绕障未纳入本轮真机实验，不宣称这四类任务已完整覆盖 RoboMME-Plus 的全部难度。</div>' +
    section('01', '仿真基准与真机实验如何配合', '用仿真检验 16 项完整基准覆盖，用真机检验关键记忆与 FDS 机制在真实物理环境中的表现。') +
    '<div class="protocol-grid"><article class="protocol-card"><div class="protocol-number">SIMULATION</div><h3>完整 16 项基准表现</h3><p>仿真实验面向官方全部 16 项任务与 800 个标准测试回合，用于评估整体基准表现，并承担去掉显式记忆、细粒度契约字段拆解等多因素消融。</p></article><article class="protocol-card"><div class="protocol-number">REAL WORLD</div><h3>真机上的四类核心检验</h3><p>真机实验聚焦计数、藏物追踪、历史指代和动作模仿四类代表性任务，检验在真实相机画面与人手演示下，启用 FDS（F1）相比不启用 FDS（F0）能否减少依据不足仍行动和旧记忆误用。</p></article></div>';
}

function resultCell(trials, ours) {
  const s = statistics(trials);
  if (!s.count) return '<span class="pending-cell">待测</span>';
  const interval = s.interval ? (s.interval[0] * 100).toFixed(1) + '–' + (s.interval[1] * 100).toFixed(1) + '%' : '含同场景重复测试 · 区间需按场景聚类计算';
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
  return intro('EXPERIMENT RESULTS', '实验结果与逐回合记录', '按任务与测试条件汇总正式真机结果。开发试跑不计入正式成功率；执行中人工帮助或扶正计为“人工干预”（纳入分母但不算自主成功）；因复位或独立设备故障作废的“无效回合”需写明原因。') +
    '<p class="record-count">' + project.trials.length + ' 条已录入记录 · ' + valid.length + ' 条有效正式测试 · ' + uniqueScenes.size + ' 个独立场景。' + (project.trials.length ? '' : '目前尚未录入真机实测数据。') + '</p>' +
    section('01', '各条件自主成功率汇总', '显示自主成功率与成功数 / 有效测试数；无重复场景时显示 95% Wilson 置信区间。', button('record', '+ 记录一次执行', 'primary')) +
    '<div class="toolbar"><select id="result-task" aria-label="筛选结果任务">' + options([['', '全部任务'], ...project.tasks.map(t => [t.id, t.id + ' · ' + t.title])], resultTask) + '</select><span class="filter-summary">主对比：F0（不启用 FDS） vs. F1（启用 FDS）</span></div>' +
    '<div class="table-panel"><table class="data-table"><thead><tr><th>任务</th><th>测试条件</th>' + displayMethods.map(m => '<th>' + e(m.name) + '</th>').join('') + '</tr></thead><tbody>' + tableRows.join('') + '</tbody></table></div>' +
    '<div class="notice">表内置信区间仅在每个场景只测一次（独立样本）时显示。若同一方法在同一场景下重复测试多次，或需计算同场景下 F1 相对 F0 的成对差值区间，需按场景成对/聚类分析。“待测”代表尚未上机录入，不代表成功率为 0%。</div>' +
    section('02', '逐回合执行记录', '下方的筛选仅用于浏览记录列表或导出对应 CSV，不会改变上方汇总表的统计分母。', button('csv', '导出 CSV')) +
    '<div class="toolbar"><select id="log-method" aria-label="筛选记录方法">' + options([['', '全部方法'], ...project.methods.map(m => [m.id, m.name])], logMethod) + '</select><select id="log-outcome" aria-label="筛选记录结果">' + options([['', '全部结果'], ...Object.entries(OUTCOME)], logOutcome) + '</select><span class="filter-summary">显示最近 ' + Math.min(logs.length, 50) + ' 条 / 共 ' + logs.length + ' 条</span></div>' +
    '<div class="table-panel trial-log"><table class="data-table"><thead><tr><th>场景 / 任务</th><th>方法 / 阶段</th><th>执行结果</th><th>耗时 / TOKEN</th><th>备注与视频证据</th><th>操作</th></tr></thead><tbody>' +
    (logs.length ? [...logs].reverse().slice(0, 50).map(t => {
      const method = project.methods.find(m => m.id === t.methodId);
      const task = project.tasks.find(x => x.id === t.taskId);
      const cond = task.conditions.find(c => c.id === t.conditionId);
      return '<tr><td><strong>' + e(t.scenarioId) + '</strong><small>' + e(t.taskId + ' · ' + cond.label) + (t.demoId ? '<br>演示 ' + e(t.demoId) : '') + '<br>重复 #' + t.repeatIndex + '</small></td><td>' + e(method.name) + '<small>' + (t.phase === 'test' ? '正式测试' : '开发试跑') + '</small></td><td class="outcome-' + e(t.outcome) + '">' + e(OUTCOME[t.outcome]) + '</td><td>' + (t.durationSec == null ? '—' : e(t.durationSec) + ' s') + '<small>' + (t.tokens == null ? '未填 Token' : t.tokens.toLocaleString() + ' token') + '</small>' + (t.setupSec != null || t.resetSec != null ? '<small>人工摆场 / 复位：' + e(t.setupSec ?? '—') + ' / ' + e(t.resetSec ?? '—') + ' s</small>' : '') + '</td><td>' + e(t.notes || '—') + '<small>' + e(t.failureTags.join(' / ')) + '</small>' + (safeUrl(t.videoUrl) ? '<a class="task-link" href="' + e(safeUrl(t.videoUrl)) + '" target="_blank" rel="noopener noreferrer">视频 ↗</a>' : '') + '</td><td><button class="button small secondary" data-edit-trial="' + e(t.id) + '">编辑</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="text-muted">暂无符合筛选条件的记录。</td></tr>') + '</tbody></table></div>';
}

function renderProtocol() {
  const workflow = project.operatorWorkflow || [];
  return intro('EVALUATION & HUMAN OPERATION', '现场操作流程与统一评测规则', '所有动态演示提前录制，实验现场人工只负责开局摆放和停机后复位；机器人开始执行后不再改动桌面，避免人工操作与模型推理延迟相互干扰。') +
    section('01', '现场双人操作流程', '同一段演示视频和结束状态供 F0 与 F1 复用；正常开局准备与执行中人工救援严格区分。') +
    '<div class="protocol-grid">' + workflow.map((p, i) => '<article class="protocol-card"><div class="protocol-number">STEP ' + String(i + 1).padStart(2, '0') + '</div><h3>' + e(p.title) + '</h3><p>' + e(p.body) + '</p></article>').join('') + '</div>' +
    section('02', '统一评测与控制规则', '确保两组在相同起点、相同观察规则与盲标标准下公平比较。') +
    '<div class="protocol-grid">' + project.protocol.map((p, i) => '<article class="protocol-card"><div class="protocol-number">' + String(i + 1).padStart(2, '0') + '</div><h3>' + e(p.title) + '</h3><p>' + e(p.body) + '</p></article>').join('') + '</div>' +
    section('03', '评测指标定义', '人工摆场/复位耗时与机器人执行耗时分开统计；格式重写通过不等于真实失误恢复。') + '<div class="metrics-list">' + project.metrics.map(m => '<div class="metric-row"><strong>' + e(m.name) + '</strong><p>' + e(m.definition) + '</p></div>').join('') + '</div>' +
    section('04', '三组方法设置对照') + methods() +
    '<div class="notice">本方案的四类任务采用“预录人手演示 + 桌面按结束状态摆好实物后由机器人自主执行”的方式，重点检验真实视觉与物理执行下的记忆更新和依据核对，不等同于人手边移物、机器人边追赶的实时动态交互。</div>';
}

function renderMaintain() {
  const repo = project.meta.repositoryUrl;
  const coreCount = project.tasks.filter(t => t.priority === '核心').length;
  return intro('MAINTAIN THE WORKSPACE', '数据维护与导出', '仓库中的 site/data/project.json 是团队共享数据源。在网页上勾选进度或录入结果后会暂存为当前浏览器的本机草稿，导出 JSON 并提交到 GitHub 后即可同步给全队。') +
    '<div class="maintenance-grid"><section class="maintenance-card"><span class="eyebrow">LOCAL DRAFT → SHARED VERSION</span><h3 style="margin-top:10px">保存、导出与同步</h3><p>在网页中修改任务进度、备注或录入执行记录后，请导出 JSON 并提交到仓库；导入 JSON 文件会整体替换当前浏览器的本机草稿。</p><div class="maintenance-actions">' + button('export', '导出 project.json', 'primary') + button('import', '导入 JSON 数据') + button('csv', '导出记录 CSV') + '</div><ol class="maintenance-steps"><li>录入或修改完成后，点击<strong>导出 project.json</strong>。</li><li>用导出的文件替换仓库中的 <code>site/data/project.json</code> 并提交。</li><li>等待 GitHub Actions 自动校验并发布后，点击下方“恢复仓库版本”清除旧草稿。</li></ol>' +
    (repo ? '<a class="button small orange" style="margin-top:18px" href="' + e(repo + '/edit/main/site/data/project.json') + '" target="_blank" rel="noopener noreferrer">直接在 GitHub 编辑 project.json ↗</a>' : '') +
    '<br><button class="danger-link" data-action="reset">恢复仓库版本，清除当前浏览器草稿</button></section>' +
    '<section class="maintenance-card"><span class="eyebrow">EXPERIMENT WORKLOAD</span><h3 style="margin-top:10px">测试次数与录制工作量估算</h3><p>按每类任务的独立场景总数估算（每类下的两个测试条件平分这些场景，同一场景在各方法下分别复位测试一次）。</p><div id="budget-display"></div><div class="budget-controls"><label>每类独立场景总数 <input id="budget-n" type="number" min="2" max="1000" value="' + (project.planning?.scenesPerTask || 10) + '"></label><label>参测方法组 <select id="budget-methods"><option value="primary">主对比：F0 + F1（两组）</option><option value="all">含系统参考：F0 + F1 + Direct（三组）</option></select></label></div><div class="notice">' + coreCount + ' 类任务首轮固定每类 10 个独立场景（两个条件各 5 个），主对比共 80 次正式测试；正式开测前的 16 次开发试跑单独计入准备阶段。</div></section></div>' +
    section('01', '项目元信息设置', '修改后保存在本机草稿，导出 project.json 提交后生效。') +
    '<section class="maintenance-card"><div class="form-grid">' + [
      ['robot', '机械臂与夹爪型号'], ['cameras', '相机视角与标定'], ['modelVersion', '模型服务版本'], ['configurationRevision', '代码 / 配置版本说明'], ['repositoryUrl', 'GitHub 仓库地址'], ['version', '方案版本号']
    ].map(([key, label]) => '<label class="field"><span>' + label + '</span><input data-meta="' + key + '" value="' + e(project.meta[key]) + '"></label>').join('') + '<label class="field span-two"><span>方案总体说明</span><textarea data-meta="notes">' + e(project.meta.notes) + '</textarea></label></div></section>' +
    section('02', '打印现场操作卡') + '<div class="maintenance-card"><p>各任务展开后的现场操作卡支持直接打印或导出为 PDF 贴在实验台旁。演示视频、结束状态参考照片与盒内答案表在实验端按场景编号单独管理，不写入公开模型输入。</p><div class="maintenance-actions">' + button('print', '打印当前页面 / 保存 PDF') + '</div></div>';
}

function updateBudget() {
  if (!document.querySelector('#budget-display')) return;
  const n = Number(document.querySelector('#budget-n').value);
  const primary = project.planning?.methodIds || ['history', 'ours'];
  const selected = document.querySelector('#budget-methods').value === 'primary' ? primary : [...new Set([...primary, 'direct'])].filter(id => project.methods.some(m => m.id === id));
  const estimate = planWorkload(project, n, selected);
  if (!estimate) { document.querySelector('#budget-display').innerHTML = '<p class="notice">请输入至少 2 个独立场景。</p>'; return; }
  const split = estimate.allocations[0]?.conditions.map(c => c.scenes).join(' + ') || '';
  document.querySelector('#budget-display').innerHTML = '<div class="budget-total">' + estimate.episodes.toLocaleString() + '<small>次正式真机执行</small></div><p class="budget-equation">' + estimate.tasks + ' 类任务 × 每类 ' + n + ' 个独立场景 × ' + estimate.methods + ' 组方法<br>每类下的两个测试条件各分配 ' + split + ' 个场景，合计 ' + estimate.independentScenes + ' 个独立场景。<br>T2–T4 共需录制 ' + estimate.demoClips + ' 段人手演示视频，各组方法复用同一批视频。</p>';
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
    selectField('phase', '阶段', [['test', '正式测试'], ['development', '开发试跑（不计入正式成功率）']], t.phase || 'test') +
    inputField('scenarioId', '场景编号', t.scenarioId, 'text', 'required maxlength="200" placeholder="例如 T2-S001"') +
    inputField('repeatIndex', '同场景重复序号', t.repeatIndex || 1, 'number', 'required min="1" step="1"') +
    selectField('outcome', '执行结果', Object.entries(OUTCOME), t.outcome || 'success', 'id="trial-outcome"') +
    inputField('demoId', '演示视频编号（T1 可空）', t.demoId || '', 'text', 'maxlength="200"') +
    selectField('resetVerified', '开局 / 复位状态是否已核对', [['', '未记录'], ['true', '已核对一致'], ['false', '发现不一致']], String(t.resetVerified ?? '')) +
    inputField('setupSec', '人工开局摆场耗时 / 秒（可空）', t.setupSec, 'number', 'min="0" step="any"') +
    inputField('resetSec', '人工停机复位耗时 / 秒（可空）', t.resetSec, 'number', 'min="0" step="any"') +
    inputField('durationSec', '机器人执行耗时 / 秒（不含人工摆场与复位）', t.durationSec, 'number', 'min="0" step="any"') +
    inputField('inferenceSec', '模型推理等待耗时 / 秒（可空）', t.inferenceSec, 'number', 'min="0" step="any"') +
    inputField('motionSec', '机械臂运动耗时 / 秒（可空）', t.motionSec, 'number', 'min="0" step="any"') +
    inputField('tokens', '总 Token 用量（可空）', t.tokens, 'number', 'min="0" step="1"') +
    selectField('targetCorrect', '首次选择目标是否正确', [['', '未评分'], ['true', '正确'], ['false', '错误']], String(t.targetCorrect ?? '')) +
    selectField('orderCorrect', '操作或访问顺序是否正确', [['', '未评分'], ['true', '正确'], ['false', '错误']], String(t.orderCorrect ?? '')) +
    selectField('staleMemoryUsed', '是否误用了已失效的旧位置 / 旧记忆', [['', '未评分'], ['true', '是'], ['false', '否']], String(t.staleMemoryUsed ?? '')) +
    inputField('decisionRejections', '输出格式 / 契约被拦截次数（未统计留空）', t.decisionRejections, 'number', 'min="0" step="1"') +
    inputField('decisionRecoveries', '重写后重新通过检查的次数', t.decisionRecoveries, 'number', 'min="0" step="1"') +
    selectField('semanticFailureObserved', '是否发生可观察的真实操作失误', [['', '未标注'], ['true', '是'], ['false', '否']], String(t.semanticFailureObserved ?? '')) +
    selectField('prematureAction', '是否依据不足仍采取依赖动作', [['', '未标注'], ['true', '是'], ['false', '否']], String(t.prematureAction ?? '')) +
    '<p class="field-note span-two">注：“重写后重新通过检查”仅指模型输出格式或契约字段改对，不代表从真实操作失误中恢复；真实失误后的恢复率需结合是否发生真实失误与最终是否自主成功单独统计。F0 无决策契约，契约专属诊断项记为 N/A。</p>' +
    inputField('modelVersion', '模型版本', t.modelVersion || project.meta.modelVersion) +
    inputField('configRevision', '代码 / 配置版本', t.configRevision || project.meta.configurationRevision) +
    '<label class="field span-two"><span>失败标签（以中文或英文逗号分隔）</span><input name="failureTags" value="' + e((t.failureTags || []).join('，')) + '" placeholder="例如：换盒后仍按旧位置找，揭盖动作失败" maxlength="2000"></label>' +
    '<label class="field span-two"><span>录像或证据链接（可空）</span><input name="videoUrl" type="url" value="' + e(t.videoUrl || '') + '" placeholder="https://…" maxlength="4000"></label>' +
    '<label class="field span-two"><span>备注 / 无效回合的作废原因</span><textarea name="notes" id="trial-notes" maxlength="20000">' + e(t.notes || '') + '</textarea></label></div>';
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
