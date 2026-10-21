(function (root) {
  'use strict';

  const UU = (root.UU = root.UU || {});

  const HAND_LIMIT = 7;
  const UNICORN_TYPES = new Set(['baby', 'basic', 'magical']);

  // Thrown to end the game from anywhere in an effect chain.
  class GameOver {
    constructor(result) {
      this.result = result;
    }
  }

  // Seeded, so that tests can replay the same game.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function letterCount(name) {
    return (name.match(/\p{L}/gu) || []).length;
  }

  class Game {
    constructor(options) {
      this.options = Object.assign({ seed: null, reshuffleWhenEmpty: false, firstPlayer: null }, options);
      this.rng = this.options.seed === null ? Math.random : makeRng(this.options.seed);
      this.players = options.players.map((p, index) => ({
        index,
        name: p.name,
        controller: p.controller,
        hand: [],
        stable: [],
      }));
      this.deck = [];
      this.discardPile = [];
      this.nursery = [];
      this.limbo = [];
      this.box = [];
      this.entries = [];
      this.listeners = [];
      this.winTarget = this.players.length >= 6 ? 6 : 7;
      this.current = 0;
      this.turn = null;
      this.turnNumber = 0;
      this.extraTurns = 0;
      this.deckRanOut = false;
      this.pending = null;
      this.result = null;
      this.deferred = null;
      this.nextUid = 1;
      this.abandoned = false;
    }

    on(listener) {
      this.listeners.push(listener);
    }

    // An abandoned game just stops at its next decision.
    abandon() {
      this.abandoned = true;
      this.listeners = [];
    }

    emit(event) {
      for (const listener of this.listeners) listener(event || { type: 'update' });
    }

    log(text, kind) {
      const entry = { text, kind: kind || 'info' };
      this.entries.push(entry);
      this.emit({ type: 'log', entry });
    }

    random(n) {
      return Math.floor(this.rng() * n);
    }

    shuffle(cards) {
      for (let i = cards.length - 1; i > 0; i--) {
        const j = this.random(i + 1);
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
    }

    zoneArray(zone, owner) {
      switch (zone) {
        case 'deck':
          return this.deck;
        case 'discard':
          return this.discardPile;
        case 'nursery':
          return this.nursery;
        case 'limbo':
          return this.limbo;
        case 'box':
          return this.box;
        case 'hand':
          return this.players[owner].hand;
        case 'stable':
          return this.players[owner].stable;
        default:
          throw new Error('Unknown zone ' + zone);
      }
    }

    // The only place that moves a card between zones.
    move(card, zone, player) {
      if (card.zone) {
        const from = this.zoneArray(card.zone, card.owner);
        const i = from.indexOf(card);
        if (i < 0) throw new Error('Card ' + card.def.key + ' is not in its zone');
        from.splice(i, 1);
      }
      card.zone = zone;
      card.owner = player === undefined || player === null ? null : player.index;
      this.zoneArray(zone, card.owner).push(card);
      this.emit();
    }

    ownerOf(card) {
      return card.owner === null ? null : this.players[card.owner];
    }

    playersFrom(player) {
      const n = this.players.length;
      const list = [];
      for (let i = 0; i < n; i++) list.push(this.players[(player.index + i) % n]);
      return list;
    }

    othersOf(player) {
      return this.playersFrom(player).slice(1);
    }

    isUnicornType(card) {
      return UNICORN_TYPES.has(card.def.type);
    }

    hasInStable(player, key) {
      return player.stable.some((c) => c.def.key === key);
    }

    isPanda(card) {
      return card.zone === 'stable' && this.isUnicornType(card) && this.hasInStable(this.ownerOf(card), 'pandamonium');
    }

    // What the card texts call a "Unicorn card", which leaves out Pandas.
    isUnicorn(card) {
      return this.isUnicornType(card) && !this.isPanda(card);
    }

    // Blinding Light turns off the effects of the Unicorns in its Stable.
    effectActive(card) {
      if (card.zone !== 'stable') return false;
      if (this.isUnicornType(card) && this.hasInStable(this.ownerOf(card), 'blinding_light')) return false;
      return true;
    }

    isBlinded(card) {
      return card.zone === 'stable' && this.isUnicornType(card) && !this.effectActive(card);
    }

    activeInStable(player, key) {
      return player.stable.some((c) => c.def.key === key && this.effectActive(c));
    }

    unicornWorth(card) {
      if (!this.isUnicorn(card)) return 0;
      return card.def.key === 'ginormous' && this.effectActive(card) ? 2 : 1;
    }

    unicornCount(player) {
      return player.stable.reduce((sum, c) => sum + this.unicornWorth(c), 0);
    }

    unicornLetters(player) {
      return player.stable.filter((c) => this.isUnicorn(c)).reduce((sum, c) => sum + letterCount(c.def.name), 0);
    }

    // Queen Bee keeps Basic Unicorns out of every other Stable.
    // It goes by the printed type, so a Basic Unicorn that is a Panda is still blocked.
    canEnter(card, player) {
      if (card.def.type !== 'basic') return true;
      return !this.players.some((q) => q !== player && this.activeInStable(q, 'queen_bee'));
    }

    canDestroy(card, source) {
      if (card.zone !== 'stable') return false;
      const owner = this.ownerOf(card);
      if (this.isUnicorn(card) && this.hasInStable(owner, 'rainbow_aura')) return false;
      if (card.def.key === 'kittencorn' && this.effectActive(card) && source && source.def.type === 'magic') return false;
      return true;
    }

    othersStable(player) {
      return this.othersOf(player).flatMap((q) => q.stable);
    }

    destroyable(actor, filter, source) {
      return this.othersStable(actor).filter((c) => filter(c) && this.canDestroy(c, source));
    }

    stealable(actor, filter) {
      return this.othersStable(actor).filter((c) => filter(c) && this.canEnter(c, actor));
    }

    isNeighCard(card) {
      return card.def.type === 'instant';
    }

    neighOptions(player) {
      if (this.hasInStable(player, 'slowdown') || this.activeInStable(player, 'ginormous')) return [];
      return player.hand.filter((c) => this.isNeighCard(c));
    }

    describe(card) {
      return card.def.label || card.def.name;
    }

    async ask(player, request) {
      if (this.abandoned) return new Promise(() => {});
      request.player = player;
      this.pending = request;
      this.emit({ type: 'ask', request });
      const answer = await player.controller.decide(this, player, request);
      this.pending = null;
      this.emit();
      return answer;
    }

    async confirm(player, prompt, extra) {
      const answer = await this.ask(player, Object.assign({ type: 'confirm', prompt }, extra));
      return answer === true;
    }

    async chooseCards(player, opts) {
      const options = opts.options;
      const max = Math.min(opts.max === undefined ? 1 : opts.max, options.length);
      const min = Math.min(opts.min === undefined ? max : opts.min, max);
      if (max === 0) return [];
      if (min === options.length && !opts.alwaysAsk) return options.slice();
      const answer = await this.ask(player, Object.assign({}, opts, { type: 'cards', options, min, max }));
      const picked = Array.isArray(answer) ? answer.filter((c, i) => options.includes(c) && answer.indexOf(c) === i) : [];
      if (picked.length < min || picked.length > max) throw new Error('Invalid card choice from ' + player.name);
      return picked;
    }

    async chooseCard(player, opts) {
      const picked = await this.chooseCards(player, Object.assign({}, opts, { min: opts.optional ? 0 : 1, max: 1 }));
      return picked[0] || null;
    }

    async choosePlayer(player, opts) {
      const options = opts.options;
      if (options.length === 0) return null;
      if (options.length === 1 && !opts.optional && !opts.alwaysAsk) return options[0];
      const answer = await this.ask(player, Object.assign({}, opts, { type: 'player', options }));
      if (answer === null && opts.optional) return null;
      if (!options.includes(answer)) throw new Error('Invalid player choice from ' + player.name);
      return answer;
    }

    // Returns how many cards were really drawn, since the deck can run out.
    async draw(player, n) {
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        if (this.deck.length === 0) {
          if (this.options.reshuffleWhenEmpty && this.discardPile.length > 0) {
            this.shuffleDiscardIntoDeck();
          } else {
            if (!this.deckRanOut) this.log('Le paquet est épuisé.', 'important');
            this.deckRanOut = true;
            break;
          }
        }
        this.move(this.deck[this.deck.length - 1], 'hand', player);
        drawn++;
      }
      if (drawn > 0) this.log(`${player.name} pioche ${UU.plural(drawn, 'carte')}.`);
      return drawn;
    }

    shuffleDiscardIntoDeck() {
      for (const c of this.discardPile.slice()) this.move(c, 'deck');
      this.shuffle(this.deck);
      this.log('La défausse est mélangée dans le paquet.');
    }

    // The player picks which cards to discard, and discards fewer if the hand is short.
    // `opts.options` limits the choice to some cards of the hand.
    async discard(player, n, opts) {
      const options = (opts && opts.options) || player.hand.slice();
      const count = Math.min(n, options.length);
      if (count === 0) return 0;
      const prompt = (opts && opts.prompt) || `Défaussez ${UU.plural(count, 'carte')}.`;
      const cards = await this.chooseCards(player, Object.assign({ purpose: 'discard' }, opts, { prompt, options, min: count, max: count }));
      for (const c of cards) this.discardCard(player, c);
      return count;
    }

    discardCard(player, card) {
      this.move(card, 'discard');
      this.log(`${player.name} défausse ${this.describe(card)}.`);
    }

    // A triggered effect waits for the effect that caused it, then resolves in the next link.
    async trigger(fn) {
      if (this.deferred) this.deferred.push(fn);
      else await fn();
    }

    // Runs one link of the effect chain, such as all the effects of one card.
    // Whatever it triggers becomes the next link, until nothing is left.
    async simultaneously(body) {
      if (this.deferred) return body();
      let link = [body];
      while (link.length > 0) {
        this.deferred = [];
        let next;
        try {
          for (const fn of link) await fn();
        } finally {
          next = this.deferred;
          this.deferred = null;
        }
        link = next;
      }
    }

    async enterStable(card, player) {
      this.move(card, 'stable', player);
      this.log(`${this.describe(card)} entre dans l'Écurie de ${player.name}.`);
      await this.afterEnter(card, player);
    }

    // The entering effect goes before Barbed Wire, so it can't take back the card Barbed Wire discards.
    async afterEnter(card, player) {
      const active = this.effectActive(card);
      if (active && card.def.onEnter) await this.trigger(() => card.def.onEnter(this, player, card));
      if (this.isUnicornType(card)) await this.barbedWire(player);
      await this.settle();
    }

    // Barbed Wire acts on the player, so Pandas trigger it too.
    async barbedWire(player) {
      for (const c of player.stable) {
        if (c.def.key === 'barbed_wire') {
          await this.trigger(() => this.discard(player, 1, { prompt: 'Fils Barbelés : défaussez 1 carte.', source: c }));
        }
      }
    }

    // Targets chosen together keep their state for the whole link, even if Blinding Light or Pandamonium leaves.
    snapshot(card) {
      return { active: this.effectActive(card), unicorn: this.isUnicorn(card) };
    }

    // Black Knight or Phoenix may keep the card in place.
    // That still counts as done, so a "then" part still happens.
    async leaveStable(card, reason, snap) {
      const owner = this.ownerOf(card);
      const state = snap || this.snapshot(card);
      const active = state.active;

      if (reason === 'destroy' && state.unicorn) {
        const knight = owner.stable.find((c) => c !== card && c.def.key === 'black_knight' && this.effectActive(c));
        if (knight) {
          const swap = await this.confirm(owner, `${this.describe(card)} va être détruite. Sacrifier Licorne Chevalier Noir à la place ?`, {
            purpose: 'black_knight',
            card,
            source: knight,
          });
          if (swap) {
            this.log(`${owner.name} sacrifie Licorne Chevalier Noir pour protéger ${this.describe(card)}.`);
            await this.leaveStable(knight, 'sacrifice');
            return true;
          }
        }
      }

      if ((reason === 'destroy' || reason === 'sacrifice') && card.def.key === 'phoenix' && active && owner.hand.length > 0) {
        const keep = await this.confirm(owner, 'Licorne Phénix va quitter votre Écurie. Défausser 1 carte à la place ?', {
          purpose: 'phoenix',
          card,
        });
        if (keep) {
          await this.discard(owner, 1, { prompt: 'Licorne Phénix : défaussez 1 carte.' });
          this.log('Licorne Phénix reste dans son Écurie.');
          return true;
        }
      }

      const verbs = { destroy: 'est détruite', sacrifice: 'est sacrifiée', return: 'retourne en main' };
      if (card.def.type === 'baby') {
        this.move(card, 'nursery');
        this.log(`${this.describe(card)} de ${owner.name} ${verbs[reason]} et retourne dans la Nurserie.`);
      } else if (reason === 'return') {
        this.move(card, 'hand', owner);
        this.log(`${this.describe(card)} retourne dans la main de ${owner.name}.`);
      } else if (active && card.def.flying) {
        this.move(card, 'hand', owner);
        this.log(`${this.describe(card)} de ${owner.name} ${verbs[reason]} et retourne dans sa main.`);
      } else {
        this.move(card, 'discard');
        this.log(`${this.describe(card)} de ${owner.name} ${verbs[reason]}.`);
      }

      if (this.isUnicornType(card)) await this.barbedWire(owner);
      await this.settle();

      if (active && card.def.key === 'stabby' && reason !== 'return') {
        await this.trigger(() => this.optionalDestroy(owner, (c) => this.isUnicorn(c), card, 'Licorne Tueuse : vous pouvez DÉTRUIRE 1 carte Licorne.'));
      }
      return true;
    }

    // A card chosen earlier may have left the Stable by now.
    async sacrifice(player, card) {
      if (card.zone !== 'stable' || card.owner !== player.index) return false;
      return this.leaveStable(card, 'sacrifice');
    }

    async destroy(card, snap) {
      return this.leaveStable(card, 'destroy', snap);
    }

    async returnToHand(card) {
      return this.leaveStable(card, 'return');
    }

    // Used by STEAL, Unicorn Swap and Re-Target.
    async transfer(card, to, text) {
      const from = this.ownerOf(card);
      this.move(card, 'stable', to);
      this.log(text);
      if (this.isUnicornType(card)) await this.barbedWire(from);
      await this.afterEnter(card, to);
    }

    async steal(player, card) {
      const from = this.ownerOf(card);
      await this.transfer(card, player, `${player.name} vole ${this.describe(card)} à ${from.name}.`);
    }

    async chooseSacrifice(player, filter, opts) {
      const options = player.stable.filter(filter);
      const card = await this.chooseCard(player, Object.assign({ purpose: 'sacrifice' }, opts, { options }));
      if (!card) return false;
      return this.sacrifice(player, card);
    }

    async chooseDestroy(player, filter, source, opts) {
      const options = this.destroyable(player, filter, source);
      const card = await this.chooseCard(player, Object.assign({ purpose: 'destroy', source }, opts, { options }));
      if (!card) return false;
      return this.destroy(card);
    }

    async optionalDestroy(player, filter, source, prompt) {
      return this.chooseDestroy(player, filter, source, { prompt, optional: true });
    }

    async chooseSteal(player, filter, source, opts) {
      const options = this.stealable(player, filter);
      const card = await this.chooseCard(player, Object.assign({ purpose: 'steal', source }, opts, { options }));
      if (!card) return false;
      await this.steal(player, card);
      return true;
    }

    // The card found is shown to everyone.
    async searchDeck(player, filter, source, prompt) {
      const options = this.deck.filter(filter);
      let found = null;
      if (options.length > 0) {
        found = await this.chooseCard(player, { prompt, options, optional: true, purpose: 'search', source });
      }
      if (found) {
        this.move(found, 'hand', player);
        this.log(`${player.name} prend ${this.describe(found)} dans le paquet et la montre à tous.`);
      } else {
        this.log(`${player.name} ne prend aucune carte dans le paquet.`);
      }
      this.shuffle(this.deck);
      this.log('Le paquet est mélangé.');
      return found;
    }

    async bring(player, card, from) {
      this.log(`${player.name} ajoute ${this.describe(card)} ${from} dans son Écurie.`);
      await this.enterStable(card, player);
    }

    // Tiny Stable applies at all times, not just at the start of a turn.
    async settle() {
      for (const p of this.playersFrom(this.players[this.current])) {
        if (this.hasInStable(p, 'tiny_stable') && this.unicornCount(p) > 5) {
          this.log(`Écurie Trop Petite : ${p.name} a plus de 5 Licornes.`);
          await this.chooseSacrifice(p, (c) => this.isUnicorn(c), { prompt: 'Écurie Trop Petite : sacrifiez 1 carte Licorne.' });
          return this.settle();
        }
      }
    }

    // A player only wins once the whole effect chain is over, never in the middle of an effect.
    // The rules don't say who wins when two players get there at once, so the active player goes first, then turn order.
    checkEnd() {
      const reached = this.playersFrom(this.players[this.current]).find((p) => this.unicornCount(p) >= this.winTarget);
      if (reached) this.finish([reached], 'unicorns');
      if (this.deckRanOut) this.finish(this.players, 'deck');
    }

    finish(candidates, reason) {
      const best = Math.max(...candidates.map((p) => this.unicornCount(p)));
      let tied = candidates.filter((p) => this.unicornCount(p) === best);
      let tieBreak = false;
      if (tied.length > 1) {
        tieBreak = true;
        const letters = Math.max(...tied.map((p) => this.unicornLetters(p)));
        tied = tied.filter((p) => this.unicornLetters(p) === letters);
      }
      const winner = tied.length === 1 ? tied[0] : null;
      this.result = { winner, reason, tieBreak };
      if (winner) {
        const how = reason === 'deck' ? 'Le paquet est épuisé. ' : '';
        this.log(`${how}${winner.name} remporte la partie avec ${this.unicornCount(winner)} Licornes !`, 'win');
      } else {
        this.log('Égalité parfaite : tout le monde a perdu. Dommage !', 'win');
      }
      throw new GameOver(this.result);
    }

    playableCards(player) {
      return player.hand.filter((c) => this.canPlay(player, c));
    }

    canPlay(player, card) {
      const def = card.def;
      switch (def.type) {
        case 'instant':
        case 'baby':
          return false;
        case 'basic':
        case 'magical':
          if (!this.canEnter(card, player)) return false;
          // You can't play a card if you can't carry out its mandatory effect.
          if (def.requirement && !this.hasInStable(player, 'blinding_light')) return def.requirement(this, player, card);
          return true;
        case 'upgrade':
          return !this.hasInStable(player, 'broken_stable');
        case 'downgrade':
          return true;
        case 'magic':
          return def.requirement ? def.requirement(this, player, card) : true;
        default:
          return false;
      }
    }

    // Returns true when the card is stopped.
    // When `card` is itself a Neigh, `target` is the card it was played against.
    async neighWindow(card, by, target) {
      if (this.hasInStable(by, 'yay')) return false;
      for (;;) {
        let neigh = null;
        let who = null;
        for (const q of this.othersOf(by)) {
          const options = this.neighOptions(q);
          if (options.length === 0) continue;
          const answer = await this.ask(q, { type: 'neigh', card, by, target, options });
          if (answer && options.includes(answer)) {
            neigh = answer;
            who = q;
            break;
          }
        }
        if (!neigh) return false;
        this.move(neigh, 'limbo', who);
        this.log(`${who.name} joue ${neigh.def.name} contre ${this.describe(card)} de ${by.name} !`, 'neigh');
        const stopped = neigh.def.key === 'super_neigh' ? false : await this.neighWindow(neigh, who, card);
        this.move(neigh, 'discard');
        if (!stopped) return true;
      }
    }

    async playCard(player, card) {
      this.move(card, 'limbo', player);
      this.log(`${player.name} joue ${this.describe(card)}.`, 'play');
      if (await this.neighWindow(card, player)) {
        this.move(card, 'discard');
        this.log(`${this.describe(card)} est contrée et part à la défausse.`, 'neigh');
        return;
      }
      await this.simultaneously(() => this.resolvePlayed(player, card));
    }

    async resolvePlayed(player, card) {
      const type = card.def.type;
      if (type === 'magic') {
        await card.def.play(this, player, card);
        if (card.zone === 'limbo') this.move(card, 'discard');
      } else if (type === 'upgrade' || type === 'downgrade') {
        const target = await this.choosePlayer(player, {
          prompt: `Dans quelle Écurie placer ${this.describe(card)} ?`,
          options: this.playersFrom(player),
          purpose: type === 'upgrade' ? 'upgrade_target' : 'downgrade_target',
          card,
          alwaysAsk: true,
        });
        await this.enterStable(card, target);
      } else {
        await this.enterStable(card, player);
      }
    }

    buildCards() {
      const two = this.players.length === 2;
      for (const def of UU.CARDS) {
        for (let i = 0; i < def.count; i++) {
          const card = { uid: this.nextUid++, def, zone: null, owner: null };
          if (def.type === 'baby') this.move(card, 'nursery');
          else if (two && def.notInTwoPlayer) this.move(card, 'box');
          else this.move(card, 'deck');
        }
      }
    }

    async setup() {
      const two = this.players.length === 2;
      this.buildCards();
      if (two) {
        for (const p of this.players) this.move(this.deck.find((c) => c.def.key === 'neigh'), 'hand', p);
      }
      this.shuffle(this.deck);

      const first = this.options.firstPlayer === null ? this.random(this.players.length) : this.options.firstPlayer;
      this.current = first;
      for (let i = 0; i < 5; i++) {
        for (const p of this.playersFrom(this.players[first])) this.move(this.deck[this.deck.length - 1], 'hand', p);
      }
      this.log(`Nouvelle partie à ${this.players.length} joueurs. Il faut ${this.winTarget} Licornes pour gagner.`, 'important');
      if (two) this.log('Règles à 2 joueurs : les cartes interdites sont retirées et chaque joueur reçoit 1 Huuue.');

      for (const p of this.playersFrom(this.players[first])) {
        const baby = await this.chooseCard(p, {
          prompt: 'Choisissez votre Bébé Licorne.',
          options: this.nursery.slice(),
          purpose: 'start_baby',
        });
        this.move(baby, 'stable', p);
        this.log(`${p.name} place ${this.describe(baby)} dans son Écurie.`);
      }
      this.log(`${this.players[first].name} commence.`, 'important');
    }

    async run() {
      try {
        await this.setup();
        for (;;) {
          await this.playTurn(this.players[this.current]);
          if (this.extraTurns > 0) {
            this.extraTurns--;
            this.log(`${this.players[this.current].name} joue un tour supplémentaire.`, 'important');
          } else {
            this.current = (this.current + 1) % this.players.length;
          }
        }
      } catch (e) {
        if (e instanceof GameOver) {
          this.pending = null;
          this.emit({ type: 'over', result: e.result });
          return e.result;
        }
        throw e;
      }
    }

    setPhase(phase) {
      this.turn.phase = phase;
      this.emit();
    }

    async playTurn(player) {
      this.turnNumber++;
      this.turn = { player, phase: null, maxPlays: 1, endNow: false };
      this.log(`Tour ${this.turnNumber} : ${player.name}.`, 'turn');

      this.setPhase('debut');
      await this.beginningOfTurn(player);
      this.checkEnd();
      // "End your turn immediately" skips to the End of Turn phase.
      if (this.turn.endNow) {
        this.log(`Le tour de ${player.name} prend fin immédiatement.`);
      } else {
        this.setPhase('pioche');
        await this.draw(player, 1);
        this.checkEnd();

        this.setPhase('action');
        await this.actionPhase(player);
        this.checkEnd();
      }

      this.setPhase('fin');
      const excess = player.hand.length - HAND_LIMIT;
      if (excess > 0) {
        await this.discard(player, excess, { prompt: `Fin du tour : défaussez ${UU.plural(excess, 'carte')} (limite de main : ${HAND_LIMIT}).`, purpose: 'hand_limit' });
      }
      this.checkEnd();
    }

    // All "beginning of your turn" effects happen at once, so every choice is made before any of them resolves.
    async beginningOfTurn(player) {
      const triggers = player.stable.filter((c) => c.def.beginTurn && this.effectActive(c));
      for (const c of triggers) {
        if (c.def.beginTurn.plays > this.turn.maxPlays) {
          this.turn.maxPlays = c.def.beginTurn.plays;
          this.log(`${c.def.name} : vous pouvez jouer ${c.def.beginTurn.plays} cartes pendant la Phase d'Action.`);
        }
      }
      const ordered = triggers.filter((c) => c.def.beginTurn.mandatory).concat(triggers.filter((c) => !c.def.beginTurn.mandatory));
      const reserved = new Set();
      const plans = [];
      for (const card of ordered) {
        const bt = card.def.beginTurn;
        if (!bt.declare) continue;
        const plan = await bt.declare(this, player, card, reserved);
        if (plan) plans.push({ card, plan });
      }
      await this.simultaneously(async () => {
        for (const { card, plan } of plans) await card.def.beginTurn.resolve(this, player, card, plan);
      });
    }

    async actionPhase(player) {
      let plays = 0;
      for (;;) {
        const playable = this.playableCards(player);
        const first = plays === 0;
        if (!first && (plays >= this.turn.maxPlays || playable.length === 0)) return;
        const answer = await this.ask(player, {
          type: 'action',
          playable,
          canDraw: first,
          canStop: !first,
          prompt: first ? 'Phase d\'Action : jouez 1 carte ou piochez 1 carte.' : 'Vous pouvez jouer une seconde carte.',
        });
        if (answer.type === 'draw' && first) {
          await this.draw(player, 1);
          return;
        }
        if (answer.type === 'stop' && !first) return;
        if (answer.type !== 'play' || !playable.includes(answer.card)) throw new Error('Invalid action from ' + player.name);
        await this.playCard(player, answer.card);
        plays++;
        this.checkEnd();
      }
    }
  }

  UU.Game = Game;
  UU.GameOver = GameOver;
})(typeof window !== 'undefined' ? window : globalThis);
