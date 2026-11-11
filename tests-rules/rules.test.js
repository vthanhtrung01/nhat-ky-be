// Kiểm tra firestore.rules trên emulator. Chạy: npm run test:rules (cần Java cho emulator).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const FID = 'famAAAAAAAAAAAAAAAAA';
const CODE = '0123456789abcdef0123456789abcdef';
const now = Timestamp.now();
let env;

const user = (uid, email = `${uid}@x.com`, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const member = (uid, role = 'member') => ({ uid, role, relation: 'me', name: uid, email: `${uid}@x.com`, joinedAt: now });
const profile = { name: 'Bé', birthAt: now, sex: 'f', weightKg: null, updatedAt: now, by: 'owner' };
const event = (by) => ({ type: 'feed', milk: 'formula', at: now, ml: 60, diaper: null, by });
const request = (uid, inviteCode = CODE) => ({ uid, inviteCode, relation: 'ba', name: uid, email: `${uid}@x.com`, at: now });

async function createFamily(db, uid, fid = FID) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'families', fid), { inviteCode: CODE, createdAt: now, createdBy: uid });
  batch.set(doc(db, 'families', fid, 'members', uid), member(uid, 'owner'));
  batch.set(doc(db, 'families', fid, 'profile', 'baby'), { ...profile, by: uid });
  return batch.commit();
}

// Thêm thành viên qua đúng luồng: xin tham gia rồi chủ duyệt.
async function addMember(uid) {
  await setDoc(doc(user(uid), 'families', FID, 'requests', uid), request(uid));
  const db = user('owner');
  const batch = writeBatch(db);
  batch.set(doc(db, 'families', FID, 'members', uid), member(uid));
  batch.delete(doc(db, 'families', FID, 'requests', uid));
  await batch.commit();
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nkb',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await createFamily(user('owner'), 'owner');
});

test('tạo nhật ký: family + chủ + hồ sơ trong một batch', async () => {
  await assertSucceeds(createFamily(user('x'), 'x', 'famBBBBBBBBBBBBBBBBB'));
});

test('không chiếm được nhật ký đang có bằng cách tự thêm mình làm chủ', async () => {
  const db = user('evil');
  await assertFails(setDoc(doc(db, 'families', FID, 'members', 'evil'), member('evil', 'owner')));
  await assertFails(createFamily(db, 'evil'));
});

test('chưa xác minh email hoặc chưa đăng nhập thì không làm gì được', async () => {
  await assertFails(createFamily(user('nv', 'nv@x.com', false), 'nv', 'famCCCCCCCCCCCCCCCCC'));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'families', FID)));
});

test('người lạ không đọc được nhật ký, không liệt kê được families', async () => {
  const db = user('stranger');
  await assertFails(getDoc(doc(db, 'families', FID)));
  await assertFails(getDocs(collection(db, 'families', FID, 'events')));
  await assertFails(getDoc(doc(db, 'families', FID, 'profile', 'baby')));
  await assertFails(getDocs(collection(db, 'families')));
  await assertFails(setDoc(doc(db, 'families', FID, 'events', 'e1'), event('stranger')));
});

test('có link mời chỉ tạo được yêu cầu tham gia, sai mã hoặc sai email thì bị chặn', async () => {
  const db = user('b');
  await assertFails(setDoc(doc(db, 'families', FID, 'requests', 'b'), request('b', 'f'.repeat(32))));
  await assertFails(setDoc(doc(db, 'families', FID, 'requests', 'c'), request('c')));
  await assertFails(setDoc(doc(db, 'families', FID, 'requests', 'b'), { ...request('b'), email: 'khac@x.com' }));
  await assertSucceeds(setDoc(doc(db, 'families', FID, 'requests', 'b'), request('b')));
  await assertSucceeds(getDoc(doc(db, 'families', FID, 'requests', 'b')));
  await assertSucceeds(getDoc(doc(db, 'families', FID, 'members', 'b')));
  await assertFails(getDocs(collection(db, 'families', FID, 'requests')));
  await assertFails(getDocs(collection(db, 'families', FID, 'events')));
});

test('chủ duyệt xong thì thành viên ghi được', async () => {
  await addMember('b');
  await assertSucceeds(setDoc(doc(user('b'), 'families', FID, 'events', 'e1'), event('b')));
});

test('chủ không thêm được người chưa xin tham gia', async () => {
  await assertFails(setDoc(doc(user('owner'), 'families', FID, 'members', 'z'), member('z')));
});

