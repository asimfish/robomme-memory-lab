export const STATUS = { planned: '未开始', preparing: '准备中', running: '测试中', completed: '已完成' };
export const OUTCOME = { success: '自主成功', failure: '失败', intervened: '人工干预', invalid: '无效回合' };
export const COVERAGE = { mapped: '已设计对应', partial: '部分对应', boundary: '可选边界', gap: '暂未覆盖' };
export const BENCHMARKS = ['BinFill', 'PickXtimes', 'SwingXtimes', 'StopCube', 'VideoUnmask', 'ButtonUnmask', 'VideoUnmaskSwap', 'ButtonUnmaskSwap', 'PickHighlight', 'VideoRepick', 'VideoPlaceButton', 'VideoPlaceOrder', 'MoveCube', 'InsertPeg', 'PatternLock', 'RouteStick'];

export function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function trialKey(t) {
  return JSON.stringify([t.taskId, t.conditionId, t.methodId, t.scenarioId, t.repeatIndex, t.phase]);
}

export function validateProject(p) {
  const fail = message => { throw new Error(message); };
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, name, limit = 20000) => {
    if (typeof v !== 'string' || v.length > limit) fail(name + ' 必须是有效文本');
  };
  const textArray = (a, name) => {
    if (!Array.isArray(a) || a.length > 100) fail(name + ' 必须是文本数组');
    a.forEach(v => str(v, name));
  };
  const unique = (list, name) => {
    if (new Set(list).size !== list.length) fail(name + ' 不能重复');
  };
  const number = (v, name, integer = false, nullable = true) => {
    if (v == null && nullable) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (integer && !Number.isInteger(v))) fail(name + ' 必须是非负' + (integer ? '整数' : '数值'));
  };
  if (!obj(p) || p.schemaVersion !== 1) fail('不支持的数据版本，需要 schemaVersion: 1');
  if (!obj(p.meta)) fail('缺少项目元信息');
  for (const key of ['title', 'subtitle', 'version', 'updatedAt', 'repositoryUrl', 'phase', 'robot', 'cameras', 'modelVersion', 'configurationRevision', 'notes']) str(p.meta[key], 'meta.' + key);
  if (p.meta.repositoryUrl && !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(p.meta.repositoryUrl)) fail('仓库地址应为 https://github.com/owner/repo');
  if (!Array.isArray(p.methods) || !p.methods.length || p.methods.length > 20) fail('方法列表无效');
  p.methods.forEach(m => {
    if (!obj(m) || !/^[a-z][a-z0-9-]*$/.test(m.id)) fail('方法 ID 无效');
    for (const key of ['name', 'description', 'control', 'kind']) str(m[key], 'method.' + key);
  });
  unique(p.methods.map(m => m.id), '方法 ID');
  const methodIds = new Set(p.methods.map(m => m.id));
  if (!Array.isArray(p.tasks) || !p.tasks.length || p.tasks.length > 50) fail('任务列表无效');
  unique(p.tasks.map(t => t.id), '任务 ID');
  p.tasks.forEach(t => {
    if (!obj(t) || !/^T[1-9][0-9]*$/.test(t.id)) fail('任务 ID 无效');
    for (const key of ['title', 'englishTitle', 'suite', 'priority', 'owner', 'notes', 'purpose', 'prompt']) str(t[key], 'task.' + key);
    if (!Object.hasOwn(STATUS, t.status)) fail(t.id + ' 状态无效');
    if (!['核心', '可选'].includes(t.priority)) fail(t.id + ' 优先级无效');
    for (const key of ['props', 'steps', 'success', 'metrics', 'failures', 'benchmark', 'designNotes']) textArray(t[key], t.id + '.' + key);
    number(t.targetPerCondition, '计划场景数', true, false);
    if (t.targetPerCondition < 1) fail('计划场景数须大于零');
    if (!Array.isArray(t.conditions) || !t.conditions.length) fail(t.id + ' 缺少条件');
    unique(t.conditions.map(c => c.id), t.id + ' 条件 ID');
    t.conditions.forEach(c => {
      if (!obj(c) || !/^[a-z][a-z0-9-]*$/.test(c.id)) fail('条件 ID 无效');
      str(c.label, '条件名'); str(c.change, '条件说明');
    });
    if (!Array.isArray(t.preparation)) fail('准备进度无效');
    unique(t.preparation.map(x => x.id), '准备项 ID');
    t.preparation.forEach(x => {
      if (!obj(x) || !/^[a-z][a-z0-9-]*$/.test(x.id) || typeof x.done !== 'boolean') fail('准备项无效');
      str(x.label, '准备项名称');
    });
    if (t.operations != null) {
      if (!obj(t.operations) || typeof t.operations.requiresDemo !== 'boolean') fail('人工操作设置无效');
      str(t.operations.mode, '人工操作模式');
      str(t.operations.duringExecution, '执行期人工操作');
      for (const key of ['humanBefore', 'reset', 'consistency']) textArray(t.operations[key], 'operations.' + key);
    }
  });
  const taskMap = new Map(p.tasks.map(t => [t.id, t]));
  if (p.planning != null) {
    if (!obj(p.planning)) fail('场景预算设置无效');
    number(p.planning.scenesPerTask, '每类独立场景数', true, false);
    number(p.planning.extendedScenesPerTask, '扩展场景数', true, false);
    if (p.planning.scenesPerTask < 2 || p.planning.extendedScenesPerTask < 2) fail('每类至少两个独立场景');
    if (!Array.isArray(p.planning.methodIds) || !p.planning.methodIds.length || p.planning.methodIds.some(id => !methodIds.has(id))) fail('预算引用了未知方法');
    unique(p.planning.methodIds, '预算方法');
    str(p.planning.note, '预算说明');
  }
  if (p.operatorWorkflow != null) {
    if (!Array.isArray(p.operatorWorkflow)) fail('人工操作流程无效');
    p.operatorWorkflow.forEach(x => {
      if (!obj(x)) fail('人工操作步骤无效');
      str(x.title, '操作步骤标题'); str(x.body, '操作步骤说明');
    });
  }
  if (!Array.isArray(p.coverage) || p.coverage.length !== 16) fail('覆盖矩阵需要保留全部 16 项基准任务');
  unique(p.coverage.map(c => c.benchmark), '基准任务');
  p.coverage.forEach(c => {
    if (!BENCHMARKS.includes(c.benchmark) || !Object.hasOwn(COVERAGE, c.level)) fail('基准对应关系无效');
    str(c.suite, '基准类别'); str(c.note, '覆盖说明');
    if (!Array.isArray(c.tasks) || c.tasks.some(id => !taskMap.has(id))) fail('覆盖矩阵引用了不存在的任务');
  });
  for (const [key, fields] of [['protocol', ['title', 'body']], ['metrics', ['name', 'definition']], ['sources', ['title', 'url', 'note']]]) {
    if (!Array.isArray(p[key])) fail(key + ' 无效');
    p[key].forEach(x => {
      if (!obj(x)) fail(key + ' 条目无效');
      fields.forEach(f => str(x[f], key + '.' + f));
      if (key === 'sources' && !safeUrl(x.url)) fail('来源链接无效');
    });
  }
  if (!Array.isArray(p.trials) || p.trials.length > 10000) fail('结果记录无效，最多 10000 条');
  unique(p.trials.map(t => t.id), '执行记录 ID');
  unique(p.trials.map(trialKey), '同一场景、方法、条件、阶段和重复编号的执行记录');
  p.trials.forEach(t => {
    if (!obj(t)) fail('执行记录无效');
    for (const key of ['id', 'taskId', 'conditionId', 'methodId', 'scenarioId', 'phase', 'outcome', 'notes', 'videoUrl', 'modelVersion', 'configRevision', 'createdAt']) str(t[key], 'trial.' + key);
    if (!t.id.trim() || !t.scenarioId.trim()) fail('执行 ID 和场景 ID 不能为空');
    if (!taskMap.has(t.taskId) || !methodIds.has(t.methodId)) fail('执行记录引用了未知任务或方法');
    if (!taskMap.get(t.taskId).conditions.some(c => c.id === t.conditionId)) fail('执行记录的任务条件不存在');
    if (!['development', 'test'].includes(t.phase) || !Object.hasOwn(OUTCOME, t.outcome)) fail('执行阶段或结果无效');
    number(t.repeatIndex, '重复编号', true, false);
    if (t.repeatIndex < 1) fail('重复编号从 1 开始');
    for (const f of ['durationSec', 'inferenceSec', 'motionSec']) number(t[f], f);
    for (const f of ['setupSec', 'resetSec']) if (t[f] !== undefined) number(t[f], f);
    if (t.demoId !== undefined) str(t.demoId, '示范 ID');
    if (t.resetVerified != null && typeof t.resetVerified !== 'boolean') fail('复位核对必须为布尔值或 null');
    number(t.tokens, 'tokens', true);
    for (const f of ['targetCorrect', 'orderCorrect', 'staleMemoryUsed']) {
      if (t[f] != null && typeof t[f] !== 'boolean') fail(f + ' 应为布尔值或 null');
    }
    textArray(t.failureTags, '失败标签');
    if (t.videoUrl && !safeUrl(t.videoUrl)) fail('视频链接仅支持 http / https');
    if (t.outcome === 'invalid' && !t.notes.trim()) fail('无效回合必须保留排除理由');
  });
  return p;
}

