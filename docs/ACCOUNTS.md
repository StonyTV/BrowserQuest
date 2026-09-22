# Comptes et personnages — alpha.7

## Décision et périmètre

Connexion obligatoire pour cette première version : aucune identité invitée n’est acceptée par le serveur. Un même compte utilise les mêmes permissions pour chat, groupe, guilde, inventaire et banque. Un futur invité devra être un type d’identité explicite avec restrictions serveur centralisées ; masquer des boutons ne suffira pas. La création de guilde continue d’exiger 25 pièces.

Supabase Auth (GoTrue officiel) est l’unique source d’identité. PostgreSQL stocke utilisateurs, mots de passe hachés, identités OAuth et refresh tokens. MongoDB conserve les personnages et le jeu. Pas de double table de mots de passe et pas de dépendance de la simulation à un SDK navigateur. La pile locale ne démarre que les services nécessaires : Auth, PostgreSQL, modèles d’e-mail, Mailpit et MongoDB.

## Lancer en local

```sh
npm ci
npm run auth:init
npm run auth:up
npm start
```

Jeu : http://127.0.0.1:8085. Boîte de réception locale : http://127.0.0.1:54326. Supabase Auth : http://127.0.0.1:54325/health. PostgreSQL n’expose aucun port hôte. `auth:init` génère trois secrets aléatoires dans `data/auth.env`, mode 0600, sans remplacer une configuration existante. Le jeu charge ce fichier ; `BQ_AUTH_CONFIG=/chemin/absolu/auth.env` permet à une release figée de réutiliser la configuration privée.

1. Créer le compte avec une adresse et un mot de passe de 8–128 caractères.
2. Lire le code à six chiffres dans Mailpit puis confirmer dans le jeu. Le code expire après 10 minutes.
3. Créer un personnage (trois emplacements) ou récupérer celui de ce navigateur.
4. Jouer. Le menu Compte permet de changer de personnage ou de fermer la session.

La boîte locale n’envoie rien à Internet. Ne pas l’exposer publiquement. En production, configurer `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` avec un vrai service de courrier.

## Sessions et frontières

- Cookie opaque `bq_session`, HttpOnly, SameSite=Lax, durée absolue 30 jours. `Secure` dès que `PUBLIC_APP_URL` est HTTPS. Le cookie ne contient aucun JWT ni identifiant utilisateur.
- Mongo conserve son hash SHA-256 et les jetons chiffrés AES-256-GCM avec `AUTH_SESSION_KEY`. Le navigateur ne reçoit jamais les jetons Supabase dans les réponses de cette API.
- Chaque requête authentifiée vérifie l’utilisateur chez Auth. Les refresh tokens tournent avant expiration ; un verrou par session regroupe les demandes concurrentes dans ce processus. Le cookie reste stable entre les onglets. Réponses API `private, no-store`.
- POST JSON avec contrôle d’origine exacte ; pas de CORS permissif. Limites locales par IP/adresse plus celles de GoTrue. Aucun `X-Forwarded-For` n’est cru implicitement.
- Upgrade WebSocket authentifié avant création du joueur, puis contrôle toutes les 30 secondes. Une identité invérifiable est refusée. Logout supprime la session et ferme ses sockets ; récupération de mot de passe révoque les sessions du compte.
- Le rôle natif utilise `Authorization: Bearer` sur HTTP et l’upgrade WebSocket, avec la même vérification Supabase et les mêmes règles de possession. Le SDK natif devra renouveler ses jetons et reconnecter le socket ; ne pas les placer dans une URL.

Le serveur autoritaire reste un processus unique. Le verrou de refresh et l’exclusivité d’un personnage connecté sont locaux à ce processus. Plusieurs instances actives partageant les mêmes comptes nécessiteraient coordination et routage de sessions ; ce jalon ne prétend pas les prendre en charge.

## Appartenance et conservation

L’UUID de compte Supabase diffère de l’UUID personnage. Les profils Mongo ont `ownerId`, `accountSlot` (0–2) et un nom normalisé unique. Les contraintes sont garanties par des index uniques, y compris en cas de créations concurrentes. Les noms de 3–15 caractères acceptent lettres Unicode, chiffres, espaces, tirets et apostrophes. Aucun effacement de personnage n’est proposé pour l’instant.

Un ancien `bq-token` est une preuve de possession uniquement pour le rattachement. La sélection propose explicitement sa récupération, conserve objets/or/XP/guilde/banque et exige un nouveau nom si nécessaire. Un profil rattaché ne peut plus changer de propriétaire par cette clé. La clé locale est supprimée après succès. Sans cette ancienne clé, le nom seul ne suffit jamais à récupérer un personnage.

Les succès hérités ne sont pas autoritaires et restent sur l’appareil. Leur cache est séparé par UUID personnage ; lors d’une récupération explicite, l’ancien cache est conservé pour ce personnage. La progression XP, le butin et les guildes sont serveur et se retrouvent sur un autre appareil.

## Routes

