# Relay socketlib + Editor de Virtudes Homebrew + Catch-up de Spec — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Entregar três features num único ciclo SDD: (1.1) relay player→GM via socketlib no padrão *pedido → aprovação*; (4) editor in-app de Virtudes homebrew que pode adicionar custom e ocultar/substituir as canônicas; (3.2) trazer `docs/SPECS.md` e `docs/USER_STORIES.md` à paridade com a v1.11 e documentar as duas features novas.

**Architecture:** A camada de regras (`scripts/cardinal-virtuoso.mjs`) permanece a fonte de verdade e ganha funções puras de *request/approve* que reusam `applyConversation`/`applyQuirk` sem duplicar lógica. O relay (`scripts/relay.mjs`) é só um canal de notificação socketlib com *graceful degrade* — os dados continuam fluindo pela flag do próprio jogador. O dataset `VIRTUES` deixa de ser estático: vira um objeto **mutado in-place** por um resolver (`rebuildVirtues`) alimentado por settings de mundo, então todos os `import { VIRTUES }` existentes seguem válidos e refletem o homebrew ao vivo.

**Tech Stack:** Foundry VTT (ApplicationV2 + Handlebars), ESM, socketlib (dependência `recommends`, com fallback `game.socket`), i18n en/pt-BR.

**Convenção SDD:** este projeto é um módulo Foundry validado **manualmente no mundo** (histórico de QA por screenshots). Não há test-runner Node, e `cardinal-virtuoso.mjs` registra `Hooks.once` no topo (não importável fora do Foundry). Portanto, em vez de TDD com runner, cada fase segue: **(A) escrever/atualizar a spec → (B) implementar para satisfazer a spec → (C) verificar contra a spec** via checklist manual no Foundry. Onde houver lógica pura nova e isolável, há checagem por leitura/asserção mental documentada no passo de verificação. Commits frequentes por tarefa.

**Versão alvo:** `1.12.0`. Branch atual: `claude/phase-4-kim-chat` (working tree limpo).

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `docs/SPECS.md` | Modificar | Paridade 1.6–1.11 + seções do relay e homebrew |
| `docs/USER_STORIES.md` | Modificar | Épicos novos: requests (relay) e homebrew |
| `scripts/data.mjs` | Modificar | `CANONICAL_VIRTUES` + `VIRTUES` mutável + `rebuildVirtues` |
| `scripts/cardinal-virtuoso.mjs` | Modificar | `convDelta`, `requestConversation`, `requestQuirk`, `approveRequest`, `denyRequest`, settings `customVirtues`/`hiddenVirtues`, guardas defensivas em `reactToBond`, `rebuildVirtues` no ready |
| `scripts/relay.mjs` | Criar | Canal socketlib `notifyGM` + fallback `game.socket` |
| `scripts/kim.mjs` | Modificar | ctx/handlers de request, review estendido, editor de Virtudes |
| `templates/kim-conversation.hbs` | Modificar | Bloco de *request* de Conversation para player |
| `templates/kim-profile.hbs` | Modificar | Quirks viram *request* para player |
| `templates/kim-contraband-review.hbs` | Modificar | Seção "Pending Requests" com Approve/Deny |
| `templates/kim-contacts.hbs` | Modificar | Botão GM "Virtues" no rodapé |
| `templates/kim-virtues.hbs` | Criar | Editor de Virtudes homebrew (GM) |
| `lang/en.json`, `lang/pt-BR.json` | Modificar | Strings novas |
| `styles/cardinal-virtuoso.css` | Modificar | Estilos do editor e da seção de requests |
| `module.json` | Modificar | `relationships.recommends` socketlib, `esmodules` += relay, `version` |
| `CHANGELOG.md`, `README.md` | Modificar | Entrada 1.12.0 + notas de roadmap |

---

## FASE 0 — SDD baseline: catch-up de spec para 1.11 (item 3.2, parte A)

Antes de estender a spec, ela precisa refletir o que já existe (hoje está na 1.5.0).

### Task 0.1: Atualizar `docs/SPECS.md` para a v1.11

**Files:** Modify: `docs/SPECS.md`

- [ ] **Step 1: Atualizar cabeçalho e modelo de dados**

  - Linha 3: trocar `Versão do módulo: **1.5.0**` por `**1.11.0**`.
  - Linha 8: `VIRTUES` continua fonte de verdade, mas adicionar nota: "as 9 Virtues são o conjunto *canônico* (`CANONICAL_VIRTUES`); o conjunto efetivo (`VIRTUES`) pode ser alterado por homebrew — ver §10".
  - §2.1 (`blankDossier`): acrescentar os campos hoje ausentes na spec: `achievements: {}`, `soloMissions: 0`, `contrabandQueue: []`, `requestQueue: []` (este último entra na Fase 1; documentar como "ver §11").
  - §2.2 (`blankSlot`): acrescentar `missionLoss: 0` e o objeto `buffs` (`apology`, `apologyUsed`, `apologyExpiresMission`, `page`, `journal`, `journalWarnedThisMission`).

- [ ] **Step 2: Corrigir §5.3 Contraband (fluxo send/review da 1.11)**

  Substituir a antiga `applyContraband` por:
  - `sendContraband(d, vkey, item, glyph)` — ação do **player**: valida bonded/pendingBreak/`contraUsed ≥ cap`/`hqStock ≤ 0`; gasta 1 de estoque e 1 slot; enfileira em `contrabandQueue` **sem** aplicar afinidade.
  - `scoreContraband(d, entryId, {kind, value})` — ação do **GM**: aplica o delta (categoria FAV/LIKE/NEUTRAL/DISLIKE ou valor livre), com escudo de Apology Note, e desenfileira.
  - `discardContraband(d, entryId)` — GM descarta sem pontuar.

- [ ] **Step 3: Documentar features 1.6–1.10**

  Adicionar subseções: localização i18n (1.6), confirmação de End Mission (1.6), HQ Console GM-gated (1.10), trackers por Virtue + setting `rankReqByVirtue` (1.7), gifts automatizados + compêndio (1.8), achievements + Good Ending Points (1.9), foco/minimizar de janela (1.10). Cada uma em 2–4 linhas referenciando o arquivo/função real.

- [ ] **Step 4: Atualizar §6 (settings) e §9 (roadmap)**

  - §6: adicionar `rankReqByVirtue` (world, Object, config:false).
  - §9: marcar Relay e Homebrew como "em implementação nesta versão" (serão detalhados em §10/§11 nas Fases 1–2).

- [ ] **Step 5: Commit**

```bash
git add docs/SPECS.md
git commit -m "docs: bring SPECS up to v1.11 parity (contraband review, achievements, trackers, gifts)"
```

### Task 0.2: Atualizar `docs/USER_STORIES.md` para a v1.11

**Files:** Modify: `docs/USER_STORIES.md`

- [ ] **Step 1: Reescrever US-3.2/US-3.3 para o fluxo send/review**

  US-3.2 vira "enviar contrabando do inventário (player) → fila"; nova US-3.6 "Revisar contrabando (GM)" com Approve/Score/Discard. US-3.3 (hate-mail) marcar como substituída pelo fluxo de gifts/score (manter nota histórica).

- [ ] **Step 2: Adicionar épicos faltantes**

  - Épico 8 — Gifts automatizados (US-8.1 dar gift do inventário, US-8.2 efeitos: heartfelt/heated/pass/page/apology/journal).
  - Épico 9 — Achievements & Good Ending Points (US-9.1 auto-detect, US-9.2 toggles GM, US-9.3 pontuação compartilhada e ladder).
  - Épico 10 — Trackers por Virtue (US-10.1 requisitos por Virtue, US-10.2 janela read-only player / editável GM).

- [ ] **Step 3: Commit**

```bash
git add docs/USER_STORIES.md
git commit -m "docs: bring USER_STORIES up to v1.11 parity (gifts, achievements, trackers, review)"
```

---

## FASE 1 — Relay socketlib (item 1.1): pedido → aprovação

### Task 1.1: Spec do relay (SDD — escrever a spec primeiro)

