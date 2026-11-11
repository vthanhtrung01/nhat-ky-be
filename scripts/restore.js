// Ghi lại dữ liệu từ một file backup lên Firestore: giữ nguyên id, ghi đè mục trùng id,
// không xóa mục đang có. Mặc định chỉ in kế hoạch, thêm --yes để ghi thật.
// Dùng: npm run restore -- backups/nkb-....json [--yes] [--family <familyId khác>]
import { readFile } from 'node:fs/promises';
import { Timestamp } from 'firebase-admin/firestore';
import { FORMAT_VERSION, deserialize } from './backup-format.js';
import { openDb, familyIdFrom } from './firebase-admin-init.js';

const args = process.argv.slice(2);
const yes = args.includes('--yes');
const familyAt = args.indexOf('--family');
const familyArg = familyAt >= 0 ? args[familyAt + 1] : null;
const path = args.find((a, i) => !a.startsWith('--') && (familyAt < 0 || i !== familyAt + 1));
if (!path) {
  console.error('Dùng: npm run restore -- backups/nkb-....json [--yes] [--family <familyId>]');
  process.exit(1);
}

const backup = JSON.parse(await readFile(path, 'utf8'));
if (backup.format !== FORMAT_VERSION || !backup.collections) {
  console.error('File không đúng định dạng backup.');
  process.exit(1);
}
const familyId = familyIdFrom(familyArg || backup.familyId);
const { db, projectId } = openDb();

console.log(`Backup lúc ${backup.exportedAt} (project ${backup.projectId}) -> project ${projectId}, gia đình ${familyId}`);
for (const [name, docs] of Object.entries(backup.collections)) console.log(`${name}: ${Object.keys(docs).length} mục`);
if (!yes) {
  console.log('\nChưa ghi gì. Chạy lại với --yes để khôi phục.');
  process.exit(0);
}

const family = db.collection('families').doc(familyId);
const makeTs = (s, ns) => new Timestamp(s, ns);
let batch = db.batch();
if (backup.family) batch.set(family, deserialize(backup.family, makeTs));
let pending = 0;
let total = 0;
for (const [name, docs] of Object.entries(backup.collections)) {
  for (const [id, data] of Object.entries(docs)) {
    batch.set(family.collection(name).doc(id), deserialize(data, makeTs));
    total += 1;
    pending += 1;
    if (pending === 500) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
}
if (pending) await batch.commit();
console.log(`Đã khôi phục ${total} mục.`);