export function wilson(successes, count) {
  if (!count) return null;
  const z = 1.959963984540054;
  const ratio = successes / count;
  const denominator = 1 + z * z / count;
  const center = (ratio + z * z / (2 * count)) / denominator;
  const radius = z * Math.sqrt(ratio * (1 - ratio) / count + z * z / (4 * count * count)) / denominator;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}

export function statistics(trials) {
  const valid = trials.filter(t => t.phase === 'test' && t.outcome !== 'invalid');
  const successes = valid.filter(t => t.outcome === 'success').length;
  const scenes = new Set(valid.map(t => JSON.stringify([t.taskId, t.conditionId, t.scenarioId])));
  const independent = scenes.size === valid.length;
  const mean = field => {
    const values = valid.map(t => t[field]).filter(v => typeof v === 'number');
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  return {
    count: valid.length, successes, scenes: scenes.size, independent,
    rate: valid.length ? successes / valid.length : null,
    interval: independent ? wilson(successes, valid.length) : null,
    durationSec: mean('durationSec'), tokens: mean('tokens'),
    interventions: valid.filter(t => t.outcome === 'intervened').length,
    invalid: trials.filter(t => t.phase === 'test' && t.outcome === 'invalid').length
  };
}

export function toCsv(rows) {
  const keys = ['id', 'taskId', 'conditionId', 'methodId', 'scenarioId', 'repeatIndex', 'phase', 'outcome', 'demoId', 'resetVerified', 'setupSec', 'resetSec', 'durationSec', 'inferenceSec', 'motionSec', 'tokens', 'targetCorrect', 'orderCorrect', 'staleMemoryUsed', 'failureTags', 'modelVersion', 'configRevision', 'notes', 'videoUrl', 'createdAt'];
  const cell = v => {
    let value = Array.isArray(v) ? v.join(' / ') : String(v ?? '');
    if (/^[=+\-@\t\r]/.test(value)) value = "'" + value;
    return '"' + value.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [keys.map(cell).join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\r\n');
}

export function planWorkload(project, scenesPerTask, methodIds) {
  const tasks = project.tasks.filter(t => t.priority === '核心');
  const selected = methodIds || project.planning?.methodIds || ['direct', 'history', 'ours'];
  const known = new Set(project.methods.map(m => m.id));
  if (!Number.isInteger(scenesPerTask) || scenesPerTask < 2 || !selected.length || new Set(selected).size !== selected.length || selected.some(id => !known.has(id))) return null;
  const allocations = tasks.map(t => {
    const conditions = t.conditions.slice(0, 2);
    return {
      taskId: t.id,
      conditions: conditions.map((c, i) => ({ conditionId: c.id, scenes: Math.floor(scenesPerTask / conditions.length) + (i < scenesPerTask % conditions.length ? 1 : 0) }))
    };
  });
  return {
    tasks: tasks.length, scenesPerTask, methods: selected.length,
    independentScenes: tasks.length * scenesPerTask,
    episodes: tasks.length * scenesPerTask * selected.length,
    demoClips: tasks.filter(t => t.operations?.requiresDemo).length * scenesPerTask,
    allocations
  };
}
