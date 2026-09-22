# BrowserQuest Revival — V2 sociale · comptes · métiers · jalon 0.3 alpha 8

Reprise jouable de [Mozilla BrowserQuest](https://github.com/mozilla/BrowserQuest), dans un dépôt indépendant. Canvas 2D, JavaScript, Node et WebSocket. Le rendu pixel art et le monde original restent en place ; aucun React n'est nécessaire au moteur.

## Jouer en local

Node **22.13 minimum** et Docker ; validation sur Node **26.9**. MongoDB utilise le port local **27019**, distinct des autres bases de la machine.

```sh
npm ci
npm run auth:init # génère les secrets locaux, ignorés par Git
npm run auth:up   # Docker : MongoDB + Supabase Auth + PostgreSQL + boîte mail locale
npm start
```

Ouvrir **http://127.0.0.1:8085**. Un seul processus sert le client et les WebSockets.

Pour conserver les personnages d’un ancien jalon SQLite : arrêter le jeu, exécuter `npm run db:migrate`, puis relancer. La source reste intacte ; voir [la procédure de stockage](docs/STORAGE.md).

- Clic sur le sol : déplacement. Clic sur une créature : attaque automatique.
- Clic sur un objet : ramassage, confirmé par le serveur.
- **I** ou **Sac** : 24 cases fixes, sélectionner/équiper un objet, déplacer par glisser-déposer ou bouton tactile, jeter un objet non équipé.
- **M** ou **Métiers** : progression de bûcheron, mineur et forgeron. Cliquez sur un frêne ou un gisement, puis **Récolter** ; restez immobile jusqu’à la fin.
- **Brann**, près de la banque : atelier, trois recettes à débloquer. Une épée coûte 2 bois, 4 minerais et 3 pièces ; sa rareté et ses bonus sont tirés par le serveur.
- **G** ou **Compagnons** : joueurs connectés, invitations, groupe de 5 et guilde ; chaque onglet garde son sujet.
- **Ysée**, au point d’arrivée : écran de fondation centré pour 25 or, nom/sigle et aperçu du blason SVG à deux couleurs.
- **Intendant**, à côté d’Ysée : panneau bancaire dédié, coffre de 72 objets et dépôt/retrait d’or.
- **Entrée** : chat de zone, commerce, recrutement, groupe ou guilde. **Échap** : fermer les panneaux.
- Chaque créature vaincue rapporte de l’expérience ; 20 niveaux augmentent vitalité, puissance et résistance. Le HUD montre la progression, le sac détaille les caractéristiques.
- En groupe, l’XP se partage entre les membres vivants à 12 cases du combat. Le joueur qui achève la créature gagne les pièces et la victoire. Les rats peuvent aussi lâcher de l’équipement.
- Les objets ont un rang, une rareté et un bonus de dégâts ou de défense.

Le sac contient 24 cases, équipement porté compris. Le bois et le fer se rangent en piles de 99, transférables entières en banque. L’or sert notamment à fonder une guilde. Les objets portés doivent être remplacés avant dépôt en banque. Les consommables s'utilisent au ramassage comme dans le jeu original.

Le HUD utilise des icônes pixel art natives : sac, compagnons, cor sonore, compte et enclume des métiers, avec les raccourcis I/G/M et des infobulles. Le badge des compagnons signale les invitations. La fondation de guilde a son propre écran modal, sans onglets sociaux ; le brouillon reste intact pendant les mises à jour multijoueurs.

## Sauvegarde et multijoueur

La connexion est obligatoire. Supabase Auth gère e-mail/mot de passe, confirmation par code et récupération du mot de passe. Le navigateur conserve un cookie HttpOnly pendant 30 jours ; les jetons de session restent chiffrés côté serveur. En développement, les messages se lisent dans **http://127.0.0.1:54326** : aucun e-mail externe n’est envoyé par défaut.

Chaque compte possède jusqu’à trois personnages, avec un seul en jeu à la fois. Inventaire, expérience, métiers, banque, or, victoires et guildes restent dans MongoDB. Les anciens personnages peuvent être rattachés depuis la sélection, dans le navigateur qui détient encore leur ancienne clé. Cette récupération conserve le profil et rend l’ancienne clé inutilisable pour entrer en jeu.

Deux comptes dans deux contextes de navigateur permettent de jouer ensemble. Le menu **Compte** permet de changer de personnage ou de se déconnecter. Les positions/PV reviennent au village à la reconnexion ; les groupes restent temporaires. Les succès historiques sont encore locaux, désormais isolés par personnage ; ils ne sont pas une progression serveur partagée entre appareils.

Google et Apple disposent du parcours OAuth PKCE, mais leurs boutons apparaissent seulement une fois les identifiants officiels configurés. **Leur connexion réelle n’a pas été validée.** [Comptes et déploiement](docs/ACCOUNTS.md) détaille les secrets requis, SMTP, HTTPS, la récupération et la future intégration mobile/Steam.

Ce jalon reste un prototype local : la capacité configurée de 200 joueurs n’est pas une preuve de charge. Les instructions de sauvegarde MongoDB et PostgreSQL sont dans [Stockage](docs/STORAGE.md) et [Comptes](docs/ACCOUNTS.md).

## Développement et vérification

```sh
npm run dev      # redémarrage serveur sur modification
npm test         # régression sans Docker, adaptateur SQLite historique
npm run test:mongo # même parcours WebSocket + transactions et migration MongoDB
npm run test:auth # inscription et multijoueur contre les vrais services Auth/Mongo
npm run vendor   # recopier les dépendances navigateur depuis le lockfile
```

`PORT` et `HOST` choisissent le port et l’interface. `MONGODB_URI` et `MONGODB_DATABASE` choisissent MongoDB. `BQ_DATABASE` active le stockage SQLite historique uniquement avec le mode de test décrit ci-dessous. `/status` expose disponibilité, stockage, version du protocole et population. Les bibliothèques navigateur sont embarquées : aucun CDN n'est nécessaire. `jquery` reste sur la branche 3.7 pour conserver les événements utilisés par le client ; RequireJS et Underscore ont également été mis à jour.

Le mode `?qa=1` expose l'instance cliente sous `window.__bqGame` pour les tests Canvas. Il ne donne aucun pouvoir supplémentaire au serveur. Les scripts `scripts/browser-*.js` sont des fonctions de parcours pour Playwright CLI, sur un personnage de test déjà connecté ; ils utilisent le client réel. Les captures et traces locales vont dans `output/playwright/` (ignoré par Git).

L'ancien empaquetage `bin/build.sh` a été remplacé par les fichiers servis directement et `npm run vendor`. Aucun build client n'est requis pour ce jalon.

Les anciens scripts de parcours à clé locale demandent explicitement `NODE_ENV=test BQ_TEST_LEGACY_AUTH=1`, sur une interface loopback et une base QA. Ce mode n’est jamais activé par défaut. Le parcours `scripts/browser-accounts.js` utilise le serveur normal authentifié sur 8086, la base `bq_qa_auth` et la boîte mail locale, sans contournement d’identité.

## Architecture V2 et suite

Le Canvas conserve les sprites et la carte BrowserQuest. La caméra suit le personnage sur tout l’écran ; le HUD et les panneaux DOM passent au-dessus. Les vues sont séparées en `client/js/ui/{items,social,chat,bank,guild-creation,crest-editor,character,dom}.js`, avec un rendu SVG autonome pour les blasons. Le serveur regroupe les règles dans `server/js/domain/{gameplay,social,bank,rules,movement,mob-ai,progression,rewards}.js`. Coûts, capacités, canaux et services sont déclarés dans `shared/content/social.json`.

Ce jalon valide le socle social ; **le goal V2 reste actif**. MongoDB est le stockage par défaut, avec migration et transactions vérifiées. Les chemins des joueurs sont validés et exécutés par le serveur ; le client conserve une animation prédictive. Les monstres détectent, poursuivent et attaquent côté serveur. Les niveaux, l’expérience partagée et les comptes récupérables sont implémentés. Classes, métiers/craft et percepteurs restent à réaliser. [Le suivi V2](docs/V2.md) distingue les preuves obtenues et le travail restant.

`shared/content/movement.json` définit la vitesse et les limites des routes. `server/js/domain/movement.js` possède les positions réelles, avec prédiction et correction dans `client/js/movement.js`. `scripts/browser-movement.js` vérifie les changements de direction, la position vue par un autre joueur et les portes ; une variante avec 150 ms de délai sortant a également été vérifiée.

`shared/content/mobs.json` rassemble les caractéristiques, butins, vitesses et rayons d’agression. `server/js/domain/mob-ai.js` contrôle détection, poursuite, cible, cadence et retour au point de départ. Le navigateur anime les snapshots reçus via `client/js/mob-sync.js`. Les rats et chauves-souris restent passifs ; les autres créatures peuvent attaquer spontanément. Le contact est orthogonal, les créatures ne frappent plus à travers une case de mur.

Pour reproduire le combat multijoueur isolé : `node scripts/prepare-combat-qa.js`, `NODE_ENV=test BQ_TEST_LEGACY_AUTH=1 PORT=8086 MONGODB_DATABASE=bq_qa_ai npm start`, puis exécuter `output/browser-combat-run.js` avec Playwright CLI. Deux personnages vérifient poursuite, retour, agression autonome et déconnexion ; les fixtures sont limitées aux bases `bq_qa_`.

Pour reproduire le parcours visuel isolé : `node scripts/prepare-social-qa.js`, puis dans un autre terminal `NODE_ENV=test BQ_TEST_LEGACY_AUTH=1 PORT=8086 MONGODB_DATABASE=bq_qa_social npm start`. Exécuter la fonction générée `output/browser-social-run.js` avec Playwright CLI `run-code`, puis `scripts/browser-mobile.js`. Pour vérifier la fondation (brouillon multijoueur, erreurs, double soumission et mobile), relancer la préparation puis exécuter `output/browser-guild-ui-run.js`. Chaque parcours requiert ses personnages neufs. La préparation injecte seulement des personnages dans la base MongoDB `bq_qa_social` ; les identifiants des fixtures restent dans `output/`, ignoré par Git.

`shared/content/progression.json` contient les seuils des 20 niveaux, bonus et rayon de partage. Chaque monstre déclare son expérience dans `mobs.json`. Le niveau se déduit de l’XP totale persistée ; le serveur calcule également les statistiques. Les anciens profils démarrent à 0 XP sans convertir leurs victoires historiques. Une montée de niveau augmente le maximum de vie sans soigner les blessures actuelles ; le niveau n’est pas perdu à la mort.

Parcours de progression isolé : `node scripts/prepare-progression-qa.js`, `NODE_ENV=test BQ_TEST_LEGACY_AUTH=1 PORT=8086 MONGODB_DATABASE=bq_qa_progression npm start`, puis `output/browser-progression-run.js` avec Playwright CLI. Deux personnages proches du niveau 2 forment un groupe, combattent et vérifient leur progression, leur fiche et leur reconnexion.

## Documents

- [Comptes, sessions et clients futurs](docs/ACCOUNTS.md)

- [État des lieux, limites et feuille de route](docs/ROADMAP.md)
- [Protocole réseau et futur client Unity](docs/PROTOCOL.md)
- [Vérifications de la version](docs/VERIFICATION.md)

## Origine et licences

Fork : [StonyTV/BrowserQuest](https://github.com/StonyTV/BrowserQuest). Base Mozilla `af32d24`. Création originale par **Little Workshop**, Franck Lecollinet et Guillaume Lecollinet. Le code original est sous **MPL 2.0** et les contenus sous **CC-BY-SA 3.0** ; voir [LICENSE](LICENSE). Les dépendances conservent leurs mentions de licence. Les musiques ne sont pas distribuées dans le dépôt source ; seuls les effets sonores inclus sont chargés.
