import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEED_INTERVAL_MS, PUMP_INTERVAL_MS, isoToVnDate, vnDateToIso, mlPerKgOf, parseMlPerKg, axisStart, addDays, ageInDays, cumulativeMl, ageLabel, awakeSince, currentSleep, dayStats, eventsOfDay, formatDuration, milkOf, nextFeed, nextPump, niceMax,
  parseLength, parseMl, parseWeight, predictNextFeed, reminderLabel, startOfDay, toLocalInput, vitaminD3Status, weekSeries, weightedQuantile,
} from '../js/stats.js';

const at = (h, m = 0, day = 15) => new Date(2026, 5, day, h, m).getTime();
const feed = (time, ml = 60) => ({ type: 'feed', at: time, ml, diaper: null, by: 'me' });
const breast = (time, ml = 60) => ({ ...feed(time, ml), milk: 'breast' });
const diaper = (time, kind) => ({ type: 'diaper', at: time, ml: null, diaper: kind, by: 'ba' });
const pump = (time, ml = 100) => ({ type: 'pump', at: time, ml, diaper: null, by: 'me' });
const today = startOfDay(at(12));

test('tổng trong ngày cộng ml và đếm tã theo loại', () => {
  const s = dayStats([feed(at(2), 60), feed(at(5), 90), diaper(at(3), 'dry'), diaper(at(6), 'wet'), diaper(at(7), 'wet')], today);
  assert.deepEqual(s, {
    totalMl: 150, feeds: 2, missingMl: 0, d3: 0, formulaMl: 150, formulaFeeds: 2, breastMl: 0, breastFeeds: 0,
    diapers: 3, dry: 1, wet: 2, pumpedMl: 0, pumps: 0, pumpMissingMl: 0, sleeps: 0, sleepMs: 0,
  });
});

test('cữ chưa có ml vẫn tính vào số cữ, không cộng vào tổng ml', () => {
  const s = dayStats([feed(at(2), null), feed(at(5), 90)], today);
  assert.equal(s.feeds, 2);
  assert.equal(s.missingMl, 1);
  assert.equal(s.totalMl, 90);
});

test('tách ml theo sữa công thức và sữa mẹ, cữ cũ không có loại tính là công thức', () => {
  const s = dayStats([feed(at(2), 60), { ...feed(at(4), 30), milk: 'formula' }, breast(at(5), 80), breast(at(7), null)], today);
  assert.equal(s.totalMl, 170);
  assert.equal(s.feeds, 4);
  assert.equal(s.formulaMl, 90);
  assert.equal(s.formulaFeeds, 2);
  assert.equal(s.breastMl, 80);
  assert.equal(s.breastFeeds, 2);
  assert.equal(s.missingMl, 1);
});

test('milkOf: thiếu hoặc null là sữa công thức', () => {
  assert.equal(milkOf(feed(at(2))), 'formula');
  assert.equal(milkOf({ ...feed(at(2)), milk: null }), 'formula');
  assert.equal(milkOf(breast(at(2))), 'breast');
});

test('nhắc cữ tính theo cữ gần nhất, bất kể loại sữa', () => {
  assert.equal(nextFeed([feed(at(12)), breast(at(14))], at(15)).at, at(16));
  assert.equal(nextFeed([breast(at(12)), feed(at(14))], at(15)).at, at(16));
});

test('hút sữa tính riêng, không cộng vào sữa bé bú', () => {
  const s = dayStats([feed(at(2), 60), pump(at(3), 120), pump(at(6), null)], today);
  assert.equal(s.totalMl, 60);
  assert.equal(s.feeds, 1);
  assert.equal(s.pumpedMl, 120);
  assert.equal(s.pumps, 2);
  assert.equal(s.pumpMissingMl, 1);
});

test('hút sữa không làm đổi cữ bú tiếp theo', () => {
  assert.equal(nextFeed([feed(at(14)), pump(at(15))], at(15)).at, at(16));
  assert.equal(nextFeed([pump(at(15))], at(15)), null);
});

test('ranh giới nửa đêm: 00:00 thuộc ngày mới, 23:59 thuộc ngày cũ', () => {
  const events = [feed(at(23, 59, 14), 10), feed(at(0, 0, 15), 20), feed(at(23, 59, 15), 30), feed(at(0, 0, 16), 40)];
  assert.equal(dayStats(events, today).totalMl, 50);
  assert.deepEqual(eventsOfDay(events, today).map((e) => e.ml), [30, 20]);
});

