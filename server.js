import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import jsonfile from "jsonfile";
import simpleGit from "simple-git";
import { buildPlan, grid, monthLabels, commitStamp, MAX_PER_DAY } from "./lib/plan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "data.json");
const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let running = false;

// git push failures are noisy; surface the one line that tells the user what to do.
const pushHint = (raw) => {
  const text = String(raw);
  if (/non-fast-forward|fetch first|behind its remote/i.test(text))
    return "원격 저장소에 로컬에 없는 커밋이 있어 push가 거부되었습니다. `git pull` 로 합치거나, 원격을 덮어쓰려면 `git push --force` 를 직접 실행하세요. (커밋은 로컬에 그대로 남아 있습니다)";
  if (/could not read Username|Authentication failed|Permission denied|403/i.test(text))
    return "GitHub 인증에 실패했습니다. 자격 증명을 확인하세요. (커밋은 로컬에 그대로 남아 있습니다)";
  if (/does not appear to be a git repository|No such remote|no upstream/i.test(text))
    return "원격 저장소(origin)가 설정되어 있지 않습니다. `git remote add origin <URL>` 후 다시 시도하세요. (커밋은 로컬에 그대로 남아 있습니다)";
  if (/unable to access|Could not resolve host|timed out/i.test(text))
    return "GitHub에 접속할 수 없습니다. 네트워크를 확인하세요. (커밋은 로컬에 그대로 남아 있습니다)";
  return `${text.split("\n").find((l) => /error|fatal|rejected/i.test(l))?.trim() ?? text.slice(0, 200)} (커밋은 로컬에 그대로 남아 있습니다)`;
};

app.get("/api/status", async (_req, res) => {
  try {
    const git = simpleGit(__dirname);
    const [branch, user, email] = await Promise.all([
      git.revparse(["--abbrev-ref", "HEAD"]),
      git.raw(["config", "user.name"]).catch(() => ""),
      git.raw(["config", "user.email"]).catch(() => ""),
    ]);
    res.json({
      branch: branch.trim(),
      user: user.trim(),
      email: email.trim(),
      maxPerDay: MAX_PER_DAY,
      running,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/preview", (req, res) => {
  try {
    const { cal, plan, stats } = buildPlan(req.body);
    res.json({ grid: grid(plan, cal), months: monthLabels(cal), stats });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Streams newline-delimited JSON so the browser can show progress as it goes.
app.post("/api/run", async (req, res) => {
  if (running) return res.status(409).json({ error: "이미 실행 중입니다." });

  let built;
  try {
    built = buildPlan(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { plan, stats } = built;
  if (!plan.length) return res.status(400).json({ error: "생성할 커밋이 없습니다." });

  running = true;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const send = (event) => res.write(JSON.stringify(event) + "\n");

  const git = simpleGit(__dirname);
  const total = stats.commits;
  let done = 0;

  try {
    send({ type: "start", total, activeDays: plan.length });

    for (const day of plan) {
      for (let i = 0; i < day.count; i++) {
        const stamp = commitStamp(day.date, i);
        await jsonfile.writeFile(DATA_PATH, {
          date: stamp,
          mode: stats.mode,
          ...(day.pixel ? { pixel: day.pixel } : {}),
          n: i + 1,
          of: day.count,
        });
        await git.add([DATA_PATH]);
        // Set both dates: the calendar keys off the author date, but keeping the
        // committer date in sync avoids a graph that disagrees with `git log`.
        await git
          .env({ ...process.env, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp })
          .commit(`goGreen: ${day.date} ${i + 1}/${day.count}`, { "--date": stamp });
        done++;
      }
      send({ type: "progress", date: day.date, count: day.count, done, total });
    }

    // Commits exist at this point no matter what happens next, so a failed push
    // is reported as its own outcome rather than throwing the whole run away.
    send({ type: "log", message: `${done}개 커밋 생성 완료. GitHub로 push 중...` });
    try {
      const result = await git.push();
      send({ type: "done", done, pushed: true, remote: result.repo ?? "origin" });
    } catch (e) {
      send({ type: "done", done, pushed: false, pushError: pushHint(e.message) });
    }
  } catch (e) {
    send({ type: "error", message: e.message, done });
  } finally {
    running = false;
    res.end();
  }
});

app
  .listen(PORT, () => {
    console.log(`goGreen web  →  http://localhost:${PORT}`);
  })
  .on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`포트 ${PORT}번이 이미 사용 중입니다. PORT=4001 npm run web 처럼 다른 포트를 지정하세요.`);
      process.exit(1);
    }
    throw e;
  });