**Files:** Modify: `docs/SPECS.md`, `docs/USER_STORIES.md`

- [ ] **Step 1: Adicionar §11 "Relay player→GM (requests)" em SPECS.md**

  Conteúdo a escrever:
  - **Modelo:** `dossier.requestQueue: [{ id, kind, vkey, payload, ts }]`, `kind ∈ {"conversation","quirk"}`. `payload` de conversation = `{topicHit, goodTalk, connectionHit}`; de quirk = `{qIndex}`.
  - **Slot gasto no pedido:** `requestConversation` incrementa `convUsed`; `requestQuirk` incrementa `quirkUses[qIndex]` — espelhando `sendContraband`. `denyRequest` faz refund.
  - **Aprovação:** `approveRequest` reusa o cálculo de `applyConversation`/`applyQuirk` **sem** re-incrementar o slot já gasto, aplicando afinidade + `finalize`.
  - **Transporte:** `scripts/relay.mjs` usa socketlib (`executeForAllGMs("notifyGM", …)`) para um toast em tempo real ao GM; *graceful degrade* sem socketlib (a flag do player já persiste; o `updateUser` hook re-renderiza a review do GM que estiver com aquele usuário selecionado).
  - **Permissões:** o player escreve só a própria flag (enfileira); o GM (que escreve qualquer flag) aprova/nega.

- [ ] **Step 2: Adicionar Épico 11 em USER_STORIES.md**

  - US-11.1 "Pedir Conversation (player)": player com bond marca o desfecho e envia pedido; gasta o slot da missão; nenhuma afinidade aplicada; GM é notificado.
  - US-11.2 "Pedir Quirk (player)": player dispara quirk como pedido (respeitando `perMission`).
  - US-11.3 "Aprovar/Negar (GM)": GM vê requests na janela de review; Approve aplica via `applyConversation`/`applyQuirk`; Deny faz refund do slot.
  - US-11.4 "Notificação em tempo real": GM online recebe toast (socketlib); sem socketlib, request aparece ao abrir a review.

- [ ] **Step 3: Commit**

```bash
git add docs/SPECS.md docs/USER_STORIES.md
git commit -m "docs: spec the player->GM request relay (SDD)"
```

### Task 1.2: Modelo — `requestQueue` no dossiê

**Files:** Modify: `scripts/cardinal-virtuoso.mjs:30-42` (`blankDossier`)

- [ ] **Step 1: Adicionar `requestQueue` ao `blankDossier`**

  No objeto retornado por `blankDossier()`, ao lado de `contrabandQueue: []`, adicionar:

```js
    // Requests the player sent for the GM to approve (Conversation/Quirk). Each:
    // { id, kind, vkey, payload, ts }. Affinity is applied only on approval.
    requestQueue: []
```

  `getDossier` já faz `mergeObject(blankDossier(), raw)`, então dossiês antigos recebem `requestQueue: []` por backfill — nenhuma migração extra.

- [ ] **Step 2: Verificação**

  Ler `getDossier`: confirmar que o merge cobre o novo array (cobre, pois é campo de topo do `blankDossier`). 

- [ ] **Step 3: Commit**

```bash
git add scripts/cardinal-virtuoso.mjs
git commit -m "feat: add requestQueue to dossier model"
```

### Task 1.3: Refatorar `applyConversation` para extrair `convDelta`

**Files:** Modify: `scripts/cardinal-virtuoso.mjs:191-210`

- [ ] **Step 1: Extrair a função pura de cálculo**

  Inserir antes de `applyConversation`:

```js
/* Pure outcome scoring for a Conversation: returns { delta, note } honoring the
   Page-of-One-liners buff (consumes it on a disliked topic) and the Apology
   shield. Does NOT touch convUsed or affinity — callers apply and finalize. */
function convDelta(slot, { topicHit, goodTalk, connectionHit }) {
  let delta = 0, note = "";
  if (topicHit === "like") delta += RULES.conv.topic;
  if (topicHit === "dislike") {
    if (slot.buffs?.page) { slot.buffs.page = false; note = " (Page of One-liners: disliked-topic penalty ignored, +1D)"; }
    else delta += RULES.conv.dislike;
  }
  if (goodTalk) delta += RULES.conv.goodTalk;
  if (connectionHit) delta += RULES.conv.connection;
  return { delta: withShield(slot, delta), note };
}
```

- [ ] **Step 2: Reescrever `applyConversation` usando `convDelta`**

```js
export function applyConversation(d, vkey, outcome) {
  const slot = d.virtues[vkey];
  const lock = slotLocked(slot);
  if (lock) return { ok: false, msg: lock };
  if (slot.convUsed >= convCap(d)) return { ok: false, msg: `Conversation limit reached (${convCap(d)}/mission).` };
  const { delta, note } = convDelta(slot, outcome);
  slot.affinity += delta;
  if (delta < 0) slot.missionLoss = (slot.missionLoss | 0) - delta;
  slot.convUsed += 1;
  return finalize(d, vkey, `${VIRTUES[vkey].name} — Conversation: ${delta >= 0 ? "+" : ""}${delta} affinity.${note}`);
}
```

- [ ] **Step 3: Verificação**

  Conferir que o comportamento é idêntico ao original (mesmos deltas, mesma ordem: shield aplicado após somar). É — `convDelta` reproduz linhas 198-205 originais.

- [ ] **Step 4: Commit**

```bash
git add scripts/cardinal-virtuoso.mjs
git commit -m "refactor: extract pure convDelta from applyConversation"
```

### Task 1.4: Funções de request/approve/deny na camada de regras

**Files:** Modify: `scripts/cardinal-virtuoso.mjs` (após `applyQuirk`, ~linha 286)

- [ ] **Step 1: Inserir as 4 funções**