test('bú lúc 2pm thì cữ sau là 4pm', () => {
  const next = nextFeed([feed(at(14))], at(14, 40));
  assert.equal(next.at, at(16));
  assert.equal(next.overdue, false);
  assert.equal(reminderLabel(next), 'còn 1h20');
});

test('cữ tiếp theo tính lại đúng khi sửa, xóa hoặc thêm cữ cũ', () => {
  const a = feed(at(14));
  const b = feed(at(10));
  assert.equal(nextFeed([b, a], at(15)).at, at(16), 'thêm cữ cũ không đổi cữ mới nhất');
  assert.equal(nextFeed([b], at(15)).at, at(12), 'xóa cữ mới nhất lùi về cữ trước');
  assert.equal(nextFeed([{ ...a, at: at(15) }, b], at(15)).at, at(17), 'sửa giờ cữ mới nhất');
  assert.equal(nextFeed([diaper(at(14), 'wet')], at(15)), null, 'tã không tính là cữ bú');
  assert.equal(nextFeed([], at(15)), null);
});

test('nhãn nhắc khi đến giờ và khi trễ', () => {
  const events = [feed(at(14))];
  assert.equal(reminderLabel(nextFeed(events, at(16))), 'Đến giờ rồi');
  assert.equal(reminderLabel(nextFeed(events, at(16, 10))), 'Trễ 10 phút');
  assert.equal(reminderLabel(nextFeed(events, at(17, 5))), 'Trễ 1h05');
  assert.equal(nextFeed(events, at(16)).overdue, true);
  assert.equal(nextFeed(events, at(16) - 1).overdue, false);
  assert.equal(reminderLabel(nextFeed(events, at(16) - 1)), 'còn 1 phút');
  assert.equal(FEED_INTERVAL_MS, 7200000);
});

test('có cân nặng: khoảng cách = ml cữ trước ÷ (cân nặng × 140 ÷ 24)', () => {
  // 3.5 kg → 490 ml/ngày; 75 ml ≈ 3h40m25s.
  const next = nextFeed([feed(at(9), 75)], at(10), 3.5, 140);
  assert.equal(next.basis, 'ml');
  assert.equal(next.ml, 75);
  assert.equal(next.at, at(9) + Math.round((75 / (490 / 24)) * 3600000));
  assert.equal(reminderLabel(next), 'còn 2h41');
  // 4 kg → 560 ml/ngày; 70 ml đúng 3 tiếng.
  assert.equal(nextFeed([feed(at(9), 70)], at(10), 4, 140).at, at(12));
  assert.equal(reminderLabel(nextFeed([feed(at(9), 70)], at(12, 15), 4, 140)), 'Trễ 15 phút');
});

test('cữ bú thêm dưới 30 phút được cộng ml, tính từ giờ bắt đầu', () => {
  const events = [breast(at(9), 40), feed(at(9, 20), 30)];
  const next = nextFeed(events, at(10), 4, 140);
  assert.equal(next.ml, 70);
  assert.equal(next.at, at(12));
  assert.equal(next.last.at, at(9, 20), 'dòng Cữ trước vẫn là cữ mới nhất');
  const apart = nextFeed([feed(at(9), 70), feed(at(9, 30), 35)], at(10), 4, 140);
  assert.equal(apart.ml, 35, 'cách 30 phút là cữ riêng');
  assert.equal(apart.at, at(11));
});

test('thiếu cân nặng hoặc ml thì nhắc sau 2 tiếng', () => {
  assert.equal(nextFeed([feed(at(9), 75)], at(10)).basis, 'fixed');
  assert.equal(nextFeed([feed(at(9), 75)], at(10)).at, at(11));
  assert.equal(nextFeed([feed(at(9), null)], at(10), 3.5, 140).at, at(11));
  assert.equal(nextFeed([feed(at(9), 40), breast(at(9, 10), null)], at(10), 3.5, 140).at, at(11, 10));
  assert.equal(nextFeed([feed(at(9), 0)], at(10), 3.5, 140).basis, 'fixed');
});

test('hút sữa lúc 9am thì nhắc hút tiếp lúc 1pm', () => {
  const next = nextPump([pump(at(9))], at(10));
  assert.equal(next.at, at(13));
  assert.equal(next.overdue, false);
  assert.equal(reminderLabel(next), 'còn 3 tiếng');
  assert.equal(PUMP_INTERVAL_MS, 14400000);
});

