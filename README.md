# BrowserQuest Revival — prototype RPG 0.2

Reprise jouable de [Mozilla BrowserQuest](https://github.com/mozilla/BrowserQuest), dans un dépôt indépendant. Canvas 2D, JavaScript, Node et WebSocket. Le rendu pixel art et le monde original restent en place ; aucun React n'est nécessaire au moteur.

## Jouer en local

Node **22.13 minimum** ; validation initiale sur Node **26.9**.

```sh
npm ci
npm start
```

Ouvrir **http://127.0.0.1:8085**. Un seul processus sert le client et les WebSockets.

- Clic sur le sol : déplacement. Clic sur une créature : attaque automatique.
- Clic sur un objet : ramassage, confirmé par le serveur.
- **I** ou **Sac** : inventaire, équiper une arme/armure, jeter un objet non équipé.
- **Entrée** : chat de proximité. **Échap** : fermer les panneaux.
- Chaque créature tuée rapporte de l'or. Les rats peuvent aussi lâcher de l'équipement.
- Les objets ont un rang, une rareté et un bonus de dégâts ou de défense.

Le sac contient 24 objets, équipement porté compris. L'or est conservé mais n'a pas encore de dépense associée. Les consommables s'utilisent au ramassage comme dans le jeu original.

## Sauvegarde et multijoueur

Nom, inventaire, équipement, or et nombre de victoires sont conservés dans `data/characters.sqlite`. Le serveur crée une clé aléatoire, stockée dans ce navigateur ; seul son hash est enregistré en base. Un même personnage ne peut pas être connecté deux fois. Chaque reconnexion replace le personnage au village et restaure ses points de vie. Les succès historiques restent locaux au navigateur.

Deux fenêtres de navigation privée distinctes permettent de jouer deux personnages. Deux onglets partageant le stockage représentent le même personnage : le second est refusé. Pour un test LAN : `HOST=0.0.0.0 npm start`, puis utiliser l'IP de cette machine et le port 8085 sur les deux appareils.

**Il s'agit d'un prototype local, pas d'un service MMO public.** Il n'y a pas encore de compte récupérable ni de sauvegarde entre appareils. Effacer le stockage navigateur fait perdre l'accès au personnage. Sauvegarder le dossier `data/` serveur arrêté pour conserver la base. Ne pas publier ce dossier.

## Développement et vérification

```sh
npm run dev      # redémarrage serveur sur modification
npm test         # tests unitaires et intégration avec de vrais WebSockets
npm run vendor   # recopier les dépendances navigateur depuis le lockfile
```

`PORT`, `HOST` et `BQ_DATABASE` permettent de choisir port, interface et fichier SQLite. `/status` expose disponibilité, version du protocole et population. Les bibliothèques navigateur sont embarquées : aucun CDN n'est nécessaire. `jquery` reste sur la branche 3.7 pour conserver les événements utilisés par le client ; RequireJS et Underscore ont également été mis à jour.

Le mode `?qa=1` expose l'instance cliente sous `window.__bqGame` pour les tests Canvas. Il ne donne aucun pouvoir supplémentaire au serveur. Les scripts `scripts/browser-*.js` sont des fonctions de parcours pour Playwright CLI, sur un personnage de test déjà connecté ; ils utilisent le client réel. Les captures et traces locales vont dans `output/playwright/` (ignoré par Git).

L'ancien empaquetage `bin/build.sh` a été remplacé par les fichiers servis directement et `npm run vendor`. Aucun build client n'est requis pour ce jalon.

## Documents

- [État des lieux, limites et feuille de route](docs/ROADMAP.md)
- [Protocole réseau et futur client Unity](docs/PROTOCOL.md)
- [Vérifications de la version](docs/VERIFICATION.md)

## Origine et licences

Fork : [StonyTV/BrowserQuest](https://github.com/StonyTV/BrowserQuest). Base Mozilla `af32d24`. Création originale par **Little Workshop**, Franck Lecollinet et Guillaume Lecollinet. Le code original est sous **MPL 2.0** et les contenus sous **CC-BY-SA 3.0** ; voir [LICENSE](LICENSE). Les dépendances conservent leurs mentions de licence. Les musiques ne sont pas distribuées dans le dépôt source ; seuls les effets sonores inclus sont chargés.
