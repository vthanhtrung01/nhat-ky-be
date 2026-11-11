// Tạo posts/index.json từ các file .md trong posts/. Hosting tĩnh không liệt kê được thư mục,
// nên app đọc danh sách bài từ file này. Firebase tự chạy script trước khi deploy.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EXCERPT_MAX = 140;
const DATED = /^(\d{4}-\d{2}-\d{2})-?(.*)\.md$/i;

// Bỏ cú pháp Markdown, chỉ giữ chữ để hiện trong danh sách.
function plain(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*`~]|\b_|_\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function postMeta(file, text) {
  const md = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = DATED.exec(file);
  const date = match && !Number.isNaN(Date.parse(match[1])) ? match[1] : null;
  const name = (match ? match[2] : file.replace(/\.md$/i, '')).replace(/[-_]+/g, ' ').trim();

  const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(md);
  const title = (heading && plain(heading[1])) || name || file;

  const body = md
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  const paragraph = body.split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !/^(?:>|\||<|---|\*\*\*|!\[)/.test(block) && plain(block));
  let excerpt = paragraph ? plain(paragraph) : '';
  if (excerpt.length > EXCERPT_MAX) excerpt = `${excerpt.slice(0, EXCERPT_MAX - 1).trimEnd()}…`;

  return { file, title, date, excerpt };
}

// Bài có ngày đứng trước, mới nhất lên đầu; bài không ngày xếp theo tiêu đề.
export function sortPosts(posts) {
  return [...posts].sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (Boolean(a.date) !== Boolean(b.date)) return a.date ? -1 : 1;
    return a.title.localeCompare(b.title, 'vi');
  });
}

async function build() {
  const dir = new URL('../posts/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => /\.md$/i.test(f));
  const posts = await Promise.all(files.map(async (f) => postMeta(f, await readFile(new URL(encodeURIComponent(f), dir), 'utf8'))));
  await writeFile(new URL('index.json', dir), `${JSON.stringify(sortPosts(posts), null, 2)}\n`);
  console.log(`posts/index.json: ${posts.length} bài`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
