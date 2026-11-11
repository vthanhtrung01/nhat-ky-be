// Chế độ thử khi chưa cấu hình Firebase: cùng giao diện với store.js, dữ liệu nằm trong localStorage.
// Một người dùng giả, một nhật ký duy nhất, mình là chủ.
const PREFIX = 'nkb.demo.';
const DEMO_USER = { uid: 'demo-user', email: 'demo@example.com', name: 'Bạn', verified: true };
const DEMO_FAMILY = 'demofamily0000000000';

function read(name, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + name)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function createDemoBackend() {
  const listeners = new Set();
  const channel = new BroadcastChannel('nkb-demo');
  const notify = () => listeners.forEach((fn) => fn());
  channel.onmessage = notify;
  const write = (name, value) => {
    localStorage.setItem(PREFIX + name, JSON.stringify(value));
    notify();
    channel.postMessage('changed');
  };
  const watch = (emit) => {
    listeners.add(emit);
    emit();
    return () => listeners.delete(emit);
  };
  // Một danh sách tài liệu có id, cùng các hàm thêm/sửa/xóa.
  const coll = (name) => ({
    all: () => read(name),
    add(fields) {
      const id = crypto.randomUUID();
      write(name, [...read(name), { ...fields, id }]);
      return id;
    },
    set(id, fields) {
      write(name, [...read(name).filter((x) => x.id !== id), { ...fields, id }]);
      return id;
    },
    update(id, fields) {
      write(name, read(name).map((x) => (x.id === id ? { ...x, ...fields } : x)));
    },
    remove(id) {
      write(name, read(name).filter((x) => x.id !== id));
    },
  });
  const events = coll('events');
  const todos = coll('todos');
  const measurements = coll('measurements');
  const vaccines = coll('vaccines');
  const appointments = coll('appointments');
  const members = coll('members');

  let userCb = null;
  const signedIn = () => read('signedIn', false);

  const family = {
    isDemo: true,
    familyId: DEMO_FAMILY,
    subscribe: (from, to, onData) => watch(() => onData(
      events.all().filter((e) => e.at >= from && (to == null || e.at < to)).sort((a, b) => b.at - a.at),
    )),
    add: events.add,
    update: events.update,
    remove: events.remove,
    subscribeTodos: (onData) => watch(() => onData(todos.all().sort((a, b) => b.createdAt - a.createdAt))),
    addTodo: todos.add,
    updateTodo: todos.update,
    removeTodo: todos.remove,
    subscribeProfile: (onData) => watch(() => onData(read('profile', {}))),
    updateProfile: (fields) => write('profile', { ...read('profile', {}), ...fields }),
    subscribeMeasurements: (onData) => watch(() => onData(measurements.all().sort((a, b) => b.at - a.at))),
    addMeasurement: measurements.add,
    updateMeasurement: measurements.update,
    removeMeasurement: measurements.remove,
    subscribeVaccines: (onData) => watch(() => onData(vaccines.all())),
    setVaccine: (id, fields) => vaccines.set(id ?? crypto.randomUUID(), fields),
    removeVaccine: vaccines.remove,
    subscribeAppointments: (onData) => watch(() => onData(appointments.all().sort((a, b) => a.at - b.at))),
    addAppointment: appointments.add,
    updateAppointment: appointments.update,
    removeAppointment: appointments.remove,
    subscribeFamily: (onData) => watch(() => onData(read('family', null))),
    subscribeMembers: (onData) => watch(() => onData(members.all())),
    listMembers: async () => members.all(),
    subscribeRequests: (onData) => watch(() => onData([])),
    approve: async () => {},
    reject: async () => {},
    updateMember: async (uid, fields) => members.update(uid, fields),
    removeMember: async (uid) => members.remove(uid),
    rotateInvite: async (inviteCode) => write('family', { ...read('family', {}), inviteCode }),
    async deleteFamily() {
      for (const name of ['events', 'todos', 'measurements', 'vaccines', 'appointments', 'members', 'profile', 'family']) {
        localStorage.removeItem(PREFIX + name);
      }
      notify();
    },
  };

  return {
    isDemo: true,
    redirectError: null,
    onUser(cb) {
      userCb = cb;
      cb(signedIn() ? DEMO_USER : null);
      return () => { userCb = null; };
    },
    async signInGoogle() {
      write('signedIn', true);
      userCb?.(DEMO_USER);
    },
    async sendEmailLink() {
      throw Object.assign(new Error('demo'), { code: 'demo' });
    },
    isEmailLink: () => false,
    async signInEmailLink() {},
    async signOut() {
      write('signedIn', false);
      userCb?.(null);
    },
    async deleteUser() {
      await this.signOut();
    },
    async myFamilies() {
      return members.all().filter((m) => m.uid === DEMO_USER.uid).map((m) => ({ familyId: DEMO_FAMILY, ...m }));
    },
    async createFamily({ uid, inviteCode, member, profile }) {
      const now = Date.now();
      write('family', { id: DEMO_FAMILY, inviteCode, createdAt: now, createdBy: uid });
      members.set(uid, { ...member, uid, role: 'owner', joinedAt: now });
      write('profile', { ...profile, updatedAt: now, by: uid });
      return DEMO_FAMILY;
    },
    getProfile: async () => read('profile', null),
    isMember: async (fid, uid) => fid === DEMO_FAMILY && members.all().some((m) => m.uid === uid),
    getRequest: async () => null,
    requestJoin: async () => {},
    cancelRequest: async () => {},
    watchMembership: () => () => {},
    openFamily: () => family,
  };
}
