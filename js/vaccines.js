// Lịch tiêm tham khảo 0–24 tháng: Tiêm chủng mở rộng (tcmr, miễn phí) và vắc xin dịch vụ (dv).
// Hàm thuần để test được bằng node. Lịch thật theo chỉ định của bác sĩ và điểm tiêm.
const DAY_MS = 24 * 60 * 60 * 1000;
export const SOON_DAYS = 7;
export const LATE_DAYS = 30;
export const NOTE_MAX = 200;

export const PROGRAMS = { tcmr: 'TCMR', dv: 'Dịch vụ', custom: 'Tự thêm' };

// `age` tính theo lịch: { months, weeks, days } cộng từ ngày sinh.
// Các mũi cùng `alt` nhưng khác chương trình thay thế nhau: tiêm bên này thì bên kia không cần.
export const SCHEDULE = [
  { id: 'hepb-0', name: 'Viêm gan B sơ sinh', program: 'tcmr', age: { days: 0 }, hint: 'Trong 24 giờ đầu' },
  { id: 'bcg', name: 'Lao (BCG)', program: 'tcmr', age: { days: 0 }, hint: 'Trong tháng đầu' },

  { id: '6in1-1', name: '6 trong 1 – mũi 1', program: 'dv', age: { months: 2 }, alt: 'hexa-1' },
  { id: '5in1-1', name: '5 trong 1 (DPT-VGB-Hib) – mũi 1', program: 'tcmr', age: { months: 2 }, alt: 'hexa-1' },
  { id: 'opv-1', name: 'Bại liệt uống (bOPV) – lần 1', program: 'tcmr', age: { months: 2 }, alt: 'hexa-1' },
  { id: 'rota-1', name: 'Tiêu chảy Rota – liều 1', program: 'dv', age: { months: 2 }, hint: 'Uống, có thể từ 6 tuần' },
  { id: 'pcv-1', name: 'Phế cầu – mũi 1', program: 'dv', age: { months: 2 } },
  { id: 'menb-1', name: 'Não mô cầu B – mũi 1', program: 'dv', age: { months: 2 } },

  { id: '6in1-2', name: '6 trong 1 – mũi 2', program: 'dv', age: { months: 3 }, alt: 'hexa-2' },
  { id: '5in1-2', name: '5 trong 1 (DPT-VGB-Hib) – mũi 2', program: 'tcmr', age: { months: 3 }, alt: 'hexa-2' },
  { id: 'opv-2', name: 'Bại liệt uống (bOPV) – lần 2', program: 'tcmr', age: { months: 3 }, alt: 'hexa-2' },
  { id: 'rota-2', name: 'Tiêu chảy Rota – liều 2', program: 'dv', age: { months: 3 } },

  { id: '6in1-3', name: '6 trong 1 – mũi 3', program: 'dv', age: { months: 4 }, alt: 'hexa-3' },
  { id: '5in1-3', name: '5 trong 1 (DPT-VGB-Hib) – mũi 3', program: 'tcmr', age: { months: 4 }, alt: 'hexa-3' },
  { id: 'opv-3', name: 'Bại liệt uống (bOPV) – lần 3', program: 'tcmr', age: { months: 4 }, alt: 'hexa-3' },
  { id: 'rota-3', name: 'Tiêu chảy Rota – liều 3', program: 'dv', age: { months: 4 }, hint: 'Chỉ loại 3 liều, loại 2 liều thì bỏ qua' },
  { id: 'pcv-2', name: 'Phế cầu – mũi 2', program: 'dv', age: { months: 4 } },
  { id: 'menb-2', name: 'Não mô cầu B – mũi 2', program: 'dv', age: { months: 4 } },

  { id: 'ipv-1', name: 'Bại liệt tiêm (IPV) – mũi 1', program: 'tcmr', age: { months: 5 } },

  { id: 'pcv-3', name: 'Phế cầu – mũi 3', program: 'dv', age: { months: 6 } },
  { id: 'flu-1', name: 'Cúm – mũi 1', program: 'dv', age: { months: 6 }, hint: 'Sau đó nhắc mỗi năm' },
  { id: 'flu-2', name: 'Cúm – mũi 2', program: 'dv', age: { months: 7 }, hint: 'Cách mũi 1 ít nhất 4 tuần' },

  { id: 'measles-1', name: 'Sởi – mũi 1', program: 'tcmr', age: { months: 9 } },
  { id: 'ipv-2', name: 'Bại liệt tiêm (IPV) – mũi 2', program: 'tcmr', age: { months: 9 } },
  { id: 'menacwy-1', name: 'Não mô cầu ACWY – mũi 1', program: 'dv', age: { months: 9 } },
  { id: 'imojev-1', name: 'Viêm não Nhật Bản (Imojev) – mũi 1', program: 'dv', age: { months: 9 }, alt: 'je' },

  { id: 'je-1', name: 'Viêm não Nhật Bản – mũi 1', program: 'tcmr', age: { months: 12 }, alt: 'je' },
  { id: 'je-2', name: 'Viêm não Nhật Bản – mũi 2', program: 'tcmr', age: { months: 12, weeks: 2 }, alt: 'je', hint: 'Cách mũi 1 từ 1 đến 2 tuần' },
  { id: 'mmr-1', name: 'Sởi – Quai bị – Rubella (MMR)', program: 'dv', age: { months: 12 } },
  { id: 'varicella-1', name: 'Thủy đậu – mũi 1', program: 'dv', age: { months: 12 } },
  { id: 'hepa-1', name: 'Viêm gan A – mũi 1', program: 'dv', age: { months: 12 } },
  { id: 'pcv-4', name: 'Phế cầu – mũi nhắc', program: 'dv', age: { months: 12 } },
  { id: 'menb-3', name: 'Não mô cầu B – mũi nhắc', program: 'dv', age: { months: 12 } },
  { id: 'menacwy-2', name: 'Não mô cầu ACWY – mũi 2', program: 'dv', age: { months: 12 } },

  { id: '6in1-4', name: '6 trong 1 – mũi nhắc', program: 'dv', age: { months: 18 }, alt: 'hexa-4' },
  { id: 'dpt-4', name: 'Bạch hầu – Ho gà – Uốn ván (DPT) nhắc', program: 'tcmr', age: { months: 18 }, alt: 'hexa-4' },
  { id: 'mr', name: 'Sởi – Rubella (MR)', program: 'tcmr', age: { months: 18 } },
  { id: 'hepa-2', name: 'Viêm gan A – mũi 2', program: 'dv', age: { months: 18 } },

  { id: 'imojev-2', name: 'Viêm não Nhật Bản (Imojev) – mũi 2', program: 'dv', age: { months: 21 }, alt: 'je', hint: '12 đến 24 tháng sau mũi 1' },
  { id: 'je-3', name: 'Viêm não Nhật Bản – mũi 3', program: 'tcmr', age: { months: 24 }, alt: 'je', hint: '1 năm sau mũi 2' },
];

