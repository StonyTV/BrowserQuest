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
