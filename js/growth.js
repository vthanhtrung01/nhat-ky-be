// Chuẩn tăng trưởng WHO cho bé gái và bé trai 0–24 tháng, hàm thuần để test được bằng node.
// Bảng LMS theo tháng lấy từ WHO Child Growth Standards (bản CSV do CDC phát hành lại:
// ftp.cdc.gov/pub/Health_Statistics/NCHS/growthcharts/WHO-{Girls,Boys}-*-for-age*Percentiles.csv).
const DAYS_PER_MONTH = 30.4375;
export const MAX_MONTHS = 24;

// [L, M, S] cho tháng 0, 1, ..., 24.
export const WEIGHT_GIRLS = [
  [0.3809, 3.2322, 0.14171], [0.1714, 4.1873, 0.13724], [0.0962, 5.1282, 0.13], [0.0402, 5.8458, 0.12619],
  [-0.005, 6.4237, 0.12402], [-0.043, 6.8985, 0.12274], [-0.0756, 7.297, 0.12204], [-0.1039, 7.6422, 0.12178],
  [-0.1288, 7.9487, 0.12181], [-0.1507, 8.2254, 0.12199], [-0.17, 8.48, 0.12223], [-0.1872, 8.7192, 0.12247],
  [-0.2024, 8.9481, 0.12268], [-0.2158, 9.1699, 0.12283], [-0.2278, 9.387, 0.12294], [-0.2384, 9.6008, 0.12299],
  [-0.2478, 9.8124, 0.12303], [-0.2562, 10.0226, 0.12306], [-0.2637, 10.2315, 0.12309], [-0.2703, 10.4393, 0.12315],
  [-0.2762, 10.6464, 0.12323], [-0.2815, 10.8534, 0.12335], [-0.2862, 11.0608, 0.1235], [-0.2903, 11.2688, 0.12369],
  [-0.2941, 11.4775, 0.1239],
];

export const LENGTH_GIRLS = [
  [1, 49.1477, 0.0379], [1, 53.6872, 0.0364], [1, 57.0673, 0.03568], [1, 59.8029, 0.0352],
  [1, 62.0899, 0.03486], [1, 64.0301, 0.03463], [1, 65.7311, 0.03448], [1, 67.2873, 0.03441],
  [1, 68.7498, 0.0344], [1, 70.1435, 0.03444], [1, 71.4818, 0.03452], [1, 72.771, 0.03464],
  [1, 74.015, 0.03479], [1, 75.2176, 0.03496], [1, 76.3817, 0.03514], [1, 77.5099, 0.03534],
  [1, 78.6055, 0.03555], [1, 79.671, 0.03576], [1, 80.7079, 0.03598], [1, 81.7182, 0.0362],
  [1, 82.7036, 0.03643], [1, 83.6654, 0.03666], [1, 84.604, 0.03688], [1, 85.5202, 0.03711],
  [1, 86.4153, 0.03734],
];

export const WEIGHT_BOYS = [
  [0.3487, 3.3464, 0.14602], [0.2297, 4.4709, 0.13395], [0.197, 5.5675, 0.12385], [0.1738, 6.3762, 0.11727],
  [0.1553, 7.0023, 0.11316], [0.1395, 7.5105, 0.1108], [0.1257, 7.934, 0.10958], [0.1134, 8.297, 0.10902],
  [0.1021, 8.6151, 0.10882], [0.0917, 8.9014, 0.10881], [0.082, 9.1649, 0.10891], [0.073, 9.4122, 0.10906],
  [0.0644, 9.6479, 0.10925], [0.0563, 9.8749, 0.10949], [0.0487, 10.0953, 0.10976], [0.0413, 10.3108, 0.11007],
  [0.0343, 10.5228, 0.11041], [0.0275, 10.7319, 0.11079], [0.0211, 10.9385, 0.11119], [0.0148, 11.143, 0.11164],
  [0.0087, 11.3462, 0.11211], [0.0029, 11.5486, 0.11261], [-0.0028, 11.7504, 0.11314], [-0.0083, 11.9514, 0.11369],
  [-0.0137, 12.1515, 0.11426],
];

