# CAIN — Cardinal Virtuoso · Histórias de Usuário

Documento de épicos e histórias de usuário do módulo. As histórias descrevem o
comportamento esperado da perspectiva dos atores; os critérios de aceitação
(formato Gherkin) refletem a lógica implementada em `scripts/`.

## Atores

- **Player (Operative)** — exorcista jogador; possui um dossiê isolado.
- **GM** — mestre; possui *Admin Overwatch* sobre todos os dossiês.
- **Sistema** — o próprio módulo, que resolve afinidade, ranks e quebras de vínculo.

---

## Épico 1 — Dossiê isolado por jogador

### US-1.1 — Abrir o meu dossiê
> **Como** Player, **quero** abrir meu próprio dossiê via botão de cena ou macro,
> **para** acompanhar e editar apenas os meus vínculos com as Virtues.

**Critérios de aceitação**
- **Dado** que sou um Player, **quando** abro o tracker, **então** vejo somente o meu dossiê (`user.flags["cain-cardinal-virtuoso"].dossier`).
- **Dado** que já tenho a desktop aberta, **quando** clico no botão de cena de novo, **então** ela é trazida à frente em vez de abrir uma segunda janela (singleton).
- **Quando** abro pela primeira vez, **então** um dossiê em branco é criado com 9 Virtues não-vinculadas, afinidade 0, missão 1.

### US-1.2 — Persistência sem configuração
> **Como** Player, **quero** que meu progresso persista automaticamente,
> **para** não depender de servidor externo nem de permissões extras.

**Critérios de aceitação**
- **Quando** qualquer mutação ocorre, **então** o estado é gravado via flag no documento `User`.
- **Dado** um dossiê salvo antes de um novo campo existir, **quando** ele é lido, **então** os campos ausentes são preenchidos (backfill via `mergeObject`) sem erro.

### US-1.3 — Admin Overwatch (GM)
> **Como** GM, **quero** visualizar e editar o dossiê de qualquer operativo,
> **para** arbitrar a mesa sem reconfigurar permissões.

**Critérios de aceitação**
- **Dado** que sou GM, **quando** uso o seletor de Admin Overwatch, **então** posso ler/escrever a flag de qualquer usuário.
- **Dado** que sou Player, **então** não consigo ler/editar o dossiê de outro usuário.

---

## Épico 2 — Vínculos (Bonds)

### US-2.1 — Estabelecer um vínculo
> **Como** Player, **quero** vincular (LINK) uma Virtue,
> **para** começar a cultivar afinidade com ela (iniciando em 0).

**Critérios de aceitação**
- **Quando** vinculo uma Virtue, **então** ela passa a `bonded`, afinidade 0, rank 0.
- **Quando** vinculo uma Virtue, **então** as reações de vínculo das rivais/fãs são aplicadas (ver US-2.3).

### US-2.2 — Ritmo de vínculos (bond pacing)
> **Como** GM, **quero** limitar o jogador a 1 nova Virtue por missão concluída,
> **para** que os vínculos cresçam de forma controlada.

**Critérios de aceitação**
- O número de slots permitidos é `max(0, missão − 1) + extraBonds`.
- **Dado** que atingi o limite de slots, **quando** tento vincular outra Virtue como Player, **então** a ação é negada com mensagem de slots indisponíveis.
- **Dado** que sou GM, **então** ignoro o pacing.
- **Dado** que a configuração *Enforce bond pacing* está desligada, **então** vínculos são livres (comportamento da v1.0).

### US-2.3 — Reações de vínculo
> **Como** Player, **quero** que vincular/evoluir uma Virtue dispare reações
> automáticas nas outras, **para** refletir suas rivalidades e simpatias.

**Critérios de aceitação**
- **Quando** vinculo/evoluo a Virtue X, **então** cada outra Virtue `bonded` e não-quebrada aplica `bondReactions[X]`, ou `bondReactions["*"]` como fallback.
- Exemplos da implementação: vincular Charity → Justice −10 e Faith −10; vincular Faith → Chastity +3; Fortitude reage a *qualquer* vínculo com −10 (`"*": -10`).