| Route | Rôle |
|---|---|
| GET `/api/auth/session` | Compte courant ou null et fournisseurs OAuth activés |
| POST `/api/auth/signup` | E-mail/mot de passe, confirmation requise |
| POST `/api/auth/verify` | E-mail/code de confirmation, création de session |
| POST `/api/auth/signin` | E-mail/mot de passe, création de session |
| POST `/api/auth/resend` | Renvoi du code de confirmation |
| POST `/api/auth/recover` | Demande neutre de code de récupération |
| POST `/api/auth/reset-password` | E-mail/code/nouveau mot de passe, révocation et nouvelle session |
| POST `/api/auth/logout` | Révocation de la session courante |
| POST `/api/auth/oauth` | Fournisseur activé, cookie de flux et redirection PKCE |
| GET `/api/auth/callback` | Échange du code PKCE, cookie de session puis retour au jeu |
| GET/POST `/api/characters` | Liste privée / création `{name}` |
| POST `/api/characters/legacy` | Aperçu `{token}` de l’ancien personnage récupérable |
| POST `/api/characters/claim` | Rattachement `{token,name?}` au compte authentifié |

## Google et Apple — activation externe restante

Le code de redirection et d’échange PKCE est présent, mais **aucune connexion réelle Google/Apple n’a été vérifiée** faute de configuration développeur. Les boutons non configurés sont masqués. Ne pas annoncer ces fournisseurs opérationnels avant un aller-retour réel sur le domaine cible.

Dans `data/auth.env`, renseigner les URL canoniques HTTPS : `PUBLIC_APP_URL=https://jeu.example`, `AUTH_PUBLIC_URL=https://auth.example`, `AUTH_REDIRECT_URLS=https://jeu.example/api/auth/callback`. Le jeu doit joindre Auth par `AUTH_URL` (URL interne possible). Le reverse proxy publie le jeu et Auth sur ces domaines ; les connexions HTTP ne doivent pas servir de sessions de production.

| Fournisseur | Configuration privée | Callback à autoriser chez le fournisseur |
|---|---|---|
| Google | `GOOGLE_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `https://auth.example/callback` |
| Apple | `APPLE_ENABLED=true`, `APPLE_CLIENT_ID` (Service ID), `APPLE_CLIENT_SECRET` (JWT signé) | `https://auth.example/callback` |

Puis `npm run auth:up` et redémarrer le serveur du jeu, qui relit les fournisseurs activés. Configurer également l’écran de consentement Google et les domaines/Services ID Apple. **Le secret web Apple doit être renouvelé au plus tard tous les six mois.** Ne pas coller ces secrets dans le chat ou les committer ; ils restent dans la configuration privée. Le flux OAuth utilise un vérificateur PKCE dans un cookie chiffré de 10 minutes et un callback fixe, sans URL de retour libre.

Références officielles : [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple), [sessions serveur et PKCE](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [configuration auto-hébergée](https://supabase.com/docs/guides/self-hosting/auth/config).

## Mobile, Unity et Steam

Le même compte et les mêmes UUID personnage doivent traverser les plateformes. Pour Unity/mobile : authentification dans le navigateur système/SDK natif, stockage dans Keychain/Keystore, jeton Bearer vers cette API et vers le WebSocket. Aucun mot de passe ne doit être enregistré par le jeu. Les tests valident le transport Bearer et la propriété, **pas un client Unity ou un SDK Apple natif**.

Steam n’est pas un fournisseur interchangeable à inventer dans GoTrue : son intégration demandera validation serveur d’un ticket Steam, liaison explicite au compte existant puis émission d’une session par une intégration d’identité adaptée. L’OpenID du site Steam et les tickets du client Steam sont deux parcours distincts. Une liaison ne doit jamais se faire sur le nom du personnage ou une adresse supposée identique (Apple peut masquer l’adresse). Le futur parcours pourra être transparent après la première liaison ; ce jalon n’intègre ni Steam SDK ni liaison multi-fournisseurs dans l’interface. Référence : [authentification et gestion des utilisateurs Steamworks](https://partner.steamgames.com/doc/features/auth).

## Sauvegarde, tests et limites de preuve

Conserver ensemble les données MongoDB, un dump PostgreSQL Auth et les secrets de configuration. Exemple de sauvegarde locale PostgreSQL, dans un dossier privé ignoré :

```sh
mkdir -p data/backups
umask 077
docker compose --env-file data/auth.env -f compose.yaml -f compose.auth.yaml exec -T auth-db pg_dump -U supabase_auth_admin -d auth -Fc > data/backups/auth.dump
```

Le dump contient des données d’identité sensibles. Le transférer via un stockage chiffré. Ne pas supprimer les volumes Docker lors d’une mise à jour. La restauration complète PostgreSQL de production et la rotation de secrets ne sont pas prouvées par les tests de ce jalon.

`npm run test:auth` démarre un serveur sur port aléatoire avec une base Mongo temporaire, utilise les vrais e-mails locaux, puis supprime ses comptes de test et sa base. `npm run test:mongo` vérifie les règles du jeu ; ses anciens clients passent par un mode d’identité historique **explicitement limité aux tests sur loopback**. `scripts/browser-accounts.js` teste le parcours normal desktop et mobile tactile sur 8086, base QA : inscription, code, sélection, reconnexion, deux comptes dans le monde, chat, rangement persistant, changement de personnage et récupération. L’émulation mobile ne prouve pas un téléphone physique ni le clavier système.

Pour inclure le rattachement visuel d’un ancien personnage : `node scripts/prepare-account-qa.js`, puis exécuter `output/browser-accounts-run.js` avec Playwright CLI. La fixture est limitée à une base `bq_qa_` et ses secrets restent dans `output/`.
