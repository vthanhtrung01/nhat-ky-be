import { firebaseConfig } from './firebase-config.js';
import {
  FEED_INTERVAL_MS, ML_PER_KG_DEFAULT, ML_PER_KG_MAX, ML_PER_KG_MIN, mlPerKgOf, parseMlPerKg, addDays, ageInDays, ageLabel, cumulativeMl, axisStart, currentSleep, dayStats, nextFeed, predictNextFeed, reminderLabel, eventsOfDay, formatDuration, milkOf, niceMax, parseLength, parseMl,
  isoToVnDate, vnDateToIso, parseWeight, startOfDay, toDateInput, toLocalInput, vitaminD3Status, weekSeries,
} from './stats.js';
import {
  CURVES, MAX_MONTHS, ageMonths, growthPoints, latestWeight, lmsAt, percentileOf, tablesFor, valueAtZ,
} from './growth.js';
import { NOTE_MAX, PROGRAMS, groupByMilestone, vaccinePlan, vaccinesToRemind } from './vaccines.js';
import { TODO_MAX, cleanTask, splitTodos } from './todos.js';
import {
  PLACE_MAX, TEXT_MAX, appointmentStatus, daysUntil, nextAppointment, splitAppointments,
} from './appointments.js';
import { canListen, listen } from './voice.js';
import {
  NAME_MAX, RELATIONS, SEX, cleanName, inviteUrl, isLastOwner, memberLabel, parseBirth, parseInvite, randomHex,
} from './members.js';

const MILK = {
  formula: { feed: true, name: 'cữ sữa công thức', verb: 'bú', question: 'Bé bú bao nhiêu ml?', chips: [30, 60, 90, 120, 150] },
  breast: { feed: true, name: 'cữ sữa mẹ', verb: 'bú', question: 'Bé bú bao nhiêu ml?', chips: [30, 60, 90, 120, 150] },
  pump: { name: 'lần hút sữa', verb: 'hút', question: 'Hút được bao nhiêu ml?', chips: [50, 80, 100, 120, 150] },
};
const THEMES = { time: 'Tự động (tối từ 20h đến 6h)', auto: 'Theo điện thoại', light: 'Sáng', dark: 'Tối' };
const TICK_MS = 30000;

const $view = document.getElementById('view');
const $tabs = document.getElementById('tabs');
const $toast = document.getElementById('toast');
const $dialog = document.getElementById('dialog');
const $banners = document.getElementById('banners');

const state = {
  backend: null,
  store: null,
  user: null,
  uid: null,
  familyId: null,
  family: null,
  members: [],
  requests: [],
  stops: [],
  loaded: { members: false, profile: false },
  pendingEmailLink: null,
  tab: 'today',
  recent: [],
  historyDay: startOfDay(Date.now()),
  historyEvents: [],
  stopHistory: null,
  syncError: false,
  post: null,
  todos: [],
  listening: null,
  profile: {},
  measurements: [],
  vaccines: [],
  showAllVaccines: false,
  appointments: [],
};

function get(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Trình duyệt chặn lưu trữ: app vẫn chạy trong phiên hiện tại.
  }
}

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k.startsWith('aria-') || k === 'for') el.setAttribute(k, v);
    else el[k] = v;
  }
  el.append(...children.flat(Infinity).filter((c) => c != null));
  return el;
}

const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtDay = (ms) => new Date(ms).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });
const fmtShortDay = (ms) => new Date(ms).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
const fmtWeekday = (ms) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(ms).getDay()];

const MILK_LABEL = { formula: 'Sữa công thức', breast: 'Sữa mẹ' };
const fmtMinutes = (ms) => formatDuration(Math.max(0, Math.round(ms / 60000)));

// Thông tin sau cữ bú: giúp biết bé quấy vì đầy hơi, trớ hay vì lý do khác.
const AFTER_FEED = [
  { key: 'burp', label: 'Ợ hơi', options: [['yes', 'Đã ợ'], ['no', 'Chưa ợ']] },
  { key: 'spit', label: 'Trớ sữa', options: [['none', 'Không'], ['little', 'Trớ ít'], ['lot', 'Trớ nhiều']] },
  { key: 'after', label: 'Sau bú', options: [['asleep', 'Ngủ luôn'], ['calm', 'Thức, yên'], ['fussy', 'Quấy khóc']] },
];
const AFTER_TAG = {
  burp: { yes: 'ợ ✓', no: 'chưa ợ' },
  spit: { little: 'trớ ít', lot: 'trớ nhiều' },
  after: { asleep: 'ngủ luôn', fussy: 'quấy' },
};

const who = (uid) => memberLabel(state.members, uid);
const birthAt = () => state.profile.birthAt ?? Date.now();
const babyName = () => state.profile.name || 'Bé';
const mlPerKg = () => mlPerKgOf(state.profile);
const isOwner = () => state.members.some((m) => m.uid === state.uid && m.role === 'owner');

function babyLine() {
  return h('p', { class: 'age' }, `👶 ${babyName()} ${ageLabel(ageInDays(birthAt(), Date.now()))}`);
}

function eventIcon(e) {
  if (e.type === 'feed') return milkOf(e) === 'breast' ? '🤱' : '🍼';
  if (e.type === 'pump') return '🥛';
  if (e.type === 'sleep') return '😴';
  // Giá trị 'dry' trong dữ liệu nghĩa là tã ị (giữ tên cũ để không phải chuyển dữ liệu).
  return e.diaper === 'dry' ? '💩' : '💧';
}

function eventTitle(e) {
  if (e.type === 'feed') {
    const label = MILK_LABEL[milkOf(e)];
    return e.ml == null ? label : `${label} ${e.ml} ml`;
  }
  if (e.type === 'pump') return e.ml == null ? 'Hút sữa' : `Hút sữa ${e.ml} ml`;
  if (e.type === 'sleep') {
    return e.endAt == null ? 'Đang ngủ' : `Ngủ ${fmtMinutes(e.endAt - e.at)}, dậy ${fmtTime(e.endAt)}`;
  }
  return e.diaper === 'dry' ? 'Tã ị' : 'Tã ướt';
}

// Thay nội dung màn hình, bỏ các phần null (thẻ không có gì để hiện).
function show(...nodes) {
  $view.replaceChildren(...nodes.flat(Infinity).filter((c) => c != null));
}

let toastTimer;
function toast(message, undo) {
  clearTimeout(toastTimer);
  $toast.replaceChildren(h('span', {}, message));
  if (undo) {
    $toast.append(h('button', {
      onclick: () => {
        undo();
        $toast.hidden = true;
      },
    }, 'Hoàn tác'));
  }
  $toast.hidden = false;
  toastTimer = setTimeout(() => { $toast.hidden = true; }, undo ? 6000 : 3000);
}

function renderBanners() {
  const list = [];
  if (state.store?.isDemo) {
    list.push(h('div', { class: 'banner' }, 'Chế độ thử: dữ liệu chỉ nằm trên máy này, chưa đồng bộ.'));
  }
  if (!navigator.onLine) {
    list.push(h('div', { class: 'banner' }, 'Đang mất mạng. Dữ liệu vẫn được lưu và sẽ tự đồng bộ khi có mạng.'));
  }
  if (state.syncError) {
    list.push(h('div', { class: 'banner err' }, 'Không đọc được dữ liệu. Hãy kiểm tra mạng hoặc mở lại app.'));
  }
  $banners.replaceChildren(...list);
}

// ---------- Ô ngày dd/mm/yyyy ----------

// Ô date của trình duyệt hiện theo ngôn ngữ máy (máy tiếng Anh ra tháng trước ngày), nên app dùng
// ô chữ dd/mm/yyyy, kèm nút 📅 là ô date gốc trong suốt phủ lên để mở lịch của máy.
// .value đọc/ghi dạng yyyy-mm-dd như ô date gốc ('' nếu trống hoặc sai).
function dateField({ value = '', min, max, required = false, id, label = 'Ngày', onchange } = {}) {
  const native = h('input', { type: 'date', class: 'date-native', tabIndex: -1, 'aria-hidden': 'true' });
  if (min) native.min = min;
  if (max) native.max = max;
  native.value = value;
  const text = h('input', {
    type: 'text', inputMode: 'numeric', autocomplete: 'off', placeholder: 'dd/mm/yyyy', maxLength: 10,
    required, value: isoToVnDate(value), 'aria-label': label,
  });
  if (id) text.id = id;
  let wrap;
  const emit = () => onchange?.(wrap.value);
  // Tự thêm dấu / khi gõ số.
  text.addEventListener('input', (ev) => {
    if (ev.inputType?.startsWith('delete') || !/^[\d/]*$/.test(text.value)) return;
    const digits = text.value.replace(/\D/g, '').slice(0, 8);
    text.value = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
  });
  text.addEventListener('change', () => {
    const iso = vnDateToIso(text.value);
    text.setCustomValidity(text.value && !iso ? 'Nhập ngày dạng dd/mm/yyyy' : '');
    if (iso) {
      native.value = iso;
      text.value = isoToVnDate(iso);
    }
    emit();
  });
  native.addEventListener('click', () => {
    try {
      native.showPicker();
    } catch {
      // Trình duyệt không có showPicker: chạm vào ô date gốc vẫn mở lịch.
    }
  });
  native.addEventListener('change', () => {
    text.value = isoToVnDate(native.value);
    text.setCustomValidity('');
    emit();
  });
  wrap = h('span', { class: 'date-field' }, text, h('span', { class: 'date-btn', 'aria-hidden': 'true' }, '📅', native));
  Object.defineProperty(wrap, 'value', {
    get: () => vnDateToIso(text.value) ?? '',
    set: (v) => {
      native.value = v;
      text.value = isoToVnDate(v);
    },
  });
  wrap.focus = () => text.focus();
  return wrap;
}

// Ngày + giờ, .value dạng yyyy-mm-ddThh:mm như ô datetime-local ('' nếu thiếu ngày).
function dateTimeField(value = '', { max, required = false } = {}) {
  const [d = '', t = ''] = value.split('T');
  const date = dateField({ value: d, max: max?.split('T')[0], required });
  const time = h('input', { type: 'time', value: t, required, 'aria-label': 'Giờ' });
  const wrap = h('span', { class: 'datetime-field' }, date, time);
  Object.defineProperty(wrap, 'value', {
    get: () => (date.value ? `${date.value}T${time.value || '00:00'}` : ''),
  });
  return wrap;
}

// ---------- Ghi nhanh ----------

// Bé bú tức là đã thức: tự ghi giờ thức dậy nếu quên bấm.
function endSleepAt(at) {
  const sleep = currentSleep(state.recent, at);
  if (!sleep) return null;
  state.store.update(sleep.id, { endAt: Math.max(at, sleep.at) });
  return sleep;
}

function logFeed(milk) {
  const now = Date.now();
  const woke = endSleepAt(now);
  const id = state.store.add({ type: 'feed', milk, at: now, ml: null, diaper: null, by: state.uid });
  openMlSheet(id, MILK[milk], woke);
}

function logSleep() {
  const id = state.store.add({ type: 'sleep', at: Date.now(), endAt: null, ml: null, diaper: null, by: state.uid });
  toast('Đã ghi bé ngủ', () => state.store.remove(id));
}

function logWake() {
  const sleep = endSleepAt(Date.now());
  if (!sleep) return;
  toast(`Bé ngủ được ${fmtMinutes(Date.now() - sleep.at)}`, () => state.store.update(sleep.id, { endAt: null }));
}

function logPump() {
  const id = state.store.add({ type: 'pump', at: Date.now(), ml: null, diaper: null, by: state.uid });
  openMlSheet(id, MILK.pump);
}

function logDiaper(kind) {
  const id = state.store.add({ type: 'diaper', at: Date.now(), ml: null, diaper: kind, by: state.uid });
  toast(`Đã ghi tã ${kind === 'dry' ? 'ị' : 'ướt'}`, () => state.store.remove(id));
}

function openDialog(...children) {
  $dialog.replaceChildren(...children.filter((c) => c != null));
  if (!$dialog.open) $dialog.showModal();
}

function closeDialog() {
  if ($dialog.open) $dialog.close();
}

// Hàng chip chọn một giá trị, chạm lại để bỏ chọn. Ghi ngay khi chạm.
function chipGroup({ label, options }, value, onChange) {
  let current = value ?? null;
  const buttons = options.map(([v, text]) => h('button', {
    class: 'chip small',
    type: 'button',
    'aria-pressed': String(v === current),
    onclick: () => {
      current = current === v ? null : v;
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === current)));
      onChange(current);
    },
  }, text));
  return h('div', { class: 'chip-group', role: 'group', 'aria-label': label },
    h('span', { class: 'chip-label' }, label),
    h('div', { class: 'chips' }, buttons));
}

// Chọn "Ngủ luôn" thì tự ghi bé bắt đầu ngủ, đổi ý thì xóa giấc đó.
function afterFeedChips(id, values = {}) {
  let sleepId = null;
  return h('div', { class: 'stack tight' }, AFTER_FEED.map((group) => chipGroup(group, values[group.key], (v) => {
    state.store.update(id, { [group.key]: v });
    if (group.key !== 'after') return;
    if (v === 'asleep' && !sleepId && !currentSleep(state.recent, Date.now())) {
      sleepId = state.store.add({ type: 'sleep', at: Date.now(), endAt: null, ml: null, diaper: null, by: state.uid });
      toast('Đã ghi bé ngủ');
    } else if (v !== 'asleep' && sleepId) {
      state.store.remove(sleepId);
      sleepId = null;
    }
  })));
}

