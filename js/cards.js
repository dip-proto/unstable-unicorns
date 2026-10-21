(function (root) {
  'use strict';

  const UU = (root.UU = root.UU || {});

  const BABY_TEXT = 'Si cette carte doit être sacrifiée, détruite ou reprise en main, renvoyez-la dans la Nurserie à la place.';
  const FLYING_TEXT = 'Si cette carte est sacrifiée ou détruite, reprenez-la en main.';
  const NEIGH_TEXT = "Utilisez cette carte lorsqu'un autre joueur essaie d'en jouer une de sa main et forcez-le à défausser sa carte à la place.";

  const isUpgrade = (c) => c.def.type === 'upgrade';
  const isDowngrade = (c) => c.def.type === 'downgrade';
  const isUpgradeOrDowngrade = (c) => isUpgrade(c) || isDowngrade(c);
  const anyCard = () => true;

  function plural(n, word) {
    return `${n} ${word}${n > 1 ? 's' : ''}`;
  }

  async function eachPlayerDiscards(g, p, source) {
    for (const q of g.playersFrom(p)) {
      await g.discard(q, 1, { prompt: `${source.def.name} : défaussez 1 carte.`, source });
    }
  }

  async function takeFromDiscard(g, p, card, filter, what) {
    const options = g.discardPile.filter(filter);
    const pick = await g.chooseCard(p, {
      prompt: `${card.def.name} : vous pouvez prendre en main 1 ${what} de la défausse.`,
      options,
      optional: true,
      purpose: 'take_discard',
      source: card,
    });
    if (pick) {
      g.move(pick, 'hand', p);
      g.log(`${p.name} prend ${g.describe(pick)} dans la défausse.`);
    }
  }

  async function bringFromDiscard(g, p, card) {
    const options = g.discardPile.filter((c) => g.isUnicorn(c) && g.canEnter(c, p));
    const pick = await g.chooseCard(p, {
      prompt: `${card.def.name} : choisissez 1 carte Licorne de la défausse à ajouter à votre Écurie.`,
      options,
      purpose: 'bring',
      source: card,
    });
    if (pick) await g.bring(p, pick, 'de la défausse');
    return pick;
  }

  // Beginning of turn effects are declared together, and one card can't serve two of them.
  function unreserved(cards, reserved) {
    return cards.filter((c) => !reserved.has(c.uid));
  }

  async function declareDiscards(g, p, card, reserved, n, prompt) {
    const hand = unreserved(p.hand, reserved);
    if (hand.length < n) return null;
    if (!(await g.confirm(p, prompt, { purpose: 'use_effect', source: card }))) return null;
    const cards = await g.chooseCards(p, {
      prompt: `${card.def.name} : choisissez ${plural(n, 'carte')} à DÉFAUSSER.`,
      options: hand,
      min: n,
      max: n,
      purpose: 'discard',
      source: card,
      alwaysAsk: true,
    });
    for (const c of cards) reserved.add(c.uid);
    return cards;
  }

  // Discards the declared cards, all or nothing, as "then" requires.
  function discardDeclared(g, p, cards) {
    if (!cards.every((c) => c.zone === 'hand' && c.owner === p.index)) return false;
    for (const c of cards) g.discardCard(p, c);
    return true;
  }

  async function declareTarget(g, p, card, reserved, options, prompt, purpose, optional) {
    const pick = await g.chooseCard(p, { prompt, options: unreserved(options, reserved), optional, purpose, source: card });
    if (pick) reserved.add(pick.uid);
    return pick;
  }

  async function declareSacrifice(g, p, card, reserved, prompt) {
    if (unreserved(p.stable, reserved).length === 0) return null;
    if (!(await g.confirm(p, prompt, { purpose: 'use_effect', source: card }))) return null;
    return declareTarget(g, p, card, reserved, p.stable, `${card.def.name} : choisissez la carte à SACRIFIER.`, 'sacrifice');
  }

  // A target chosen earlier stays valid even if a protection changed since, but not if it left the Stable.
  async function destroyDeclared(g, p, card, snap) {
    if (!card || card.zone !== 'stable' || card.owner === p.index) return false;
    return g.destroy(card, snap);
  }

  // Players who can take `unicorn` in a Unicorn Swap and still leave `p` something to steal back.
  function swapTargets(g, p, unicorn) {
    if (!g.isUnicorn(unicorn)) return [];
    return g.othersOf(p).filter((q) => {
      if (!g.canEnter(unicorn, q)) return false;
      const returns = !g.hasInStable(q, 'pandamonium') && g.canEnter(unicorn, p);
      return returns || q.stable.some((c) => g.isUnicorn(c) && g.canEnter(c, p));
    });
  }

  function upgradeOrDowngradeTargets(g, p, card) {
    return g.destroyable(p, isUpgrade, card).concat(p.stable.filter(isDowngrade));
  }

  async function destroyUpgradeOrSacrificeDowngrade(g, p, card, prompt, optional) {
    const pick = await g.chooseCard(p, { prompt, options: upgradeOrDowngradeTargets(g, p, card), optional, purpose: 'upgrade_or_downgrade', source: card });
    if (!pick) return;
    if (pick.owner === p.index) await g.sacrifice(p, pick);
    else await g.destroy(pick);
  }

  const CARDS = [];

  function add(def) {
    CARDS.push(def);
  }

  const BABIES = [
    ['rouge', 'Rouge'],
    ['rose', 'Rose'],
    ['orange', 'Orange'],
    ['jaune', 'Jaune'],
    ['vert', 'Vert'],
    ['bleu', 'Bleu'],
    ['mauve', 'Mauve'],
    ['noir', 'Noir'],
    ['blanc', 'Blanc'],
    ['brun', 'Brun'],
    ['arc', 'Arc-en-ciel'],
    ['deces', 'Décès'],
  ];
  for (const [id, color] of BABIES) {
    add({ key: 'baby_' + id, name: 'Bébé Licorne', label: `Bébé Licorne (${color})`, color: id, type: 'baby', count: 1, text: BABY_TEXT });
  }
  add({ key: 'baby_narwhal', name: 'Bébé Narval', color: 'narval', type: 'baby', count: 1, text: BABY_TEXT });

  const BASICS = [
    ['rouge', 'Rouge'],
    ['orange', 'Orange'],
    ['jaune', 'Jaune'],
    ['vert', 'Verte'],
    ['bleu', 'Bleue'],
    ['indigo', 'Indigo'],
    ['mauve', 'Mauve'],
  ];
  for (const [id, color] of BASICS) {
    add({ key: 'basic_' + id, name: 'Licorne Standard', label: `Licorne Standard (${color})`, color: id, type: 'basic', count: 3, text: 'Aucun effet.', notInTwoPlayer: true });
  }
  add({ key: 'basic_narwhal', name: 'Narval Standard', color: 'narval', type: 'basic', count: 1, text: 'Aucun effet.', notInTwoPlayer: true });

  add({
    key: 'rhinocorn',
    name: 'Licornocéros',
    type: 'magical',
    count: 1,
    text: 'Si cette carte se trouve dans votre Écurie au début de votre tour, vous pouvez DÉTRUIRE 1 carte Licorne. Dans ce cas, votre tour prend fin immédiatement.',
    beginTurn: {
      async declare(g, p, card, reserved) {
        const options = g.destroyable(p, (c) => g.isUnicorn(c), card);
        const pick = await declareTarget(g, p, card, reserved, options, 'Licornocéros : vous pouvez DÉTRUIRE 1 carte Licorne. Votre tour prendra alors fin.', 'destroy', true);
        return pick ? { target: pick, snap: g.snapshot(pick) } : null;
      },
      async resolve(g, p, card, plan) {
        if (await destroyDeclared(g, p, plan.target, plan.snap)) g.turn.endNow = true;
      },
    },
  });

  add({ key: 'kittencorn', name: 'Chatoncorne Magique', type: 'magical', count: 1, text: 'Cette carte ne peut pas être détruite par des cartes Magie.' });

  add({ key: 'stabby', name: 'Licorne Tueuse', type: 'magical', count: 1, text: 'Si cette carte est sacrifiée ou détruite, vous pouvez DÉTRUIRE 1 carte Licorne.' });

  add({
    key: 'rainbow',
    name: 'Licorne Arc-en-Ciel',
    type: 'magical',
    count: 1,
    notInTwoPlayer: true,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez y ajouter 1 carte Licorne Standard de votre main.',
    async onEnter(g, p, card) {
      const pick = await g.chooseCard(p, {
        prompt: 'Licorne Arc-en-Ciel : vous pouvez ajouter 1 Licorne Standard de votre main à votre Écurie.',
        options: p.hand.filter((c) => c.def.type === 'basic' && g.canEnter(c, p)),
        optional: true,
        purpose: 'bring',
        source: card,
      });
      if (pick) await g.bring(p, pick, 'de sa main');
    },
  });

  add({
    key: 'extremely_destructive',
    name: 'Licorne Dévastatrice',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, chaque joueur (y compris vous) doit SACRIFIER 1 carte Licorne.',
    requirement: (g, p) => !g.hasInStable(p, 'pandamonium'),
    async onEnter(g, p, card) {
      for (const q of g.playersFrom(p)) {
        await g.chooseSacrifice(q, (c) => g.isUnicorn(c), { prompt: 'Licorne Dévastatrice : SACRIFIEZ 1 carte Licorne.', source: card });
      }
    },
  });

  add({
    key: 'chainsaw',
    name: 'Licorne Tronçonneuse',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez DÉTRUIRE 1 carte Amélioration ou SACRIFIER 1 carte Attaque.',
    async onEnter(g, p, card) {
      await destroyUpgradeOrSacrificeDowngrade(g, p, card, 'Licorne Tronçonneuse : vous pouvez DÉTRUIRE 1 Amélioration ou SACRIFIER 1 de vos Attaques.', true);
    },
  });

  add({
    key: 'llamacorn',
    name: 'Lamacorne',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, chaque joueur (y compris vous) doit DÉFAUSSER 1 carte.',
    requirement: (g, p) => p.hand.length >= 2,
    async onEnter(g, p, card) {
      await eachPlayerDiscards(g, p, card);
    },
  });

  add({
    key: 'americorn',
    name: 'Américorne',
    type: 'magical',
    count: 1,
    text: "Lorsque cette carte entre dans votre Écurie, vous pouvez prendre 1 carte au hasard dans la main d'un autre joueur.",
    async onEnter(g, p, card) {
      const options = g.othersOf(p).filter((q) => q.hand.length > 0);
      const q = await g.choosePlayer(p, {
        prompt: "Américorne : vous pouvez prendre 1 carte au hasard dans la main d'un autre joueur.",
        options,
        optional: true,
        purpose: 'take_random',
        source: card,
      });
      if (!q) return;
      // Nanny Cam shows the hand, so the card is picked instead of drawn at random.
      let pick;
      if (g.hasInStable(q, 'nanny_cam')) {
        pick = await g.chooseCard(p, { prompt: `Américorne : choisissez 1 carte dans la main de ${q.name}.`, options: q.hand.slice(), purpose: 'take_hand', source: card, alwaysAsk: true });
        g.log(`${p.name} choisit 1 carte dans la main visible de ${q.name}.`);
      } else {
        pick = q.hand[g.random(q.hand.length)];
        g.log(`${p.name} prend 1 carte au hasard dans la main de ${q.name}.`);
      }
      g.move(pick, 'hand', p);
      g.emit({ type: 'private', to: p, text: `Vous avez pris ${g.describe(pick)}.`, victim: q, victimText: `${p.name} vous a pris ${g.describe(pick)}.` });
    },
  });

  add({
    key: 'ginormous',
    name: 'Licorne Gargantuesque',
    type: 'magical',
    count: 1,
    text: 'Cette carte compte comme 2 Licornes. Vous ne pouvez pas jouer de cartes Huuue.',
  });

  add({
    key: 'seductive',
    name: 'Licorne Séductrice',
    type: 'magical',
    count: 1,
    notInTwoPlayer: true,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez DÉFAUSSER 1 carte puis VOLER 1 carte Licorne.',
    async onEnter(g, p, card) {
      if (p.hand.length === 0) return;
      if (!(await g.confirm(p, 'Licorne Séductrice : DÉFAUSSER 1 carte puis VOLER 1 carte Licorne ?', { purpose: 'use_effect', source: card }))) return;
      await g.discard(p, 1, { prompt: 'Licorne Séductrice : défaussez 1 carte.', source: card });
      await g.chooseSteal(p, (c) => g.isUnicorn(c), card, { prompt: 'Licorne Séductrice : VOLEZ 1 carte Licorne.' });
    },
  });

  add({
    key: 'queen_bee',
    name: 'Licorne Reine de Beauté',
    type: 'magical',
    count: 1,
    notInTwoPlayer: true,
    text: 'Les cartes Licorne Standard ne peuvent entrer dans aucune Écurie à part la vôtre.',
  });

  add({
    key: 'greedy_flying',
    name: 'Licorne Volante Cupide',
    type: 'magical',
    count: 1,
    flying: true,
    text: 'Lorsque cette carte entre dans votre Écurie, PIOCHEZ 1 carte. ' + FLYING_TEXT,
    async onEnter(g, p) {
      await g.draw(p, 1);
    },
  });

  add({
    key: 'annoying_flying',
    name: 'Licorne Volante Bruyante',
    type: 'magical',
    count: 1,
    flying: true,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez forcer un autre joueur à DÉFAUSSER 1 carte. ' + FLYING_TEXT,
    async onEnter(g, p, card) {
      const q = await g.choosePlayer(p, {
        prompt: 'Licorne Volante Bruyante : vous pouvez forcer un autre joueur à DÉFAUSSER 1 carte.',
        options: g.othersOf(p).filter((x) => x.hand.length > 0),
        optional: true,
        purpose: 'force_discard',
        source: card,
      });
      if (q) await g.discard(q, 1, { prompt: 'Licorne Volante Bruyante : défaussez 1 carte.', source: card });
    },
  });

  add({
    key: 'magical_flying',
    name: 'Licorne Volante Magique',
    type: 'magical',
    count: 1,
    flying: true,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez prendre en main 1 carte Magie de la défausse. ' + FLYING_TEXT,
    async onEnter(g, p, card) {
      await takeFromDiscard(g, p, card, (c) => c.def.type === 'magic', 'carte Magie');
    },
  });

  add({
    key: 'swift_flying',
    name: 'Licorne Volante Fulgurante',
    type: 'magical',
    count: 1,
    flying: true,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez prendre en main 1 carte Huuue de la défausse. ' + FLYING_TEXT,
    async onEnter(g, p, card) {
      await takeFromDiscard(g, p, card, (c) => g.isNeighCard(c), 'carte Huuue');
    },
  });

  add({
    key: 'majestic_flying',
    name: 'Licorne Volante Majestueuse',
    type: 'magical',
    count: 1,
    flying: true,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez prendre en main 1 carte Licorne de la défausse. ' + FLYING_TEXT,
    async onEnter(g, p, card) {
      await takeFromDiscard(g, p, card, (c) => g.isUnicorn(c), 'carte Licorne');
    },
  });

  add({ key: 'phoenix', name: 'Licorne Phénix', type: 'magical', count: 1, text: 'Si cette carte doit être sacrifiée ou détruite, vous pouvez DÉFAUSSER 1 carte à la place.' });

  add({
    key: 'cob',
    name: 'Licorne Épi de Maïs',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, PIOCHEZ 2 cartes et DÉFAUSSEZ 1 carte.',
    async onEnter(g, p, card) {
      await g.draw(p, 2);
      await g.discard(p, 1, { prompt: 'Licorne Épi de Maïs : défaussez 1 carte.', source: card });
    },
  });

  add({ key: 'black_knight', name: 'Licorne Chevalier Noir', type: 'magical', count: 1, text: 'Si 1 carte Licorne de votre Écurie doit être détruite, vous pouvez SACRIFIER cette carte à la place.' });

  add({
    key: 'shark',
    name: 'Requin à Corne',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez la SACRIFIER puis DÉTRUIRE 1 carte Licorne.',
    async onEnter(g, p, card) {
      if (card.zone !== 'stable' || card.owner !== p.index) return;
      if (!(await g.confirm(p, 'Requin à Corne : SACRIFIER cette carte puis DÉTRUIRE 1 carte Licorne ?', { purpose: 'use_effect', source: card }))) return;
      if (!(await g.sacrifice(p, card))) return;
      await g.chooseDestroy(p, (c) => g.isUnicorn(c), card, { prompt: 'Requin à Corne : DÉTRUISEZ 1 carte Licorne.' });
    },
  });

  add({
    key: 'shabby',
    name: 'Narval Crochet',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez chercher 1 carte Attaque dans le paquet et la prendre en main. Mélangez ensuite le paquet.',
    async onEnter(g, p, card) {
      await g.searchDeck(p, isDowngrade, card, 'Narval Crochet : vous pouvez prendre 1 carte Attaque dans le paquet.');
    },
  });

  add({
    key: 'narwhal_torpedo',
    name: 'Narval Torpille',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, SACRIFIEZ toutes les cartes Attaque de votre Écurie.',
    async onEnter(g, p) {
      for (const c of p.stable.filter(isDowngrade)) await g.sacrifice(p, c);
    },
  });

  add({
    key: 'alluring_narwhal',
    name: 'Narval Aguicheur',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez VOLER 1 carte Amélioration.',
    async onEnter(g, p, card) {
      await g.chooseSteal(p, isUpgrade, card, { prompt: 'Narval Aguicheur : vous pouvez VOLER 1 carte Amélioration.', optional: true });
    },
  });

  add({
    key: 'mermaid',
    name: 'Licorne Sirène',
    type: 'magical',
    count: 1,
    text: "Lorsque cette carte entre dans votre Écurie, forcez un autre joueur à reprendre en main 1 des cartes de son Écurie.",
    requirement: (g, p) => g.othersStable(p).length > 0,
    async onEnter(g, p, card) {
      const pick = await g.chooseCard(p, {
        prompt: "Licorne Sirène : choisissez 1 carte dans l'Écurie d'un autre joueur. Il la reprend en main.",
        options: g.othersStable(p),
        purpose: 'return',
        source: card,
      });
      if (pick) await g.returnToHand(pick);
    },
  });

  add({
    key: 'classy_narwhal',
    name: 'Narval Élégant',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez chercher 1 carte Amélioration dans le paquet et la prendre en main. Mélangez ensuite le paquet.',
    async onEnter(g, p, card) {
      await g.searchDeck(p, isUpgrade, card, 'Narval Élégant : vous pouvez prendre 1 carte Amélioration dans le paquet.');
    },
  });

  add({
    key: 'great_narwhal',
    name: 'Narval Triton',
    type: 'magical',
    count: 1,
    text: "Lorsque cette carte entre dans votre Écurie, vous pouvez chercher dans le paquet 1 carte dont le titre contient le mot « Narval » et la prendre en main. Mélangez ensuite le paquet.",
    async onEnter(g, p, card) {
      await g.searchDeck(p, (c) => c.def.name.includes('Narval'), card, 'Narval Triton : vous pouvez prendre 1 carte « Narval » dans le paquet.');
    },
  });

  add({
    key: 'mother_goose',
    name: 'Licorne Mère Poule',
    type: 'magical',
    count: 1,
    notInTwoPlayer: true,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez y ajouter 1 carte Bébé Licorne de la Nurserie.',
    async onEnter(g, p, card) {
      const pick = await g.chooseCard(p, {
        prompt: 'Licorne Mère Poule : vous pouvez ajouter 1 Bébé Licorne de la Nurserie à votre Écurie.',
        options: g.nursery.filter((c) => g.canEnter(c, p)),
        optional: true,
        purpose: 'bring',
        source: card,
      });
      if (pick) await g.bring(p, pick, 'de la Nurserie');
    },
  });

  add({
    key: 'oracle',
    name: 'Licorne Oracle',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, regardez les 3 premières cartes du paquet et prenez-en 1 en main. Remettez les 2 autres sur le paquet, dans l\'ordre de votre choix.',
    async onEnter(g, p, card) {
      const top = g.deck.slice(-3).reverse();
      if (top.length === 0) return;
      const pick = await g.chooseCard(p, { prompt: 'Licorne Oracle : prenez 1 de ces cartes en main.', options: top, purpose: 'oracle_take', source: card, alwaysAsk: true });
      g.move(pick, 'hand', p);
      g.log(`${p.name} regarde les ${top.length} premières cartes du paquet et en prend 1.`);
      const rest = top.filter((c) => c !== pick);
      if (rest.length === 2) {
        const first = await g.chooseCard(p, {
          prompt: 'Licorne Oracle : quelle carte doit se trouver tout en haut du paquet ?',
          options: rest,
          purpose: 'oracle_top',
          source: card,
          alwaysAsk: true,
        });
        const second = rest.find((c) => c !== first);
        g.move(second, 'deck');
        g.move(first, 'deck');
      }
    },
  });

  add({
    key: 'necromancer',
    name: 'Licorne Nécromancienne',
    type: 'magical',
    count: 1,
    notInTwoPlayer: true,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez DÉFAUSSER 2 cartes Licorne puis y ajouter 1 carte Licorne de la défausse.',
    async onEnter(g, p, card) {
      const unicorns = p.hand.filter((c) => g.isUnicorn(c));
      if (unicorns.length < 2) return;
      if (!(await g.confirm(p, 'Licorne Nécromancienne : DÉFAUSSER 2 cartes Licorne puis ajouter 1 Licorne de la défausse à votre Écurie ?', { purpose: 'use_effect', source: card }))) return;
      await g.discard(p, 2, { prompt: 'Licorne Nécromancienne : choisissez 2 cartes Licorne à DÉFAUSSER.', options: unicorns, source: card, alwaysAsk: true });
      await bringFromDiscard(g, p, card);
    },
  });

  add({
    key: 'dark_angel',
    name: 'Licorne Ange Noir',
    type: 'magical',
    count: 1,
    text: 'Lorsque cette carte entre dans votre Écurie, vous pouvez SACRIFIER 1 carte Licorne puis y ajouter 1 carte Licorne de la défausse.',
    async onEnter(g, p, card) {
      const sacrificed = await g.chooseSacrifice(p, (c) => g.isUnicorn(c), {
        prompt: 'Licorne Ange Noir : vous pouvez SACRIFIER 1 carte Licorne, puis ajouter 1 Licorne de la défausse à votre Écurie.',
        optional: true,
        source: card,
      });
      if (sacrificed) await bringFromDiscard(g, p, card);
    },
  });

  add({
    key: 'unicorn_poison',
    name: 'Poison pour Licorne',
    type: 'magic',
    count: 3,
    text: 'DÉTRUISEZ 1 carte Licorne.',
    requirement: (g, p, card) => g.destroyable(p, (c) => g.isUnicorn(c), card).length > 0,
    async play(g, p, card) {
      await g.chooseDestroy(p, (c) => g.isUnicorn(c), card, { prompt: 'Poison pour Licorne : DÉTRUISEZ 1 carte Licorne.' });
    },
  });

  add({
    key: 'back_kick',
    name: 'Ruade',
    type: 'magic',
    count: 3,
    text: "Forcez un autre joueur à reprendre en main 1 des cartes de son Écurie. Ce joueur doit ensuite DÉFAUSSER 1 carte.",
    requirement: (g, p) => g.othersStable(p).length > 0,
    async play(g, p, card) {
      const pick = await g.chooseCard(p, {
        prompt: "Ruade : choisissez 1 carte dans l'Écurie d'un autre joueur. Il la reprend en main.",
        options: g.othersStable(p),
        purpose: 'return',
        source: card,
      });
      if (!pick) return;
      const q = g.ownerOf(pick);
      await g.returnToHand(pick);
      await g.discard(q, 1, { prompt: 'Ruade : défaussez 1 carte.', source: card });
    },
  });

  add({
    key: 'change_of_luck',
    name: 'La Chance Tourne',
    type: 'magic',
    count: 2,
    text: 'PIOCHEZ 2 cartes et DÉFAUSSEZ 3 cartes, puis effectuez un autre tour.',
    requirement: (g, p) => p.hand.length >= 2,
    async play(g, p, card) {
      await g.draw(p, 2);
      const n = await g.discard(p, 3, { prompt: 'La Chance Tourne : défaussez 3 cartes.', source: card });
      if (n === 3) {
        g.extraTurns++;
        g.log(`${p.name} effectuera un autre tour.`);
      }
    },
  });

  add({
    key: 'glitter_tornado',
    name: 'Tornade de Paillettes',
    type: 'magic',
    count: 2,
    text: "Chaque joueur (y compris vous) doit reprendre en main 1 des cartes de son Écurie.",
    requirement: (g, p) => p.stable.length > 0,
    async play(g, p, card) {
      const picks = [];
      for (const q of g.playersFrom(p)) {
        if (q.stable.length === 0) continue;
        const who = q === p ? 'votre Écurie' : `l'Écurie de ${q.name}`;
        picks.push(
          await g.chooseCard(p, {
            prompt: `Tornade de Paillettes : choisissez 1 carte dans ${who}. Elle retourne en main.`,
            options: q.stable.slice(),
            purpose: 'return',
            source: card,
          }),
        );
      }
      for (const c of picks) if (c.zone === 'stable') await g.returnToHand(c);
    },
  });

  add({
    key: 'unicorn_swap',
    name: 'Échange de Licornes',
    type: 'magic',
    count: 2,
    text: "Déplacez 1 carte Licorne de votre Écurie vers celle d'un autre joueur, puis VOLEZ 1 carte Licorne de son Écurie.",
    requirement: (g, p) => p.stable.some((c) => swapTargets(g, p, c).length > 0),
    async play(g, p, card) {
      const mine = p.stable.filter((c) => swapTargets(g, p, c).length > 0);
      const give = await g.chooseCard(p, { prompt: 'Échange de Licornes : choisissez la Licorne à donner.', options: mine, purpose: 'give', source: card });
      if (!give) return;
      const q = await g.choosePlayer(p, {
        prompt: `Échange de Licornes : à qui donner ${g.describe(give)} ?`,
        options: swapTargets(g, p, give),
        purpose: 'swap_target',
        source: card,
        card: give,
      });
      await g.transfer(give, q, `${p.name} donne ${g.describe(give)} à ${q.name}.`);
      const options = q.stable.filter((c) => g.isUnicorn(c) && g.canEnter(c, p));
      const pick = await g.chooseCard(p, { prompt: `Échange de Licornes : VOLEZ 1 carte Licorne à ${q.name}.`, options, purpose: 'steal', source: card });
      if (pick) await g.steal(p, pick);
    },
  });

  add({
    key: 're_target',
    name: 'Changement de Cible',
    type: 'magic',
    count: 2,
    text: "Déplacez 1 carte Amélioration ou Attaque de l'Écurie de n'importe quel joueur vers celle de n'importe quel autre joueur.",
    requirement: (g) => g.players.some((q) => q.stable.some(isUpgradeOrDowngrade)),
    async play(g, p, card) {
      const options = g.playersFrom(p).flatMap((q) => q.stable).filter(isUpgradeOrDowngrade);
      const pick = await g.chooseCard(p, { prompt: 'Changement de Cible : choisissez 1 Amélioration ou 1 Attaque à déplacer.', options, purpose: 'retarget', source: card });
      if (!pick) return;
      const from = g.ownerOf(pick);
      const to = await g.choosePlayer(p, {
        prompt: `Changement de Cible : dans quelle Écurie placer ${g.describe(pick)} ?`,
        options: g.playersFrom(p).filter((q) => q !== from),
        purpose: isUpgrade(pick) ? 'upgrade_target' : 'downgrade_target',
        source: card,
        card: pick,
      });
      await g.transfer(pick, to, `${p.name} déplace ${g.describe(pick)} de l'Écurie de ${from.name} vers celle de ${to.name}.`);
    },
  });

  add({
    key: 'unfair_bargain',
    name: 'Accord Désavantageux',
    type: 'magic',
    count: 2,
    text: 'Échangez votre main contre celle d\'un autre joueur.',
    async play(g, p, card) {
      const q = await g.choosePlayer(p, { prompt: 'Accord Désavantageux : avec qui échanger votre main ?', options: g.othersOf(p), purpose: 'trade_hands', source: card });
      const mine = p.hand.slice();
      const theirs = q.hand.slice();
      for (const c of mine) g.move(c, 'hand', q);
      for (const c of theirs) g.move(c, 'hand', p);
      g.log(`${p.name} échange sa main avec celle de ${q.name}.`);
    },
  });

  add({
    key: 'two_for_one',
    name: "Deux pour le Prix d'une",
    type: 'magic',
    count: 2,
    text: 'SACRIFIEZ 1 carte puis DÉTRUISEZ 2 cartes.',
    requirement: (g, p) => p.stable.length > 0,
    async play(g, p, card) {
      const sacrificed = await g.chooseSacrifice(p, anyCard, { prompt: "Deux pour le Prix d'une : SACRIFIEZ 1 carte.", source: card });
      if (!sacrificed) return;
      // Both targets are chosen together, before either card is destroyed.
      const options = g.destroyable(p, anyCard, card);
      const n = Math.min(2, options.length);
      const targets = await g.chooseCards(p, { prompt: `Deux pour le Prix d'une : choisissez ${plural(n, 'carte')} à DÉTRUIRE.`, options, min: n, max: n, purpose: 'destroy', source: card });
      const snaps = targets.map((t) => g.snapshot(t));
      for (let i = 0; i < targets.length; i++) await destroyDeclared(g, p, targets[i], snaps[i]);
    },
  });

  add({
    key: 'targeted_destruction',
    name: 'Destruction Ciblée',
    type: 'magic',
    count: 1,
    text: 'DÉTRUISEZ 1 carte Amélioration ou SACRIFIEZ 1 carte Attaque.',
    requirement: (g, p, card) => upgradeOrDowngradeTargets(g, p, card).length > 0,
    async play(g, p, card) {
      await destroyUpgradeOrSacrificeDowngrade(g, p, card, 'Destruction Ciblée : DÉTRUISEZ 1 Amélioration ou SACRIFIEZ 1 de vos Attaques.', false);
    },
  });

  add({
    key: 'mystical_vortex',
    name: 'Vortex Mystique',
    type: 'magic',
    count: 1,
    text: 'Chaque joueur (y compris vous) doit DÉFAUSSER 1 carte. Mélangez ensuite la défausse dans le paquet.',
    requirement: (g, p) => p.hand.length >= 2,
    async play(g, p, card) {
      await eachPlayerDiscards(g, p, card);
      g.shuffleDiscardIntoDeck();
    },
  });

  add({
    key: 'good_deal',
    name: 'Bonne Affaire',
    type: 'magic',
    count: 1,
    text: 'PIOCHEZ 3 cartes et DÉFAUSSEZ 1 carte.',
    async play(g, p, card) {
      await g.draw(p, 3);
      await g.discard(p, 1, { prompt: 'Bonne Affaire : défaussez 1 carte.', source: card });
    },
  });

  add({
    key: 'shake_up',
    name: 'Secousse',
    type: 'magic',
    count: 1,
    text: 'Mélangez cette carte, votre main et la défausse dans le paquet puis PIOCHEZ 5 cartes.',
    async play(g, p, card) {
      g.move(card, 'deck');
      for (const c of p.hand.slice()) g.move(c, 'deck');
      for (const c of g.discardPile.slice()) g.move(c, 'deck');
      g.shuffle(g.deck);
      g.log(`${p.name} mélange Secousse, sa main et la défausse dans le paquet.`);
      await g.draw(p, 5);
    },
  });

  add({
    key: 'blatant_thievery',
    name: 'Vol Flagrant',
    type: 'magic',
    count: 1,
    text: "Regardez la main d'un autre joueur, choisissez 1 carte et prenez-la en main.",
    requirement: (g, p) => g.othersOf(p).some((q) => q.hand.length > 0),
    async play(g, p, card) {
      const q = await g.choosePlayer(p, {
        prompt: 'Vol Flagrant : quelle main voulez-vous regarder ?',
        options: g.othersOf(p).filter((x) => x.hand.length > 0),
        purpose: 'look_hand',
        source: card,
      });
      if (!q) return;
      const pick = await g.chooseCard(p, {
        prompt: `Vol Flagrant : prenez 1 carte dans la main de ${q.name}.`,
        options: q.hand.slice(),
        purpose: 'take_hand',
        source: card,
        alwaysAsk: true,
      });
      g.move(pick, 'hand', p);
      g.log(`${p.name} regarde la main de ${q.name} et lui prend 1 carte.`);
      g.emit({ type: 'private', to: null, victim: q, victimText: `${p.name} vous a pris ${g.describe(pick)}.` });
    },
  });

  add({
    key: 'reset_button',
    name: 'Remise à Zéro',
    type: 'magic',
    count: 1,
    text: 'Chaque joueur (y compris vous) doit SACRIFIER toutes les cartes Amélioration et Attaque de son Écurie. Mélangez ensuite la défausse dans le paquet.',
    requirement: (g, p) => p.stable.some(isUpgradeOrDowngrade),
    async play(g, p) {
      for (const q of g.playersFrom(p)) {
        for (const c of q.stable.filter(isUpgradeOrDowngrade)) await g.sacrifice(q, c);
      }
      g.shuffleDiscardIntoDeck();
    },
  });

  add({
    key: 'kiss_of_life',
    name: 'Le Baiser de la Vie',
    type: 'magic',
    count: 1,
    text: 'Ajoutez à votre Écurie 1 carte Licorne de la défausse.',
    requirement: (g, p) => g.discardPile.some((c) => g.isUnicorn(c) && g.canEnter(c, p)),
    async play(g, p, card) {
      await bringFromDiscard(g, p, card);
    },
  });

  add({
    key: 'glitter_bomb',
    name: 'Bombe de Paillettes',
    type: 'upgrade',
    count: 2,
    text: 'Si cette carte se trouve dans votre Écurie au début de votre tour, vous pouvez SACRIFIER 1 carte puis DÉTRUIRE 1 carte.',
    beginTurn: {
      async declare(g, p, card, reserved) {
        const sac = await declareSacrifice(g, p, card, reserved, 'Bombe de Paillettes : SACRIFIER 1 carte puis DÉTRUIRE 1 carte ?');
        if (!sac) return null;
        const target = await declareTarget(g, p, card, reserved, g.destroyable(p, anyCard, card), 'Bombe de Paillettes : choisissez la carte à DÉTRUIRE.', 'destroy');
        return { sac, target, snap: target && g.snapshot(target) };
      },
      async resolve(g, p, card, plan) {
        if (await g.sacrifice(p, plan.sac)) await destroyDeclared(g, p, plan.target, plan.snap);
      },
    },
  });

  add({ key: 'yay', name: 'Youpi !', type: 'upgrade', count: 2, notInTwoPlayer: true, text: 'Les cartes que vous jouez ne sont pas affectées par les cartes Huuue.' });

  add({ key: 'rainbow_aura', name: 'Aura Arc-en-Ciel', type: 'upgrade', count: 1, text: 'Vos cartes Licorne ne peuvent pas être détruites.' });

  add({
    key: 'double_dutch',
    name: 'Saut à Deux Cordes',
    type: 'upgrade',
    count: 1,
    text: "Si cette carte se trouve dans votre Écurie au début de votre tour, vous pouvez jouer 2 cartes pendant votre Phase d'Action.",
    beginTurn: { plays: 2 },
  });

  add({
    key: 'claw_machine',
    name: 'Machine à Pince',
    type: 'upgrade',
    count: 3,
    text: 'Si cette carte se trouve dans votre Écurie au début de votre tour, vous pouvez DÉFAUSSER 1 carte puis PIOCHER 1 carte.',
    beginTurn: {
      async declare(g, p, card, reserved) {
        const cards = await declareDiscards(g, p, card, reserved, 1, 'Machine à Pince : DÉFAUSSER 1 carte puis PIOCHER 1 carte ?');
        return cards ? { cards } : null;
      },
      async resolve(g, p, card, plan) {
        if (discardDeclared(g, p, plan.cards)) await g.draw(p, 1);
      },
    },
  });

  add({
    key: 'stable_artillery',
    name: "Arsenal d'Écurie",
    type: 'upgrade',
    count: 3,
    text: 'Si cette carte se trouve dans votre Écurie au début de votre tour, vous pouvez DÉFAUSSER 2 cartes puis DÉTRUIRE 1 carte Licorne.',
    beginTurn: {
      async declare(g, p, card, reserved) {
        const cards = await declareDiscards(g, p, card, reserved, 2, "Arsenal d'Écurie : DÉFAUSSER 2 cartes puis DÉTRUIRE 1 carte Licorne ?");
        if (!cards) return null;
        const target = await declareTarget(g, p, card, reserved, g.destroyable(p, (c) => g.isUnicorn(c), card), "Arsenal d'Écurie : choisissez la carte Licorne à DÉTRUIRE.", 'destroy');
        return { cards, target, snap: target && g.snapshot(target) };
      },
      async resolve(g, p, card, plan) {
        if (discardDeclared(g, p, plan.cards)) await destroyDeclared(g, p, plan.target, plan.snap);
      },
    },
  });

  add({
    key: 'rainbow_lasso',
    name: 'Lasso Arc-en-Ciel',
    type: 'upgrade',
    count: 1,
    text: 'Si cette carte se trouve dans votre Écurie au début de votre tour, vous pouvez DÉFAUSSER 3 cartes puis VOLER 1 carte Licorne.',
    beginTurn: {
      async declare(g, p, card, reserved) {
        const cards = await declareDiscards(g, p, card, reserved, 3, 'Lasso Arc-en-Ciel : DÉFAUSSER 3 cartes puis VOLER 1 carte Licorne ?');
        if (!cards) return null;
        const target = await declareTarget(g, p, card, reserved, g.stealable(p, (c) => g.isUnicorn(c)), 'Lasso Arc-en-Ciel : choisissez la carte Licorne à VOLER.', 'steal');
        return { cards, target };
      },
      async resolve(g, p, card, plan) {
        if (!discardDeclared(g, p, plan.cards)) return;
        const t = plan.target;
        if (t && t.zone === 'stable' && t.owner !== p.index && g.canEnter(t, p)) await g.steal(p, t);
      },
    },
  });

  add({
    key: 'caffeine_overload',
    name: 'Overdose de Caféine',
    type: 'upgrade',
    count: 1,
    text: 'Si cette carte se trouve dans votre Écurie au début de votre tour, vous pouvez SACRIFIER 1 carte puis PIOCHER 2 cartes.',
    beginTurn: {
      async declare(g, p, card, reserved) {
        const sac = await declareSacrifice(g, p, card, reserved, 'Overdose de Caféine : SACRIFIER 1 carte puis PIOCHER 2 cartes ?');
        return sac ? { sac } : null;
      },
      async resolve(g, p, card, plan) {
        if (await g.sacrifice(p, plan.sac)) await g.draw(p, 2);
      },
    },
  });

  add({ key: 'barbed_wire', name: 'Fils Barbelés', type: 'downgrade', count: 1, text: 'Chaque fois qu\'une carte Licorne entre ou sort de votre Écurie, DÉFAUSSEZ 1 carte.' });

  add({ key: 'pandamonium', name: 'Pandamonium', type: 'downgrade', count: 1, text: 'Toutes vos Licornes sont considérées comme des Pandas. Ils ignorent les effets qui affectent les cartes Licorne.' });

  add({
    key: 'sadistic_ritual',
    name: 'Rituel Sadique',
    type: 'downgrade',
    count: 1,
    notInTwoPlayer: true,
    text: 'Si cette carte se trouve dans votre Écurie au début de votre tour, SACRIFIEZ 1 carte Licorne puis PIOCHEZ 1 carte.',
    beginTurn: {
      mandatory: true,
      async declare(g, p, card, reserved) {
        const options = p.stable.filter((c) => g.isUnicorn(c));
        const sac = await declareTarget(g, p, card, reserved, options, 'Rituel Sadique : choisissez la carte Licorne à SACRIFIER.', 'sacrifice');
        return sac ? { sac } : null;
      },
      async resolve(g, p, card, plan) {
        if (await g.sacrifice(p, plan.sac)) await g.draw(p, 1);
      },
    },
  });

  add({ key: 'slowdown', name: 'Ralentissement', type: 'downgrade', count: 1, notInTwoPlayer: true, text: 'Vous ne pouvez pas jouer de cartes Huuue.' });

  add({ key: 'nanny_cam', name: 'Caméra Espionne', type: 'downgrade', count: 1, notInTwoPlayer: true, text: 'Votre main doit être visible pour tous les joueurs.' });

  add({ key: 'broken_stable', name: 'Écurie en Travaux', type: 'downgrade', count: 1, text: 'Vous ne pouvez pas jouer de cartes Amélioration.' });

  add({ key: 'blinding_light', name: 'Lumière Aveuglante', type: 'downgrade', count: 1, text: 'Toutes vos cartes Licorne sont considérées comme des Licornes Standards sans aucun effet.' });

  add({ key: 'tiny_stable', name: 'Écurie Trop Petite', type: 'downgrade', count: 1, text: 'Si, à n\'importe quel moment, votre Écurie contient plus de 5 Licornes, SACRIFIEZ 1 carte Licorne.' });

  add({
    key: 'neigh',
    name: 'Huuue',
    type: 'instant',
    count: 14,
    text: NEIGH_TEXT,
  });

  add({
    key: 'super_neigh',
    name: 'Super Huuue',
    type: 'instant',
    count: 1,
    text: NEIGH_TEXT + " Le Super Huuue n'est pas affecté par les cartes Huuue.",
  });

  UU.CARDS = CARDS;
  UU.plural = plural;
  UU.TYPE_NAMES = {
    baby: 'Bébé Licorne',
    basic: 'Licorne Standard',
    magical: 'Licorne Magique',
    magic: 'Magie',
    upgrade: 'Amélioration',
    downgrade: 'Attaque',
    instant: 'Illico',
  };
})(typeof window !== 'undefined' ? window : globalThis);
