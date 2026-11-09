import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateProject, statistics, wilson, toCsv, safeUrl, escapeHtml, planWorkload } from '../site/model.js';

const source = JSON.parse(readFileSync(new URL('../site/data/project.json', import.meta.url)));
const fresh = () => ({ ...structuredClone(source), trials: [] });
const record = (id, overrides = {}) => ({
  id, taskId: 'T1', conditionId: 'standard', methodId: 'ours', scenarioId: id,
  repeatIndex: 1, phase: 'test', outcome: 'success', durationSec: 10, inferenceSec: 7,
  motionSec: 3, tokens: 100, targetCorrect: null, orderCorrect: null,
  staleMemoryUsed: null, failureTags: [], notes: '', videoUrl: '',
  modelVersion: 'test-fixture', configRevision: 'fixture', createdAt: '2026-11-08T00:00:00Z',
  ...overrides
});

test('the maintained project and its benchmark references validate', () => {
  assert.equal(validateProject(structuredClone(source)).coverage.length, 16);
  assert.ok(source.tasks.some(t => t.priority === '核心'));
  assert.ok(Array.isArray(source.trials));
});

test('invalid references, duplicate scene executions and invalid numeric fields are rejected', () => {
  let p = fresh(); p.trials = [record('a', { conditionId: 'missing' })];
  assert.throws(() => validateProject(p), /条件不存在/);
  p = fresh(); p.trials = [record('a'), record('b', { scenarioId: 'a' })];
  assert.throws(() => validateProject(p), /不能重复/);
  p = fresh(); p.trials = [record('a', { tokens: -5 })];
  assert.throws(() => validateProject(p), /非负整数/);
  p = fresh(); p.trials = [record('a', { durationSec: Infinity })];
  assert.throws(() => validateProject(p), /非负数值/);
});

test('invalid rounds require an exclusion reason; repeated executions require distinct repeat indices', () => {
  let p = fresh(); p.trials = [record('a', { outcome: 'invalid' })];
  assert.throws(() => validateProject(p), /排除理由/);
  p.trials[0].notes = 'Fixture only: sensor outage under the registered exclusion rule';
  assert.doesNotThrow(() => validateProject(p));
  p = fresh(); p.trials = [record('a'), record('b', { scenarioId: 'a', repeatIndex: 2 })];
  assert.doesNotThrow(() => validateProject(p));
});

test('development and invalid rounds are excluded; intervention is not autonomous success', () => {
  const rows = [
    record('a'), record('b', { outcome: 'failure' }), record('c', { outcome: 'intervened' }),
    record('d', { outcome: 'invalid', notes: 'Fixture exclusion' }),
    record('e', { phase: 'development' })
  ];
  const s = statistics(rows);
  assert.equal(s.count, 3);
  assert.equal(s.successes, 1);
  assert.equal(s.rate, 1 / 3);
  assert.equal(s.interventions, 1);
  assert.equal(s.invalid, 1);
  assert.equal(s.durationSec, 10);
});

test('repeated scenes suppress an interval that assumes independent rounds', () => {
  const s = statistics([record('a'), record('b', { scenarioId: 'a', repeatIndex: 2 })]);
  assert.equal(s.count, 2);
  assert.equal(s.scenes, 1);
  assert.equal(s.independent, false);
  assert.equal(s.interval, null);
});

test('empty results are missing rather than zero success; Wilson interval matches known calculation', () => {
  assert.equal(statistics([]).rate, null);
  assert.equal(statistics([]).interval, null);
  const [lower, upper] = wilson(10, 20);
  assert.ok(Math.abs(lower - 0.299298) < 0.00001);
  assert.ok(Math.abs(upper - 0.700702) < 0.00001);
  assert.equal(wilson(0, 0), null);
});

test('evidence URLs and rendered user text cannot introduce executable links or markup', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('https://name:password@example.com'), '');
  assert.equal(safeUrl('https://example.com/video'), 'https://example.com/video');
  assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  const p = fresh(); p.trials = [record('a', { videoUrl: 'javascript:alert(1)' })];
  assert.throws(() => validateProject(p), /视频链接/);
});

test('CSV preserves multiline notes, quotes and spreadsheet formula-like input', () => {
  const csv = toCsv([record('a', { scenarioId: '=1+1', notes: 'line one\nline "two"' })]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"line one\nline ""two"""'));
});

test('all benchmark mapping references and phase/status enums remain valid on import', () => {
  let p = fresh(); p.coverage[0].tasks = ['T999'];
  assert.throws(() => validateProject(p), /不存在的任务/);
  p = fresh(); p.tasks[0].status = 'constructor';
  assert.throws(() => validateProject(p), /状态无效/);
  p = fresh(); p.schemaVersion = 2;
  assert.throws(() => validateProject(p), /数据版本/);
});

test('the workload counts scenes per task rather than multiplying them by condition count', () => {
  const s = planWorkload(source, 10, ['direct', 'contract-off', 'ours']);
  const core = source.tasks.filter(t => t.priority === '核心');
  assert.equal(s.episodes, core.length * 10 * 3);
  assert.equal(s.independentScenes, core.length * 10);
  for (const task of s.allocations) assert.equal(task.conditions.reduce((sum, c) => sum + c.scenes, 0), 10);
  assert.equal(s.demoClips, core.filter(t => t.operations?.requiresDemo).length * 10);
  assert.equal(planWorkload(source, 10, ['contract-off', 'ours']).episodes, core.length * 10 * 2);
  assert.equal(planWorkload(source, 20).episodes, core.length * 20 * source.planning.methodIds.length);
  assert.equal(planWorkload(source, 0), null);
  assert.equal(planWorkload(source, 10, ['ours', 'ours']), null);
});

test('protocol correction is recorded separately from physical failure and cannot exceed rejections', () => {
  const p = fresh();
  p.trials = [record('correction', { decisionRejections: 2, decisionRecoveries: 1, semanticFailureObserved: false, prematureAction: null })];
  assert.doesNotThrow(() => validateProject(p));
  p.trials[0].decisionRecoveries = 3;
  assert.throws(() => validateProject(p), /恢复序列/);
  p.trials[0].decisionRecoveries = null;
  p.trials[0].semanticFailureObserved = 'false';
  assert.throws(() => validateProject(p), /semanticFailureObserved/);
  delete p.trials[0].semanticFailureObserved;
  assert.doesNotThrow(() => validateProject(p));
  assert.ok(toCsv(p.trials).includes('"decisionRejections","decisionRecoveries","semanticFailureObserved","prematureAction"'));
});

test('legacy drafts remain importable while method source URLs are validated', () => {
  const p = fresh();
  delete p.methodAlignment;
  assert.doesNotThrow(() => validateProject(p));
  const q = fresh();
  q.methodAlignment.facts[0].source = 'javascript:alert(1)';
  assert.throws(() => validateProject(q), /实现依据/);
});

test('operator metadata accepts missing measurements and validates recorded preparation times', () => {
  const p = fresh();
  p.trials = [record('operator-a', { demoId: 'DEMO-001', setupSec: 12.5, resetSec: 9, resetVerified: true })];
  assert.doesNotThrow(() => validateProject(p));
  p.trials[0].setupSec = -1;
  assert.throws(() => validateProject(p), /setupSec/);
  p.trials[0].setupSec = null;
  p.trials[0].resetVerified = 'yes';
  assert.throws(() => validateProject(p), /复位核对/);
  p.trials[0].resetVerified = null;
  assert.doesNotThrow(() => validateProject(p));
  assert.ok(toCsv(p.trials).includes('"demoId","resetVerified","setupSec","resetSec"'));
});