function openMlSheet(id, milk, woke) {
  const input = h('input', {
    type: 'number', inputMode: 'numeric', min: 1, max: 500, placeholder: 'Số khác', 'aria-label': 'Số ml khác',
  });
  // Chỉ hỏi D3 khi hôm nay chưa có cữ nào pha D3 (không tính cữ vừa ghi).
  const d3 = milk.feed ? vitaminD3Status(state.recent.filter((e) => e.id !== id), Date.now()) : null;
  let d3On = false;
  const d3Label = () => (d3On ? '✓ Đã pha D3 vào cữ này' : '💊 Có pha D3 vào cữ này?');
  const d3Btn = d3 && !d3.given ? h('button', {
    class: `btn block d3-toggle${d3.missed ? '' : ' due'}`,
    type: 'button',
    'aria-pressed': 'false',
    onclick: () => {
      d3On = !d3On;
      state.store.update(id, { d3: d3On });
      d3Btn.setAttribute('aria-pressed', String(d3On));
      d3Btn.textContent = d3Label();
    },
  }, d3Label()) : null;
  const saveMl = (ml) => {
    state.store.update(id, { ml });
    closeDialog();
    toast(`Đã ghi ${milk.verb} ${ml} ml`);
  };
  openDialog(
    h('h1', {}, `Đã ghi ${milk.name} lúc ${fmtTime(Date.now())}`),
    woke ? h('p', { class: 'muted' }, `Đã ghi bé thức dậy (ngủ ${fmtMinutes(Date.now() - woke.at)}).`) : null,
    milk.feed ? h('p', { class: 'muted' }, 'Sau khi bú xong (không bắt buộc, chạm để ghi):') : null,
    milk.feed ? afterFeedChips(id) : null,
    h('p', { class: 'muted' }, milk.question),
    h('div', { class: 'stack' },
      d3Btn,
      h('div', { class: 'chips' }, milk.chips.map((ml) => h('button', { class: 'chip', type: 'button', onclick: () => saveMl(ml) }, `${ml}`))),
      h('form', {
        class: 'inline',
        onsubmit: (ev) => {
          ev.preventDefault();
          const ml = parseMl(input.value);
          if (ml == null) toast('Nhập số ml từ 1 đến 500');
          else saveMl(ml);
        },
      }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Lưu')),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Nhập sau'),
        h('button', {
          class: 'btn danger',
          type: 'button',
          onclick: () => {
            state.store.remove(id);
            if (woke) state.store.update(woke.id, { endAt: null });
            closeDialog();
            toast(`Đã hủy ${milk.name}`);
          },
        }, 'Chạm nhầm, hủy')),
    ),
  );
}

// ---------- Sửa / thêm mục ----------

function openEditor(event) {
  const isNew = !event.id;
  const draft = { ...event };
  const nowInput = toLocalInput(Date.now());
  const time = dateTimeField(toLocalInput(draft.at), { max: nowInput, required: true });
  const people = state.members.some((m) => m.uid === draft.by) || !draft.by ? state.members : [...state.members, { uid: draft.by, gone: true }];
  const whoSel = h('select', {}, people.map((m) => h('option', { value: m.uid, selected: m.uid === (draft.by ?? state.uid) }, m.gone ? 'Người đã rời nhật ký' : who(m.uid))));
  const ml = h('input', { type: 'number', inputMode: 'numeric', min: 1, max: 500, value: draft.ml ?? '', placeholder: 'Chưa nhập' });
  const current = draft.type === 'diaper' ? draft.diaper : draft.type === 'feed' ? milkOf(draft) : draft.type;
  const kind = h('select', {}, [
    ['formula', 'Sữa công thức'], ['breast', 'Sữa mẹ'], ['pump', 'Hút sữa'], ['dry', 'Tã ị'], ['wet', 'Tã ướt'], ['sleep', 'Ngủ'],
  ].map(([v, label]) => h('option', { value: v, selected: v === current }, label)));
  const endAt = dateTimeField(draft.endAt ? toLocalInput(draft.endAt) : '', { max: nowInput });
  const endField = h('label', { class: 'field' }, 'Thức dậy lúc (để trống nếu bé đang ngủ)', endAt);
  const afterSelects = AFTER_FEED.map((g) => h('select', {},
    h('option', { value: '', selected: draft[g.key] == null }, 'Chưa ghi'),
    g.options.map(([v, label]) => h('option', { value: v, selected: v === draft[g.key] }, label))));
  const afterFields = h('div', { class: 'stack' }, AFTER_FEED.map((g, i) => h('label', { class: 'field' }, g.label, afterSelects[i])));
  const mlField = h('label', { class: 'field' }, 'Lượng sữa (ml)', ml);
  const d3Box = h('input', { type: 'checkbox', checked: Boolean(draft.d3) });
  const d3Field = h('label', { class: 'check' }, d3Box, 'Có pha vitamin D3');
  const isFeed = () => Boolean(MILK[kind.value]?.feed);
  const isMilk = () => isFeed() || kind.value === 'pump';
  const isSleep = () => kind.value === 'sleep';
  const syncKind = () => {
    mlField.style.display = isMilk() ? '' : 'none';
    d3Field.style.display = isFeed() ? '' : 'none';
    afterFields.style.display = isFeed() ? '' : 'none';
    endField.style.display = isSleep() ? '' : 'none';
  };
  kind.addEventListener('change', syncKind);
  syncKind();

  const onSubmit = (ev) => {
    ev.preventDefault();
    const at = new Date(time.value).getTime();
    if (!Number.isFinite(at) || at > Date.now() + 60000) {
      toast('Giờ không hợp lệ');
      return;
    }
    const milk = isMilk();
    const mlValue = milk && ml.value.trim() !== '' ? parseMl(ml.value) : null;
    if (milk && ml.value.trim() !== '' && mlValue == null) {
      toast('Nhập số ml từ 1 đến 500');
      return;
    }
    const feed = isFeed();
    const sleep = isSleep();
    const end = sleep && endAt.value ? new Date(endAt.value).getTime() : null;
    if (end != null && (!Number.isFinite(end) || end < at || end > Date.now() + 60000)) {
      toast('Giờ thức dậy phải sau giờ ngủ');
      return;
    }
    // Gửi null cho các trường không thuộc loại đang chọn để xóa dữ liệu cũ khi đổi loại.
    const fields = {
      type: feed ? 'feed' : milk ? kind.value : sleep ? 'sleep' : 'diaper',
      milk: feed ? kind.value : null,
      at,
      ml: mlValue,
      diaper: milk || sleep ? null : kind.value,
      by: whoSel.value,
      d3: feed && d3Box.checked,
      endAt: end,
      ...Object.fromEntries(AFTER_FEED.map((g, i) => [g.key, feed && afterSelects[i].value ? afterSelects[i].value : null])),
    };
    if (isNew) state.store.add(fields);
    else state.store.update(event.id, fields);
    closeDialog();
    toast(isNew ? 'Đã thêm' : 'Đã lưu');
  };

  const onDelete = () => {
    const { id, ...fields } = event;
    state.store.remove(id);
    closeDialog();
    toast('Đã xóa', () => state.store.add(fields));
  };

  openDialog(
    h('h1', {}, isNew ? 'Thêm mục' : 'Sửa mục'),
    h('form', { class: 'stack', onsubmit: onSubmit },
      h('label', { class: 'field' }, 'Loại', kind),
      h('label', { class: 'field' }, 'Giờ', time),
      endField,
      mlField,
      d3Field,
      afterFields,
      h('label', { class: 'field' }, 'Người thực hiện', whoSel),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Đóng'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Lưu')),
      isNew ? null : h('button', { class: 'btn danger block', type: 'button', onclick: onDelete }, 'Xóa mục này'),
    ),
  );
}

// ---------- Thành phần chung ----------

function statsCards(s) {
  return h('div', { class: 'stats' },
    h('div', { class: 'card stat' },
      h('div', { class: 'name' }, 'Tổng sữa'),
      h('div', { class: 'value' }, `${s.totalMl} `, h('small', {}, 'ml')),
      h('div', { class: 'sub' }, `${s.feeds} cữ${s.missingMl ? `, ${s.missingMl} chưa nhập ml` : ''}${s.feeds ? (s.d3 ? ', D3 ✓' : ', chưa D3') : ''}`),
      s.feeds ? h('div', { class: 'sub' }, `🍼 công thức ${s.formulaMl} ml (${s.formulaFeeds} cữ), 🤱 mẹ ${s.breastMl} ml (${s.breastFeeds} cữ)`) : null),
    h('div', { class: 'card stat' },
      h('div', { class: 'name' }, 'Thay tã'),
      h('div', { class: 'value' }, `${s.diapers} `, h('small', {}, 'lần')),
      h('div', { class: 'sub' }, `${s.dry} ị, ${s.wet} ướt`)),
    h('div', { class: 'card stat' },
      h('div', { class: 'name' }, 'Giấc ngủ'),
      h('div', { class: 'value' }, fmtMinutes(s.sleepMs ?? 0)),
      h('div', { class: 'sub' }, `${s.sleeps ?? 0} giấc bắt đầu hôm nay`)),
    h('div', { class: 'card stat' },
      h('div', { class: 'name' }, 'Sữa hút được'),
      h('div', { class: 'value' }, `${s.pumpedMl} `, h('small', {}, 'ml')),
      h('div', { class: 'sub' }, `${s.pumps} lần hút${s.pumpMissingMl ? `, ${s.pumpMissingMl} chưa nhập ml` : ''}`)));
}

function timeline(events) {
  if (!events.length) return h('div', { class: 'empty' }, 'Chưa có mục nào.');
  return h('ul', { class: 'timeline' }, events.map((e) => h('li', {},
    h('button', { type: 'button', onclick: () => openEditor(e), 'aria-label': `${eventTitle(e)} lúc ${fmtTime(e.at)}, bởi ${who(e.by)}. Chạm để sửa` },
      h('span', { class: 't' }, fmtTime(e.at)),
      h('span', {}, eventIcon(e)),
      h('span', {}, eventTitle(e), ' ',
        e.d3 ? h('span', { class: 'tag d3' }, '💊 D3') : null, ' ',
        (e.type === 'feed' || e.type === 'pump') && e.ml == null ? h('span', { class: 'tag' }, 'chưa nhập ml') : null,
        e.type === 'feed' ? AFTER_FEED.map(({ key }) => (AFTER_TAG[key][e[key]]
          ? [' ', h('span', { class: `tag after ${key}-${e[key]}` }, AFTER_TAG[key][e[key]])] : null)) : null),
      h('span', { class: 'who' }, who(e.by))))));
}

// ---------- Hôm nay ----------

function markD3(feed) {
  state.store.update(feed.id, { d3: true });
  toast(`Đã ghi D3 vào cữ ${fmtTime(feed.at)}`, () => state.store.update(feed.id, { d3: false }));
}

function d3Card() {
  const s = vitaminD3Status(state.recent, Date.now());
  if (s.given) {
    return h('section', { class: 'card d3-card done' },
      h('div', { class: 'label' }, '💊 Vitamin D3 hôm nay'),
      h('p', {}, `Đã pha vào cữ ${fmtTime(s.feed.at)}${who(s.feed.by) ? `, ${who(s.feed.by)}` : ''} ✓`));
  }
  const message = s.due === 'first' ? 'Nhớ pha D3 vào cữ bú đầu tiên'
    : s.due === 'second' ? 'Chưa pha D3. Nhớ pha vào cữ thứ 2'
      : 'Chưa cho D3 hôm nay';
  const last = s.feeds.at(-1);
  return h('section', { class: `card d3-card${s.missed ? ' late' : ''}` },
    h('div', { class: 'label' }, '💊 Vitamin D3 hôm nay'),
    h('p', {}, message),
    last ? h('button', { class: 'btn block', type: 'button', onclick: () => markD3(last) }, `Đã pha D3 vào cữ ${fmtTime(last.at)}`) : null);
}

// Cữ tiếp theo: 2 tiếng sau cữ trước, kèm khoảng giờ bé có thể đòi ước theo dữ liệu gần đây.
const PREDICT_BASIS = {
  ml: () => 'theo lượng sữa cữ trước',
  history: (p) => `theo 3 ngày gần đây (${p.count} cữ)`,
  weight: () => 'ước tính theo cân nặng, chưa đủ dữ liệu',
};

function predictLine(now) {
  const p = predictNextFeed(state.recent, now, latestWeight(state.measurements, state.profile), mlPerKg());
  if (!p) return null;
  const range = p.from === p.to ? fmtTime(p.from) : `${fmtTime(p.from)}–${fmtTime(p.to)}`;
  return h('div', { class: 'predict' },
    `Dự kiến bé đòi ${range}${now > p.to ? ' (đã qua)' : ''}`,
    h('small', {}, PREDICT_BASIS[p.basis](p)));
}

function reminderCard() {
  const now = Date.now();
  const weightKg = latestWeight(state.measurements, state.profile);
  const next = nextFeed(state.recent, now, weightKg, mlPerKg());
  if (!next) {
    return h('section', { class: 'card reminder' },
      h('div', { class: 'label' }, 'Cữ tiếp theo'),
      h('p', { class: 'left' }, 'Chưa có cữ bú nào gần đây'),
      h('div', { class: 'last' }, 'Chạm "Sữa công thức" hoặc "Sữa mẹ" để bắt đầu nhắc giờ.'));
  }
  const { last } = next;
  const lastAmount = last.ml == null ? 'chưa nhập ml' : `${last.ml} ml`;
  return h('section', { class: `card reminder${next.overdue ? ' late' : ''}`, id: 'reminder' },
    h('div', { class: 'label' }, next.overdue ? '⏰ Đến cữ bú' : 'Cữ tiếp theo'),
    h('div', { class: 'row' },
      h('span', { class: 'time' }, fmtTime(next.at)),
      h('span', { class: 'left' }, reminderLabel(next))),
    h('div', { class: 'last' }, next.basis === 'ml'
      ? `${next.ml} ml ÷ ${Math.round(next.perHourMl * 10) / 10} ml/giờ (${weightKg} kg × ${mlPerKg()} ml/kg/ngày)`
      : `Mặc định ${formatDuration(FEED_INTERVAL_MS / 60000)} (${weightKg ? 'cữ trước chưa có ml' : 'chưa có cân nặng'})`),
    predictLine(now),
    h('div', { class: 'last' }, `Cữ trước ${fmtTime(last.at)}, ${MILK_LABEL[milkOf(last)]} ${lastAmount}, ${who(last.by)}`));
}

function sleepButton() {
  const sleep = currentSleep(state.recent, Date.now());
  return sleep
    ? h('button', { class: 'action sleep awake', type: 'button', onclick: logWake },
      h('span', { class: 'ico', 'aria-hidden': 'true' }, '☀️'), `Thức dậy (đã ngủ ${fmtMinutes(Date.now() - sleep.at)})`)
    : h('button', { class: 'action sleep', type: 'button', onclick: logSleep },
      h('span', { class: 'ico', 'aria-hidden': 'true' }, '😴'), 'Ngủ');
}

