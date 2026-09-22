# Protocole 7 du prototype

Transport : WebSocket texte JSON. `/status` indique `protocol: 7`. L’upgrade exige soit le cookie HttpOnly du navigateur de même origine, soit `Authorization: Bearer <access_token Supabase>` pour un client natif. La vérification d’identité est commune au HTTP et au WebSocket. Les SDK Unity/Steam/mobile ne sont pas encore intégrés.

Après l’authentification HTTP et `GET /api/characters`, le serveur envoie `go`. Le client sélectionne un personnage possédé :

```json
[0, "Nom indicatif", 21, 60, "uuid-personnage"]
```

Le nom et les identifiants d’équipement sont ignorés au profit du profil serveur. Un UUID appartenant à un autre compte est refusé. Un seul personnage peut être actif par compte, tous les mondes de ce processus confondus. WELCOME puis PROFILE démarrent le jeu ; aucun secret de compte ou de personnage n’est envoyé dans PROFILE. La création se fait par `POST /api/characters`, jamais par HELLO.

La reconnexion réseau nécessite une session valide. Le WebSocket vérifie de nouveau l’identité toutes les 30 secondes. Déconnexion explicite et changement de mot de passe ferment immédiatement les connexions concernées. Voir [ACCOUNTS.md](ACCOUNTS.md).

Le format HELLO historique à clé locale reste limité à `NODE_ENV=test BQ_TEST_LEGACY_AUTH=1` sur loopback. Un profil déjà rattaché à un compte ne s’ouvre plus par cette clé, même dans ce mode.

Les messages sortants sont soit un tableau d'action, soit un tableau de tableaux (batch). Les identifiants d'entités sont numériques. Les identifiants d'objets d'inventaire sont des UUID, différents de l'objet temporaire au sol.

| Identifiant | Sens | Contenu |
|---|---|---|
| 27 PROFILE | serveur → client | `[27,{id,schemaVersion,name,guildId,bank,gold,kills,capacity,hitPoints,maxHitPoints,items,equipped}]` |
| 28 INVENTORY_EQUIP | client → serveur | `[28,"uuid-objet"]` |
| 29 INVENTORY_DISCARD | client → serveur | `[29,"uuid-objet"]`, refus si équipé |
| 30 LOOT_RESULT | serveur → client | `[30,idObjetAuSol,succès,message]` |

`items` contient `{id,kind,rarity,bonus,slot}`. `slot` est une case fixe de 0 à 23 ; les objets déposés dans `bank.items` n’ont pas de case du sac. `bank` contient aussi le solde `gold`. `equipped` contient `{weapon:uuid,armor:uuid}`. Une mutation valide renvoie PROFILE complet. Le serveur tire les raretés, calcule les bonus, contrôle la propriété et persiste l'état. Le mode de test historique seul expose une clé de personnage `token` ; ne jamais la journaliser.

Les messages originaux 0–26 sont définis dans `shared/js/gametypes.js`, leur validation entrante dans `server/js/format.js` et leur sérialisation sortante dans `server/js/message.js`. AGGRO (6) et HURT (9) sont ignorés : les monstres infligent désormais leurs dégâts via la boucle serveur. HIT (8) vérifie cible de type créature, contact orthogonal (ou même case), créature hors retour au point de départ et délai minimum de 600 ms. Le client web attaque normalement toutes les 800 ms.

Limites : message entrant 8 Kio, 100 messages/seconde/connexion, chaînes de 256 caractères maximum, WHO de 511 identifiants maximum. Ping/pong toutes les 30 secondes. Le navigateur doit présenter la même origine ; les clients natifs peuvent omettre Origin. L'origine n'est pas un mécanisme d'authentification.

Avant un client alternatif distribué publiquement, prévoir une négociation de version explicite, des erreurs typées et des snapshots globaux avec tick. Les règles du protocole 5 restent valides et contrôlent les routes des joueurs et les décisions des monstres. Aucune garantie anti-triche complète n’est établie.

## Créatures autoritaires

`[36,id,x,y,cibleOuNull,état,duréePasMs,orientation,frappe]` est exclusivement serveur → client. Les états sont `idle`, `chasing`, `attacking`, `returning`. `frappe: true` déclenche une animation de coup réellement décidé par le serveur ; les PV arrivent avec HEALTH/ENTITY_INFO. Les positions sont les cases exécutées, pas une destination à rejoindre librement. Le client interpole ces positions, sans pathfinding, détection d’agression ni répétition autonome des coups pour les monstres. Un snapshot suit chaque SPAWN, y compris lorsqu’un joueur entre dans une zone déjà en combat.

`shared/content/mobs.json` déclare PV, armure, arme, butins, durée de pas, intervalle d’attaque et rayon d’agression par espèce. Rats et chauves-souris sont passifs ; un coup valide crée leur hostilité. Les autres créatures détectent les joueurs vivants accessibles à courte distance. Le pathfinding orthogonal évite collisions et PNJ, avec une recherche bornée à 1 024 cases et un territoire de 12 cases autour du point de départ. Les créatures choisissent des cases de mêlée distinctes ; elles peuvent se croiser pendant leur marche.

