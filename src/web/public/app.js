/* 치지직 챗봇 설정 대시보드 — 빌드 단계 없이 브라우저에서 바로 실행됩니다. */

const ROLES = [
  ['streamer', '스트리머'],
  ['streaming_channel_manager', '채널 매니저'],
  ['streaming_chat_manager', '채팅 매니저'],
  ['common_user', '일반 시청자'],
];

const MODES = [
  ['contains', '포함하면'],
  ['equals', '완전히 같으면'],
  ['startsWith', '으로 시작하면'],
  ['regex', '정규식'],
];

const ACTIONS = [
  ['blind', '메시지 숨기기'],
  ['blindAndWarn', '숨기고 경고'],
  ['blindAndTempBan', '숨기고 임시제한'],
];

let config = null;

// ─── 유틸 ────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => (el.className = 'toast'), 2600);
}

async function api(path, method = 'GET', body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} 오류`);
  return data;
}

/** 사용자 입력을 그대로 innerHTML 에 넣지 않도록 항상 이스케이프합니다. */
function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function options(pairs, selected) {
  return pairs
    .map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${l}</option>`)
    .join('');
}

function roleChecks(container, selected, name) {
  container.innerHTML = ROLES.map(
    ([value, label]) => `
    <label><input type="checkbox" name="${name}" value="${value}"${
      selected.includes(value) ? ' checked' : ''
    } /> ${label}</label>`
  ).join('');
}

function readChecks(container) {
  return [...container.querySelectorAll('input:checked')].map((i) => i.value);
}

const lines = (text) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

// ─── 탭 ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ─── 렌더링 ──────────────────────────────────────────────────────────────────

function renderGeneral() {
  $('g-enabled').checked = config.general.enabled;
  $('g-prefix').value = config.general.prefix;
  $('g-interval').value = config.general.sendIntervalMs;
  $('g-unknown').checked = config.general.replyOnUnknownCommand;
}

function renderCommands() {
  const list = $('commandList');
  if (config.commands.length === 0) {
    list.innerHTML = '<div class="card notice"><p>아직 등록된 명령어가 없습니다.</p></div>';
    return;
  }

  list.innerHTML = config.commands
    .map(
      (c) => `
    <div class="item${c.enabled ? '' : ' disabled'}" data-id="${c.id}">
      <div class="item-head">
        <span class="item-title">${esc(config.general.prefix + c.name)}</span>
        <span class="badge">${{ text: '고정 문구', list: '목록형', counter: '카운터' }[c.type]}</span>
        <span class="badge">사용 ${c.usedCount}회</span>
        <span class="spacer"></span>
        <label class="badge"><input type="checkbox" data-f="enabled"${
          c.enabled ? ' checked' : ''
        } /> 사용</label>
      </div>

      <div class="grid2">
        <label class="field"><span>명령어 이름</span>
          <input type="text" data-f="name" value="${esc(c.name)}" /></label>
        <label class="field"><span>별칭 (쉼표로 구분)</span>
          <input type="text" data-f="aliases" value="${esc(c.aliases.join(', '))}" /></label>
      </div>

      <div class="grid2">
        <label class="field"><span>종류</span>
          <select data-f="type">${options(
            [
              ['text', '고정 문구'],
              ['list', '목록형'],
              ['counter', '카운터'],
            ],
            c.type
          )}</select></label>
        <label class="field"><span>쿨다운 (초)</span>
          <input type="number" data-f="cooldownSec" min="0" max="3600" value="${c.cooldownSec}" /></label>
      </div>

      <label class="field"><span>응답 문구</span>
        <input type="text" data-f="response" value="${esc(c.response)}" placeholder="비우면 기본 형식으로 출력합니다" />
        <small>치환자: <code>{user}</code> 호출자 · <code>{value}</code> 저장값 · <code>{n}</code> 개수 · <code>{count}</code> 카운터</small>
      </label>

      ${
        c.type === 'list'
          ? `<label class="field"><span>현재 목록 (${c.items.length}개)</span>
              <input type="text" data-f="items" value="${esc(c.items.join(', '))}" placeholder="빅헤드, 9구진" />
              <small>채팅에서 <code>${esc(config.general.prefix + c.name)} 빅헤드,9구진</code> 으로도 바꿀 수 있습니다.</small>
            </label>`
          : ''
      }
      ${
        c.type === 'counter'
          ? `<label class="field"><span>현재 값</span>
              <input type="number" data-f="count" min="0" value="${c.count}" /></label>`
          : ''
      }

      <div class="field"><span>사용 가능한 역할</span>
        <div class="checks" data-roles="useRoles"></div></div>
      <div class="field"><span>값을 수정할 수 있는 역할</span>
        <div class="checks" data-roles="editRoles"></div>
        <small>목록형·카운터에서만 의미가 있습니다.</small></div>

      <div class="actions">
        <button class="primary" data-act="save">저장</button>
        <button class="ghost danger" data-act="delete">삭제</button>
      </div>
    </div>`
    )
    .join('');

  config.commands.forEach((c) => {
    const item = list.querySelector(`[data-id="${c.id}"]`);
    roleChecks(item.querySelector('[data-roles="useRoles"]'), c.useRoles, `use_${c.id}`);
    roleChecks(item.querySelector('[data-roles="editRoles"]'), c.editRoles, `edit_${c.id}`);
  });
}

