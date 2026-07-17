const $ = (id) => document.getElementById(id);
const CELL = 13; // cell width + gap, keeps month labels aligned with columns

const el = {
  repo: $("repo"),
  start: $("start"),
  end: $("end"),
  min: $("min"),
  max: $("max"),
  minOut: $("min-out"),
  maxOut: $("max-out"),
  rangeLabel: $("range-label"),
  density: $("density"),
  densityOut: $("density-out"),
  seed: $("seed"),
  text: $("text"),
  perPixel: $("perPixel"),
  perPixelOut: $("per-pixel-out"),
  graph: $("graph"),
  stats: $("stats"),
  error: $("error"),
  run: $("run"),
  runNote: $("run-note"),
  progress: $("progress"),
  fill: $("fill"),
  log: $("log"),
};

let mode = "random";
let months = document.createElement("div");
months.className = "months";
el.graph.parentElement.prepend(months);

const iso = (d) => d.toISOString().slice(0, 10);

const options = () => ({
  mode,
  start: el.start.value,
  end: el.end.value,
  min: Number(el.min.value),
  max: Number(el.max.value),
  density: Number(el.density.value) / 100,
  seed: Number(el.seed.value),
  text: el.text.value,
  perPixel: Number(el.perPixel.value),
});

// --- rendering ---------------------------------------------------------

const level = (count, max) => {
  if (!count) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / Math.max(max, 1)) * 4)));
};

const renderGraph = (columns, monthList, stats) => {
  const peak = Math.max(1, ...columns.flat().map((c) => c.count));
  el.graph.replaceChildren();
  for (const column of columns) {
    const col = document.createElement("div");
    col.className = "col";
    for (const cell of column) {
      const box = document.createElement("div");
      box.className = "cell" + (cell.inRange ? "" : " out");
      box.dataset.level = cell.inRange ? level(cell.count, peak) : 0;
      box.title = `${cell.date} · ${cell.inRange ? `${cell.count} 커밋` : "기간 밖"}`;
      col.append(box);
    }
    el.graph.append(col);
  }

  months.replaceChildren();
  months.style.width = `${columns.length * CELL}px`;
  for (const m of monthList) {
    const label = document.createElement("span");
    label.className = "month";
    label.style.left = `${m.column * CELL}px`;
    label.textContent = m.text;
    months.append(label);
  }

  const cards = [
    ["총 커밋", stats.commits.toLocaleString()],
    ["커밋한 날", `${stats.activeDays.toLocaleString()} / ${stats.rangeDays.toLocaleString()}일`],
    ["기간", `${stats.weeks}주`],
    ["첫 커밋", stats.first ?? "-"],
    ["마지막 커밋", stats.last ?? "-"],
  ];
  if (stats.mode === "art" && stats.dropped) {
    cards.push(["잘린 픽셀", `${stats.dropped}개`]);
  }
  el.stats.replaceChildren();
  for (const [name, value] of cards) {
    const stat = document.createElement("div");
    stat.className = "stat";
    stat.innerHTML = `<b></b><span></span>`;
    stat.querySelector("b").textContent = value;
    stat.querySelector("span").textContent = name;
    el.stats.append(stat);
  }

  el.runNote.textContent = `${stats.commits.toLocaleString()}개의 커밋이 생성됩니다.`;
};

const showError = (message) => {
  el.error.textContent = message;
  el.error.classList.remove("hidden");
  el.graph.replaceChildren();
  months.replaceChildren();
  el.stats.replaceChildren();
  el.runNote.textContent = "";
  el.run.disabled = true;
};

let previewToken = 0;
const preview = async () => {
  const token = ++previewToken;
  try {
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options()),
    });
    const data = await res.json();
    if (token !== previewToken) return;
    if (!res.ok) return showError(data.error);
    el.error.classList.add("hidden");
    el.run.disabled = data.stats.commits === 0;
    renderGraph(data.grid, data.months, data.stats);
  } catch (e) {
    if (token === previewToken) showError(`서버에 연결할 수 없습니다: ${e.message}`);
  }
};

// --- controls ----------------------------------------------------------