test('nhắc hút sữa chỉ tính lần hút mới nhất, bỏ qua bú và tã', () => {
  assert.equal(nextPump([pump(at(6)), pump(at(9)), feed(at(11)), diaper(at(12), 'wet')], at(12)).at, at(13));
  assert.equal(nextPump([feed(at(11)), diaper(at(12), 'dry')], at(12)), null);
  assert.equal(nextPump([], at(12)), null);
  const late = nextPump([pump(at(9))], at(14, 10));
  assert.equal(late.overdue, true);
  assert.equal(reminderLabel(late), 'Trễ 1h10');
});

const BIRTH_AT = new Date(2026, 9, 28, 7, 0).getTime();

test('ngày tuổi đếm theo ngày lịch', () => {
  const day = (m, d, h = 12) => new Date(2026, m - 1, d, h).getTime();
  assert.equal(ageInDays(BIRTH_AT, day(10, 28, 23)), 0);
  assert.equal(ageInDays(BIRTH_AT, day(10, 29, 1)), 1);
  assert.equal(ageInDays(BIRTH_AT, day(11, 3)), 6);
  assert.equal(ageInDays(BIRTH_AT, day(11, 11)), 14);
  assert.equal(ageLabel(0), 'Chào đời hôm nay');
  assert.equal(ageLabel(6), '6 ngày tuổi');
  assert.equal(ageLabel(14), '14 ngày tuổi (2 tuần)');
  assert.equal(ageLabel(17), '17 ngày tuổi (2 tuần 3 ngày)');
});

test('định dạng thời lượng', () => {
  assert.equal(formatDuration(5), '5 phút');
  assert.equal(formatDuration(60), '1 tiếng');
  assert.equal(formatDuration(125), '2h05');
});

test('dữ liệu 7 ngày gồm đủ ngày trống và kết thúc ở hôm nay', () => {
  const week = weekSeries([feed(at(9), 100), feed(at(9, 0, 9), 50), feed(at(9, 0, 8), 999)], at(12));
  assert.equal(week.length, 7);
  assert.equal(week[6].day, today);
  assert.equal(week[6].isToday, true);
  assert.equal(week[6].totalMl, 100);
  assert.equal(week[0].totalMl, 50);
  assert.equal(week[3].totalMl, 0);
});

test('addDays đi qua ranh giới tháng', () => {
  assert.equal(addDays(startOfDay(new Date(2026, 5, 30).getTime()), 1), new Date(2026, 6, 1).getTime());
});

test('niceMax làm tròn lên', () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(430), 500);
  assert.equal(niceMax(500), 500);
  assert.equal(niceMax(510), 1000);
});

test('toLocalInput theo giờ máy', () => {
  assert.equal(toLocalInput(at(14, 5)), '2026-06-15T14:05');
});

test('parseMl chỉ nhận số nguyên 1-500', () => {
  assert.equal(parseMl(' 90 '), 90);
  for (const bad of ['', '0', '501', '12.5', 'abc', '-5']) assert.equal(parseMl(bad), null, bad);
});

test('D3: chưa có cữ thì nhắc cữ đầu, có 1 cữ thì nhắc cữ thứ 2', () => {
  assert.equal(vitaminD3Status([], at(6)).due, 'first');
  const s = vitaminD3Status([feed(at(2))], at(6));
  assert.equal(s.given, false);
  assert.equal(s.due, 'second');
});

test('D3: qua 2 cữ mà chưa pha thì báo đã lỡ', () => {
  const s = vitaminD3Status([feed(at(2)), feed(at(5))], at(6));
  assert.equal(s.missed, true);
  assert.deepEqual(s.feeds.map((e) => e.at), [at(2), at(5)]);
});

test('D3: cữ có d3 trong hôm nay thì coi là đã cho', () => {
  const given = { ...feed(at(5)), d3: true };
  const s = vitaminD3Status([feed(at(2)), given, feed(at(8))], at(9));
  assert.equal(s.given, true);
  assert.equal(s.feed, given);
  assert.equal(dayStats([feed(at(2)), given], today).d3, 1);
});

test('D3 của hôm qua không tính cho hôm nay', () => {
  const s = vitaminD3Status([{ ...feed(at(8, 0, 14)), d3: true }], at(6));
  assert.equal(s.given, false);
  assert.equal(s.due, 'first');
});

