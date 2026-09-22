# Client web

Le serveur Node sert ce répertoire et `/shared/`. Aucun build n'est requis : lancer `npm start` depuis la racine. L'adresse WebSocket est déduite de `window.location`.

Canvas/RequireJS/jQuery sont conservés. `npm run vendor` met à jour les copies embarquées des versions du lockfile. Les anciennes configurations `config_build.json` ne sont plus utilisées. Voir le [guide principal](../README.md).
