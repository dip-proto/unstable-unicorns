(function (root) {
  'use strict';

  const UU = (root.UU = root.UU || {});

  UU.RULES_HTML = `
<h2>Règles du jeu</h2>
<p>Ces règles suivent le livret de la 2e édition française.
Le but est de réunir des Licornes dans son Écurie.
Il en faut 7 de 2 à 5 joueurs, et 6 de 6 à 8 joueurs.</p>

<h3>Mise en place</h3>
<p>Chaque joueur reçoit 5 cartes et place 1 Bébé Licorne dans son Écurie.
Les autres Bébés Licornes forment la Nurserie.
Un Bébé Licorne ne va jamais dans une main, le paquet ou la défausse.</p>
<p>À 2 joueurs, les Licornes Standards et 9 autres cartes sont retirées.
Ce sont Reine de Beauté, Séductrice, Arc-en-Ciel, Mère Poule, Nécromancienne, Caméra Espionne, Rituel Sadique, Ralentissement et Youpi !
Chaque joueur reçoit aussi 1 Huuue en plus de ses 5 cartes.</p>

<h3>Le tour de jeu</h3>
<ol>
<li><strong>Début de tour :</strong> les effets « au début de votre tour » se déclenchent tous en même temps.
Vous déclarez d'abord tous vos choix, puis les effets se résolvent.
Une même carte ne peut pas servir à deux effets.</li>
<li><strong>Pioche :</strong> piochez 1 carte.</li>
<li><strong>Action :</strong> jouez 1 carte de votre main, ou piochez 1 carte.</li>
<li><strong>Fin de tour :</strong> défaussez jusqu'à 7 cartes en main.</li>
</ol>

<h3>Les cartes</h3>
<ul>
<li><strong>Licornes</strong> (Bébé, Standard, Magique) : elles entrent dans votre Écurie.</li>
<li><strong>Magie :</strong> un effet unique, puis la carte part à la défausse.</li>
<li><strong>Amélioration :</strong> un effet positif. Elle se joue dans l'Écurie de n'importe quel joueur.</li>
<li><strong>Attaque :</strong> un effet négatif. Elle se joue elle aussi dans n'importe quelle Écurie.</li>
<li><strong>Illico (Huuue, Super Huuue) :</strong> contre une carte qu'un autre joueur joue de sa main.
La carte contrée part à la défausse.
On peut contrer un Huuue avec un autre Huuue.
Le Super Huuue ne peut pas être contré.</li>
</ul>

<h3>Mots-clés</h3>
<ul>
<li><strong>SACRIFIER :</strong> mettre une carte de votre Écurie à la défausse.</li>
<li><strong>DÉTRUIRE :</strong> mettre une carte de l'Écurie d'un autre joueur à la défausse.</li>
<li><strong>VOLER :</strong> prendre une carte dans l'Écurie d'un autre joueur et la mettre dans la vôtre.</li>
<li><strong>« vous pouvez » :</strong> l'effet est facultatif. Sans ces mots, il est obligatoire.</li>
<li><strong>« puis » :</strong> la seconde action n'a lieu que si la première a eu lieu.</li>
</ul>
<p>Une action impossible est ignorée.
Mais vous ne pouvez pas jouer une carte si vous ne pouvez pas faire vous-même son effet obligatoire.
Par exemple, Poison pour Licorne exige une Licorne à détruire.</p>
<p>Une Licorne volée « entre » dans votre Écurie : son effet d'entrée se déclenche pour vous.</p>
<p>Les cibles d'un même effet sont choisies ensemble, avant de l'appliquer.
Par exemple, Deux pour le Prix d'une désigne ses 2 cibles en même temps.</p>
<p>Un effet déclenché attend la fin de l'effet qui l'a causé.
C'est le cas des effets d'entrée, de Fils Barbelés et de Licorne Tueuse.</p>

<h3>Fin de la partie</h3>
<p>Un joueur gagne dès qu'il a assez de Licornes, une fois tous les effets en cours résolus.
Cela peut arriver pendant le tour d'un autre joueur.</p>
<p>Si un joueur doit piocher dans un paquet vide, la partie s'arrête.
Le joueur qui a le plus de Licornes gagne.
En cas d'égalité, on compte les lettres des noms des Licornes de chaque Écurie.
Si l'égalité persiste, tout le monde perd.</p>

<h3>Choix d'interprétation</h3>
<p>Le livret laisse certains cas ouverts. Voici les choix de ce programme.</p>
<ul>
<li>Ciblage : option 2 du livret. Les joueurs décident de jouer un Huuue avant que vous choisissiez vos cibles.</li>
<li>Les joueurs répondent avec un Huuue dans le sens horaire, à partir du joueur suivant.</li>
<li>Pour Ruade, Licorne Sirène et Tornade de Paillettes, c'est le joueur qui joue la carte qui choisit la carte reprise en main.
C'est le sens du texte anglais d'origine.</li>
<li>Une carte Magie reste « en cours » pendant son effet. Elle part à la défausse ensuite.
Vortex Mystique et Remise à Zéro ne se mélangent donc pas eux-mêmes dans le paquet.</li>
<li>Une action remplacée (Licorne Phénix, Licorne Chevalier Noir) compte comme faite pour un « puis ».</li>
<li>Les actions reliées par « et » se font dans l'ordre imprimé. La Chance Tourne fait donc piocher avant de défausser.</li>
<li>Deux pour le Prix d'une se joue s'il y a une carte à sacrifier. Elle détruit ensuite autant de cartes que possible, jusqu'à 2.</li>
<li>Les Pandas ne sont pas des Licornes. Les effets « 1 carte Licorne » ne les touchent pas.
Les effets « 1 carte » peuvent les toucher. Leurs propres effets restent actifs.</li>
<li>Licorne Reine de Beauté juge la carte qui entre selon son type imprimé.</li>
<li>Fils Barbelés se déclenche aussi pour un Panda.</li>
<li>« Votre tour prend fin immédiatement » mène directement à la Phase de Fin de Tour.</li>
<li>Si deux joueurs atteignent le but en même temps, le joueur actif gagne, puis le suivant dans le sens horaire.</li>
<li>Le décompte des lettres ignore les espaces, tirets et apostrophes, et la couleur des Bébés et des Standards.</li>
</ul>
`;
})(typeof window !== 'undefined' ? window : globalThis);
