# Protocole 2 du prototype

Transport : WebSocket texte JSON, à la même origine que le client. `/status` indique `protocol: 2`. Aucun cookie ou format spécifique à JavaScript n'est nécessaire ; un client Unity peut envoyer les mêmes messages JSON. La compatibilité Unity n'a pas été implémentée ni testée.

Le serveur envoie d'abord le texte `go`. Le client répond :

```json
[0, "Nom", 21, 60, ""]
```

Les deux identifiants d'équipement sont conservés pour l'adaptateur historique mais **ignorés par le serveur**. La chaîne finale vide crée un personnage ; à la reconnexion elle contient la clé secrète reçue dans PROFILE. Le serveur émet WELCOME (`[1,id,nom,x,y,pv]`), puis PROFILE. Un nom identique ne donne jamais accès à un personnage existant. Une clé inconnue et une seconde connexion au même personnage sont refusées.

Les messages sortants sont soit un tableau d'action, soit un tableau de tableaux (batch). Les identifiants d'entités sont numériques. Les identifiants d'objets d'inventaire sont des UUID, différents de l'objet temporaire au sol.

| Identifiant | Sens | Contenu |
|---|---|---|
| 27 PROFILE | serveur → client | `[27,{token,name,gold,kills,capacity,hitPoints,maxHitPoints,items,equipped}]` |
| 28 INVENTORY_EQUIP | client → serveur | `[28,"uuid-objet"]` |
| 29 INVENTORY_DISCARD | client → serveur | `[29,"uuid-objet"]`, refus si équipé |
| 30 LOOT_RESULT | serveur → client | `[30,idObjetAuSol,succès,message]` |

`items` contient `{id,kind,rarity,bonus}`. `equipped` contient `{weapon:uuid,armor:uuid}`. Une mutation valide renvoie PROFILE complet. Le serveur tire les raretés, calcule les bonus, contrôle la propriété et persiste l'état. Ne jamais exposer le champ `token` aux autres joueurs ni dans des logs.

Les messages originaux 0–26 sont définis dans `shared/js/gametypes.js`, leur validation entrante dans `server/js/format.js` et leur sérialisation sortante dans `server/js/message.js`. HURT (9) est ignoré : les monstres infligent désormais leurs dégâts via la boucle serveur. HIT (8) vérifie cible de type créature, proximité et délai minimum de 600 ms. Le client web attaque normalement toutes les 800 ms.

Limites : message entrant 8 Kio, 100 messages/seconde/connexion, chaînes de 256 caractères maximum, WHO de 511 identifiants maximum. Ping/pong toutes les 30 secondes. Le navigateur doit présenter la même origine ; les clients natifs peuvent omettre Origin. L'origine n'est pas un mécanisme d'authentification.

Avant un client alternatif distribué publiquement, prévoir une négociation de version explicite, des erreurs typées, des snapshots avec tick et les intentions de déplacement. Le protocole 2 conserve encore le mouvement prédictif historique et n'est pas une garantie anti-triche.
