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
