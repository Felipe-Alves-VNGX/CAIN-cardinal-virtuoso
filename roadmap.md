# Roadmap — Cardinal Virtuoso

Alterações levantadas a partir da revisão de design (capturas GM) e do teste completo
das specs na visão do jogador (usuário Tester, não-GM). Ordenado por prioridade.

Legenda de status: `[ ]` pendente · `[~]` em andamento · `[x]` concluído

---

## 🔴 Risco real (comportamento)

### 1. HQ Console expõe alavancas de balanceamento ao jogador `[x]`
- **Problema:** o jogador edita o próprio Mod X2, Usuário de Gate (+1 contrabando),
  Covert, CAT e Estoque HQ, e tem o botão destrutivo "Apagar Dossiê".
- **Por quê:** são moduladores que mudam o poder do personagem — permitem auto-buff.
  "Apagar Dossiê" é irreversível e exposto a qualquer jogador.
- **Mudança:** condicionar esses campos a `isGM` (jogador vê read-only ou não vê).
  Codinome continua editável pelo jogador. Gate em `onSaveHQ` + esconder controles no template.
- **Arquivos:** `scripts/kim.mjs` (`onSaveHQ`, `hqCtx`), `templates/kim-hq.hbs`
- **Esforço:** médio

---

## 🟡 UX (melhorias de peso)

### 2. Distinção janela ativa/inativa (foco) `[x]`
- **Problema:** várias janelas têm barras de título azuis idênticas; sem indicação de foco.
- **Por quê:** comportamento Win95 autêntico; o CSS já define `--title-off-a`/`--title-off-b`
  (linhas ~19-20) e nunca usa.
- **Mudança:** `focus()` do winman marca a janela ativa; CSS aplica as vars off na titlebar
  das janelas sem `.is-focused`.
- **Arquivos:** `scripts/winman.mjs` (`focus`), `styles/cardinal-virtuoso.css`
- **Esforço:** baixo

### 3. Afinidade em destaque no perfil `[x]`
- **Problema:** "Afinidade N · Vínculo R" em fonte pequena, sendo o dado mais importante.
- **Mudança:** reaproveitar `.cv-aff-num` (28px) + barra `.cv-trk-bar` (classes já existentes).
- **Arquivos:** `templates/kim-profile.hbs`, `styles/cardinal-virtuoso.css`
- **Esforço:** baixo

### 4. Botão minimizar nas janelas `[x]`
- **Problema:** só existe `✕`; com janelas empilhadas não dá para "tirar da frente".
- **Mudança:** estado minimizado no winman + integração com a taskbar.
- **Arquivos:** `scripts/winman.mjs`, `styles/cardinal-virtuoso.css`
- **Esforço:** médio

---

## 🟢 Polimento (rápido)

### 5. Badge de estoque vazio no Dead Drop `[x]`
- **Mudança:** usar a classe `.cv-kim-drop-empty` (já existe, ~linha 608) quando `hqStock === 0`.
- **Arquivos:** `templates/kim-contacts.hbs` / `kim-contraband.hbs`, `styles/cardinal-virtuoso.css`
- **Esforço:** baixo

### 6. Cascata de janelas mais espaçada `[x]`
- **Problema:** offset de 26px (winman) gruda as barras de título.
- **Mudança:** aumentar o passo do cascade spawn.
- **Arquivos:** `scripts/winman.mjs`
- **Esforço:** baixo

### 7. Aviso quando Vínculos > limite `[x]`
- **Problema:** "6/4" aparece sem destaque visual.
- **Mudança:** colorir/avisar quando `bondsUsed > bondsAllowed`.
- **Arquivos:** `templates/kim-contacts.hbs`, `styles/cardinal-virtuoso.css`
- **Esforço:** baixo

### 8. Silenciar ruído de console `[x]`
- **Problema:** 404 dos retratos `.webp` e `syncActorBonds` disparando a sheet V1 depreciada
  do CAIN a cada quirk. Benigno, mas polui o log.
- **Mudança:** evitar requisição do `.webp` inexistente; revisar quando `syncActorBonds` escreve
  no ator (só quando o rank realmente muda).
- **Arquivos:** `scripts/kim.mjs` (`portraitPath`, `syncActorBonds`)
- **Esforço:** baixo

---

## Diferenças jogador × GM (referência — já corretas, não alterar)
- Jogador não vê o picker "Admin Overwatch", nem "Ajuste Admin ±" no perfil.
- Trackers: inputs de requisito de rank são `isGM`-only (`onSaveTracker`).
- Conquistas: edição manual é `isGM`-only.
- Contatos do jogador vêm dos vínculos da **ficha CAIN** (`actor.system.bonds`), não do flag dossier.