function renderToday() {
  const today = startOfDay(Date.now());
  // Lọc các thẻ không có gì để hiện (trả về null), nếu không replaceChildren sẽ in chữ "null".
  show(...[
    h('h1', {}, `Hôm nay, ${fmtShortDay(today)}`),
    babyLine(),
    requestsCard(),
    reminderCard(),
    cumulativeChart(Date.now()),
    d3Card(),
    appointmentCard(),
    vaccineCard(),
    h('div', { class: 'actions' },
      h('button', { class: 'action feed', type: 'button', onclick: () => logFeed('formula') }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '🍼'), 'Sữa công thức'),
      h('button', { class: 'action feed breast', type: 'button', onclick: () => logFeed('breast') }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '🤱'), 'Sữa mẹ'),
      h('button', { class: 'action pump', type: 'button', onclick: logPump }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '🥛'), 'Hút sữa'),
      h('button', { class: 'action diaper', type: 'button', onclick: () => logDiaper('dry') }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '💩'), 'Tã ị'),
      h('button', { class: 'action diaper', type: 'button', onclick: () => logDiaper('wet') }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '💧'), 'Tã ướt'),
      sleepButton()),
    h('h2', {}, 'Thống kê hôm nay'),
    statsCards(dayStats(state.recent, today)),
    h('h2', {}, 'Nhật ký hôm nay'),
    h('div', { class: 'card' }, timeline(eventsOfDay(state.recent, today))),
  ].filter(Boolean));
}

// ---------- Lịch sử ----------

function watchHistory() {
  state.stopHistory?.();
  state.stopHistory = state.store.subscribe(state.historyDay, addDays(state.historyDay, 1), (events) => {
    state.historyEvents = events;
    if (state.tab === 'history') renderHistory();
  }, onSyncError);
}

function setHistoryDay(day) {
  state.historyDay = day;
  watchHistory();
  renderHistory();
}

function renderHistory() {
  const today = startOfDay(Date.now());
  const day = state.historyDay;
  const previousInput = $view.querySelector('#history-date');
  const hadFocus = previousInput && document.activeElement === previousInput;
  const picker = dateField({
    id: 'history-date',
    value: toDateInput(day),
    max: toDateInput(today),
    label: 'Chọn ngày',
    onchange: (value) => {
      if (!value) return;
      const [y, m, d] = value.split('-').map(Number);
      setHistoryDay(Math.min(new Date(y, m - 1, d).getTime(), today));
    },
  });
  const defaultAt = day === today ? Date.now() : day + 12 * 60 * 60 * 1000;
  show(
    h('h1', {}, 'Lịch sử'),
    h('div', { class: 'date-nav' },
      h('button', { class: 'btn', type: 'button', 'aria-label': 'Ngày trước', onclick: () => setHistoryDay(addDays(day, -1)) }, '‹'),
      picker,
      h('button', { class: 'btn', type: 'button', 'aria-label': 'Ngày sau', disabled: day >= today, onclick: () => setHistoryDay(addDays(day, 1)) }, '›')),
    h('p', { class: 'muted small' }, fmtDay(day)),
    statsCards(dayStats(state.historyEvents, day)),
    h('h2', {}, 'Nhật ký'),
    h('div', { class: 'card' }, timeline(state.historyEvents)),
    h('button', {
      class: 'btn block mt',
      type: 'button',
      onclick: () => openEditor({ type: 'feed', milk: 'formula', at: defaultAt, ml: null, diaper: null, by: state.uid }),
    }, '+ Thêm mục cho ngày này'),
  );
  if (hadFocus) picker.focus();
}

// ---------- Việc cần làm ----------

const VOICE_ERRORS = {
  'not-allowed': 'Chưa có quyền dùng micro. Hãy cho phép trong cài đặt trình duyệt.',
  'service-not-allowed': 'Chưa có quyền dùng micro. Hãy cho phép trong cài đặt trình duyệt.',
  'audio-capture': 'Không tìm thấy micro.',
  'no-speech': 'Không nghe thấy gì, hãy thử nói lại.',
  network: 'Cần có mạng để nhận giọng nói.',
};

const fmtWhen = (ms) => (startOfDay(ms) === startOfDay(Date.now()) ? fmtTime(ms) : `${fmtTime(ms)} ${fmtShortDay(ms)}`);

function addTodo(raw) {
  const text = cleanTask(raw);
  if (!text) return false;
  const id = state.store.addTodo({ text, done: false, createdAt: Date.now(), by: state.uid, doneAt: null, doneBy: null });
  toast(`Đã thêm "${text}"`, () => state.store.removeTodo(id));
  return true;
}

function toggleTodo(todo, done) {
  state.store.updateTodo(todo.id, { done, doneAt: done ? Date.now() : null, doneBy: done ? state.uid : null });
}

function clearDoneTodos(done) {
  done.forEach((t) => state.store.removeTodo(t.id));
  toast(`Đã xóa ${done.length} việc đã xong`, () => done.forEach(({ id, ...fields }) => state.store.addTodo(fields)));
}

function openTodoEditor(todo) {
  const input = h('input', { type: 'text', maxLength: TODO_MAX, value: todo.text, 'aria-label': 'Nội dung việc' });
  const onDelete = () => {
    const { id, ...fields } = todo;
    state.store.removeTodo(id);
    closeDialog();
    toast('Đã xóa', () => state.store.addTodo(fields));
  };
  openDialog(
    h('h1', {}, 'Sửa việc'),
    h('form', {
      class: 'stack',
      onsubmit: (ev) => {
        ev.preventDefault();
        const text = cleanTask(input.value);
        if (!text) {
          toast('Nhập nội dung việc');
          return;
        }
        state.store.updateTodo(todo.id, { text });
        closeDialog();
        toast('Đã lưu');
      },
    },
    input,
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Đóng'),
      h('button', { class: 'btn primary', type: 'submit' }, 'Lưu')),
    h('button', { class: 'btn danger block', type: 'button', onclick: onDelete }, 'Xóa việc này')),
  );
}

function todoItem(t) {
  const meta = t.done ? `${who(t.doneBy)} xong lúc ${fmtWhen(t.doneAt)}` : `${who(t.by)} thêm lúc ${fmtWhen(t.createdAt)}`;
  return h('li', { class: `todo-item${t.done ? ' done' : ''}` },
    h('label', { class: 'tick' },
      h('input', {
        type: 'checkbox',
        checked: Boolean(t.done),
        'aria-label': `${t.text}: ${t.done ? 'đã xong' : 'chưa xong'}`,
        onchange: (ev) => toggleTodo(t, ev.target.checked),
      })),
    h('button', { class: 'todo-text', type: 'button', onclick: () => openTodoEditor(t), 'aria-label': `${t.text}. Chạm để sửa` },
      h('span', {}, t.text),
      h('small', {}, meta)));
}

// Chỉ vẽ lại danh sách, không đụng ô nhập để không mất chữ đang gõ khi người khác thêm việc.
function renderTodoList() {
  const $list = $view.querySelector('#todo-list');
  if (!$list) return;
  const { open, done } = splitTodos(state.todos);
  $list.replaceChildren(
    h('div', { class: 'card' }, open.length
      ? h('ul', { class: 'todo-list' }, open.map(todoItem))
      : h('div', { class: 'empty' }, done.length ? 'Đã xong hết 🎉' : 'Chưa có việc nào.')),
    ...(done.length ? [
      h('h2', {}, `Đã xong (${done.length})`),
      h('div', { class: 'card' }, h('ul', { class: 'todo-list' }, done.map(todoItem))),
      h('button', { class: 'btn danger block mt', type: 'button', onclick: () => clearDoneTodos(done) }, 'Xóa việc đã xong'),
    ] : []),
  );
}

function stopListening() {
  state.listening?.cancel();
  state.listening = null;
}

function toggleListening(input, mic) {
  if (state.listening) {
    state.listening.stop();
    return;
  }
  const before = input.value;
  let session;
  try {
    session = listen((text) => { input.value = text; });
  } catch (err) {
    console.error(err);
    toast('Không bật được micro. Hãy thử lại.');
    return;
  }
  state.listening = session;
  mic.classList.add('listening');
  mic.setAttribute('aria-pressed', 'true');
  mic.setAttribute('aria-label', 'Dừng nghe');
  session.done
    .then((text) => {
      input.value = before;
      if (!addTodo(text)) toast(VOICE_ERRORS['no-speech']);
    })
    .catch((err) => {
      input.value = before;
      if (err.code !== 'cancelled') toast(VOICE_ERRORS[err.code] ?? 'Không nhận được giọng nói, hãy thử lại.');
    })
    .finally(() => {
      if (state.listening === session) state.listening = null;
      mic.classList.remove('listening');
      mic.setAttribute('aria-pressed', 'false');
      mic.setAttribute('aria-label', 'Nói để thêm việc');
    });
}

function renderTodos() {
  const input = h('input', {
    type: 'text', maxLength: TODO_MAX, placeholder: 'Thêm việc, vd. mua tã', 'aria-label': 'Việc mới', enterKeyHint: 'done',
  });
  const mic = canListen() ? h('button', {
    class: 'btn mic',
    type: 'button',
    'aria-label': 'Nói để thêm việc',
    'aria-pressed': 'false',
    onclick: () => toggleListening(input, mic),
  }, '🎤') : null;
  show(
    h('h1', {}, 'Việc cần làm'),
    h('form', {
      class: 'inline',
      onsubmit: (ev) => {
        ev.preventDefault();
        if (addTodo(input.value)) input.value = '';
        else toast('Nhập nội dung việc');
      },
    }, input, mic, h('button', { class: 'btn primary', type: 'submit' }, 'Thêm')),
    mic ? h('p', { class: 'muted small' }, 'Bấm 🎤 rồi nói, ví dụ "mua tã size M". Nói xong việc sẽ tự được thêm.') : null,
    h('div', { id: 'todo-list', class: 'mt' }),
  );
  renderTodoList();
}

// ---------- Biểu đồ ----------

function barChart({ title, unit, colorVar, days, valueOf, id }) {
  const values = days.map(valueOf);
  const peak = Math.max(...values);
  const top = niceMax(peak);
  const peakIndex = peak > 0 ? values.lastIndexOf(peak) : -1;
  const sub = h('div', { class: 'chart-sub' }, 'Chạm vào cột để xem chi tiết');
  const describe = (d, v) => `${d.isToday ? 'Hôm nay' : `${fmtWeekday(d.day)} ${fmtShortDay(d.day)}`}: ${v} ${unit}`;

  const slots = days.map((d, i) => {
    const v = values[i];
    const pct = (v / top) * 100;
    const showLabel = v > 0 && (d.isToday || i === peakIndex);
    return h('button', {
      class: 'bar-slot',
      type: 'button',
      'aria-label': describe(d, v),
      onclick: () => { sub.textContent = describe(d, v); },
      onmouseenter: () => { sub.textContent = describe(d, v); },
      onfocus: () => { sub.textContent = describe(d, v); },
    },
    v > 0 ? h('i', { style: `height:${pct}%` }) : null,
    showLabel ? h('b', { style: `bottom:calc(${pct}% + 2px)` }, `${v}`) : null);
  });

  const gridValues = [top, top / 2, 0];
  const plot = h('div', { class: 'plot' },
    gridValues.filter((g) => g > 0).map((g) => {
      const line = h('div', { class: 'gridline' }, h('span', {}, `${g}`));
      line.style.bottom = `${(g / top) * 100}%`;
      return line;
    }),
    h('div', { class: 'bars' }, slots));
  plot.style.setProperty('--bar', `var(${colorVar})`);

  return h('section', { class: 'card chart-card', id },
    h('h2', {}, title),
    sub,
    plot,
    h('div', { class: 'x-labels', 'aria-hidden': 'true' }, days.map((d) => h('div', { class: d.isToday ? 'today' : '' }, fmtWeekday(d.day), h('br'), fmtShortDay(d.day)))));
}

// Sữa cộng dồn hôm nay theo giờ, so với đường mục tiêu tăng đều từ gốc tọa độ đến
// cân nặng × hệ số ml/kg/ngày lúc 24h. Trục thời gian bắt đầu ở T0 (axisStart) để cữ đầu chạm đường.
function cumulativeChart(now) {
  const W = 340;
  const H = 220;
  const pad = { l: 38, r: 34, t: 10, b: 26 };
  const cur = cumulativeMl(state.recent, startOfDay(now), now);
  const weightKg = latestWeight(state.measurements, state.profile);
  const target = weightKg ? Math.round(weightKg * mlPerKg()) : null;
  const nowHour = cur.points.at(-1)[0];
  const t0 = axisStart(cur.points, target);
  // Trước T0 chưa có cữ nào, lượng sữa là 0.
  const todayPts = [[t0, 0], ...cur.points.filter(([hr]) => hr >= t0)];

  const peak = Math.max(target ?? 0, cur.total, 1);
  const step = [25, 50, 100, 150, 200, 250, 500].find((st) => Math.ceil(peak / st) <= 5) ?? niceMax(peak / 5);
  const top = Math.ceil(peak / step) * step;
  const x = (hr) => pad.l + ((hr - t0) / (24 - t0)) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const path = (pts) => pts.map(([hr, v], i) => `${i ? 'L' : 'M'}${x(hr).toFixed(1)},${y(v).toFixed(1)}`).join('');

  const axis = [];
  for (let v = 0; v <= top; v += step) {
    axis.push(
      svg('line', { class: 'g-grid', x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }),
      svg('text', { class: 'g-axis', x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, `${v}`),
    );
  }
  const span = 24 - t0;
  const hrStep = span <= 6 ? 1 : span <= 12 ? 2 : span <= 18 ? 3 : 6;
  const clock = (hr) => {
    if (Math.round(hr * 60) === 1440) return '24h';
    const m = ((Math.round(hr * 60) % 1440) + 1440) % 1440;
    return m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m / 60}h`;
  };
  // Nhãn giờ bắt đầu trục, rồi các mốc tròn; bỏ mốc quá sát nhãn đầu.
  axis.push(svg('text', { class: 'g-axis', x: x(t0), y: H - 8, 'text-anchor': 'middle' }, clock(t0)));
  for (let hr = Math.ceil(t0 / hrStep) * hrStep; hr <= 24; hr += hrStep) {
    if (hr - t0 < hrStep * 0.6) continue;
    axis.push(svg('text', { class: 'g-axis', x: x(hr), y: H - 8, 'text-anchor': 'middle' }, clock(hr)));
  }

  // Còn bao nhiêu ml, trong bao lâu nữa là hết ngày.
  const leftMin = Math.round((24 - nowHour) * 60);
  const leftMl = target ? target - cur.total : null;
  let summary;
  if (!target) summary = `Hôm nay ${cur.total} ml · thêm cân nặng ở mục Sức khỏe để có mục tiêu`;
  else if (leftMl <= 0) summary = `${cur.total} / ${target} ml · đã đủ mục tiêu`;
  else if (leftMin <= 0) summary = `${cur.total} / ${target} ml · thiếu ${leftMl} ml`;
  else summary = `${cur.total} / ${target} ml · còn ${leftMl} ml trong ${formatDuration(leftMin)} (đến 24h)`;

  return h('section', { class: 'card chart-card', id: 'chart-cumulative' },
    h('h2', {}, 'Sữa cộng dồn trong ngày (ml)'),
    h('div', { class: 'chart-sub' }, summary),
    svg('svg', { class: 'growth-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Sữa cộng dồn: ${summary}.` },
      nowHour < 24 ? svg('rect', { class: 'c-future', x: x(nowHour), y: pad.t, width: x(24) - x(nowHour), height: H - pad.t - pad.b }) : null,
      axis,
      nowHour < 24 ? svg('line', { class: 'c-nowline', x1: x(nowHour), x2: x(nowHour), y1: pad.t, y2: H - pad.b }) : null,
      target ? [
        svg('path', { class: 'c-pace', d: path([[t0, 0], [24, target]]) }),
        svg('text', { class: 'g-label', x: W - pad.r + 4, y: y(target) + 4 }, `${target}`),
      ] : null,
      svg('path', { class: 'c-today', d: path(todayPts) }),
      svg('circle', { class: 'c-now', cx: x(nowHour), cy: y(cur.total), r: 4.5 })),
    h('div', { class: 'c-legend' },
      h('span', {}, h('i', { class: 'today' }), 'Đã bú'),
      target ? h('span', {}, h('i', { class: 'pace' }), `Mục tiêu ${weightKg} kg × ${mlPerKg()} ml/kg`) : null,
      h('button', { class: 'link', type: 'button', onclick: openMlPerKgEditor, 'aria-label': 'Sửa hệ số sữa mục tiêu' },
        target ? '✎ Sửa hệ số' : `Hệ số ${mlPerKg()} ml/kg/ngày ✎`)));
}