### US-2.4 — Romper um vínculo manualmente
> **Como** Player, **quero** romper (sever) um vínculo ativo,
> **para** liberar espaço ou desistir de uma Virtue.

**Critérios de aceitação**
- **Quando** rompo um vínculo `bonded`, **então** ele volta a não-vinculado.
- **Dado** um vínculo em `pendingBreak` (Heart Break), **quando** tento re-vincular, **então** é negado até a missão fechar.

---

## Épico 3 — Interações de afinidade

### US-3.1 — Conversation
> **Como** Player, **quero** registrar uma Conversation por missão,
> **para** ganhar/perder afinidade conforme o tópico e a conexão.

**Critérios de aceitação**
- Limite: 1×/missão (2× com X2 mod).
- Deltas: LIKE TOPIC +2 / DISLIKE −2; WENT WELL +2; CONNECTION +2 (somáveis).
- **Dado** o limite atingido, **quando** tento de novo, **então** é negado.
- **Dado** um vínculo em `pendingBreak` ou não-vinculado, **então** a ação é negada.

### US-3.2 — Enviar contrabando (player → fila) (1.11)
> **Como** Player, **quero** enviar um item do inventário como contrabando a uma
> Virtue vinculada, **para** que o GM o pontue depois.

**Critérios de aceitação**
- Limite: 2×/missão (3× com X2 mod); cada envio gasta 1 de `hqStock` e 1 slot.
- **Dado** estoque 0, ou limite atingido, ou Virtue não-vinculada / em `pendingBreak`, **então** é negado.
- O envio **não** aplica afinidade: enfileira em `contrabandQueue` aguardando revisão do HQ.

### US-3.3 — Hate-mail *(histórico — substituído na 1.11)*
> Nota: o antigo hate-mail (delta negativo direto a qualquer Virtue) foi
> substituído pelo fluxo de revisão do GM (US-3.6) e por ajustes manuais (US-3.5).
> Mantido aqui apenas como registro histórico.

### US-3.6 — Revisar contrabando (GM) (1.11)
> **Como** GM, **quero** revisar o contrabando enfileirado pelos players,
> **para** pontuar a afinidade conforme o gosto da Virtue.

**Critérios de aceitação**
- O GM vê a fila de cada operativo na janela de Review.
- **Approve/Score**: aplica o delta por categoria (FAV/LIKE/NEUTRAL/DISLIKE) ou um valor livre, amortecido por Apology Note, e desenfileira (`scoreContraband`).
- **Discard**: remove da fila sem pontuar (`discardContraband`).

### US-3.4 — Quirks
> **Como** Player, **quero** disparar quirks específicas de cada Virtue com um clique,
> **para** aplicar os gatilhos de afinidade do dossiê.

**Critérios de aceitação**
- Cada quirk aplica seu `delta`; algumas têm `perMission` (ex.: Faith claw game 1×, Fortitude matar humano 2×).
- **Dado** o `perMission` atingido, **quando** disparo de novo, **então** é negado.
- **Dado** vínculo não-vinculado ou em `pendingBreak`, **então** é negado.

### US-3.5 — Ajuste manual do GM
> **Como** GM, **quero** um ± de afinidade livre por Virtue,
> **para** arbitrar situações de mesa não cobertas pelas quirks.

**Critérios de aceitação**
- Só funciona em Virtue `bonded`; delta 0 é negado.
- Toda alteração entra no log do dossiê.

---

## Épico 4 — Heart Break (vínculo partido)

### US-4.1 — Disparo de Heart Break
> **Como** Sistema, **quero** marcar um vínculo como partido quando a afinidade ≤ −5,
> **para** travá-lo até o fim da missão.

