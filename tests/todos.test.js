import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TODO_MAX, cleanTask, splitTodos } from '../js/todos.js';

test('chuẩn hóa chữ từ giọng nói', () => {
  assert.equal(cleanTask('  mua   tã size M. '), 'Mua tã size M');
  assert.equal(cleanTask('đặt lịch tiêm...'), 'Đặt lịch tiêm');
  assert.equal(cleanTask('Giặt đồ'), 'Giặt đồ');
});

test('chữ rỗng trả null', () => {
  assert.equal(cleanTask(''), null);
  assert.equal(cleanTask('   '), null);
  assert.equal(cleanTask(' . '), null);
  assert.equal(cleanTask(undefined), null);
});

test('cắt chữ quá dài', () => {
  assert.equal(cleanTask('a'.repeat(300)).length, TODO_MAX);
});

test('tách việc chưa xong và đã xong, mới nhất lên đầu', () => {
  const list = [
    { id: 'a', done: false, createdAt: 1 },
    { id: 'b', done: true, createdAt: 2, doneAt: 10 },
    { id: 'c', done: false, createdAt: 3 },
    { id: 'd', done: true, createdAt: 4, doneAt: 20 },
  ];
  const { open, done } = splitTodos(list);
  assert.deepEqual(open.map((t) => t.id), ['c', 'a']);
  assert.deepEqual(done.map((t) => t.id), ['d', 'b']);
});