// Hệ số sữa mục tiêu ml/kg/ngày, mọi thành viên sửa được.
function openMlPerKgEditor() {
  const current = mlPerKg();
  const input = h('input', {
    type: 'number', inputMode: 'numeric', min: ML_PER_KG_MIN, max: ML_PER_KG_MAX, step: 5, value: current, 'aria-label': 'ml/kg/ngày',
  });
  const save = (v) => {
    state.store.updateProfile({ mlPerKg: v, updatedAt: Date.now(), by: state.uid });
    closeDialog();
    toast(`Đã đổi mục tiêu thành ${v} ml/kg/ngày`);
  };
  openDialog(
    h('h1', {}, 'Sữa mục tiêu mỗi ngày'),
    h('p', { class: 'muted' }, `Mục tiêu = cân nặng × hệ số. Đề xuất ${ML_PER_KG_DEFAULT} ml/kg/ngày cho bé 0–6 tháng. Nếu bác sĩ dặn khác, hãy theo bác sĩ.`),
    h('div', { class: 'chips' }, [120, 140, 150, 160, 180].map((v) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(v === current), onclick: () => save(v),
    }, `${v}`))),
    h('form', {
      class: 'inline mt',
      onsubmit: (ev) => {
        ev.preventDefault();
        const v = parseMlPerKg(input.value);
        if (v == null) toast(`Nhập số từ ${ML_PER_KG_MIN} đến ${ML_PER_KG_MAX}`);
        else save(v);
      },
    }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Lưu')),
    h('div', { class: 'row-btns mt' },
      h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Đóng'),
      current === ML_PER_KG_DEFAULT ? null
        : h('button', { class: 'btn', type: 'button', onclick: () => save(ML_PER_KG_DEFAULT) }, `Dùng đề xuất ${ML_PER_KG_DEFAULT}`)),
  );
}

function mlPerKgRow() {
  return h('div', { class: 'row-btns mt' },
    h('span', {}, `🍼 Sữa mục tiêu: ${mlPerKg()} ml/kg/ngày`),
    h('button', { class: 'btn', type: 'button', onclick: openMlPerKgEditor }, '✎ Sửa'));
}

function renderCharts() {
  const days = weekSeries(state.recent, Date.now());
  show(
    h('h1', {}, '7 ngày gần nhất'),
    barChart({ id: 'chart-ml', title: 'Tổng sữa mỗi ngày (ml)', unit: 'ml', colorVar: '--chart-feed', days, valueOf: (d) => d.totalMl }),
    barChart({ id: 'chart-diaper', title: 'Số lần thay tã mỗi ngày', unit: 'lần', colorVar: '--chart-diaper', days, valueOf: (d) => d.diapers }),
    barChart({ id: 'chart-pump', title: 'Sữa hút được mỗi ngày (ml)', unit: 'ml', colorVar: '--chart-pump', days, valueOf: (d) => d.pumpedMl }),
    h('p', { class: 'muted small' }, 'Số liệu của hôm nay tính đến thời điểm hiện tại.'),
    h('details', { class: 'card' },
      h('summary', {}, 'Xem dạng bảng'),
      h('table', {},
        h('thead', {}, h('tr', {}, ['Ngày', 'Bú ml', 'Công thức ml', 'Mẹ ml', 'Cữ', 'D3', 'Hút ml', 'Tã', 'Ị', 'Ướt'].map((t) => h('th', {}, t)))),
        h('tbody', {}, [...days].reverse().map((d) => h('tr', {},
          h('td', {}, d.isToday ? 'Hôm nay' : `${fmtWeekday(d.day)} ${fmtShortDay(d.day)}`),
          [d.totalMl, d.formulaMl, d.breastMl, d.feeds, d.d3 ? '✓' : '–', d.pumpedMl, d.diapers, d.dry, d.wet].map((v) => h('td', {}, `${v}`))))))),
  );
}

// ---------- Sức khỏe ----------

const DAY_MS = 24 * 60 * 60 * 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  el.append(...children.flat().filter((c) => c != null));
  return el;
}

// Ngày chọn là hôm nay thì lấy giờ hiện tại, ngày khác lấy 12 giờ trưa để không lệch ngày.
function atFromDateInput(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  const day = new Date(y, m - 1, d).getTime();
  if (!Number.isFinite(day)) return null;
  return day === startOfDay(Date.now()) ? Date.now() : day + 12 * 60 * 60 * 1000;
}

const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);

// Cân nặng cũ chỉ lưu trong Cài đặt thì hiện như một lần đo, chưa nằm trong danh sách.
function growthData() {
  if (state.measurements.length) return state.measurements;
  const { weightKg, updatedAt, by } = state.profile;
  return weightKg ? [{ id: null, at: updatedAt ?? Date.now(), weightKg, lengthCm: null, by, legacy: true }] : [];
}

function measurementLabel(m) {
  return [m.weightKg != null ? `${m.weightKg} kg` : null, m.lengthCm != null ? `${m.lengthCm} cm` : null].filter(Boolean).join(', ');
}

function openMeasurementEditor(m) {
  const isNew = !m?.id;
  const date = dateField({
    required: true, value: toDateInput(m?.at ?? Date.now()), max: toDateInput(Date.now()), min: toDateInput(birthAt()),
  });
  const weight = h('input', {
    type: 'number', inputMode: 'decimal', step: 0.01, min: 1.5, max: 20, value: m?.weightKg ?? '', placeholder: 'Ví dụ 3.62',
  });
  const length = h('input', {
    type: 'number', inputMode: 'decimal', step: 0.1, min: 40, max: 100, value: m?.lengthCm ?? '', placeholder: 'Không bắt buộc',
  });

  const onSubmit = (ev) => {
    ev.preventDefault();
    // Giữ nguyên giờ cũ khi không đổi ngày.
    const at = m?.at && toDateInput(m.at) === date.value ? m.at : atFromDateInput(date.value);
    const weightKg = weight.value.trim() === '' ? null : parseWeight(weight.value, 20);
    const lengthCm = length.value.trim() === '' ? null : parseLength(length.value);
    if (at == null || at < startOfDay(birthAt()) || at > Date.now() + 60000) {
      toast('Ngày không hợp lệ');
      return;
    }
    if (weight.value.trim() !== '' && weightKg == null) {
      toast('Nhập cân nặng từ 1.5 đến 20 kg');
      return;
    }
    if (length.value.trim() !== '' && lengthCm == null) {
      toast('Nhập chiều dài từ 40 đến 100 cm');
      return;
    }
    if (weightKg == null && lengthCm == null) {
      toast('Nhập cân nặng hoặc chiều dài');
      return;
    }
    const fields = { at, weightKg, lengthCm, by: isNew ? state.uid : m.by };
    if (isNew) state.store.addMeasurement(fields);
    else state.store.updateMeasurement(m.id, fields);
    closeDialog();
    toast(isNew ? `Đã lưu ${measurementLabel(fields)}` : 'Đã lưu');
  };

  const onDelete = () => {
    const { id, ...fields } = m;
    state.store.removeMeasurement(id);
    closeDialog();
    toast('Đã xóa', () => state.store.addMeasurement(fields));
  };

  openDialog(
    h('h1', {}, isNew ? 'Thêm lần cân đo' : 'Sửa lần cân đo'),
    h('form', { class: 'stack', onsubmit: onSubmit },
      h('label', { class: 'field' }, 'Ngày', date),
      h('label', { class: 'field' }, 'Cân nặng (kg)', weight),
      h('label', { class: 'field' }, 'Chiều dài (cm)', length),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Đóng'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Lưu')),
      isNew ? null : h('button', { class: 'btn danger block', type: 'button', onclick: onDelete }, 'Xóa lần đo này')),
  );
}

// Bước chia trục dọc sao cho có khoảng 3 đến 5 vạch.
function niceStep(range) {
  for (const s of [0.5, 1, 2, 5, 10]) if (range / s <= 5) return s;
  return 10;
}

function growthChart({ id, title, unit, table, points, maxMonths, label }) {
  const W = 340;
  const H = 220;
  const pad = { l: 34, r: 30, t: 10, b: 26 };
  const samples = Array.from({ length: 49 }, (_, i) => (maxMonths * i) / 48);
  const curves = CURVES.map((c) => ({ ...c, pts: samples.map((mo) => [mo, valueAtZ(lmsAt(table, mo), c.z)]) }));
  const [p3, p15, p50, p85, p97] = curves;

  const values = [...p3.pts, ...p97.pts].map(([, v]) => v).concat(points.map((p) => p.value));
  const step = niceStep(Math.max(...values) - Math.min(...values));
  const yMin = Math.floor(Math.min(...values) / step) * step;
  const yMax = Math.ceil(Math.max(...values) / step) * step;
  const x = (mo) => pad.l + (mo / maxMonths) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - ((v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const path = (pts) => pts.map(([mo, v], i) => `${i ? 'L' : 'M'}${x(mo).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const band = (lo, hi) => `${path(hi.pts)}L${path([...lo.pts].reverse()).slice(1)}Z`;

  const axis = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    axis.push(
      svg('line', { class: 'g-grid', x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }),
      svg('text', { class: 'g-axis', x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, step < 1 ? v.toFixed(1) : `${v}`),
    );
  }
  const xStep = maxMonths <= 6 ? 1 : maxMonths <= 12 ? 2 : 3;
  for (let mo = 0; mo <= maxMonths; mo += xStep) {
    axis.push(svg('text', { class: 'g-axis', x: x(mo), y: H - 8, 'text-anchor': 'middle' }, `${mo}`));
  }

  const sub = h('div', { class: 'chart-sub' }, points.length ? 'Chạm vào chấm để xem chi tiết' : 'Chưa có lần đo nào');
  const describe = (p) => `${fmtShortDay(p.at)} (${ageLabel(ageInDays(birthAt(), p.at))}): ${p.value} ${unit}, khoảng P${percentileOf(table, p.months, p.value)}`;
  const dots = points.map((p) => svg('g', {
    class: 'g-dot',
    tabindex: 0,
    role: 'button',
    'aria-label': describe(p),
    onclick: () => { sub.textContent = describe(p); },
    onfocus: () => { sub.textContent = describe(p); },
  },
  svg('circle', { class: 'g-hit', cx: x(p.months), cy: y(p.value), r: 14 }),
  svg('circle', { cx: x(p.months), cy: y(p.value), r: 4.5 })));

  return h('section', { class: 'card chart-card', id },
    h('h2', {}, title),
    sub,
    svg('svg', { class: 'growth-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${title}, so với chuẩn WHO ${label}` },
      axis,
      svg('path', { class: 'g-band-outer', d: band(p3, p97) }),
      svg('path', { class: 'g-band-inner', d: band(p15, p85) }),
      svg('path', { class: 'g-median', d: path(p50.pts) }),
      [p3, p50, p97].map((c) => svg('text', { class: 'g-label', x: W - pad.r + 4, y: y(c.pts.at(-1)[1]) + 4 }, `P${c.p}`)),
      points.length > 1 ? svg('path', { class: 'g-line', d: path(points.map((p) => [p.months, p.value])) }) : null,
      dots),
    h('div', { class: 'g-xlabel' }, 'Tuổi (tháng)'));
}

function growthSection() {
  const data = growthData();
  const birthDay = startOfDay(birthAt());
  const weights = growthPoints(data, 'weightKg', birthDay);
  const lengths = growthPoints(data, 'lengthCm', birthDay);
  const lastMonths = Math.max(ageMonths(ageInDays(birthAt(), Date.now())), ...weights.map((p) => p.months), ...lengths.map((p) => p.months));
  const maxMonths = Math.min(MAX_MONTHS, Math.max(3, Math.ceil(lastMonths + 2)));
  const tables = tablesFor(state.profile.sex);
  const lastW = weights.at(-1);
  const lastL = lengths.at(-1);
  const summary = [
    lastW ? `${lastW.value} kg (P${percentileOf(tables.weight, lastW.months, lastW.value)})` : null,
    lastL ? `${lastL.value} cm (P${percentileOf(tables.length, lastL.months, lastL.value)})` : null,
  ].filter(Boolean).join(' · ');
  const list = [...data].sort((a, b) => b.at - a.at);

  return h('div', { id: 'growth' },
    h('h2', {}, '📏 Tăng trưởng'),
    summary ? h('p', { class: 'growth-summary' }, summary, h('small', {}, `Lần đo gần nhất ${fmtShortDay(list[0].at)}`)) : null,
    h('button', { class: 'btn primary block', type: 'button', onclick: () => openMeasurementEditor(null) }, '+ Thêm lần cân đo'),
    h('div', { class: 'mt' },
      growthChart({ id: 'chart-weight', title: 'Cân nặng theo tuổi (kg)', unit: 'kg', table: tables.weight, points: weights, maxMonths, label: tables.label }),
      growthChart({ id: 'chart-length', title: 'Chiều dài theo tuổi (cm)', unit: 'cm', table: tables.length, points: lengths, maxMonths, label: tables.label })),
    h('p', { class: 'muted small' }, `Dải đậm là P15–P85, dải nhạt là P3–P97, nét đứt là trung vị P50 theo chuẩn WHO cho ${tables.label}. Chỉ để tham khảo, hãy hỏi bác sĩ nếu bé nằm ngoài P3–P97 hoặc tụt khỏi đường đang theo.`),
    list.length ? h('div', { class: 'card' }, h('ul', { class: 'timeline measure-list' }, list.map((m) => h('li', {},
      h('button', { type: 'button', onclick: () => openMeasurementEditor(m.legacy ? { ...m, id: null } : m), 'aria-label': `${fmtShortDay(m.at)}: ${measurementLabel(m)}. Chạm để sửa` },
        h('span', { class: 't' }, fmtShortDay(m.at)),
        h('span', {}, measurementLabel(m), m.legacy ? h('small', { class: 'muted' }, ' (từ Cài đặt, chạm để lưu)') : null),
        h('span', { class: 'who' }, who(m.by))))))) : null);
}