**Critérios de aceitação**
- **Quando** uma mutação leva a afinidade de uma Virtue `bonded` a ≤ −5, **então** ela entra em `pendingBreak`, `brokenCount += 1`, e fica travada.
- A partir daí, requisitos de rank dessa Virtue sobem +3 por quebra (`brokenCount × 3`).

### US-4.2 — Limpeza no fim da missão
> **Como** Sistema, **quero** resetar vínculos partidos ao fechar a missão,
> **para** que possam ser refeitos do zero (mais difíceis).

**Critérios de aceitação**
- **Quando** a missão fecha, **então** Virtues em `pendingBreak` voltam a não-vinculadas, afinidade 0, rank 0.

---

## Épico 5 — Ciclo de missão

### US-5.1 — Close Mission
> **Como** Player, **quero** fechar a missão,
> **para** aplicar rank-ups, limpar vínculos partidos, coletar contrabando e resetar contadores.

**Critérios de aceitação**
- Aplica rank-ups onde a afinidade atinge o requisito (`qualifiedRank`).
- Limpa vínculos `pendingBreak` (US-4.2).
- Coleta `haul = max(2, covert + ⌊cat/2⌋) (+1 se Gate user)`, somado ao estoque, **capado em 6**.
- Zera `convUsed`, `contraUsed`, `quirkUses`; incrementa `mission`.

### US-5.2 — Time Off (X2 mod)
> **Como** Player com X2 mod, **quero** tirar um tempo de folga,
> **para** aplicar rank-ups, resetar limites e ganhar +1 slot de vínculo sem fechar a missão.

**Critérios de aceitação**
- **Dado** que não tenho X2 mod, **então** Time Off é negado.
- Aplica rank-ups e reset de contadores; `extraBonds += 1`; **não** incrementa a missão nem coleta contrabando.

### US-5.3 — Rank-ups e requisitos configuráveis
> **Como** GM, **quero** ajustar os requisitos de afinidade por rank,
> **para** afinar a dificuldade da campanha.

**Critérios de aceitação**
- Padrão: Bond I/II/III = 5/10/18 (Harpocrates Dossier); configurável como `"5,10,18"`.
- Rank-ups só aplicam no fechamento de missão / time off (não automaticamente).
- Evoluir de rank dispara reações de vínculo (US-2.3, motivo "bond upgrade").

---

## Épico 6 — Log e auditoria

### US-6.1 — Event log por dossiê
> **Como** Player/GM, **quero** ver as últimas alterações de afinidade,
> **para** auditar como cada vínculo evoluiu.

**Critérios de aceitação**
- Toda mutação registra uma linha prefixada com `[M<missão>]`.
- O log mantém no máximo 40 entradas (FIFO).

---

## Épico 7 — Cliente KIM e integração com a ficha CAIN

### US-7.1 — KIM como mensageiro
> **Como** Player, **quero** usar o tracker como um mensageiro estilo MSN/Warframe-1999,
> **para** ter cada Virtue como um contato com perfil, conversa e dead drop.

**Critérios de aceitação**
- Janelas (Contacts, Profile, Conversation, Dead Drop) vivem dentro do desktop SEER//TEMERITY via window manager interno.
- Conversa tem log de texto livre (como operativo ou como a Virtue); o GM marca o desfecho (Liked/Disliked, Went well, Connection).

### US-7.2 — Contatos a partir da ficha CAIN
> **Como** Player, **quero** ver apenas as Virtues que iniciei na minha ficha CAIN,
> **para** que a lista de contatos reflita meus vínculos reais.

**Critérios de aceitação**
- KIM lê `user.character` e mostra só os bonds iniciados (casados por nome de Virtue, ex.: Charity ↔ "The Twins").
- O GM mantém todas as 9 Virtues.
- **Dado** que não tenho ficha vinculada ou nenhum bond, **então** vejo um empty-state claro.

