// Đọc/ghi Firestore và đăng nhập. Các lệnh ghi dữ liệu nhật ký không await: khi mất mạng,
// promise chỉ hoàn tất sau khi có mạng lại, còn listener đã nhận thay đổi từ bộ nhớ đệm ngay lập tức.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  GoogleAuthProvider, connectAuthEmulator, getAuth, getRedirectResult, isSignInWithEmailLink, onAuthStateChanged,
  sendSignInLinkToEmail, signInWithEmailLink, signInWithPopup, signInWithRedirect, signOut,
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  Timestamp, collection, collectionGroup, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, initializeFirestore,
  limit, onSnapshot, orderBy, persistentLocalCache, persistentMultipleTabManager, query, setDoc, updateDoc, where, writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const useEmulator = new URLSearchParams(location.search).has('emulator');

// Các trường thời gian lưu dạng Timestamp trên Firestore, còn trong app là số ms.
const TIME_FIELDS = ['at', 'endAt', 'createdAt', 'doneAt', 'updatedAt', 'dueAt', 'birthAt', 'joinedAt'];
// Các collection dữ liệu của một nhật ký, dùng khi xóa cả nhật ký.
const DATA_COLLECTIONS = ['events', 'todos', 'profile', 'measurements', 'vaccines', 'appointments', 'settings', 'requests'];

function fromDoc(snapshot) {
  const data = { id: snapshot.id, ...snapshot.data() };
  for (const k of TIME_FIELDS) if (data[k] instanceof Timestamp) data[k] = data[k].toMillis();
  return data;
}

function toDoc(fields) {
  const data = { ...fields };
  for (const k of TIME_FIELDS) if (typeof data[k] === 'number') data[k] = Timestamp.fromMillis(data[k]);
  return data;
}

