import moment from "moment";
import { buildPixels } from "./font.js";

export const DAY_FMT = "YYYY-MM-DD";
export const MAX_PER_DAY = 20;

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const startOfWeek = (m) => m.clone().subtract(m.day(), "days");

// Deterministic RNG so the preview and the real run agree on every count.
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// GitHub draws one column per week with Sunday on the top row, so the grid
// starts at the Sunday on or before the first day of the range.
export const calendar = (startStr, endStr) => {
  const start = moment(startStr, DAY_FMT, true).startOf("day");
  const end = moment(endStr, DAY_FMT, true).startOf("day");
  if (!start.isValid()) throw new Error(`시작 날짜 형식이 올바르지 않습니다: ${startStr}`);
  if (!end.isValid()) throw new Error(`종료 날짜 형식이 올바르지 않습니다: ${endStr}`);
  if (end.isBefore(start)) throw new Error("종료 날짜가 시작 날짜보다 빠릅니다.");

  const gridStart = startOfWeek(start);
  const columns = Math.floor(startOfWeek(end).diff(gridStart, "days") / 7) + 1;
  const days = end.diff(start, "days") + 1;
  return { start, end, gridStart, columns, days };
};

export const cellDate = (gridStart, x, y) =>
  gridStart.clone().add(x, "weeks").add(y, "days");

const inRange = (cal, m) => !m.isBefore(cal.start) && !m.isAfter(cal.end);

// Noon keeps a commit from sliding into an adjacent day under any timezone;
// the minute offset just keeps same-day commits distinguishable.
export const commitStamp = (dayStr, i) =>
  moment(dayStr, DAY_FMT).hour(12).minute(i % 60).second(0).format();

const randomPlan = (cal, opts) => {
  const max = clamp(Math.round(opts.max ?? 4), 1, MAX_PER_DAY);
  const min = clamp(Math.round(opts.min ?? 1), 1, max);
  const density = clamp(opts.density ?? 0.7, 0.01, 1);
  const rng = mulberry32(opts.seed);

  const plan = [];
  let skipped = 0;
  for (const d = cal.start.clone(); !d.isAfter(cal.end); d.add(1, "day")) {
    // Draw both numbers every day so the sequence never depends on branching.
    const roll = rng();
    const count = min + Math.floor(rng() * (max - min + 1));
    if (roll > density) {
      skipped++;
      continue;
    }
    plan.push({ date: d.format(DAY_FMT), count });
  }
  return { plan, meta: { min, max, density, seed: opts.seed, skipped } };
};

const artPlan = (cal, opts) => {
  const text = opts.text ?? "";
  if (!text.trim()) throw new Error("그릴 텍스트를 입력하세요.");
  const perPixel = clamp(Math.round(opts.perPixel ?? 4), 1, MAX_PER_DAY);

  const { pixels, width } = buildPixels(text);
  if (width > cal.columns) {
    throw new Error(
      `"${text}"를 그리려면 ${width}주가 필요한데 선택한 기간은 ${cal.columns}주입니다. 기간을 늘리거나 텍스트를 줄이세요.`
    );
  }

  const offset = Math.floor((cal.columns - width) / 2);
  const plan = [];
  let dropped = 0;
  for (const { x, y } of pixels) {
    const date = cellDate(cal.gridStart, x + offset, y);
    if (!inRange(cal, date)) {
      dropped++;
      continue;
    }
    plan.push({ date: date.format(DAY_FMT), count: perPixel, pixel: [x, y] });
  }
  return { plan, meta: { text, perPixel, width, offset, pixels: pixels.length, dropped } };
};

export const buildPlan = (opts = {}) => {
  const cal = calendar(opts.start, opts.end);
  const mode = opts.mode === "art" ? "art" : "random";
  const { plan, meta } = mode === "art" ? artPlan(cal, opts) : randomPlan(cal, opts);

  const commits = plan.reduce((sum, d) => sum + d.count, 0);
  return {
    cal,
    plan,
    mode,
    meta,
    stats: {
      mode,
      commits,
      activeDays: plan.length,
      rangeDays: cal.days,
      weeks: cal.columns,
      first: plan[0]?.date ?? null,
      last: plan.at(-1)?.date ?? null,
      ...meta,
    },
  };
};

// 7 rows x N columns of cells for the preview graph.
export const grid = (plan, cal) => {
  const counts = new Map(plan.map((d) => [d.date, d.count]));
  const columns = [];
  for (let x = 0; x < cal.columns; x++) {
    const column = [];
    for (let y = 0; y < 7; y++) {
      const d = cellDate(cal.gridStart, x, y);
      const date = d.format(DAY_FMT);
      column.push({ date, count: counts.get(date) ?? 0, inRange: inRange(cal, d) });
    }
    columns.push(column);
  }
  return columns;
};

// Month labels keyed to the column where each new month first appears.
export const monthLabels = (cal) => {
  const labels = [];
  let last = null;
  for (let x = 0; x < cal.columns; x++) {
    const d = cellDate(cal.gridStart, x, 0);
    const key = d.format("YYYY-MM");
    if (key !== last) {
      labels.push({ column: x, text: d.format("YY.MM") });
      last = key;
    }
  }
  return labels;
};