```js
/* ----------------------------------------------------------------------------
 * REQUEST RELAY — player enqueues, GM approves. Spends the per-mission slot at
 * request time (like sendContraband); deny refunds it; approve scores it.
 * -------------------------------------------------------------------------- */
function newReqId() { return `rq-${Date.now()}-${Math.floor(Math.random() * 1e4)}`; }

/* Player: request a Conversation outcome. Validates like applyConversation but
   applies NO affinity — spends the slot and queues for GM approval. */
export function requestConversation(d, vkey, outcome) {
  const slot = d.virtues[vkey];
  const lock = slotLocked(slot);
  if (lock) return { ok: false, msg: lock };
  if (slot.convUsed >= convCap(d)) return { ok: false, msg: `Conversation limit reached (${convCap(d)}/mission).` };
  slot.convUsed += 1;
  d.requestQueue ??= [];
  const id = newReqId();
  d.requestQueue.push({ id, kind: "conversation", vkey, payload: { ...outcome }, ts: Date.now() });
  pushLog(d, `${VIRTUES[vkey].name} — Conversation requested (awaiting HQ approval).`);
  return { ok: true, msg: `Conversation with ${VIRTUES[vkey].name} sent for HQ approval.`, id };
}

/* Player: request a Quirk. Validates like applyQuirk; spends the per-mission use. */
export function requestQuirk(d, vkey, qIndex) {
  const slot = d.virtues[vkey];
  const lock = slotLocked(slot);
  if (lock) return { ok: false, msg: lock };
  const quirk = VIRTUES[vkey]?.quirks?.[qIndex];
  if (!quirk) return { ok: false, msg: "Unknown quirk." };
  const used = slot.quirkUses[qIndex] ?? 0;
  if (quirk.perMission && used >= quirk.perMission)
    return { ok: false, msg: `Quirk limit reached (${quirk.perMission}/mission).` };
  slot.quirkUses[qIndex] = used + 1;
  d.requestQueue ??= [];
  const id = newReqId();
  d.requestQueue.push({ id, kind: "quirk", vkey, payload: { qIndex }, ts: Date.now() });
  pushLog(d, `${VIRTUES[vkey].name} — Quirk "${quirk.label}" requested (awaiting HQ approval).`);
  return { ok: true, msg: `Quirk "${quirk.label}" sent for HQ approval.`, id };
}

/* GM: approve a queued request — applies affinity reusing the scoring logic,
   WITHOUT re-spending the slot (already spent at request time), then dequeues. */
export function approveRequest(d, reqId) {
  d.requestQueue ??= [];
  const idx = d.requestQueue.findIndex(r => r.id === reqId);
  if (idx < 0) return { ok: false, msg: "Request not found." };
  const req = d.requestQueue[idx];
  const slot = d.virtues[req.vkey];
  if (!slot) { d.requestQueue.splice(idx, 1); return { ok: false, msg: "Recipient no longer exists." }; }
  d.requestQueue.splice(idx, 1);
  if (req.kind === "conversation") {
    const { delta, note } = convDelta(slot, req.payload ?? {});
    slot.affinity += delta;
    if (delta < 0) slot.missionLoss = (slot.missionLoss | 0) - delta;
    return finalize(d, req.vkey, `${VIRTUES[req.vkey].name} — Conversation approved: ${delta >= 0 ? "+" : ""}${delta} affinity.${note}`);
  }
  if (req.kind === "quirk") {
    const quirk = VIRTUES[req.vkey]?.quirks?.[req.payload?.qIndex];
    if (!quirk) return { ok: false, msg: "Quirk no longer exists." };
    const qd = withShield(slot, quirk.delta);
    slot.affinity += qd;
    if (qd < 0) slot.missionLoss = (slot.missionLoss | 0) - qd;
    return finalize(d, req.vkey, `${VIRTUES[req.vkey].name} — Quirk "${quirk.label}" approved: ${qd >= 0 ? "+" : ""}${qd} affinity.`);
  }
  return { ok: false, msg: "Unknown request kind." };
}

/* GM: deny a queued request — refunds the spent slot and dequeues. */
export function denyRequest(d, reqId) {
  d.requestQueue ??= [];
  const idx = d.requestQueue.findIndex(r => r.id === reqId);
  if (idx < 0) return { ok: false, msg: "Request not found." };
  const req = d.requestQueue.splice(idx, 1)[0];
  const slot = d.virtues[req.vkey];
  if (slot) {
    if (req.kind === "conversation") slot.convUsed = Math.max(0, (slot.convUsed | 0) - 1);
    if (req.kind === "quirk") {
      const qi = req.payload?.qIndex;
      slot.quirkUses[qi] = Math.max(0, (slot.quirkUses[qi] | 0) - 1);
    }
  }
  const who = VIRTUES[req.vkey]?.name ?? req.vkey;
  pushLog(d, `${who} — ${req.kind} request denied by HQ (slot refunded).`);
  return { ok: true, msg: `${req.kind} request denied.` };
}
```

- [ ] **Step 2: Verificação**

  - `requestConversation` rejeita quando cap atingido (mesmo guard de `applyConversation`). ✔
  - `approveRequest` de conversation **não** mexe em `convUsed` (já gasto). ✔
  - `denyRequest` refund: `convUsed--` / `quirkUses[qi]--`. ✔
  - `convDelta`/`withShield` consomem buff `page` só na hora certa: na 1.11 o `page` é consumido em `applyConversation`; aqui ele é consumido na **aprovação** (convDelta roda no approve), não no pedido. Documentar essa nuance no §11 da spec (Task 1.1, Step 1): o buff Page é resolvido na aprovação. Editar a spec para refletir.

- [ ] **Step 3: Commit**

```bash
git add scripts/cardinal-virtuoso.mjs
git commit -m "feat: request/approve/deny rules for the player->GM relay"
```

### Task 1.5: Módulo de transporte socketlib

**Files:** Create: `scripts/relay.mjs`

- [ ] **Step 1: Escrever `scripts/relay.mjs`**

```js
/* ----------------------------------------------------------------------------
 * RELAY — real-time player→GM awareness for queued requests/contraband.
 * socketlib is optional: when absent, the queue still persists on the player's
 * own User flag and the GM sees it via the updateUser re-render. socketlib only
 * adds a live toast so the GM doesn't have to be looking at the review window.
 * -------------------------------------------------------------------------- */
const MOD = "cain-cardinal-virtuoso";
let _socket = null;

/* GM-side handler: a player notified us of a new pending item. */
function onNotifyGM({ fromUserId, label } = {}) {
  if (!game.user.isGM) return;
  const who = game.users.get(fromUserId)?.name ?? "An operative";
  ui.notifications.info(`KIM // ${who}: ${label ?? "new pending item for review."}`);
}

Hooks.once("socketlib.ready", () => {
  try {
    _socket = socketlib.registerModule(MOD);
    _socket.register("notifyGM", onNotifyGM);
    console.log(`${MOD} | relay socket registered`);
  } catch (e) {
    console.warn(`${MOD} | socketlib registration failed`, e);
  }
});

/* Fallback transport when socketlib isn't installed. */
Hooks.once("ready", () => {
  if (typeof socketlib !== "undefined") return;
  game.socket.on(`module.${MOD}`, (data) => {
    if (data?.t === "notifyGM") onNotifyGM(data.payload ?? {});
  });
});

/* Called by KIM after a player enqueues a request/contraband. Best-effort. */
export function relayNotifyGM(payload) {
  try {
    if (_socket) return _socket.executeForAllGMs("notifyGM", payload);
    if (typeof game !== "undefined" && game.socket)
      game.socket.emit(`module.${MOD}`, { t: "notifyGM", payload });
  } catch (e) {
    console.warn(`${MOD} | relayNotifyGM failed`, e);
  }
}
```

- [ ] **Step 2: Registrar o módulo em `module.json`**

  - Adicionar `"scripts/relay.mjs"` ao array `esmodules` (após os dois existentes).
  - Adicionar bloco `relationships` antes de `"flags"`:

```json
  "relationships": {
    "recommends": [
      { "id": "socketlib", "type": "module", "reason": "Real-time GM notification for player requests (optional; the tracker works without it)." }
    ]
  },