const VACCINE_ICON = {
  done: '✅', skipped: '⏭️', notNeeded: '➖', overdue: '⚠️', due: '💉', soon: '🔔', upcoming: '⏳',
};
const PENDING = ['overdue', 'due', 'soon', 'upcoming'];

function vaccineWhen(v, now) {
  const r = v.record;
  const by = r?.by && who(r.by) ? `, ${who(r.by)} ghi` : '';
  if (v.status === 'done') return `Đã tiêm ${fmtShortDay(r.at)}${by}${r.note ? ` · ${r.note}` : ''}`;
  if (v.status === 'skipped') return `Bỏ qua${by}${r.note ? ` · ${r.note}` : ''}`;
  if (v.status === 'notNeeded') return 'Không cần, đã tiêm mũi thay thế';
  const d = daysBetween(now, v.dueAt);
  if (d < 0) return `Dự kiến ${fmtShortDay(v.dueAt)}, trễ ${-d} ngày`;
  if (d === 0) return 'Dự kiến hôm nay';
  return `Dự kiến ${fmtShortDay(v.dueAt)}, còn ${d} ngày`;
}

// Ghi lại đúng bản ghi trước đó, hoặc xóa nếu trước đó chưa có.
function restoreVaccine(id, prev) {
  if (!prev) {
    state.store.removeVaccine(id);
    return;
  }
  const { id: _, ...fields } = prev;
  state.store.setVaccine(id, fields);
}

function openVaccineEditor(v) {
  const r = v.record;
  const isCustom = v.program === 'custom';
  const date = dateField({
    required: true, max: toDateInput(Date.now()), value: toDateInput(v.status === 'done' ? r.at : Math.min(Date.now(), v.dueAt)),
  });
  const note = h('input', { type: 'text', maxLength: NOTE_MAX, value: r?.note ?? '', placeholder: 'Nơi tiêm, tên vắc xin, số lô...' });
  const base = isCustom ? { name: v.name, dueAt: v.dueAt } : {};
  const prev = r ? { ...r } : null;

  const save = (status) => {
    const at = status === 'done' ? atFromDateInput(date.value) : Date.now();
    if (at == null || at > Date.now() + 60000) {
      toast('Ngày không hợp lệ');
      return;
    }
    state.store.setVaccine(v.id, { ...base, status, at, by: state.uid, note: note.value.trim() || null });
    closeDialog();
    toast(status === 'done' ? `Đã ghi tiêm ${v.name}` : `Đã bỏ qua ${v.name}`, () => restoreVaccine(v.id, prev));
  };
  const reset = () => {
    if (isCustom) state.store.setVaccine(v.id, { ...base, status: null, at: null, by: state.uid, note: r.note ?? null });
    else state.store.removeVaccine(v.id);
    closeDialog();
    toast('Đã chuyển về chưa tiêm', () => restoreVaccine(v.id, prev));
  };
  const remove = () => {
    state.store.removeVaccine(v.id);
    closeDialog();
    toast(`Đã xóa ${v.name}`, () => restoreVaccine(v.id, prev));
  };
  const recorded = v.status === 'done' || v.status === 'skipped';

  openDialog(
    h('h1', {}, v.name),
    h('p', { class: 'muted small' }, `${PROGRAMS[v.program]} · ${vaccineWhen(v, Date.now())}${v.hint ? `. ${v.hint}` : ''}`),
    h('form', {
      class: 'stack',
      onsubmit: (ev) => {
        ev.preventDefault();
        save('done');
      },
    },
    h('label', { class: 'field' }, 'Ngày tiêm', date),
    h('label', { class: 'field' }, 'Ghi chú', note),
    h('button', { class: 'btn primary block', type: 'submit' }, v.status === 'done' ? 'Lưu' : 'Đã tiêm'),
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Đóng'),
      v.status === 'skipped' ? null : h('button', { class: 'btn', type: 'button', onclick: () => save('skipped') }, 'Bỏ qua')),
    recorded ? h('button', { class: 'btn danger block', type: 'button', onclick: reset }, 'Chuyển về chưa tiêm') : null,
    isCustom ? h('button', { class: 'btn danger block', type: 'button', onclick: remove }, 'Xóa mũi này') : null),
  );
}

function openCustomVaccine() {
  const name = h('input', { type: 'text', required: true, maxLength: 100, placeholder: 'Ví dụ: Cúm nhắc lại' });
  const due = dateField({ required: true, value: toDateInput(Date.now()), min: toDateInput(birthAt()) });
  openDialog(
    h('h1', {}, 'Thêm mũi khác'),
    h('form', {
      class: 'stack',
      onsubmit: (ev) => {
        ev.preventDefault();
        const text = name.value.trim();
        const dueAt = atFromDateInput(due.value);
        if (!text || dueAt == null) {
          toast(text ? 'Ngày không hợp lệ' : 'Nhập tên mũi tiêm');
          return;
        }
        const id = state.store.setVaccine(null, { name: text, dueAt, status: null, at: null, by: state.uid, note: null });
        closeDialog();
        toast(`Đã thêm ${text}`, () => state.store.removeVaccine(id));
      },
    },
    h('label', { class: 'field' }, 'Tên mũi tiêm', name),
    h('label', { class: 'field' }, 'Ngày hẹn', due),
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Đóng'),
      h('button', { class: 'btn primary', type: 'submit' }, 'Thêm'))),
  );
}

function vaccineItem(v, now) {
  return h('li', { class: `vaccine ${v.status}` },
    h('button', { type: 'button', onclick: () => openVaccineEditor(v), 'aria-label': `${v.name}, ${PROGRAMS[v.program]}. ${vaccineWhen(v, now)}. Chạm để ghi` },
      h('span', { class: 'v-ico', 'aria-hidden': 'true' }, VACCINE_ICON[v.status]),
      h('span', { class: 'v-text' },
        h('span', {}, v.name, ' ', h('span', { class: `tag ${v.program}` }, PROGRAMS[v.program])),
        h('small', {}, vaccineWhen(v, now)))));
}

function vaccineSection() {
  const now = Date.now();
  const plan = vaccinePlan(state.vaccines, birthAt(), now);
  const groups = groupByMilestone(plan);
  // Mặc định chỉ hiện 3 mốc gần nhất còn mũi chưa ghi, cộng các mốc có mũi cần nhắc (kể cả mũi tự thêm).
  const next = groups.filter((g) => g.items.some((v) => PENDING.includes(v.status))).slice(0, 3);
  const urgent = new Set(vaccinesToRemind(plan));
  const shown = state.showAllVaccines ? groups : groups.filter((g) => next.includes(g) || g.items.some((v) => urgent.has(v)));
  const done = plan.filter((v) => v.status === 'done').length;

  return h('div', { id: 'vaccines' },
    h('h2', {}, '💉 Tiêm chủng'),
    h('p', { class: 'muted small' }, `Đã tiêm ${done} mũi. Lịch tham khảo, hãy theo chỉ định của bác sĩ và điểm tiêm. Mũi TCMR và mũi dịch vụ cùng mốc thay thế nhau, ghi một bên thì bên kia tự thành "không cần".`),
    shown.length
      ? shown.map((g) => h('section', { class: 'card vaccine-group' },
        h('h3', {}, g.label),
        h('ul', { class: 'vaccine-list' }, g.items.map((v) => vaccineItem(v, now)))))
      : h('div', { class: 'card empty' }, 'Đã ghi xong các mũi trong lịch 🎉'),
    h('div', { class: 'row-btns mt' },
      h('button', {
        class: 'btn',
        type: 'button',
        onclick: () => {
          state.showAllVaccines = !state.showAllVaccines;
          renderHealth();
        },
      }, state.showAllVaccines ? 'Chỉ hiện mũi sắp tới' : `Xem cả lịch (${plan.length} mũi)`),
      h('button', { class: 'btn', type: 'button', onclick: openCustomVaccine }, '+ Thêm mũi khác')));
}

function vaccineCard() {
  const now = Date.now();
  const list = vaccinesToRemind(vaccinePlan(state.vaccines, birthAt(), now));
  if (!list.length) return null;
  const late = list.some((v) => v.status === 'overdue');
  return h('section', { class: `card vaccine-card${late ? ' late' : ''}` },
    h('div', { class: 'label' }, '💉 Tiêm chủng'),
    h('ul', {}, list.slice(0, 3).map((v) => h('li', {}, h('b', {}, v.name), h('small', {}, vaccineWhen(v, now))))),
    h('button', {
      class: 'btn block',
      type: 'button',
      onclick: () => {
        state.tab = 'health';
        window.scrollTo(0, 0);
        render();
      },
    }, list.length > 3 ? `Xem cả ${list.length} mũi` : 'Mở lịch tiêm'));
}

// ---------- Tái khám ----------

const pad2 = (n) => String(n).padStart(2, '0');

function appointmentWhen(a, now) {
  const when = `${fmtDay(a.at)}${a.timeSet ? ` lúc ${fmtTime(a.at)}` : ''}`;
  if (a.done) return `${when} · đã khám`;
  const d = daysUntil(a.at, now);
  if (d < 0) return `${when} · đã qua ${-d} ngày, chưa ghi đã khám`;
  if (d === 0) return `${when} · hôm nay`;
  if (d === 1) return `${when} · ngày mai`;
  return `${when} · còn ${d} ngày`;
}

function appointmentDetail(a) {
  return [a.place, a.doctor].filter(Boolean).join(' · ');
}

function setAppointmentDone(a, done) {
  state.store.updateAppointment(a.id, { done, doneAt: done ? Date.now() : null });
  toast(done ? 'Đã ghi đã khám' : 'Đã chuyển về chưa khám', () => state.store.updateAppointment(a.id, { done: a.done, doneAt: a.doneAt ?? null }));
}

function openAppointmentEditor(a) {
  const isNew = !a?.id;
  const date = dateField({ required: true, value: toDateInput(a?.at ?? Date.now()), min: toDateInput(birthAt()) });
  const d = a?.timeSet ? new Date(a.at) : null;
  const time = h('input', { type: 'time', value: d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '' });
  const place = h('input', { type: 'text', maxLength: PLACE_MAX, value: a?.place ?? '', placeholder: 'Bệnh viện, phòng khám' });
  const text = (value, placeholder) => h('input', { type: 'text', maxLength: TEXT_MAX, value: value ?? '', placeholder });
  const doctor = text(a?.doctor, 'Không bắt buộc');
  const reason = text(a?.reason, 'Ví dụ: Tái khám vàng da');
  const note = text(a?.note, 'Ví dụ: Mang sổ khám, sổ tiêm');

  const onSubmit = (ev) => {
    ev.preventDefault();
    if (!date.value) {
      toast('Chọn ngày hẹn');
      return;
    }
    const [y, m, day] = date.value.split('-').map(Number);
    const [hr, min] = time.value ? time.value.split(':').map(Number) : [12, 0];
    const at = new Date(y, m - 1, day, hr, min).getTime();
    if (!Number.isFinite(at) || at < startOfDay(birthAt())) {
      toast('Ngày không hợp lệ');
      return;
    }
    const fields = {
      at,
      timeSet: Boolean(time.value),
      place: place.value.trim() || null,
      doctor: doctor.value.trim() || null,
      reason: reason.value.trim() || null,
      note: note.value.trim() || null,
    };
    if (isNew) state.store.addAppointment({ ...fields, done: false, doneAt: null, by: state.uid });
    else state.store.updateAppointment(a.id, fields);
    closeDialog();
    toast(isNew ? `Đã lưu lịch ${fmtShortDay(at)}` : 'Đã lưu');
  };

  const onDelete = () => {
    const { id, ...fields } = a;
    state.store.removeAppointment(id);
    closeDialog();
    toast('Đã xóa', () => state.store.addAppointment(fields));
  };

  openDialog(
    h('h1', {}, isNew ? 'Thêm lịch tái khám' : 'Sửa lịch tái khám'),
    h('form', { class: 'stack', onsubmit: onSubmit },
      h('label', { class: 'field' }, 'Ngày hẹn', date),
      h('label', { class: 'field' }, 'Giờ hẹn', time),
      h('label', { class: 'field' }, 'Nơi khám', place),
      h('label', { class: 'field' }, 'Bác sĩ', doctor),
      h('label', { class: 'field' }, 'Lý do khám', reason),
      h('label', { class: 'field' }, 'Ghi chú, dặn dò', note),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Đóng'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Lưu')),
      isNew ? null : h('button', {
        class: 'btn block',
        type: 'button',
        onclick: () => {
          closeDialog();
          setAppointmentDone(a, !a.done);
        },
      }, a.done ? 'Chuyển về chưa khám' : '✓ Đã khám'),
      isNew ? null : h('button', { class: 'btn danger block', type: 'button', onclick: onDelete }, 'Xóa lịch này')),
  );
}

function appointmentItem(a, now) {
  const status = a.done ? 'done' : appointmentStatus(a.at, now);
  const detail = appointmentDetail(a);
  return h('li', { class: `appt ${status}` },
    h('button', { type: 'button', onclick: () => openAppointmentEditor(a), 'aria-label': `${a.reason ?? 'Tái khám'}, ${appointmentWhen(a, now)}${detail ? `, ${detail}` : ''}. Chạm để sửa` },
      h('span', { class: 'v-ico', 'aria-hidden': 'true' }, a.done ? '✅' : status === 'past' ? '⚠️' : '🩺'),
      h('span', { class: 'v-text' },
        h('span', {}, a.reason ?? 'Tái khám'),
        h('small', { class: 'when' }, appointmentWhen(a, now)),
        detail ? h('small', {}, detail) : null,
        a.note ? h('small', {}, `📝 ${a.note}`) : null)));
}

