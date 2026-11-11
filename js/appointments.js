// Hàm thuần cho lịch tái khám, không phụ thuộc DOM để test được bằng node.
import { startOfDay } from './stats.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SOON_DAYS = 3;
export const TEXT_MAX = 200;

export const PLACE_MAX = 100;

// Chưa khám: sớm nhất lên đầu. Đã khám: mới nhất lên đầu.
export function splitAppointments(list) {
  const open = list.filter((a) => !a.done).sort((a, b) => a.at - b.at);
  const done = list.filter((a) => a.done).sort((a, b) => b.at - a.at);
  return { open, done };
}

// Số ngày lịch từ hôm nay đến ngày hẹn (âm là đã qua).
export function daysUntil(at, now) {
  return Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
}

// Trạng thái: past (qua ngày mà chưa ghi đã khám), today, soon (còn ≤ 3 ngày), upcoming.
export function appointmentStatus(at, now) {
  const d = daysUntil(at, now);
  if (d < 0) return 'past';
  if (d === 0) return 'today';
  if (d <= SOON_DAYS) return 'soon';
  return 'upcoming';
}

// Lịch chưa khám sớm nhất, kể cả lịch đã qua mà chưa ghi. Không có thì trả null.
export function nextAppointment(list, now) {
  const first = splitAppointments(list).open[0];
  return first ? { ...first, status: appointmentStatus(first.at, now) } : null;
}