export function dueDate(birth, { months = 0, weeks = 0, days = 0 }) {
  const d = new Date(birth);
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate() + weeks * 7 + days).getTime();
}

export function milestoneLabel({ months = 0, weeks = 0, days = 0 }) {
  if (!months && !weeks && !days) return 'Sơ sinh';
  if (!months) return weeks ? `${weeks} tuần` : `${days} ngày`;
  return `${months} tháng`;
}

// Gộp lịch có sẵn với các bản ghi `records` (id → { status, at, by, note, name?, dueAt? }).
// Trạng thái: done, skipped, notNeeded (đã tiêm mũi thay thế), overdue, due, soon, upcoming.
export function vaccinePlan(records, birth, now) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const items = SCHEDULE.map((v) => ({
    ...v, dueAt: dueDate(birth, v.age), milestone: milestoneLabel(v.age), record: byId.get(v.id) ?? null,
  }));
  const known = new Set(SCHEDULE.map((v) => v.id));
  for (const r of records) {
    if (known.has(r.id) || !r.name) continue;
    items.push({ id: r.id, name: r.name, program: 'custom', dueAt: r.dueAt ?? r.at, milestone: 'Mũi tự thêm', record: r });
  }

  const doneAlt = new Map();
  for (const v of items) {
    if (v.alt && v.record?.status === 'done') doneAlt.set(v.alt, [...(doneAlt.get(v.alt) ?? []), v.program]);
  }
  for (const v of items) {
    const status = v.record?.status;
    if (status === 'done' || status === 'skipped') v.status = status;
    else if (v.alt && doneAlt.get(v.alt)?.some((p) => p !== v.program)) v.status = 'notNeeded';
    else if (now - v.dueAt > LATE_DAYS * DAY_MS) v.status = 'overdue';
    else if (v.dueAt <= now) v.status = 'due';
    else if (v.dueAt - now <= SOON_DAYS * DAY_MS) v.status = 'soon';
    else v.status = 'upcoming';
  }
  // Mũi tự thêm nằm cuối, để không chen vào giữa các mốc tuổi.
  const custom = (v) => (v.program === 'custom' ? 1 : 0);
  return items.sort((a, b) => custom(a) - custom(b) || a.dueAt - b.dueAt);
}

// Mũi cần nhắc ở màn hình Hôm nay: quá hạn, đến hạn hoặc trong 7 ngày tới.
export function vaccinesToRemind(plan) {
  return plan.filter((v) => ['overdue', 'due', 'soon'].includes(v.status));
}

// Nhóm theo mốc tuổi, giữ thứ tự thời gian.
export function groupByMilestone(plan) {
  const groups = [];
  for (const v of plan) {
    const last = groups.at(-1);
    if (last && last.label === v.milestone) last.items.push(v);
    else groups.push({ label: v.milestone, items: [v] });
  }
  return groups;
}