function renderAuto() {
  const list = $('autoList');
  if (config.autoResponses.length === 0) {
    list.innerHTML = '<div class="card notice"><p>아직 등록된 자동응답이 없습니다.</p></div>';
    return;
  }

  list.innerHTML = config.autoResponses
    .map(
      (a) => `
    <div class="item${a.enabled ? '' : ' disabled'}" data-id="${a.id}">
      <div class="item-head">
        <span class="item-title">${esc(a.label || a.pattern)}</span>
        <span class="spacer"></span>
        <label class="badge"><input type="checkbox" data-f="enabled"${
          a.enabled ? ' checked' : ''
        } /> 사용</label>
      </div>

      <div class="grid2">
        <label class="field"><span>이름</span>
          <input type="text" data-f="label" value="${esc(a.label)}" placeholder="구분용" /></label>
        <label class="field"><span>조건</span>
          <select data-f="mode">${options(MODES, a.mode)}</select></label>
      </div>

      <label class="field"><span>키워드</span>
        <input type="text" data-f="pattern" value="${esc(a.pattern)}" /></label>
      <label class="field"><span>응답 문구</span>
        <input type="text" data-f="response" value="${esc(a.response)}" />
        <small>치환자: <code>{user}</code></small></label>

      <div class="grid2">
        <label class="field"><span>쿨다운 (초)</span>
          <input type="number" data-f="cooldownSec" min="0" max="3600" value="${a.cooldownSec}" />
          <small>채널 공통입니다. 도배를 막습니다.</small></label>
        <label class="field"><span>응답 확률 (%)</span>
          <input type="number" data-f="chancePercent" min="1" max="100" value="${a.chancePercent}" /></label>
      </div>

      <div class="actions">
        <button class="primary" data-act="save">저장</button>
        <button class="ghost danger" data-act="delete">삭제</button>
      </div>
    </div>`
    )
    .join('');
}

function renderModeration() {
  $('m-enabled').checked = config.moderation.enabled;
  $('m-tempban').checked = config.moderation.allowTempBan;
  roleChecks($('m-exempt'), config.moderation.exemptRoles, 'exempt');

  const list = $('wordList');
  if (config.moderation.words.length === 0) {
    list.innerHTML = '<div class="card notice"><p>아직 등록된 금칙어가 없습니다.</p></div>';
    return;
  }

  list.innerHTML = config.moderation.words
    .map(
      (w) => `
    <div class="item${w.enabled ? '' : ' disabled'}" data-id="${w.id}">
      <div class="item-head">
        <span class="item-title">${esc(w.pattern)}</span>
        <span class="badge">${w.hitCount}회 적발</span>
        <span class="spacer"></span>
        <label class="badge"><input type="checkbox" data-f="enabled"${
          w.enabled ? ' checked' : ''
        } /> 사용</label>
      </div>

      <div class="grid2">
        <label class="field"><span>단어 / 패턴</span>
          <input type="text" data-f="pattern" value="${esc(w.pattern)}" /></label>
        <label class="field"><span>조건</span>
          <select data-f="mode">${options(MODES, w.mode)}</select></label>
      </div>

      <div class="grid2">
        <label class="field"><span>조치</span>
          <select data-f="action">${options(ACTIONS, w.action)}</select></label>
        <label class="field"><span>경고 문구</span>
          <input type="text" data-f="warnMessage" value="${esc(w.warnMessage)}" placeholder="비우면 기본 문구" /></label>
      </div>

      <div class="actions">
        <button class="primary" data-act="save">저장</button>
        <button class="ghost danger" data-act="delete">삭제</button>
      </div>
    </div>`
    )
    .join('');
}

function renderPerms() {
  roleChecks($('p-manage'), config.permissions.manageCommands, 'manage');
  $('p-admins').value = config.permissions.extraAdminChannelIds.join('\n');
  $('p-ignored').value = config.permissions.ignoredChannelIds.join('\n');
}

function renderAll() {
  renderGeneral();
  renderCommands();
  renderAuto();
  renderModeration();
  renderPerms();
}

// ─── 항목 값 읽기 ────────────────────────────────────────────────────────────