test('thành viên: không tự nâng quyền, không xóa người khác, không duyệt, không đổi mã mời', async () => {
  await addMember('b');
  await setDoc(doc(user('c'), 'families', FID, 'requests', 'c'), request('c'));
  const db = user('b');
  await assertSucceeds(setDoc(doc(db, 'families', FID, 'todos', 't1'), {
    text: 'mua tã', done: false, createdAt: now, by: 'b', doneAt: null, doneBy: null,
  }));
  await assertSucceeds(updateDoc(doc(db, 'families', FID, 'members', 'b'), { name: 'Minh', relation: 'ba' }));
  await assertFails(updateDoc(doc(db, 'families', FID, 'members', 'b'), { role: 'owner' }));
  await assertFails(deleteDoc(doc(db, 'families', FID, 'members', 'owner')));
  await assertFails(getDocs(collection(db, 'families', FID, 'requests')));
  await assertFails(setDoc(doc(db, 'families', FID, 'members', 'c'), member('c')));
  await assertFails(updateDoc(doc(db, 'families', FID), { inviteCode: 'a'.repeat(32) }));
  // Hồ sơ bé: thành viên chỉ sửa cân nặng.
  await assertSucceeds(updateDoc(doc(db, 'families', FID, 'profile', 'baby'), { weightKg: 3.6, updatedAt: now, by: 'b' }));
  await assertFails(updateDoc(doc(db, 'families', FID, 'profile', 'baby'), { name: 'Khác' }));
  await assertSucceeds(updateDoc(doc(db, 'families', FID, 'profile', 'baby'), { mlPerKg: 160, updatedAt: now, by: 'b' }));
  await assertFails(updateDoc(doc(db, 'families', FID, 'profile', 'baby'), { mlPerKg: 300, updatedAt: now, by: 'b' }));
  await assertFails(updateDoc(doc(db, 'families', FID, 'profile', 'baby'), { mlPerKg: 150.5, updatedAt: now, by: 'b' }));
  // Tự rời được, rời rồi thì không đọc được nữa.
  await assertSucceeds(deleteDoc(doc(db, 'families', FID, 'members', 'b')));
  await assertFails(getDocs(collection(db, 'families', FID, 'events')));
});

test('chủ xóa thành viên thì người đó mất quyền đọc', async () => {
  await addMember('b');
  await assertSucceeds(deleteDoc(doc(user('owner'), 'families', FID, 'members', 'b')));
  await assertFails(getDocs(collection(user('b'), 'families', FID, 'events')));
});

test('chủ đổi mã mời: link cũ không xin tham gia được nữa', async () => {
  await assertSucceeds(updateDoc(doc(user('owner'), 'families', FID), { inviteCode: 'a'.repeat(32) }));
  await assertFails(updateDoc(doc(user('owner'), 'families', FID), { createdBy: 'x' }));
  await assertFails(setDoc(doc(user('b'), 'families', FID, 'requests', 'b'), request('b')));
});

test('tìm nhật ký của mình bằng collection group, không đọc được của người khác', async () => {
  const db = user('owner');
  const mine = await assertSucceeds(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'owner'))));
  if (mine.size !== 1) throw new Error(`expected 1, got ${mine.size}`);
  await assertFails(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'b'))));
});

test('dữ liệu sai bị chặn', async () => {
  const db = user('owner');
  await assertFails(setDoc(doc(db, 'families', FID, 'events', 'e1'), { ...event('owner'), ml: 900 }));
  await assertFails(setDoc(doc(db, 'families', FID, 'events', 'e1'), { ...event('owner'), gas: true }));
  await assertFails(updateDoc(doc(db, 'families', FID, 'profile', 'baby'), { sex: 'x' }));
});

test('chủ xóa cả nhật ký: dữ liệu, rồi family + mình cùng batch', async () => {
  const db = user('owner');
  await setDoc(doc(db, 'families', FID, 'events', 'e1'), event('owner'));
  await assertSucceeds(deleteDoc(doc(db, 'families', FID, 'events', 'e1')));
  await assertSucceeds(deleteDoc(doc(db, 'families', FID, 'profile', 'baby')));
  const batch = writeBatch(db);
  batch.delete(doc(db, 'families', FID));
  batch.delete(doc(db, 'families', FID, 'members', 'owner'));
  await assertSucceeds(batch.commit());
});