// Cữ đều đặn: `n` cữ cách nhau `gapH` tiếng, cữ cuối lúc `end`.
const series = (end, gapH, n, ml = null) => Array.from({ length: n }, (_, i) => feed(end - (n - 1 - i) * gapH * 3600000, ml));

test('dự đoán: chưa có cữ hoặc thiếu dữ liệu và chưa có cân nặng thì trả về null', () => {
  assert.equal(predictNextFeed([], at(12)), null);
  assert.equal(predictNextFeed(series(at(10), 3, 3, 60), at(10, 30)), null);
});

test('dự đoán theo cân nặng khi chưa đủ dữ liệu', () => {
  // 3.62 kg x 140 ml/ngày ≈ 21.1 ml/giờ, 60 ml ≈ 2h50, ±20% rồi làm tròn 5 phút.
  const p = predictNextFeed(series(at(10), 3, 2, 60), at(10, 30), 3.62, 140);
  assert.equal(p.basis, 'weight');
  assert.equal(p.from, at(12, 15));
  assert.equal(p.to, at(13, 25));
});

test('dự đoán theo khoảng cách khi không có ml', () => {
  const p = predictNextFeed(series(at(12), 3, 20), at(12, 30), 3.62, 140);
  assert.equal(p.basis, 'history');
  assert.equal(p.from, at(15));
  assert.equal(p.to, at(15));
});

test('dự đoán gộp cữ bú thêm trong 30 phút và bỏ khoảng trên 6 tiếng', () => {
  const regular = series(at(12), 3, 10);
  const topUps = regular.map((e) => breast(e.at + 15 * 60000, null));
  const old = feed(regular[0].at - 8 * 3600000, null);
  const p = predictNextFeed([old, ...regular, ...topUps], at(12, 30));
  assert.equal(p.basis, 'history');
  assert.equal(p.count, 9);
  assert.equal(p.from, at(15));
  assert.equal(p.to, at(15));
});

test('dự đoán tách đêm và ngày', () => {
  const events = [];
  for (const day of [12, 13, 14, 15]) {
    for (const hr of [1, 4, 7, 9, 11, 13, 15, 17, 19, 21, 22]) events.push(feed(at(hr, 0, day), null));
  }
  const night = predictNextFeed(events, at(22, 30, 15));
  assert.equal(night.from, at(1, 0, 16));
  assert.equal(night.to, at(1, 0, 16));
  const day = predictNextFeed(events, at(13, 30, 15));
  assert.equal(day.from, at(15, 0, 15));
  assert.equal(day.to, at(15, 0, 15));
});

test('dự đoán theo ml: bú nhiều thì cữ sau đến muộn hơn, kẹp tối đa 5 tiếng', () => {
  // Lịch sử 60 ml mỗi 3 tiếng = 20 ml/giờ.
  const history = series(at(9), 3, 20, 60);
  const big = predictNextFeed([...history, feed(at(12), 80)], at(12, 30));
  assert.equal(big.basis, 'ml');
  assert.equal(big.from, at(16));
  assert.equal(big.to, at(16));
  const small = predictNextFeed([...history, feed(at(12), 40)], at(12, 30));
  assert.equal(small.from, at(14));
  const huge = predictNextFeed([...history, feed(at(12), 200)], at(12, 30));
  assert.equal(huge.to, at(17));
});

test('phân vị có trọng số', () => {
  assert.equal(weightedQuantile([3, 1, 2, 4], [1, 1, 1, 1], 0.25), 1);
  assert.equal(weightedQuantile([3, 1, 2, 4], [1, 1, 1, 1], 0.75), 3);
  assert.equal(weightedQuantile([1, 10], [1, 3], 0.5), 10);
});

test('đọc cân nặng', () => {
  assert.equal(parseWeight('3.62'), 3.62);
  assert.equal(parseWeight(' 3,62 '), 3.62);
  assert.equal(parseWeight('1.5'), 1.5);
  assert.equal(parseWeight('10'), 10);
  for (const bad of ['', 'abc', '-3', '1.4', '10.1']) assert.equal(parseWeight(bad), null, bad);
});
test('cân nặng của lần cân đo cho phép tới 20 kg', () => {
  assert.equal(parseWeight('12.5', 20), 12.5);
  assert.equal(parseWeight('20.1', 20), null);
});

test('đọc chiều dài', () => {
  assert.equal(parseLength('52.34'), 52.3);
  assert.equal(parseLength(' 49,5 '), 49.5);
  for (const bad of ['', 'abc', '39.9', '100.1']) assert.equal(parseLength(bad), null, bad);
});