function appointmentSection() {
  const now = Date.now();
  const { open, done } = splitAppointments(state.appointments);
  return h('div', { id: 'appointments' },
    h('h2', {}, '🩺 Tái khám'),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => openAppointmentEditor(null) }, '+ Thêm lịch tái khám'),
    h('div', { class: 'card mt' }, open.length
      ? h('ul', { class: 'vaccine-list' }, open.map((a) => appointmentItem(a, now)))
      : h('div', { class: 'empty' }, 'Chưa có lịch tái khám nào sắp tới.')),
    done.length ? h('details', { class: 'card mt' },
      h('summary', {}, `Đã khám (${done.length})`),
      h('ul', { class: 'vaccine-list' }, done.map((a) => appointmentItem(a, now)))) : null);
}

function appointmentCard() {
  const now = Date.now();
  const a = nextAppointment(state.appointments, now);
  if (!a) return null;
  const detail = appointmentDetail(a);
  const cls = a.status === 'past' ? ' late' : a.status === 'upcoming' ? '' : ' due';
  return h('section', { class: `card appt-card${cls}` },
    h('div', { class: 'label' }, a.status === 'past' ? '⚠️ Lịch tái khám đã qua' : '🩺 Lịch tái khám sắp tới'),
    h('ul', {}, h('li', {},
      h('b', {}, a.reason ?? 'Tái khám'),
      h('small', { class: 'when' }, appointmentWhen(a, now)),
      detail ? h('small', {}, detail) : null,
      a.note ? h('small', {}, `📝 ${a.note}`) : null)),
    h('div', { class: 'row-btns' },
      a.status === 'past' || a.status === 'today'
        ? h('button', { class: 'btn', type: 'button', onclick: () => setAppointmentDone(a, true) }, '✓ Đã khám')
        : null,
      h('button', {
        class: 'btn',
        type: 'button',
        onclick: () => {
          state.tab = 'health';
          window.scrollTo(0, 0);
          render();
        },
      }, 'Mở lịch tái khám')));
}

function renderHealth() {
  show(
    h('h1', {}, 'Sức khỏe'),
    babyLine(),
    appointmentSection(),
    growthSection(),
    vaccineSection(),
  );
}

// ---------- Bài viết ----------

// Mỗi lần vẽ tăng số này, để bỏ kết quả tải về muộn khi người dùng đã chuyển màn hình.
let postsView = 0;

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${url}`), { status: res.status });
  return res.text();
}

// Link từ bài này sang bài khác (file .md trong posts/) thì mở ngay trong app.
function onArticleClick(ev) {
  const href = ev.target.closest('a')?.getAttribute('href');
  const match = href && /^posts\/([^#?]+\.md)(?:[#?].*)?$/i.exec(href);
  if (!match) return;
  ev.preventDefault();
  openPost(decodeURIComponent(match[1]));
}

function fmtPostDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

// Ảnh và link tương đối trong bài tính từ thư mục posts/, không phải từ trang app.
function rebasePostUrl(token) {
  if ((token.type === 'image' || token.type === 'link') && !/^(?:[a-z][\w+.-]*:|\/|#)/i.test(token.href)) {
    token.href = `posts/${token.href}`;
  }
}

function loadFailed() {
  return h('div', { class: 'empty' },
    h('p', {}, 'Không tải được. Hãy kiểm tra kết nối rồi thử lại.'),
    h('button', { class: 'btn', type: 'button', onclick: render }, 'Thử lại'));
}

// Mở bài bằng pushState để nút Back của điện thoại quay về danh sách thay vì thoát app.
function openPost(file) {
  state.post = file;
  history.pushState({ post: file }, '');
  window.scrollTo(0, 0);
  render();
}

function closePost() {
  if (history.state?.post) {
    history.back();
  } else {
    state.post = null;
    render();
  }
}

async function renderPostList() {
  const view = ++postsView;
  show(h('h1', {}, 'Bài viết'), h('div', { class: 'empty' }, 'Đang tải...'));
  let posts;
  try {
    posts = JSON.parse(await fetchText('posts/index.json'));
  } catch (err) {
    console.error(err);
    posts = null;
  }
  if (view !== postsView || state.tab !== 'posts') return;
  show(
    h('h1', {}, 'Bài viết'),
    !posts ? loadFailed()
      : !posts.length ? h('div', { class: 'empty' }, 'Chưa có bài viết nào.')
        : h('div', { class: 'card' }, h('ul', { class: 'post-list' }, posts.map((p) => h('li', {},
          h('button', { type: 'button', onclick: () => openPost(p.file) },
            h('span', { class: 'title' }, p.title),
            p.date ? h('span', { class: 'date' }, fmtPostDate(p.date)) : null,
            p.excerpt ? h('span', { class: 'excerpt' }, p.excerpt) : null))))),
  );
}

async function renderPost(file) {
  const view = ++postsView;
  const back = () => h('button', { class: 'btn back', type: 'button', onclick: closePost }, '‹ Danh sách bài');
  show(back(), h('div', { class: 'empty' }, 'Đang tải...'));
  let html;
  try {
    const [{ Marked }, text] = await Promise.all([
      import('./vendor/marked.esm.js'),
      fetchText(`posts/${encodeURIComponent(file)}`),
    ]);
    html = new Marked({ walkTokens: rebasePostUrl }).parse(text.replace(/^﻿/, ''));
  } catch (err) {
    console.error(err);
    html = err.status === 404 ? h('div', { class: 'empty' }, 'Chưa có bài này.') : loadFailed();
  }
  if (view !== postsView || state.tab !== 'posts') return;
  show(back(), typeof html === 'string' ? h('article', { class: 'article', innerHTML: html, onclick: onArticleClick }) : html);
}

function renderPosts() {
  if (state.post) renderPost(state.post);
  else renderPostList();
}

// ---------- Cài đặt ----------

// Mặc định ('time'): tối từ 20h đến 6h sáng, bất kể cài đặt điện thoại.
function applyTheme(theme = 'time') {
  if (theme === 'time') {
    const hr = new Date().getHours();
    theme = hr >= 20 || hr < 6 ? 'dark' : 'light';
  }
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = bg;
}

// Giữ lại ?emulator khi dọn URL, bỏ các tham số khác (vd. của link đăng nhập email).
function cleanUrl() {
  const keep = new URLSearchParams(location.search).has('emulator') ? '?emulator' : '';
  history.replaceState(null, '', `${location.pathname}${keep}`);
}

const appBase = () => `${location.origin}${location.pathname}`;
const inviteLink = () => inviteUrl(appBase(), state.familyId, state.family?.inviteCode ?? '');

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Đã sao chép ${label}`);
  } catch {
    window.prompt(`Sao chép ${label}:`, text);
  }
}

// Hộp xác nhận trong app (không dùng window.confirm). `typed` bắt gõ đúng chữ đó mới cho bấm.
function confirmDialog({ title, text, confirm, danger = true, typed = null }) {
  return new Promise((resolve) => {
    const input = typed ? h('input', { type: 'text', autocomplete: 'off', placeholder: typed, 'aria-label': `Gõ ${typed} để xác nhận` }) : null;
    const done = (ok) => {
      closeDialog();
      resolve(ok);
    };
    openDialog(
      h('h1', {}, title),
      h('p', {}, text),
      typed ? h('p', { class: 'small muted' }, `Gõ "${typed}" để xác nhận.`) : null,
      h('form', {
        class: 'stack',
        onsubmit: (ev) => {
          ev.preventDefault();
          if (typed && input.value.trim() !== typed) {
            toast('Chưa gõ đúng');
            return;
          }
          done(true);
        },
      },
      input,
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, 'Thôi'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'submit' }, confirm))),
    );
    $dialog.addEventListener('cancel', () => resolve(false), { once: true });
  });
}

function relationSelect(value) {
  return h('select', { required: true },
    h('option', { value: '', selected: !value, disabled: true }, 'Chọn...'),
    Object.entries(RELATIONS).map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
}

// Ô nhập hồ sơ bé, dùng khi tạo nhật ký và trong Cài đặt. read() trả về null nếu thiếu/sai.
function profileFields(p = {}) {
  const name = h('input', {
    type: 'text', required: true, maxLength: NAME_MAX, value: p.name ?? '', placeholder: 'Tên ở nhà của bé', autocomplete: 'off',
  });
  const date = dateField({ required: true, value: p.birthAt ? toDateInput(p.birthAt) : '', max: toDateInput(Date.now()) });
  const bt = p.birthAt ? new Date(p.birthAt) : null;
  const time = h('input', { type: 'time', value: bt ? `${pad2(bt.getHours())}:${pad2(bt.getMinutes())}` : '' });
  const sex = h('select', { required: true },
    h('option', { value: '', selected: !p.sex, disabled: true }, 'Chọn...'),
    Object.entries(SEX).map(([v, label]) => h('option', { value: v, selected: v === p.sex }, label)));
  return {
    nodes: [
      h('label', { class: 'field' }, 'Tên bé', name),
      h('label', { class: 'field' }, 'Ngày sinh', date),
      h('label', { class: 'field' }, 'Giờ sinh (không bắt buộc)', time),
      h('label', { class: 'field' }, 'Bé trai hay bé gái (để so biểu đồ tăng trưởng)', sex),
    ],
    read() {
      const n = cleanName(name.value);
      if (!n) return toast('Nhập tên bé'), null;
      const at = parseBirth(date.value, time.value);
      if (at == null) return toast('Ngày sinh không hợp lệ'), null;
      if (!SEX[sex.value]) return toast('Chọn bé trai hay bé gái'), null;
      return { name: n, birthAt: at, sex: sex.value };
    },
  };
}

function babySettings() {
  const p = state.profile;
  if (!isOwner()) {
    return h('section', { class: 'card' },
      h('h2', { style: 'margin-top:0' }, '👶 Hồ sơ bé'),
      h('p', {}, `${p.name ?? 'Bé'} · ${SEX[p.sex] ?? ''} · sinh ${p.birthAt ? fmtDay(p.birthAt) : '?'}`),
      h('p', { class: 'small muted' }, 'Chỉ chủ nhật ký sửa được tên, ngày sinh và giới tính của bé.'),
      mlPerKgRow());
  }
  const fields = profileFields(p);
  return h('section', { class: 'card' },
    h('h2', { style: 'margin-top:0' }, '👶 Hồ sơ bé'),
    h('form', {
      class: 'stack',
      onsubmit: (ev) => {
        ev.preventDefault();
        const v = fields.read();
        if (!v) return;
        state.store.updateProfile({ ...v, updatedAt: Date.now(), by: state.uid });
        toast('Đã lưu hồ sơ bé');
      },
    }, fields.nodes, h('button', { class: 'btn primary block', type: 'submit' }, 'Lưu hồ sơ bé')),
    mlPerKgRow());
}

async function act(promise, done) {
  try {
    await promise;
    if (done) toast(done);
  } catch (err) {
    console.error(err);
    toast(err.code === 'permission-denied' ? 'Bạn không có quyền làm việc này' : 'Không làm được. Hãy thử lại.');
  }
}

function openMemberDialog(m) {
  const self = m.uid === state.uid;
  const owner = isOwner();
  const relation = relationSelect(m.relation);
  const name = h('input', { type: 'text', maxLength: NAME_MAX, value: m.name ?? '', placeholder: 'Tên gọi' });
  const canEdit = self || owner;
  const lastOwner = isLastOwner(state.members, m.uid);
  openDialog(
    h('h1', {}, self ? 'Thông tin của bạn' : (m.name || who(m.uid))),
    h('p', { class: 'small muted' }, `${m.email ?? ''}${m.role === 'owner' ? ' · Chủ nhật ký' : ' · Thành viên'}`),
    canEdit ? h('form', {
      class: 'stack',
      onsubmit: (ev) => {
        ev.preventDefault();
        const n = cleanName(name.value);
        if (!RELATIONS[relation.value] || !n) {
          toast('Nhập tên và chọn quan hệ với bé');
          return;
        }
        closeDialog();
        act(state.store.updateMember(m.uid, { relation: relation.value, name: n }), 'Đã lưu');
      },
    },
    h('label', { class: 'field' }, 'Quan hệ với bé', relation),
    h('label', { class: 'field' }, 'Tên gọi', name),
    h('button', { class: 'btn primary block', type: 'submit' }, 'Lưu')) : null,
    owner && !self ? h('button', {
      class: 'btn block mt',
      type: 'button',
      onclick: () => {
        closeDialog();
        const role = m.role === 'owner' ? 'member' : 'owner';
        act(state.store.updateMember(m.uid, { role }), role === 'owner' ? 'Đã đặt làm chủ' : 'Đã bỏ quyền chủ');
      },
    }, m.role === 'owner' ? 'Bỏ quyền chủ' : 'Đặt làm chủ nhật ký') : null,
    owner && !self ? h('button', {
      class: 'btn danger block mt',
      type: 'button',
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Xóa khỏi nhật ký?',
          text: `${m.name || who(m.uid)} sẽ không xem và ghi được nhật ký này nữa. Các mục họ đã ghi vẫn giữ nguyên.`,
          confirm: 'Xóa khỏi nhật ký',
        });
        if (ok) act(state.store.removeMember(m.uid), 'Đã xóa khỏi nhật ký');
      },
    }, 'Xóa khỏi nhật ký') : null,
    self && m.role === 'owner' && lastOwner ? h('p', { class: 'small muted mt' }, 'Bạn là chủ duy nhất. Muốn rời nhật ký thì đặt người khác làm chủ trước.') : null,
    h('button', { class: 'btn block mt', type: 'button', onclick: closeDialog }, 'Đóng'),
  );
}

