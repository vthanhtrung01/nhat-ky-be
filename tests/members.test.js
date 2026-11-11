import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanName, inviteUrl, isLastOwner, memberLabel, parseBirth, parseInvite, randomHex,
} from '../js/members.js';

const FID = 'AbCdEfGhIjKlMnOpQrSt';
const CODE = '0123456789abcdef0123456789abcdef';

test('link mời: tạo và đọc lại', () => {
  const url = inviteUrl('https://nkb.web.app/', FID, CODE);
  assert.equal(url, `https://nkb.web.app/#join=${FID}.${CODE}`);
  assert.deepEqual(parseInvite(url), { familyId: FID, code: CODE });
  assert.deepEqual(parseInvite(`#join=${FID}.${CODE}`), { familyId: FID, code: CODE });
  assert.deepEqual(parseInvite(`  ${url}  `), { familyId: FID, code: CODE });
});

test('link mời sai thì trả null', () => {
  assert.equal(parseInvite(''), null);
  assert.equal(parseInvite(null), null);
  assert.equal(parseInvite(`#join=${FID}`), null);
  assert.equal(parseInvite(`#join=${FID}.${CODE.slice(1)}`), null);
  assert.equal(parseInvite(`#join=${FID}.${CODE.toUpperCase()}`), null);
  assert.equal(parseInvite(`#f=${CODE}`), null);
});

test('randomHex đủ độ dài và chỉ có hex', () => {
  const v = randomHex(16, (n) => new Uint8Array(n).fill(171));
  assert.equal(v, 'ab'.repeat(16));
  assert.match(randomHex(), /^[0-9a-f]{32}$/);
});

test('tên gọi: gọn khoảng trắng, giới hạn 1–40 ký tự', () => {
  assert.equal(cleanName('  Bé   Na '), 'Bé Na');
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName('x'.repeat(41)), null);
  assert.equal(cleanName(undefined), null);
});

const members = [
  { uid: 'a', role: 'owner', relation: 'me', name: 'Lan' },
  { uid: 'b', role: 'member', relation: 'ba', name: 'Minh' },
  { uid: 'c', role: 'member', relation: 'grandma', name: 'Nội' },
  { uid: 'd', role: 'member', relation: 'grandma', name: 'Ngoại' },
];

test('nhãn người ghi theo quan hệ, thêm tên khi trùng quan hệ', () => {
  assert.equal(memberLabel(members, 'a'), 'Mẹ');
  assert.equal(memberLabel(members, 'b'), 'Ba');
  assert.equal(memberLabel(members, 'c'), 'Bà Nội');
  assert.equal(memberLabel(members, 'd'), 'Bà Ngoại');
  assert.equal(memberLabel(members, 'gone'), '');
});

test('chủ cuối cùng', () => {
  assert.equal(isLastOwner(members, 'a'), true);
  assert.equal(isLastOwner(members, 'b'), false);
  assert.equal(isLastOwner([...members, { uid: 'e', role: 'owner' }], 'a'), false);
});

test('ngày giờ sinh', () => {
  const now = new Date(2026, 10, 11, 9).getTime();
  assert.equal(parseBirth('2026-10-28', '06:48', now), new Date(2026, 9, 28, 6, 48).getTime());
  assert.equal(parseBirth('2026-10-28', '', now), new Date(2026, 9, 28, 12, 0).getTime());
  assert.equal(parseBirth('2026-11-12', '', now), null);
  assert.equal(parseBirth('2020-01-01', '', now), null);
  assert.equal(parseBirth('', '', now), null);
});
