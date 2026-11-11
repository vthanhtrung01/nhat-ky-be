// Bộ icon nét bo tròn (lưới 24×24, nét 2px), một màu theo currentColor nên tự đổi theo theme.
// Mỗi icon là một chuỗi path SVG; nhiều nét ghép trong cùng một path.
export const ICONS = {
  // Thanh menu
  home: 'M3 10.5 12 3l9 7.5 M5 9v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9',
  book: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  check: 'M9 11l3 3 9-9 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  chart: 'M3 3v16a2 2 0 0 0 2 2h16 M8 17v-4 M13 17V8 M18 17v-7',
  heart: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z M3.5 12H9l1.5-3 2.5 5 1.5-2h6',
  pen: 'M12 20h9 M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M2 14h4 M10 8h4 M18 16h4',
  // Hoạt động
  bottle: 'M10.5 4.5V3.5a1.5 1.5 0 0 1 3 0v1 M8.5 4.5h7V7h-7z M8.5 7 7 9.5V19a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V9.5L15.5 7 M7 13h3 M7 17h3',
  breast: 'M8 2.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5 M3 21v-4a6 6 0 0 1 6-6h1 M15.5 10.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5 M7.5 17.5c3 2.6 8.8 2.6 12.5-1.5',
  pump: 'M5 3h14l-4.5 6v3h-5V9z M9 12h6v7.5a2.5 2.5 0 0 1-2.5 2.5h-1A2.5 2.5 0 0 1 9 19.5z M9 16h3',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z M16 3h4l-4 4h4',
  sun: 'M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M6.3 17.7l-1.4 1.4 M19.1 4.9l-1.4 1.4',
  poop: 'M9.5 8.5c0-2.5 1.5-4 3.5-5 .3 1.6 1.2 2.4 2 3.2.6.6.5 1.8-.3 1.8 M7 13c-1.6-.4-2-3.7.5-4.5h9c2.5.8 2.1 4.1.5 4.5 M5.5 20.5c-3-.4-2.6-6.5 1-7.5h11c3.6 1 4 7.1 1 7.5z',
  drop: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z M9 15.5a3 3 0 0 0 2.5 3',
  // Sức khỏe
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z M8.5 8.5l7 7',
  syringe: 'M18 2l4 4 M17 7l3-3 M19 9 8.7 19.3a2.4 2.4 0 0 1-3.4 0l-.6-.6a2.4 2.4 0 0 1 0-3.4L15 5 M9 11l4 4 M5 19l-3 3 M14 4l6 6',
  stetho: 'M5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 12 0V4a2 2 0 0 0-2-2h-1 M8 15v1a6 6 0 0 0 12 0v-4 M20 8a2 2 0 1 1 0 4a2 2 0 1 1 0-4',
  ruler: 'M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z M14.5 12.5l2-2 M11.5 9.5l2-2 M8.5 6.5l2-2 M17.5 15.5l2-2',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.9 1.9 0 0 0 3.4 0',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  // Trạng thái mũi tiêm, lịch khám
  done: 'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20 M8 12l3 3 5-6',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
  skip: 'M5 4l10 8-10 8z M19 5v14',
  minus: 'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20 M8 12h8',
  clock: 'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20 M12 6v6l4 2',
  // Cài đặt và khác
  baby: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18 M9 10h.01 M15 10h.01 M10 15a3.5 3.5 0 0 0 4 0 M12 3c-1.2 1.5-.6 3.2 1.2 3.2',
  family: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 1 0 8a4 4 0 1 1 0-8 M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 1 0 8a4 4 0 1 1 0-8',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4',
  shield: 'M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z M9 12l2 2 4-4',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22z M13.5 6.5h.01 M17.5 10.5h.01 M8.5 7.5h.01 M6.5 12.5h.01',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 7a2 2 0 1 1 0 4a2 2 0 1 1 0-4 M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 7l-10 6L2 7',
  note: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
};

const NS = 'http://www.w3.org/2000/svg';

// Trả về <svg class="i ..."> trang trí (aria-hidden). Chữ đi kèm nằm ngoài icon nên đọc màn hình vẫn đủ nghĩa.
export function icon(name, cls = '') {
  const d = ICONS[name];
  if (!d) throw new Error(`Không có icon "${name}"`);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls ? `i ${cls}` : 'i');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