function readItem(el) {
  const out = {};
  el.querySelectorAll('[data-f]').forEach((input) => {
    const key = input.dataset.f;
    if (input.type === 'checkbox') out[key] = input.checked;
    else if (input.type === 'number') out[key] = Number(input.value);
    else if (key === 'aliases' || key === 'items')
      out[key] = input.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else out[key] = input.value;
  });
  el.querySelectorAll('[data-roles]').forEach((box) => {
    out[box.dataset.roles] = readChecks(box);
  });
  return out;
}

/** 목록 하나에 대한 저장/삭제 처리를 공통으로 묶습니다. */
function wireList(listId, endpoint, label) {
  $(listId).addEventListener('click', async (event) => {
    const button = event.target.closest('[data-act]');
    if (!button) return;

    const item = button.closest('.item');
    const id = item.dataset.id;

    try {
      if (button.dataset.act === 'delete') {
        if (!confirm(`${label}을(를) 삭제할까요?`)) return;
        await api(`${endpoint}/${id}`, 'DELETE');
        toast('삭제했습니다.');
      } else {
        await api(`${endpoint}/${id}`, 'PUT', readItem(item));
        toast('저장했습니다.');
      }
      await load();
    } catch (error) {
      toast(error.message, true);
    }
  });
}

// ─── 이벤트 ──────────────────────────────────────────────────────────────────

$('saveGeneral').addEventListener('click', async () => {
  try {
    await api('/config/general', 'PUT', {
      enabled: $('g-enabled').checked,
      prefix: $('g-prefix').value || '!',
      sendIntervalMs: Number($('g-interval').value),
      replyOnUnknownCommand: $('g-unknown').checked,
    });
    toast('저장했습니다.');
    await load();
  } catch (error) {
    toast(error.message, true);
  }
});

$('saveModeration').addEventListener('click', async () => {
  try {
    await api('/config/moderation', 'PUT', {
      enabled: $('m-enabled').checked,
      allowTempBan: $('m-tempban').checked,
      exemptRoles: readChecks($('m-exempt')),
    });
    toast('저장했습니다.');
    await load();
  } catch (error) {
    toast(error.message, true);
  }
});

$('savePerms').addEventListener('click', async () => {
  try {
    await api('/config/permissions', 'PUT', {
      manageCommands: readChecks($('p-manage')),
      extraAdminChannelIds: lines($('p-admins').value),
      ignoredChannelIds: lines($('p-ignored').value),
    });
    toast('저장했습니다.');
    await load();
  } catch (error) {
    toast(error.message, true);
  }
});

$('addCommand').addEventListener('click', async () => {
  const name = prompt('명령어 이름을 입력하세요 (접두사 제외). 예: 멤버');
  if (!name) return;
  try {
    await api('/commands', 'POST', { name: name.trim(), type: 'list' });
    toast(`${config.general.prefix}${name.trim()} 명령을 만들었습니다.`);
    await load();
  } catch (error) {
    toast(error.message, true);
  }
});

$('addAuto').addEventListener('click', async () => {
  try {
    await api('/auto-responses', 'POST', {
      label: '새 자동응답',
      pattern: '키워드',
      response: '{user}님 안녕하세요!',
    });
    await load();
  } catch (error) {
    toast(error.message, true);
  }
});

$('addWord').addEventListener('click', async () => {
  const pattern = prompt('금칙어를 입력하세요');
  if (!pattern) return;
  try {
    await api('/banned-words', 'POST', { pattern: pattern.trim() });
    await load();
  } catch (error) {
    toast(error.message, true);
  }
});

wireList('commandList', '/commands', '명령어');
wireList('autoList', '/auto-responses', '자동응답');
wireList('wordList', '/banned-words', '금칙어');

// ─── 상태 ────────────────────────────────────────────────────────────────────

async function loadStatus() {
  try {
    const status = await api('/status');
    if (status.account) {
      $('account').textContent =
        `${status.account.channelName} · ${status.account.channelId.slice(0, 8)}…`;
      $('statusDot').classList.add('on');
    } else {
      $('account').textContent = '봇이 실행 중이 아닙니다 (설정만 편집 가능)';
      $('statusDot').classList.remove('on');
    }

    const s = status.stats;
    $('statGrid').innerHTML = s
      ? [
          ['본 메시지', s.messagesSeen],
          ['실행한 명령', s.commandsRun],
          ['자동응답', s.autoResponsesSent],
          ['제재 조치', s.moderationActions],
          ['가동 시간', `${Math.floor((Date.now() - s.startedAt) / 60000)}분`],
        ]
          .map(([label, value]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`)
          .join('')
      : '<p class="hint">봇이 실행 중이 아닙니다.</p>';
  } catch {
    /* 상태 조회 실패는 조용히 넘어갑니다 */
  }
}

async function load() {
  config = await api('/config');
  renderAll();
}

load()
  .then(loadStatus)
  .catch((error) => toast(error.message, true));
setInterval(loadStatus, 5000);
