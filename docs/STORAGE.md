# Stockage MongoDB — 0.3.0-alpha.2

## Démarrer

```sh
npm run db:up
npm start
```

Compose crée le conteneur `browserquest-mongo-1`, le volume `browserquest_mongo-data` et un replica set local à un nœud. Il expose MongoDB uniquement sur `127.0.0.1:27019`. Le serveur utilise la base `browserquest` par défaut. Le replica set permet les transactions personnage + guilde ; il ne constitue pas une réplication sur plusieurs machines.

La configuration est dans `compose.yaml`. Le pilote est fixé dans le lockfile. Variables optionnelles : `MONGODB_URI`, `MONGODB_DATABASE`, `PORT`, `HOST`. L’URI par défaut utilise `directConnection=true`, car le port publié sur l’hôte diffère de celui du conteneur. Aucune copie SQLite n’est écrite pendant une session MongoDB.

`npm run db:down` arrête le conteneur et conserve le volume. Ne pas ajouter `--volumes` si les personnages doivent être conservés. La base locale est sans authentification et n’est pas destinée à être exposée sur Internet.

## Migrer le jalon SQLite

Arrêter le serveur de jeu avant la migration, puis :

```sh
npm run db:up
npm run db:migrate                       # data/characters.sqlite
# ou : npm run db:migrate -- chemin/source.sqlite
npm start
```

La source est ouverte en lecture seule. Une transaction importe personnages et guildes avec leurs identifiants, hash de clé navigateur, équipement, raretés, cases, banque, or et membres. Les anciens profils reçoivent les champs manquants de schéma V2. La cible doit être vide. Un marqueur enregistré dans la même transaction rend la commande idempotente : un deuxième lancement ne remplace jamais les progrès acquis sur MongoDB.

La migration locale du 22 septembre 2026 a importé 3 personnages et 0 guilde. Une comparaison intégrale a vérifié les trois profils importés. Une copie SQLite supplémentaire se trouve dans `data/characters-before-mongo-*.sqlite`, en plus de la source intacte. Les fichiers `data/` ne sont pas suivis par Git. Le navigateur conserve sa clé et retrouve le même personnage.

## Règles d’écriture

- `profiles.js` contient les règles des objets et du profil ; `storage/mongo.js` contient uniquement la persistance. `storage/sqlite.js` reste un adaptateur historique pour migration et tests.
- Les commandes WebSocket et les déconnexions passent par une seule file ordonnée pour le processus de jeu. Les commandes réseau en attente sont limitées par connexion et au total.
- Les actions persistantes construisent un brouillon. Le serveur sauvegarde avant de remplacer le profil en mémoire et d’envoyer la confirmation. Un objet au sol n’est confirmé ramassé qu’après sauvegarde de son acquisition.
- Une écriture de profil est atomique. La création, l’adhésion et les modifications de guilde utilisent une transaction lorsque plusieurs documents changent. Les noms et sigles des guildes actives ont des index uniques.
- Les révisions de personnage et de guilde empêchent une écriture basée sur un état périmé de remplacer un état plus récent. Elles ne sont pas envoyées aux clients.
- Un échec inattendu d’écriture arrête le traitement des commandes, ferme les connexions et termine le serveur avec un code d’échec. Aucun message de réussite n’est envoyé pour cette commande. Il n’y a pas de repli automatique vers une autre base.
- À l’arrêt normal, les commandes déjà reçues sont drainées avant fermeture du stockage. Le moteur suspend ses ticks pendant une commande asynchrone, pour éviter qu’une mort ou une régénération interfère avec une récompense en cours.

Cette architecture cible **un seul processus de jeu autoritaire**, avec plusieurs joueurs. La file globale privilégie la cohérence du prototype ; une base lente ralentira le monde. Plusieurs serveurs actifs sur la même base, la reprise automatique après panne, la haute disponibilité et la charge MMO ne sont pas validés. Les groupes/invitations et l’état des monstres restent temporaires ; seule la progression persistante survit au redémarrage.

## Sauvegarder

Serveur de jeu arrêté, depuis la racine du dépôt :

```sh
mkdir -p data/backups
docker compose exec -T mongo mongodump --db browserquest --archive --gzip > data/backups/browserquest.archive.gz
```

Copier l’archive hors de la machine pour une vraie sauvegarde. Pour vérifier une restauration sans remplacer la base jouable, restaurer dans une **base vide distincte** :

```sh
docker compose exec -T mongo mongorestore --archive --gzip --nsFrom='browserquest.*' --nsTo='bq_restore_check.*' < data/backups/browserquest.archive.gz
```

Ces commandes ne mettent aucun secret navigateur en clair dans le terminal ; les documents contiennent les hash des clés. Un export/restauration a été vérifié sur la base QA : 3 personnages et 1 guilde restaurés dans une base temporaire, puis comparaison intégrale des documents et suppression de cette cible de test. Cela ne remplace pas une politique de sauvegarde distante pour une exploitation publique.

## Vérifier

```sh
npm test              # régression SQLite, pas de Docker requis
npm run test:mongo    # MongoDB réel ; bases bq_test_* temporaires
node scripts/prepare-social-qa.js
PORT=8086 MONGODB_DATABASE=bq_qa_social npm start
```

Les 18 tests MongoDB vérifient notamment le rollback d’une création de guilde, le refus d’une écriture périmée, la migration et son second passage, des dépôts successifs concurrents, la restauration après redémarrage du processus et l’arrêt sans confirmation après conflit de stockage. Les parcours `scripts/browser-social.js` et `scripts/browser-mobile.js` vérifient les écrans réels ; la préparation écrit les clés des personnages de test dans `output/`, ignoré par Git.

Référence de mise en œuvre : [transactions du pilote Node MongoDB](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/). Les opérations d’une transaction sont attendues séquentiellement.
