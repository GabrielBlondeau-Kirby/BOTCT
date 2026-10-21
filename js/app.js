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
  const GAVEL = `<svg class="gavel" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="nomine"><path d="m14 13-8.4 8.4a1 1 0 0 1-3-3l8.4-8.4"/><path d="m16 16 6-6"/><path d="m21.5 10.5-8-8"/><path d="m8 8 6-6"/><path d="m8.5 7.5 8 8"/></svg>`;
  const monogram = (name) => {
    const words = name.replace(/['’]/g, " ").split(/[\s-]+/).filter((w) => w.length > 2 || /^[A-ZÉ]/.test(w));
    return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2)).toUpperCase();
  };

  // ───────── État ─────────
  const defaultState = () => ({
    players: 8,
    tokens: [],      // { uid, roleId, x, y, player, dead, ghostUsed }
    reminders: [],   // { uid, label, roleId (rôle d'origine, null si générique), tokenUid (jeton porteur) }
    phase: 0,        // 0 = Nuit 1, 1 = Jour 1, 2 = Nuit 2…
    nightChecks: [],
    tokenSize: 96,
    filter: "all",
    railHidden: false,
    bluffs: [],      // 3 rôles Bons non en jeu montrés au Démon
    lunaticBluffs: [], // faux bluffs montrés au Fou
    log: [],         // journal : { id, phase, type, ...données au moment de l'événement }
    setup: null,     // composition figée à la fin de la 1re nuit
    ended: null,     // { winner: "good" | "evil", phase }
    trial: null,     // jugements du jour en cours : { phase, mode, list: [{ by, target, votes, fate }] }
  });

  let state = load();
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.tokens)) {
        saved.tokens = saved.tokens.filter((t) => ROLES[t.roleId]);
        saved.reminders = (saved.reminders || []).filter((r) => saved.tokens.some((t) => t.uid === r.tokenUid));
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

  // ───────── Journal ─────────
  // Chaque événement garde le nom du joueur et le rôle au moment où il a lieu.
  const who = (t) => t ? { roleId: t.roleId, player: t.player || "" } : null;
  const whoText = (w) => {
    if (!w) return "?";
    const name = ROLES[w.roleId]?.name || "?";
    return w.player ? `${w.player} (${name})` : name;
  };
  function logEvent(type, data = {}) {
    state.log.push({ id: uid(), phase: state.phase, type, ...data });
  }
  const tokenByUid = (u) => state.tokens.find((t) => t.uid === u);

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
    commit();
  }

  function addRole(roleId) {
    const n = state.tokens.length;
    const pos = circleSlot(n, Math.max(n + 1, state.players));
    state.tokens.push({ uid: uid(), roleId, x: pos.x, y: pos.y, player: "", dead: false, ghostUsed: false });
    state.bluffs = state.bluffs.filter((id) => id !== roleId); // un rôle en jeu ne peut plus servir de bluff
  }

  // Bluffs possibles : Villageois puis Étrangers non en jeu, pris dans le(s) script(s) des rôles en jeu
  const scriptEditions = () => state.filter !== "all"
    ? [state.filter]
    : [...new Set(state.tokens.map((t) => ROLES[t.roleId]).filter((r) => r.team !== "traveller").map((r) => r.edition))];
  const scriptRoles = (teams) => teams.flatMap((team) =>
    Object.values(ROLES).filter((r) => r.team === team && scriptEditions().includes(r.edition)));
  const bluffCandidates = () => scriptRoles(["townsfolk", "outsider"])
    .filter((r) => !inPlay(r.id) && !state.tokens.some((t) => t.believes === r.id));
  function toggleBluff(id) {
    if (state.bluffs.includes(id)) state.bluffs = state.bluffs.filter((b) => b !== id);
    else if (state.bluffs.length < 3) state.bluffs = [...state.bluffs, id];
  }
  function randomBluffs() {
    const pool = bluffCandidates().filter((r) => r.team === "townsfolk");
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    state.bluffs = pool.slice(0, 3).map((r) => r.id);
  }
  function removeToken(tokenUid) {
    state.tokens = state.tokens.filter((t) => t.uid !== tokenUid);
    // retire les rappels portés par ce jeton, et ceux d'un rôle qui n'est plus en jeu
    state.reminders = state.reminders.filter((r) =>
      r.tokenUid !== tokenUid && (!r.roleId || inPlay(r.roleId)));
  }

  // Un rappel de rôle existe en autant d'exemplaires que dans la liste du rôle
  // (souvent 1) : le poser ailleurs déplace le plus ancien.
  const stock = (roleId, label) => ROLES[roleId].reminders.filter((l) => l === label).length;
  const sameReminder = (r, roleId, label) => r.roleId === roleId && r.label === label;

  function toggleReminder(token, roleId, label) {
    const here = state.reminders.find((r) => r.tokenUid === token.uid && sameReminder(r, roleId, label));
    if (here) {
      state.reminders = state.reminders.filter((r) => r !== here);
      logEvent("rem-remove", { label, roleId, on: who(token) });
      return;
    }
    if (roleId) {
      const placed = state.reminders.filter((r) => sameReminder(r, roleId, label));
      if (placed.length >= stock(roleId, label)) {
        const moved = placed[0];
        state.reminders = state.reminders.filter((r) => r !== moved);
        state.reminders.push({ ...moved, tokenUid: token.uid });
        logEvent("rem-move", { label, roleId, from: who(tokenByUid(moved.tokenUid)), on: who(token) });
        return;
      }
    }
    state.reminders.push({ uid: uid(), label, roleId, tokenUid: token.uid });
    logEvent("rem-add", { label, roleId, on: who(token) });
  }

  // Position des rappels : en arc autour de leur jeton, côté centre de la table.
  function reminderPositions() {
    const w = board.clientWidth, h = board.clientHeight;
    const size = Math.max(46, state.tokenSize * 0.52);
    const pos = {};
    for (const t of state.tokens) {
      const mine = state.reminders.filter((r) => r.tokenUid === t.uid);
      if (!mine.length) continue;
      const cx = (t.x / 100) * w, cy = (t.y / 100) * h;
      const base = Math.atan2(0.51 * h - cy, 0.5 * w - cx);
      let i = 0, ring = 0;
      while (i < mine.length) {
        const R = state.tokenSize / 2 + size / 2 + 2 + ring * (size + 4);
        const step = 2 * Math.asin(Math.min(1, (size + 4) / (2 * R)));
        const perRing = Math.max(1, Math.floor((2 * Math.PI) / step));
        const batch = mine.slice(i, i + perRing);
        batch.forEach((r, k) => {
          const angle = base + (k - (batch.length - 1) / 2) * step;
          pos[r.uid] = { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
        });
        i += perRing;
        ring++;
      }
    }
    return pos;
  }
  // Taille du texte d'un rappel, relative au diamètre, pour que le mot le plus long tienne
  const remFontFactor = (label) => {
    const longest = Math.max(...label.split(/\s+/).map((w) => w.length));
    return Math.min(0.21, 0.8 / (longest * 0.6)).toFixed(3);
  };
  function placeReminders(skipUid) {
    const pos = reminderPositions();
    board.querySelectorAll(".reminder").forEach((el) => {
      const p = pos[el.dataset.uid];
      if (!p || el.dataset.uid === skipUid) return;
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
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
    const waking = currentNightStep();

    const frag = document.createDocumentFragment();
    for (const t of state.tokens) {
      const role = ROLES[t.roleId];
      const el = document.createElement("div");
      el.className = "token" + (t.dead ? " is-dead" : "") + (waking && waking.token === t ? " waking" : "");
      el.dataset.uid = t.uid;
      el.style.left = t.x + "%";
      el.style.top = t.y + "%";
      el.innerHTML = tokenHtml(role) +
        (t.dead ? `<span class="shroud" title="${t.ghostUsed ? "Vote fantôme utilisé" : "Vote fantôme disponible"}">${t.ghostUsed ? "" : "<i></i>"}</span>` : "") +
        (t.align ? `<span class="align-badge ${t.align}" title="Alignement changé">${ALIGN[t.align]}</span>` : "") +
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
      el.title = role ? `${role.name} : ${r.label}` : r.label;
      el.innerHTML = `${role ? sigil(role.team, "rem-sigil") : ""}<span style="--f:${remFontFactor(r.label)}">${escapeHtml(r.label)}</span><button class="rem-del" aria-label="Retirer le rappel">✕</button>`;
      frag.appendChild(el);
    }
    board.appendChild(frag);
    placeReminders();

    const alive = state.tokens.filter((t) => !t.dead && ROLES[t.roleId].team !== "traveller").length;
    const total = state.tokens.filter((t) => ROLES[t.roleId].team !== "traveller").length;
    const bluffs = state.bluffs.map((id) => ROLES[id].name).join(", ");
    $("#boardStats").innerHTML = state.tokens.length
      ? `<span><b>${alive}</b> vivants sur ${total}</span><span>Exécution : <b>${Math.ceil(alive / 2)}</b> votes</span>${bluffs ? `<span>Bluffs : <b>${escapeHtml(bluffs)}</b></span>` : ""}`
      : "";
  }

  // Glisser-déposer (souris et tactile)
  let drag = null;
  board.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".token, .reminder");
    justDragged = false;
    if (!el || e.target.closest(".rem-del")) return;
    const isToken = el.classList.contains("token");
    const item = (isToken ? state.tokens : state.reminders).find((i) => i.uid === el.dataset.uid);
    if (!item) return;
    const rect = board.getBoundingClientRect();
    drag = {
      el, item, rect, isToken, startX: e.clientX, startY: e.clientY, moved: false,
      // jetons en % du plateau, rappels en pixels
      ox: isToken ? item.x : parseFloat(el.style.left), oy: isToken ? item.y : parseFloat(el.style.top),
    };
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
  });
  board.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    if (drag.isToken) {
      drag.item.x = Math.min(98, Math.max(2, drag.ox + (dx / drag.rect.width) * 100));
      drag.item.y = Math.min(98, Math.max(2, drag.oy + (dy / drag.rect.height) * 100));
      drag.el.style.left = drag.item.x + "%";
      drag.el.style.top = drag.item.y + "%";
      placeReminders();
    } else {
      drag.el.style.left = drag.ox + dx + "px";
      drag.el.style.top = drag.oy + dy + "px";
      const target = magnetTarget(drag.ox + dx, drag.oy + dy);
      board.querySelectorAll(".token.magnet").forEach((t) => t.dataset.uid !== target?.uid && t.classList.remove("magnet"));
      if (target) board.querySelector(`.token[data-uid="${target.uid}"]`).classList.add("magnet");
    }
  });
  // Jeton le plus proche du point (px), s'il est assez près pour « aimanter » le rappel
  function magnetTarget(x, y) {
    let best = null, bestD = state.tokenSize * 0.9;
    for (const t of state.tokens) {
      const d = Math.hypot((t.x / 100) * board.clientWidth - x, (t.y / 100) * board.clientHeight - y);
      if (d < bestD) { best = t; bestD = d; }
    }
    return best;
  }
  const endDrag = () => {
    if (!drag) return;
    const { el, item, moved, isToken } = drag;
    el.classList.remove("dragging");
    drag = null;
    justDragged = moved;
    if (!moved) return;
    if (isToken) { save(); return; }
    board.querySelectorAll(".token.magnet").forEach((t) => t.classList.remove("magnet"));
    const target = magnetTarget(parseFloat(el.style.left), parseFloat(el.style.top));
    const duplicate = target && state.reminders.some((r) =>
      r !== item && r.tokenUid === target.uid && sameReminder(r, item.roleId, item.label));
    if (target && target.uid !== item.tokenUid && !duplicate) {
      state.reminders = state.reminders.filter((r) => r !== item);
      state.reminders.push({ ...item, tokenUid: target.uid });
      logEvent("rem-move", { label: item.label, roleId: item.roleId, from: who(tokenByUid(item.tokenUid)), on: who(target) });
    }
    commit(); // sinon le rappel revient se coller à son jeton
  };
  // L'ouverture se fait au « click » : au doigt, un clic suit le relâchement
  // et refermerait aussitôt une fiche ouverte dès le pointerup.
  let justDragged = false;
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);
  board.addEventListener("click", (e) => {
    const del = e.target.closest(".rem-del");
    const piece = e.target.closest(".token, .reminder");
    if (piece && !del) {
      if (justDragged) { justDragged = false; return; }
      if (piece.classList.contains("token")) openSheet(piece.dataset.uid);
      else {
        board.querySelectorAll(".reminder.selected").forEach((r) => r !== piece && r.classList.remove("selected"));
        piece.classList.toggle("selected");
      }
      return;
    }
    if (del) {
      const uidToRemove = del.parentElement.dataset.uid;
      const removed = state.reminders.find((r) => r.uid === uidToRemove);
      if (removed) logEvent("rem-remove", { label: removed.label, roleId: removed.roleId, on: who(tokenByUid(removed.tokenUid)) });
      state.reminders = state.reminders.filter((r) => r.uid !== uidToRemove);
      commit();
    } else {
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
    const holderName = (r) => {
      const h = state.tokens.find((x) => x.uid === r.tokenUid);
      return h ? h.player || ROLES[h.roleId].name : "";
    };
    const chip = (roleId, label, cls) => {
      const on = state.reminders.some((r) => r.tokenUid === t.uid && sameReminder(r, roleId, label));
      const elsewhere = roleId && !on && state.reminders.filter((r) => sameReminder(r, roleId, label)).length >= stock(roleId, label)
        ? state.reminders.find((r) => sameReminder(r, roleId, label)) : null;
      return `<button class="chip ${cls} ${on ? "on" : ""}" data-rem-role="${roleId || ""}" data-rem-label="${escapeHtml(label)}" aria-pressed="${on}">
        ${on ? "✓" : "+"} ${escapeHtml(label)}${elsewhere ? `<small>sur ${escapeHtml(holderName(elsewhere))}</small>` : ""}</button>`;
    };
    // rappels des rôles en jeu (celui du jeton d'abord), puis génériques
    const roleIds = [...new Set([t.roleId, ...state.tokens.map((x) => x.roleId)])].filter((id) => ROLES[id].reminders.length);
    const customs = state.reminders.filter((r) => r.tokenUid === t.uid && !r.roleId && !GENERIC_REMINDERS.includes(r.label));
    const reminderGroups = roleIds.map((id) => `
      <div class="chip-group">
        <span class="chip-group-name team-text-${ROLES[id].team}">${escapeHtml(ROLES[id].name)}</span>
        <div class="chips">${[...new Set(ROLES[id].reminders)].map((l) => chip(id, l, "team-" + ROLES[id].team)).join("")}</div>
      </div>`).join("") + `
      <div class="chip-group">
        <span class="chip-group-name">Génériques</span>
        <div class="chips">${[...GENERIC_REMINDERS, ...customs.map((r) => r.label)].map((l) => chip(null, l, "generic")).join("")}</div>
      </div>`;

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
        <div class="toggles">
          <button class="toggle align-${alignOf(t)} ${t.align ? "on" : ""}" data-align title="Changer l'alignement">Alignement : ${ALIGN[alignOf(t)]}</button>
        </div>
        ${believesTeam[t.roleId] ? `
        <label class="field">
          <span>Pense être</span>
          <select id="believesInput">
            <option value="">Choisir…</option>
            ${scriptRoles([believesTeam[t.roleId]]).filter((r) => r.id !== t.roleId).map((r) =>
              `<option value="${r.id}" ${t.believes === r.id ? "selected" : ""}>${escapeHtml(r.name)}${inPlay(r.id) ? " (en jeu)" : ""}</option>`).join("")}
          </select>
        </label>` : ""}
      </div>

      <div class="sheet-section">
        <h3>Rappels sur ce joueur</h3>
        ${reminderGroups}
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
    const remChip = e.target.closest("[data-rem-label]");
    if (toggle) {
      const key = toggle.dataset.toggle;
      t[key] = !t[key];
      if (key === "dead" && !t.dead) t.ghostUsed = false;
      if (key === "dead") logEvent(t.dead ? "death" : "revive", { who: who(t) });
      if (key === "ghostUsed") logEvent(t.ghostUsed ? "ghost" : "ghost-back", { who: who(t) });
      commit(); renderSheet();
    } else if (e.target.closest("[data-align]")) {
      setAlign(t, alignOf(t) === "good" ? "evil" : "good");
      logEvent("align", { who: who(t), align: alignOf(t) });
      commit(); renderSheet();
    } else if (remChip) {
      toggleReminder(t, remChip.dataset.remRole || null, remChip.dataset.remLabel);
      commit(); renderSheet();
    } else if (e.target.closest("[data-remove]")) {
      if (state.phase > 0) logEvent("role-remove", { who: who(t) });
      removeToken(t.uid);
      sheet.close();
      commit();
    }
  });
  // L'Ivrogne croit être un Villageois, le Fou croit être le Démon
  const believesTeam = { drunk: "townsfolk", lunatic: "demon" };
  sheet.addEventListener("change", (e) => {
    if (e.target.id !== "believesInput") return;
    const t = state.tokens.find((x) => x.uid === sheetUid);
    if (t) { t.believes = e.target.value || undefined; commit(); }
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
    const label = input.value.trim();
    if (t && label && !state.reminders.some((r) => r.tokenUid === t.uid && sameReminder(r, null, label))) {
      toggleReminder(t, null, label);
      commit(); renderSheet();
      $("#customRemInput").focus();
    }
  });

  // ───────── Panneau latéral ─────────
  const panel = $("#panel");
  let currentPanel = null;
  let nightTab = null;
  let search = "";
  let roleTeam = "townsfolk";

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
    const titles = { roles: "Rôles en jeu", night: "Ordre de nuit", rules: "Règles rapides", journal: "Journal de partie" };
    $("#panelTitle").textContent = titles[currentPanel];
    const body = $("#panelBody");
    const scroll = body.scrollTop;
    const listScroll = $("#rpList")?.scrollTop || 0;
    panel.classList.toggle("wide", currentPanel === "roles");
    if (currentPanel === "roles") body.innerHTML = rolesPanel();
    if (currentPanel === "night") body.innerHTML = nightPanel();
    if (currentPanel === "rules") body.innerHTML = rulesPanel();
    if (currentPanel === "journal") body.innerHTML = journalPanel();
    body.scrollTop = scroll;
    if ($("#rpList")) $("#rpList").scrollTop = listScroll;
  }

  function rolesPanel() {
    const dist = DISTRIBUTION[Math.min(state.players, 15)] || [0, 0, 0, 0];
    const teamKeys = ["townsfolk", "outsider", "minion", "demon", "traveller"];
    const filters = [["all", "Tous"], ["tb", "Trouble Brewing"], ["bmr", "Bad Moon Rising"], ["snv", "Sects & Violets"]];
    const norm = (v) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(search.trim());
    const matches = (r) =>
      (state.filter === "all" || r.edition === state.filter) &&
      (!q || norm(r.name).includes(q) || norm(r.en).includes(q));
    const rolesOf = (team) => Object.values(ROLES).filter((r) => r.team === team && matches(r));

    // Colonne de gauche : un onglet par type, avec la répartition attendue
    const tabs = teamKeys.map((k, i) => {
      const n = state.tokens.filter((t) => ROLES[t.roleId].team === k).length;
      const target = k === "traveller" ? null : dist[i];
      const status = target === null ? "" : n === target ? "ok" : n > target ? "over" : "under";
      const hits = q ? rolesOf(k).length : 0;
      const sub = q ? (hits ? `${hits} résultat${hits > 1 ? "s" : ""}` : "aucun résultat")
        : target === null ? "hors répartition" : status === "ok" ? "complet" : status === "over" ? "en trop" : `il en manque ${target - n}`;
      const active = !q && k === roleTeam;
      return `
        <button class="rp-tab team-${k} ${active ? "active" : ""} ${status} ${q && !hits ? "empty" : ""}" role="tab" aria-selected="${active}" data-team="${k}">
          ${sigil(k, "h-sigil")}
          <span class="rp-tab-text"><span class="rp-tab-name">${TEAMS[k].plural}</span><span class="rp-tab-sub">${sub}</span></span>
          <b class="rp-count">${n}${target === null ? "" : `<small>/${target}</small>`}</b>
        </button>`;
    }).join("");

    const row = (r) => `
      <button class="role-row ${inPlay(r.id) ? "selected" : ""}" data-role="${r.id}" aria-pressed="${inPlay(r.id)}">
        <span class="mini team-${r.team}">${monogram(r.name)}</span>
        <span class="role-text">
          <span class="role-name">${escapeHtml(r.name)}${state.filter === "all" ? `<em>${r.edition.toUpperCase()}</em>` : ""}</span>
          <span class="role-ability">${escapeHtml(r.ability)}</span>
        </span>
        <span class="check" aria-hidden="true">${inPlay(r.id) ? "✓" : "+"}</span>
      </button>`;

    // Colonne de droite : le type choisi, ou les résultats de recherche de tous les types
    const shown = q ? teamKeys : [roleTeam];
    const groups = shown.map((team) => {
      const roles = rolesOf(team);
      if (!roles.length) return "";
      return `
        <section class="role-group">
          <h3 class="team-text-${team}">${sigil(team, "h-sigil")} ${TEAMS[team].plural}<span>${roles.length}</span></h3>
          ${roles.map(row).join("")}
        </section>`;
    }).join("");

    return `
      <div class="rp">
        <div class="rp-side">
          <div class="players-ctl">
            <span>Joueurs</span>
            <button class="icon-btn" data-players="-1" aria-label="Moins de joueurs">−</button>
            <b>${state.players}</b>
            <button class="icon-btn" data-players="1" aria-label="Plus de joueurs">+</button>
          </div>
          <div class="rp-tabs" role="tablist" aria-orientation="vertical" aria-label="Types de personnage">${tabs}</div>
          <p class="hint">Pensez aux modificateurs entre crochets (Baron, Parrain, Fang Gu…).</p>
        </div>
        <div class="rp-main">
          <div class="rp-tools">
            <input class="search" type="search" id="roleSearch" placeholder="Rechercher dans tous les types…" value="${escapeHtml(search)}">
            <div class="filters">
              ${filters.map(([k, l]) => `<button class="chip ${state.filter === k ? "active" : ""}" data-filter="${k}">${l}</button>`).join("")}
            </div>
          </div>
          <div class="rp-list" id="rpList">
            ${groups || `<p class="hint">${q ? "Aucun rôle ne correspond à cette recherche." : "Aucun rôle de ce type dans cette édition."}</p>`}
          </div>
        </div>
      </div>`;
  }

  // Étapes de la nuit, dans l'ordre officiel, limitées aux rôles en jeu
  function nightItems(first) {
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
      // l'Ivrogne se réveille comme le Villageois qu'il croit être
      for (const t of state.tokens.filter((x) => x.roleId === id || (x.roleId === "drunk" && x.believes === id))) {
        items.push({ key: t.uid + ":" + id, role, token: t, text });
      }
    }
    return items;
  }
  const nightItemName = (i) => i.special
    ? escapeHtml(i.name)
    : `<span class="team-text-${i.role.team}">${escapeHtml(i.role.name)}</span>${i.token.player ? ` · ${escapeHtml(i.token.player)}` : ""}${i.token.roleId !== i.role.id ? ` <em>(${escapeHtml(ROLES[i.token.roleId].name)})</em>` : ""}${i.token.dead ? ` <em>(mort)</em>` : ""}`;

  // Cocher une étape la journalise ; la décocher retire l'entrée de cette nuit
  function toggleNightCheck(k) {
    if (state.nightChecks.includes(k)) {
      state.nightChecks = state.nightChecks.filter((x) => x !== k);
      const i = state.log.findLastIndex((e) => e.type === "wake" && e.key === k && e.phase === state.phase);
      if (i >= 0) state.log.splice(i, 1);
      return;
    }
    state.nightChecks = [...state.nightChecks, k];
    if (!isNight()) return;
    const step = nightItems(isFirstNight()).find((i) => i.key === k);
    if (step && !step.special) logEvent("wake", { key: k, who: who(step.token) });
  }

  // Étape en cours : la première non cochée de la nuit actuelle
  function currentNightStep() {
    if (!isNight() || !state.tokens.length) return null;
    return nightItems(isFirstNight()).find((i) => !state.nightChecks.includes(i.key)) || null;
  }

  function nightPanel() {
    const first = nightTab === null ? isFirstNight() : nightTab === "first";
    const items = nightItems(first);
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
              <p class="night-name">${nightItemName(i)}</p>
              <p class="night-text">${escapeHtml(i.text)}</p>
            </div>
          </li>`;
        }).join("")}
      </ol>
      ${state.nightChecks.length ? `<button class="btn ghost small" data-clear-checks>Décocher tout</button>` : ""}`;
  }

  // ───────── Suivi des réveils (encart de nuit) ─────────
  const rail = $("#nightRail");
  function renderRail() {
    const show = isNight() && state.tokens.length > 0;
    rail.hidden = !show;
    document.body.classList.toggle("rail-open", show && !state.railHidden);
    if (!show) return;
    const items = nightItems(isFirstNight());
    const doneCount = items.filter((i) => state.nightChecks.includes(i.key)).length;
    const current = currentNightStep();
    const night = Math.floor(state.phase / 2) + 1;

    if (state.railHidden) {
      rail.innerHTML = `<button class="rail-tab" data-rail-toggle aria-label="Afficher le suivi des réveils">
        ☾ <b>${doneCount}/${items.length}</b>${current ? ` · ${current.special ? escapeHtml(current.name) : escapeHtml(current.role.name)}` : ""}</button>`;
      return;
    }
    rail.innerHTML = `
      <div class="rail-head">
        <div>
          <p class="rail-title">☾ Nuit ${night}</p>
          <p class="rail-sub">${isFirstNight() ? "Première nuit" : "Autres nuits"} · ${doneCount}/${items.length} étapes</p>
        </div>
        <button class="icon-btn" data-rail-toggle aria-label="Réduire le suivi des réveils" title="Réduire">‹</button>
      </div>
      <div class="rail-progress"><span style="width:${items.length ? (doneCount / items.length) * 100 : 0}%"></span></div>
      ${undo ? `<div class="act-undo"><span>${escapeHtml(undo.label)}</span><button class="btn small ghost" data-act-undo>Annuler</button></div>` : ""}
      <ol class="rail-list">
        ${items.map((i, n) => {
          const done = state.nightChecks.includes(i.key);
          const isCurrent = current && i.key === current.key;
          return `
          <li class="rail-item ${done ? "done" : ""} ${isCurrent ? "current" : ""} ${i.special ? "special" : ""} ${i.token?.dead ? "dead" : ""}">
            <button class="rail-row" data-check="${i.key}" aria-pressed="${done}">
              <span class="rail-num">${done ? "✓" : n + 1}</span>
              <span class="rail-name">${nightItemName(i)}</span>
            </button>
            ${isCurrent ? `
              <p class="rail-text">${escapeHtml(i.text)}</p>
              ${i.key === "_demoninfo" ? bluffPicker() : ""}
              ${i.token ? actionBox(i) : ""}
              <button class="btn primary rail-done" data-check="${i.key}">Fait, étape suivante</button>` : ""}
          </li>`;
        }).join("")}
      </ol>
      ${!current ? `
        <div class="rail-end">
          <p>Tous les réveils sont faits.</p>
          <button class="btn primary" data-next-phase>Passer au Jour ${night}</button>
        </div>` : ""}`;
    const cur = rail.querySelector(".rail-item.current");
    if (cur) cur.scrollIntoView({ block: "nearest" });
  }

  function bluffPicker() {
    const slots = [0, 1, 2].map((n) => {
      const r = ROLES[state.bluffs[n]];
      return r
        ? `<button class="bluff-slot filled team-${r.team}" data-bluff="${r.id}" title="Retirer"><span class="mini team-${r.team}">${monogram(r.name)}</span>${escapeHtml(r.name)}</button>`
        : `<span class="bluff-slot">Bluff ${n + 1}</span>`;
    }).join("");
    const candidates = bluffCandidates();
    const group = (team) => candidates.filter((r) => r.team === team).map((r) => `
      <button class="chip team-${r.team} ${state.bluffs.includes(r.id) ? "on" : ""}" data-bluff="${r.id}"
        ${!state.bluffs.includes(r.id) && state.bluffs.length >= 3 ? "disabled" : ""}>${escapeHtml(r.name)}</button>`).join("");
    return `
      <div class="bluffs">
        <div class="bluff-slots">${slots}</div>
        <p class="bluff-label team-text-townsfolk">Villageois non en jeu</p>
        <div class="chips">${group("townsfolk") || `<span class="hint">Aucun</span>`}</div>
        <p class="bluff-label team-text-outsider">Étrangers non en jeu</p>
        <div class="chips">${group("outsider") || `<span class="hint">Aucun</span>`}</div>
        ${state.tokens.some((t) => t.roleId === "drunk" && !t.believes) ? `<p class="hint">Indiquez sur la fiche de l'Ivrogne le Villageois qu'il croit être, pour l'exclure des bluffs.</p>` : ""}
        <div class="bluff-actions">
          <button class="btn small" data-bluff-random>Tirer au hasard</button>
          <button class="btn small primary" data-bluff-show ${state.bluffs.length ? "" : "disabled"}>Montrer au Démon</button>
        </div>
      </div>`;
  }

  // ───────── Actions de nuit : échanges, rappels et écrans à montrer en un geste ─────────
  const tokName = (t) => t.player || ROLES[t.roleId].name;
  const teamOf = (t) => ROLES[t.roleId].team;
  const defaultAlign = (roleId) => (TEAMS[ROLES[roleId].team].good === false ? "evil" : "good");
  const alignOf = (t) => t.align || defaultAlign(t.roleId);
  const ALIGN = { good: "Bon", evil: "Mauvais" };
  // l'alignement n'est stocké que s'il diffère de celui du personnage
  function setAlign(t, align) {
    if (align === defaultAlign(t.roleId)) delete t.align;
    else t.align = align;
  }
  let act = { key: null, picks: [], role: "", init: false };
  let undo = null; // dernière action, annulable tant qu'aucune autre étape n'est cochée

  // Un changement de personnage garde l'alignement, sauf si on en donne un
  function changeRole(t, roleId, align = alignOf(t)) {
    logEvent("role-change", { who: who(t), roleId });
    t.roleId = roleId;
    delete t.believes;
    setAlign(t, align);
    state.bluffs = state.bluffs.filter((id) => id !== roleId);
  }
  function swapRoles(a, b, swapAligns = false) {
    logEvent("role-swap", { a: who(a), b: who(b) });
    const [alA, alB] = swapAligns ? [alignOf(b), alignOf(a)] : [alignOf(a), alignOf(b)];
    [a.roleId, b.roleId] = [b.roleId, a.roleId];
    delete a.believes; delete b.believes;
    setAlign(a, alA);
    setAlign(b, alB);
  }
  function kill(t) {
    if (t.dead) return;
    t.dead = true;
    logEvent("death", { who: who(t) });
  }
  // Pose le rappel sur ce joueur (le déplace s'il est déjà posé ailleurs)
  function placeReminder(t, roleId, label) {
    if (!state.reminders.some((r) => r.tokenUid === t.uid && sameReminder(r, roleId, label))) toggleReminder(t, roleId, label);
  }

  // Pages de l'écran plein écran : « Vous êtes… » après un changement de personnage
  // l'alignement n'est affiché que s'il change ou s'il diffère de celui du personnage
  const youAre = (t, roleId, align) => ({
    caption: `Pour ${tokName(t)}`, title: "Vous êtes", roles: [roleId],
    align: align ?? (alignOf(t) !== defaultAlign(roleId) ? alignOf(t) : undefined),
  });
  const others = (me) => state.tokens.filter((t) => t !== me);
  const shuffle = (arr) => arr.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  // Étrangers en jeu pour le Parrain, triés par nom pour ne pas trahir les places
  const outsidersInPlay = () => [...new Set(state.tokens.filter((t) => teamOf(t) === "outsider").map((t) => t.roleId))]
    .sort((a, b) => ROLES[a].name.localeCompare(ROLES[b].name));

  // Lavandière, Bibliothécaire, Enquêteur : le vrai joueur et le leurre, puis le jeton montré
  const pairInfo = (team, label) => ({
    prompt: "Le vrai joueur, puis le leurre",
    count: 2,
    labels: ["Vrai", "Leurre"],
    pool: others,
    rolePrompt: "Jeton montré",
    roles: () => scriptRoles([team]),
    roleDefault: (me, [a]) => (a && teamOf(a) === team ? a.roleId : ""),
    plan(me, [a, b], role, rid) {
      if (team === "outsider" && !a && !outsidersInPlay().length) return {
        note: "Aucun Étranger en jeu : faites signe « zéro ».",
        button: "Montrer « aucun Étranger »", stay: true,
        show: [{ title: "Aucun Étranger n'est en jeu", roles: [] }],
      };
      return a && b && role && {
        note: `Montrez ${role.name}, puis désignez ${tokName(a)} et ${tokName(b)}.`,
        button: "Poser les rappels et montrer", stay: true,
        run() { placeReminder(a, rid, label); placeReminder(b, rid, "Faux"); },
        show: [{ title: "L'un de ces deux joueurs est", roles: [role.id] }],
      };
    },
  });
  // Montrer le personnage d'un joueur désigné (modifiable si l'information doit être fausse)
  const revealOf = (prompt, title, pool = others, extra = {}) => ({
    prompt, pool,
    rolePrompt: "Jeton montré",
    roles: () => scriptRoles(["townsfolk", "outsider", "minion", "demon"]),
    roleDefault: (me, [t]) => t?.roleId || "",
    plan: (me, [t], role, rid) => t && role && {
      note: `Montrez ${role.name}${role.id !== t.roleId ? ` (au lieu de ${ROLES[t.roleId].name})` : ""}.`
        + (rid === "grandmother" && alignOf(t) === "evil" ? ` ${tokName(t)} est Mauvais : seulement si la Grand-mère est ivre ou empoisonnée (ou si c'est l'Espion).` : ""),
      button: "Montrer", stay: true,
      run: extra.run && (() => extra.run(t, rid)),
      show: [{ title, roles: [role.id] }],
    },
    ...extra.opts,
  });

  // pool : joueurs désignables ; roles : personnages proposés ; plan : effet décrit,
  // run pour l'appliquer, show pour l'écran à montrer, stay pour rester sur l'étape
  const NIGHT_ACTIONS = {
    washerwoman: pairInfo("townsfolk", "Villageois"),
    librarian: pairInfo("outsider", "Étranger"),
    investigator: pairInfo("minion", "Sbire"),
    undertaker: revealOf("Joueur exécuté aujourd'hui", "Le joueur exécuté était", () => state.tokens.filter((t) => t.dead), {
      opts: {
        defaultPicks() {
          const e = state.log.findLast((x) => x.type === "nomination" && x.executed && x.phase === state.phase - 1);
          const t = e && (state.tokens.find((x) => x.player && x.player === e.target.player) || state.tokens.find((x) => x.roleId === e.target.roleId));
          return t ? [t.uid] : [];
        },
      },
    }),
    ravenkeeper: revealOf("Joueur désigné", "Ce joueur est"),
    harlot: revealOf("Joueur désigné (s'il accepte)", "Ce joueur est"),
    // tous les joueurs sont proposés : une Grand-mère ivre ou empoisonnée peut recevoir un joueur Mauvais
    grandmother: revealOf("Petit-enfant", "Votre petit-enfant est", others, {
      run: (t, rid) => placeReminder(t, rid, "Petit-enfant"),
    }),
    dreamer: {
      prompt: "Joueur désigné",
      pool: others,
      rolePrompt: "Autre jeton (alignement opposé)",
      roles: (me, [t]) => t ? scriptRoles(["townsfolk", "outsider", "minion", "demon"]).filter((r) => defaultAlign(r.id) !== alignOf(t)) : [],
      plan: (me, [t], role) => t && role && {
        note: `Montrez ${ROLES[t.roleId].name} et ${role.name}, dans un ordre au hasard.`,
        button: "Montrer", stay: true,
        show: [{ title: "Ce joueur est l'un de ces personnages", roles: shuffle([t.roleId, role.id]) }],
      },
    },
    eviltwin: {
      prompt: "Le jumeau Bon",
      pool: (me) => others(me).filter((t) => alignOf(t) === "good"),
      plan: (me, [t]) => t && {
        note: `Réveillez les deux jumeaux : chacun voit le personnage de l'autre.`,
        button: "Poser « Jumeau » et montrer", stay: true,
        run() { placeReminder(t, "eviltwin", "Jumeau"); },
        show: [
          { caption: `Pour ${tokName(me)}`, title: "Votre jumeau est", roles: [t.roleId] },
          { caption: `Pour ${tokName(t)}`, title: "Votre jumeau est", roles: [me.roleId] },
        ],
      },
    },
    apprentice: {
      rolePrompt: "Capacité gagnée",
      roles: () => scriptRoles(["townsfolk", "minion"]),
      plan: (me, picks, role) => role && {
        note: `${tokName(me)} gagne la capacité : ${role.name}.`,
        button: "Montrer", stay: true,
        run() { placeReminder(me, "apprentice", "Est l'Apprenti"); },
        show: [{ title: "Vous gagnez la capacité de", roles: [role.id] }],
      },
    },
    exorcist: {
      prompt: "Joueur désigné",
      pool: (me) => others(me).filter((t) => !t.dead),
      plan: (me, [t]) => t && (teamOf(t) === "demon"
        ? {
          note: `${tokName(t)} est le Démon : réveillez-le pour lui montrer l'Exorciste. Il ne se réveillera pas cette nuit.`,
          button: "Poser « Choisi » et montrer au Démon", stay: true,
          run() { placeReminder(t, "exorcist", "Choisi"); },
          show: [{ title: "L'Exorciste vous a choisi", roles: ["exorcist"] }],
        }
        : { note: `${tokName(t)} n'est pas le Démon.`, button: "Poser « Choisi »", stay: true, run() { placeReminder(t, "exorcist", "Choisi"); } }),
    },
    cerenovus: {
      prompt: "Joueur désigné",
      pool: (me) => state.tokens.filter((t) => !t.dead),
      rolePrompt: "Personnage Bon choisi",
      roles: () => scriptRoles(["townsfolk", "outsider"]),
      plan: (me, [t], role) => t && role && {
        note: `Réveillez ${tokName(t)} : il doit être fou de ${role.name} demain.`,
        button: "Poser « Fou » et montrer", stay: true,
        run() { placeReminder(t, "cerenovus", "Fou"); },
        show: [{ caption: `Pour ${tokName(t)}`, title: "Vous êtes fou de", roles: [role.id] }],
      },
    },
    lunatic: {
      when: () => isFirstNight(),
      box: (me) => `
        <p class="act-label">Faux Démon et faux bluffs</p>
        <select class="act-role" data-lun="believes" aria-label="Démon qu'il croit être">
          <option value="">Démon qu'il croit être…</option>
          ${scriptRoles(["demon"]).map((r) => `<option value="${r.id}" ${me.believes === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}
        </select>
        ${[0, 1, 2].map((n) => `
          <select class="act-role" data-lun="${n}" aria-label="Faux bluff ${n + 1}">
            <option value="">Bluff ${n + 1}…</option>
            ${bluffCandidates().map((r) => `<option value="${r.id}" ${state.lunaticBluffs[n] === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}
          </select>`).join("")}`,
      plan: () => state.lunaticBluffs.filter(Boolean).length > 0 && {
        note: "Désignez de faux Sbires, puis montrez les bluffs.",
        button: "Montrer les bluffs au Fou", stay: true,
        show: [{ title: "Ces personnages ne sont pas en jeu", roles: state.lunaticBluffs.filter(Boolean) }],
      },
    },
    godfather: {
      when: () => isFirstNight(),
      plan: () => {
        const ids = outsidersInPlay();
        return {
          note: ids.length ? `${ids.length} Étranger${ids.length > 1 ? "s" : ""} en jeu.` : "Aucun Étranger en jeu.",
          button: "Montrer au Parrain", stay: true,
          show: [{ title: "Les Étrangers en jeu", roles: ids, empty: "Aucun Étranger n'est en jeu" }],
        };
      },
    },
    scarletwoman: {
      when: (me) => !me.dead && state.tokens.some((t) => t.dead && teamOf(t) === "demon"),
      plan(me) {
        const demon = state.tokens.find((t) => t.dead && teamOf(t) === "demon");
        return {
          note: `Si le Démon est mort aujourd'hui avec 5 vivants ou plus, ${tokName(me)} devient ${ROLES[demon.roleId].name}.`,
          button: "Changer et montrer",
          run() { changeRole(me, demon.roleId); },
          show: [youAre(me, demon.roleId)],
        };
      },
    },
    snakecharmer: {
      prompt: "Joueur désigné",
      pool: (me) => others(me).filter((t) => !t.dead),
      plan(me, [t]) {
        if (!t) return null;
        if (teamOf(t) !== "demon") return { note: `${tokName(t)} n'est pas le Démon : rien ne change.` };
        return {
          note: `${tokName(t)} devient le Charmeur de serpents et est empoisonné ; ${tokName(me)} devient ${ROLES[t.roleId].name}.`,
          button: "Échanger et empoisonner",
          run() { swapRoles(me, t, true); placeReminder(t, "snakecharmer", "Empoisonné"); },
          show: [youAre(me, t.roleId, alignOf(t)), youAre(t, "snakecharmer", alignOf(me))],
        };
      },
    },
    poisoner: {
      prompt: "Joueur empoisonné",
      pool: () => state.tokens,
      plan: (me, [t]) => t && {
        note: `${tokName(t)} est empoisonné cette nuit et demain.`,
        button: "Poser « Empoisonné »",
        run() { placeReminder(t, "poisoner", "Empoisonné"); },
      },
    },
    pithag: {
      prompt: "Joueur transformé",
      pool: () => state.tokens,
      rolePrompt: "Nouveau personnage (hors jeu)",
      roles: () => scriptRoles(["townsfolk", "outsider", "minion", "demon"]).filter((r) => !inPlay(r.id)),
      plan: (me, [t], role) => t && role && {
        note: `${tokName(t)} devient ${role.name} et reste ${ALIGN[alignOf(t)]}.${role.team === "demon" ? " Un Démon est créé : les morts de cette nuit sont au choix du Conteur." : ""}`,
        button: "Transformer",
        run() { changeRole(t, role.id); },
        show: [youAre(t, role.id)],
      },
    },
    barber: {
      prompt: "2 joueurs choisis par le Démon",
      count: 2,
      pool: () => state.tokens.filter((t) => teamOf(t) !== "demon"),
      plan: (me, [a, b]) => b && {
        note: `${tokName(a)} devient ${ROLES[b.roleId].name}, ${tokName(b)} devient ${ROLES[a.roleId].name}. Les alignements ne changent pas.`,
        button: "Échanger leurs personnages",
        run() { swapRoles(a, b); },
        show: [youAre(a, b.roleId), youAre(b, a.roleId)],
      },
    },
    imp: {
      prompt: "S'il se désigne : le Sbire qui devient Diablotin",
      pool: () => state.tokens.filter((t) => !t.dead && teamOf(t) === "minion"),
      plan: (me, [t]) => t && {
        note: `${tokName(me)} meurt, ${tokName(t)} devient le Diablotin.`,
        button: "Passer le flambeau",
        run() { kill(me); changeRole(t, "imp"); },
        show: [youAre(t, "imp")],
      },
    },
    fanggu: {
      prompt: "Si la victime est le 1er Étranger visé",
      when: () => !state.reminders.some((r) => sameReminder(r, "fanggu", "Une fois")),
      pool: () => state.tokens.filter((t) => !t.dead && teamOf(t) === "outsider"),
      plan: (me, [t]) => t && {
        note: `${tokName(t)} devient le Fang Gu (Mauvais), ${tokName(me)} meurt à sa place.`,
        button: "Sauter sur l'Étranger",
        run() { kill(me); changeRole(t, "fanggu", "evil"); placeReminder(t, "fanggu", "Une fois"); },
        show: [youAre(t, "fanggu", "evil")],
      },
    },
    philosopher: {
      rolePrompt: "Personnage Bon choisi",
      roles: () => scriptRoles(["townsfolk", "outsider"]).filter((r) => r.id !== "philosopher"),
      plan(me, picks, role) {
        if (!role) return null;
        const twin = state.tokens.find((t) => t !== me && t.roleId === role.id);
        return {
          note: `${tokName(me)} gagne la capacité : ${role.name}.${twin ? ` ${tokName(twin)} devient ivre.` : ""}`,
          button: "Gagner la capacité",
          run() {
            changeRole(me, role.id);
            placeReminder(me, "philosopher", "Est le Philosophe");
            if (twin) placeReminder(twin, "philosopher", "Ivre");
          },
        };
      },
    },
  };

  function actionPlan(step) {
    const a = NIGHT_ACTIONS[step.role.id];
    const me = step.token;
    if (!a || (a.when && !a.when(me))) return null;
    if (act.key !== step.key) act = { key: step.key, picks: [], role: "", init: false };
    if (!act.init) { act.picks = a.defaultPicks ? a.defaultPicks() : []; act.init = true; }
    const pool = a.pool ? a.pool(me) : [];
    const picks = act.picks.map(tokenByUid).filter((t) => t && pool.includes(t));
    const roles = a.roles ? a.roles(me, picks) : [];
    const roleId = act.role || (a.roleDefault ? a.roleDefault(me, picks) : "");
    const role = roles.some((r) => r.id === roleId) ? ROLES[roleId] : null;
    let plan = a.plan(me, picks, role, step.role.id) || null;
    // l'Ivrogne agit comme le Villageois qu'il croit être : seuls les écrans et rappels restent
    if (plan && me.roleId !== step.role.id && !plan.stay) plan = { note: `${tokName(me)} est l'${ROLES[me.roleId].name} : l'effet ne s'applique pas.` };
    return { a, me, pool, picks, roles, role, plan };
  }

  function actionBox(step) {
    const p = actionPlan(step);
    if (!p) return "";
    const { a, me, pool, picks, roles, role, plan } = p;
    const pickBtn = (t) => {
      const n = picks.indexOf(t);
      return `
      <button class="act-pick team-${teamOf(t)} ${n >= 0 ? "on" : ""} ${t.dead ? "dead" : ""}" data-act-pick="${t.uid}" aria-pressed="${n >= 0}">
        <span class="mini team-${teamOf(t)}">${monogram(ROLES[t.roleId].name)}</span>
        <span>${escapeHtml(tokName(t))}${t.player ? `<small>${escapeHtml(ROLES[t.roleId].name)}</small>` : ""}</span>
        ${n >= 0 && a.labels ? `<b class="act-tag">${a.labels[n]}</b>` : ""}
      </button>`;
    };
    const groups = ["townsfolk", "outsider", "minion", "demon"].map((team) => {
      const rs = roles.filter((r) => r.team === team);
      return rs.length ? `<optgroup label="${TEAMS[team].plural}">${rs.map((r) =>
        `<option value="${r.id}" ${r === role ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}</optgroup>` : "";
    }).join("");
    return `
      <div class="act">
        ${me.roleId !== step.role.id ? `<p class="act-warn">${escapeHtml(tokName(me))} est en réalité l'${escapeHtml(ROLES[me.roleId].name)}.</p>` : ""}
        ${a.box ? a.box(me) : ""}
        ${a.pool ? `
          <p class="act-label">${escapeHtml(a.prompt)}</p>
          <div class="act-picks">${pool.map(pickBtn).join("") || `<span class="hint">Aucun joueur possible.</span>`}</div>` : ""}
        ${a.roles && roles.length ? `
          <label class="act-label">${escapeHtml(a.rolePrompt)}
            <select class="act-role" data-act-role><option value="">Choisir…</option>${groups}</select>
          </label>` : ""}
        ${plan?.note ? `<p class="act-note">${escapeHtml(plan.note)}</p>` : ""}
        ${plan?.button && (plan.run || plan.show) ? `<button class="btn act-run" data-act-run>${escapeHtml(plan.button)}</button>` : ""}
      </div>`;
  }

  // Applique l'action de l'étape en cours, ouvre l'écran à montrer, puis passe à l'étape suivante
  function runAction() {
    const step = currentNightStep();
    const p = step?.token && actionPlan(step);
    const plan = p?.plan;
    if (!plan || !(plan.run || plan.show)) return;
    if (plan.run) {
      const snap = JSON.stringify({ tokens: state.tokens, reminders: state.reminders, log: state.log, nightChecks: state.nightChecks, bluffs: state.bluffs });
      const first = isFirstNight();
      const order = first ? FIRST_NIGHT : OTHER_NIGHT;
      const rank = order.indexOf(step.role.id);
      if (!plan.stay) toggleNightCheck(step.key);
      plan.run();
      // un joueur qui reçoit un rôle dont le tour est passé ne se réveille plus cette nuit
      if (!plan.stay) for (const i of nightItems(first)) {
        if (!i.special && order.indexOf(i.role.id) <= rank && !state.nightChecks.includes(i.key)) state.nightChecks.push(i.key);
      }
      undo = { label: `${step.role.name} : ${plan.button}`, snap };
      if (!plan.stay) act = { key: null, picks: [], role: "", init: false };
      commit();
    }
    if (plan.show) openShow(plan.show);
  }

  // ───────── Écran plein écran à montrer aux joueurs (sans nom de joueur) ─────────
  const showDialog = $("#bluffShow");
  let showPages = [], showIndex = 0;
  function openShow(pages) {
    showPages = pages;
    showIndex = 0;
    renderShow();
    if (!showDialog.open) showDialog.showModal();
  }
  function renderShow() {
    const pg = showPages[showIndex];
    const last = showIndex === showPages.length - 1;
    $("#bluffShowBody").innerHTML = `
      ${pg.caption ? `<p class="show-caption">${escapeHtml(pg.caption)}</p>` : ""}
      <p class="show-title">${escapeHtml(pg.title)}</p>
      ${pg.roles.length ? "" : `<p class="show-empty">${escapeHtml(pg.empty || "")}</p>`}
      <div class="show-tokens">
        ${pg.roles.map((id) => {
          const r = ROLES[id];
          return `<div class="show-role"><div class="show-token">${tokenHtml(r)}</div>
            <p class="show-name">${escapeHtml(r.name)}</p><p class="show-ability">${escapeHtml(r.ability)}</p></div>`;
        }).join("")}
      </div>
      ${pg.align ? `<p class="show-align ${pg.align}">Vous êtes ${ALIGN[pg.align]}</p>` : ""}
      <button class="btn ${last ? "" : "primary"}" ${last ? "data-show-close" : "data-show-next"}>${last ? "Fermer" : "Suivant"}</button>`;
  }
  function openBluffShow() {
    openShow([{ title: "Ces personnages ne sont pas en jeu", roles: state.bluffs }]);
  }
  showDialog.addEventListener("click", (e) => {
    if (e.target.closest("[data-show-close]")) showDialog.close();
    if (e.target.closest("[data-show-next]")) { showIndex++; renderShow(); }
  });

  rail.addEventListener("click", (e) => {
    const check = e.target.closest("[data-check]");
    const bluff = e.target.closest("[data-bluff]");
    if (bluff) {
      toggleBluff(bluff.dataset.bluff);
      commit();
    } else if (e.target.closest("[data-bluff-random]")) {
      randomBluffs();
      commit();
    } else if (e.target.closest("[data-bluff-show]")) {
      openBluffShow();
    } else if (e.target.closest("[data-act-pick]")) {
      const u = e.target.closest("[data-act-pick]").dataset.actPick;
      const a = NIGHT_ACTIONS[currentNightStep()?.role?.id];
      const n = a?.count || 1;
      if (a?.roleDefault) act.role = ""; // le jeton montré suit le joueur désigné
      if (act.picks.includes(u)) act.picks = act.picks.filter((x) => x !== u);
      else if (act.picks.length < n) act.picks = [...act.picks, u];
      else act.picks = [...act.picks.slice(0, n - 1), u];
      renderRail();
    } else if (e.target.closest("[data-act-run]")) {
      runAction();
    } else if (e.target.closest("[data-act-undo]")) {
      Object.assign(state, JSON.parse(undo.snap));
      undo = null;
      commit();
    } else if (check) {
      const k = check.dataset.check;
      toggleNightCheck(k);
      undo = null;
      commit();
    } else if (e.target.closest("[data-rail-toggle]")) {
      state.railHidden = !state.railHidden;
      commit();
    } else if (e.target.closest("[data-next-phase]")) {
      setPhase(state.phase + 1);
    }
  });

  rail.addEventListener("change", (e) => {
    const lun = e.target.dataset.lun;
    if (e.target.matches("[data-act-role]")) {
      act.role = e.target.value;
      renderRail();
    } else if (lun === "believes") {
      const t = currentNightStep()?.token;
      if (t) t.believes = e.target.value || undefined;
      commit();
    } else if (lun) {
      const list = [...state.lunaticBluffs];
      list[Number(lun)] = e.target.value;
      state.lunaticBluffs = list;
      commit();
    }
  });

  // ───────── Journal et récapitulatif ─────────
  const phaseName = (p) => (p % 2 === 0 ? "Nuit " : "Jour ") + (Math.floor(p / 2) + 1);
  const remText = (e) => `« ${escapeHtml(e.label)} »${e.roleId ? ` (${escapeHtml(ROLES[e.roleId]?.name || "")})` : ""}`;

  function describe(e) {
    switch (e.type) {
      case "death": return `<b class="ev-death">☠ ${escapeHtml(whoText(e.who))}</b> meurt.`;
      case "revive": return `♥ ${escapeHtml(whoText(e.who))} revient à la vie.`;
      case "ghost": return `${escapeHtml(whoText(e.who))} utilise son vote fantôme.`;
      case "ghost-back": return `${escapeHtml(whoText(e.who))} récupère son vote fantôme.`;
      case "rem-add": return `Rappel ${remText(e)} posé sur ${escapeHtml(whoText(e.on))}.`;
      case "rem-move": return `Rappel ${remText(e)} déplacé de ${escapeHtml(whoText(e.from))} vers ${escapeHtml(whoText(e.on))}.`;
      case "rem-remove": return `Rappel ${remText(e)} retiré de ${escapeHtml(whoText(e.on))}.`;
      case "wake": return `Réveil : ${escapeHtml(whoText(e.who))}.`;
      case "bluffs": return `Bluffs montrés au Démon : ${e.roles.map((id) => escapeHtml(ROLES[id]?.name || id)).join(", ")}.`;
      case "role-add": return `Entrée en jeu : ${escapeHtml(ROLES[e.roleId]?.name || "")}.`;
      case "role-remove": return `Sortie du jeu : ${escapeHtml(whoText(e.who))}.`;
      case "role-change": return `${escapeHtml(whoText(e.who))} devient <b>${escapeHtml(ROLES[e.roleId]?.name || "?")}</b>.`;
      case "align": return `${escapeHtml(whoText(e.who))} devient <b>${ALIGN[e.align]}</b>.`;
      case "role-swap": return `${escapeHtml(whoText(e.a))} et ${escapeHtml(whoText(e.b))} échangent leurs personnages.`;
      case "nomination":
        return `<b>${escapeHtml(whoText(e.by))}</b> nomine <b>${escapeHtml(whoText(e.target))}</b>`
          + `${e.votes !== "" && e.votes != null ? ` : ${e.votes} vote${e.votes > 1 ? "s" : ""}` : ""}`
          + `${e.executed ? ` → <b class="ev-death">exécuté</b>.` : e.onBlock ? " → sur le billot, gracié." : "."}`;
      case "note": return `✎ ${escapeHtml(e.text)}`;
      case "end": return `<b>Fin de partie : victoire ${e.winner === "good" ? "du Bien" : "du Mal"}.</b>`;
      default: return escapeHtml(e.type);
    }
  }
  const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  function groupedLog() {
    const groups = new Map();
    for (const e of state.log) {
      if (!groups.has(e.phase)) groups.set(e.phase, []);
      groups.get(e.phase).push(e);
    }
    return [...groups.entries()].sort((x, y) => x[0] - y[0]);
  }

  function journalPanel() {
    const groups = groupedLog();
    return `
      ${isNight() ? "" : `<button class="btn primary journal-trial" data-trial>${GAVEL} Jugements · ${phaseName(state.phase)}</button>`}
      <form class="journal-form" id="noteForm">
        <p class="journal-label">Note libre</p>
        <textarea id="noteInput" rows="2" placeholder="Ex. : Léo prétend être le Cuisinier, il annonce 1."></textarea>
        <button class="btn small" type="submit">Ajouter la note</button>
      </form>

      <div class="journal-log">
        ${groups.length ? groups.map(([ph, events]) => `
          <section>
            <h3 class="journal-phase ${ph % 2 === 0 ? "night" : "day"}">${ph % 2 === 0 ? "☾" : "☀"} ${phaseName(ph)}</h3>
            <ul>${events.map((e) => `
              <li class="ev ev-${e.type}"><span>${describe(e)}</span>
                <button class="ev-del" data-ev-del="${e.id}" aria-label="Supprimer cette entrée">✕</button></li>`).join("")}
            </ul>
          </section>`).join("") : `<p class="hint">Le journal se remplit tout seul : morts, rappels, réveils, bluffs… Les jugements s'y ajoutent une fois validés.</p>`}
      </div>

      <div class="journal-end">
        ${state.ended
          ? `<button class="btn primary" data-recap>Voir le récapitulatif</button>
             <button class="btn ghost small" data-unend>Reprendre la partie</button>`
          : `<p class="journal-label">Fin de partie</p>
             <div class="end-choice">
               <button class="btn end-good" data-end="good">Victoire du Bien</button>
               <button class="btn end-evil" data-end="evil">Victoire du Mal</button>
             </div>`}
      </div>`;
  }

  // ───────── Jugements de la journée ─────────
  // Le Conteur saisit chaque nomination (nominateur, nominé, votes), puis tranche qui meurt.
  const trial = $("#trial");
  let trialDraft = { by: null, target: null, votes: 0 };

  function currentTrial() {
    if (!state.trial || state.trial.phase !== state.phase) state.trial = { phase: state.phase, mode: "vote", list: [] };
    state.trial.list = state.trial.list.filter((j) => tokenByUid(j.by) && tokenByUid(j.target));
    return state.trial;
  }
  // Il faut au moins le seuil et strictement plus que le meilleur score ; une égalité vide le billot.
  function standings(list, threshold) {
    let best = 0, leader = -1;
    const status = list.map((j, i) => {
      if (j.votes >= threshold && j.votes > best) { best = j.votes; leader = i; return "lead"; }
      if (j.votes >= threshold && j.votes === best) { leader = -1; return "tie"; }
      return "low";
    });
    return { best, leader, status };
  }
  const tokenName = (t) => t.player || ROLES[t.roleId].name;
  const fateOf = (j, i, leader) => (j.fate === null || j.fate === undefined ? i === leader : j.fate);

  function trialHtml() {
    const tr = currentTrial();
    const alive = state.tokens.filter((t) => !t.dead && ROLES[t.roleId].team !== "traveller").length;
    const threshold = Math.ceil(alive / 2);
    const ghosts = state.tokens.filter((t) => t.dead && !t.ghostUsed).length;
    const maxVotes = state.tokens.filter((t) => !t.dead).length + ghosts;
    const { best, leader, status } = standings(tr.list, threshold);
    const nominators = tr.list.map((j) => j.by), nominated = tr.list.map((j) => j.target);
    const d = trialDraft;
    if (d.by && (!tokenByUid(d.by) || nominators.includes(d.by))) d.by = null;
    if (d.target && (!tokenByUid(d.target) || nominated.includes(d.target))) d.target = null;
    d.votes = Math.min(d.votes, maxVotes);
    const leaderTok = leader >= 0 ? tokenByUid(tr.list[leader].target) : null;

    const player = (t, kind, on, off, note) => `
      <button class="tr-player ${kind} ${on ? "on" : ""}" data-tr-${kind}="${t.uid}" aria-pressed="${on}" ${off ? "disabled" : ""}>
        <span class="mini team-${ROLES[t.roleId].team} ${t.dead ? "is-dead" : ""}">${monogram(ROLES[t.roleId].name)}</span>
        <span class="tr-player-text"><b>${escapeHtml(tokenName(t))}</b><small>${escapeHtml(note)}</small></span>
      </button>`;
    const roleNote = (t) => (t.player ? ROLES[t.roleId].name : "");
    const byCol = state.tokens.map((t) => {
      const off = t.dead || nominators.includes(t.uid);
      return player(t, "by", d.by === t.uid, off, t.dead ? "mort · ne nomine pas" : nominators.includes(t.uid) ? "a déjà nominé" : roleNote(t));
    }).join("");
    const targetCol = state.tokens.filter((t) => !nominated.includes(t.uid)).map((t) =>
      player(t, "target", d.target === t.uid, t.uid === d.by, t.uid === d.by ? "nominateur" : t.dead ? "mort · peut être nominé" : roleNote(t))).join("");

    const ready = !!(d.by && d.target);
    let verdict = "Choisissez un nominateur et un nominé.", vClass = "";
    if (ready) {
      const tName = escapeHtml(tokenName(tokenByUid(d.target)));
      if (d.votes < threshold) verdict = `Insuffisant : il faut ${threshold} votes.`;
      else if (d.votes > best) { verdict = `${tName} passerait sur le billot.`; vClass = "lead"; }
      else if (d.votes === best) { verdict = `Égalité à ${best} votes : plus personne sur le billot.`; vClass = "tie"; }
      else verdict = `Pas assez pour battre ${best} votes.`;
    }
    const segments = Array.from({ length: maxVotes }, (_, i) =>
      `<i class="${i < d.votes ? (d.votes >= threshold ? "on" : "low") : ""} ${i === threshold - 1 ? "mark" : ""}"></i>`).join("");

    const cards = tr.list.map((j, i) => ({ j, i })).sort((a, b) => b.j.votes - a.j.votes || a.i - b.i).map(({ j, i }) => {
      const s = status[i], isLeader = i === leader;
      const chip = s === "lead" ? (isLeader ? "Sur le billot" : "Dépassé") : s === "tie" ? "Égalité" : "Insuffisant";
      const dies = fateOf(j, i, leader);
      const by = tokenByUid(j.by), target = tokenByUid(j.target);
      return `
        <div class="tr-card ${isLeader ? "leader" : ""}">
          <span class="tr-card-n">#${i + 1}</span>
          ${tr.mode === "vote" ? `<button class="tr-card-del" data-tr-del="${i}" aria-label="Supprimer ce jugement">✕</button>` : ""}
          <b class="tr-card-votes">${j.votes}</b>
          <span class="tr-card-who"><b class="by">${escapeHtml(tokenName(by))}</b>${GAVEL}<b class="target">${escapeHtml(tokenName(target))}</b></span>
          ${tr.mode === "verdict"
            ? `<span class="tr-fate" role="group" aria-label="Issue pour ${escapeHtml(tokenName(target))}">
                 <button class="${dies ? "on dies" : ""}" data-tr-fate="${i}" data-dies="1" aria-pressed="${dies}">Meurt</button>
                 <button class="${dies ? "" : "on lives"}" data-tr-fate="${i}" data-dies="0" aria-pressed="${!dies}">Survit</button>
               </span>`
            : `<span class="tr-chip ${isLeader ? "lead" : s === "lead" ? "passed" : s}">${chip}</span>`}
        </div>`;
    }).join("");
    const deaths = tr.list.filter((j, i) => fateOf(j, i, leader)).map((j) => tokenName(tokenByUid(j.target)));
    const names = (l) => l.map(escapeHtml).join(", ");

    let footer;
    if (tr.mode === "vote") footer = `
      <span class="tr-foot-hint">Une fois les nominations terminées, passez au verdict.</span>
      <button class="btn primary" data-tr-mode="verdict" ${tr.list.length ? "" : "disabled"}>Plus de jugement</button>`;
    else if (tr.mode === "verdict") footer = `
      <span class="tr-foot-hint">${deaths.length ? `Mort${deaths.length > 1 ? "s" : ""} : ${names(deaths)}` : "Aucune mort ce jour"}</span>
      <button class="btn" data-tr-mode="vote">Reprendre les nominations</button>
      <button class="btn primary" data-tr-validate>${deaths.length ? `Valider : ${names(deaths)} ${deaths.length > 1 ? "meurent" : "meurt"}` : "Valider : personne ne meurt"}</button>`;
    else footer = `
      <span class="tr-foot-hint">Enregistré dans le journal.</span>
      <button class="btn" data-tr-close>Fermer</button>
      <button class="btn primary" data-tr-night>Passer à la ${phaseName(state.phase + 1)}</button>`;

    return `
      <header class="tr-head">
        <div class="tr-title">
          <h2>Jugements · ${phaseName(state.phase)}</h2>
          <p>${alive} vivants · <b>${threshold} votes</b> pour mettre sur le billot · ${ghosts} vote${ghosts > 1 ? "s" : ""} fantôme${ghosts > 1 ? "s" : ""} disponible${ghosts > 1 ? "s" : ""}</p>
        </div>
        <div class="tr-block ${leaderTok ? "has" : ""}">
          <span>Sur le billot</span>
          <b>${leaderTok ? `${escapeHtml(tokenName(leaderTok))} · ${best} votes` : best ? "Personne (égalité)" : "Personne"}</b>
        </div>
        <button class="icon-btn" data-tr-close aria-label="Fermer">✕</button>
      </header>
      ${tr.mode === "vote" ? `
      <div class="tr-vote">
        <section class="tr-col">
          <h3 class="by">Nominateur</h3>
          <div class="tr-list" data-scroll="by">${byCol || `<p class="hint">Ajoutez des rôles au Grimoire.</p>`}</div>
        </section>
        <section class="tr-center">
          <p class="tr-duel"><b class="by ${d.by ? "" : "empty"}">${d.by ? escapeHtml(tokenName(tokenByUid(d.by))) : "Nominateur"}</b>${GAVEL}<b class="target ${d.target ? "" : "empty"}">${d.target ? escapeHtml(tokenName(tokenByUid(d.target))) : "Nominé"}</b></p>
          <div class="tr-counter">
            <button class="tr-step" data-tr-votes="-1" aria-label="Retirer un vote">−</button>
            <div><b aria-live="polite">${d.votes}</b><span>votes</span></div>
            <button class="tr-step" data-tr-votes="1" aria-label="Ajouter un vote">+</button>
          </div>
          <div class="tr-gauge" aria-hidden="true">${segments}</div>
          <p class="tr-gauge-hint">Seuil ${threshold} · à battre ${best ? best + 1 : threshold} · maximum ${maxVotes}</p>
          <p class="tr-verdict ${vClass}">${verdict}</p>
          <button class="btn primary tr-record" data-tr-record ${ready ? "" : "disabled"}>Enregistrer le jugement</button>
        </section>
        <section class="tr-col">
          <h3 class="target">Nominé</h3>
          <div class="tr-list" data-scroll="target">${targetCol}</div>
        </section>
      </div>` : ""}
      <section class="tr-history">
        <div class="tr-history-head">
          <h3>${tr.mode === "vote" ? "Historique des jugements" : tr.mode === "verdict" ? "Verdict du Conteur" : "Journée close"}</h3>
          <span>${tr.mode === "vote" ? "Trié du plus grand nombre de votes au plus petit" : tr.mode === "verdict" ? "Proposé selon les votes, modifiable pour chaque nominé" : ""}</span>
        </div>
        <div class="tr-cards" data-scroll="cards">
          ${cards || `<p class="hint">Aucun jugement pour l'instant. Choisissez un nominateur et un nominé.</p>`}
          ${tr.mode === "done" ? `<p class="tr-done">${tr.result ? escapeHtml(tr.result) : ""}</p>` : ""}
        </div>
      </section>
      <footer class="tr-foot">${footer}</footer>`;
  }

  function renderTrial() {
    if (!trial.open) return;
    const scrolls = {};
    trial.querySelectorAll("[data-scroll]").forEach((el) => { scrolls[el.dataset.scroll] = el.scrollTop; });
    $("#trialBody").innerHTML = trialHtml();
    trial.querySelectorAll("[data-scroll]").forEach((el) => { el.scrollTop = scrolls[el.dataset.scroll] || 0; });
  }
  function openTrial() {
    if (isNight()) return;
    trial.open || trial.showModal();
    renderTrial();
  }

  trial.addEventListener("click", (e) => {
    const tr = currentTrial();
    const btn = (sel) => e.target.closest(sel);
    let b;
    if (e.target === trial || btn("[data-tr-close]")) { trial.close(); return; }
    if ((b = btn("[data-tr-by]"))) trialDraft.by = b.dataset.trBy;
    else if ((b = btn("[data-tr-target]"))) trialDraft.target = b.dataset.trTarget;
    else if ((b = btn("[data-tr-votes]"))) trialDraft.votes = Math.max(0, trialDraft.votes + Number(b.dataset.trVotes));
    else if (btn("[data-tr-record]")) {
      if (!trialDraft.by || !trialDraft.target) return;
      tr.list.push({ by: trialDraft.by, target: trialDraft.target, votes: trialDraft.votes, fate: null });
      trialDraft = { by: null, target: null, votes: 0 };
    undo = null;
    } else if ((b = btn("[data-tr-del]"))) tr.list.splice(Number(b.dataset.trDel), 1);
    else if ((b = btn("[data-tr-mode]"))) tr.mode = b.dataset.trMode;
    else if ((b = btn("[data-tr-fate]"))) tr.list[Number(b.dataset.trFate)].fate = b.dataset.dies === "1";
    else if (btn("[data-tr-validate]")) {
      const alive = state.tokens.filter((t) => !t.dead && ROLES[t.roleId].team !== "traveller").length;
      const { leader } = standings(tr.list, Math.ceil(alive / 2));
      const dead = [];
      tr.list.forEach((j, i) => {
        const by = tokenByUid(j.by), target = tokenByUid(j.target);
        const executed = fateOf(j, i, leader);
        logEvent("nomination", { by: who(by), target: who(target), votes: j.votes, executed, onBlock: i === leader });
        if (executed) { target.dead = true; dead.push(tokenName(target)); }
      });
      tr.mode = "done";
      tr.result = dead.length
        ? `${dead.join(", ")} ${dead.length > 1 ? "sont exécutés" : "est exécuté"}. Jeton${dead.length > 1 ? "s" : ""} passé${dead.length > 1 ? "s" : ""} en mort.`
        : "Personne n'est exécuté aujourd'hui.";
    } else if (btn("[data-tr-night]")) {
      trial.close();
      setPhase(state.phase + 1);
      return;
    } else return;
    commit();
  });

  // Récapitulatif plein écran
  const recap = $("#recap");
  function recapData() {
    const start = state.setup || state.tokens.map((t) => ({ roleId: t.roleId, player: t.player || "" }));
    const lastPhase = state.ended?.phase ?? state.phase;
    return { start, lastPhase, groups: groupedLog() };
  }
  function openRecap() {
    const { start, lastPhase, groups } = recapData();
    const good = state.ended?.winner === "good";
    const nights = Math.floor(lastPhase / 2) + 1, days = Math.floor((lastPhase + 1) / 2);
    const finalOf = (s) => state.tokens.find((t) => t.roleId === s.roleId);
    const executions = state.log.filter((e) => e.type === "nomination" && e.executed).length;
    const deaths = state.log.filter((e) => e.type === "death").length + executions;
    const teams = ["townsfolk", "outsider", "minion", "demon", "traveller"];
    $("#recapBody").innerHTML = `
      <button class="icon-btn recap-close" data-recap-close aria-label="Fermer">✕</button>
      <header class="recap-head ${good ? "good" : "evil"}">
        <p class="recap-eyebrow">Fin de partie · ${start.length} joueurs</p>
        <h2>${state.ended ? (good ? "Victoire du Bien" : "Victoire du Mal") : "Partie en cours"}</h2>
        <p class="recap-stats">${nights} nuit${nights > 1 ? "s" : ""} · ${days} jour${days > 1 ? "s" : ""} · ${deaths} mort${deaths > 1 ? "s" : ""} · ${executions} exécution${executions > 1 ? "s" : ""}</p>
      </header>

      <section class="recap-section">
        <h3>Le Grimoire</h3>
        <ul class="recap-cast">
          ${teams.flatMap((team) => start.filter((s) => ROLES[s.roleId]?.team === team).map((s) => {
            const r = ROLES[s.roleId], fin = finalOf(s);
            return `<li class="${fin?.dead ? "dead" : ""}">
              <span class="mini team-${r.team}">${monogram(r.name)}</span>
              <span class="cast-text"><b>${escapeHtml(fin?.player || s.player || "—")}</b>
                <span class="team-text-${r.team}">${escapeHtml(r.name)}</span></span>
              <span class="cast-state">${!fin ? "parti" : fin.dead ? "☠ mort" : "vivant"}</span>
            </li>`;
          })).join("")}
        </ul>
        ${state.bluffs.length ? `<p class="hint">Bluffs du Démon : ${state.bluffs.map((id) => escapeHtml(ROLES[id].name)).join(", ")}</p>` : ""}
      </section>

      <section class="recap-section">
        <h3>Chronologie</h3>
        ${groups.length ? `<ol class="recap-timeline">${groups.map(([ph, events]) => `
          <li class="${ph % 2 === 0 ? "night" : "day"}">
            <p class="tl-phase">${ph % 2 === 0 ? "☾" : "☀"} ${phaseName(ph)}</p>
            <ul>${events.filter((e) => e.type !== "wake").map((e) => `<li>${describe(e)}</li>`).join("")}
              ${events.some((e) => e.type === "wake") ? `<li class="tl-wakes">Réveils : ${events.filter((e) => e.type === "wake").map((e) => escapeHtml(whoText(e.who))).join(" → ")}</li>` : ""}
            </ul>
          </li>`).join("")}</ol>` : `<p class="hint">Aucun événement noté.</p>`}
      </section>

      <div class="recap-actions">
        <button class="btn" data-recap-copy>Copier le récit</button>
        <button class="btn primary" data-recap-close>Fermer</button>
      </div>
      <textarea class="recap-text" id="recapText" readonly hidden></textarea>`;
    if (!recap.open) recap.showModal();
    recap.querySelector(".recap-inner").scrollTop = 0;
  }
  function recapPlainText() {
    const { start, groups } = recapData();
    const lines = [];
    lines.push(state.ended ? (state.ended.winner === "good" ? "VICTOIRE DU BIEN" : "VICTOIRE DU MAL") : "PARTIE EN COURS", "");
    lines.push("Grimoire :");
    for (const s of start) {
      const fin = state.tokens.find((t) => t.roleId === s.roleId);
      lines.push(`- ${fin?.player || s.player || "—"} : ${ROLES[s.roleId].name} (${TEAMS[ROLES[s.roleId].team].label})${fin?.dead ? " — mort" : ""}`);
    }
    if (state.bluffs.length) lines.push(`Bluffs : ${state.bluffs.map((id) => ROLES[id].name).join(", ")}`);
    for (const [ph, events] of groups) {
      lines.push("", phaseName(ph).toUpperCase());
      const wakes = events.filter((e) => e.type === "wake");
      for (const e of events.filter((e) => e.type !== "wake")) lines.push("- " + plain(describe(e)));
      if (wakes.length) lines.push("- Réveils : " + wakes.map((e) => whoText(e.who)).join(" → "));
    }
    return lines.join("\n");
  }
  recap.addEventListener("click", (e) => {
    if (e.target.closest("[data-recap-close]")) { recap.close(); return; }
    const copy = e.target.closest("[data-recap-copy]");
    if (copy) {
      const text = recapPlainText();
      const done = () => { copy.textContent = "Récit copié"; setTimeout(() => (copy.textContent = "Copier le récit"), 2000); };
      const fallback = () => {
        const ta = $("#recapText");
        ta.hidden = false;
        ta.value = text;
        ta.select();
        copy.textContent = "Sélectionnez puis copiez le texte ci-dessous";
      };
      try { navigator.clipboard.writeText(text).then(done, fallback); } catch (err) { fallback(); }
    }
  });

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
    const teamTab = e.target.closest("[data-team]");
    const night = e.target.closest("[data-night]");
    const check = e.target.closest("[data-check]");
    if (roleBtn) {
      const id = roleBtn.dataset.role;
      const tok = state.tokens.find((t) => t.roleId === id);
      if (tok) {
        if (state.phase > 0) logEvent("role-remove", { who: who(tok) });
        removeToken(tok.uid);
      } else {
        addRole(id);
        if (state.phase > 0) logEvent("role-add", { roleId: id });
      }
      commit();
    } else if (teamTab) {
      roleTeam = teamTab.dataset.team;
      search = "";
      renderPanel();
      $("#rpList").scrollTop = 0;
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
      toggleNightCheck(k);
      commit();
    } else if (e.target.closest("[data-ev-del]")) {
      const id = e.target.closest("[data-ev-del]").dataset.evDel;
      state.log = state.log.filter((x) => x.id !== id);
      commit();
    } else if (e.target.closest("[data-end]")) {
      if (!state.setup) state.setup = state.tokens.map((t) => ({ roleId: t.roleId, player: t.player || "" }));
      state.ended = { winner: e.target.closest("[data-end]").dataset.end, phase: state.phase };
      logEvent("end", { winner: state.ended.winner });
      commit();
      openRecap();
    } else if (e.target.closest("[data-recap]")) {
      openRecap();
    } else if (e.target.closest("[data-unend]")) {
      state.ended = null;
      state.log = state.log.filter((x) => x.type !== "end");
      commit();
    } else if (e.target.closest("[data-clear-checks]")) {
      state.nightChecks = [];
      commit();
    }
  });
  panel.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "noteForm") {
      const text = $("#noteInput").value.trim();
      if (!text) return;
      logEvent("note", { text });
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
    if (state.phase === 0 && p > 0 && !state.setup) {
      state.setup = state.tokens.map((t) => ({ roleId: t.roleId, player: t.player || "" }));
      if (state.bluffs.length) logEvent("bluffs", { roles: [...state.bluffs] });
    }
    state.phase = Math.max(0, p);
    if (isNight()) state.nightChecks = [];
    nightTab = null;
    undo = null;
    document.body.classList.toggle("is-day", !isNight());
    commit();
  }

  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-panel]");
    if (p) openPanel(p.dataset.panel);
    if (e.target.closest("[data-trial]")) openTrial();
  });
  $("#panelClose").addEventListener("click", closePanel);
  $("#phasePrev").addEventListener("click", () => setPhase(state.phase - 1));
  $("#phaseNext").addEventListener("click", () => setPhase(state.phase + 1));
  $("#arrangeBtn").addEventListener("click", arrangeCircle);
  $("#sizeRange").addEventListener("input", (e) => {
    state.tokenSize = Number(e.target.value);
    board.style.setProperty("--token", state.tokenSize + "px");
    placeReminders();
    save();
  });
  // Confirmation dans la page (les fenêtres confirm() ne sont pas toujours disponibles)
  let resetTimer = null;
  $("#resetBtn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (!resetTimer) {
      btn.textContent = "Effacer le Grimoire ?";
      btn.classList.add("confirming");
      resetTimer = setTimeout(() => {
        resetTimer = null;
        btn.textContent = "Nouvelle partie";
        btn.classList.remove("confirming");
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    resetTimer = null;
    btn.textContent = "Nouvelle partie";
    btn.classList.remove("confirming");
    const { players, tokenSize, filter } = state;
    state = { ...defaultState(), players, tokenSize, filter };
    trialDraft = { by: null, target: null, votes: 0 };
    undo = null;
    trial.open && trial.close();
    sheet.open && sheet.close();
    document.body.classList.remove("is-day");
    commit();
  });
  // le plateau change de largeur quand l'encart de nuit s'ouvre ou se ferme
  new ResizeObserver(() => placeReminders()).observe(board);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.open && panel.classList.contains("open")) closePanel();
  });

  function render() {
    $("#phaseLabel").textContent = phaseLabel(state.phase);
    $("#roleCount").textContent = state.tokens.length;
    $("#sizeRange").value = state.tokenSize;
    document.body.classList.toggle("is-day", !isNight());
    renderRail();
    renderBoard();
    renderPanel();
    renderTrial();
  }

  // Ciel étoilé : positions fixes tirées une fois
  $("#stars").innerHTML = Array.from({ length: 70 }, () => {
    const s = (Math.random() * 1.8 + 1).toFixed(1);
    return `<i style="left:${(Math.random() * 100).toFixed(2)}%;top:${(Math.random() * 100).toFixed(2)}%;width:${s}px;height:${s}px;--d:${(3 + Math.random() * 4).toFixed(1)}s;--delay:-${(Math.random() * 6).toFixed(1)}s"></i>`;
  }).join("");

  render();
})();