test('giấc đang ngủ và mốc thức dậy', () => {
  const sleep = (from, to = null) => ({ type: 'sleep', at: from, endAt: to, ml: null, diaper: null, by: 'me' });
  const events = [sleep(at(8), at(9)), sleep(at(10))];
  assert.equal(currentSleep(events, at(10, 30)).at, at(10));
  assert.equal(awakeSince(events, at(10, 30)), null);
  assert.equal(awakeSince([sleep(at(8), at(9))], at(9, 20)), at(9));
  // Thức quá 4 tiếng thì coi như không rõ (có thể quên bấm Ngủ).
  assert.equal(awakeSince([sleep(at(8), at(9))], at(13, 30)), null);
});

test('sữa cộng dồn 24h tính từ mốc bắt đầu, dạng bậc thang', () => {
  const events = [feed(at(9), 90), feed(at(3), 60), feed(at(5), null), feed(at(2, 0, 16), 40), feed(at(4, 0, 16), 999), diaper(at(4), 'wet')];
  assert.deepEqual(cumulativeMl(events, at(3), at(12)), {
    points: [[0, 0], [0, 0], [0, 60], [6, 60], [6, 150], [9, 150]],
    total: 150,
  });
  // Cữ hôm sau trước mốc + 24h vẫn tính; khung đã qua kéo đến hết 24 giờ.
  assert.deepEqual(cumulativeMl(events, at(3), at(12, 0, 17)).points.at(-1), [24, 190]);
});

test('ngày kiểu Việt Nam dd/mm/yyyy', () => {
  assert.equal(isoToVnDate('2026-10-28'), '28/10/2026');
  assert.equal(isoToVnDate(''), '');
  assert.equal(vnDateToIso('28/10/2026'), '2026-10-28');
  assert.equal(vnDateToIso('5/1/2027'), '2027-01-05');
  assert.equal(vnDateToIso('05-01-2027'), '2027-01-05');
  assert.equal(vnDateToIso('05.01.2027'), '2027-01-05');
  assert.equal(vnDateToIso('05012027'), '2027-01-05');
  assert.equal(vnDateToIso('31/02/2027'), null);
  assert.equal(vnDateToIso('10/28/2026'), null);
  assert.equal(vnDateToIso('abc'), null);
});

test('hệ số ml/kg/ngày: mặc định 150, mỗi nhà tự đặt trong 100–200', () => {
  // 3.6 kg × 150 = 540 ml/ngày = 22.5 ml/giờ, 90 ml → 4 giờ.
  assert.equal(nextFeed([feed(at(9), 90)], at(10), 3.6).at, at(13));
  assert.equal(nextFeed([feed(at(9), 90)], at(10), 3.6, 120).at, at(14));
  assert.equal(mlPerKgOf({}), 150);
  assert.equal(mlPerKgOf(null), 150);
  assert.equal(mlPerKgOf({ mlPerKg: 140 }), 140);
  assert.equal(mlPerKgOf({ mlPerKg: 300 }), 150);
  assert.equal(mlPerKgOf({ mlPerKg: 150.5 }), 150);
  assert.equal(parseMlPerKg('150'), 150);
  assert.equal(parseMlPerKg(' 100 '), 100);
  assert.equal(parseMlPerKg('99'), null);
  assert.equal(parseMlPerKg('201'), null);
  assert.equal(parseMlPerKg('abc'), null);
  assert.equal(parseMlPerKg('150.5'), null);
});

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('trục thời gian bắt đầu ở T0 để cữ đầu chạm đường mục tiêu từ gốc tọa độ', () => {
  const start = at(0);
  const cur = cumulativeMl([feed(at(16), 80), feed(at(17), 60)], start, at(17, 30));
  const t0 = axisStart(cur.points, 507);
  close(t0, (507 * 16 - 24 * 80) / (507 - 80));
  // Cữ đầu (16h, 80 ml) nằm trên đường từ (T0, 0) đến (24h, 507).
  close((507 * (16 - t0)) / (24 - t0), 80);
  assert.equal(axisStart(cumulativeMl([], start, at(9)).points, 507), 0);
  assert.equal(axisStart(cur.points, null), 0);
  assert.equal(axisStart(cumulativeMl([feed(at(8), 600)], start, at(9)).points, 507), 0);
});
