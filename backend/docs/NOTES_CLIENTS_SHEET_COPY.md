# Copie nocturne `notes_clients` → Google Sheets

Le bot Telegram `@Nathalieunionbot` alimentait l'onglet `NOTES CLIENT` du tableur **APPLICATION APPSHEET UNION**, puis réimportait la feuille dans Supabase. Cet aller-retour créait des doublons. AppSheet n'existe plus.

Le backend RFA reprend uniquement le sens **Supabase → feuille**, comme copie de secours :

- lecture seule de `public.notes_clients` (projet Supabase `groupement-union-rfa`) ;
- onglet dédié `SUPABASE notes_clients` : on le vide, puis on réécrit l'en-tête et toutes les lignes ;
- les modifications déjà en base se retrouvent donc à la copie suivante, sans doublon ajouté par ce job ;
- `NOTES CLIENT` reste figé. `LISTE CLIENT 2` et `Frais` ne sont pas touchés ;
- `expense_reports` n'est pas copié ;
- aucune écriture en base, aucun changement de schéma, `sheets_synced` n'est pas modifié.

Le passage est prévu vers **02:00 Europe/Paris**. Une seconde instance Railway ne refait pas le travail : le job prend un verrou consultatif Postgres (`pg_try_advisory_xact_lock`) pour toute la copie et le relâche au commit, ou au rollback si ça échoue. Si `SHEETS_COPY_SA_JSON` est absente, le job journalise et ne fait rien. Une erreur de copie est journalisée et ne coupe pas l'API.

Les journaux Railway contiennent les comptes de lignes, par exemple :

```text
[NOTES SHEET COPY] status=ok rows_read=2021 rows_written=2021 columns=14 ...
```

## Variables d'environnement

À poser sur le **service Railway du backend RFA** (pas sur le bot).

| Variable | Rôle |
| --- | --- |
| `SHEETS_COPY_SA_JSON` | JSON du compte de service **dédié**. Sans elle, la copie est ignorée. |
| `SHEETS_COPY_ENABLED` | `1` / `0`. Défaut : `1` sur Railway, `0` en local. `0` arrête la boucle. |
| `SHEETS_COPY_AT` | Heure locale `HH:MM`. Défaut : `02:00`. |
| `SHEETS_COPY_TZ` | Fuseau. Défaut : `Europe/Paris`. |
| `SHEETS_COPY_TAB` | Onglet dédié. Défaut : `SUPABASE notes_clients`. |
| `SHEETS_COPY_SPREADSHEET_ID` | Tableur. Défaut : `1C9UzZlLm6fnjNe4zbXfkDGqMEzbSQrHTuEP0BALN7X0`. |

Ne pas réutiliser `GOOGLE_CREDENTIALS_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`, ni les variables `DRIVE_*` (ce sont d'autres accès, dont le jeton OAuth du compte personnel). Ne pas coller le refresh token du bot.

`SHEETS_COPY_TAB` ne peut pas valoir `NOTES CLIENT`, `LISTE CLIENT 2` ou `Frais` : ces noms sont refusés.

## Créer le compte de service et partager la feuille

1. Ouvrir [Google Cloud Console](https://console.cloud.google.com/) et choisir un projet (un projet neuf, distinct du bot, convient).
2. **APIs & Services → Library**, activer **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create service account**. Nom suggéré : `rfa-notes-sheet-copy`. Aucun rôle projet n'est nécessaire.
4. Ouvrir ce compte → **Keys → Add key → Create new key → JSON**. Le fichier téléchargé contient `client_email` et `private_key`.
5. Ouvrir le tableur [APPLICATION APPSHEET UNION](https://docs.google.com/spreadsheets/d/1C9UzZlLm6fnjNe4zbXfkDGqMEzbSQrHTuEP0BALN7X0). **Partager** avec le `client_email` du JSON, rôle **Éditeur**. L'éditeur est nécessaire pour vider et réécrire l'onglet dédié. Ne pas partager tout un Drive.
6. Sur Railway, créer la variable `SHEETS_COPY_SA_JSON` avec le contenu du fichier JSON (une seule valeur, pas un fichier commité). Redémarrer le service pour qu'il la lise.

Le premier passage automatique a lieu à la prochaine heure `SHEETS_COPY_AT`. L'onglet est créé à ce moment-là s'il n'existe pas.

## Déclenchement manuel

`POST /api/admin/notes-clients/sheet-copy`, avec un utilisateur **ADMIN**.

- `200` et `"status": "ok"` : copie faite (`rows_read`, `rows_written`).
- `200` et `"status": "skipped"` : variable absente, ou copie déjà en cours.
- `502` : la copie a échoué. L'API reste disponible. Le message ne contient pas la clé.

## Mise en route

1. Merger cette branche quand le comportement est validé. Ne pas lancer la copie tant que la variable n'est pas posée : sans elle, le job ne touche pas la feuille.
2. Créer le compte de service, partager la feuille en Éditeur, poser `SHEETS_COPY_SA_JSON` sur Railway, redémarrer.
3. Vérifier avec l'endpoint admin, ou attendre 02:00. Contrôler l'onglet `SUPABASE notes_clients` et les lignes `rows_read` / `rows_written` dans les logs.
4. L'onglet `NOTES CLIENT` ne doit pas changer. Ce job peut tourner en parallèle du bot, car il n'écrit pas dans `NOTES CLIENT` et ne réimporte rien.
5. Une fois le bot arrêté, la copie nocturne reste la seule alimentation de la feuille.

## Retour arrière

Retirer la variable `SHEETS_COPY_SA_JSON` (ou la vider) et redémarrer. Le passage suivant journalise `SHEETS_COPY_SA_JSON absent : copie ignorée` et n'appelle plus Google.

Pour arrêter aussi la boucle : `SHEETS_COPY_ENABLED=0`, puis redémarrer.

Aucun schéma à annuler. L'onglet `SUPABASE notes_clients` peut rester en place ou être supprimé à la main : le job ne supprime pas les autres onglets.
