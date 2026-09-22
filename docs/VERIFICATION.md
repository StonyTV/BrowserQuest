# Vérification du jalon 0.2 — 22 septembre 2026

## Automatisée

`npm test` : **8 tests réussis** sur Node 26.9.0, dont un serveur enfant isolé sur port aléatoire, base SQLite temporaire et vrais clients WebSocket.

- HTTP client et protocole partagé accessibles ; configuration serveur et `.git` non exposés ; chemin avec octet nul rejeté.
- Deux joueurs, points de vie valides, chat dans une même zone, population correcte ; équipement forgé dans HELLO ignoré.
- JSON invalide, mauvaise enveloppe et mauvaises commandes ferment uniquement la connexion concernée.
- Loot distant refusé, collecte unique, équipement possédé uniquement, impossibilité de jeter l'objet porté, reconnexion avec inventaire intact et refus d'une session simultanée.
- Dégâts de créature sans message HURT du client ; récompense de mort unique en or et compteur de victoires.
- Sac plein : refus de ramassage, objet conservé dans le monde.
- Raretés, bonus et contrôle de propriété des équipements.
- Fermeture/réouverture de SQLite : conservation de l'état ; clé inconnue refusée.

`npm audit` : **0 vulnérabilité connue signalée**, pour les quatre dépendances installées. Ce contrôle ne constitue pas un audit du moteur historique ou des autres scripts embarqués.

`npm run vendor` et `git diff --check` : réussis.

## Navigateur

Parcours effectué avec Chromium piloté via le skill Playwright, sur le client réel : entrée dans le monde, combat par clic sur une créature, dégâts reçus, victoire et gain d'or. Ramassage guidé par la méthode de pathfinding normale du client, ouverture du sac, clic sur « Équiper », puis reconnexion et redémarrage réel du serveur.

État confirmé après redémarrage : arme `sword2`, PV `80/80`, **5 objets, 9 or, 4 victoires**. Versions effectivement chargées : jQuery 3.7.1, Underscore 1.13.8, RequireJS 2.3.8.

Deux contextes Chromium indépendants ont ensuite rejoint le même monde, se sont retrouvés via le pathfinding client et ont échangé un message visible dans la bulle de chat. La session stable de reconnexion ne remonte aucune erreur JavaScript.

Captures locales (ignorées par Git) :

- `output/playwright/first-kill.png`
- `output/playwright/equipped-loot.png`
- `output/playwright/reconnected.png`
- `output/playwright/multiplayer-chat.png`

Des erreurs ont été observées puis corrigées pendant le développement : sprites chargés trop tôt, PV non numériques, musiques absentes, Map global écrasant le type natif, sac derrière le Canvas et nettoyage répété d'une cible. Les connexions interrompues lors des redémarrages de développement ont été distinguées des vérifications sur serveur stable.

## Limites de preuve

Pas de test de charge, pas de session de plusieurs heures, pas de parcours exhaustif des 84 portes ni de toutes les créatures/coffres, pas de preuve Safari/Firefox/appareil mobile ou Unity. Les tests ne démontrent pas l'absence totale de bugs ni une sécurité suffisante pour un MMO public. Voir les limites de mouvement, d'identité et d'économie dans `ROADMAP.md`.

## Jalon social V2 — 0.3.0-alpha.1

`npm test` : **10 tests réussis**, dont un parcours social avec trois connexions WebSocket indépendantes. Les nouvelles preuves couvrent :

- Déplacement/échange de cases fixes, propriété des objets, transfert bancaire sans duplication, refus d’un objet équipé, montants invalides/insuffisants.
- Création auprès du PNJ, débit de 25 or, invitation privée et acceptation par le seul destinataire ; blason modifiable par le meneur, transfert du rôle de meneur.
- Messages de groupe et de guilde reçus par les membres et absents chez le tiers ; canal inconnu/refus d’appartenance et limitation de l’ancien CHAT également vérifiés.
- Groupe à deux, succession du chef à la déconnexion ; guilde et banque conservées à la reconnexion et après réouverture de la base.

Parcours **deux contextes Chromium** via `scripts/browser-social.js` : 24 cases affichées, déplacement vers une case vide, approche par pathfinding et clic réel sur Ysée, création d’une guilde avec bannière/cerf, invitation et acceptation sur l’autre client, groupe à deux, message de guilde visible, banque objets/or, retrait, équipement d’une arme rare, combat déclenché par clic et victoire. Aucun événement JavaScript `pageerror` sur ce parcours final. Affichage à 390 × 844 sans débordement horizontal.

Captures dans `output/playwright/` : `v2-guild-creation.png`, `v2-guild-multiplayer.png`, `v2-bank.png`, `v2-combat.png`, `v2-mobile-inventory.png`. Les personnages de ces essais sont préparés dans **output/social-qa.sqlite**, distincte de la base jouable.

Corrections issues de ces essais : conversion souris après déplacement continu de la caméra, clics des panneaux ne commandant plus le monde, aide de première connexion non bloquante, libellés explicites des champs de blason, arrivée près des services sociaux. Les limitations générales ci-dessus restent valables : aucun test de charge ou appareil physique, mouvement encore à rendre entièrement autoritaire, migration MongoDB encore à faire.

