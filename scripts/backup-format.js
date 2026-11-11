// Chuyển dữ liệu Firestore sang JSON và ngược lại. Timestamp được ghi thành
// { "__ts": "<ISO>", "ns": <nano giây> } để vừa dễ đọc vừa khôi phục chính xác.
export const FORMAT_VERSION = 1;

function isTimestamp(v) {
  return v != null && typeof v === 'object'
    && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number' && typeof v.toDate === 'function';
}

export function serialize(value) {
  if (isTimestamp(value)) {
    return { __ts: new Date(value.seconds * 1000).toISOString(), ns: value.nanoseconds };
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

// makeTimestamp(seconds, nanoseconds) tạo Timestamp của SDK đang dùng.
export function deserialize(value, makeTimestamp) {
  if (Array.isArray(value)) return value.map((v) => deserialize(v, makeTimestamp));
  if (value != null && typeof value === 'object') {
    if (typeof value.__ts === 'string') {
      return makeTimestamp(Math.floor(Date.parse(value.__ts) / 1000), value.ns ?? 0);
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deserialize(v, makeTimestamp)]));
  }
  return value;
}

export function backupFileName(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `nkb-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}
