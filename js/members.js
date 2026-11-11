// Hàm thuần về thành viên và link mời, không phụ thuộc DOM hay Firebase để test được bằng node.

// Quan hệ với bé, hiện cạnh mỗi lần ghi. Key lưu trong dữ liệu, không đổi.
export const RELATIONS = {
  ba: 'Ba', me: 'Mẹ', ong: 'Ông', grandma: 'Bà', baomau: 'Bảo mẫu', khac: 'Khác',
};
export const NAME_MAX = 40;
export const SEX = { f: 'Bé gái', m: 'Bé trai' };

// Link mời dạng .../#join=<familyId>.<inviteCode>. familyId là id ngẫu nhiên của Firestore.
const INVITE_RE = /#join=([A-Za-z0-9]{20})\.([0-9a-f]{32})\s*$/;

export function parseInvite(text) {
  const match = INVITE_RE.exec((text ?? '').trim());
  return match ? { familyId: match[1], code: match[2] } : null;
}

export function inviteUrl(base, familyId, code) {
  return `${base}#join=${familyId}.${code}`;
}

export function randomHex(bytes = 16, rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return [...rand(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cleanName(text) {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= NAME_MAX ? s : null;
}

// Nhãn người ghi: quan hệ với bé, thêm tên khi trong nhà có hai người cùng quan hệ.
export function memberLabel(members, uid) {
  const m = members.find((x) => x.uid === uid);
  if (!m) return '';
  const rel = RELATIONS[m.relation] ?? '';
  const same = members.filter((x) => x.relation === m.relation).length > 1;
  return same && m.name ? `${rel} ${m.name}` : rel || m.name || '';
}

// Chủ cuối cùng không được rời hoặc tự hạ quyền, nếu không nhật ký sẽ không ai quản lý.
export function isLastOwner(members, uid) {
  const owners = members.filter((m) => m.role === 'owner');
  return owners.length === 1 && owners[0].uid === uid;
}

// Ngày giờ sinh từ ô date + time (giờ địa phương). Thiếu giờ thì lấy 12h trưa.
export function parseBirth(date, time, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hr, min] = /^\d{2}:\d{2}$/.test(time ?? '') ? time.split(':').map(Number) : [12, 0];
  const at = new Date(y, m - 1, d, hr, min).getTime();
  // Chỉ nhận bé sinh trong 3 năm gần đây, không ở tương lai.
  if (!Number.isFinite(at) || at > now + 60000 || at < now - 3 * 366 * 86400000) return null;
  return at;
}
