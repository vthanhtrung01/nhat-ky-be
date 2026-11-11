// Hàm thuần, không phụ thuộc trình duyệt hay Firebase. `at` luôn là mili-giây.

export const FEED_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const PUMP_INTERVAL_MS = 4 * 60 * 60 * 1000;
// Dự đoán cữ bú: dùng 3 ngày gần nhất, gộp các cữ cách nhau dưới 30 phút thành một phiên,
// cần ít nhất 8 khoảng cách để tin dữ liệu. Thiếu dữ liệu thì ước theo 140 ml/kg/ngày.
export const PREDICT_WINDOW_MS = 72 * 60 * 60 * 1000;
export const SESSION_GAP_MS = 30 * 60 * 1000;
export const MIN_INTERVALS = 8;
export const ML_PER_KG_DAY = 140;
const HOUR_MS = 60 * 60 * 1000;
const MAX_INTERVAL_MS = 6 * HOUR_MS;
const PREDICT_MIN_MS = 45 * 60 * 1000;
const PREDICT_MAX_MS = 5 * HOUR_MS;
const ROUND_MS = 5 * 60 * 1000;

export function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Dùng setDate thay vì cộng 24 giờ để đúng cả khi đổi giờ mùa hè.
export function addDays(dayStart, n) {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function eventsOfDay(events, dayStart) {
  const end = addDays(dayStart, 1);
  return events
    .filter((e) => e.at >= dayStart && e.at < end)
    .sort((a, b) => b.at - a.at);
}

// Cữ bú ghi trước khi tách loại sữa không có `milk`, coi là sữa công thức.
export function milkOf(e) {
  return e.milk === 'breast' ? 'breast' : 'formula';
}

// Giờ ngủ trong ngày: cắt theo ranh giới ngày (giấc qua nửa đêm chia cho hai ngày),
// giấc đang ngủ tính đến `now`. `sleeps` đếm các giấc bắt đầu trong ngày.
function sleepOfDay(events, dayStart, now) {
  const end = addDays(dayStart, 1);
  let sleeps = 0;
  let sleepMs = 0;
  for (const e of events) {
    if (e.type !== 'sleep') continue;
    if (e.at >= dayStart && e.at < end) sleeps++;
    const stop = Math.min(e.endAt ?? now, end);
    const start = Math.max(e.at, dayStart);
    if (stop > start) sleepMs += stop - start;
  }
  return { sleeps, sleepMs };
}

export function dayStats(events, dayStart, now = Date.now()) {
  const s = {
    totalMl: 0, feeds: 0, missingMl: 0, d3: 0, formulaMl: 0, formulaFeeds: 0, breastMl: 0, breastFeeds: 0,
    diapers: 0, dry: 0, wet: 0, pumpedMl: 0, pumps: 0, pumpMissingMl: 0,
    ...sleepOfDay(events, dayStart, now),
  };
  for (const e of eventsOfDay(events, dayStart)) {
    if (e.type === 'feed') {
      const milk = milkOf(e);
      s.feeds++;
      s[`${milk}Feeds`]++;
      if (e.d3) s.d3++;
      if (e.ml == null) s.missingMl++;
      else {
        s.totalMl += e.ml;
        s[`${milk}Ml`] += e.ml;
      }
    } else if (e.type === 'pump') {
      s.pumps++;
      if (e.ml == null) s.pumpMissingMl++;
      else s.pumpedMl += e.ml;
    } else if (e.type === 'diaper') {
      s.diapers++;
      if (e.diaper === 'dry') s.dry++;
      else s.wet++;
    }
  }
  return s;
}

function latestOf(events, type) {
  let latest = null;
  for (const e of events) {
    if (e.type === type && (!latest || e.at > latest.at)) latest = e;
  }
  return latest;
}

// Lần tiếp theo cách lần gần nhất cùng loại một khoảng `interval`. Trả về null khi chưa có lần nào.
function nextAfter(events, type, interval, now) {
  const last = latestOf(events, type);
  if (!last) return null;
  const at = last.at + interval;
  return { at, last, overdue: now >= at, remainingMs: at - now };
}

export function latestFeed(events) {
  return latestOf(events, 'feed');
}

// Không biết bé thức từ lúc nào nếu lần thức gần nhất đã quá lâu (có thể quên bấm Ngủ).
const AWAKE_UNKNOWN_MS = 4 * HOUR_MS;

// Giấc đang ngủ (chưa có giờ thức dậy), lấy giấc bắt đầu muộn nhất.
export function currentSleep(events, now) {
  let cur = null;
  for (const e of events) {
    if (e.type === 'sleep' && e.endAt == null && e.at <= now && (!cur || e.at > cur.at)) cur = e;
  }
  return cur;
}

// Mốc bé bắt đầu thức: giờ thức dậy của giấc gần nhất. null nếu đang ngủ hoặc không rõ.
export function awakeSince(events, now) {
  if (currentSleep(events, now)) return null;
  let since = null;
  for (const e of events) {
    if (e.type === 'sleep' && e.endAt != null && e.endAt <= now && (since == null || e.endAt > since)) since = e.endAt;
  }
  return since != null && now - since <= AWAKE_UNKNOWN_MS ? since : null;
}

// Cữ tiếp theo: khoảng cách = ml phiên bú gần nhất ÷ (cân nặng × 140 ml/kg/ngày ÷ 24 giờ),
// tính từ lúc bắt đầu phiên. Phiên gộp các cữ cách nhau dưới 30 phút (bú mẹ rồi bú thêm CT).
// Chưa có cân nặng hoặc phiên thiếu ml thì dùng mặc định 2 tiếng sau cữ gần nhất.
export function nextFeed(events, now, weightKg) {
  const next = nextAfter(events, 'feed', FEED_INTERVAL_MS, now);
  if (!next) return null;
  const session = mergeSessions(events.filter((e) => e.type === 'feed')).at(-1);
  if (!weightKg || session.ml == null || session.ml <= 0) return { ...next, basis: 'fixed' };
  const perHourMl = (weightKg * ML_PER_KG_DAY) / 24;
  const at = Math.round(session.at + (session.ml / perHourMl) * HOUR_MS);
  return { at, last: next.last, overdue: now >= at, remainingMs: at - now, basis: 'ml', ml: session.ml, perHourMl };
}

export function nextPump(events, now) {
  return nextAfter(events, 'pump', PUMP_INTERVAL_MS, now);
}

// Phân vị q (0..1) có trọng số: giá trị nhỏ nhất mà tổng trọng số tới đó đạt q phần.
export function weightedQuantile(values, weights, q) {
  const pairs = values.map((v, i) => [v, weights[i]]).sort((a, b) => a[0] - b[0]);
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let acc = 0;
  for (const [v, w] of pairs) {
    acc += w;
    if (acc >= q * total) return v;
  }
  return pairs.at(-1)[0];
}

function isNight(ms) {
  const hr = new Date(ms).getHours();
  return hr >= 22 || hr < 6;
}

// Cữ bú trong 72 giờ gần nhất, gộp cữ bắt đầu dưới 30 phút sau cữ trước (ví dụ bú mẹ rồi bú thêm CT).
// ml phiên là null nếu có cữ chưa nhập ml.
function feedSessions(events, now) {
  return mergeSessions(events.filter((e) => e.type === 'feed' && e.at <= now && e.at > now - PREDICT_WINDOW_MS));
}

function mergeSessions(feedList) {
  const feeds = [...feedList].sort((a, b) => a.at - b.at);
  const sessions = [];
  let lastAt = -Infinity;
  for (const e of feeds) {
    const cur = sessions.at(-1);
    if (cur && e.at - lastAt < SESSION_GAP_MS) {
      cur.ml = cur.ml == null || e.ml == null ? null : cur.ml + e.ml;
    } else {
      sessions.push({ at: e.at, ml: e.ml });
    }
    lastAt = e.at;
  }
  return sessions;
}

// Khoảng giờ dự kiến bé đòi bú tiếp. Ưu tiên tính theo ml cữ trước, rồi theo khoảng cách các cữ,
// cuối cùng theo cân nặng. Trả về null khi chưa đủ dữ liệu.
export function predictNextFeed(events, now, weightKg) {
  const sessions = feedSessions(events, now);
  const last = sessions.at(-1);
  if (!last) return null;

  const gaps = [];
  for (let i = 1; i < sessions.length; i++) {
    const prev = sessions[i - 1];
    const ms = sessions[i].at - prev.at;
    if (ms > MAX_INTERVAL_MS) continue;
    gaps.push({ ms, ml: prev.ml, night: isNight(prev.at), weight: now - prev.at <= 24 * HOUR_MS ? 1 : 0.5 });
  }
  const sameGroup = gaps.filter((g) => g.night === isNight(last.at));

  let range = null;
  let basis = null;
  let count = 0;
  const withMl = sameGroup.filter((g) => g.ml != null);
  if (last.ml != null && withMl.length >= MIN_INTERVALS) {
    // Tốc độ tiêu sữa (ml/ms): bé bú nhiều thì cữ sau đến muộn hơn.
    const rates = withMl.map((g) => g.ml / g.ms);
    const w = withMl.map((g) => g.weight);
    range = [last.ml / weightedQuantile(rates, w, 0.75), last.ml / weightedQuantile(rates, w, 0.25)];
    basis = 'ml';
    count = withMl.length;
  } else {
    const pool = sameGroup.length >= MIN_INTERVALS ? sameGroup : gaps;
    if (pool.length >= MIN_INTERVALS) {
      const ms = pool.map((g) => g.ms);
      const w = pool.map((g) => g.weight);
      range = [weightedQuantile(ms, w, 0.25), weightedQuantile(ms, w, 0.75)];
      basis = 'history';
      count = pool.length;
    } else if (weightKg && last.ml != null) {
      const perMs = (weightKg * ML_PER_KG_DAY) / (24 * HOUR_MS);
      const mid = last.ml / perMs;
      range = [mid * 0.8, mid * 1.2];
      basis = 'weight';
    }
  }
  if (!range) return null;

  const clamp = (ms) => Math.min(PREDICT_MAX_MS, Math.max(PREDICT_MIN_MS, ms));
  const round = (ms) => Math.round(ms / ROUND_MS) * ROUND_MS;
  return { from: round(last.at + clamp(range[0])), to: round(last.at + clamp(range[1])), basis, count };
}

// Vitamin D3 pha vào sữa mỗi ngày một lần, nên vào cữ bú thứ 1 hoặc thứ 2.
// `feeds` là các cữ hôm nay theo thứ tự thời gian.
export function vitaminD3Status(events, now) {
  const feeds = eventsOfDay(events, startOfDay(now)).filter((e) => e.type === 'feed').reverse();
  const feed = feeds.find((e) => e.d3);
  if (feed) return { given: true, feed, feeds };
  if (feeds.length === 0) return { given: false, due: 'first', feeds };
  if (feeds.length === 1) return { given: false, due: 'second', feeds };
  return { given: false, missed: true, feeds };
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} tiếng` : `${h}h${String(m).padStart(2, '0')}`;
}

// Đếm theo ngày lịch: ngày sinh là 0, sáng hôm sau là 1 ngày tuổi. Làm tròn để đúng cả khi đổi giờ mùa hè.
export function ageInDays(birth, now) {
  return Math.round((startOfDay(now) - startOfDay(birth)) / (24 * 60 * 60 * 1000));
}

export function ageLabel(days) {
  if (days <= 0) return 'Chào đời hôm nay';
  if (days < 7) return `${days} ngày tuổi`;
  const w = Math.floor(days / 7);
  const d = days % 7;
  return `${days} ngày tuổi (${w} tuần${d ? ` ${d} ngày` : ''})`;
}

export function reminderLabel(next) {
  if (!next.overdue) {
    return `còn ${formatDuration(Math.ceil(next.remainingMs / 60000))}`;
  }
  const late = Math.floor(-next.remainingMs / 60000);
  return late === 0 ? 'Đến giờ rồi' : `Trễ ${formatDuration(late)}`;
}

export function weekSeries(events, now) {
  const today = startOfDay(now);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    days.push({ day, isToday: i === 0, ...dayStats(events, day, now) });
  }
  return days;
}

// Lượng sữa cộng dồn trong 24h tính từ `start`, theo giờ (0–24), dạng bậc thang:
// mỗi cữ có ml là một bước nhảy. Kéo đến giờ hiện tại, hoặc đến hết 24h nếu khung đã qua. Cữ thiếu ml bỏ qua.
export function cumulativeMl(events, start, now) {
  const end = start + 24 * HOUR_MS;
  const hourOf = (ms) => (ms - start) / HOUR_MS;
  const feeds = events
    .filter((e) => e.type === 'feed' && e.ml != null && e.at >= start && e.at < end)
    .sort((a, b) => a.at - b.at);
  const points = [[0, 0]];
  let total = 0;
  for (const e of feeds) {
    if (e.at > now) break;
    points.push([hourOf(e.at), total]);
    total += e.ml;
    points.push([hourOf(e.at), total]);
  }
  points.push([hourOf(Math.min(now, end)), total]);
  return { points, total };
}

// Mức cao nhất của trục dọc, làm tròn theo 1/2/5 x 10^n.
export function niceMax(value) {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 5, 10]) {
    if (value <= m * pow) return m * pow;
  }
  return 10 * pow;
}

// Giá trị cho <input type="datetime-local">, theo giờ của máy.
export function toLocalInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function toDateInput(ms) {
  return toLocalInput(ms).slice(0, 10);
}

export function parseMl(text) {
  const n = Number(String(text).trim());
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
}

// Cân nặng tính bằng kg, chấp nhận dấu phẩy thập phân, làm tròn 2 chữ số.
export function parseWeight(text, max = 10) {
  const s = String(text).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 1.5 && n <= max ? Math.round(n * 100) / 100 : null;
}

// Chiều dài tính bằng cm, làm tròn 1 chữ số.
export function parseLength(text) {
  const s = String(text).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 40 && n <= 100 ? Math.round(n * 10) / 10 : null;
}

// Ngày hiển thị kiểu Việt Nam dd/mm/yyyy, còn bên trong dùng yyyy-mm-dd như ô date của trình duyệt.
export function isoToVnDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Nhận d/m/yyyy, d-m-yyyy, d.m.yyyy hoặc ddmmyyyy. Ngày không tồn tại (vd. 31/02) trả null.
export function vnDateToIso(text) {
  const s = (text ?? '').trim();
  const m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/.exec(s) || /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