export const LENGTH_BOYS = [
  [1, 49.8842, 0.03795], [1, 54.7244, 0.03557], [1, 58.4249, 0.03424], [1, 61.4292, 0.03328],
  [1, 63.886, 0.03257], [1, 65.9026, 0.03204], [1, 67.6236, 0.03165], [1, 69.1645, 0.03139],
  [1, 70.5994, 0.03124], [1, 71.9687, 0.03117], [1, 73.2812, 0.03118], [1, 74.5388, 0.03125],
  [1, 75.7488, 0.03137], [1, 76.9186, 0.03154], [1, 78.0497, 0.03174], [1, 79.1458, 0.03197],
  [1, 80.2113, 0.03222], [1, 81.2487, 0.0325], [1, 82.2587, 0.03279], [1, 83.2418, 0.0331],
  [1, 84.1996, 0.03342], [1, 85.1348, 0.03376], [1, 86.0477, 0.0341], [1, 86.941, 0.03445],
  [1, 87.8161, 0.03479],
];

// Bảng theo giới tính bé: 'm' là trai, còn lại là gái.
export function tablesFor(sex) {
  return sex === 'm'
    ? { weight: WEIGHT_BOYS, length: LENGTH_BOYS, label: 'bé trai' }
    : { weight: WEIGHT_GIRLS, length: LENGTH_GIRLS, label: 'bé gái' };
}

// Các đường bách phân vị vẽ trên biểu đồ, kèm z-score tương ứng.
export const CURVES = [
  { p: 3, z: -1.880794 },
  { p: 15, z: -1.036433 },
  { p: 50, z: 0 },
  { p: 85, z: 1.036433 },
  { p: 97, z: 1.880794 },
];

export function ageMonths(days) {
  return days / DAYS_PER_MONTH;
}

// Nội suy tuyến tính giữa hai tháng, giới hạn trong 0–24 tháng.
export function lmsAt(table, months) {
  const m = Math.min(MAX_MONTHS, Math.max(0, months));
  const i = Math.min(MAX_MONTHS - 1, Math.floor(m));
  const t = m - i;
  return table[i].map((v, k) => v + (table[i + 1][k] - v) * t);
}

export function valueAtZ([L, M, S], z) {
  return L === 0 ? M * Math.exp(S * z) : M * (1 + L * S * z) ** (1 / L);
}

export function zScore([L, M, S], x) {
  return L === 0 ? Math.log(x / M) / S : ((x / M) ** L - 1) / (L * S);
}

// Hàm phân phối chuẩn, xấp xỉ Abramowitz–Stegun 7.1.26 (sai số dưới 1e-7).
export function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// Bách phân vị làm tròn, giới hạn 1–99 để không hiện P0 hay P100.
export function percentileOf(table, months, x) {
  const p = Math.round(normalCdf(zScore(lmsAt(table, months), x)) * 100);
  return Math.min(99, Math.max(1, p));
}

// Lần đo mới nhất có cân nặng; chưa có thì dùng cân nặng cũ lưu trong profile.
export function latestWeight(measurements, profile) {
  const m = measurements.filter((x) => x.weightKg != null).sort((a, b) => b.at - a.at)[0];
  return m ? m.weightKg : profile?.weightKg ?? null;
}

// Các điểm của một chỉ số (weightKg hoặc lengthCm), sắp theo thời gian, kèm tuổi tính bằng tháng.
export function growthPoints(measurements, key, birth) {
  return measurements
    .filter((m) => m[key] != null && m.at >= birth)
    .sort((a, b) => a.at - b.at)
    .map((m) => ({ ...m, value: m[key], months: ageMonths((m.at - birth) / 86400000) }));
}
