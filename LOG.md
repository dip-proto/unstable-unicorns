# Log

## Step 1: the goal

The user asked for Unstable Unicorns in HTML and JavaScript.
The game must use the French version of the latest edition.
The user must play against the computer.
The user then asked to follow all the rules exactly.

I created the git repository and the `tmp/research` folder.
I started three research tasks: the official rules, the card list, and the French terms.

## Step 2: research

The French research found the French 2nd edition rulebook and all 127 French cards.
The card research found the English 2nd edition texts and the quantities.
The rules research found the official FAQ and the wiki notes for the open cases.
I compared the French and English texts and recorded the differences.

## Step 3: engine and cards

I wrote the engine in `js/engine.js` and the cards in `js/cards.js`.
Each decision goes through a controller, so the browser and the tests share the engine.
I then applied the FAQ and wiki rulings, for example the win check after the effect chain.

## Step 4: computer player and tests

I wrote the computer player in `js/ai.js`.
I wrote 29 scenario tests and a simulation that checks the card invariants.
I tuned the Neigh decisions, because the computer stopped too many cards.

## Step 5: interface

I wrote the page, the styles, the board and the rules summary.
A Playwright test plays full games through the page with random clicks.
I checked the screenshots on a large screen and on a phone screen.
I fixed the card sizes, the layout gaps and the default player name.

## Step 6: reviews

I reviewed all the code with swival, four times.
The reviews found real rule problems in the effect chain and in the targets of one link.
I fixed each one, added a scenario test for it, and recorded it in `MISTAKES.md`.
The last review found no remaining problem.
At the end, 38 rule tests, 300 simulated games and the browser tests pass.
I removed the temporary research pages, the screenshots and the debug scripts.

## Step 7: cleanup

The user asked for a cleanup review of the code, without new features.
Four review agents looked for reuse, simplification, efficiency and fixes at the wrong level.
I removed dead code, merged repeated card logic into shared helpers, and moved card checks into the engine.
For example, `Game.sacrifice` now checks that the card is still in the Stable, so the cards do not repeat that check.
An abandoned game now stops at its next decision, also when only computer players act.
The logs of 150 seeded games stayed exactly the same, so the game plays as before.
Swival found that the log scrolled on each render. I fixed it, and all tests pass.

## Step 8: comments and tests

The user asked for shorter comments that explain the purpose, and fewer redundant tests.
I removed the comments that only repeat the function name, and I rewrote the rest in plain English.
Each sentence now has its own line, with no wrapping inside a sentence.
I removed four scenario tests that other tests already cover, and three lines that set the turn twice.
I checked each removed test: when I broke its behavior on purpose, a remaining test failed.
There are now 34 rule tests, and all tests pass.

## Step 9: animations

The user asked for animations, and a clearer view of each turn and of each play.
The engine now sends an event for each card move, and the log entries name their player and card.
The game itself plays the same: the logs of 150 seeded games did not change.
On the page, each card that changes zone flies to its new place.
A card that goes to a hidden hand flies face down, so the animations show no hidden card.
I added a turn banner, a spotlight on the card that an opponent plays, and the steps of the turn.
I also added a feed of the last plays, the last play of each opponent, and "nouveau" labels.
The log now groups the events of each turn.
Swival found four bugs, and I fixed them. All tests pass.
