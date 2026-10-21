(function (root) {
  'use strict';

  const UU = (root.UU = root.UU || {});

  const MAGICAL_BONUS = {
    ginormous: 4,
    queen_bee: 3,
    black_knight: 3,
    rhinocorn: 5,
    kittencorn: 3,
    stabby: 3,
    phoenix: 4,
  };

  const UPGRADE_VALUE = {
    yay: 6,
    rainbow_aura: 7,
    double_dutch: 6,
    glitter_bomb: 6,
    stable_artillery: 5,
    claw_machine: 3,
    rainbow_lasso: 4,
    caffeine_overload: 3,
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  class AIController {
    constructor(options) {
      this.delay = (options && options.delay) || 0;
    }

    async decide(g, p, req) {
      if (this.delay && req.type !== 'neigh') await sleep(this.delay);
      switch (req.type) {
        case 'confirm':
          return this.confirm(g, p, req);
        case 'cards':
          return this.pickCards(g, p, req);
        case 'player':
          return this.pickPlayer(g, p, req);
        case 'neigh':
          return this.neigh(g, p, req);
        case 'action':
          return this.action(g, p, req);
        default:
          throw new Error('Unknown request ' + req.type);
      }
    }

    // How dangerous a player is: the closer to victory, the higher.
    threat(g, q) {
      const n = g.unicornCount(q);
      let w = 1 + (2 * n) / g.winTarget;
      if (n >= g.winTarget - 1) w += 3;
      else if (n >= g.winTarget - 2) w += 1;
      return w;
    }

    leader(g, p) {
      return this.bestOf(g.othersOf(p), (q) => this.threat(g, q)).item;
    }

    downgradeHarm(g, key, q) {
      const n = g.unicornCount(q);
      const magical = q.stable.filter((c) => c.def.type === 'magical').length;
      switch (key) {
        case 'pandamonium':
          return 2 + 5 * n;
        case 'blinding_light':
          return 1 + 3 * magical + (g.hasInStable(q, 'ginormous') ? 8 : 0);
        case 'tiny_stable':
          return n >= 4 ? 9 : 3;
        case 'sadistic_ritual':
          return n > 0 ? 8 : 2;
        case 'barbed_wire':
          return 4;
        case 'slowdown':
          return 3;
        case 'broken_stable':
          return 3;
        case 'nanny_cam':
          return 2;
        default:
          return 3;
      }
    }

    // Value of a card for the owner of the Stable where it is.
    stableValue(g, c) {
      const owner = g.ownerOf(c);
      if (g.isUnicornType(c)) {
        if (g.isPanda(c)) return 2;
        if (!g.effectActive(c)) return 10;
        if (c.def.type === 'baby') return 9;
        if (c.def.type === 'basic') return 10;
        return 10 * g.unicornWorth(c) + 1 + (MAGICAL_BONUS[c.def.key] || 0);
      }
      if (c.def.type === 'upgrade') return UPGRADE_VALUE[c.def.key] || 4;
      if (c.def.type === 'downgrade') return -this.downgradeHarm(g, c.def.key, owner);
      return 0;
    }

    // Gain for `p` when card `c` leaves its Stable for good.
    removalGain(g, p, c) {
      const owner = g.ownerOf(c);
      let v = this.stableValue(g, c);
      if (c.def.flying && g.effectActive(c)) v -= 5;
      if (owner === p) return -v;
      return v * this.threat(g, owner);
    }

    stealGain(g, p, c) {
      const own = g.isUnicornType(c) ? (g.hasInStable(p, 'pandamonium') ? 2 : c.def.key === 'ginormous' ? 20 : 11) : UPGRADE_VALUE[c.def.key] || 4;
      return own + this.removalGain(g, p, c);
    }

    handValue(g, p, c) {
      switch (c.def.type) {
        case 'instant':
          return c.def.key === 'super_neigh' ? 12 : 9;
        case 'magical':
          return g.canPlay(p, c) ? 8 : 4;
        case 'basic':
          return g.canPlay(p, c) ? 6 : 1;
        case 'magic':
          return g.canPlay(p, c) ? 6 : 2;
        case 'upgrade':
          return g.canPlay(p, c) ? 5 : 1;
        case 'downgrade':
          return 5;
        default:
          return 0;
      }
    }

    worstHand(g, p) {
      return p.hand
        .map((c) => ({ c, v: this.handValue(g, p, c) }))
        .sort((a, b) => a.v - b.v)
        .map((x) => x.c);
    }

    // A Flying Unicorn comes back to the hand, so losing it costs less.
    sacrificeCost(g, c) {
      const cost = this.stableValue(g, c);
      return c.def.flying && g.effectActive(c) ? cost - 6 : cost;
    }

    cheapestSacrifice(g, p) {
      if (p.stable.length === 0) return null;
      const best = this.bestOf(p.stable, (c) => -this.sacrificeCost(g, c));
      return { card: best.item, cost: -best.score };
    }

    bestOf(list, score) {
      let best = null;
      let bestScore = -Infinity;
      for (const x of list) {
        const s = score(x);
        if (s > bestScore) {
          bestScore = s;
          best = x;
        }
      }
      return { item: best, score: bestScore };
    }

    // Value of bringing a Unicorn into `p`'s Stable.
    unicornGain(g, p, c) {
      if (g.hasInStable(p, 'pandamonium')) return 2;
      const worth = c.def.key === 'ginormous' && !g.hasInStable(p, 'blinding_light') ? 2 : 1;
      let v = 10 * worth + (c.def.type === 'magical' ? 2 : 0);
      if (g.unicornCount(p) + worth >= g.winTarget) v += 100;
      return v;
    }

    scoreCard(g, p, req, c) {
      switch (req.purpose) {
        case 'start_baby':
          return g.random(100);
        case 'destroy':
          return this.removalGain(g, p, c);
        case 'steal':
          return this.stealGain(g, p, c);
        case 'sacrifice':
          return -this.sacrificeCost(g, c);
        case 'discard':
        case 'hand_limit':
          return -this.handValue(g, p, c);
        case 'return': {
          const owner = g.ownerOf(c);
          if (owner === p) {
            if (c.def.type === 'downgrade') return 20 + this.downgradeHarm(g, c.def.key, p);
            if (c.def.type === 'baby') return -20;
            let v = -this.stableValue(g, c) + 8;
            if (c.def.onEnter) v += 4;
            return v;
          }
          let v = this.stableValue(g, c);
          if (c.def.type === 'baby') v += 6;
          return v * this.threat(g, owner);
        }
        case 'upgrade_or_downgrade':
          if (c.owner === p.index) return 10 + this.downgradeHarm(g, c.def.key, p);
          return this.removalGain(g, p, c);
        case 'retarget': {
          const owner = g.ownerOf(c);
          if (c.def.type === 'downgrade') {
            if (owner === p) return 10 + this.downgradeHarm(g, c.def.key, p);
            return -5;
          }
          if (owner === p) return -5;
          return (UPGRADE_VALUE[c.def.key] || 4) * (1 + this.threat(g, owner));
        }
        case 'give':
          return -this.stableValue(g, c) - (c.def.type === 'baby' ? 2 : 0);
        case 'bring':
          return this.unicornGain(g, p, c) + (c.def.type === 'magical' ? 2 : 0);
        case 'search':
        case 'take_discard':
        case 'oracle_take':
        case 'take_hand':
          return this.handValue(g, p, c) + (c.def.type === 'magical' ? 1 : 0);
        case 'oracle_top':
          return -this.handValue(g, p, c);
        default:
          return 0;
      }
    }

    pickCards(g, p, req) {
      const scored = req.options.map((c) => ({ c, s: this.scoreCard(g, p, req, c) }));
      scored.sort((a, b) => b.s - a.s);
      const out = [];
      for (const { c, s } of scored) {
        if (out.length >= req.max) break;
        if (out.length >= req.min && s <= 0) break;
        out.push(c);
      }
      return out;
    }

    pickPlayer(g, p, req) {
      const options = req.options;
      const others = options.filter((q) => q !== p);
      switch (req.purpose) {
        case 'upgrade_target':
          return options.includes(p) ? p : this.bestOf(options, (q) => -this.threat(g, q)).item;
        case 'downgrade_target': {
          const key = req.card.def.key;
          const pool = others.length ? others : options;
          return this.bestOf(pool, (q) => this.downgradeHarm(g, key, q) * this.threat(g, q)).item;
        }
        case 'trade_hands':
          return this.bestOf(others, (q) => q.hand.length).item;
        case 'look_hand':
        case 'take_random':
          return this.bestOf(others, (q) => q.hand.length + this.threat(g, q)).item;
        case 'force_discard':
          return this.bestOf(others, (q) => this.threat(g, q) + q.hand.length / 3).item;
        case 'swap_target':
          return this.bestOf(others, (q) => {
            const steal = q.stable.filter((c) => g.isUnicorn(c) && g.canEnter(c, p));
            const top = this.bestOf(steal, (c) => this.stealGain(g, p, c)).score;
            return top === -Infinity ? -50 : top - 3 * this.threat(g, q);
          }).item;
        default:
          return this.bestOf(others.length ? others : options, (q) => this.threat(g, q)).item;
      }
    }

    confirm(g, p, req) {
      const key = req.source && req.source.def.key;
      switch (req.purpose) {
        case 'black_knight':
          return this.stableValue(g, req.card) > this.stableValue(g, req.source);
        case 'phoenix': {
          const worst = this.worstHand(g, p)[0];
          return !!worst && this.handValue(g, p, worst) < 11;
        }
        case 'use_effect':
          return this.useEffect(g, p, key, req.source);
        default:
          return true;
      }
    }

    bestDestroy(g, p, filter, source) {
      return this.bestOf(g.destroyable(p, filter, source), (c) => this.removalGain(g, p, c));
    }

    useEffect(g, p, key, source) {
      const leader = this.leader(g, p);
      const urgent = leader && g.unicornCount(leader) >= g.winTarget - 2;
      switch (key) {
        case 'glitter_bomb': {
          const sac = this.cheapestSacrifice(g, p);
          const hit = this.bestDestroy(g, p, () => true, source);
          return !!sac && hit.score > 0 && hit.score > sac.cost;
        }
        case 'caffeine_overload': {
          const sac = this.cheapestSacrifice(g, p);
          return !!sac && sac.cost < 6;
        }
        case 'claw_machine': {
          const worst = this.worstHand(g, p)[0];
          return !!worst && this.handValue(g, p, worst) <= 4;
        }
        case 'stable_artillery': {
          const hit = this.bestDestroy(g, p, (c) => g.isUnicorn(c), source);
          const hand = this.worstHand(g, p);
          if (hand.length < 2 || hit.score <= 0) return false;
          const cost = this.handValue(g, p, hand[0]) + this.handValue(g, p, hand[1]);
          return urgent || hit.score > cost;
        }
        case 'rainbow_lasso': {
          const steal = this.bestOf(g.stealable(p, (c) => g.isUnicorn(c)), (c) => this.stealGain(g, p, c));
          const hand = this.worstHand(g, p);
          if (hand.length < 3 || steal.score <= 0) return false;
          const cost = hand.slice(0, 3).reduce((s, c) => s + this.handValue(g, p, c), 0);
          return urgent || steal.score > cost || g.unicornCount(p) + 1 >= g.winTarget;
        }
        case 'seductive':
          return g.stealable(p, (c) => g.isUnicorn(c)).length > 0;
        case 'shark': {
          const hit = this.bestDestroy(g, p, (c) => g.isUnicorn(c), source);
          return hit.score > 22 || (urgent && hit.score > 0);
        }
        case 'necromancer':
          return g.discardPile.some((c) => g.isUnicorn(c) && g.canEnter(c, p));
        default:
          return true;
      }
    }

    // Rough value of the effect of a card for the player who plays it.
    playScore(g, p, c) {
      const key = c.def.key;
      switch (c.def.type) {
        case 'basic':
        case 'magical':
          return this.unicornGain(g, p, c) + (g.hasInStable(p, 'blinding_light') ? 0 : this.enterBonus(g, p, c));
        case 'upgrade':
          return UPGRADE_VALUE[key] || 3;
        case 'downgrade': {
          const others = g.othersOf(p);
          return this.bestOf(others, (q) => this.downgradeHarm(g, key, q) * this.threat(g, q) * 0.6).score;
        }
        case 'magic':
          return this.magicScore(g, p, c);
        default:
          return -Infinity;
      }
    }

    enterBonus(g, p, c) {
      const key = c.def.key;
      const discardHas = (f) => g.discardPile.some(f);
      switch (key) {
        case 'seductive':
          return p.hand.length > 1 && g.stealable(p, (x) => g.isUnicorn(x)).length ? 12 : 0;
        case 'shark':
          return this.bestDestroy(g, p, (x) => g.isUnicorn(x), c).score > 22 ? 4 : 0;
        case 'rainbow':
          return p.hand.some((x) => x.def.type === 'basic' && g.canEnter(x, p)) ? 10 : 0;
        case 'chainsaw':
          return p.stable.some((x) => x.def.type === 'downgrade') || g.destroyable(p, (x) => x.def.type === 'upgrade', c).length ? 6 : 0;
        case 'extremely_destructive': {
          const leader = this.leader(g, p);
          return leader && g.unicornCount(leader) >= g.unicornCount(p) ? 4 : -6;
        }
        case 'mother_goose':
          return g.nursery.length ? 10 : 0;
        case 'narwhal_torpedo':
          return 6 * p.stable.filter((x) => x.def.type === 'downgrade').length;
        case 'alluring_narwhal':
          return g.stealable(p, (x) => x.def.type === 'upgrade').length ? 6 : 0;
        case 'mermaid':
          return 4;
        case 'majestic_flying':
          return discardHas((x) => g.isUnicorn(x)) ? 6 : 0;
        case 'magical_flying':
          return discardHas((x) => x.def.type === 'magic') ? 5 : 0;
        case 'swift_flying':
          return discardHas((x) => g.isNeighCard(x)) ? 6 : 0;
        case 'necromancer':
          return p.hand.filter((x) => g.isUnicorn(x)).length >= 3 && discardHas((x) => g.isUnicorn(x)) ? 6 : 0;
        case 'dark_angel':
          return discardHas((x) => x.def.type === 'magical') ? 3 : 0;
        case 'llamacorn':
          return 1;
        case 'greedy_flying':
        case 'cob':
        case 'oracle':
        case 'americorn':
        case 'classy_narwhal':
          return 4;
        default:
          return MAGICAL_BONUS[key] || 2;
      }
    }

    magicScore(g, p, c) {
      const key = c.def.key;
      const unicorn = (x) => g.isUnicorn(x);
      switch (key) {
        case 'unicorn_poison':
          return this.bestDestroy(g, p, unicorn, c).score;
        case 'back_kick':
          return this.bestOf(g.othersStable(p), (x) => this.scoreCard(g, p, { purpose: 'return' }, x) * 0.7).score + 2;
        case 'change_of_luck':
          return p.hand.length >= 4 ? 14 : 8;
        case 'glitter_tornado': {
          let total = 0;
          for (const q of g.playersFrom(p)) {
            if (!q.stable.length) continue;
            total += this.bestOf(q.stable, (x) => this.scoreCard(g, p, { purpose: 'return' }, x)).score * (q === p ? 1 : 0.6);
          }
          return total;
        }
        case 'unicorn_swap': {
          const mine = p.stable.filter(unicorn);
          const give = this.bestOf(mine, (x) => -this.stableValue(g, x)).item;
          let best = -Infinity;
          for (const q of g.othersOf(p)) {
            const s = this.bestOf(q.stable.filter((x) => unicorn(x) && g.canEnter(x, p)), (x) => this.stealGain(g, p, x)).score;
            if (s > best) best = s;
          }
          return give ? best - this.stableValue(g, give) - 8 : -Infinity;
        }
        case 're_target': {
          const list = g.players.flatMap((q) => q.stable).filter((x) => x.def.type === 'upgrade' || x.def.type === 'downgrade');
          return this.bestOf(list, (x) => this.scoreCard(g, p, { purpose: 'retarget' }, x)).score;
        }
        case 'unfair_bargain': {
          const best = this.bestOf(g.othersOf(p), (q) => q.hand.length).score;
          return (best - (p.hand.length - 1)) * 3;
        }
        case 'two_for_one': {
          const list = g.destroyable(p, () => true, c).map((x) => this.removalGain(g, p, x)).sort((a, b) => b - a);
          const sac = this.cheapestSacrifice(g, p);
          return (list[0] || 0) + (list[1] || 0) - (sac ? Math.max(sac.cost, 0) : 0) - 4;
        }
        case 'targeted_destruction': {
          const own = p.stable.filter((x) => x.def.type === 'downgrade').map((x) => 10 + this.downgradeHarm(g, x.def.key, p));
          const hit = this.bestDestroy(g, p, (x) => x.def.type === 'upgrade', c).score;
          return Math.max(hit, ...own, -Infinity);
        }
        case 'mystical_vortex':
          return 1;
        case 'good_deal':
          return 6;
        case 'shake_up':
          return (6 - p.hand.length) * 3;
        case 'blatant_thievery':
          return 6;
        case 'reset_button': {
          let total = 0;
          for (const q of g.players) {
            for (const x of q.stable) {
              if (x.def.type !== 'upgrade' && x.def.type !== 'downgrade') continue;
              total += q === p ? -this.stableValue(g, x) : this.stableValue(g, x) * 0.5;
            }
          }
          return total;
        }
        case 'kiss_of_life':
          return this.bestOf(g.discardPile.filter((x) => unicorn(x) && g.canEnter(x, p)), (x) => this.unicornGain(g, p, x)).score;
        default:
          return 0;
      }
    }

    action(g, p, req) {
      // A card must beat the value of drawing, or of stopping, to be played.
      const best = this.bestOf(req.playable, (c) => this.playScore(g, p, c));
      if (best.item && best.score > (req.canDraw ? 4 : 2)) return { type: 'play', card: best.item };
      if (req.canDraw) return { type: 'draw' };
      return { type: 'stop' };
    }

    // How bad it would be for `p` if `card` resolves.
    danger(g, p, card, by) {
      const two = g.players.length === 2;
      const n = g.unicornCount(by);
      const meLeading = this.leader(g, by) === p || two;
      switch (card.def.type) {
        case 'instant':
          return 0;
        case 'basic':
        case 'magical': {
          const worth = card.def.key === 'ginormous' ? 2 : 1;
          if (g.hasInStable(by, 'pandamonium')) return 1;
          if (n + worth >= g.winTarget) return 100;
          if (n + worth === g.winTarget - 1) return 14;
          let d = 2 + (4 * n) / g.winTarget;
          if (['seductive', 'extremely_destructive', 'shark', 'mother_goose', 'rainbow'].includes(card.def.key)) d += 4;
          return d;
        }
        case 'magic': {
          const harsh = ['unicorn_poison', 'two_for_one', 'unicorn_swap', 'back_kick', 'blatant_thievery'];
          if (card.def.key === 'kiss_of_life' && n + 1 >= g.winTarget) return 100;
          if (card.def.key === 'change_of_luck' && n >= g.winTarget - 2) return 14;
          if (harsh.includes(card.def.key)) return meLeading ? 4 + 2 * g.unicornCount(p) : 4;
          return 3;
        }
        case 'downgrade':
          return meLeading ? 4 + this.downgradeHarm(g, card.def.key, p) : 2;
        case 'upgrade':
          return 3 + (UPGRADE_VALUE[card.def.key] || 3) * (n >= g.winTarget - 2 ? 1.5 : 0.5);
        default:
          return 0;
      }
    }

    // Cards in limbo form a chain where each Neigh targets the card below it.
    // This is what `p` gets if the card at `i` resolves.
    resolveValue(g, p, i) {
      const card = g.limbo[i];
      if (!card) return 0;
      if (g.isNeighCard(card)) return i > 0 ? -this.resolveValue(g, p, i - 1) : 0;
      const owner = g.ownerOf(card);
      if (owner === p) return Math.max(0, this.playScore(g, p, card));
      return -this.danger(g, p, card, owner);
    }

    neigh(g, p, req) {
      const card = req.card;
      const options = req.options;
      const plain = options.find((c) => c.def.key === 'neigh');
      const superNeigh = options.find((c) => c.def.key === 'super_neigh');
      const value = -this.resolveValue(g, p, g.limbo.indexOf(card));
      const threshold = options.length >= 3 ? 9 : options.length === 2 ? 12 : 15;
      if (value < threshold) return null;
      if (value >= 50 && superNeigh) return superNeigh;
      return plain || superNeigh;
    }
  }

  UU.AIController = AIController;
})(typeof window !== 'undefined' ? window : globalThis);
