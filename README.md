# 🌱 goGreen 

With **goGreen**, you can make your profile look like you've been hard at work... even if you haven't. 
NodeJs script to make commits to the past (or the future) to go green on GitHub.

## About

**goGreen** helps you create commits on your GitHub profile for any date in the past. Whether you want to fill up your contribution graph or even make cool patterns and artwork.

## Web UI

The easiest way to use goGreen. Pick a date range, choose a mode, see exactly what
the graph will look like, then commit.

```bash
npm install
npm run web            # → http://localhost:4000
PORT=4001 npm run web  # if 4000 is taken
```

**기간 (date range)** — any start/end date. The graph and every commit stay inside it.

**두 가지 모드:**

| 모드 | 설명 | 옵션 |
| --- | --- | --- |
| 랜덤 채우기 | 각 날짜에 랜덤한 수의 커밋 | 하루 최소~최대 커밋 수 (**1~20**), 채우기 밀도, 시드 |
| 텍스트 아트 | 그래프에 글자를 그림 | 텍스트, 픽셀당 커밋 수 (1~20) |

Random mode is seeded, so **the preview is exactly what you get** — same seed, same
graph, every time. Hit 🎲 for a different one.

**커밋 생성 & 푸시** creates the commits and immediately pushes them to `origin`.
If the push fails (diverged remote, auth, no network) the commits still exist locally
and the UI tells you what to fix — nothing is silently lost.

Since pushed commits are hard to undo, note where you are *before* a run:

```bash
git rev-parse HEAD         # save this
git reset --hard <commit>  # local undo
```

## CLI (original scripts)

`node art.js --dry-run` previews the hardcoded "Tuki." art; `node art.js` commits it.

## Getting Started

Follow these steps to bring your contribution graph to life:

1. **Clone this repository**
```bash
git clone https://github.com/fenrir2608/goGreen.git
cd goGreen
```
3. **Set up your project**
Initialize a new Node.js project:
```bash
npm init -y
  ```
3. **Install the required npm modules**
You'll need a few modules to get everything running smoothly. Install them all with:
  ```bash
  npm install moment simple-git random
  ```
4. **Create your commit script**
- Create a JavaScript file to manage your commits.
- Create a JSON file to store all the commit timestamp data.

## Room for Improvement

So, you've got the basics down. What's next?

- **Custom Patterns:** Experiment with different patterns on your contribution graph. Maybe spell out your name or create some cool designs.
- **Density Control:** Play around with the number of commits per day to adjust the shades of green.
- **Input Strings:** Convert input strings to X-Y mapped contributions.

## npm Modules Used

- [`express`](https://www.npmjs.com/package/express) - Serves the web UI.
- [`moment`](https://www.npmjs.com/package/moment) - Handles date and time manipulation.
- [`simple-git`](https://www.npmjs.com/package/simple-git) - For easy Git commands.
- [`random`](https://www.npmjs.com/package/random) - To generate random numbers for the commits.

## Credits

Huge thanks to [Akshay Saini](https://github.com/akshaymarch7) for the original video behind this project.