function membersSettings() {
  const owner = isOwner();
  const sorted = [...state.members].sort((a, b) => (a.role === b.role ? (a.joinedAt ?? 0) - (b.joinedAt ?? 0) : a.role === 'owner' ? -1 : 1));
  return h('section', { class: 'card', id: 'members' },
    h('h2', { style: 'margin-top:0' }, '👪 Thành viên'),
    owner && state.requests.length ? h('div', { class: 'stack' },
      h('p', {}, h('b', {}, `${state.requests.length} người xin tham gia`)),
      state.requests.map((r) => h('div', { class: 'card request' },
        h('p', {}, h('b', {}, `${RELATIONS[r.relation] ?? ''} ${r.name ?? ''}`), h('br'), h('small', { class: 'muted' }, r.email ?? '')),
        h('div', { class: 'row-btns' },
          h('button', { class: 'btn', type: 'button', onclick: () => act(state.store.reject(r.uid), 'Đã từ chối') }, 'Từ chối'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => act(state.store.approve(r), `Đã duyệt ${r.name ?? ''}`) }, 'Duyệt'))))) : null,
    h('ul', { class: 'timeline member-list' }, sorted.map((m) => h('li', {},
      h('button', { type: 'button', onclick: () => openMemberDialog(m) },
        h('span', {}, m.role === 'owner' ? '⭐' : '👤'),
        h('span', {}, `${RELATIONS[m.relation] ?? ''}${m.name ? ` · ${m.name}` : ''}`, m.uid === state.uid ? h('small', { class: 'muted' }, ' (bạn)') : null),
        h('span', { class: 'who' }, m.role === 'owner' ? 'Chủ' : ''))))),
    h('h3', {}, 'Mời người trong nhà'),
    h('p', { class: 'small muted' }, 'Gửi link này cho người nhà. Họ đăng nhập rồi bấm "Xin tham gia", chủ nhật ký duyệt thì mới xem và ghi được.'),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => copyText(inviteLink(), 'link mời') }, 'Sao chép link mời'),
    owner ? h('button', {
      class: 'btn block mt',
      type: 'button',
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Đổi link mời?', text: 'Link cũ sẽ không dùng được nữa. Những người đã là thành viên không bị ảnh hưởng.', confirm: 'Đổi link', danger: false,
        });
        if (ok) act(state.store.rotateInvite(randomHex()), 'Đã đổi link mời');
      },
    }, 'Đổi link mời (link cũ hết hiệu lực)') : null);
}

async function leaveFamily() {
  if (isLastOwner(state.members, state.uid) && state.members.length > 1) {
    toast('Hãy đặt người khác làm chủ trước khi rời');
    return;
  }
  if (state.members.length === 1) {
    toast('Bạn là người duy nhất. Hãy dùng "Xóa nhật ký" nếu không dùng nữa.');
    return;
  }
  const ok = await confirmDialog({
    title: 'Rời nhật ký?', text: `Bạn sẽ không xem và ghi được nhật ký của ${babyName()} nữa, cho đến khi được mời và duyệt lại.`, confirm: 'Rời nhật ký',
  });
  if (!ok) return;
  try {
    await state.store.removeMember(state.uid);
    set('nkb.family', '');
    toast('Đã rời nhật ký');
    route();
  } catch (err) {
    console.error(err);
    toast('Không rời được. Hãy thử lại.');
  }
}

async function deleteFamily() {
  const ok = await confirmDialog({
    title: 'Xóa toàn bộ nhật ký?',
    text: `Mọi cữ bú, tã, giấc ngủ, cân đo, tiêm chủng, lịch khám, việc cần làm và thành viên của nhật ký ${babyName()} sẽ bị xóa vĩnh viễn, không khôi phục được.`,
    confirm: 'Xóa vĩnh viễn',
    typed: babyName(),
  });
  if (!ok) return;
  show(h('div', { class: 'empty' }, 'Đang xóa...'));
  const store = state.store;
  stopFamily();
  try {
    await store.deleteFamily(state.uid);
    set('nkb.family', '');
    toast('Đã xóa nhật ký');
  } catch (err) {
    console.error(err);
    toast('Chưa xóa xong. Hãy mở lại nhật ký và thử lại.');
  }
  route();
}

// Rời hoặc xóa mọi nhật ký của mình rồi xóa tài khoản đăng nhập.
async function deleteAccount() {
  const ok = await confirmDialog({
    title: 'Xóa tài khoản?',
    text: 'Bạn sẽ rời mọi nhật ký. Nhật ký chỉ có mình bạn sẽ bị xóa luôn. Nếu bạn là chủ duy nhất của một nhật ký có người khác, hãy đặt người khác làm chủ trước.',
    confirm: 'Xóa tài khoản',
    typed: 'XÓA',
  });
  if (!ok) return;
  const { backend, uid } = state;
  show(h('div', { class: 'empty' }, 'Đang xóa...'));
  stopFamily();
  try {
    const mine = await backend.myFamilies(uid);
    for (const m of mine) {
      const fam = backend.openFamily(m.familyId);
      const members = await fam.listMembers();
      if (members.length === 1) await fam.deleteFamily(uid);
      else if (isLastOwner(members, uid)) {
        toast('Bạn đang là chủ duy nhất của một nhật ký có người khác. Hãy đặt người khác làm chủ trước.');
        route();
        return;
      } else await fam.removeMember(uid);
    }
    await backend.deleteUser();
    set('nkb.family', '');
    toast('Đã xóa tài khoản');
  } catch (err) {
    console.error(err);
    toast(err.code === 'auth/requires-recent-login'
      ? 'Vì an toàn, hãy đăng xuất, đăng nhập lại rồi xóa tài khoản.'
      : 'Chưa xóa xong. Hãy thử lại.');
    route();
  }
}

function accountSettings() {
  const owner = isOwner();
  return h('section', { class: 'card' },
    h('h2', { style: 'margin-top:0' }, '🔐 Tài khoản'),
    h('p', { class: 'small' }, `Đang đăng nhập: ${state.user?.email ?? ''}`),
    h('div', { class: 'stack' },
      h('button', { class: 'btn block', type: 'button', onclick: () => route({ pick: true }) }, 'Đổi nhật ký / tạo nhật ký khác'),
      h('button', { class: 'btn block', type: 'button', onclick: () => state.backend.signOut() }, 'Đăng xuất'),
      h('button', { class: 'btn danger block', type: 'button', onclick: leaveFamily }, 'Rời nhật ký này'),
      owner ? h('button', { class: 'btn danger block', type: 'button', onclick: deleteFamily }, 'Xóa toàn bộ nhật ký này') : null,
      h('button', { class: 'btn danger block', type: 'button', onclick: deleteAccount }, 'Xóa tài khoản')));
}

function privacyNote() {
  return h('details', { class: 'card' },
    h('summary', {}, '🛡️ Quyền riêng tư'),
    h('div', { class: 'small stack tight' },
      h('p', {}, 'App lưu: email đăng nhập, tên gọi và quan hệ với bé của từng thành viên, hồ sơ bé (tên, ngày giờ sinh, giới tính) và những gì cả nhà ghi (cữ bú, tã, giấc ngủ, cân đo, tiêm chủng, lịch khám, việc cần làm).'),
      h('p', {}, 'Dữ liệu nằm trên Google Firebase (Firestore, khu vực Singapore). Chỉ thành viên đã được chủ nhật ký duyệt mới đọc và ghi được. Người làm app không bán, không quảng cáo, không phân tích dữ liệu của bạn.'),
      h('p', {}, 'Bạn có thể rời nhật ký, xóa toàn bộ nhật ký (chủ) hoặc xóa tài khoản bất cứ lúc nào ở mục Tài khoản bên trên.'),
      h('p', {}, 'Biểu đồ, lịch tiêm và giờ nhắc chỉ để tham khảo, không thay cho chỉ định của bác sĩ.')));
}

function renderSettings() {
  const currentTheme = get('nkb.theme') || 'time';
  show(
    h('h1', {}, 'Cài đặt'),
    h('div', { class: 'stack' },
      membersSettings(),
      babySettings(),
      h('label', { class: 'field' }, 'Giao diện',
        h('select', {
          onchange: (ev) => {
            set('nkb.theme', ev.target.value);
            applyTheme(ev.target.value);
          },
        }, Object.entries(THEMES).map(([v, label]) => h('option', { value: v, selected: v === currentTheme }, label)))),
      accountSettings(),
      privacyNote()),
  );
}

function requestsCard() {
  if (!isOwner() || !state.requests.length) return null;
  return h('section', { class: 'card appt-card due' },
    h('div', { class: 'label' }, '👪 Có người xin tham gia'),
    h('p', {}, state.requests.map((r) => `${RELATIONS[r.relation] ?? ''} ${r.name ?? ''}`.trim()).join(', ')),
    h('button', {
      class: 'btn block',
      type: 'button',
      onclick: () => {
        state.tab = 'settings';
        window.scrollTo(0, 0);
        render();
      },
    }, 'Xem và duyệt'));
}

// ---------- Khung app ----------

const TABS = [
  ['today', '🏠', 'Hôm nay', renderToday],
  ['history', '📖', 'Lịch sử', renderHistory],
  ['todos', '✅', 'Việc', renderTodos],
  ['charts', '📊', 'Biểu đồ', renderCharts],
  ['health', '💉', 'Sức khỏe', renderHealth],
  ['posts', '📝', 'Bài viết', renderPosts],
  ['settings', '⚙️', 'Cài đặt', renderSettings],
];

// Hồ sơ bé chưa có ngày sinh (nhật ký cũ hoặc tạo dở): chủ nhập, người khác chờ.
function renderNeedProfile() {
  $tabs.hidden = true;
  if (!isOwner()) {
    show(
      h('h1', {}, 'Chưa có hồ sơ bé'),
      h('p', { class: 'muted' }, 'Chủ nhật ký cần nhập tên và ngày sinh của bé trước.'),
      h('button', { class: 'btn block', type: 'button', onclick: () => route({ pick: true }) }, 'Đổi nhật ký'));
    return;
  }
  const fields = profileFields(state.profile);
  show(
    h('h1', {}, 'Hồ sơ bé'),
    h('form', {
      class: 'stack',
      onsubmit: (ev) => {
        ev.preventDefault();
        const v = fields.read();
        if (v) state.store.updateProfile({ ...v, updatedAt: Date.now(), by: state.uid });
      },
    }, fields.nodes, h('button', { class: 'btn primary block', type: 'submit' }, 'Lưu')));
}

function render() {
  stopListening();
  renderBanners();
  if (!state.store) return;
  if (!state.loaded.members || !state.loaded.profile) {
    $tabs.hidden = true;
    show(h('div', { class: 'empty' }, 'Đang tải...'));
    return;
  }
  if (!state.profile.birthAt) {
    renderNeedProfile();
    return;
  }
  const pending = isOwner() ? state.requests.length : 0;
  $tabs.hidden = false;
  $tabs.replaceChildren(...TABS.map(([key, icon, label]) => h('button', {
    type: 'button',
    ...(key === state.tab ? { 'aria-current': 'page' } : {}),
    onclick: () => {
      // Đang đọc bài mà đổi tab thì bỏ luôn mục lịch sử của bài, để Back không bị thừa một lần.
      if (state.post) {
        state.post = null;
        if (history.state?.post) history.back();
      }
      state.tab = key;
      window.scrollTo(0, 0);
      render();
    },
  }, h('span', { 'aria-hidden': 'true' }, icon), key === 'settings' && pending ? `${label} (${pending})` : label)));
  TABS.find(([key]) => key === state.tab)[3]();
}

// Chỉ vẽ lại màn hình đang xem khi cần, để không làm mất nội dung đang nhập ở Cài đặt.
function renderLive() {
  renderBanners();
  if (!state.store) return;
  if (!state.loaded.members || !state.loaded.profile || !state.profile.birthAt || $tabs.hidden
    || state.tab === 'today' || state.tab === 'charts' || state.tab === 'health') render();
}

function onSyncError(err) {
  console.error(err);
  state.syncError = true;
  renderBanners();
}

function onWriteError(err) {
  console.error(err);
  toast(err.code === 'permission-denied' ? 'Không lưu được: bạn không còn quyền ghi nhật ký này.' : 'Không lưu được. Hãy thử lại.');
}

// Ngừng mọi listener của nhật ký đang mở và xóa dữ liệu khỏi bộ nhớ.
function stopFamily() {
  state.stops.forEach((stop) => stop?.());
  state.stops = [];
  state.stopHistory?.();
  state.stopHistory = null;
  Object.assign(state, {
    store: null, familyId: null, family: null, members: [], requests: [], recent: [], historyEvents: [], todos: [],
    profile: {}, measurements: [], vaccines: [], appointments: [], post: null, syncError: false,
    loaded: { members: false, profile: false },
  });
}

function openFamily(familyId) {
  stopFamily();
  set('nkb.family', familyId);
  state.familyId = familyId;
  state.store = state.backend.openFamily(familyId);
  state.tab = 'today';
  render();
  const { store } = state;
  const live = (fn) => (data) => {
    if (state.store !== store) return;
    fn(data);
  };
  let watchingRequests = false;
  state.stops.push(
    store.subscribeMembers(live((list) => {
      state.members = list;
      state.loaded.members = true;
      if (!list.some((m) => m.uid === state.uid)) {
        // Bị xóa khỏi nhật ký (hoặc nhật ký đã bị xóa).
        set('nkb.family', '');
        toast('Bạn không còn trong nhật ký này');
        route();
        return;
      }
      if (isOwner() && !watchingRequests) {
        watchingRequests = true;
        state.stops.push(store.subscribeRequests(live((reqs) => {
          state.requests = reqs;
          if (state.tab === 'settings') render();
          else renderLive();
        }), console.error));
      }
      if (state.tab === 'settings') render();
      else renderLive();
    }), (err) => {
      console.error(err);
      set('nkb.family', '');
      route();
    }),
    store.subscribeFamily(live((family) => { state.family = family; }), onSyncError),
    store.subscribe(addDays(startOfDay(Date.now()), -7), null, live((events) => {
      // Giữ 7 ngày cho biểu đồ và thêm 1 ngày để vẫn nhắc đúng khi cữ cuối ở ngày trước đó.
      state.recent = events;
      state.syncError = false;
      renderLive();
    }), onSyncError),
    store.subscribeProfile(live((profile) => {
      const first = !state.loaded.profile || !state.profile.birthAt;
      state.profile = profile;
      state.loaded.profile = true;
      if (first) render();
      else renderLive();
    }), onSyncError),
    store.subscribeMeasurements(live((list) => {
      state.measurements = list;
      renderLive();
    }), onSyncError),
    store.subscribeVaccines(live((list) => {
      state.vaccines = list;
      renderLive();
    }), onSyncError),
    store.subscribeAppointments(live((list) => {
      state.appointments = list;
      renderLive();
    }), onSyncError),
    store.subscribeTodos(live((todos) => {
      state.todos = todos;
      if (state.tab === 'todos') renderTodoList();
    }), onSyncError),
  );
  watchHistory();
}

// ---------- Đăng nhập ----------