La cible suit l’hostilité générée par les coups. Mort, déconnexion ou porte retirent le joueur des listes d’hostilité et permettent une reprise sur un autre attaquant vivant dans le territoire. Sans cible valide, ou après trois secondes sans chemin, le monstre revient à pied. Il ignore les coups pendant ce retour et récupère tous ses PV à l’arrivée. Aucun tick retardé ne permet plusieurs pas ou coups instantanés. Les monstres ne traversent pas les portes.

## Déplacement autoritaire

| Identifiant | Sens | Contenu |
|---|---|---|
| 34 MOVE_PATH | client → serveur | `[34,sequence,[[x0,y0],[x1,y1],…]]` |
| 35 POSITION | serveur → propriétaire | `[35,sequence,x,y,status]` |
| 4 MOVE | serveur → observateurs | `[4,idJoueur,x,y]`, position réellement atteinte |
| 15 TELEPORT | client → serveur | `[15,xDestination,yDestination]`, via une porte autorisée |

`sequence` est un entier strictement positif croissant pendant la connexion, réinitialisé à la résurrection. Une ancienne séquence est ignorée. La route inclut son origine et au plus 128 cases. Chaque pas est orthogonal, adjacent, dans la carte, hors collision et hors PNJ. Les autres joueurs et les monstres ne bloquent pas les routes côté serveur. Les anciennes commandes entrantes MOVE (4) et LOOTMOVE (5) arrêtent le chemin et renvoient la position réelle ; elles ne déplacent plus le personnage.

La cadence vient de `shared/content/movement.json` : une case toutes les 160 ms au minimum. Un paquet répété ou un tick retardé n’accorde pas de pas supplémentaire. Un changement de direction peut commencer à la position courante, dans la partie de la nouvelle route déjà atteinte, ou jusqu’à trois pas en avance **uniquement sur le chemin précédemment validé**. Ce préfixe doit toujours être parcouru ; il ne téléporte pas le joueur.

Statuts POSITION : `accepted` (chemin validé), `moving` (pas effectué), `arrived`, `rejected`, `teleport`. Le client web anime immédiatement sa proposition et se recale sur une correction. Il ignore les corrections d’une ancienne séquence pour son rendu. Un client alternatif peut simplement attendre les positions serveur. Visibilité, chat de zone et contrôles de proximité utilisent la position réelle.

Une demande de porte reçue avant le dernier pas attend l’arrivée exacte sur la case source. La destination doit correspondre à la porte de la carte. Le client applique la téléportation après POSITION `teleport`. Cliquer une porte sous le personnage permet de l’emprunter explicitement, sans rebond automatique à l’arrivée. Les anciens observateurs reçoivent la téléportation/destruction et les nouveaux reçoivent le spawn.

Recharger le client web après mise à jour depuis le protocole 3. La connexion ne négocie pas encore explicitement les versions. Les pertes prolongées ne sont pas traitées comme un système de rollback complet : une correction interrompt la route et permet de choisir une nouvelle destination.

## Commandes sociales et bancaires

`[31, action, payload]` reçoit soit PROFILE après mutation du personnage, soit un événement `[32, type, data]`. Une règle métier refusée donne `notice` avec `{error:true,action,message}`. L’enveloppe est limitée à 8 Kio comme les autres messages. Les identifiants de personnages des commandes sociales sont les UUID de PROFILE/social, pas les identifiants numériques de connexion.

| Action | Payload |
|---|---|
| `service.open` | `{id: idNumeriquePNJ}` ; proximité de 3 cases requise |
| `inventory.move` | `{id: uuidObjet, slot: 0..23}` ; échange si occupé |
| `bank.item` | `{id: uuidObjet, deposit: bool}` |
| `bank.gold` | `{amount: entierPositif, deposit: bool}` |
| `guild.create` | `{name, tag, crest:{frame,symbol,primary,secondary}}` |
| `guild.invite`, `party.invite` | `{id: uuidPersonnage}` |
| `invitation.answer` | `{id: idInvitation, accept: bool}` |
| `party.leave`, `guild.leave` | `{}` |
| `party.kick`, `guild.kick` | `{id: uuidPersonnage}` |
| `guild.role` | `{id: uuidPersonnage, role: leader|officer|member}` |
| `guild.crest` | `{crest}` |
| `chat.send` | `{channel: zone|trade|recruitment|party|guild, body}` |

La banque et la création de guilde exigent une ouverture de service et la proximité encore valide à chaque mutation. Banque : 72 objets, aucun objet porté déposable. Guilde : 25 or à la création, maximum 30 membres ; blason limité aux formes/symboles du catalogue, couleurs hexadécimales. Groupe : 5 membres, invitations 60 secondes, changement de chef au départ. Les constantes et PNJ sont dans `shared/content/social.json`.