const syncRandom = () => {
  // Min must never exceed max; nudge the other slider rather than snapping back.
  if (Number(el.min.value) > Number(el.max.value)) {
    if (document.activeElement === el.min) el.max.value = el.min.value;
    else el.min.value = el.max.value;
  }
  el.minOut.textContent = el.min.value;
  el.maxOut.textContent = el.max.value;
  el.rangeLabel.textContent = `${el.min.value} ~ ${el.max.value}`;
  el.densityOut.textContent = `${el.density.value}%`;
};

const syncArt = () => {
  el.perPixelOut.textContent = el.perPixel.value;
};

for (const input of [el.min, el.max, el.density]) {
  input.addEventListener("input", () => {
    syncRandom();
    preview();
  });
}
el.perPixel.addEventListener("input", () => {
  syncArt();
  preview();
});
for (const input of [el.start, el.end, el.seed, el.text]) {
  input.addEventListener("input", preview);
}

$("reseed").addEventListener("click", () => {
  el.seed.value = Math.floor(Math.random() * 100000);
  preview();
});

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    mode = tab.dataset.mode;
    for (const t of document.querySelectorAll(".tab")) t.classList.toggle("is-active", t === tab);
    $("mode-random").classList.toggle("hidden", mode !== "random");
    $("mode-art").classList.toggle("hidden", mode !== "art");
    preview();
  });
}

for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => {
    const now = new Date();
    const year = now.getFullYear();
    const presets = {
      thisYear: [new Date(year, 0, 1), new Date(year, 11, 31)],
      lastYear: [new Date(year - 1, 0, 1), new Date(year - 1, 11, 31)],
      last12: [new Date(year - 1, now.getMonth(), now.getDate()), now],
    };
    const [from, to] = presets[chip.dataset.preset];
    el.start.value = iso(from);
    el.end.value = iso(to);
    preview();
  });
}

// --- run ---------------------------------------------------------------

const appendLog = (line) => {
  el.log.textContent += line + "\n";
  el.log.scrollTop = el.log.scrollHeight;
};

el.run.addEventListener("click", async () => {
  const confirmed = confirm(
    `${el.runNote.textContent}\n생성 후 GitHub(origin)로 바로 push 합니다.\n\n계속할까요?`
  );
  if (!confirmed) return;

  el.run.disabled = true;
  el.progress.classList.remove("hidden");
  el.log.textContent = "";
  el.fill.style.width = "0%";

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options()),
    });

    if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const { error } = await res.json();
      appendLog(`오류: ${error}`);
      el.run.disabled = false;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines.filter(Boolean)) {
        const event = JSON.parse(line);
        if (event.type === "start") appendLog(`${event.total}개 커밋 시작…`);
        if (event.type === "progress") {
          el.fill.style.width = `${(event.done / event.total) * 100}%`;
          appendLog(`${event.date}  +${event.count}  (${event.done}/${event.total})`);
        }
        if (event.type === "log") appendLog(event.message);
        if (event.type === "error") appendLog(`오류: ${event.message} (${event.done}개까지 생성됨)`);
        if (event.type === "done") {
          el.fill.style.width = "100%";
          if (event.pushed) {
            appendLog(`\n✅ 완료. ${event.done}개 커밋 생성 후 GitHub로 push 했습니다.`);
          } else {
            // The commits are real and local; only the push leg failed.
            appendLog(`\n⚠️ ${event.done}개 커밋은 생성됐지만 push는 실패했습니다.\n${event.pushError}`);
            el.error.textContent = `push 실패: ${event.pushError}`;
            el.error.classList.remove("hidden");
          }
        }
      }
    }
  } catch (e) {
    appendLog(`오류: ${e.message}`);
  } finally {
    el.run.disabled = false;
  }
});

// --- init --------------------------------------------------------------

const init = async () => {
  const now = new Date();
  el.start.value = iso(new Date(now.getFullYear(), 0, 1));
  el.end.value = iso(new Date(now.getFullYear(), 11, 31));
  syncRandom();
  syncArt();

  try {
    const status = await fetch("/api/status").then((r) => r.json());
    el.repo.textContent = `${status.user || "?"} <${status.email || "?"}>  ·  브랜치 ${status.branch}`;
  } catch {
    el.repo.textContent = "저장소 정보를 읽을 수 없습니다.";
  }
  preview();
};

init();