const AUTH_ERRORS = {
  'auth/network-request-failed': 'Không có mạng. Hãy kiểm tra kết nối.',
  'auth/invalid-email': 'Email không đúng.',
  'auth/invalid-action-code': 'Link đăng nhập đã hết hạn hoặc đã dùng. Hãy gửi link mới.',
  'auth/expired-action-code': 'Link đăng nhập đã hết hạn. Hãy gửi link mới.',
  'auth/quota-exceeded': 'Hôm nay app đã gửi quá nhiều email. Hãy đăng nhập bằng Google hoặc thử lại ngày mai.',
  'auth/too-many-requests': 'Thử quá nhiều lần. Hãy đợi một lúc rồi thử lại.',
  'auth/unauthorized-domain': 'Tên miền này chưa được phép đăng nhập.',
  'auth/user-disabled': 'Tài khoản này đã bị khóa.',
};

function authError(err) {
  if (!err || err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
  console.error(err);
  toast(AUTH_ERRORS[err.code] ?? 'Đăng nhập không được. Hãy thử lại.');
}

// Link đăng nhập từ email (mở thẳng hoặc dán vào). Cần email đã nhập lúc gửi link.
async function finishEmailLink(url, email) {
  try {
    await state.backend.signInEmailLink(email, url);
    set('nkb.email', email);
    state.pendingEmailLink = null;
    cleanUrl();
  } catch (err) {
    authError(err);
    state.pendingEmailLink = null;
    cleanUrl();
    route();
  }
}

function renderSignIn() {
  $tabs.hidden = true;
  const { backend } = state;
  const invited = Boolean(parseInvite(get('nkb.join') ?? ''));

  if (state.pendingEmailLink) {
    const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'Email đã nhận link' });
    show(
      h('h1', {}, 'Hoàn tất đăng nhập'),
      h('p', { class: 'muted' }, 'Nhập lại email bạn đã dùng để nhận link đăng nhập.'),
      h('form', {
        class: 'inline',
        onsubmit: (ev) => {
          ev.preventDefault();
          finishEmailLink(state.pendingEmailLink, email.value.trim());
        },
      }, email, h('button', { class: 'btn primary', type: 'submit' }, 'Đăng nhập')));
    return;
  }

  const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'ban@example.com', value: get('nkb.email') ?? '' });
  const pasted = h('input', { type: 'url', placeholder: 'Dán link đăng nhập từ email', 'aria-label': 'Link đăng nhập' });
  const sent = h('p', { class: 'small', hidden: true });
  show(
    h('h1', {}, 'Tiny Days'),
    h('p', { class: 'muted' }, 'Ghi cữ bú, hút sữa, thay tã, giấc ngủ, cân đo và tiêm chủng của bé. Cả nhà cùng xem trên điện thoại của mình.'),
    invited ? h('p', { class: 'card' }, '📩 Bạn được mời vào nhật ký của một bé. Đăng nhập để xin tham gia.') : null,
    h('section', { class: 'card stack' },
      h('button', {
        class: 'btn primary block',
        type: 'button',
        onclick: () => backend.signInGoogle().catch(authError),
      }, backend.isDemo ? 'Vào chế độ thử' : 'Đăng nhập bằng Google')),
    backend.isDemo ? null : h('section', { class: 'card stack mt' },
      h('h2', { style: 'margin:0' }, 'Hoặc nhận link đăng nhập qua email'),
      h('p', { class: 'small muted' }, 'Không cần mật khẩu. Bấm link trong email là vào được.'),
      h('form', {
        class: 'inline',
        onsubmit: async (ev) => {
          ev.preventDefault();
          const value = email.value.trim();
          try {
            await backend.sendEmailLink(value);
            set('nkb.email', value);
            sent.hidden = false;
            sent.textContent = `Đã gửi link tới ${value}. Mở email (xem cả mục Spam) và bấm link. Nếu bạn dùng app đã cài ra màn hình chính trên iPhone, hãy giữ tay vào link trong email, chọn Sao chép, rồi dán vào ô bên dưới.`;
          } catch (err) {
            authError(err);
          }
        },
      }, email, h('button', { class: 'btn', type: 'submit' }, 'Gửi link')),
      sent,
      h('form', {
        class: 'inline',
        onsubmit: (ev) => {
          ev.preventDefault();
          const url = pasted.value.trim();
          if (!backend.isEmailLink(url)) {
            toast('Đây không phải link đăng nhập');
            return;
          }
          const saved = get('nkb.email');
          if (saved) finishEmailLink(url, saved);
          else {
            state.pendingEmailLink = url;
            renderSignIn();
          }
        },
      }, pasted, h('button', { class: 'btn', type: 'submit' }, 'Vào'))),
    h('p', { class: 'small muted mt' }, 'Dữ liệu của bé chỉ thành viên được duyệt mới xem được. Xem thêm mục Quyền riêng tư trong Cài đặt.'),
  );
}

// ---------- Tạo / vào nhật ký ----------

function signOutLink() {
  return h('button', { class: 'link mt', type: 'button', onclick: () => state.backend.signOut() }, `Đăng xuất (${state.user?.email ?? ''})`);
}

function renderCreate(hasOthers = false) {
  $tabs.hidden = true;
  const fields = profileFields();
  const relation = relationSelect();
  const myName = h('input', { type: 'text', required: true, maxLength: NAME_MAX, value: state.user?.name ?? '', placeholder: 'Tên gọi của bạn' });
  const link = h('input', { type: 'url', placeholder: 'Dán link mời vào đây', 'aria-label': 'Link mời' });
  let busy = false;
  show(
    h('h1', {}, 'Tiny Days'),
    h('section', { class: 'card stack' },
      h('h2', { style: 'margin:0' }, 'Được người nhà mời?'),
      h('p', { class: 'small muted' }, 'Mở link mời họ gửi, hoặc dán vào đây.'),
      h('form', {
        class: 'inline',
        onsubmit: (ev) => {
          ev.preventDefault();
          if (!parseInvite(link.value)) {
            toast('Link mời không đúng');
            return;
          }
          set('nkb.join', link.value.trim());
          route();
        },
      }, link, h('button', { class: 'btn primary', type: 'submit' }, 'Vào'))),
    h('section', { class: 'card stack mt' },
      h('h2', { style: 'margin:0' }, 'Tạo nhật ký mới cho bé'),
      h('form', {
        class: 'stack',
        onsubmit: async (ev) => {
          ev.preventDefault();
          if (busy) return;
          const p = fields.read();
          if (!p) return;
          const n = cleanName(myName.value);
          if (!RELATIONS[relation.value] || !n) {
            toast('Nhập tên gọi và chọn bạn là gì của bé');
            return;
          }
          busy = true;
          try {
            const fid = await state.backend.createFamily({
              uid: state.uid,
              inviteCode: randomHex(),
              member: { relation: relation.value, name: n, email: state.user.email ?? null },
              profile: { ...p, weightKg: null },
            });
            openFamily(fid);
          } catch (err) {
            busy = false;
            console.error(err);
            toast('Không tạo được. Hãy kiểm tra mạng và thử lại.');
          }
        },
      },
      fields.nodes,
      h('label', { class: 'field' }, 'Bạn là gì của bé', relation),
      h('label', { class: 'field' }, 'Tên gọi của bạn', myName),
      h('button', { class: 'btn primary block', type: 'submit' }, 'Tạo nhật ký'))),
    hasOthers ? h('button', { class: 'btn block mt', type: 'button', onclick: () => route({ pick: true }) }, '‹ Quay lại danh sách nhật ký') : null,
    signOutLink(),
  );
}

async function renderFamilyPicker(mine) {
  $tabs.hidden = true;
  show(h('div', { class: 'empty' }, 'Đang tải...'));
  const names = await Promise.all(mine.map((m) => state.backend.getProfile(m.familyId).then((p) => p?.name ?? 'Bé', () => 'Bé')));
  show(
    h('h1', {}, 'Chọn nhật ký'),
    h('div', { class: 'stack' }, mine.map((m, i) => h('button', {
      class: 'btn block',
      type: 'button',
      onclick: () => openFamily(m.familyId),
    }, `👶 ${names[i]}${m.role === 'owner' ? ' ⭐' : ''}`))),
    h('button', { class: 'btn block mt', type: 'button', onclick: () => renderCreate(true) }, '+ Tạo nhật ký mới hoặc vào bằng link mời'),
    signOutLink(),
  );
}

function clearJoin() {
  set('nkb.join', '');
}

function renderWaiting({ familyId }) {
  $tabs.hidden = true;
  show(
    h('h1', {}, 'Đang chờ duyệt'),
    h('p', {}, 'Đã gửi yêu cầu tham gia. Nhắn chủ nhật ký mở app, vào Cài đặt › Thành viên để duyệt. Khi được duyệt, app tự mở nhật ký.'),
    h('button', {
      class: 'btn block mt',
      type: 'button',
      onclick: async () => {
        await state.backend.cancelRequest(familyId, state.uid).catch(console.error);
        clearJoin();
        route();
      },
    }, 'Hủy yêu cầu'),
    signOutLink(),
  );
  const stop = state.backend.watchMembership(familyId, state.uid, (ok) => {
    if (!ok) return;
    stop();
    clearJoin();
    toast('Đã được duyệt');
    openFamily(familyId);
  });
  state.stops.push(stop);
}

async function renderJoin(invite) {
  $tabs.hidden = true;
  show(h('div', { class: 'empty' }, 'Đang mở link mời...'));
  const { backend, uid } = state;
  if (await backend.isMember(invite.familyId, uid)) {
    clearJoin();
    openFamily(invite.familyId);
    return;
  }
  if (await backend.getRequest(invite.familyId, uid)) {
    renderWaiting(invite);
    return;
  }
  const relation = relationSelect();
  const myName = h('input', { type: 'text', required: true, maxLength: NAME_MAX, value: state.user?.name ?? '', placeholder: 'Tên gọi của bạn' });
  show(
    h('h1', {}, 'Xin tham gia nhật ký'),
    h('p', { class: 'muted' }, 'Chủ nhật ký sẽ thấy tên, quan hệ với bé và email của bạn để duyệt.'),
    h('form', {
      class: 'stack',
      onsubmit: async (ev) => {
        ev.preventDefault();
        const n = cleanName(myName.value);
        if (!RELATIONS[relation.value] || !n) {
          toast('Nhập tên gọi và chọn bạn là gì của bé');
          return;
        }
        try {
          await backend.requestJoin(invite.familyId, uid, {
            inviteCode: invite.code, relation: relation.value, name: n, email: state.user.email ?? null,
          });
          renderWaiting(invite);
        } catch (err) {
          console.error(err);
          if (err.code === 'permission-denied') {
            clearJoin();
            toast('Link mời đã hết hạn hoặc không đúng. Hãy xin người nhà gửi link mới.');
            route();
          } else toast('Không gửi được. Hãy kiểm tra mạng và thử lại.');
        }
      },
    },
    h('label', { class: 'field' }, 'Bạn là gì của bé', relation),
    h('label', { class: 'field' }, 'Tên gọi của bạn', myName),
    h('button', { class: 'btn primary block', type: 'submit' }, 'Xin tham gia')),
    h('button', {
      class: 'btn block mt',
      type: 'button',
      onclick: () => {
        clearJoin();
        route();
      },
    }, 'Không tham gia'),
    signOutLink(),
  );
}

function renderOffline() {
  $tabs.hidden = true;
  show(
    h('h1', {}, 'Chưa kết nối được'),
    h('p', {}, 'Hãy kiểm tra kết nối rồi thử lại.'),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => location.reload() }, 'Thử lại'),
  );
}

// Quyết định màn hình theo trạng thái đăng nhập, link mời đang chờ và nhật ký đã chọn.
let routeRun = 0;
async function route({ pick = false } = {}) {
  const run = ++routeRun;
  stopFamily();
  closeDialog();
  $tabs.hidden = true;
  renderBanners();
  if (!state.user) {
    renderSignIn();
    return;
  }
  const invite = parseInvite(get('nkb.join') ?? '');
  if (invite) {
    renderJoin(invite);
    return;
  }
  show(h('div', { class: 'empty' }, 'Đang tải...'));
  let mine;
  try {
    mine = await state.backend.myFamilies(state.uid);
  } catch (err) {
    console.error(err);
    if (run === routeRun) renderOffline();
    return;
  }
  if (run !== routeRun) return;
  const saved = get('nkb.family');
  const chosen = pick ? null : mine.find((m) => m.familyId === saved) ?? (mine.length === 1 ? mine[0] : null);
  if (chosen) openFamily(chosen.familyId);
  else if (mine.length) renderFamilyPicker(mine);
  else renderCreate();
}

async function boot() {
  const refreshTheme = () => applyTheme(get('nkb.theme') || undefined);
  refreshTheme();
  setInterval(refreshTheme, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshTheme();
  });

  // Link mời: lưu lại để dùng sau khi đăng nhập (kể cả khi phải chuyển trang để đăng nhập).
  if (parseInvite(location.hash)) {
    set('nkb.join', location.hash);
    cleanUrl();
  }

  show(h('div', { class: 'empty' }, 'Đang tải...'));
  try {
    const isConfigured = Boolean(firebaseConfig.projectId) || new URLSearchParams(location.search).has('emulator');
    if (isConfigured) {
      const { createBackend } = await import('./store.js');
      state.backend = await createBackend(onWriteError);
    } else {
      const { createDemoBackend } = await import('./store-demo.js');
      state.backend = createDemoBackend();
    }
  } catch (err) {
    console.error(err);
    renderOffline();
    return;
  }
  authError(state.backend.redirectError);

  if (state.backend.isEmailLink(location.href)) {
    const saved = get('nkb.email');
    if (saved) await finishEmailLink(location.href, saved);
    else state.pendingEmailLink = location.href;
  }

  state.backend.onUser((user) => {
    const changed = (user?.uid ?? null) !== state.uid;
    state.user = user;
    state.uid = user?.uid ?? null;
    if (changed || !user) route();
  });

  let shownDay = startOfDay(Date.now());
  const tick = () => {
    const day = startOfDay(Date.now());
    if (day !== shownDay) {
      if (state.store && state.historyDay === shownDay) setHistoryDay(day);
      shownDay = day;
    }
    renderLive();
  };
  setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
  window.addEventListener('online', renderBanners);
  window.addEventListener('offline', renderBanners);
  window.addEventListener('popstate', (ev) => {
    if (!state.store) return;
    const post = ev.state?.post ?? null;
    if (post === state.post) return;
    state.post = post;
    if (post) state.tab = 'posts';
    window.scrollTo(0, 0);
    render();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
}

boot();
