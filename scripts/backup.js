// Tải toàn bộ nhật ký của một gia đình từ Firestore về backups/nkb-<ngày giờ>.json.
// Dùng: npm run backup -- <familyId>   (hoặc đặt biến môi trường NKB_FAMILY_ID)
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FORMAT_VERSION, serialize, backupFileName } from './backup-format.js';
import { openDb, familyIdFrom } from './firebase-admin-init.js';

const familyId = familyIdFrom(process.argv[2]);
const { db, projectId } = openDb();
const family = db.collection('families').doc(familyId);

const familySnap = await family.get();
if (!familySnap.exists) {
  console.error('Không thấy nhật ký này. Kiểm tra lại familyId và project.');
  process.exit(1);
}

// listCollections lấy mọi collection con, kể cả collection thêm sau này.
const collections = {};
for (const col of await family.listCollections()) {
  const snap = await col.get();
  collections[col.id] = Object.fromEntries(snap.docs.map((d) => [d.id, serialize(d.data())]));
  console.log(`${col.id}: ${snap.size} mục`);
}
if (Object.keys(collections).length === 0) {
  console.error('Không có dữ liệu nào. Kiểm tra lại familyId và project.');
  process.exit(1);
}

const now = new Date();
const dir = new URL('../backups/', import.meta.url);
await mkdir(dir, { recursive: true });
const file = new URL(backupFileName(now), dir);
const body = {
  format: FORMAT_VERSION, projectId, familyId, exportedAt: now.toISOString(), family: serialize(familySnap.data()), collections,
};
await writeFile(file, `${JSON.stringify(body, null, 2)}\n`);
console.log(`Đã lưu ${fileURLToPath(file)}`);
