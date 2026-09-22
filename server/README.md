# Serveur

Depuis la racine : `npm ci && npm start`. Node >= 22.13, SQLite intégré, port 8085 par défaut. Voir le [guide principal](../README.md), [le protocole](../docs/PROTOCOL.md) et [les limites](../docs/ROADMAP.md).

`config_local.json` (ignoré) peut surcharger `config.json`. `PORT`, `HOST` et `BQ_DATABASE` sont prioritaires. Le chemin de carte est relatif à la racine du dépôt. Les anciennes métriques memcache ne sont plus utilisées par le lanceur.
