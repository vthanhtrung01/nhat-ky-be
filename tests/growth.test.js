import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURVES, LENGTH_BOYS, LENGTH_GIRLS, WEIGHT_BOYS, WEIGHT_GIRLS, growthPoints, tablesFor, latestWeight, lmsAt, normalCdf, percentileOf, valueAtZ, zScore,
} from '../js/growth.js';

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('trung vị lúc sinh khớp bảng WHO bé gái', () => {
  close(valueAtZ(lmsAt(WEIGHT_GIRLS, 0), 0), 3.2322, 1e-9);
  close(valueAtZ(lmsAt(LENGTH_GIRLS, 0), 0), 49.1477, 1e-9);
});

test('các mức z khớp bảng bách phân vị WHO bé gái', () => {
  // Cột 2.3rd (z = -2), 5th (z = -1.645) và 95th của bảng WHO, tháng 0 và 12.
  close(valueAtZ(lmsAt(WEIGHT_GIRLS, 0), -2), 2.394672, 1e-5);
  close(valueAtZ(lmsAt(WEIGHT_GIRLS, 0), 1.644854), 4.040959, 1e-4);
  close(valueAtZ(lmsAt(WEIGHT_GIRLS, 12), -1.644854), 7.342376, 1e-4);
  close(valueAtZ(lmsAt(WEIGHT_GIRLS, 12), 1.644854), 10.99531, 1e-4);
  close(valueAtZ(lmsAt(LENGTH_GIRLS, 12), -2), 74.015 * (1 - 2 * 0.03479), 1e-9);
  assert.deepEqual(CURVES.map((c) => c.p), [3, 15, 50, 85, 97]);
});

test('nội suy giữa hai tháng và giới hạn 0–24 tháng', () => {
  const half = lmsAt(WEIGHT_GIRLS, 0.5);
  close(half[1], (3.2322 + 4.1873) / 2, 1e-9);
  assert.deepEqual(lmsAt(WEIGHT_GIRLS, -1), WEIGHT_GIRLS[0]);
  assert.deepEqual(lmsAt(WEIGHT_GIRLS, 30), WEIGHT_GIRLS[24]);
});

test('zScore là hàm ngược của valueAtZ', () => {
  for (const months of [0, 3.3, 11, 24]) {
    const lms = lmsAt(WEIGHT_GIRLS, months);
    for (const z of [-2.5, -1, 0, 1.2, 3]) close(zScore(lms, valueAtZ(lms, z)), z, 1e-9);
  }
});

test('hàm phân phối chuẩn', () => {
  close(normalCdf(0), 0.5, 1e-7);
  close(normalCdf(1.880794), 0.97, 1e-4);
  close(normalCdf(-1.036433), 0.15, 1e-4);
});

test('bách phân vị của bé, giới hạn 1–99', () => {
  assert.equal(percentileOf(WEIGHT_GIRLS, 0, 3.2322), 50);
  assert.equal(percentileOf(WEIGHT_GIRLS, 0, 1.5), 1);
  assert.equal(percentileOf(WEIGHT_GIRLS, 0, 6), 99);
});

test('cân nặng mới nhất, rơi về profile khi chưa có lần đo', () => {
  const list = [{ at: 1, weightKg: 3 }, { at: 3, weightKg: null, lengthCm: 50 }, { at: 2, weightKg: 3.4 }];
  assert.equal(latestWeight(list, { weightKg: 3.1 }), 3.4);
  assert.equal(latestWeight([], { weightKg: 3.1 }), 3.1);
  assert.equal(latestWeight([], {}), null);
});

test('điểm vẽ biểu đồ theo tuổi tháng, bỏ lần đo thiếu chỉ số', () => {
  const birth = 0;
  const day = 86400000;
  const pts = growthPoints([{ at: 30.4375 * day, weightKg: 4 }, { at: 0, weightKg: 3 }, { at: day, lengthCm: 50, weightKg: null }], 'weightKg', birth);
  assert.deepEqual(pts.map((p) => p.value), [3, 4]);
  close(pts[1].months, 1, 1e-9);
});

test('bảng WHO bé trai và chọn bảng theo giới tính', () => {
  close(valueAtZ(lmsAt(WEIGHT_BOYS, 0), 0), 3.3464, 1e-9);
  close(valueAtZ(lmsAt(WEIGHT_BOYS, 0), -1.644854), 2.603994, 1e-4);
  close(valueAtZ(lmsAt(WEIGHT_BOYS, 12), 1.644854), 11.53526, 1e-4);
  close(valueAtZ(lmsAt(LENGTH_BOYS, 24), 0), 87.8161, 1e-9);
  assert.equal(WEIGHT_BOYS.length, 25);
  assert.equal(LENGTH_BOYS.length, 25);
  assert.equal(tablesFor('m').weight, WEIGHT_BOYS);
  assert.equal(tablesFor('f').length, LENGTH_GIRLS);
  assert.equal(tablesFor(undefined).label, 'bé gái');
});
