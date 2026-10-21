(function (root) {
  'use strict';

  const UU = root.UU;
  const plural = UU.plural;
  const $ = (id) => document.getElementById(id);

  const PHASES = {
    debut: 'Phase de Début de Tour',
    pioche: 'Phase de Pioche',
    action: "Phase d'Action",
    fin: 'Phase de Fin de Tour',
  };

  const ICONS = {
    unicorn: '<path d="M6 21 L12 3 L18 21 Z" />',
    magic: '<path d="M12 2 L14.6 9 L22 9.3 L16.2 13.8 L18.2 21 L12 16.8 L5.8 21 L7.8 13.8 L2 9.3 L9.4 9 Z" />',
    upgrade: '<path d="M12 3 L21 13 L15 13 L15 21 L9 21 L9 13 L3 13 Z" />',
    downgrade: '<path d="M12 21 L3 11 L9 11 L9 3 L15 3 L15 11 L21 11 Z" />',
    instant: '<path d="M10 2 H14 L13.2 15 H10.8 Z M10 18 H14 V22 H10 Z" />',
  };

  const PHASE_STEPS = [
    ['debut', 'Début'],
    ['pioche', 'Pioche'],
    ['action', 'Action'],
    ['fin', 'Fin'],
  ];

  const PLAYER_COLORS = ['#7b3fe4', '#e0592a', '#2f8fd0', '#3a9a52', '#d43f8d', '#b98b00', '#0f9a9a', '#8a5a2b'];

  // Hands are hidden, but a card that goes to one of these zones is shown to everyone.
  const PUBLIC_ZONES = ['discard', 'nursery', 'limbo', 'stable'];

  const FEED_SIZE = 10;
  const MAX_FLIGHTS = 30;

  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  function iconFor(type) {
    const key = type === 'baby' || type === 'basic' || type === 'magical' ? 'unicorn' : type;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg>`;
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  function colorOf(p) {
    return PLAYER_COLORS[p.index % PLAYER_COLORS.length];
  }

  function nameTag(p) {
    return `<span class="who" style="--pc: ${colorOf(p)}">${escapeHtml(p.name)}</span>`;
  }

  function anchorKey(zone, owner) {
    if (zone === 'hand' || zone === 'stable') return `${zone}-${owner}`;
    return zone;
  }

  // Restarts a CSS animation on an element that stays in the page.
  function replay(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  // Keywords in capitals are shown in bold, as on the printed cards.
  function cardText(text) {
    return escapeHtml(text).replace(/\b(PIOCHE[RZ]|DÉFAUSSE[RZ]|SACRIFIE[RZ]|DÉTRUI(?:RE|SEZ)|VOLE[RZ])\b/g, '<strong>$1</strong>');
  }

  class HumanController {
    constructor(ui) {
      this.ui = ui;
    }

    decide(g, p, req) {
      return new Promise((resolve) => this.ui.startPrompt(req, resolve));
    }
  }

  class UI {
    constructor() {
      this.game = null;
      this.human = null;
      this.ai = [];
      this.request = null;
      this.resolve = null;
      this.selection = [];
      this.renderQueued = false;
      this.logGrew = false;
      this.resetHistory();
      this.bind();
    }

    resetHistory() {
      this.moves = [];
      this.feed = [];
      this.lastPlay = new Map();
      this.enteredOn = new Map();
      this.counts = new Map();
      this.acting = null;
      this.spot = null;
      this.turnShown = null;
      this.shownRequest = null;
      this.shownPhase = null;
      this.logGroup = null;
    }

    // Animations follow the computer speed, so a fast game stays fast.
    duration() {
      return Math.min(600, Math.max(260, Number($('speed').value) * 0.6));
    }

    bind() {
      $('setup-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.start();
      });
      $('btn-new').addEventListener('click', () => this.showSetup());
      $('btn-rules').addEventListener('click', () => this.showModal(UU.RULES_HTML));
      $('speed').addEventListener('change', () => {
        for (const c of this.ai) c.delay = Number($('speed').value);
      });
      $('modal').addEventListener('click', (e) => {
        if (e.target === $('modal') || e.target.classList.contains('modal-close')) this.hideModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.hideModal();
      });
    }

    showSetup() {
      if (this.game && !this.game.result && !confirm('Abandonner la partie en cours ?')) return;
      this.abandon();
      $('game').hidden = true;
      $('setup').hidden = false;
    }

    abandon() {
      if (this.game) this.game.abandon();
      this.game = null;
      this.request = null;
      this.resolve = null;
      for (const id of ['fx', 'banner', 'spotlight']) {
        $(id).innerHTML = '';
        $(id).classList.remove('show');
      }
    }

    start() {
      this.abandon();
      const name = $('setup-name').value.trim() || 'Joueur';
      const opponents = Number($('setup-opponents').value);
      const delay = Number($('speed').value);
      const players = [{ name, controller: new HumanController(this) }];
      this.ai = [];
      for (let i = 1; i <= opponents; i++) {
        const c = new UU.AIController({ delay });
        this.ai.push(c);
        players.push({ name: opponents === 1 ? 'Ordinateur' : `Ordinateur ${i}`, controller: c });
      }
      const game = new UU.Game({
        players,
        reshuffleWhenEmpty: $('setup-reshuffle').checked,
        firstPlayer: $('setup-first').value === 'me' ? 0 : null,
      });
      this.game = game;
      this.human = game.players[0];
      this.resetHistory();
      for (const id of ['log', 'opponents', 'piles', 'me', 'feed']) $(id).innerHTML = '';
      $('setup').hidden = true;
      $('game').hidden = false;
      game.on((e) => this.onEvent(game, e));
      this.render();
      game.run().catch((err) => {
        console.error(err);
        this.toast('Erreur interne : ' + err.message);
      });
    }

    onEvent(game, e) {
      if (game !== this.game) return;
      if (e.type === 'private' && e.to === this.human) this.toast(e.text);
      if (e.type === 'private' && e.victim === this.human) this.toast(e.victimText);
      if (e.type === 'over') this.showResult(e.result);
      if (e.type === 'ask') this.acting = e.request.type === 'action' ? e.request.player : null;
      if (e.type === 'move') {
        this.moves.push(e);
        if (e.card.zone === 'stable') this.enteredOn.set(e.card.uid, game.turnNumber);
        // The Neighs are over once the played card leaves the "in play" zone.
        const last = this.feed[this.feed.length - 1];
        if (last && last.card === e.card && e.from.zone === 'limbo') last.settled = true;
      }
      if (e.type === 'log') {
        this.appendLog(e.entry);
        this.track(game, e.entry);
      }
      this.queueRender();
    }

    // Keeps the recent plays for the feed, the spotlight and the "last play" of each player.
    track(g, entry) {
      const last = this.feed[this.feed.length - 1];
      let item = null;
      if (entry.kind === 'play') {
        item = { player: entry.player, card: entry.card, turn: g.turnNumber, neighs: [], countered: false };
      } else if (entry.kind === 'neigh' && last && last.card) {
        if (entry.countered) last.countered = true;
        else last.neighs.push({ player: entry.player, card: entry.card });
        last.fresh = true;
        if (entry.player !== this.human) this.spot = last;
      } else if (entry.drew && entry.player === this.acting) {
        // The player drew a card instead of playing one.
        item = { player: entry.player, card: null, turn: g.turnNumber, neighs: [] };
      }
      if (item || entry.kind === 'turn') this.acting = null;
      if (!item) return;
      item.fresh = true;
      this.feed.push(item);
      if (this.feed.length > FEED_SIZE) this.feed.shift();
      this.lastPlay.set(item.player.index, item);
      if (item.card && item.player !== this.human) this.spot = item;
    }

    // A card counts as new until everyone has had a turn since it arrived.
    isFresh(card) {
      const g = this.game;
      const on = this.enteredOn.get(card.uid);
      return on > 0 && g.turnNumber - on < g.players.length;
    }

    queueRender() {
      if (this.renderQueued) return;
      this.renderQueued = true;
      requestAnimationFrame(() => {
        this.renderQueued = false;
        this.render();
        // Scroll only for new lines, so a reader scrolled up keeps their place.
        if (this.logGrew) {
          this.logGrew = false;
          const log = $('log');
          log.scrollTop = log.scrollHeight;
        }
      });
    }

    // Each turn gets its own group in the log, so it is easy to see what happened in it.
    appendLog(entry) {
      if (entry.kind === 'turn' || !this.logGroup) {
        if (this.logGroup) this.logGroup.parentNode.classList.add('past');
        const group = el('li', 'log-group');
        if (entry.player) group.style.setProperty('--pc', colorOf(entry.player));
        group.appendChild(el('div', 'log-head', escapeHtml(entry.kind === 'turn' ? entry.text : 'Mise en place')));
        this.logGroup = el('ol');
        group.appendChild(this.logGroup);
        $('log').appendChild(group);
        if (entry.kind === 'turn') {
          this.logGrew = true;
          return;
        }
      }
      this.logGroup.appendChild(el('li', 'log-' + entry.kind, escapeHtml(entry.text)));
      this.logGrew = true;
    }

    toast(text) {
      const t = $('toast');
      t.textContent = text;
      t.hidden = false;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => (t.hidden = true), 4000);
    }

    showModal(html) {
      $('modal-content').innerHTML = html;
      $('modal').hidden = false;
    }

    hideModal() {
      $('modal').hidden = true;
    }

    showCard(card) {
      const d = card.def;
      const html = `<div class="zoom">${this.cardHtml(card, 'large')}<div class="zoom-info"><h3>${escapeHtml(this.game.describe(card))}</h3><p class="zoom-type">${UU.TYPE_NAMES[d.type]}</p><p>${cardText(d.text)}</p>${this.stateNote(card)}</div></div>`;
      this.showModal(html);
    }

    stateNote(card) {
      const g = this.game;
      const notes = [];
      if (g.isPanda(card)) notes.push('Cette carte est un Panda (Pandamonium) : elle ne compte pas comme une Licorne.');
      else if (g.isBlinded(card)) notes.push('Lumière Aveuglante : cette Licorne est une Licorne Standard sans effet.');
      return notes.map((n) => `<p class="note">${n}</p>`).join('');
    }

    startPrompt(req, resolve) {
      this.request = req;
      this.resolve = resolve;
      this.selection = [];
      this.queueRender();
    }

    answer(value) {
      const resolve = this.resolve;
      this.request = null;
      this.resolve = null;
      this.selection = [];
      this.queueRender();
      if (resolve) resolve(value);
    }

    isOption(card) {
      const r = this.request;
      if (!r) return false;
      if (r.type === 'cards') return r.options.includes(card);
      if (r.type === 'action') return r.playable.includes(card);
      return false;
    }

    cardHtml(card, size) {
      const d = card.def;
      const g = this.game;
      const classes = ['card', 'type-' + d.type, size || 'medium'];
      if (d.color) classes.push('color-' + d.color);
      const panda = g.isPanda(card);
      if (panda) classes.push('panda');
      if (g.isBlinded(card)) classes.push('blinded');
      const name = escapeHtml(g.describe(card));
      const text = size === 'small' ? '' : `<div class="card-text">${cardText(d.text)}</div>`;
      const badge = panda ? '<span class="badge">Panda</span>' : '';
      return `<div class="${classes.join(' ')}" data-uid="${card.uid}"><div class="card-head"><span class="card-icon">${iconFor(d.type)}</span><span class="card-type">${UU.TYPE_NAMES[d.type]}</span>${badge}</div><div class="card-name">${name}</div>${text}</div>`;
    }

    cardEl(card, size) {
      const node = el('div', '', this.cardHtml(card, size)).firstChild;
      const req = this.request;
      if (this.isOption(card)) node.classList.add('selectable');
      if (this.selection.includes(card)) node.classList.add('selected');
      node.addEventListener('click', () => this.clickCard(card, req));
      node.title = `${this.game.describe(card)} : ${card.def.text}`;
      return node;
    }

    backEl(size) {
      return el('div', `card back ${size || 'small'}`, '<div class="back-mark">UU</div>');
    }

    // A late click on a card from an older prompt must not answer the current one.
    clickCard(card, req) {
      const r = this.request;
      if (r && r === req && this.isOption(card)) {
        if (r.type === 'action') {
          this.selection = this.selection[0] === card ? [] : [card];
          this.queueRender();
          return;
        }
        if (r.max === 1) {
          this.answer([card]);
          return;
        }
        const i = this.selection.indexOf(card);
        if (i >= 0) this.selection.splice(i, 1);
        else if (this.selection.length < r.max) this.selection.push(card);
        this.queueRender();
        return;
      }
      this.showCard(card);
    }

    render() {
      const g = this.game;
      if (!g) return;
      const before = this.measure();
      this.renderOpponents(g);
      this.renderPiles(g);
      this.renderStatus(g);
      this.renderFeed(g);
      this.renderPrompt(g);
      this.renderMe(g);
      this.renderBanner(g);
      this.renderSpotlight(g);
      this.fly(before);
    }

    // Where each card and each zone is on the screen, to animate the cards that moved.
    measure() {
      const cards = new Map();
      const anchors = new Map();
      for (const node of document.querySelectorAll('#game [data-zone] .card[data-uid]')) {
        const rect = node.getBoundingClientRect();
        if (rect.width) cards.set(node.dataset.uid, { node, rect, flying: node.getAnimations().some((a) => a.id === 'flight') });
      }
      for (const node of document.querySelectorAll('#game [data-anchor]')) {
        const rect = node.getBoundingClientRect();
        if (rect.width) anchors.set(node.dataset.anchor, { rect, card: node.classList.contains('card') });
      }
      return { cards, anchors };
    }

    // A zone that shows no card for this move, such as a hidden hand, still has a place on the screen.
    anchorBox(place, size, first, second) {
      const key = anchorKey(place.zone, place.owner);
      const a = first.anchors.get(key) || second.anchors.get(key);
      if (!a) return null;
      if (a.card) return a.rect;
      const w = size.width * 0.4;
      const h = size.height * 0.4;
      return { left: a.rect.left + a.rect.width / 2 - w / 2, top: a.rect.top + a.rect.height / 2 - h / 2, width: w, height: h };
    }

    // Each card that changed zone flies from its old place to its new one, one after the other.
    fly(before) {
      const moves = this.moves;
      this.moves = [];
      if (calm.matches) return;
      const after = this.measure();
      const flights = new Map();
      for (const m of moves) {
        // Cards created at the start of the game have no place to come from.
        if (!m.from.zone) continue;
        const uid = String(m.card.uid);
        // A card that went through the deck was shuffled, so it must not show where it came from.
        if (!flights.has(uid) || m.from.zone === 'deck') flights.set(uid, { card: m.card, from: m.from, shuffled: m.from.zone === 'deck' });
      }
      // A card still flying when the board changes again goes on from where it is.
      for (const [uid, b] of before.cards) {
        if (b.flying && !flights.has(uid) && after.cards.has(uid)) flights.set(uid, { resume: true });
      }
      const step = Math.min(110, 900 / Math.max(1, flights.size));
      const small = { width: 78, height: 104 };
      let i = 0;
      for (const [uid, f] of flights) {
        if (i >= MAX_FLIGHTS) break;
        const old = f.shuffled ? null : before.cards.get(uid);
        const now = after.cards.get(uid);
        const size = now ? now.rect : old ? old.rect : small;
        const from = old ? old.rect : this.anchorBox(f.from, size, before, after);
        const to = now ? now.rect : this.anchorBox({ zone: f.card.zone, owner: f.card.owner }, small, after, before);
        if (!from || !to || (Math.abs(from.left - to.left) < 2 && Math.abs(from.top - to.top) < 2)) continue;
        const delay = f.resume ? 0 : i * step;
        i++;
        if (now) this.flip(now.node, from, to, delay, !f.resume);
        else this.ghost(old ? old.node : null, f.card, from, to, delay);
      }
    }

    flip(node, from, to, delay, glow) {
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      const start = `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`;
      const duration = this.duration();
      node.animate(
        [
          { transformOrigin: '0 0', transform: start, zIndex: 5 },
          { transformOrigin: '0 0', transform: 'none', zIndex: 5 },
        ],
        { id: 'flight', duration, delay, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
      );
      if (glow) node.animate([{ boxShadow: '0 0 0 4px #ffd34d, 0 0 18px 6px #ffd34d' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 900, delay: delay + duration, easing: 'ease-out' });
    }

    // A card that is not shown where it goes, such as a card drawn by an opponent, flies as a copy and fades out.
    ghost(node, card, from, to, delay) {
      const shown = node || PUBLIC_ZONES.includes(card.zone) || (card.zone === 'hand' && card.owner === this.human.index);
      const copy = node ? node.cloneNode(true) : shown ? el('div', '', this.cardHtml(card, 'small')).firstChild : this.backEl('small');
      copy.classList.remove('selectable', 'selected', 'fresh');
      copy.classList.add('ghost');
      Object.assign(copy.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
      $('fx').appendChild(copy);
      const end = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
      const flight = copy.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: end, opacity: 0.9, offset: 0.85 },
          { transform: end, opacity: 0 },
        ],
        { duration: this.duration() * 1.2, delay, easing: 'cubic-bezier(0.3, 0.6, 0.2, 1)', fill: 'both' },
      );
      flight.onfinish = () => copy.remove();
    }

    countLine(g, p) {
      const n = g.unicornCount(p);
      const old = this.counts.get(p.index);
      this.counts.set(p.index, n);
      const bump = old === undefined || old === n ? '' : n > old ? ' bump-up' : ' bump-down';
      return `<span class="count${n >= g.winTarget - 1 ? ' danger' : ''}${bump}">${n} / ${g.winTarget} Licornes</span>`;
    }

    renderStable(container, p, size) {
      const g = this.game;
      const row = el('div', 'stable');
      row.dataset.zone = 'stable';
      row.dataset.anchor = anchorKey('stable', p.index);
      if (p.stable.length === 0) row.appendChild(el('div', 'empty', 'Écurie vide'));
      const unicorns = p.stable.filter((c) => g.isUnicornType(c));
      const others = p.stable.filter((c) => !g.isUnicornType(c));
      for (const c of unicorns.concat(others)) {
        const node = this.cardEl(c, size);
        if (this.isFresh(c)) node.classList.add('fresh');
        row.appendChild(node);
      }
      container.appendChild(row);
    }

    // What the player did in their last action phase, as a reminder next to their Stable.
    lastPlayLine(p) {
      const item = this.lastPlay.get(p.index);
      if (!item) return null;
      const line = el('div', 'last-play', `Tour ${item.turn} : `);
      if (!item.card) {
        line.appendChild(document.createTextNode('a pioché au lieu de jouer'));
        return line;
      }
      line.appendChild(document.createTextNode('a joué '));
      const chip = el('button', `chip type-${item.card.def.type}`, escapeHtml(this.game.describe(item.card)));
      chip.type = 'button';
      chip.addEventListener('click', () => this.showCard(item.card));
      line.appendChild(chip);
      if (item.countered) line.appendChild(el('span', 'outcome bad', 'contrée'));
      else if (item.neighs.length && item.settled) line.appendChild(el('span', 'outcome', 'Huuue contré'));
      return line;
    }

    renderOpponents(g) {
      const box = $('opponents');
      box.innerHTML = '';
      for (const p of g.othersOf(this.human)) {
        const panel = el('div', 'player');
        panel.style.setProperty('--pc', colorOf(p));
        if (g.turn && g.turn.player === p) panel.classList.add('active');
        if (this.request && this.request.type === 'player' && this.request.options.includes(p)) panel.classList.add('selectable');
        const visible = g.hasInStable(p, 'nanny_cam');
        const head = el('div', 'player-head', `${nameTag(p)}${this.countLine(g, p)}<span class="hand-count" data-anchor="${anchorKey('hand', p.index)}">${plural(p.hand.length, 'carte')} en main${visible ? ' (visible)' : ''}</span>`);
        panel.appendChild(head);
        const lastPlay = this.lastPlayLine(p);
        if (lastPlay) panel.appendChild(lastPlay);
        if (visible && p.hand.length) {
          const hand = el('div', 'stable hand-visible');
          hand.dataset.zone = 'hand';
          for (const c of p.hand) hand.appendChild(this.cardEl(c, 'small'));
          panel.appendChild(hand);
        }
        this.renderStable(panel, p, 'small');
        if (g.pending && g.pending.player === p) panel.appendChild(el('div', 'thinking', 'réfléchit<span class="dots"><i></i><i></i><i></i></span>'));
        box.appendChild(panel);
      }
    }

    renderPiles(g) {
      const box = $('piles');
      box.innerHTML = '';
      box.dataset.zone = 'piles';
      const deck = el('div', 'pile');
      const back = this.backEl('small');
      back.dataset.anchor = 'deck';
      deck.appendChild(back);
      deck.appendChild(el('div', 'pile-label', `Paquet<br>${plural(g.deck.length, 'carte')}`));
      box.appendChild(deck);

      box.appendChild(this.pileEl('Défausse', 'discard', g.discardPile, 'carte'));
      box.appendChild(this.pileEl('Nurserie', 'nursery', g.nursery, 'bébé'));

      if (g.limbo.length) {
        const play = el('div', 'pile in-play');
        play.dataset.anchor = 'limbo';
        for (const c of g.limbo) play.appendChild(this.cardEl(c, 'small'));
        play.appendChild(el('div', 'pile-label', 'En cours de résolution'));
        box.appendChild(play);
      }
    }

    pileEl(title, zone, cards, word) {
      const pile = el('div', 'pile clickable');
      const top = cards[cards.length - 1];
      const card = top ? el('div', '', this.cardHtml(top, 'small')).firstChild : el('div', 'card small empty-pile', '');
      card.dataset.anchor = zone;
      pile.appendChild(card);
      pile.appendChild(el('div', 'pile-label', `${title}<br>${plural(cards.length, word)}`));
      pile.addEventListener('click', () => this.showZone(title, cards));
      return pile;
    }

    showZone(title, cards) {
      const list = cards
        .slice()
        .reverse()
        .map((c) => this.cardHtml(c, 'medium'))
        .join('');
      this.showModal(`<h2>${title}</h2><div class="zone-list">${list || '<p>Aucune carte.</p>'}</div>`);
    }

    renderStatus(g) {
      const box = $('status');
      if (g.result) {
        box.innerHTML = '<strong>Partie terminée.</strong>';
        return;
      }
      if (!g.turn) {
        box.textContent = 'Mise en place…';
        return;
      }
      const p = g.turn.player;
      const who = p === this.human ? `<span class="who" style="--pc: ${colorOf(p)}">Votre tour</span>` : `Tour de ${nameTag(p)}`;
      const extra = g.turn.maxPlays > 1 ? `<span class="extra">${g.turn.maxPlays} cartes à jouer</span>` : '';
      const now = PHASE_STEPS.findIndex(([key]) => key === g.turn.phase);
      // The current phase only pops when it has just changed.
      const changed = `${g.turnNumber}:${g.turn.phase}` !== this.shownPhase;
      this.shownPhase = `${g.turnNumber}:${g.turn.phase}`;
      const steps = PHASE_STEPS.map(([key, label], i) => {
        const cls = i < now ? 'done' : i === now ? `current${changed ? ' enter' : ''}` : '';
        return `<li class="${cls}" title="${PHASES[key]}">${label}</li>`;
      }).join('');
      box.innerHTML = `<span class="turn-no">Tour ${g.turnNumber}</span> <strong>${who}</strong><ol class="phases">${steps}</ol>${extra}`;
    }

    // The recent plays of every player, newest first.
    renderFeed(g) {
      const box = $('feed');
      box.innerHTML = '';
      box.hidden = this.feed.length === 0;
      if (box.hidden) return;
      box.appendChild(el('h3', 'zone-title', 'Dernières actions'));
      const row = el('div', 'feed-row');
      for (const item of this.feed.slice().reverse()) {
        const tile = el('div', 'tile');
        tile.style.setProperty('--pc', colorOf(item.player));
        if (item.fresh) tile.classList.add('enter');
        if (item === this.feed[this.feed.length - 1]) tile.classList.add('latest');
        item.fresh = false;
        tile.appendChild(el('div', 'tile-head', nameTag(item.player)));
        if (item.card) {
          const card = this.cardEl(item.card, 'small');
          tile.appendChild(card);
          if (item.countered) card.appendChild(el('div', 'stamp', 'Contrée'));
          for (const n of item.neighs) tile.appendChild(el('div', 'tile-neigh', `${escapeHtml(n.card.def.name)} : ${escapeHtml(n.player.name)}`));
        } else {
          tile.appendChild(this.backEl('small'));
          tile.appendChild(el('div', 'tile-neigh drew', 'a pioché'));
        }
        tile.appendChild(el('div', 'tile-turn', `tour ${item.turn}`));
        row.appendChild(tile);
      }
      box.appendChild(row);
    }

    renderBanner(g) {
      if (!g.turn || g.result || this.turnShown === g.turnNumber) return;
      this.turnShown = g.turnNumber;
      const p = g.turn.player;
      const box = $('banner');
      box.style.setProperty('--pc', colorOf(p));
      box.innerHTML = `<span class="banner-turn">Tour ${g.turnNumber}</span><span class="banner-who">${p === this.human ? 'À vous de jouer !' : escapeHtml(p.name)}</span>`;
      if (!calm.matches) replay(box, 'show');
    }

    // The card an opponent just played shows big in the middle of the screen for a moment.
    // It is skipped while the player is asked about a Neigh, because the prompt already shows the cards.
    renderSpotlight(g) {
      const item = this.spot;
      this.spot = null;
      if (!item || calm.matches || (this.request && this.request.type === 'neigh')) return;
      const box = $('spotlight');
      box.innerHTML = '';
      box.style.setProperty('--pc', colorOf(item.player));
      box.style.setProperty('--hold', `${Math.min(2600, Math.max(1100, Number($('speed').value) * 2.2))}ms`);
      box.appendChild(el('div', 'spot-caption', `${nameTag(item.player)} joue`));
      const card = el('div', '', this.cardHtml(item.card, 'large')).firstChild;
      box.appendChild(card);
      const neigh = item.neighs[item.neighs.length - 1];
      if (item.countered) card.appendChild(el('div', 'stamp', 'Contrée'));
      else if (neigh) box.appendChild(el('div', 'spot-neigh', `${escapeHtml(neigh.card.def.name)} de ${escapeHtml(neigh.player.name)} !`));
      replay(box, 'show');
    }

    renderPrompt(g) {
      const box = $('prompt');
      box.innerHTML = '';
      box.classList.remove('active', 'alert');
      const r = this.request;
      if (!r) {
        this.shownRequest = null;
        if (g.pending && g.pending.player !== this.human && !g.result) box.appendChild(el('p', 'waiting', `${escapeHtml(g.pending.player.name)} réfléchit…`));
        return;
      }
      box.classList.add('active');
      box.classList.toggle('alert', r.type === 'neigh');
      if (r !== this.shownRequest) {
        this.shownRequest = r;
        if (!calm.matches) replay(box, 'enter');
      }
      const actions = el('div', 'prompt-actions');
      const button = (label, fn, cls) => {
        const b = el('button', cls || '', escapeHtml(label));
        b.type = 'button';
        // A late second click must not answer the next request.
        b.addEventListener('click', () => {
          if (r === this.request) fn();
        });
        actions.appendChild(b);
        return b;
      };

      if (r.type === 'neigh') {
        const target = r.target;
        let text = `${escapeHtml(r.by.name)} joue cette carte. Voulez-vous la contrer ?`;
        if (target) {
          const owner = target.owner === this.human.index ? 'votre carte' : `la carte de ${escapeHtml(g.ownerOf(target).name)}`;
          text = `${escapeHtml(r.by.name)} joue ${escapeHtml(r.card.def.name)} contre ${owner} ${escapeHtml(g.describe(target))}. Voulez-vous contrer ce ${escapeHtml(r.card.def.name)} ?`;
        }
        box.appendChild(el('p', 'prompt-text', text));
        const tray = el('div', 'tray');
        if (target) tray.appendChild(this.cardEl(target, 'medium'));
        tray.appendChild(this.cardEl(r.card, 'large'));
        box.appendChild(tray);
        const seen = new Set();
        for (const c of r.options) {
          if (seen.has(c.def.key)) continue;
          seen.add(c.def.key);
          button(`Jouer ${c.def.name}`, () => this.answer(c), 'primary');
        }
        button('Laisser passer', () => this.answer(null));
        box.appendChild(actions);
        return;
      }

      box.appendChild(el('p', 'prompt-text', escapeHtml(r.prompt || '')));

      switch (r.type) {
        case 'confirm':
          if (r.source) {
            const tray = el('div', 'tray');
            tray.appendChild(this.cardEl(r.source, 'small'));
            if (r.card && r.card !== r.source) tray.appendChild(this.cardEl(r.card, 'small'));
            box.appendChild(tray);
          }
          button('Oui', () => this.answer(true), 'primary');
          button('Non', () => this.answer(false));
          break;
        case 'player':
          for (const p of r.options) button(p === this.human ? `${p.name} (vous)` : p.name, () => this.answer(p), 'primary');
          if (r.optional) button('Passer', () => this.answer(null));
          break;
        case 'cards': {
          const tray = el('div', 'tray');
          for (const c of r.options) tray.appendChild(this.cardEl(c, r.options.length > 8 ? 'small' : 'medium'));
          box.appendChild(tray);
          if (r.max > 1) {
            const n = this.selection.length;
            const range = r.min === r.max ? `${r.min}` : `${r.min} à ${r.max}`;
            box.appendChild(el('p', 'hint', `Sélection : ${n} (attendu : ${range}).`));
            // The selection may have changed since this render.
            const ok = button(
              'Valider',
              () => {
                const k = this.selection.length;
                if (k >= r.min && k <= r.max) this.answer(this.selection.slice());
              },
              'primary',
            );
            ok.disabled = n < r.min || n > r.max;
          }
          if (r.min === 0) button(r.max > 1 ? 'Ne rien choisir' : 'Passer', () => this.answer([]));
          break;
        }
        case 'action': {
          const sel = this.selection[0];
          if (sel) {
            const tray = el('div', 'tray');
            tray.appendChild(this.cardEl(sel, 'large'));
            box.appendChild(tray);
            button(`Jouer ${this.game.describe(sel)}`, () => this.answer({ type: 'play', card: sel }), 'primary');
          } else if (r.playable.length) {
            box.appendChild(el('p', 'hint', 'Cliquez sur une carte jouable de votre main (bordure dorée).'));
          } else {
            box.appendChild(el('p', 'hint', 'Aucune carte de votre main ne peut être jouée.'));
          }
          if (r.canDraw) button('Piocher 1 carte', () => this.answer({ type: 'draw' }), sel ? '' : 'primary');
          if (r.canStop) button('Terminer la Phase d\'Action', () => this.answer({ type: 'stop' }));
          break;
        }
      }
      box.appendChild(actions);
    }

    renderMe(g) {
      const box = $('me');
      box.innerHTML = '';
      const p = this.human;
      const head = el('div', 'player-head', `${nameTag(p)}${this.countLine(g, p)}`);
      box.style.setProperty('--pc', colorOf(p));
      box.classList.toggle('active', !!(g.turn && g.turn.player === p));
      box.appendChild(head);
      box.appendChild(el('h3', 'zone-title', 'Votre Écurie'));
      this.renderStable(box, p, 'medium');
      box.appendChild(el('h3', 'zone-title', `Votre main (${p.hand.length}${g.hasInStable(p, 'nanny_cam') ? ', visible par tous' : ''})`));
      const hand = el('div', 'hand');
      hand.dataset.zone = 'hand';
      hand.dataset.anchor = anchorKey('hand', p.index);
      for (const c of p.hand) hand.appendChild(this.cardEl(c, 'medium'));
      if (p.hand.length === 0) hand.appendChild(el('div', 'empty', 'Aucune carte'));
      box.appendChild(hand);
    }

    showResult(result) {
      const g = this.game;
      let title;
      if (!result.winner) title = 'Personne ne gagne : égalité parfaite.';
      else if (result.winner === this.human) title = 'Vous avez gagné !';
      else title = `${escapeHtml(result.winner.name)} a gagné.`;
      const why = result.reason === 'deck' ? 'Le paquet est épuisé : la victoire revient au joueur qui a le plus de Licornes.' : `Il fallait ${g.winTarget} Licornes dans son Écurie.`;
      const tie = result.tieBreak ? '<p>Égalité départagée par le nombre de lettres dans les noms des Licornes.</p>' : '';
      const rows = g.players
        .map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${g.unicornCount(p)}</td><td>${g.unicornLetters(p)}</td></tr>`)
        .join('');
      this.showModal(`<h2>${title}</h2><p>${why}</p>${tie}<table class="score"><thead><tr><th>Joueur</th><th>Licornes</th><th>Lettres</th></tr></thead><tbody>${rows}</tbody></table><p><button type="button" class="primary" id="again">Rejouer</button></p>`);
      $('again').addEventListener('click', () => {
        this.hideModal();
        this.start();
      });
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    UU.ui = new UI();
  });
})(window);
