// Khởi tạo firebase-admin từ service account key, dùng chung cho backup và restore.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const DEFAULT_KEY = join(homedir(), '.nhat-ky-be', 'service-account.json');

export function openDb() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_KEY;
  if (!existsSync(keyPath)) {
    console.error(`Không thấy service account key tại ${keyPath}.\nXem mục "Sao lưu dữ liệu" trong README.md.`);
    process.exit(1);
  }
  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  initializeApp({ credential: cert(key), projectId: key.project_id });
  return { db: getFirestore(), projectId: key.project_id };
}

export function familyIdFrom(arg) {
  const id = arg || process.env.NKB_FAMILY_ID;
  if (!id || !/^[A-Za-z0-9]{20}$/.test(id)) {
    console.error('Cần familyId (20 ký tự ngay sau "#join=" trong link mời, trước dấu chấm).\nVí dụ: npm run backup -- <familyId>  hoặc đặt biến môi trường NKB_FAMILY_ID.');
    process.exit(1);
  }
  return id;
}
