# Chzzk Chat Bot Tools

[CHZZK Open API](https://chzzk.gitbook.io/chzzk) 기반 채팅 봇 툴킷. TypeScript + Node.js.

공식 문서에 정의된 REST 엔드포인트 전체와 Session(소켓) API를 타입 안전하게 감싸고,
OAuth 토큰 발급·자동 갱신, 채팅 명령 라우팅, 전송 큐까지 포함합니다.

---

## 빠른 시작

```bash
pnpm install
cp .env.example .env      # 값 채우기 (이미 .env 가 있다면 생략)
pnpm login                # 브라우저로 OAuth 인증 → .tokens/chzzk.json 생성
pnpm doctor               # 인증/스코프 점검
pnpm build:web            # 대시보드 빌드 (최초 1회)
pnpm bot                  # 봇 + 설정 대시보드 실행 → http://localhost:4700
```

대시보드 UI 를 고칠 때는 HMR 이 되는 개발 서버를 쓰세요. `pnpm bot` 을 켜둔 채로
다른 터미널에서 실행하면 `/api` 는 봇 서버로 프록시됩니다.

```bash
pnpm dev:web              # http://localhost:5173
```

`pnpm login` 을 실행하기 전에 [개발자센터](https://developers.chzzk.naver.com/application)에서
**로그인 리디렉션 URL**을 `.env` 의 `CHZZK_REDIRECT_URI` 와 **문자 단위로 똑같이** 등록해야 합니다.
기본값은 `http://localhost:3000/auth/callback` 입니다.

---

## 챗봇 기능

`pnpm bot` 을 실행하면 봇과 설정 대시보드(<http://localhost:4700>)가 함께 뜹니다.
설정은 `data/config.json` 한 파일에 저장되고, 대시보드에서 바꾼 값은 **재시작 없이** 즉시 반영됩니다.

### 목록형 명령어 — `!멤버`

기억시켜 두고 아무나 꺼내 볼 수 있는 명령입니다.

```
스트리머  !멤버 빅헤드,9구진
   봇     멤버 목록을 등록했습니다 (2명): 빅헤드, 9구진

시청자    !멤버
   봇     오늘의 멤버 (2명): 빅헤드, 9구진
```

부분 수정도 됩니다.

| 입력                 | 동작                     |
| -------------------- | ------------------------ |
| `!멤버 빅헤드,9구진` | 목록 전체를 교체         |
| `!멤버 추가 홍길동`  | 한 명 추가 (중복은 무시) |
| `!멤버 삭제 빅헤드`  | 한 명 제거               |
| `!멤버 초기화`       | 목록 비우기              |
| `!멤버`              | 조회 (누구나)            |

이름은 쉼표로 구분합니다. 쉼표가 하나도 없을 때만 공백으로 나누므로,
`!멤버 김 철수,이 영희` 처럼 **이름에 공백이 들어가도** 됩니다.

수정은 기본적으로 스트리머·채널 매니저만 가능하고, 조회는 누구나 할 수 있습니다.
이 권한은 대시보드의 명령어 카드에서 역할별로 바꿀 수 있습니다.

### 명령어 종류

- **고정 문구** — 정해진 답을 돌려줍니다. (`!디스코드`)
- **목록형** — 위의 `!멤버` 방식.
- **카운터** — 부를 때마다 1씩 증가합니다. (`!데스`)

응답 문구에 쓸 수 있는 치환자: `{user}` 호출자 닉네임 · `{value}` 저장값 ·
`{n}` 항목 개수 · `{count}` 카운터 값.

### 명령어 변수

응답 문구에 `$변수` 또는 `{변수}` 를 쓰면 실제 값으로 바뀝니다. 국내 봇들의 표기를 따랐습니다.

| 변수        | 값               |     | 변수            | 값                  |
| ----------- | ---------------- | --- | --------------- | ------------------- |
| `$닉네임`   | 호출한 사람      |     | `$방제`         | 방송 제목           |
| `$포인트`   | 보유 포인트      |     | `$게임`         | 카테고리            |
| `$채팅수`   | 누적 채팅 수     |     | `$업타임`       | 봇 가동 시간        |
| `$출석체크` | 연속 출석일      |     | `$시간` `$날짜` | 현재 시각           |
| `$카운트`   | 전체 실행 횟수   |     | `$유저카운트`   | 이 사람의 실행 횟수 |
| `$변수`     | 명령어 뒤 입력값 |     | `$값` `$개수`   | 목록형 값·개수      |

`|` 로 구분하면 그중 하나가 무작위로 나갑니다 — `안녕!|반가워요!|어서오세요!`

한국어는 단어 경계가 없어 `$카운트번째` 처럼 변수 뒤에 말이 바로 붙습니다. 아는 변수명 중
**가장 긴 것부터** 맞춰 보도록 구현해 이런 표기가 정상 동작합니다.

### 내장 명령어

| 명령                                     | 설명                               | 권한        |
| ---------------------------------------- | ---------------------------------- | ----------- |
| `!포인트` `!출석` `!랭킹`                | 포인트 조회 · 출석 · 순위          | 모두        |
| `!도박` `!주사위` `!슬롯` `<금액>`       | 포인트를 건 미니게임 (`올인` 가능) | 모두        |
| `!신청곡 <제목>` `!신청목록` `!신청취소` | 신청곡                             | 설정한 역할 |
| `!다음곡` `!스킵`                        | 재생 제어                          | 관리자      |
| `!지급 <닉> <수량>`                      | 포인트 지급/회수 (음수면 회수)     | 관리자      |
| `!방제변경 <제목>` `!게임변경 <검색어>`  | 방송 설정                          | 관리자      |
| `!슬로우 <초>` `!공지 <내용>`            | 채팅 설정 · 공지                   | 관리자      |
| `!밴 <닉>` `!타임아웃 <닉>`              | 제재                               | 관리자      |
| `!도움말` `!시간`                        | 안내                               | 모두        |

닉네임으로 대상을 지정하는 명령(`!지급`, `!밴`, `!타임아웃`)은 **최근에 채팅한 사람만**
찾을 수 있습니다. 치지직 API 에 닉네임으로 사용자를 조회하는 엔드포인트가 없어, 지나가는
채팅 이벤트를 기억해 두는 방식이기 때문입니다.

### 설정 탭

| 탭            | 내용                                               |
| ------------- | -------------------------------------------------- |
| 일반          | 봇 on/off, 접두사, 전송 간격, 실행 현황            |
| 실시간 로그   | 봇이 방금 한 일 (메모리 300건)                     |
| 명령어        | 고정문구 · 목록형 · 카운터, 역할별 권한, 쿨다운    |
| 자동응답      | 키워드 → 응답. 포함/일치/시작/정규식, 확률, 쿨다운 |
| 주기 메시지   | 간격 + 최소 채팅 수 조건                           |
| 알림 · 인사   | 후원 · 구독 감사, 첫 채팅 인사                     |
| 포인트        | 적립 규칙, 출석 보상, 시청자별 조정                |
| 미니게임      | 도박 · 주사위 · 슬롯, 배율과 기대값                |
| 신청곡        | 대기열 관리, 신청 규칙                             |
| 금칙어 · 스팸 | 단어 차단 + 한국형 스팸 필터                       |
| 봇 권한       | 관리 역할, 추가 관리자, 무시할 ID                  |

### 설계상 정해둔 규칙

- **전송 간격 기본 2000ms.** 공식 문서에 쿼터 수치가 없지만 커뮤니티 확인값이 분당 30요청입니다.
  더 줄이면 429 와 봇 계정 스팸 제재 위험이 있습니다.
- **스팸·금칙어 검사가 명령어보다 먼저** 실행됩니다. 명령어 인자에 금칙어를 숨겨 보내는 우회를 막습니다.
- **한국형 스팸 필터.** 영어권 봇의 "대문자 비율" 은 한글에 무의미해서 넣지 않았고,
  자음 연타(ㅋㅋㅋㅋ…)·같은 말 반복·링크·이모티콘 개수를 봅니다. 위반이 쌓이면 조치가
  세지고, 일정 시간이 지나면 기록이 사라집니다.
- **임시제한은 기본으로 꺼져 있습니다.** 켜기 전까지 숨기기까지만 합니다.
- **자동응답 쿨다운은 채널 공통**입니다. 여러 명이 동시에 같은 키워드를 쳐도 도배하지 않습니다.
- **게임 기대값은 1보다 낮게** 기본값을 잡았습니다. 포인트가 무한히 불어나면 랭킹도 상점도
  의미가 없어집니다. 대시보드가 현재 기대값을 계산해 보여줍니다.
- 목록 출력은 **최대 30개**까지만 보여주고 나머지는 "외 N명" 으로 줄입니다. 100자 제한 때문입니다.

### API 제약 때문에 만들지 않은 것

문서를 전수 확인한 결과 아래는 **불가능**합니다. 다른 봇이 제공한다면 비공식 API 를 쓰는 것입니다.

- **팔로우 알림** — Session 이벤트는 CHAT / DONATION / SUBSCRIPTION 3종뿐이고 팔로우가 없습니다.
  `channels/followers` 폴링도 offset 페이지네이션에 정렬 순서가 문서화되어 있지 않아 신규 감지를
  보장할 수 없습니다.
- **시청 시간 기반 포인트** — 시청자 목록 조회 API 가 없습니다. 채팅·후원·구독으로만 적립됩니다.
- **`$시청자` 변수** — 동시 시청자 수는 전체 라이브 목록을 뒤져야 얻을 수 있어 쿼터 낭비가 큽니다.
- **채팅 기록 조회 · 공지 읽기/삭제 · 투표 · 클립 · VOD · 레이드** — 해당 엔드포인트가 없습니다.
- **봇 이모티콘 전송** — 공식 API 로는 불가능합니다.

### 대시보드 스택

React 19 + TypeScript, Vite 로 빌드하고 봇 서버가 `web/dist` 를 정적 서빙합니다.

| 라이브러리      | 쓰는 이유                                                               |
| --------------- | ----------------------------------------------------------------------- |
| Tailwind CSS v4 | 디자인 토큰을 `@theme` 한 곳에 두고 라이트/다크를 CSS 변수로 전환       |
| Radix UI        | Switch · Select · Dialog · Tooltip 의 접근성(role, 키보드, 포커스 트랩) |
| lucide-react    | SVG 아이콘. 트리셰이킹되어 쓴 아이콘만 번들에 들어갑니다                |
| TanStack Query  | 서버 상태 캐시·무효화·폴링. 저장하면 관련 화면이 알아서 갱신됩니다      |
| react-hook-form | 필드 단위 렌더링. 카드가 많아도 입력이 무겁지 않습니다                  |
| zod (공유)      | **서버와 같은 스키마**로 폼을 검증합니다                                |
| motion          | 카드 펼침·목록 추가/삭제 전환                                           |
| sonner          | 저장/오류 토스트                                                        |

가장 중요한 건 **zod 스키마 공유**입니다. `src/store/schema.ts` 하나를 서버 API 와
브라우저 폼이 함께 쓰기 때문에, 길이 제한이나 허용값을 고치면 양쪽이 동시에 따라옵니다.
검증 규칙이 서로 어긋날 수 없습니다.

차트 라이브러리는 넣지 않았습니다. 서버가 시계열을 보관하지 않아 그릴 데이터가
브라우저에 쌓인 30개 남짓의 점뿐이고, 축·범례·툴팁이 필요 없는 그래프 하나에
수십 KB를 더할 이유가 없어 SVG 폴리라인으로 직접 그렸습니다.

번들은 gzip 약 200KB 입니다. localhost 에서만 쓰는 도구라 코드 분할은 하지 않았습니다.

몇 가지 설계상 정해둔 규칙:

- **금칙어 검사가 명령어보다 먼저** 실행됩니다. 명령어 인자에 금칙어를 숨겨 보내는 우회를 막습니다.
- **임시제한은 기본으로 꺼져 있습니다.** 켜기 전까지 "숨기고 임시제한" 규칙도 숨기기까지만 합니다.
- **자동응답 쿨다운은 채널 공통**입니다. 여러 명이 동시에 같은 키워드를 쳐도 봇이 도배하지 않습니다.
- 목록 출력은 **최대 30개**까지만 보여주고 나머지는 "외 N명"으로 줄입니다. 100자 제한 때문입니다.

---

## 프로젝트 구조

```
src/
  env.ts                    zod 로 검증하는 환경 변수 로더
  client.ts                 ChzzkClient — 모든 API 의 진입점
  core/
    http.ts                 공통 응답 봉투 해제, 401 자동 갱신, 429/5xx 재시도
    errors.ts               ChzzkApiError / TransportError / ValidationError
    logger.ts               레벨 기반 로거
  auth/
    oauth.ts                인가 URL 생성, 코드 교환, 갱신, 폐기
    tokenStore.ts           파일 기반 토큰 저장 + 만료 전 자동 갱신
  api/
    users.ts channels.ts chat.ts lives.ts
    categories.ts restrictions.ts sessions.ts drops.ts
    types.ts                문서의 필드/허용값을 그대로 옮긴 타입 정의
  session/
    sessionClient.ts        socket.io 세션 클라이언트 (자동 재연결)
    events.ts               CHAT / DONATION / SUBSCRIPTION / SYSTEM 페이로드
  bot/
    commandRouter.ts        접두사·별칭·권한·쿨다운 처리
    chatSender.ts           전송 직렬화 + 100자 자동 분할
  store/
    schema.ts               zod 로 정의한 봇 설정 (명령어/자동응답/금칙어/권한)
    configStore.ts          JSON 원자적 저장 + 타입 안전한 CRUD
  features/
    customCommands.ts       !멤버 같은 목록형·카운터·고정문구 명령
    autoResponder.ts        키워드 자동응답
    moderation.ts           금칙어 판정 (API 호출 없이 테스트 가능)
    permissions.ts          역할·관리자 판정
    matcher.ts cooldown.ts  매칭 규칙, 쿨다운 추적
  web/
    server.ts               대시보드 REST API + 정적 파일 (127.0.0.1 전용)
  bot/
    runtime.ts              채팅 이벤트 처리 파이프라인
  scripts/                  login, doctor, start
  examples/basic-bot.ts     SDK 만 쓰는 최소 예제
web/                        React 대시보드 (Vite)
  src/
    lib/                    API 훅(TanStack Query), 공유 스키마, 폼 리졸버
    components/ui/          Button · Field · Switch · Select · Card · Dialog
    components/             CommandCard · AutoResponseCard · BannedWordCard · Layout
    pages/                  탭별 화면
tests/                      vitest
```

---

## 사용 예

```ts
import { ChzzkClient, CommandRouter, ChatSender } from './src/index.js';

const chzzk = ChzzkClient.fromEnv();
const me = await chzzk.users.me();

// REST
await chzzk.chat.send('안녕하세요!');
await chzzk.chat.setNotice({ message: '오늘 방송 일정 안내' });
await chzzk.chat.updateSettings({ chatSlowModeSec: 5, chatAvailableGroup: 'FOLLOWER' });
const lives = await chzzk.lives.list({ size: 10 });
const games = await chzzk.categories.search('리그 오브 레전드');

// 소켓 (채팅/후원/구독 수신)
const session = chzzk.createSessionClient({ events: ['CHAT', 'DONATION'] });
session.on('chat', (e) => console.log(e.profile.nickname, e.content));
await session.connect();
```

---

## 구현된 API

| 영역     | 메서드                                                                                          | 인증                      |
| -------- | ----------------------------------------------------------------------------------------------- | ------------------------- |
| 유저     | `users.me()`                                                                                    | Bearer                    |
| 채널     | `channels.get()` `getMany()` (20개씩 자동 분할)                                                 | Client                    |
| 채널     | `channels.streamingRoles()` `followers()` `subscribers()`                                       | Bearer                    |
| 채팅     | `chat.send()` `setNotice()` `getSettings()` `updateSettings()` `blindMessage()`                 | Bearer                    |
| 라이브   | `lives.list()` `iterate()`                                                                      | Client                    |
| 라이브   | `lives.getSetting()` `updateSetting()` `getStreamKey()`                                         | Bearer                    |
| 카테고리 | `categories.search()`                                                                           | Client                    |
| 활동제한 | `restrictions.restrict()` `unrestrict()` `list()` `temporaryRestrict()` `temporaryUnrestrict()` | Bearer                    |
| 세션     | `sessions.createUserSession()` `createClientSession()` `subscribe()` `unsubscribe()` `list*()`  | 양쪽                      |
| Drops    | `drops.listRewardClaims()` `updateRewardClaims()`                                               | Client (사업자 인증 필요) |

---

## 문서에서 확인한 주의사항

구현에 직접 반영된 제약들입니다.

**socket.io-client 는 2.x 로 고정해야 합니다.**
문서에 "socket.io-client 1.0.0+ 2.0.3 버전까지 지원"이라고 명시되어 있습니다. v3/v4 는
프로토콜이 달라 핸드셰이크 자체가 실패합니다. `package.json` 에 `2.5.0` 으로 정확히
핀 고정해 두었으니 올리지 마세요.

**채팅 수신용 REST 엔드포인트는 없습니다.**
`GET /open/v1/chats/messages` 같은 건 존재하지 않습니다. 반드시 Session API 로
소켓 URL을 발급받아 접속한 뒤, SYSTEM `connected` 이벤트로 받은 `sessionKey` 를 가지고
REST 로 구독해야 합니다. 소켓으로 emit 하는 이벤트는 없습니다.

**세션 URL은 일정 시간만 유효합니다.**
그래서 socket.io 내장 재연결은 끄고(`reconnection: false`), 끊길 때마다 세션 URL을
새로 발급받아 다시 붙습니다. `ChzzkSessionClient` 가 지수 백오프로 처리합니다.

**`chat.send()` / `setNotice()` 는 채널을 지정할 수 없습니다.**
대상 채널이 액세스 토큰 소유자로 고정됩니다. 임의의 채널에 대신 글을 쓸 수는 없습니다.
`blindMessage()` 만 예외적으로 `chatChannelId` 를 받습니다.

**메시지는 100 바이트가 아니라 100 자 제한입니다.**
`ChatSender` 가 초과분을 공백 경계에서 자동으로 나눠 보냅니다.

**리프레시 토큰은 1회용입니다.**
갱신 응답에 담겨 오는 새 리프레시 토큰을 반드시 저장해야 합니다. `FileTokenStore` 가
갱신 즉시 디스크에 반영하고, 동시 요청이 몰려도 갱신은 한 번만 일어나도록 처리합니다.

**설정값은 이산적인 허용 목록이 있습니다.**
`chatSlowModeSec` 는 `0, 3, 5, 10, 30, 60, 120, 300`, `minFollowerMinute` 는
`0, 5, 10, 30, 60, 1440, …` 중 하나여야 합니다. 그 외 값은 API 호출 전에
`ChzzkValidationError` 로 걸러집니다.

**스코프 문자열은 문서화되어 있지 않습니다.**
공식 문서가 스코프를 `채팅 메시지 쓰기` 같은 한글 표시명으로만 기술하고 있어,
`scope=` 쿼리에 넣을 문자열 형식이 정의되어 있지 않습니다. 실제 권한은 개발자센터에서
애플리케이션에 체크한 스코프로 결정되므로 인가 URL에 scope 를 보내지 않습니다.

**연결/구독 상한** — 클라이언트 세션 10개, 유저 세션 3개, 세션당 구독 30개
(채팅+후원+구독 합산). 끊긴 세션은 90일간 조회됩니다.

---

## 개발

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint (타입 인식 규칙 포함)
pnpm test         # vitest
pnpm check        # 위 셋 모두
pnpm build        # dist/ 로 컴파일
```

`strict` 에 더해 `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax` 까지 켜 둔 상태입니다.

### pnpm 이 `Cannot find module '../dist/pnpm.cjs'` 로 죽는다면

전역 pnpm 설치가 깨진 경우입니다. `package.json` 에 `packageManager: pnpm@9.15.0` 을
명시해 두었으니 corepack 으로 실행하면 됩니다.

```bash
corepack pnpm install
corepack pnpm run doctor
```

전역 설치를 고치려면 `npm i -g pnpm@9.15.0` 으로 다시 설치하세요.

---

## 보안

`.env` 와 `.tokens/` 는 `.gitignore` 에 포함되어 있습니다. 클라이언트 시크릿과
액세스/리프레시 토큰이 평문으로 들어가므로 **절대 커밋하지 마세요.**
`lives.getStreamKey()` 가 반환하는 스트림키는 방송 송출 권한 그 자체이니 로그에 남기지 마세요.

## 라이선스

MIT
