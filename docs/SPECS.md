# CAIN — Cardinal Virtuoso · Especificação Funcional

Versão do módulo: **1.5.0** · Compatibilidade Foundry: **11–14** (verificado 13).

Tracker fan-made de afinidade/vínculo **SEER + TEMERITY** para o TTRPG CAIN, como
módulo Foundry VTT. Esta spec descreve o modelo de dados, as regras e os fluxos
implementados em `scripts/`. Fonte de verdade das regras: `scripts/data.mjs`
(`RULES`, `VIRTUES`) e `scripts/cardinal-virtuoso.mjs` (mutações).

---

## 1. Visão geral e arquitetura

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| Lógica de regras | `scripts/cardinal-virtuoso.mjs` | Modelo de estado, mutações, settings, registro de hooks |
| Dataset | `scripts/data.mjs` | 9 Virtues, quirks, reações de vínculo, `RULES` |
| Desktop / OS shell | `scripts/desktop.mjs` | Terminal SEER//TEMERITY (Win95), boot, taskbar, start menu |
| Cliente KIM | `scripts/kim.mjs` | Mensageiro: Contacts / Profile / Conversation / Dead Drop |
| Window manager | `scripts/winman.mjs` | Janelas arrastáveis internas ao desktop |
| Estilos | `styles/cardinal-virtuoso.css` | Estética CRT / Warframe-1999 / Win95 |
| Idiomas | `lang/en.json`, `lang/pt-BR.json` | Strings de UI |

**Princípios de design**
- Persistência nativa Foundry via flags do `User` — sem servidor externo.
- Isolamento por jogador; GM com Admin Overwatch.
- Lógica de afinidade isolada das views (reusável por um futuro relay socketlib).

---

## 2. Modelo de dados

Persistido em `user.flags["cain-cardinal-virtuoso"].dossier`.

### 2.1 Dossiê (`blankDossier`)
```
{
  codename: "",      // nome de operação (editável no HQ Console)
  mission: 1,        // contador de missão atual
  x2mod: false,      // X2 Text Speed Mod (dobra limites, habilita Time Off)
  gateUser: false,   // +1 no haul de contrabando
  covert: 0,         // entradas covert para o haul
  cat: 0,            // entradas CAT para o haul (½, arredondado p/ baixo)
  hqStock: 0,        // estoque de contrabando disponível (cap 6)
  extraBonds: 0,     // slots extras de vínculo (de time off)
  log: [],           // event log (máx 40)
  virtues: { <key>: <slot> }   // 9 Virtues
}
```

### 2.2 Slot de Virtue (`blankSlot`)
```
{
  bonded: false,       // vínculo ativo
  affinity: 0,         // afinidade atual (pode ser negativa)
  rank: 0,             // rank aplicado (0–3)
  brokenCount: 0,      // nº de quebras (eleva requisitos)
  pendingBreak: false, // Heart Break aguardando fechamento de missão
  convUsed: 0,         // conversations usadas na missão
  contraUsed: 0,       // contrabandos usados na missão
  quirkUses: {},       // { <qIndex>: contagem } por missão
  chat: []             // histórico de conversa livre (máx 40)
}
```

### 2.3 Robustez
- `getDossier` faz backfill via `foundry.utils.mergeObject(blankDossier(), raw)` e
  por-slot, garantindo compatibilidade com dossiês salvos antes de novos campos.

---

## 3. Constantes de regra (`RULES`)

```
brokenAt:      -5      // afinidade que dispara Heart Break
brokenPenalty:  3      // +requisito de rank por quebra
rankReq:     { 1:5, 2:10, 3:18 }   // configurável via setting "rankReq"
conv:        { perMission:1, perMissionX2:2, topic:2, goodTalk:2, connection:2, dislike:-2 }
contraband:  { perMission:2, perMissionX2:3, favorite:3, like:3, dislike:-3, neutral:1, hqCap:6, haulMin:2 }
logMax:        40
```

---

## 4. As 9 Virtues (`VIRTUES`)

Vol. 1 (6) + adições do Harpocrates Dossier (3). Cada Virtue tem `name`, `epithet`,
`glyph`, `likes`, `dislikes`, `food`, `blasphemy`, `bonds` (0–3), `quirks` e
`bondReactions`. Retrato auto-carregado de `img/virtues/<key>.webp` com fallback ao glifo.

| key | Nome | Epíteto | Glifo | Blasfêmia | Reações de vínculo |
|---|---|---|---|---|---|
| justice | Justice | The Executioner | I | Law | charity −10 |
| faith | Faith | The Timid | II | Null | fortitude −10 |
| charity | Charity | The Twins | III | Entwine | justice −10, faith −10 |
| fortitude | Fortitude | The Disaster | IV | Strength | `*` −10 (qualquer vínculo) |
| hope | Hope | The Dreamer | V | Veil | justice −10, fortitude −10 |
| prudence | Prudence | The Negotiator | VI | Shake | charity −10, justice −10 |
| chastity | Chastity | The Restraint | VII | — | faith +3, charity −10 |
| sobriety | Sobriety | The Resolute | VIII | — | prudence +3, faith −10 |
| absolution | Absolution | The Mourner | IX | — | (nenhuma) |

> Semântica de `bondReactions`: delta aplicado **a esta Virtue** quando o jogador
> vincula/evolui a Virtue indicada na chave (`"*"` = qualquer outra).

---

## 5. Regras de negócio (mutações)

Todas as mutações retornam `{ ok, msg }`, mutam o dossiê in-place e passam por
`finalize` (que avalia Heart Break e registra no log).

