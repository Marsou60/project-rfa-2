# Copie nocturne `notes_clients` → Google Sheets

Le bot Telegram `@Nathalieunionbot` alimentait l'onglet `NOTES CLIENT` du tableur **APPLICATION APPSHEET UNION**, puis réimportait la feuille dans Supabase. Cet aller-retour créait des doublons. AppSheet n'existe plus.

Le backend RFA reprend uniquement le sens **Supabase → feuille**, comme copie de secours :

- lecture seule de `public.notes_clients` (projet Supabase `groupement-union-rfa`) ;
- onglet dédié `SUPABASE notes_clients` : on le vide, puis on réécrit l'en-tête et toutes les lignes ;
- les modifications déjà en base se retrouvent donc à la copie suivante, sans doublon ajouté par ce job ;
- `NOTES CLIENT` reste figé. `LISTE CLIENT 2` et `Frais` ne sont pas touchés ;
- `expense_reports` n'est pas copié ;
- aucune écriture en base, aucun changement de schéma, `sheets_synced` n'est pas modifié.

Le passage est prévu vers **02:00 Europe/Paris**. Une seconde instance Railway ne refait pas le travail : le job prend un verrou consultatif Postgres (`pg_try_advisory_xact_lock`) pour toute la copie et le relâche au commit, ou au rollback si ça échoue. Sans compte de service déjà configuré, le job journalise et ne fait rien. Une erreur de copie est journalisée et ne coupe pas l'API.

Les journaux Railway contiennent les comptes de lignes, par exemple :

```text
[NOTES SHEET COPY] status=ok rows_read=2021 rows_written=2021 columns=14 ...
```

## Compte Google

La copie utilise le compte de service **déjà** chargé par le backend, le même que l’écriture de l’onglet LISTE CLIENT 2 :

1. `GOOGLE_CREDENTIALS_JSON` (cas Railway) ;
2. sinon le fichier `GOOGLE_APPLICATION_CREDENTIALS`, comme `nathalie_service.py`.

Le scope est `https://www.googleapis.com/auth/spreadsheets`. Les variables OAuth `DRIVE_*` ne sont pas lues.

`SHEETS_COPY_SA_JSON` est un remplacement optionnel. S’il est renseigné, il est utilisé à la place de `GOOGLE_CREDENTIALS_JSON`. Le fonctionnement normal n’a pas besoin de cette variable.

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `GOOGLE_CREDENTIALS_JSON` | Compte de service existant. Suffit pour la copie. |
| `SHEETS_COPY_SA_JSON` | Optionnel. Remplace le compte ci-dessus s’il est posé. |
| `SHEETS_COPY_ENABLED` | `1` / `0`. Défaut : `1` sur Railway, `0` en local. `0` arrête la boucle. |
| `SHEETS_COPY_AT` | Heure locale `HH:MM`. Défaut : `02:00`. |
| `SHEETS_COPY_TZ` | Fuseau. Défaut : `Europe/Paris`. |
| `SHEETS_COPY_TAB` | Onglet dédié. Défaut : `SUPABASE notes_clients`. |
| `SHEETS_COPY_SPREADSHEET_ID` | Tableur. Défaut : `1C9UzZlLm6fnjNe4zbXfkDGqMEzbSQrHTuEP0BALN7X0`. |

`SHEETS_COPY_TAB` ne peut pas valoir `NOTES CLIENT`, `LISTE CLIENT 2` ou `Frais` : ces noms sont refusés.

## Droits sur la feuille

Ouvrir le tableur [APPLICATION APPSHEET UNION](https://docs.google.com/spreadsheets/d/1C9UzZlLm6fnjNe4zbXfkDGqMEzbSQrHTuEP0BALN7X0) et vérifier que l’adresse `client_email` du JSON `GOOGLE_CREDENTIALS_JSON` est **Éditeur**. C’est le même compte que celui qui écrit déjà LISTE CLIENT 2. L’éditeur est nécessaire pour vider et réécrire l’onglet dédié.

Le premier passage automatique a lieu à la prochaine heure `SHEETS_COPY_AT`. L’onglet est créé à ce moment-là s’il n’existe pas.

## Déclenchement manuel

`POST /api/admin/notes-clients/sheet-copy`, avec un utilisateur **ADMIN**.

- `200` et `"status": "ok"` : copie faite (`rows_read`, `rows_written`).
- `200` et `"status": "skipped"` : aucun compte de service configuré, ou copie déjà en cours.
- `502` : la copie a échoué. L'API reste disponible. Le message ne contient pas la clé.

## Mise en route

1. Merger cette branche.
2. Vérifier que l’e-mail du compte de service (`client_email` dans `GOOGLE_CREDENTIALS_JSON`) est Éditeur du tableur.
3. Redémarrer le service Railway. La boucle est déjà active en production (`SHEETS_COPY_ENABLED` vaut `1` par défaut).
4. Contrôler au prochain passage de 02:00, ou avec l’endpoint admin : l’onglet `SUPABASE notes_clients` et les lignes `rows_read` / `rows_written`. `NOTES CLIENT` ne change pas.

## Retour arrière

Poser `SHEETS_COPY_ENABLED=0` et redémarrer. La boucle s’arrête et n’appelle plus Google.

Aucun schéma à annuler. L’onglet `SUPABASE notes_clients` peut rester en place ou être supprimé à la main : le job ne supprime pas les autres onglets.
