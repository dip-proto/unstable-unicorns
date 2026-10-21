# Notes and progress

## Progress

- [x] Research of the official rules (2nd edition, French and English)
- [x] Research of the card list (127 cards) and of the French card texts
- [x] Game engine
- [x] Computer player
- [x] Browser interface
- [x] Rule tests, simulations and browser tests

## Sources

The research files are in `tmp/research`.

- `french_rules_wikitext.txt`: the French 2nd edition rulebook.
- `french_cards.json` and `french.md`: the French names and texts of all cards.
- `cards.md`: the English 2nd edition card list.
- `rules.md`: the English rules, the official FAQ, and the open questions.

The French texts come from a fan wiki transcription. It has some typos.
`french.md` lists them, and `js/cards.js` uses the corrected text.

## Rule decisions

The rulebook says that the players must choose a targeting option.
The game uses option 2: players decide to play a Neigh card before you choose the targets.

The official FAQ adds two rules that the game follows.
First, you cannot play a card if you cannot do its mandatory effect yourself.
For example, Unicorn Poison needs a Unicorn to destroy.
Second, the beginning of turn effects are simultaneous.
You declare all the choices first, and one card cannot serve two effects.
Then the effects resolve, mandatory effects first.

A player wins when the effect chain is over, and not during an effect.
This comes from the 2018 rule sheet and the wiki. It also makes Tiny Stable work.

The effect chain works in links.
All the effects of one card, or all the beginning of turn effects, form one link.
The targets of one link are chosen together.
A target keeps the state it had at that moment: a change of protection or of Blinding Light during the link has no effect.
The effects that a link triggers form the next link: entering effects, Barbed Wire, Stabby the Unicorn.
`Game.simultaneously` and `Game.trigger` in `js/engine.js` implement this.

These cases are open in the rulebook. Here are the decisions:

+------------------------------+------------------------------------------------------------+
| Case                         | Decision                                                   |
+------------------------------+------------------------------------------------------------+
| Deck runs out                | The game ends when a player must draw from an empty deck.  |
|                              | A setting allows the official reshuffle variant.           |
| Neigh order                  | Players answer clockwise, after the player of the card.    |
| Two players win at once      | The active player first, then clockwise.                   |
| Who picks the returned card  | Back Kick, Mermaid Unicorn and Glitter Tornado: the player |
|                              | of the card picks. This is the English text.               |
| Magic card during its effect | It stays "in play", then goes to the discard pile.         |
|                              | So Mystical Vortex does not shuffle itself into the deck.  |
| Replaced action and "then"   | Phoenix or Black Knight replacement counts as done.        |
| Pandas                       | Effects on "Unicorn cards" ignore them. Effects on "a      |
|                              | card" can target them. Their own effects stay active.      |
| Queen Bee Unicorn            | It checks the printed type of the card that enters.        |
| Barbed Wire                  | It triggers for Pandas too, because it acts on the player. |
| "End your turn immediately"  | The game goes to the End of Turn phase. The hand limit     |
|                              | still applies.                                             |
| Super Neigh                  | It is a Neigh card. Ginormous Unicorn, Slowdown and Yay    |
|                              | apply to it.                                               |
| Letter count                 | Letters of the French name only, no color, no spaces.      |
| Actions joined by "and"      | Printed order (2018 rule sheet). Change of Luck draws 2,   |
|                              | then discards 3. It needs 1 more card in hand to be played.|
| Two-For-One                  | It needs a card to sacrifice. Then it destroys as many     |
|                              | cards as possible, up to 2 (wiki).                         |
| Reset Button                 | It needs an Upgrade or Downgrade card in your Stable.      |
| Unicorn played from the hand | It always goes into your own Stable.                       |
+------------------------------+------------------------------------------------------------+

## Computer player

The computer uses only public information and its own hand.
It scores each possible choice with simple values.
A player near the win is a bigger threat, so the computer attacks that player first.
It keeps its Neigh cards for important plays. With more Neigh cards, it uses them more easily.

## Results of the simulations

With 2 to 4 players, most games end with a win by Unicorns.
With 6 or more players, the deck often runs out first.
The official FAQ says the same thing about large games.
