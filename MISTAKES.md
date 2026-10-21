# Mistakes

This file lists my mistakes, and what I first understood wrongly.

## Rules research (sub-agent)

- I used `set -- $p` to split a string in zsh.
  zsh does not split unquoted variables, so curl got a bad path.
  The fix is to call a function with separate arguments.
- I first thought that the RulesPal page was the 2nd edition rulebook.
  It is the 2018 "Second Print" rule sheet, which Control & Chaos reuses.

## Engine and interface

- A replaced action (Unicorn Phoenix, Black Knight Unicorn) first blocked the "then" part.
  The wiki says that the replaced action counts as done. I changed the engine.
- Queen Bee Unicorn first judged a card by its type in the new Stable.
  The official FAQ says that Queen Bee still applies to Pandas, so the engine now uses the printed type.
- After Rhinocorn, the turn first ended without the End of Turn phase.
  The wiki says that the hand limit still applies.
- Barbed Wire first ignored Pandas. The card acts on the player, so it now triggers for them.
- When two players reached the win at once, I first used the letter tie-break.
  That rule is only for the end of the deck. Now the active player wins first.
- Unicorn Swap could be played when the second part was impossible.
  For example, the other player could have Pandamonium. The choices now keep the whole effect possible.
- The default player name was "Vous". The log then had wrong French, such as "Vous joue".
  The default name is now "Joueur".
- Triggered effects first resolved at once, inside the effect that caused them.
  The rules put them in the next link of the chain. A second fix made the links breadth-first.
- Two-For-One first chose its targets one after the other, so a destroyed Rainbow Aura freed a Unicorn.
  The FAQ says that all targets are chosen together.
- Two-For-One first needed 2 targets, and Reset Button needed nothing. The wiki rulings say otherwise.
- The targets of one link first used the state at the moment of each destroy.
  So destroying Blinding Light first could give back a Flying Unicorn its effect. The state is now frozen at the choice.
- Barbed Wire first resolved before the entering effect.
  So Magical Flying Unicorn could take back the card that Barbed Wire had just discarded.
- The browser test waited for buttons. A single card choice has no button, so the test was stuck.

## Cleanup

- I moved the log scroll into the render step, so the log scrolled down on each render.
  A click on a card then lost the position of a reader in the log. It now scrolls only after new entries.

## Animations

- A card that only glowed after its flight counted as a card in flight.
  So each layout change made it glow again. Only the flight itself counts now.
- After a reshuffle, a card drawn by an opponent flew face up from the discard pile.
  A card that goes through the deck now flies face down from the deck.
- The turn banner and the spotlight stayed on the screen after the player left the game.
- A draw that caused a reshuffle was missing from the feed, because the reshuffle line came first.
- The last play line said "Huuue contré" before the Neigh cards were over.
