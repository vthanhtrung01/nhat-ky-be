// Ảnh nền chung của nhật ký: ảnh được thu nhỏ, nén JPEG thành data URL và lưu trong một tài liệu
// Firestore (families/{fid}/settings/background), cả nhà thấy cùng một ảnh.
// Độ đục của thẻ là tùy chọn riêng của từng máy (localStorage), vì mỗi màn hình sáng tối khác nhau.

export const ALPHA_KEY = 'nkb.bgAlpha';
// Độ đục của thẻ khi có ảnh nền (%): thấp thì thấy ảnh rõ hơn, cao thì chữ dễ đọc hơn.
export const ALPHA_MIN = 50;
export const ALPHA_MAX = 95;
export const ALPHA_DEFAULT = 78;
// Firestore giới hạn 1 MiB mỗi tài liệu; rules chặn ảnh dài hơn IMAGE_MAX ký tự.
export const IMAGE_MAX = 900000;
// Nén đến khi ảnh ngắn hơn mức này (chừa chỗ cho các trường khác và để tải nhanh).
const TARGET = 700000;
// Thử lần lượt: cạnh dài nhất (px) và chất lượng JPEG, dừng ở lần đầu đủ nhỏ.
const STEPS = [[1600, 0.8], [1600, 0.68], [1280, 0.7], [1280, 0.58], [1024, 0.6], [800, 0.6]];

const IMAGE_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

// Chỉ nhận đúng ảnh JPEG base64: chuỗi này được đưa vào CSS url("…").
export function validImage(value) {
  return typeof value === 'string' && value.length <= IMAGE_MAX && IMAGE_RE.test(value);
}

// Kích thước sau khi thu nhỏ, giữ tỉ lệ, không phóng to ảnh nhỏ.
export function fitSize(width, height, max) {
  if (!(width > 0) || !(height > 0)) return null;
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function parseAlpha(value) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n)) return ALPHA_DEFAULT;
  return Math.min(ALPHA_MAX, Math.max(ALPHA_MIN, Math.round(n)));
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh'));
    };
    img.src = url;
  });
}

// Trả về data URL JPEG đã thu nhỏ, đủ nhỏ để lưu Firestore (trình duyệt tự xoay ảnh theo EXIF khi vẽ).
export async function imageToDataUrl(file) {
  const { img, url } = await loadImage(file);
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let last = null;
    for (const [max, quality] of STEPS) {
      const size = fitSize(img.naturalWidth, img.naturalHeight, max);
      if (!size) throw new Error('Không đọc được ảnh');
      canvas.width = size.width;
      canvas.height = size.height;
      ctx.drawImage(img, 0, 0, size.width, size.height);
      last = canvas.toDataURL('image/jpeg', quality);
      if (last.length <= TARGET) return last;
    }
    if (!validImage(last)) throw new Error('Ảnh quá lớn');
    return last;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function savedAlpha() {
  try {
    return parseAlpha(localStorage.getItem(ALPHA_KEY));
  } catch {
    return ALPHA_DEFAULT;
  }
}

export function saveAlpha(alpha) {
  try {
    localStorage.setItem(ALPHA_KEY, String(parseAlpha(alpha)));
  } catch {
    // Không lưu được: vẫn áp dụng trong phiên hiện tại.
  }
}

export function applyBackground(image, alpha = savedAlpha()) {
  const root = document.documentElement;
  root.style.setProperty('--glass-alpha', `${parseAlpha(alpha)}%`);
  if (validImage(image)) {
    root.style.setProperty('--bg-image', `url("${image}")`);
    root.classList.add('has-bg');
  } else {
    root.style.removeProperty('--bg-image');
    root.classList.remove('has-bg');
  }
}
