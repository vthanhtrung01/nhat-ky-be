import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postMeta, sortPosts } from '../scripts/build-posts.js';

test('lấy tiêu đề từ heading đầu tiên và ngày từ tên file', () => {
  const meta = postMeta('2026-11-02-cu-bu-dem.md', '# Cữ bú **đêm**\n\nBé thường dậy lúc 2 giờ.\n');
  assert.deepEqual(meta, { file: '2026-11-02-cu-bu-dem.md', title: 'Cữ bú đêm', date: '2026-11-02', excerpt: 'Bé thường dậy lúc 2 giờ.' });
});

test('không có heading thì lấy tiêu đề từ tên file', () => {
  assert.equal(postMeta('2026-01-05-tam-cho-be.md', 'Nội dung').title, 'tam cho be');
  assert.equal(postMeta('Ghi chú.md', 'Nội dung').title, 'Ghi chú');
  assert.equal(postMeta('Ghi chú.md', 'Nội dung').date, null);
});

test('bỏ BOM, CRLF, khối code và cú pháp Markdown khi tóm tắt', () => {
  const text = '﻿# Tiêu đề\r\n\r\n```\r\ncode\r\n\r\nvẫn là code\r\n```\r\n\r\n![ảnh](a.png)\r\n\r\n- Xem [link](x.md) và `mã`\r\n- dòng hai\r\n';
  const meta = postMeta('a.md', text);
  assert.equal(meta.title, 'Tiêu đề');
  assert.equal(meta.excerpt, 'Xem link và mã dòng hai');
});

test('tóm tắt dài bị cắt', () => {
  const excerpt = postMeta('a.md', 'chữ '.repeat(100)).excerpt;
  assert.ok(excerpt.length <= 140);
  assert.ok(excerpt.endsWith('…'));
});

test('bài có ngày mới nhất lên đầu, bài không ngày xếp sau theo tiêu đề', () => {
  const posts = [
    { title: 'B', date: null },
    { title: 'Cũ', date: '2026-01-01' },
    { title: 'A', date: null },
    { title: 'Mới', date: '2026-11-02' },
  ];
  assert.deepEqual(sortPosts(posts).map((p) => p.title), ['Mới', 'Cũ', 'A', 'B']);
});
