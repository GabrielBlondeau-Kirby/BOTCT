// Grimoire du Conteur : gestion d'une partie de Blood on the Clocktower.
(() => {
  const STORAGE_KEY = "botc-grimoire-v1";
  const $ = (sel, root = document) => root.querySelector(sel);

  const SIGILS = {
    townsfolk: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    outsider: '<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5Z"/>',
    minion: '<path d="M12 2.5 14 14h-4L12 2.5ZM8 14h8M12 14v7.5M10 21.5h4"/>',
    demon: '<path d="M5 3c0 4 2 6 4 7M19 3c0 4-2 6-4 7M7 11.5c0 5 2.2 9 5 9s5-4 5-9c-1.4-.9-3.1-1.5-5-1.5s-3.6.6-5 1.5Z"/>',
    traveller: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  };
  const sigil = (team, cls = "sigil") =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SIGILS[team]}</svg>`;

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const monogram = (name) => {
    const words = name.replace(/['’]/g, " ").split(/[\s-]+/).filter((w) => w.length > 2 || /^[A-ZÉ]/.test(w));
    return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2)).toUpperCase();
  };

  // ───────── État ─────────
  const defaultState = () => ({
    players: 8,
    tokens: [],      // { uid, roleId, x, y, player, dead, ghostUsed }
    reminders: [],   // { uid, label, roleId, x, y }
    phase: 0,        // 0 = Nuit 1, 1 = Jour 1, 2 = Nuit 2…
    nightChecks: [],
    tokenSize: 96,
    filter: "all",
  });

  let state = load();
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.tokens)) {
        saved.tokens = saved.tokens.filter((t) => ROLES[t.roleId]);
        return { ...defaultState(), ...saved };
      }
    } catch (e) { /* stockage indisponible */ }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function commit() { save(); render(); }

  const inPlay = (roleId) => state.tokens.some((t) => t.roleId === roleId);
  const isFirstNight = () => state.phase === 0;
  const isNight = () => state.phase % 2 === 0;

  // ───────── Plateau ─────────
  const board = $("#board");

  function circleSlot(i, n) {
    const angle = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2;
    const rx = 38, ry = 36;
    return { x: 50 + rx * Math.cos(angle), y: 51 + ry * Math.sin(angle) };
  }

  function arrangeCircle() {
    const n = state.tokens.length;
    state.tokens.forEach((t, i) => Object.assign(t, circleSlot(i, n)));
    // les rappels suivent leur jeton d'origine s'il existe
    state.reminders.forEach((r, i) => {
      const owner = state.tokens.find((t) => t.uid === r.tokenUid);
      if (owner) {
        const dx = 50 - owner.x, dy = 51 - owner.y, d = Math.hypot(dx, dy) || 1;
        const k = 9 + (i % 3) * 5;
        r.x = owner.x + (dx / d) * k;
        r.y = owner.y + (dy / d) * k;
      }
    });
    commit();
  }

  function addRole(roleId) {
    const n = state.tokens.length;
    const pos = circleSlot(n, Math.max(n + 1, state.players));
    state.tokens.push({ uid: uid(), roleId, x: pos.x, y: pos.y, player: "", dead: false, ghostUsed: false });
  }
  function removeToken(tokenUid) {
    state.tokens = state.tokens.filter((t) => t.uid !== tokenUid);
    state.reminders = state.reminders.filter((r) => r.tokenUid !== tokenUid);
  }
  function addReminder(token, label) {
    const count = state.reminders.filter((r) => r.tokenUid === token.uid).length;
    const dx = 50 - token.x, dy = 51 - token.y, d = Math.hypot(dx, dy) || 1;
    const k = 9 + count * 5.5;
    state.reminders.push({
      uid: uid(), label, roleId: token.roleId, tokenUid: token.uid,
      x: token.x + (dx / d) * k + (count % 2 ? 2 : -2), y: token.y + (dy / d) * k,
    });
  }

  function tokenHtml(role, extraClass = "") {
    const id = "arc-" + uid();
    // l'arc fait ~116 unités : on réduit la police pour les noms longs
    const fontSize = Math.min(10.5, 116 / (role.name.length * 0.74)).toFixed(2);
    return `
      <div class="token-face team-${role.team} ${extraClass}">
        <svg class="token-ring" viewBox="0 0 100 100" aria-hidden="true">
          <defs><path id="${id}" d="M 13 52 A 37 37 0 0 0 87 52"/></defs>
          <text class="token-name" style="font-size:${fontSize}px"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${escapeHtml(role.name)}</textPath></text>
        </svg>
        ${sigil(role.team)}
        <span class="mono">${monogram(role.name)}</span>
      </div>`;
  }

  function renderBoard() {
    board.style.setProperty("--token", state.tokenSize + "px");
    board.querySelectorAll(".token, .reminder").forEach((el) => el.remove());
    $("#boardEmpty").hidden = state.tokens.length > 0;

    const frag = document.createDocumentFragment();
    for (const t of state.tokens) {
      const role = ROLES[t.roleId];
      const el = document.createElement("div");
      el.className = "token" + (t.dead ? " is-dead" : "");
      el.dataset.uid = t.uid;
      el.style.left = t.x + "%";
      el.style.top = t.y + "%";
      el.innerHTML = tokenHtml(role) +
        (t.dead ? `<span class="shroud" title="${t.ghostUsed ? "Vote fantôme utilisé" : "Vote fantôme disponible"}">${t.ghostUsed ? "" : "<i></i>"}</span>` : "") +
        `<span class="player-tag${t.player ? "" : " empty"}">${escapeHtml(t.player || "—")}</span>`;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${role.name}${t.player ? ", " + t.player : ""}${t.dead ? ", mort" : ""}`);
      frag.appendChild(el);
    }
    for (const r of state.reminders) {
      const role = ROLES[r.roleId];
      const el = document.createElement("div");
      el.className = "reminder" + (role ? " team-" + role.team : " generic");
      el.dataset.uid = r.uid;
      el.style.left = r.x + "%";
      el.style.top = r.y + "%";
      el.title = role ? `${role.name} : ${r.label}` : r.label;
      el.innerHTML = `${role ? sigil(role.team, "rem-sigil") : ""}<span>${escapeHtml(r.label)}</span><button class="rem-del" aria-label="Retirer le rappel">✕</button>`;
      frag.appendChild(el);
    }
    board.appendChild(frag);

    const alive = state.tokens.filter((t) => !t.dead && ROLES[t.roleId].team !== "traveller").length;
    const total = state.tokens.filter((t) => ROLES[t.roleId].team !== "traveller").length;
    $("#boardStats").innerHTML = state.tokens.length
      ? `<span><b>${alive}</b> vivants sur ${total}</span><span>Exécution : <b>${Math.ceil(alive / 2)}</b> votes</span>`
      : "";
  }

  // Glisser-déposer (souris et tactile)
  let drag = null;
  board.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".token, .reminder");
    if (!el || e.target.closest(".rem-del")) return;
    const list = el.classList.contains("token") ? state.tokens : state.reminders;
    const item = list.find((i) => i.uid === el.dataset.uid);
    if (!item) return;
    const rect = board.getBoundingClientRect();
    drag = { el, item, rect, startX: e.clientX, startY: e.clientY, ox: item.x, oy: item.y, moved: false };
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
  });
  board.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    drag.item.x = Math.min(98, Math.max(2, drag.ox + (dx / drag.rect.width) * 100));
    drag.item.y = Math.min(98, Math.max(2, drag.oy + (dy / drag.rect.height) * 100));
    drag.el.style.left = drag.item.x + "%";
    drag.el.style.top = drag.item.y + "%";
  });
  const endDrag = () => {
    if (!drag) return;
    const { el, item, moved } = drag;
    el.classList.remove("dragging");
    drag = null;
    if (moved) { save(); return; }
    if (el.classList.contains("token")) openSheet(item.uid);
    else {
      board.querySelectorAll(".reminder.selected").forEach((r) => r !== el && r.classList.remove("selected"));
      el.classList.toggle("selected");
    }
  };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);
  board.addEventListener("click", (e) => {
    const del = e.target.closest(".rem-del");
    if (del) {
      const uidToRemove = del.parentElement.dataset.uid;
      state.reminders = state.reminders.filter((r) => r.uid !== uidToRemove);
      commit();
    } else if (!e.target.closest(".reminder")) {
      board.querySelectorAll(".reminder.selected").forEach((r) => r.classList.remove("selected"));
    }
  });

  // ───────── Fiche d'un jeton ─────────
  const sheet = $("#roleSheet");
  let sheetUid = null;

  function openSheet(tokenUid) {
    sheetUid = tokenUid;
    renderSheet();
    if (!sheet.open) sheet.showModal();
  }
  function renderSheet() {
    const t = state.tokens.find((x) => x.uid === sheetUid);
    if (!t) { sheet.close(); return; }
    const role = ROLES[t.roleId];
    const team = TEAMS[role.team];
    const nightLines = [
      role.firstNight && `<li><b>1re nuit :</b> ${escapeHtml(role.firstNight)}</li>`,
      role.otherNight && `<li><b>Autres nuits :</b> ${escapeHtml(role.otherNight)}</li>`,
    ].filter(Boolean).join("");
    const reminderChips = (labels, cls) => labels.map((l) =>
      `<button class="chip ${cls}" data-add-reminder="${escapeHtml(l)}">+ ${escapeHtml(l)}</button>`).join("");

    $("#sheetBody").innerHTML = `
      <button class="icon-btn sheet-close" data-close aria-label="Fermer">✕</button>
      <div class="sheet-head">
        <div class="sheet-token">${tokenHtml(role)}</div>
        <div>
          <p class="eyebrow team-text-${role.team}">${team.label} · ${EDITIONS[role.edition]}</p>
          <h2>${escapeHtml(role.name)}</h2>
          <p class="en-name">${escapeHtml(role.en)}</p>
        </div>
      </div>
      <p class="ability">${escapeHtml(role.ability)}</p>
      ${nightLines ? `<ul class="night-notes">${nightLines}</ul>` : ""}

      <div class="sheet-section">
        <label class="field">
          <span>Joueur</span>
          <input type="text" id="playerInput" value="${escapeHtml(t.player)}" placeholder="Prénom du joueur" autocomplete="off">
        </label>
        <div class="toggles">
          <button class="toggle ${t.dead ? "on" : ""}" data-toggle="dead">${t.dead ? "☠ Mort" : "♥ Vivant"}</button>
          <button class="toggle ${t.ghostUsed ? "on" : ""}" data-toggle="ghostUsed" ${t.dead ? "" : "disabled"}>
            ${t.ghostUsed ? "Vote fantôme utilisé" : "Vote fantôme dispo"}
          </button>
        </div>
      </div>

      <div class="sheet-section">
        <h3>Ajouter un rappel</h3>
        <div class="chips">
          ${reminderChips(role.reminders, "team-" + role.team)}
          ${reminderChips(GENERIC_REMINDERS.filter((g) => !role.reminders.includes(g)), "generic")}
        </div>
        <form class="custom-rem" id="customRem">
          <input type="text" id="customRemInput" placeholder="Rappel personnalisé…" maxlength="24">
          <button class="btn" type="submit">Ajouter</button>
        </form>
      </div>

      <div class="sheet-foot">
        <button class="btn ghost danger" data-remove>Retirer du jeu</button>
        <button class="btn primary" data-close>Fermer</button>
      </div>`;
  }

  sheet.addEventListener("click", (e) => {
    const t = state.tokens.find((x) => x.uid === sheetUid);
    if (e.target === sheet || e.target.closest("[data-close]")) { sheet.close(); return; }
    if (!t) return;
    const toggle = e.target.closest("[data-toggle]");
    const addRem = e.target.closest("[data-add-reminder]");
    if (toggle) {
      const key = toggle.dataset.toggle;
      t[key] = !t[key];
      if (key === "dead" && !t.dead) t.ghostUsed = false;
      commit(); renderSheet();
    } else if (addRem) {
      addReminder(t, addRem.dataset.addReminder);
      commit();
      addRem.classList.add("flash");
      setTimeout(() => addRem.classList.remove("flash"), 400);
    } else if (e.target.closest("[data-remove]")) {
      removeToken(t.uid);
      sheet.close();
      commit();
    }
  });
  sheet.addEventListener("input", (e) => {
    if (e.target.id !== "playerInput") return;
    const t = state.tokens.find((x) => x.uid === sheetUid);
    if (t) { t.player = e.target.value; save(); renderBoard(); }
  });
  sheet.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#customRemInput");
    const t = state.tokens.find((x) => x.uid === sheetUid);
    if (t && input.value.trim()) {
      addReminder(t, input.value.trim());
      input.value = "";
      commit();
    }
  });

  // ───────── Panneau latéral ─────────
  const panel = $("#panel");
  let currentPanel = null;
  let nightTab = null;
  let search = "";

  function openPanel(name) {
    if (currentPanel === name && panel.classList.contains("open")) { closePanel(); return; }
    if (currentPanel !== name) $("#panelBody").scrollTop = 0;
    currentPanel = name;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    document.querySelectorAll("[data-panel]").forEach((b) => b.classList.toggle("active", b.dataset.panel === name && !!b.closest(".actions")));
    renderPanel();
  }
  function closePanel() {
    currentPanel = null;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    document.querySelectorAll("[data-panel]").forEach((b) => b.classList.remove("active"));
  }

  function renderPanel() {
    if (!currentPanel) return;
    const titles = { roles: "Rôles en jeu", night: "Ordre de nuit", rules: "Règles rapides" };
    $("#panelTitle").textContent = titles[currentPanel];
    const body = $("#panelBody");
    const scroll = body.scrollTop;
    if (currentPanel === "roles") body.innerHTML = rolesPanel();
    if (currentPanel === "night") body.innerHTML = nightPanel();
    if (currentPanel === "rules") body.innerHTML = rulesPanel();
    body.scrollTop = scroll;
  }

  function rolesPanel() {
    const dist = DISTRIBUTION[Math.min(state.players, 15)] || [0, 0, 0, 0];
    const teamKeys = ["townsfolk", "outsider", "minion", "demon"];
    const counts = teamKeys.map((k) => state.tokens.filter((t) => ROLES[t.roleId].team === k).length);
    const travellers = state.tokens.filter((t) => ROLES[t.roleId].team === "traveller").length;

    const filters = [["all", "Tous"], ["tb", "Trouble Brewing"], ["bmr", "Bad Moon Rising"], ["snv", "Sects & Violets"]];
    const q = search.trim().toLowerCase();
    const matches = (r) =>
      (state.filter === "all" || r.edition === state.filter) &&
      (!q || r.name.toLowerCase().includes(q) || r.en.toLowerCase().includes(q));

    const groups = [...teamKeys, "traveller"].map((team) => {
      const roles = Object.values(ROLES).filter((r) => r.team === team && matches(r));
      if (!roles.length) return "";
      return `
        <section class="role-group">
          <h3 class="team-text-${team}">${sigil(team, "h-sigil")} ${TEAMS[team].plural}</h3>
          ${roles.map((r) => `
            <button class="role-row ${inPlay(r.id) ? "selected" : ""}" data-role="${r.id}" aria-pressed="${inPlay(r.id)}">
              <span class="mini team-${r.team}">${monogram(r.name)}</span>
              <span class="role-text">
                <span class="role-name">${escapeHtml(r.name)}${state.filter === "all" ? `<em>${r.edition.toUpperCase()}</em>` : ""}</span>
                <span class="role-ability">${escapeHtml(r.ability)}</span>
              </span>
              <span class="check" aria-hidden="true">${inPlay(r.id) ? "✓" : "+"}</span>
            </button>`).join("")}
        </section>`;
    }).join("");

    return `
      <div class="setup-card">
        <div class="players-ctl">
          <span>Joueurs</span>
          <button class="icon-btn" data-players="-1" aria-label="Moins de joueurs">−</button>
          <b>${state.players}</b>
          <button class="icon-btn" data-players="1" aria-label="Plus de joueurs">+</button>
        </div>
        <div class="dist-row">
          ${teamKeys.map((k, i) => `
            <div class="dist-cell ${counts[i] === dist[i] ? "ok" : counts[i] > dist[i] ? "over" : ""}">
              <span class="team-text-${k}">${TEAMS[k].plural}</span>
              <b>${counts[i]}<small>/${dist[i]}</small></b>
            </div>`).join("")}
        </div>
        ${travellers ? `<p class="hint">+ ${travellers} Voyageur${travellers > 1 ? "s" : ""}</p>` : ""}
        <p class="hint">Pensez aux modificateurs entre crochets (Baron, Parrain, Fang Gu…).</p>
      </div>
      <div class="filters">
        ${filters.map(([k, l]) => `<button class="chip ${state.filter === k ? "active" : ""}" data-filter="${k}">${l}</button>`).join("")}
      </div>
      <input class="search" type="search" id="roleSearch" placeholder="Rechercher un rôle…" value="${escapeHtml(search)}">
      ${groups || `<p class="hint">Aucun rôle trouvé.</p>`}`;
  }

  function nightPanel() {
    const first = nightTab === null ? isFirstNight() : nightTab === "first";
    const order = first ? FIRST_NIGHT : OTHER_NIGHT;
    const bigGame = state.tokens.filter((t) => ROLES[t.roleId].team !== "traveller").length >= 7;
    const items = [];
    for (const id of order) {
      if (id.startsWith("_")) {
        if ((id === "_minioninfo" || id === "_demoninfo") && !bigGame) continue;
        items.push({ key: id, special: true, ...NIGHT_SPECIAL[id] });
        continue;
      }
      const role = ROLES[id];
      const text = first ? role.firstNight : role.otherNight;
      for (const t of state.tokens.filter((x) => x.roleId === id)) {
        items.push({ key: t.uid, role, token: t, text });
      }
    }
    const roleItems = items.filter((i) => !i.special).length;
    return `
      <div class="tabs" role="tablist">
        <button class="tab ${first ? "active" : ""}" data-night="first" role="tab" aria-selected="${first}">Première nuit</button>
        <button class="tab ${!first ? "active" : ""}" data-night="other" role="tab" aria-selected="${!first}">Autres nuits</button>
      </div>
      ${state.tokens.length && !roleItems ? `<p class="hint">Aucun rôle en jeu n'agit pendant cette nuit.</p>` : ""}
      ${!state.tokens.length ? `<p class="hint">Ajoutez des rôles pour voir l'ordre de réveil.</p>` : ""}
      <ol class="night-list">
        ${items.map((i, n) => {
          const done = state.nightChecks.includes(i.key);
          return `
          <li class="night-item ${i.special ? "special" : ""} ${done ? "done" : ""} ${i.token?.dead ? "dead" : ""}">
            <button class="night-check" data-check="${i.key}" aria-pressed="${done}" aria-label="Marquer comme fait">${done ? "✓" : n + 1}</button>
            <div>
              <p class="night-name">${i.special ? escapeHtml(i.name) : `<span class="team-text-${i.role.team}">${escapeHtml(i.role.name)}</span>${i.token.player ? ` · ${escapeHtml(i.token.player)}` : ""}${i.token.dead ? ` <em>(mort)</em>` : ""}`}</p>
              <p class="night-text">${escapeHtml(i.text)}</p>
            </div>
          </li>`;
        }).join("")}
      </ol>
      ${state.nightChecks.length ? `<button class="btn ghost small" data-clear-checks>Décocher tout</button>` : ""}`;
  }

  function rulesPanel() {
    return `<div class="rules">${RULES.map((r, i) => `
      <details ${i === 0 ? "open" : ""}>
        <summary>${escapeHtml(r.title)}</summary>
        <div class="rule-body">${r.html}</div>
      </details>`).join("")}</div>`;
  }

  panel.addEventListener("click", (e) => {
    const roleBtn = e.target.closest("[data-role]");
    const players = e.target.closest("[data-players]");
    const filter = e.target.closest("[data-filter]");
    const night = e.target.closest("[data-night]");
    const check = e.target.closest("[data-check]");
    if (roleBtn) {
      const id = roleBtn.dataset.role;
      const tok = state.tokens.find((t) => t.roleId === id);
      if (tok) removeToken(tok.uid); else addRole(id);
      commit();
    } else if (players) {
      state.players = Math.min(20, Math.max(5, state.players + Number(players.dataset.players)));
      commit();
    } else if (filter) {
      state.filter = filter.dataset.filter;
      commit();
    } else if (night) {
      nightTab = night.dataset.night;
      renderPanel();
    } else if (check) {
      const k = check.dataset.check;
      state.nightChecks = state.nightChecks.includes(k) ? state.nightChecks.filter((x) => x !== k) : [...state.nightChecks, k];
      commit();
    } else if (e.target.closest("[data-clear-checks]")) {
      state.nightChecks = [];
      commit();
    }
  });
  panel.addEventListener("input", (e) => {
    if (e.target.id !== "roleSearch") return;
    search = e.target.value;
    const pos = e.target.selectionStart;
    renderPanel();
    const input = $("#roleSearch");
    input.focus();
    input.setSelectionRange(pos, pos);
  });

  // ───────── En-tête ─────────
  function phaseLabel(p) {
    const n = Math.floor(p / 2) + 1;
    return p % 2 === 0 ? `☾ Nuit ${n}` : `☀ Jour ${n}`;
  }
  function setPhase(p) {
    state.phase = Math.max(0, p);
    if (isNight()) state.nightChecks = [];
    nightTab = null;
    document.body.classList.toggle("is-day", !isNight());
    commit();
  }

  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-panel]");
    if (p) openPanel(p.dataset.panel);
  });
  $("#panelClose").addEventListener("click", closePanel);
  $("#phasePrev").addEventListener("click", () => setPhase(state.phase - 1));
  $("#phaseNext").addEventListener("click", () => setPhase(state.phase + 1));
  $("#arrangeBtn").addEventListener("click", arrangeCircle);
  $("#sizeRange").addEventListener("input", (e) => {
    state.tokenSize = Number(e.target.value);
    board.style.setProperty("--token", state.tokenSize + "px");
    save();
  });
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Commencer une nouvelle partie ? Le Grimoire actuel sera effacé.")) return;
    const { players, tokenSize, filter } = state;
    state = { ...defaultState(), players, tokenSize, filter };
    sheet.open && sheet.close();
    document.body.classList.remove("is-day");
    commit();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.open && panel.classList.contains("open")) closePanel();
  });

  function render() {
    $("#phaseLabel").textContent = phaseLabel(state.phase);
    $("#roleCount").textContent = state.tokens.length;
    $("#sizeRange").value = state.tokenSize;
    document.body.classList.toggle("is-day", !isNight());
    renderBoard();
    renderPanel();
  }

  render();
})();
