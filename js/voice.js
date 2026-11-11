// Nhận dạng giọng nói bằng Web Speech API có sẵn của trình duyệt (Chrome, Safari).
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

export function canListen() {
  return Boolean(Recognition);
}

// Nghe một câu tiếng Việt. done trả về chữ nhận được, hoặc lỗi có code
// ('not-allowed', 'no-speech', 'network', ...) để app báo cho người dùng.
// stop() dừng và giữ chữ đã nghe, cancel() bỏ luôn (lỗi code 'cancelled').
export function listen(onInterim) {
  const rec = new Recognition();
  rec.lang = 'vi-VN';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let text = '';
  let error = null;
  const done = new Promise((resolve, reject) => {
    rec.onresult = (ev) => {
      text = [...ev.results].map((r) => r[0].transcript).join('');
      onInterim?.(text);
    };
    rec.onerror = (ev) => {
      if (ev.error !== 'aborted') error = ev.error;
    };
    rec.onend = () => {
      if (error) reject(Object.assign(new Error(error), { code: error }));
      else if (!text.trim()) reject(Object.assign(new Error('no-speech'), { code: 'no-speech' }));
      else resolve(text);
    };
  });
  rec.start();
  return {
    stop: () => rec.stop(),
    cancel: () => {
      error = 'cancelled';
      rec.abort();
    },
    done,
  };
}