// PWA trên iPhone/iPad không mở được cửa sổ popup: chuyển trang để đăng nhập.
function preferRedirect() {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  return Boolean(standalone) && /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export async function createBackend(onWriteError) {
  const config = useEmulator ? { apiKey: 'demo', projectId: 'demo-nkb', appId: 'demo', authDomain: location.host } : firebaseConfig;
  const app = initializeApp(config);
  const auth = getAuth(app);
  auth.languageCode = 'vi';
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  // Lỗi của lần đăng nhập bằng chuyển trang (nếu có) trả về cho app hiện.
  const redirectError = await getRedirectResult(auth).then(() => null, (err) => err);

  const families = collection(db, 'families');
  const sub = (fid, name) => collection(db, 'families', fid, name);

  async function deleteAll(ref) {
    for (;;) {
      const snap = await getDocs(query(ref, limit(400)));
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  return {
    isDemo: false,
    redirectError,

    // ---------- Đăng nhập ----------
    onUser(cb) {
      return onAuthStateChanged(auth, (user) => cb(user ? {
        uid: user.uid, email: user.email, name: user.displayName, verified: user.emailVerified,
      } : null));
    },
    async signInGoogle() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (preferRedirect()) return signInWithRedirect(auth, provider);
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
          return signInWithRedirect(auth, provider);
        }
        throw err;
      }
      return null;
    },
    sendEmailLink(email) {
      return sendSignInLinkToEmail(auth, email, {
        url: `${location.origin}${location.pathname}${location.search}`,
        handleCodeInApp: true,
      });
    },
    isEmailLink(url) {
      return isSignInWithEmailLink(auth, url);
    },
    signInEmailLink(email, url) {
      return signInWithEmailLink(auth, email, url);
    },
    signOut() {
      return signOut(auth);
    },
    deleteUser() {
      return auth.currentUser.delete();
    },

    // ---------- Nhật ký của tôi ----------
    async myFamilies(uid) {
      const snap = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)));
      return snap.docs.map((d) => ({ familyId: d.ref.parent.parent.id, ...fromDoc(d) }));
    },
    // Tạo nhật ký: family, chủ đầu tiên và hồ sơ bé trong cùng một lần ghi.
    async createFamily({ uid, inviteCode, member, profile }) {
      const ref = doc(families);
      const now = Date.now();
      const batch = writeBatch(db);
      batch.set(ref, toDoc({ inviteCode, createdAt: now, createdBy: uid }));
      batch.set(doc(ref, 'members', uid), toDoc({ ...member, uid, role: 'owner', joinedAt: now }));
      batch.set(doc(ref, 'profile', 'baby'), toDoc({ ...profile, updatedAt: now, by: uid }));
      await batch.commit();
      return ref.id;
    },
    async getProfile(fid) {
      const snap = await getDoc(doc(db, 'families', fid, 'profile', 'baby'));
      return snap.exists() ? fromDoc(snap) : null;
    },
    async isMember(fid, uid) {
      try {
        return (await getDoc(doc(db, 'families', fid, 'members', uid))).exists();
      } catch {
        return false;
      }
    },
    async getRequest(fid, uid) {
      try {
        const snap = await getDoc(doc(db, 'families', fid, 'requests', uid));
        return snap.exists() ? fromDoc(snap) : null;
      } catch {
        return null;
      }
    },
    requestJoin(fid, uid, fields) {
      return setDoc(doc(db, 'families', fid, 'requests', uid), toDoc({ ...fields, uid, at: Date.now() }));
    },
    cancelRequest(fid, uid) {
      return deleteDoc(doc(db, 'families', fid, 'requests', uid));
    },
    // Theo dõi đến khi chủ duyệt: tài liệu member của mình xuất hiện.
    watchMembership(fid, uid, onData) {
      return onSnapshot(doc(db, 'families', fid, 'members', uid), (snap) => onData(snap.exists()), () => onData(false));
    },

    // ---------- Một nhật ký ----------
    openFamily(familyId) {
      const events = sub(familyId, 'events');
      const todos = sub(familyId, 'todos');
      const profile = doc(db, 'families', familyId, 'profile', 'baby');
      const measurements = sub(familyId, 'measurements');
      const vaccines = sub(familyId, 'vaccines');
      const appointments = sub(familyId, 'appointments');
      const members = sub(familyId, 'members');
      const requests = sub(familyId, 'requests');
      const family = doc(db, 'families', familyId);
      const background = doc(db, 'families', familyId, 'settings', 'background');
      const list = (ref, onData, onError, ...q) => onSnapshot(
        q.length ? query(ref, ...q) : ref,
        (snap) => onData(snap.docs.map(fromDoc)),
        onError,
      );
      const add = (ref, fields) => {
        const r = doc(ref);
        setDoc(r, toDoc(fields)).catch(onWriteError);
        return r.id;
      };
      const update = (ref, id, fields) => updateDoc(doc(ref, id), toDoc(fields)).catch(onWriteError);
      const remove = (ref, id) => deleteDoc(doc(ref, id)).catch(onWriteError);

      return {
        isDemo: false,
        familyId,
        subscribe(from, to, onData, onError) {
          const filters = [where('at', '>=', Timestamp.fromMillis(from))];
          if (to != null) filters.push(where('at', '<', Timestamp.fromMillis(to)));
          return list(events, onData, onError, ...filters, orderBy('at', 'desc'));
        },
        add: (event) => add(events, event),
        update: (id, fields) => update(events, id, fields),
        remove: (id) => remove(events, id),
        subscribeTodos: (onData, onError) => list(todos, onData, onError, orderBy('createdAt', 'desc')),
        addTodo: (todo) => add(todos, todo),
        updateTodo: (id, fields) => update(todos, id, fields),
        removeTodo: (id) => remove(todos, id),
        // Hồ sơ bé: tên, ngày giờ sinh, giới tính, cân nặng cũ. Chưa có tài liệu thì trả về {}.
        subscribeProfile(onData, onError) {
          return onSnapshot(profile, (snap) => onData(snap.exists() ? fromDoc(snap) : {}), onError);
        },
        updateProfile(fields) {
          setDoc(profile, toDoc(fields), { merge: true }).catch(onWriteError);
        },
        subscribeMeasurements: (onData, onError) => list(measurements, onData, onError, orderBy('at', 'desc')),
        addMeasurement: (fields) => add(measurements, fields),
        updateMeasurement: (id, fields) => update(measurements, id, fields),
        removeMeasurement: (id) => remove(measurements, id),
        // Mũi tiêm: id trùng với id trong lịch (vaccines.js), mũi tự thêm dùng id ngẫu nhiên.
        subscribeVaccines: (onData, onError) => list(vaccines, onData, onError),
        setVaccine(id, fields) {
          const ref = id ? doc(vaccines, id) : doc(vaccines);
          setDoc(ref, toDoc(fields)).catch(onWriteError);
          return ref.id;
        },
        removeVaccine: (id) => remove(vaccines, id),
        // Ảnh nền chung (data URL JPEG). Chưa có thì trả về null.
        subscribeBackground(onData, onError) {
          return onSnapshot(background, (snap) => onData(snap.exists() ? fromDoc(snap) : null), onError);
        },
        setBackground(fields) {
          setDoc(background, toDoc(fields)).catch(onWriteError);
        },
        removeBackground() {
          deleteDoc(background).catch(onWriteError);
        },
        subscribeAppointments: (onData, onError) => list(appointments, onData, onError, orderBy('at')),
        addAppointment: (fields) => add(appointments, fields),
        updateAppointment: (id, fields) => update(appointments, id, fields),
        removeAppointment: (id) => remove(appointments, id),

        // ---------- Thành viên ----------
        subscribeFamily(onData, onError) {
          return onSnapshot(family, (snap) => onData(snap.exists() ? fromDoc(snap) : null), onError);
        },
        subscribeMembers: (onData, onError) => list(members, onData, onError),
        listMembers: async () => (await getDocs(members)).docs.map(fromDoc),
        // Chỉ chủ đọc được danh sách xin tham gia.
        subscribeRequests: (onData, onError) => list(requests, onData, onError),
        async approve(req) {
          const batch = writeBatch(db);
          batch.set(doc(members, req.uid), toDoc({
            uid: req.uid, role: 'member', relation: req.relation, name: req.name, email: req.email ?? null, joinedAt: Date.now(),
          }));
          batch.delete(doc(requests, req.uid));
          await batch.commit();
        },
        reject: (uid) => deleteDoc(doc(requests, uid)),
        updateMember: (uid, fields) => updateDoc(doc(members, uid), fields),
        removeMember: (uid) => deleteDoc(doc(members, uid)),
        rotateInvite: (inviteCode) => updateDoc(family, { inviteCode }),
        // Xóa hết dữ liệu, rồi thành viên khác, cuối cùng family và chính mình trong cùng một batch
        // (rules xét quyền chủ theo trạng thái trước batch).
        async deleteFamily(uid) {
          for (const name of DATA_COLLECTIONS) await deleteAll(sub(familyId, name));
          const others = (await getDocs(members)).docs.filter((d) => d.id !== uid);
          for (const d of others) await deleteDoc(d.ref);
          const batch = writeBatch(db);
          batch.delete(family);
          batch.delete(doc(members, uid));
          await batch.commit();
        },
      };
    },
  };
}
