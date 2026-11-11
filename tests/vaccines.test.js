import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDULE, dueDate, groupByMilestone, milestoneLabel, vaccinePlan, vaccinesToRemind } from '../js/vaccines.js';

const BIRTH = new Date(2026, 9, 28, 7, 0).getTime();
const at = (y, m, d) => new Date(y, m - 1, d).getTime();
const find = (plan, id) => plan.find((v) => v.id === id);

test('id mũi tiêm không trùng', () => {
  assert.equal(new Set(SCHEDULE.map((v) => v.id)).size, SCHEDULE.length);
});

test('ngày hạn cộng theo tháng lịch từ ngày sinh', () => {
  assert.equal(dueDate(BIRTH, { days: 0 }), at(2026, 10, 28));
  assert.equal(dueDate(BIRTH, { months: 2 }), at(2026, 12, 28));
  assert.equal(dueDate(BIRTH, { months: 3 }), at(2027, 1, 28));
  assert.equal(dueDate(BIRTH, { months: 12, weeks: 2 }), at(2027, 11, 11));
});

test('nhãn mốc tuổi', () => {
  assert.equal(milestoneLabel({ days: 0 }), 'Sơ sinh');
  assert.equal(milestoneLabel({ weeks: 6 }), '6 tuần');
  assert.equal(milestoneLabel({ months: 12, weeks: 2 }), '12 tháng');
});

test('trạng thái theo ngày hạn', () => {
  const plan = vaccinePlan([], BIRTH, at(2026, 12, 23));
  assert.equal(find(plan, 'hepb-0').status, 'overdue');
  assert.equal(find(plan, '6in1-1').status, 'soon');
  assert.equal(find(plan, '6in1-2').status, 'upcoming');
  assert.equal(vaccinePlan([], BIRTH, at(2026, 12, 29)).find((v) => v.id === '6in1-1').status, 'due');
});

test('đã tiêm, bỏ qua và mũi thay thế', () => {
  const records = [
    { id: 'hepb-0', status: 'done', at: BIRTH },
    { id: 'bcg', status: 'skipped', at: BIRTH },
    { id: '6in1-1', status: 'done', at: at(2026, 12, 28) },
  ];
  const plan = vaccinePlan(records, BIRTH, at(2027, 1, 1));
  assert.equal(find(plan, 'hepb-0').status, 'done');
  assert.equal(find(plan, 'bcg').status, 'skipped');
  assert.equal(find(plan, '5in1-1').status, 'notNeeded');
  assert.equal(find(plan, 'opv-1').status, 'notNeeded');
  assert.equal(find(plan, '5in1-2').status, 'upcoming');
});

test('tiêm TCMR thì mũi dịch vụ thay thế không cần, mũi cùng chương trình vẫn cần', () => {
  const plan = vaccinePlan([{ id: '5in1-1', status: 'done', at: 1 }], BIRTH, at(2027, 1, 1));
  assert.equal(find(plan, '6in1-1').status, 'notNeeded');
  assert.notEqual(find(plan, 'opv-1').status, 'notNeeded');
});

test('mũi tự thêm nằm cuối và được nhắc', () => {
  const custom = { id: 'x1', name: 'Cúm nhắc', status: null, dueAt: at(2026, 11, 8) };
  const plan = vaccinePlan([custom], BIRTH, at(2026, 11, 5));
  assert.equal(plan.at(-1).id, 'x1');
  assert.equal(plan.at(-1).status, 'soon');
  assert.ok(vaccinesToRemind(plan).some((v) => v.id === 'x1'));
  assert.equal(groupByMilestone(plan).at(-1).label, 'Mũi tự thêm');
});

test('nhóm theo mốc tuổi giữ thứ tự', () => {
  const groups = groupByMilestone(vaccinePlan([], BIRTH, BIRTH));
  assert.deepEqual(groups.slice(0, 3).map((g) => g.label), ['Sơ sinh', '2 tháng', '3 tháng']);
});
