// Hàm thuần cho danh sách việc cần làm, không phụ thuộc DOM để test được bằng node.
export const TODO_MAX = 200;

// Chuẩn hóa chữ gõ hoặc chữ nhận từ giọng nói. Trả null nếu không còn gì.
export function cleanTask(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '').trim();
  if (!t) return null;
  return (t[0].toLocaleUpperCase('vi-VN') + t.slice(1)).slice(0, TODO_MAX);
}

// Việc chưa xong: mới thêm lên đầu. Việc đã xong: mới tick lên đầu.
export function splitTodos(list) {
  const open = list.filter((t) => !t.done).sort((a, b) => b.createdAt - a.createdAt);
  const done = list.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  return { open, done };
}
