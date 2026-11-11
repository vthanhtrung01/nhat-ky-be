import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize, backupFileName } from '../scripts/backup-format.js';

class FakeTs {
  constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  toDate() { return new Date(this.seconds * 1000 + this.nanoseconds / 1e6); }
}

test('Timestamp ghi thành ISO và giữ nano giây', () => {
  const out = serialize({ at: new FakeTs(1793865600, 123456789), ml: 60, by: 'me', diaper: null });
  assert.deepEqual(out, { at: { __ts: '2026-11-05T08:00:00.000Z', ns: 123456789 }, ml: 60, by: 'me', diaper: null });
});

test('khôi phục đúng Timestamp, kể cả trong mảng và object lồng', () => {
  const data = { at: new FakeTs(1793865600, 5), list: [new FakeTs(1, 0), 'x'], nested: { done: true, doneAt: null } };
  const back = deserialize(JSON.parse(JSON.stringify(serialize(data))), (s, ns) => new FakeTs(s, ns));
  assert.deepEqual(back, data);
});

test('tên file theo ngày giờ máy', () => {
  assert.equal(backupFileName(new Date(2026, 10, 5, 9, 7)), 'nkb-2026-11-05-0907.json');
});
