import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentStatus, nextAppointment, splitAppointments } from '../js/appointments.js';

const at = (m, d, hr = 12) => new Date(2026, m - 1, d, hr).getTime();
const NOW = at(11, 5, 9);

test('tách lịch chưa khám và đã khám, sắp xếp đúng thứ tự', () => {
  const list = [
    { id: 'a', at: at(11, 20), done: false },
    { id: 'b', at: at(11, 1), done: true },
    { id: 'c', at: at(11, 8), done: false },
    { id: 'd', at: at(10, 20), done: true },
  ];
  const { open, done } = splitAppointments(list);
  assert.deepEqual(open.map((a) => a.id), ['c', 'a']);
  assert.deepEqual(done.map((a) => a.id), ['b', 'd']);
});

test('trạng thái theo ngày lịch', () => {
  assert.equal(appointmentStatus(at(11, 4, 23), NOW), 'past');
  assert.equal(appointmentStatus(at(11, 5, 7), NOW), 'today');
  assert.equal(appointmentStatus(at(11, 5, 20), NOW), 'today');
  assert.equal(appointmentStatus(at(11, 8), NOW), 'soon');
  assert.equal(appointmentStatus(at(11, 9), NOW), 'upcoming');
});

test('lịch sớm nhất ưu tiên lịch đã qua mà chưa ghi, bỏ qua lịch đã khám', () => {
  const list = [
    { id: 'old', at: at(11, 1), done: true },
    { id: 'missed', at: at(11, 3), done: false },
    { id: 'next', at: at(11, 6), done: false },
  ];
  const next = nextAppointment(list, NOW);
  assert.equal(next.id, 'missed');
  assert.equal(next.status, 'past');
  assert.equal(nextAppointment(list.filter((a) => a.id !== 'missed'), NOW).status, 'soon');
});

test('không có lịch chưa khám thì trả null', () => {
  assert.equal(nextAppointment([], NOW), null);
  assert.equal(nextAppointment([{ id: 'x', at: at(11, 10), done: true }], NOW), null);
});