### US-7.3 — KIM como autoridade de nível de vínculo
> **Como** Sistema, **quero** que um rank-up no KIM atualize a ficha CAIN,
> **para** manter ficha e tracker em sincronia.

**Critérios de aceitação**
- **Quando** uma Virtue sobe de rank, **então** `currentLevel` na ficha é editado automaticamente.
- A lista de contatos atualiza ao vivo quando um bond é adicionado ou seu nível muda.

### US-7.4 — Live sync entre clientes
> **Como** Player/GM, **quero** que as janelas KIM re-renderizem quando o dossiê muda,
> **para** ver edições do GM ou de outro cliente em tempo real.

**Critérios de aceitação**
- Hooks `updateUser`/`updateActor` disparam re-render do dossiê visualizado.
- Os listeners têm teardown adequado quando a desktop fecha.

---

## Épico 8 — Gifts automatizados (1.8)

### US-8.1 — Dar um gift do inventário
> **Como** Player, **quero** soltar um gift (item de compêndio) numa Virtue,
> **para** aplicar seu efeito automaticamente.

**Critérios de aceitação**
- O módulo cria um compêndio de mundo com os 6 gifts (GM-only, idempotente).
- Cada gift carrega `flags["cain-cardinal-virtuoso"].gift = <key>`; o Dead Drop o mapeia ao efeito.

### US-8.2 — Efeitos dos gifts
> **Como** Sistema, **quero** resolver cada gift conforme seu `effect.kind`.

**Critérios de aceitação**
- `flat` (Heated Blanket, Deployment Pass): `+base` (+`freshBonus` se "fresh").
- `rankOrPlus` (Heartfelt Note): sobe rank se a afinidade qualifica, senão `+plus`.
- `buffConversation` (Page of One-liners): arma `buffs.page`.
- `buffApology` (Apology Note): arma `buffs.apology` até `mission+1`.
- `buffJournal` (Well-Organized Journal): arma `buffs.journal`.

---

## Épico 9 — Achievements & Good Ending Points (1.9)

### US-9.1 — Detecção automática
> **Como** Sistema, **quero** desbloquear conquistas automáticas a partir do estado,
> **para** não exigir marcação manual quando o critério é objetivo.

**Critérios de aceitação**
- `refreshAchievements` é idempotente; uma vez desbloqueada, a conquista persiste.
- Detectores: `bond3:<key>`, `heartBreaker` (≥4 quebras), `fumbler` (≥15 perda/missão), `hunter` (5 missões solo), `besoDeTres`.

### US-9.2 — Toggle do GM
> **Como** GM, **quero** marcar/desmarcar conquistas subjetivas (`auto:null`).

**Critérios de aceitação**
- `setAchievement(d, key, on)` desbloqueia/limpa e registra no log.

### US-9.3 — Pontuação compartilhada e ladder
> **Como** party, **quero** somar Good Ending Points pelas conquistas `good`,
> **para** alcançar recompensas em degraus.

**Critérios de aceitação**
- Pontos = conquistas `group:"good"` desbloqueadas (uma vez cada, na party).
- `goodEndingTier(points)` resolve a recompensa em `GOOD_ENDING_REWARDS` (4/8/10/12/16).

---

## Épico 10 — Trackers por Virtue (1.7)

### US-10.1 — Requisitos por Virtue
> **Como** GM, **quero** sobrescrever os requisitos de rank por Virtue,
> **para** afinar a dificuldade individualmente.

**Critérios de aceitação**
- `rankReqByVirtue` (`{ <key>: {1,2,3} }`); `baseRankReq` usa o override, senão `RULES.rankReq`.

### US-10.2 — Janela de tracker
> **Como** Player/GM, **quero** uma janela com os requisitos por Virtue.

**Critérios de aceitação**
- Read-only para o Player; editável para o GM.

---

## Backlog / Roadmap (não implementado)

- **R-1** Export para SQLite (uso cross-system / Power BI) como feature server-side separada do tracker in-world.