Démarrage à froid en Chromium mobile émulé (390 × 844, `isMobile` et `hasTouch`) : écran de création en portrait, entrée par toucher, sélection d’objet, déplacement vers la case 24 et déplacement du personnage par toucher. Aucun `pageerror`, aucun débordement horizontal. Captures : `v2-mobile-login.png` et `v2-mobile-touch.png`. Cette émulation ne remplace pas un essai sur téléphone physique.


## Stockage V2 — 0.3.0-alpha.2

`npm run test:mongo` : **18 tests réussis** sur un vrai MongoDB Docker en replica set local. `npm test` : **13 réussis, 5 tests MongoDB explicitement ignorés** ; la régression SQLite reste exécutable sans Docker.

Nouvelles preuves : file de commandes ordonnée jusqu’à la déconnexion, absence de confirmation ou modification mémoire lors d’un échec bancaire, transaction de création de guilde entièrement annulée si le sigle existe, écritures périmées refusées, migration SQLite intégrale et idempotente, cible déjà peuplée protégée, deux dépôts envoyés sans attendre le premier acquittement, arrêt/redémarrage réel du processus et restauration de la banque/guilde. Un conflit d’écriture injecté dans une base de test provoque une déconnexion et un code de sortie 1 sans confirmation ni écrasement de la progression.

Parcours social **deux contextes Chromium**, puis parcours **mobile tactile émulé 390 × 844**, rejoués sur `bq_qa_social` dans MongoDB. Sac 24 cases, blason, guilde, groupe, chat privé, dépôt/retrait, équipement et victoire vérifiés sans événement `pageerror`. Les captures `v2-*.png` ont été renouvelées.

Migration du jeu local : 3 personnages importés ; comparaison de chaque profil avec la source. Chargement de **Jerome** avec la clé navigateur existante : 5 objets, épée en acier portée, 9 or, 4 victoires conservés. Capture : `output/playwright/v2-mongo-restored.png`. `/status` annonce `storage: mongodb`, `version: 0.3.0-alpha.2`, `ready: true`.

Export/restauration QA : archive MongoDB de 3 personnages et 1 guilde restaurée dans une base temporaire ; tous les documents correspondent à la source. Base restaurée supprimée après vérification, archive conservée dans `output/mongo-qa-backup.archive.gz`. Voir [Stockage MongoDB](STORAGE.md) pour les commandes et limites.

Les limites de charge, de mouvement autoritaire et de clients physiques restent ouvertes. Les tests n’établissent pas une disponibilité multi-serveur ni une reprise transparente après panne.

## Déplacements V2 — 0.3.0-alpha.3

`npm run test:mongo` : **26 tests réussis**. Les clients WebSocket d’intégration parcourent désormais de vrais chemins à la cadence du serveur pour rejoindre PNJ, objets et créatures. Aucun raccourci de téléportation de test n’est activé.

Cinq tests ciblent les routes : collisions, diagonales, sauts de case, bords de carte et PNJ ; cadence malgré spam et tick retardé ; changement de direction avec préfixe prédit ; porte en attente de l’arrivée physique et destination contrôlée ; arrêt à la mort et remise à zéro à la résurrection. Un test WebSocket envoie les anciennes commandes de destination, un chemin discontinu et une porte distante : la position reste inchangée et aucun loot distant n’est accordé.

Le parcours social à deux navigateurs, le combat et le parcours mobile tactile ont été rejoués avec ce protocole. `scripts/browser-movement.js` vérifie une marche non instantanée, un changement de direction en cours de route, la même position finale vue par un second joueur, deux corrections après messages volontairement falsifiés, puis un aller-retour réel entre la porte `(27,209)` et l’intérieur `(155,286)`. Une variante ajoutant **150 ms aux commandes sortantes de déplacement/porte** passe également. Elle vérifie que l’autre navigateur ne conserve pas un personnage fantôme à l’ancienne porte. Aucun événement `pageerror` dans ces parcours finaux.

Le ramassage attend l’arrivée confirmée lorsque le client est en avance. Deux tests du module client vérifient cette attente, l’absence de doublon, l’annulation après changement de direction et le ramassage sous un personnage déjà arrivé. La variante navigateur avec délai de 150 ms ramasse un équipement réel après le retour de porte et confirme sa présence dans le sac.

Captures locales : `v2-movement-observer.png`, `v2-door-interior.png`, `v2-door-return.png`, dans `output/playwright/`. Le clic explicite sur une porte sous le personnage a été corrigé après reproduction d’un retour bloqué.

Limites : un aller-retour de porte représentatif testé au navigateur, pas les 84 ; délai artificiel sortant, pas une campagne de perte de paquets ni de charge ; agression et poursuite des monstres encore héritées. Le jalon ne constitue pas une validation anti-triche globale ou MMO public.

## IA des créatures V2 — 0.3.0-alpha.4

