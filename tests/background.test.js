import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPHA_DEFAULT, ALPHA_MAX, ALPHA_MIN, IMAGE_MAX, fitSize, parseAlpha, validImage,
} from '../js/background.js';

test('thu nhỏ ảnh theo cạnh dài, giữ tỉ lệ', () => {
  assert.deepEqual(fitSize(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitSize(3024, 4032, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitSize(1000, 10, 100), { width: 100, height: 1 });
});

test('không phóng to ảnh nhỏ', () => {
  assert.deepEqual(fitSize(800, 600, 1600), { width: 800, height: 600 });
});

test('kích thước không hợp lệ trả null', () => {
  assert.equal(fitSize(0, 600, 1600), null);
  assert.equal(fitSize(NaN, 600, 1600), null);
  assert.equal(fitSize(800, undefined, 1600), null);
});

test('độ đục của thẻ nằm trong khoảng cho phép', () => {
  assert.equal(parseAlpha(null), ALPHA_DEFAULT);
  assert.equal(parseAlpha(''), ALPHA_DEFAULT);
  assert.equal(parseAlpha('abc'), ALPHA_DEFAULT);
  assert.equal(parseAlpha('10'), ALPHA_MIN);
  assert.equal(parseAlpha(120), ALPHA_MAX);
  assert.equal(parseAlpha('66.6'), 67);
});

test('chỉ nhận ảnh JPEG base64 an toàn để đưa vào CSS', () => {
  assert.equal(validImage('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(validImage('data:image/png;base64,iVBORw0KGgo='), false);
  assert.equal(validImage('data:image/jpeg;base64,abc"); background:url(https://x.com/a'), false);
  assert.equal(validImage('https://example.com/a.jpg'), false);
  assert.equal(validImage(null), false);
  assert.equal(validImage(`data:image/jpeg;base64,${'A'.repeat(IMAGE_MAX)}`), false);
});