```

- [ ] **Step 3: Verificação**

  - Sem socketlib instalado: `_socket` fica null, fallback `game.socket` ativo, `relayNotifyGM` não lança. ✔
  - Com socketlib: `executeForAllGMs` entrega a todos os GMs online. ✔

- [ ] **Step 4: Commit**

```bash
git add scripts/relay.mjs module.json
git commit -m "feat: socketlib relay module with game.socket fallback"
```

### Task 1.6: KIM — player pede Conversation

**Files:** Modify: `templates/kim-conversation.hbs`, `scripts/kim.mjs`

- [ ] **Step 1: Bloco de request no template (player)**

  No `kim-conversation.hbs`, após o `{{#if isGM}}…{{/if}}` do bloco de marcação (linha 49), e ainda dentro do `{{#if canWrite}}`, adicionar um bloco para quando **não** é GM:

```handlebars
  {{#unless isGM}}
  <div class="cv-kim-marks cv-kim-req">
    <div class="cv-kim-marks-lbl">{{localize 'cain-cardinal-virtuoso.req.askConv'}} <small>({{convUsed}}/{{convCap}})</small></div>
    <div class="cv-conv-checks" data-virtue="{{key}}">
      <label><input type="checkbox" data-cv="topic" /> {{localize 'cain-cardinal-virtuoso.conv.likedTopic'}} +2</label>
      <label><input type="checkbox" data-cv="dislike" /> {{localize 'cain-cardinal-virtuoso.conv.dislikedTopic'}} −2</label>
      <label><input type="checkbox" data-cv="good" /> {{localize 'cain-cardinal-virtuoso.conv.wentWell'}} +2</label>
      <label><input type="checkbox" data-cv="conn" /> {{localize 'cain-cardinal-virtuoso.conv.connection'}} +2</label>
    </div>
    <button type="button" class="cv-btn cv-btn-on" data-action="reqConv" data-virtue="{{key}}">{{localize 'cain-cardinal-virtuoso.req.send'}}</button>
  </div>
  {{/unless}}
```

  Nota: este bloco só renderiza para quem tem `canWrite` (dono do dossiê) e não é GM. Como players só veem o próprio dossiê, isso é o jogador pedindo na sua própria Conversation.

- [ ] **Step 2: Wire da ação em `wireConv` (kim.mjs:690-702)**

  Adicionar ao objeto passado a `_delegate`:

```js
      reqConv:     (ev, el, b) => this.onRequestConv(el.dataset.virtue, b),
```

- [ ] **Step 3: Handler `onRequestConv` (após `onConv`, ~linha 799)**

```js
  async onRequestConv(key, body) {
    if (!key || !this.canWrite() || game.user.isGM) return;
    const box = body.querySelector(`.cv-conv-checks[data-virtue="${key}"]`);
    const get = (n) => !!box?.querySelector(`input[data-cv="${n}"]`)?.checked;
    const d = this.syncedDossier();
    const topicHit = get("dislike") ? "dislike" : (get("topic") ? "like" : null);
    const r = requestConversation(d, key, { topicHit, goodTalk: get("good"), connectionHit: get("conn") });
    if (await this.commit(d, r)) {
      relayNotifyGM({ fromUserId: game.user.id, label: fmt("cain-cardinal-virtuoso.req.notifyConv", { name: VIRTUES[key].name }) });
    }
  }
```

- [ ] **Step 4: Imports em kim.mjs**

  - Linha 8-17: adicionar `requestConversation, requestQuirk, approveRequest, denyRequest` ao import de `./cardinal-virtuoso.mjs`.
  - Após os imports, adicionar: `import { relayNotifyGM } from "./relay.mjs";`

- [ ] **Step 5: Verificação manual (Foundry)**

  Como player com bond: abrir Conversation → marcar "liked topic" → clicar "Pedir" → toast de envio; afinidade **não** muda; `convUsed` incrementa; GM recebe toast. Reabrir como GM (Admin Overwatch nesse user) → request aparece na review.

- [ ] **Step 6: Commit**

```bash
git add templates/kim-conversation.hbs scripts/kim.mjs
git commit -m "feat: players can request a Conversation outcome (relay)"
```

### Task 1.7: KIM — player pede Quirk

**Files:** Modify: `templates/kim-profile.hbs`, `scripts/kim.mjs`

- [ ] **Step 1: Inspecionar o bloco de quirks no profile**

  Ler `templates/kim-profile.hbs`, localizar os botões de quirk (`data-action="quirk"`, hoje sob `{{#if isGM}}`). Tornar os botões visíveis também ao player dono, com action condicional:

  - Para GM: `data-action="quirk"` (aplica direto, como hoje).
  - Para player (`{{#unless isGM}}` + `{{#if canWrite}}`): mesmos botões com `data-action="reqQuirk"`.

  Estrutura a aplicar (envolver a lista de quirks):

```handlebars
  {{#if canWrite}}
  <div class="cv-prof-quirks">
    {{#each quirks}}
    <button type="button" class="cv-btn cv-quirk {{#if good}}cv-q-good{{else}}cv-q-bad{{/if}}"
            data-action="{{#if ../isGM}}quirk{{else}}reqQuirk{{/if}}"
            data-virtue="{{../key}}" data-q="{{index}}"
            {{#if perMission}}title="{{used}}/{{perMission}}"{{/if}}>
      {{label}} {{deltaStr}}{{#if perMission}} <small>({{used}}/{{perMission}})</small>{{/if}}
    </button>
    {{/each}}
  </div>
  {{/if}}
```

  (Ajustar classes/markup ao que já existe no arquivo — preservar o visual atual; só duplicar o action por `isGM`.)

- [ ] **Step 2: Wire em `wireProfile` (kim.mjs:680-688)**

  Adicionar:

```js
      reqQuirk:    (ev, el) => this.onRequestQuirk(el.dataset.virtue, Number(el.dataset.q)),
```

- [ ] **Step 3: Handler `onRequestQuirk` (após `onQuirk`, ~linha 777)**

```js
  async onRequestQuirk(key, qIndex) {
    if (!this.canWrite() || game.user.isGM) return;
    const d = this.syncedDossier();
    const r = requestQuirk(d, key, qIndex);
    if (await this.commit(d, r)) {
      const label = VIRTUES[key]?.quirks?.[qIndex]?.label ?? "";
      relayNotifyGM({ fromUserId: game.user.id, label: fmt("cain-cardinal-virtuoso.req.notifyQuirk", { name: VIRTUES[key].name, quirk: label }) });
    }
  }
```

- [ ] **Step 4: Verificação manual**

  Como player com bond: abrir Profile → clicar uma quirk → toast de pedido; afinidade não muda; `used` da quirk incrementa; GM notificado.

- [ ] **Step 5: Commit**

```bash
git add templates/kim-profile.hbs scripts/kim.mjs
git commit -m "feat: players can request a Quirk (relay)"
```

### Task 1.8: KIM — review do GM aprova/nega requests

**Files:** Modify: `scripts/kim.mjs` (`contrabandReviewCtx`, `wireContrabandReview`), `templates/kim-contraband-review.hbs`

- [ ] **Step 1: Estender `contrabandReviewCtx` (kim.mjs:311-328)**

  Antes do `return`, montar a lista de requests:

```js
    const requests = (d.requestQueue ?? []).map(r => {
      const v = VIRTUES[r.vkey];
      let detail = "";
      if (r.kind === "conversation") {
        const p = r.payload ?? {};
        const parts = [];
        if (p.topicHit === "like") parts.push(loc("cain-cardinal-virtuoso.conv.likedTopic"));
        if (p.topicHit === "dislike") parts.push(loc("cain-cardinal-virtuoso.conv.dislikedTopic"));
        if (p.goodTalk) parts.push(loc("cain-cardinal-virtuoso.conv.wentWell"));
        if (p.connectionHit) parts.push(loc("cain-cardinal-virtuoso.conv.connection"));
        detail = parts.join(" · ") || loc("cain-cardinal-virtuoso.req.noOutcome");
      } else if (r.kind === "quirk") {
        detail = v?.quirks?.[r.payload?.qIndex]?.label ?? "";
      }
      return { id: r.id, kind: r.kind, name: v?.name ?? r.vkey, glyph: v?.glyph ?? "?", detail };
    });
```

  E acrescentar ao objeto retornado: `requests, hasRequests: requests.length > 0,`.

- [ ] **Step 2: Seção no template `kim-contraband-review.hbs`**

  Antes do `</div>` final (linha 36), adicionar:

```handlebars
  {{#if hasRequests}}
  <div class="cv-kim-review-sub">{{localize 'cain-cardinal-virtuoso.req.pending'}}</div>
  <ul class="cv-kim-review-list">
    {{#each requests}}
    <li class="cv-kim-review-item">
      <div class="cv-kim-review-head">
        <span class="cv-kim-review-name">{{glyph}} {{detail}}</span>
        <span class="cv-kim-review-to">&#9656; {{name}}</span>
      </div>
      <div class="cv-kim-review-free">
        <button type="button" class="cv-btn cv-btn-on" data-action="approveReq" data-id="{{id}}">{{localize 'cain-cardinal-virtuoso.req.approve'}}</button>
        <button type="button" class="cv-btn cv-btn-bad" data-action="denyReq" data-id="{{id}}">{{localize 'cain-cardinal-virtuoso.req.deny'}}</button>
      </div>
    </li>
    {{/each}}
  </ul>
  {{/if}}
```

  Ajustar o empty-state: trocar `{{#if hasQueue}}…{{else}}empty{{/if}}` para mostrar o empty só quando `!hasQueue && !hasRequests`. Reescrever a condição externa: envolver a lista de contraband em `{{#if hasQueue}}` e o empty em `{{#unless hasQueue}}{{#unless hasRequests}}…{{/unless}}{{/unless}}`.

- [ ] **Step 3: Wire em `wireContrabandReview` (kim.mjs:665-671)**

  Adicionar:

```js
      approveReq: (ev, el) => this.onApproveRequest(el.dataset.id),
      denyReq:    (ev, el) => this.onDenyRequest(el.dataset.id),
```

- [ ] **Step 4: Handlers (após `onDiscardContraband`, ~linha 753)**

```js
  async onApproveRequest(reqId) {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    if (!reqId) return;
    const d = this.syncedDossier();
    await this.commit(d, approveRequest(d, reqId));
  }

  async onDenyRequest(reqId) {
    if (!game.user.isGM) return ui.notifications.warn("No clearance.");
    if (!reqId) return;
    const d = this.syncedDossier();
    await this.commit(d, denyRequest(d, reqId));
  }
```

- [ ] **Step 5: Verificação manual**

  Como GM: abrir HQ Review do player que enviou → ver Conversation e Quirk pendentes → Approve aplica afinidade (log "approved") e remove da fila; Deny remove e devolve o slot (`convUsed`/`used` volta).

- [ ] **Step 6: Commit**

```bash
git add scripts/kim.mjs templates/kim-contraband-review.hbs
git commit -m "feat: GM approves/denies player requests in HQ review"
```

### Task 1.9: i18n do relay

**Files:** Modify: `lang/en.json`, `lang/pt-BR.json`

- [ ] **Step 1: Adicionar chaves (en.json)**

  Inserir no objeto (manter o aninhamento usado pelo arquivo — chaves achatadas tipo `"cain-cardinal-virtuoso.req.X"`):

```json
  "cain-cardinal-virtuoso.req.askConv": "Request outcome",
  "cain-cardinal-virtuoso.req.send": "Send to HQ",
  "cain-cardinal-virtuoso.req.pending": "Pending requests",
  "cain-cardinal-virtuoso.req.approve": "Approve",
  "cain-cardinal-virtuoso.req.deny": "Deny",
  "cain-cardinal-virtuoso.req.noOutcome": "(no outcome marked)",
  "cain-cardinal-virtuoso.req.notifyConv": "Conversation with {name} awaiting approval.",
  "cain-cardinal-virtuoso.req.notifyQuirk": "Quirk \"{quirk}\" for {name} awaiting approval."
```

- [ ] **Step 2: Adicionar chaves (pt-BR.json)**

```json
  "cain-cardinal-virtuoso.req.askConv": "Pedir desfecho",
  "cain-cardinal-virtuoso.req.send": "Enviar ao HQ",
  "cain-cardinal-virtuoso.req.pending": "Pedidos pendentes",
  "cain-cardinal-virtuoso.req.approve": "Aprovar",
  "cain-cardinal-virtuoso.req.deny": "Negar",
  "cain-cardinal-virtuoso.req.noOutcome": "(sem desfecho marcado)",
  "cain-cardinal-virtuoso.req.notifyConv": "Conversa com {name} aguardando aprovação.",
  "cain-cardinal-virtuoso.req.notifyQuirk": "Quirk \"{quirk}\" para {name} aguardando aprovação."
```

  Confirmar o formato real do JSON (achatado vs aninhado) ao editar e seguir o existente.

- [ ] **Step 3: Commit**

```bash
git add lang/en.json lang/pt-BR.json
git commit -m "i18n: relay request strings (en, pt-BR)"
```

---

## FASE 2 — Editor de Virtudes homebrew (item 4)

### Task 2.1: Spec do homebrew (SDD)

**Files:** Modify: `docs/SPECS.md`, `docs/USER_STORIES.md`

- [ ] **Step 1: §10 "Virtudes homebrew" em SPECS.md**

  - **Resolver:** `CANONICAL_VIRTUES` (as 9 fixas) + `VIRTUES` (objeto **mutado in-place** = conjunto efetivo). `rebuildVirtues({custom, hidden})` limpa `VIRTUES` e repovoa = canônicas não-ocultas + custom (custom estende/sobrescreve por chave).
  - **Settings:** `customVirtues` (Object, world, config:false) e `hiddenVirtues` (Array, world, config:false). Reconstruídos em `ready`.
  - **Integridade:** `reactToBond` e mensagens usam `VIRTUES[k]?.name ?? k` (chave ausente = pulada). Achievements `bond3:*` continuam canônicos. Retratos: custom usa o campo `portrait`.
  - **Editor (GM):** janela `kim-virtues`; ocultar/mostrar canônicas, CRUD de custom (key, name, epithet, glyph, likes/dislikes/food, blasphemy, bonds 0–3, quirks, bondReactions).

- [ ] **Step 2: Épico 12 em USER_STORIES.md** (US-12.1 criar custom, US-12.2 editar/excluir, US-12.3 ocultar canônica, US-12.4 integridade de reações/achievements ao ocultar).

- [ ] **Step 3: Commit**

```bash
git add docs/SPECS.md docs/USER_STORIES.md
git commit -m "docs: spec homebrew virtues editor (SDD)"
```

### Task 2.2: Resolver `VIRTUES` mutável em `data.mjs`

**Files:** Modify: `scripts/data.mjs:9-197`

- [ ] **Step 1: Renomear o objeto literal das 9 Virtues**

  Trocar `export const VIRTUES = {` (linha 9) por `export const CANONICAL_VIRTUES = {`. O literal das 9 Virtues fica intacto.

- [ ] **Step 2: Adicionar `VIRTUES` mutável + `rebuildVirtues` (logo após o literal, ~linha 197)**

```js
/* Effective virtue set: a SINGLE object mutated in place so every
   `import { VIRTUES }` keeps a live reference. Defaults to the canonical nine;
   rebuildVirtues() reshapes it from world settings (homebrew + hidden). */
export const VIRTUES = {};
function _clone(o) { return JSON.parse(JSON.stringify(o)); }
export function rebuildVirtues({ custom = {}, hidden = [] } = {}) {
  for (const k of Object.keys(VIRTUES)) delete VIRTUES[k];
  const hiddenSet = new Set(hidden);
  for (const [k, v] of Object.entries(CANONICAL_VIRTUES)) {
    if (!hiddenSet.has(k)) VIRTUES[k] = _clone(v);
  }
  for (const [k, v] of Object.entries(custom || {})) {
    VIRTUES[k] = VIRTUES[k] ? { ...VIRTUES[k], ..._clone(v) } : _clone(v);
  }
  return VIRTUES;
}
// Seed with the canonical set at import time (no Foundry globals needed).
rebuildVirtues();
```

- [ ] **Step 3: Verificação**

  - `VIRTUES` referência estável (nunca reatribuída). ✔ Consumidores `import { VIRTUES }` continuam corretos.
  - `JSON.parse(JSON.stringify())` é seguro p/ os dados (sem funções/Dates). ✔

- [ ] **Step 4: Commit**

```bash
git add scripts/data.mjs
git commit -m "feat: VIRTUES becomes a rebuildable effective set (canonical + homebrew)"
```

### Task 2.3: Guardas defensivas para chaves ausentes

**Files:** Modify: `scripts/cardinal-virtuoso.mjs` (`reactToBond` ~343-356, `endMission`/`timeOff` mensagens, `blankDossier`/`getDossier` já usam `Object.keys(VIRTUES)`)

- [ ] **Step 1: `reactToBond` tolera chave alterada ausente**

  Linha 352: trocar `${VIRTUES[changedKey].name}` por `${VIRTUES[changedKey]?.name ?? changedKey}`. E no loop, `VIRTUES[vkey]` já vem de `Object.entries(d.virtues)` — adicionar guarda: se `!VIRTUES[vkey]` então `continue` (Virtue oculta ainda no dossiê salvo não reage).

```js
  for (const [vkey, slot] of Object.entries(d.virtues)) {
    if (vkey === changedKey || !slot.bonded || slot.pendingBreak) continue;
    const def = VIRTUES[vkey];
    if (!def) continue; // hidden/removed virtue still stored — skip its reactions
    const reactions = def.bondReactions ?? {};
    ...
    `${def.name} reacts to your ${why} with ${VIRTUES[changedKey]?.name ?? changedKey}: ...`
```

- [ ] **Step 2: `applyRankUps`/`endMission`/`timeOff` mensagens**

  Onde aparece `VIRTUES[vkey].name` / `VIRTUES[k].name` em loops sobre `d.virtues`, trocar por `VIRTUES[vkey]?.name ?? vkey`. Pontos: linha 396, 424, 441, 455. `endMission` linha 418 itera `Object.entries(d.virtues)` — só lê `slot`, ok; só ajustar onde lê `VIRTUES[...]`.

- [ ] **Step 3: `getDossier` backfill com Virtudes custom**

  `getDossier` (linha 49-52) faz `for (const k of Object.keys(VIRTUES)) d.virtues[k] = mergeObject(blankSlot(), d.virtues[k] ?? {})`. Com Virtudes custom já em `VIRTUES`, elas ganham slot automaticamente. Confirmar que Virtudes **ocultas** não recebem slot novo (não estão em `VIRTUES`) mas slots antigos sobrevivem no `raw` via o `mergeObject(blankDossier(), raw)` da linha 48 — sim, sobrevivem inertes. ✔ Nenhuma mudança de código necessária; só verificar.

- [ ] **Step 4: Commit**

```bash
git add scripts/cardinal-virtuoso.mjs
git commit -m "fix: defensive virtue-key lookups for hidden/homebrew virtues"
```

### Task 2.4: Settings + rebuild no ready

**Files:** Modify: `scripts/cardinal-virtuoso.mjs` (import, `init` hook ~528, `ready` hook ~547)

- [ ] **Step 1: Importar o resolver**

  Linha 1: `import { VIRTUES, CANONICAL_VIRTUES, rebuildVirtues, RULES, GIFTS, ACHIEVEMENTS, GOOD_ENDING_REWARDS } from "./data.mjs";`

- [ ] **Step 2: Registrar settings em `init`**

  Dentro de `Hooks.once("init", ...)`, após `rankReqByVirtue`:

```js
  game.settings.register(MOD, "customVirtues", {
    scope: "world", config: false, type: Object, default: {}
  });
  game.settings.register(MOD, "hiddenVirtues", {
    scope: "world", config: false, type: Array, default: []
  });
```

- [ ] **Step 3: Rebuild em `ready`**

  No `Hooks.once("ready", ...)`, antes de `ensureGiftCompendium()`:

```js
  rebuildVirtues({
    custom: game.settings.get(MOD, "customVirtues") || {},
    hidden: game.settings.get(MOD, "hiddenVirtues") || []
  });
```

- [ ] **Step 4: Helpers exportados de persistência**

  Adicionar (perto de `setVirtueRankReq`):

```js
export async function saveCustomVirtue(key, def) {
  const all = { ...(game.settings.get(MOD, "customVirtues") || {}) };
  all[key] = def;
  await game.settings.set(MOD, "customVirtues", all);
  rebuildVirtues({ custom: all, hidden: game.settings.get(MOD, "hiddenVirtues") || [] });
}
export async function deleteCustomVirtue(key) {
  const all = { ...(game.settings.get(MOD, "customVirtues") || {}) };
  delete all[key];
  await game.settings.set(MOD, "customVirtues", all);
  rebuildVirtues({ custom: all, hidden: game.settings.get(MOD, "hiddenVirtues") || [] });
}
export async function setVirtueHidden(key, hidden) {
  const set = new Set(game.settings.get(MOD, "hiddenVirtues") || []);
  if (hidden) set.add(key); else set.delete(key);
  const arr = [...set];
  await game.settings.set(MOD, "hiddenVirtues", arr);
  rebuildVirtues({ custom: game.settings.get(MOD, "customVirtues") || {}, hidden: arr });
}
export function isCanonical(key) { return key in CANONICAL_VIRTUES; }
```

- [ ] **Step 5: Verificação**

  Após `ready`, `VIRTUES` reflete settings. `saveCustomVirtue` persiste e reconstrói ao vivo.

- [ ] **Step 6: Commit**

```bash
git add scripts/cardinal-virtuoso.mjs
git commit -m "feat: customVirtues/hiddenVirtues settings + rebuild on ready"
```

### Task 2.5: Editor de Virtudes — janela KIM (GM)

**Files:** Create: `templates/kim-virtues.hbs`; Modify: `scripts/kim.mjs`

- [ ] **Step 1: `virtuesCtx()` em kim.mjs** (perto dos outros ctx builders)

```js
  virtuesCtx() {
    const hidden = new Set(game.settings.get(MOD, "hiddenVirtues") || []);
    const custom = game.settings.get(MOD, "customVirtues") || {};
    const canonical = Object.entries(CANONICAL_VIRTUES).map(([key, v]) => ({
      key, name: v.name, epithet: v.epithet, glyph: v.glyph, hidden: hidden.has(key)
    }));
    const customList = Object.entries(custom).map(([key, v]) => ({
      key, name: v.name, epithet: v.epithet, glyph: v.glyph,
      likes: (v.likes || []).join(", "), dislikes: (v.dislikes || []).join(", "),
      food: (v.food || []).join(", "), blasphemy: v.blasphemy || "",
      bond0: v.bonds?.[0] || "", bond1: v.bonds?.[1] || "", bond2: v.bonds?.[2] || "", bond3: v.bonds?.[3] || ""
    }));
    return { isGM: game.user.isGM, canonical, customList };
  }
```

- [ ] **Step 2: `openVirtues()` (GM-only)**

```js
  async openVirtues() {
    if (!game.user.isGM) return;
    const id = "kim-virtues";
    const html = await renderTpl(T("kim-virtues.hbs"), this.virtuesCtx());
    this._open.add(id);
    this.wm.open(id, {
      title: loc("cain-cardinal-virtuoso.virt.title"), icon: "⛨", width: 460, height: 620,
      html, onBody: (b) => this.wireVirtues(b),
      onClose: () => this._open.delete(id)
    });
  }
```

- [ ] **Step 3: Branch em `refresh()` (kim.mjs:569-604)**

  Adicionar:

```js
      } else if (id === "kim-virtues") {
        this.wm.setHtml(id, await renderTpl(T("kim-virtues.hbs"), this.virtuesCtx()), (b) => this.wireVirtues(b));
```

- [ ] **Step 4: `wireVirtues` + handlers**

```js
  wireVirtues(body) {
    this._delegate(body, {
      toggleHidden: (ev, el) => this.onToggleHidden(el.dataset.key, el.checked),
      editCustom:   (ev, el, b) => this.fillCustomForm(b, el.dataset.key),
      deleteCustom: (ev, el) => this.onDeleteCustom(el.dataset.key),
      saveCustom:   (ev, el, b) => this.onSaveCustom(b)
    });
  }

  async onToggleHidden(key, hidden) {
    if (!game.user.isGM) return;
    await setVirtueHidden(key, !!hidden);
    await this.refresh();
  }

  async onDeleteCustom(key) {
    if (!game.user.isGM) return;
    const ok = await foundryConfirm(fmt("cain-cardinal-virtuoso.virt.delAsk", { key }));
    if (!ok) return;
    await deleteCustomVirtue(key);
    await this.refresh();
  }

  fillCustomForm(body, key) {
    const custom = game.settings.get(MOD, "customVirtues") || {};
    const v = custom[key]; if (!v) return;
    const set = (n, val) => { const el = body.querySelector(`[name="${n}"]`); if (el) el.value = val; };
    set("vkey", key); set("vname", v.name); set("vepithet", v.epithet); set("vglyph", v.glyph);
    set("vlikes", (v.likes||[]).join(", ")); set("vdislikes", (v.dislikes||[]).join(", "));
    set("vfood", (v.food||[]).join(", ")); set("vblasphemy", v.blasphemy||"");
    set("vbond0", v.bonds?.[0]||""); set("vbond1", v.bonds?.[1]||"");
    set("vbond2", v.bonds?.[2]||""); set("vbond3", v.bonds?.[3]||"");
    set("vquirks", (v.quirks||[]).map(q => `${q.label}|${q.delta}${q.perMission?`|${q.perMission}`:""}`).join("\n"));
    set("vreactions", Object.entries(v.bondReactions||{}).map(([k,dl]) => `${k}|${dl}`).join("\n"));
  }

  async onSaveCustom(body) {
    if (!game.user.isGM) return;
    const g = (n) => body.querySelector(`[name="${n}"]`)?.value?.trim() ?? "";
    const key = g("vkey").toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!key) return ui.notifications.warn(loc("cain-cardinal-virtuoso.virt.needKey"));
    if (key in CANONICAL_VIRTUES === false && false) {} // custom keys may shadow canonical via override
    const csv = (s) => s.split(",").map(x => x.trim()).filter(Boolean);
    const quirks = g("vquirks").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
      const [label, delta, perMission] = l.split("|").map(x => x?.trim());
      const q = { label: label || "?", delta: parseInt(delta, 10) || 0 };
      const pm = parseInt(perMission, 10); if (Number.isFinite(pm) && pm > 0) q.perMission = pm;
      return q;
    });
    const bondReactions = {};
    for (const l of g("vreactions").split("\n").map(x => x.trim()).filter(Boolean)) {
      const [tk, dl] = l.split("|").map(x => x?.trim());
      const n = parseInt(dl, 10); if (tk && Number.isFinite(n)) bondReactions[tk] = n;
    }
    const def = {
      name: g("vname") || key, epithet: g("vepithet"), glyph: g("vglyph") || "?", portrait: "",
      likes: csv(g("vlikes")), dislikes: csv(g("vdislikes")), food: csv(g("vfood")),
      blasphemy: g("vblasphemy") || "—",
      bonds: { 0: g("vbond0"), 1: g("vbond1"), 2: g("vbond2"), 3: g("vbond3") },
      quirks, bondReactions
    };
    await saveCustomVirtue(key, def);
    ui.notifications.info(fmt("cain-cardinal-virtuoso.virt.saved", { name: def.name }));
    await this.refresh();
  }
```

  (Remover a linha morta `if (key in CANONICAL_VIRTUES === false && false) {}` — placeholder de comentário; manter só o comentário explicando que chaves custom podem sombrear canônicas.)

- [ ] **Step 5: Imports em kim.mjs**

  - Adicionar ao import de data.mjs: `CANONICAL_VIRTUES`.
  - Adicionar ao import de cardinal-virtuoso.mjs: `saveCustomVirtue, deleteCustomVirtue, setVirtueHidden, isCanonical`.

- [ ] **Step 6: Template `templates/kim-virtues.hbs`**

```handlebars
<div class="cv-kim cv-kim-virt">
  {{#unless isGM}}
  <div class="cv-kim-empty-state">{{localize 'cain-cardinal-virtuoso.virt.gmOnly'}}</div>
  {{else}}

  <div class="cv-kim-drop-head">
    <span class="cv-kim-drop-ico">⛨</span>
    <div class="cv-kim-drop-id">
      <span class="cv-kim-drop-title">{{localize 'cain-cardinal-virtuoso.virt.title'}}</span>
      <span class="cv-kim-drop-sub">{{localize 'cain-cardinal-virtuoso.virt.sub'}}</span>
    </div>
  </div>

  <div class="cv-kim-review-sub">{{localize 'cain-cardinal-virtuoso.virt.canonical'}}</div>
  <ul class="cv-virt-list">
    {{#each canonical}}
    <li class="cv-virt-row">
      <span class="cv-virt-glyph">{{glyph}}</span>
      <span class="cv-virt-name">{{name}} <small>{{epithet}}</small></span>
      <label class="cv-virt-hide"><input type="checkbox" data-action="toggleHidden" data-key="{{key}}" {{#if hidden}}checked{{/if}} /> {{localize 'cain-cardinal-virtuoso.virt.hide'}}</label>
    </li>
    {{/each}}
  </ul>

  <div class="cv-kim-review-sub">{{localize 'cain-cardinal-virtuoso.virt.custom'}}</div>
  <ul class="cv-virt-list">
    {{#each customList}}
    <li class="cv-virt-row">
      <span class="cv-virt-glyph">{{glyph}}</span>
      <span class="cv-virt-name">{{name}} <small>{{epithet}}</small></span>
      <button type="button" class="cv-btn" data-action="editCustom" data-key="{{key}}">{{localize 'cain-cardinal-virtuoso.virt.edit'}}</button>
      <button type="button" class="cv-btn cv-btn-bad" data-action="deleteCustom" data-key="{{key}}">{{localize 'cain-cardinal-virtuoso.virt.del'}}</button>
    </li>
    {{else}}
    <li class="cv-kim-empty">{{localize 'cain-cardinal-virtuoso.virt.noCustom'}}</li>
    {{/each}}
  </ul>

  <div class="cv-kim-review-sub">{{localize 'cain-cardinal-virtuoso.virt.form'}}</div>
  <div class="cv-virt-form">
    <label>{{localize 'cain-cardinal-virtuoso.virt.fKey'}}<input type="text" name="vkey" placeholder="ex.: temperance" /></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fName'}}<input type="text" name="vname" /></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fEpithet'}}<input type="text" name="vepithet" /></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fGlyph'}}<input type="text" name="vglyph" maxlength="4" /></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fLikes'}}<input type="text" name="vlikes" placeholder="a, b, c" /></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fDislikes'}}<input type="text" name="vdislikes" placeholder="a, b, c" /></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fFood'}}<input type="text" name="vfood" placeholder="a, b" /></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fBlasphemy'}}<input type="text" name="vblasphemy" /></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fBond0'}}<textarea name="vbond0" rows="1"></textarea></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fBond1'}}<textarea name="vbond1" rows="1"></textarea></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fBond2'}}<textarea name="vbond2" rows="1"></textarea></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fBond3'}}<textarea name="vbond3" rows="1"></textarea></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fQuirks'}}<textarea name="vquirks" rows="3" placeholder="label|delta|perMission(opcional)"></textarea></label>
    <label>{{localize 'cain-cardinal-virtuoso.virt.fReactions'}}<textarea name="vreactions" rows="2" placeholder="targetKey|delta"></textarea></label>
    <button type="button" class="cv-btn cv-btn-on" data-action="saveCustom">{{localize 'cain-cardinal-virtuoso.virt.save'}}</button>
  </div>

  {{/unless}}
</div>
```

- [ ] **Step 7: Commit**

```bash
git add templates/kim-virtues.hbs scripts/kim.mjs
git commit -m "feat: homebrew Virtues editor window (GM CRUD + hide canonical)"
```

### Task 2.6: Botão de acesso ao editor (rodapé Contacts, GM)

**Files:** Modify: `templates/kim-contacts.hbs`, `scripts/kim.mjs:629-642`

- [ ] **Step 1: Inspecionar o rodapé do Contacts e adicionar botão GM**

  Ler `templates/kim-contacts.hbs`; localizar o rodapé com os botões `openHQ`/`openTracker`/`openAchievements` (todos `data-action`). Adicionar, sob `{{#if isGM}}`:

```handlebars
      <button type="button" class="cv-btn" data-action="openVirtues" title="{{localize 'cain-cardinal-virtuoso.virt.title'}}">⛨ {{localize 'cain-cardinal-virtuoso.virt.short'}}</button>
```

- [ ] **Step 2: Wire em `wireContacts`**

  Adicionar: `openVirtues: () => this.openVirtues(),`

- [ ] **Step 3: Verificação manual**

  Como GM: rodapé do KIM mostra "⛨ Virtues" → abre o editor. Como player: botão ausente.

- [ ] **Step 4: Commit**

```bash
git add templates/kim-contacts.hbs scripts/kim.mjs
git commit -m "feat: GM entry point for the Virtues editor in contacts footer"
```

### Task 2.7: i18n + CSS do homebrew

**Files:** Modify: `lang/en.json`, `lang/pt-BR.json`, `styles/cardinal-virtuoso.css`

- [ ] **Step 1: Chaves en.json**

```json
  "cain-cardinal-virtuoso.virt.title": "Virtue Designer",
  "cain-cardinal-virtuoso.virt.short": "Virtues",
  "cain-cardinal-virtuoso.virt.sub": "Homebrew & canon toggles",
  "cain-cardinal-virtuoso.virt.gmOnly": "GM only.",
  "cain-cardinal-virtuoso.virt.canonical": "Canonical (toggle to hide)",
  "cain-cardinal-virtuoso.virt.custom": "Homebrew virtues",
  "cain-cardinal-virtuoso.virt.noCustom": "No homebrew virtues yet.",
  "cain-cardinal-virtuoso.virt.form": "Add / edit homebrew",
  "cain-cardinal-virtuoso.virt.hide": "hide",
  "cain-cardinal-virtuoso.virt.edit": "Edit",
  "cain-cardinal-virtuoso.virt.del": "Delete",
  "cain-cardinal-virtuoso.virt.delAsk": "Delete homebrew virtue \"{key}\"?",
  "cain-cardinal-virtuoso.virt.needKey": "A key is required.",
  "cain-cardinal-virtuoso.virt.saved": "Virtue {name} saved.",
  "cain-cardinal-virtuoso.virt.fKey": "Key",
  "cain-cardinal-virtuoso.virt.fName": "Name",
  "cain-cardinal-virtuoso.virt.fEpithet": "Epithet",
  "cain-cardinal-virtuoso.virt.fGlyph": "Glyph",
  "cain-cardinal-virtuoso.virt.fLikes": "Likes",
  "cain-cardinal-virtuoso.virt.fDislikes": "Dislikes",
  "cain-cardinal-virtuoso.virt.fFood": "Food",
  "cain-cardinal-virtuoso.virt.fBlasphemy": "Blasphemy",
  "cain-cardinal-virtuoso.virt.fBond0": "Bond 0",
  "cain-cardinal-virtuoso.virt.fBond1": "Bond 1",
  "cain-cardinal-virtuoso.virt.fBond2": "Bond 2",
  "cain-cardinal-virtuoso.virt.fBond3": "Bond 3",
  "cain-cardinal-virtuoso.virt.fQuirks": "Quirks (one per line)",
  "cain-cardinal-virtuoso.virt.fReactions": "Bond reactions (one per line)",
  "cain-cardinal-virtuoso.virt.save": "Save virtue"
```

- [ ] **Step 2: Chaves pt-BR.json** (mesmas chaves, traduzidas: "Virtue Designer"→"Designer de Virtudes", "hide"→"ocultar", "Edit"→"Editar", "Delete"→"Excluir", "Add / edit homebrew"→"Adicionar / editar homebrew", "Save virtue"→"Salvar virtude", "Key"→"Chave", "Name"→"Nome", "Epithet"→"Epíteto", "Glyph"→"Glifo", "Likes"→"Gosta", "Dislikes"→"Não gosta", "Food"→"Comida", "Blasphemy"→"Blasfêmia", "Quirks (one per line)"→"Quirks (uma por linha)", "Bond reactions (one per line)"→"Reações de vínculo (uma por linha)", etc.)

- [ ] **Step 3: CSS mínimo (apêndice em cardinal-virtuoso.css)**

```css
/* Virtue Designer + relay review */
.cv-virt-list { list-style: none; margin: 4px 0; padding: 0; }
.cv-virt-row { display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-bottom: 1px solid var(--cv-line, #333); }
.cv-virt-glyph { width: 20px; text-align: center; opacity: .8; }
.cv-virt-name { flex: 1; }
.cv-virt-name small { opacity: .6; }
.cv-virt-hide { font-size: 11px; opacity: .8; white-space: nowrap; }
.cv-virt-form { display: flex; flex-direction: column; gap: 4px; padding: 4px; }
.cv-virt-form label { display: flex; flex-direction: column; font-size: 11px; gap: 2px; }
.cv-kim-req { border-top: 1px dashed var(--cv-line, #333); }
```

  (Ajustar nomes de variáveis CSS ao que o arquivo já usa.)

- [ ] **Step 4: Commit**

```bash
git add lang/en.json lang/pt-BR.json styles/cardinal-virtuoso.css
git commit -m "i18n+css: Virtue Designer strings and styles"
```

---

## FASE 3 — Documentação final, versão e release (item 3.2, parte B)

### Task 3.1: Finalizar specs com as features novas

**Files:** Modify: `docs/SPECS.md` (§9 roadmap → mover Relay/Homebrew para "implementado"), `README.md`

- [ ] **Step 1:** Em `docs/SPECS.md` §9, remover Relay e Homebrew do "não implementado" (ficam só §10/§11 + SQLite como pendente). Atualizar a tabela de settings (§6) com `customVirtues`, `hiddenVirtues`.
- [ ] **Step 2:** Em `README.md`, atualizar "Roadmap notes": marcar o relay socketlib como entregue; adicionar uma linha sobre o Virtue Designer. Adicionar socketlib como dependência recomendada na seção de install.
- [ ] **Step 3: Commit**

```bash
git add docs/SPECS.md README.md
git commit -m "docs: finalize SPECS/README for relay + homebrew"
```

### Task 3.2: CHANGELOG + bump de versão

**Files:** Modify: `CHANGELOG.md`, `module.json`

- [ ] **Step 1:** Adicionar entrada no topo do `CHANGELOG.md`:

```markdown
## 1.12.0 — Player→GM request relay & homebrew Virtue Designer
- **Players can request affinity actions again.** Conversation outcomes and
  Quirks are sent to an HQ approval queue (the per-mission slot is spent on
  request and refunded on denial); the GM approves or denies them in the HQ
  Review window, reusing the existing scoring logic. socketlib delivers a live
  toast to the GM (optional dependency; the queue still works without it).
- **Homebrew Virtue Designer (GM).** A new GM-only window adds custom Virtues
  (name, epithet, glyph, likes/dislikes/food, blasphemy, bond text, quirks, bond
  reactions) and can hide canonical ones. The effective virtue set is rebuilt
  live from world settings; bond reactions resolve defensively around hidden keys.
- **Docs.** SPECS and USER_STORIES brought to current parity (1.6–1.12).
```

- [ ] **Step 2:** Em `module.json`, trocar `"version": "1.11.0"` por `"1.12.0"`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md module.json
git commit -m "chore: release 1.12.0 — request relay & homebrew Virtue Designer"
```

---

## Verificação final (checklist manual no Foundry — SDD passo C global)

- [ ] **Relay:** player envia Conversation e Quirk → GM recebe toast → GM aprova (afinidade aplicada, log "approved") e nega (slot devolvido). Sem socketlib instalado, a fila ainda aparece na review.
- [ ] **Homebrew:** GM cria Virtude custom → aparece para o GM em Contacts/Tracker; quirks/reações funcionam; ocultar uma canônica some da lista sem quebrar reações de quem reage a ela.
- [ ] **Regressão:** fluxos 1.11 intactos — contraband send/review, gifts, achievements, end mission, time off, trackers.
- [ ] **i18n:** pt-BR e en renderizam as strings novas.
- [ ] **Compat:** sem erros no console em v13 (alvo verificado do módulo).

---

## Self-Review (executado na escrita)

- **Cobertura da spec:** relay (1.1) → Fase 1; homebrew (4) → Fase 2; catch-up + docs (3.2) → Fases 0 e 3. ✔
- **Consistência de tipos/nomes:** `requestQueue` entries `{id,kind,vkey,payload,ts}` usados igual em rules e ctx; `requestConversation/requestQuirk/approveRequest/denyRequest` casam entre kim.mjs e cardinal-virtuoso.mjs; `rebuildVirtues({custom,hidden})` mesma assinatura em data/cardinal/kim; `saveCustomVirtue/deleteCustomVirtue/setVirtueHidden/isCanonical` exportadas e importadas. ✔
- **Pontos a confirmar na implementação (não placeholders, só validação de contexto real):** formato exato do JSON de `lang/*.json` (achatado vs aninhado); markup atual exato do bloco de quirks em `kim-profile.hbs` e do rodapé em `kim-contacts.hbs`; nomes reais de variáveis CSS. Cada um é lido no passo correspondente antes de editar.
</content>
</invoke>