`npm run test:mongo` : **35 tests réussis**. Sept tests d’IA à horloge contrôlée couvrent détection sans message client, rats passifs, cadence sans accélération après un tick retardé, détour autour des murs/PNJ, absence de coups diagonaux ou à travers une case, cible inaccessible, limite du territoire, retour à pied, reprise sur un autre attaquant après mort/déconnexion/porte, remise à zéro à la réapparition et cases de mêlée distinctes. Deux tests du rendu vérifient l’interpolation sans poursuite inventée et le rejet des mises à jour d’une créature mourante.

Le test WebSocket de combat confirme qu’un ancien AGGRO envoyé à un rat est sans effet, puis qu’un vrai HIT déclenche sa riposte sans HURT du client. La récompense de mort reste persistée une seule fois. Les parcours MongoDB de banque, guilde, reconnexion, redémarrage et conflit d’écriture restent verts.

`scripts/browser-combat.js`, exécuté avec **deux contextes Chromium** et des personnages isolés dans `bq_qa_ai` : clic réel sur un rat, premier coup, fuite par déplacement normal, poursuite et retour observés par l’autre joueur. Huit pas successifs ont été observés, sans saut de case, jusqu’au point de départ. Ensuite, marche jusqu’aux gobelins du sud : même coup spontané reçu sur les deux connexions ; zéro paquet AGGRO/HURT envoyé par le client ; déconnexion du joueur poursuivi et suppression de sa cible chez le témoin. Aucun `pageerror` sur le parcours final. Captures : `v2-ai-return.png`, `v2-ai-aggro.png`.

Le parcours social complet a été rejoué : sac, déplacement de case, création de guilde/blason, invitation, groupe, chat de guilde, dépôt/retrait bancaire, équipement et victoire par clic. Le parcours tactile émulé 390 × 844 vérifie à nouveau sac, case vide, déplacement et arrivée serveur, sans débordement horizontal ni `pageerror`.

Ces preuves portent sur des groupes de quelques joueurs, pas une charge de 200 connexions. Les routes des créatures sont bornées à leur territoire et elles ne franchissent pas les portes. Elles peuvent se croiser pendant la marche ; l’espacement concerne leurs positions de mêlée. Aucun client Unity ou téléphone physique n’a été validé. Progression/classes, métiers/craft et percepteurs restent ouverts dans le goal V2.


## Interface et concurrence V2 — 0.3.0-alpha.5

`npm run test:mongo` : **37 tests réussis**. Deux nouveaux parcours utilisent de vrais clients WebSocket : deux personnages ramassent simultanément le même objet, puis se reconnectent pour constater une seule copie persistée ; deux fondateurs demandent simultanément le même nom/sigle, puis rejouent leurs demandes. Une seule guilde est créée, le gagnant conserve 75 or et le perdant 100. L’erreur métier contient désormais l’action refusée pour son affichage dans le formulaire concerné.

Le parcours social à deux contextes Chromium a été rejoué : sac et cases vides, déplacement d’objet, création, invitations de guilde et de groupe, chat privé, banque dédiée, équipement et victoire. Les onglets affichent les invitations de leur catégorie et signalent leur nombre.

`scripts/browser-guild-ui.js` vérifie la fondation centrée sans onglets, la boucle clavier dans le formulaire, l’annulation sans paiement et l’absence de mouvement derrière le fond modal. L’arrivée d’un second joueur et son invitation de groupe n’effacent plus le nom, le sigle, les couleurs ni les choix de blason. Deux soumissions synchrones produisent une seule commande. Un nom déjà pris affiche une erreur sur place, conserve les champs et les 100 or ; le joueur corrige puis fonde sa guilde. Un personnage sans or ne peut pas soumettre.

Le même parcours ouvre et personnalise la fondation en Chromium tactile 390 × 844, réduit la hauteur disponible à 500 px, défile jusqu’aux actions et annule par toucher sans débordement horizontal. Une fermeture réelle du WebSocket ferme le dialogue et rend accessible la reconnexion. Ces essais ne constituent pas une preuve de clavier virtuel ou de téléphone physique.

Le parcours de combat à deux navigateurs a aussi été rejoué : sept pas de poursuite observés pour le rat, retour, agression autonome d’un gobelin et nettoyage de la cible à la déconnexion ; aucun ancien paquet AGGRO/HURT ni erreur JavaScript.

Les raccourcis I/G, Échap, l’activation d’un bouton HUD par Espace et la coupure/réactivation du son sont vérifiés. Le parcours tactile du sac a été rejoué (case vide, déplacement d’objet et déplacement réel du personnage), sans débordement ni erreur JavaScript.

Six sprites du HUD contrôlés : RGBA 32 × 32, alpha 0/255 et huit couleurs opaques au maximum. Captures inspectées : `v2-hud-desktop.png`, `v2-hud-mobile.png`, `v2-guild-draft-retained.png`, `v2-guild-mobile.png`, `v2-guild-small-height.png`. Sources et captures restent dans `output/` ; seules les icônes finales sont livrées.

Toutes les fixtures navigateur utilisent `bq_qa_ui`, distincte du personnage jouable. Aucun test de charge ou de session prolongée n’a été réalisé ; les limites générales restent applicables.