### 5.1 `toggleBond(d, vkey, { isGM, enforcePacing })`
- `pendingBreak` → negado (aguardar fechamento).
- Se já `bonded` → rompe (não-vinculado), loga.
- Se vinculando e `enforcePacing && !isGM && bondedCount ≥ bondSlotsAllowed` → negado.
- Caso contrário: `bonded = true`, dispara `reactToBond(..., "new bond")`.
- **Slots**: `bondSlotsAllowed = max(0, mission−1) + extraBonds`.

### 5.2 `applyConversation(d, vkey, { topicHit, goodTalk, connectionHit })`
- Bloqueios: não-vinculado / `pendingBreak`; `convUsed ≥ cap` (1 ou 2 com X2).
- Delta: `topicHit "like" +2 / "dislike" −2` + `goodTalk +2` + `connectionHit +2`.
- `convUsed += 1`; `finalize`.

### 5.3 `applyContraband(d, vkey, kind)`
- `kind ∈ {favorite, like, dislike, neutral, hatemail}`.
- Não-vinculado → só `hatemail`. `pendingBreak` → negado.
- Não-hatemail: `contraUsed ≥ cap` (2 ou 3 com X2) → negado.
- `hqStock ≤ 0` → negado (toda ação gasta 1 de estoque).
- Deltas: favorite/like +3, neutral +1, dislike −3, hatemail = `min(0, −3)` = −3.
- Hatemail **não** incrementa `contraUsed` (ignora o limite) mas gasta estoque.

### 5.4 `applyQuirk(d, vkey, qIndex)`
- Bloqueios: não-vinculado / `pendingBreak`; quirk inexistente; `perMission` atingido.
- Aplica `quirk.delta`; incrementa `quirkUses[qIndex]`; `finalize`.

### 5.5 `applyAdjustment(d, vkey, delta)` (GM)
- Só em `bonded`; `delta === 0` negado. `finalize`.

### 5.6 `reactToBond(d, changedKey, why)`
- Para cada Virtue `bonded` e não-`pendingBreak` (exceto a alterada): aplica
  `bondReactions[changedKey] ?? bondReactions["*"]`, com `finalize`.

### 5.7 `finalize(d, vkey, msg)`
- Se `!pendingBreak && affinity ≤ −5 && bonded`: marca `pendingBreak`,
  `brokenCount += 1`, anexa aviso de Heart Break (`requisitos +3`).
- Sempre registra no log.

### 5.8 Ranks
- `rankRequirement(slot, rank) = rankReq[rank] + brokenCount × 3`.
- `qualifiedRank(slot)` = maior rank cuja afinidade ≥ requisito (não auto-aplica).

### 5.9 `endMission(d)`
1. `applyRankUps` (sobe rank de Virtues vinculadas que qualificam; dispara reações "bond upgrade").
2. Limpa `pendingBreak`: vínculo zerado (não-vinculado, afinidade 0, rank 0).
3. `resetCounters` (zera conv/contra/quirk).
4. `haul = contrabandHaul`; `hqStock = min(6, hqStock + haul)`.
5. `mission += 1`.

### 5.10 `timeOff(d)` (requer X2 mod)
- Sem X2 → negado. `applyRankUps` + `resetCounters` + `extraBonds += 1`.
- **Não** fecha missão nem coleta contrabando.

### 5.11 `contrabandHaul(d)`
- `max(2, covert + ⌊cat/2⌋) + (gateUser ? 1 : 0)`.

### 5.12 `pushChat(d, vkey, who, text)`
- `who ∈ {"op", "virtue"}`; texto vazio → negado; cap 40 (FIFO).

### 5.13 Log (`pushLog`)
- Prefixo `[M<mission>]`; cap `logMax = 40` (FIFO).

---

## 6. Configurações (Game Settings → Cardinal Virtuoso)

| Setting | Escopo | Tipo | Padrão | Efeito |
|---|---|---|---|---|
| `rankReq` | world | String | `"5,10,18"` | Requisitos de afinidade I/II/III (parseado em `RULES.rankReq`) |
| `enforcePacing` | world | Boolean | `true` | Liga/desliga o ritmo de vínculos (GM sempre ignora) |

---

## 7. Integração e UI

### 7.1 Pontos de entrada
- Botão na barra de cena (token controls), compatível com v11–v14.
- Macro `game.cainCardinalVirtuoso.open()` → abre a desktop KIM (grid standalone aposentado na 1.4).

### 7.2 KIM ↔ ficha CAIN (1.5)
- KIM lê `user.character`; mostra só bonds iniciados na ficha (match por nome de Virtue).
- GM vê as 9. Empty-state quando não há ficha/bonds.
- KIM é autoritativo no nível: rank-up edita `currentLevel` da ficha; lista atualiza ao vivo.

### 7.3 Live sync
- Hooks `updateUser`/`updateActor` re-renderizam o dossiê visualizado; teardown ao fechar a desktop.

### 7.4 Retratos (`wirePortraits`)
- Revela `img.cv-portrait` só após carregar; remove em erro (mostra glifo). Trata imagens já em cache.

---

## 8. Persistência e releases

- Estado: flags Foundry no `User`; player escreve só a própria, GM escreve qualquer.
- Release automatizado: merge em `main` com `version` alterada em `module.json` gera
  release no GitHub com `module.zip` e `module.json` carimbado
  (`.github/workflows/release.yml`). Atualizar `CHANGELOG.md` no mesmo PR.

---

## 9. Itens não implementados (roadmap)

- Export SQLite (cross-system / Power BI) como feature server-side separada.
- Relay player→GM via socketlib reusando `applyConversation`/`applyContraband`/`endMission`.
