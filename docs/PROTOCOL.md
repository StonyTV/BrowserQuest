# Protocole 3 du prototype

Transport : WebSocket texte JSON, à la même origine que le client. `/status` indique `protocol: 3`. Aucun cookie ou format spécifique à JavaScript n'est nécessaire ; un client Unity peut envoyer les mêmes messages JSON. La compatibilité Unity n'a pas été implémentée ni testée.

Le serveur envoie d'abord le texte `go`. Le client répond :

```json
[0, "Nom", 21, 60, ""]
```

Les deux identifiants d'équipement sont conservés pour l'adaptateur historique mais **ignorés par le serveur**. La chaîne finale vide crée un personnage ; à la reconnexion elle contient la clé secrète reçue dans PROFILE. Le serveur émet WELCOME (`[1,id,nom,x,y,pv]`), puis PROFILE. Un nom identique ne donne jamais accès à un personnage existant. Une clé inconnue et une seconde connexion au même personnage sont refusées.

Les messages sortants sont soit un tableau d'action, soit un tableau de tableaux (batch). Les identifiants d'entités sont numériques. Les identifiants d'objets d'inventaire sont des UUID, différents de l'objet temporaire au sol.

| Identifiant | Sens | Contenu |
|---|---|---|
| 27 PROFILE | serveur → client | `[27,{token,id,schemaVersion,name,guildId,bank,gold,kills,capacity,hitPoints,maxHitPoints,items,equipped}]` |
| 28 INVENTORY_EQUIP | client → serveur | `[28,"uuid-objet"]` |
| 29 INVENTORY_DISCARD | client → serveur | `[29,"uuid-objet"]`, refus si équipé |
| 30 LOOT_RESULT | serveur → client | `[30,idObjetAuSol,succès,message]` |

`items` contient `{id,kind,rarity,bonus,slot}`. `slot` est une case fixe de 0 à 23 ; les objets déposés dans `bank.items` n’ont pas de case du sac. `bank` contient aussi le solde `gold`. `equipped` contient `{weapon:uuid,armor:uuid}`. Une mutation valide renvoie PROFILE complet. Le serveur tire les raretés, calcule les bonus, contrôle la propriété et persiste l'état. Ne jamais exposer le champ `token` aux autres joueurs ni dans des logs.

Les messages originaux 0–26 sont définis dans `shared/js/gametypes.js`, leur validation entrante dans `server/js/format.js` et leur sérialisation sortante dans `server/js/message.js`. HURT (9) est ignoré : les monstres infligent désormais leurs dégâts via la boucle serveur. HIT (8) vérifie cible de type créature, proximité et délai minimum de 600 ms. Le client web attaque normalement toutes les 800 ms.

Limites : message entrant 8 Kio, 100 messages/seconde/connexion, chaînes de 256 caractères maximum, WHO de 511 identifiants maximum. Ping/pong toutes les 30 secondes. Le navigateur doit présenter la même origine ; les clients natifs peuvent omettre Origin. L'origine n'est pas un mécanisme d'authentification.

Avant un client alternatif distribué publiquement, prévoir une négociation de version explicite, des erreurs typées, des snapshots avec tick et les intentions de déplacement. Le protocole 3 conserve encore le mouvement prédictif historique et n'est pas une garantie anti-triche.

## Commandes sociales et bancaires

`[31, action, payload]` reçoit soit PROFILE après mutation du personnage, soit un événement `[32, type, data]`. Une règle métier refusée donne `notice` avec `{error:true,message}`. L’enveloppe est limitée à 8 Kio comme les autres messages. Les identifiants de personnages des commandes sociales sont les UUID de PROFILE/social, pas les identifiants numériques de connexion.

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

Événements : `social` contient les joueurs en ligne, le groupe, la guilde et les invitations du destinataire ; `service` ouvre un panneau PNJ ; `chat` porte `{id,channel,name,entityId,body,time}` ; `notice` porte `{message,error?}`. Aucun secret de session d’un autre joueur n’y figure. Les groupes sont temporaires ; guildes, blasons, rangs, banque et inventaire sont persistés.

`[33,idEntite,{name,hp,maxHp,guildTag,crest,services}]` complète les entités du monde. Les métadonnées peuvent précéder SPAWN ; le client les garde par identifiant. Dégâts et régénération réémettent les PV. L’appartenance de guilde est également affichable sous le nom.

Chat de zone : groupe spatial serveur de 28 × 12 cases. Commerce/recrutement : monde entier, délai de 5 secondes. Zone : 1 seconde. Groupe/guilde : 500 ms et appartenance requise. Le délai est global par personnage pour empêcher de contourner l’attente en changeant de canal. L’ancien CHAT (11) est traduit en `chat.send` de zone, soumis aux mêmes règles.
