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
      this.bind();
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
      $('log').innerHTML = '';
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
      if (e.type === 'log') this.appendLog(e.entry);
      this.queueRender();
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

    appendLog(entry) {
      $('log').appendChild(el('li', 'log-' + entry.kind, escapeHtml(entry.text)));
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
      return `<div class="${classes.join(' ')}"><div class="card-head"><span class="card-icon">${iconFor(d.type)}</span><span class="card-type">${UU.TYPE_NAMES[d.type]}</span>${badge}</div><div class="card-name">${name}</div>${text}</div>`;
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
      this.renderOpponents(g);
      this.renderPiles(g);
      this.renderStatus(g);
      this.renderPrompt(g);
      this.renderMe(g);
    }

    countLine(g, p) {
      const n = g.unicornCount(p);
      return `<span class="count${n >= g.winTarget - 1 ? ' danger' : ''}">${n} / ${g.winTarget} Licornes</span>`;
    }

    renderStable(container, p, size) {
      const g = this.game;
      const row = el('div', 'stable');
      if (p.stable.length === 0) row.appendChild(el('div', 'empty', 'Écurie vide'));
      const unicorns = p.stable.filter((c) => g.isUnicornType(c));
      const others = p.stable.filter((c) => !g.isUnicornType(c));
      for (const c of unicorns.concat(others)) row.appendChild(this.cardEl(c, size));
      container.appendChild(row);
    }

    renderOpponents(g) {
      const box = $('opponents');
      box.innerHTML = '';
      for (const p of g.othersOf(this.human)) {
        const panel = el('div', 'player');
        if (g.turn && g.turn.player === p) panel.classList.add('active');
        if (this.request && this.request.type === 'player' && this.request.options.includes(p)) panel.classList.add('selectable');
        const visible = g.hasInStable(p, 'nanny_cam');
        const head = el('div', 'player-head', `<strong>${escapeHtml(p.name)}</strong>${this.countLine(g, p)}<span class="hand-count">${plural(p.hand.length, 'carte')} en main${visible ? ' (visible)' : ''}</span>`);
        panel.appendChild(head);
        if (visible && p.hand.length) {
          const hand = el('div', 'stable hand-visible');
          for (const c of p.hand) hand.appendChild(this.cardEl(c, 'small'));
          panel.appendChild(hand);
        }
        this.renderStable(panel, p, 'small');
        if (g.pending && g.pending.player === p) panel.appendChild(el('div', 'thinking', 'réfléchit…'));
        box.appendChild(panel);
      }
    }

    renderPiles(g) {
      const box = $('piles');
      box.innerHTML = '';
      const deck = el('div', 'pile');
      deck.appendChild(this.backEl('small'));
      deck.appendChild(el('div', 'pile-label', `Paquet<br>${plural(g.deck.length, 'carte')}`));
      box.appendChild(deck);

      box.appendChild(this.pileEl('Défausse', g.discardPile, 'carte'));
      box.appendChild(this.pileEl('Nurserie', g.nursery, 'bébé'));

      if (g.limbo.length) {
        const play = el('div', 'pile in-play');
        for (const c of g.limbo) play.appendChild(this.cardEl(c, 'small'));
        play.appendChild(el('div', 'pile-label', 'En cours'));
        box.appendChild(play);
      }
    }

    pileEl(title, cards, word) {
      const pile = el('div', 'pile clickable');
      const top = cards[cards.length - 1];
      pile.appendChild(top ? el('div', '', this.cardHtml(top, 'small')).firstChild : el('div', 'card small empty-pile', ''));
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
      const who = g.turn.player === this.human ? 'Votre tour' : `Tour de ${escapeHtml(g.turn.player.name)}`;
      const extra = g.turn.maxPlays > 1 ? ` (${g.turn.maxPlays} cartes possibles)` : '';
      box.innerHTML = `<span class="turn-no">Tour ${g.turnNumber}</span> <strong>${who}</strong> <span class="phase">${PHASES[g.turn.phase] || ''}${extra}</span>`;
    }

    renderPrompt(g) {
      const box = $('prompt');
      box.innerHTML = '';
      box.classList.remove('active');
      const r = this.request;
      if (!r) {
        if (g.pending && g.pending.player !== this.human && !g.result) box.appendChild(el('p', 'waiting', `${escapeHtml(g.pending.player.name)} réfléchit…`));
        return;
      }
      box.classList.add('active');
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
      const head = el('div', 'player-head', `<strong>${escapeHtml(p.name)}</strong>${this.countLine(g, p)}`);
      box.classList.toggle('active', !!(g.turn && g.turn.player === p));
      box.appendChild(head);
      box.appendChild(el('h3', 'zone-title', 'Votre Écurie'));
      this.renderStable(box, p, 'medium');
      box.appendChild(el('h3', 'zone-title', `Votre main (${p.hand.length}${g.hasInStable(p, 'nanny_cam') ? ', visible par tous' : ''})`));
      const hand = el('div', 'hand');
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