Événements : `social` contient les joueurs en ligne, le groupe, la guilde et les invitations du destinataire ; `service` ouvre un panneau PNJ ; `chat` porte `{id,channel,name,entityId,body,time}` ; `notice` porte `{message,error?,action?}`. Aucun secret de session d’un autre joueur n’y figure. Les groupes sont temporaires ; guildes, blasons, rangs, banque et inventaire sont persistés.

`[33,idEntite,{name,hp,maxHp,guildTag,crest,services}]` complète les entités du monde. Les métadonnées peuvent précéder SPAWN ; le client les garde par identifiant. Dégâts et régénération réémettent les PV. L’appartenance de guilde est également affichable sous le nom.

Chat de zone : groupe spatial serveur de 28 × 12 cases. Commerce/recrutement : monde entier, délai de 5 secondes. Zone : 1 seconde. Groupe/guilde : 500 ms et appartenance requise. Le délai est global par personnage pour empêcher de contourner l’attente en changeant de canal. L’ancien CHAT (11) est traduit en `chat.send` de zone, soumis aux mêmes règles.


## Expérience et niveaux

Le schéma de profil 3 ajoute `experience`, entier total persistant. Les anciens profils reçoivent 0 sans modification de leurs possessions. PROFILE ajoute `progression:{level,maxLevel,current,required,healthBonus,damageBonus,defenseBonus}` et `stats:{attackBonus,defenseBonus,attackMin,attackMax,armorRank,maxHitPoints}`, calculés côté serveur. `current` et `required` concernent le niveau courant ; `required:0` indique le plafond. `attackMin/Max` expriment la puissance avant défense de la cible, pas des dégâts garantis. ENTITY_INFO et les membres des snapshots sociaux ajoutent `level` pour les joueurs. Ces champs sont des extensions additives du protocole 5.

Après la sauvegarde d’une victoire, l’événement `experience` contient `{gained,levels,level}` pour chaque bénéficiaire. Aucune commande cliente ne peut accorder de l’XP ou fixer un niveau. `shared/content/progression.json` définit les seuils et bonus ; chaque espèce dans `mobs.json` déclare sa récompense d’expérience.

Le pool est divisé entre l’auteur du dernier coup et les membres de son groupe vivants, connectés, à 12 cases au maximum du monstre (distance de grille Chebyshev). Le reliquat est distribué dans l’ordre, auteur du coup puis ordre des membres. Le plafond n’est pas dépassé et les parts plafonnées ne sont pas redistribuées. L’auteur du coup conserve seul l’or et le compteur de victoires. Tous les profils bénéficiaires sont enregistrés dans une transaction avant application en mémoire et envoi des confirmations. La montée augmente le maximum de PV sans soin instantané. Mort et reconnexion ne retirent aucune XP.

## Récolte et fabrication — protocole 7, profil 4

Le profil ajoute `professions:{lumbering:xp,mining:xp,smithing:xp}` (clés absentes = 0). Les équipements conservent leur format ; ceux fabriqués ajoutent `craftedBy` (nom de l’artisan au moment de création). Les ressources `kind:100` (bois) et `101` (fer) ont `{id,kind,quantity,rarity:"common",slot}`, sans bonus et ne sont pas équipables. Les piles occupent chacune une case, maximum 99 unités. La banque transfère la pile entière, sans fusion automatique ni découpage.

Les entités `70` et `71` sont des nœuds immobiles utilisant le transport NPC existant. `ENTITY_INFO` ajoute `harvest:{state,until,actor}` : `ready`, `harvesting` ou `depleted`, échéance serveur en millisecondes Unix et nom du récolteur. `service.open` renvoie le descriptif déclaratif `resource` et ce même état ; Brann renvoie le service `craft`.

- `[31,"resource.harvest",{id:entité}]` : proximité de 2 cases, immobile et hors combat. Le serveur réserve le nœud, contrôle durée et capacité, sauvegarde récompense/XP avant PROFILE et événement de fin. Mouvement, dégâts, combat, mort ou déconnexion interrompent sans récompense.
- Événement `harvest` : `harvesting` avec échéance/durée, `cancelled` ou `complete` avec message. Les autres joueurs reçoivent l’état public du nœud, jamais le profil privé.
- `[31,"craft.make",{recipe:"steel-sword"}]` : service atelier précédemment ouvert, PNJ à 3 cases, niveau/coûts/capacité contrôlés. Ingrédients et pièces sont débités avec création de l’objet et XP dans une seule sauvegarde du profil. Délai de 800 ms entre succès ; erreurs via `notice` avec l’action concernée. Événement `craft` après sauvegarde : `{id:uuidObjet,message}`.

`shared/content/crafting.json` est la source partagée des professions, seuils, ressources, positions et recettes. Le serveur reste seul auteur des récompenses et des jets d’objet. Les niveaux de métier plafonnent à 10 ; les trois recettes de ce jalon demandent les niveaux 1–3 de forgeron. Les points de récolte et leur renouvellement sont en mémoire du monde et réinitialisés au redémarrage ; les objets et XP sont durables. L’équilibrage économique n’est pas encore validé. Rechargez les anciens clients web : ils ne connaissent pas ces nouveaux types d’entités.
