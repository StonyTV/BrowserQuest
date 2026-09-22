> Cet état des lieux correspond au jalon 0.2. La branche `codex/mmorpg-v2` a depuis ajouté inventaire en grille, banque, groupes, guildes, chat multicanal, MongoDB, déplacements des joueurs et IA des monstres contrôlés par le serveur. Le suivi actuel est dans [V2.md](V2.md) ; progression et identité récupérable ont également été ajoutées ; métiers/craft et percepteurs restent à traiter.

# État des lieux et direction

## Ce qui mérite d'être conservé

BrowserQuest possède déjà une boucle multijoueur cohérente : exploration, pathfinding, collisions, zones d'intérêt, créatures, combats, butin, coffres, PNJ, portes, résurrection et chat. Son monde mesure 172 × 314 cases, avec 84 portes, 23 zones de créatures, 233 entités statiques et 24 checkpoints dans les données serveur originales. Le pixel art est homogène et le client Canvas fonctionne encore dans un navigateur actuel.

Le serveur est un monolithe JavaScript, avec une boucle de 50 mises à jour par seconde et des files de messages par joueur. Le client utilise Canvas, RequireJS et jQuery, pas React. Les types et les identifiants de messages sont partagés, mais les déplacements et une partie du rythme visuel reposent sur le client.

## Changements du jalon 0.2

- Lancement unique HTTP + WebSocket ; configuration réseau déduite de l'origine du client, compatible avec `wss` derrière HTTPS.
- Node actuel, dépendances épinglées et lockfile. Remplacement des deux anciennes implémentations WebSocket par `ws` ; suppression de Bison, memcache et sanitizer des dépendances serveur actives.
- Remplacement de `path.exists`, des accès ImageData obsolètes et des dépendances globales qui provoquaient des points de vie invalides ou écrasaient le Map natif.
- jQuery 3.7.1, RequireJS 2.3.8, Underscore 1.13.8 ; adaptation des champs de saisie et de `.size()`.
- Validation des enveloppes JSON, entiers et longueurs ; limite de taille/fréquence, heartbeat, contrôle d'origine WebSocket, fermeture des connexions trop lentes. Fichiers serveur non exposés par HTTP.
- Sauvegarde SQLite du personnage par clé aléatoire de navigateur, stockage du hash côté serveur, exclusion de connexions simultanées sur un personnage.
- Inventaire de 24 objets, équipement manuel, objets uniques, raretés commune/inhabituelle/rare (70/25/5 %) et bonus de 0/1/3, appliqués au combat.
- Or et victoires accordés par le serveur. Sac plein, objet déjà ramassé et objet non possédé contrôlés côté serveur.
- Dégâts des créatures cadencés par le serveur. Contrôle de proximité et cadence des coups du joueur. Les armes déclarées lors de HELLO sont ignorées.

## Limites importantes

Cette version reste un POC. **Les déplacements hérités annoncent une destination au serveur, qui l'accepte si la case est libre : vitesse, chemin complet et traversée des murs ne sont pas encore contrôlés.** Un client modifié peut donc encore contourner la progression en déplaçant son personnage. Les zones d'agression sont encore déclenchées par le client. Les portes ont désormais une vérification source/destination et le combat/loot une vérification de proximité, mais cela ne suffit pas à garantir l'intégrité d'un MMO.

Le serveur est un processus unique avec SQLite synchrone et des structures globales héritées. Aucune montée en charge n'est prouvée ; « capacité 200 » est un paramètre historique, pas un résultat de benchmark. Il n'y a pas de compte récupérable, de migration de schéma, de journal transactionnel d'économie, de supervision de production ni de déploiement Internet dans ce jalon. Le monde n'est pas persisté ; positions et PV reviennent au village à la reconnexion.

Les animations du client restent celles de 2012. Le rythme serveur des monstres est provisoirement uniforme à une seconde. Le jeu reste largement anglophone en dehors du nouvel inventaire. Les succès historiques sont locaux et ne constituent pas un système de quêtes serveur. Pas de guildes, groupes, métiers, craft, échanges, instances ni housing pour l'instant.

## Étapes proposées

1. **0.3 — règles de déplacement et combat complètes côté serveur.** Intentions de déplacement, validation case par case, fréquence fixe, agression serveur, portées et vitesses issues des données. Test de deux clients dont un hostile, tests des portes/mort/reconnexion et sessions de jeu prolongées.
2. **0.4 — personnages et progression.** Authentification récupérable, plusieurs personnages, position/checkpoints persistants, tables d'objets et statistiques composables, dépenses d'or, quêtes simples et équilibrage des premières zones.
3. **0.5 — jouer ensemble.** Invitations et groupes, visibilité des membres, règles de partage de butin/expérience, puis guildes persistantes et permissions.
4. **0.6 — économie.** Ressources récoltables, recettes, métiers, stockage, transactions de craft atomiques ; échanges seulement après garanties anti-duplication.
5. **Plus tard — instances, housing et Unity.** Identité d'instance distincte du monde, transitions contrôlées, persistance dédiée ; client Unity branché sur le protocole validé et testé avec le navigateur.

## Choix d'architecture

Conserver un monolithe modulaire. Séparer progressivement transport, sessions, simulation, inventaire/économie, persistance et contenu. Les fonctions de simulation ne doivent dépendre ni du DOM ni de Unity. Ajouter TypeScript progressivement sur ces frontières quand elles sont stabilisées.

React peut servir à des interfaces riches (journal, guilde, hôtel des ventes), mais n'apporte pas d'avantage au rendu Canvas ni aux règles serveur. Ne pas réécrire le moteur en React. Pour Unity, viser d'abord un petit client capable de se connecter, voir un joueur web, se déplacer et recevoir le même état d'inventaire. Une preuve de compatibilité réseau est plus utile qu'un portage visuel complet anticipé.
