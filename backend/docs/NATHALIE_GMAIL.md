# Envoi d'emails Nathalie (API Gmail)

Les demandes d'ouverture de compte sont envoyées **réellement** par email (sans ouvrir la messagerie), avec les pièces jointes RIB, Kbis et pièce d'identité (téléchargées depuis Drive).

## 1. Activer l'API Gmail

1. Ouvre [Google Cloud Console](https://console.cloud.google.com/) et sélectionne le même projet que pour Drive/Sheets.
2. **APIs & Services** → **Enabled APIs & services** → **+ Enable APIs and services**.
3. Recherche **Gmail API** → **Enable**.

## 2. Ajouter le scope Gmail à l'OAuth

Le même compte OAuth (Drive) est utilisé pour Gmail. Il faut que le **refresh token** ait été obtenu avec le scope d'envoi Gmail.

1. **APIs & Services** → **Credentials** → ouvre ton **OAuth 2.0 Client ID** (type "Application de bureau" ou "Desktop").
2. Dans l’écran de consentement OAuth, les scopes doivent inclure :
   - `https://www.googleapis.com/auth/drive` (déjà utilisé pour Drive)
   - `https://www.googleapis.com/auth/gmail.send` (envoi d’emails uniquement)

3. **Réautoriser l’application** pour obtenir un nouveau refresh token avec les deux scopes :
   - Utilise un script OAuth (ou une app de test) qui demande les scopes **drive** et **gmail.send**.
   - Connecte-toi avec le compte @groupementunion.pro qui envoie les mails.
   - Récupère le **refresh_token** et mets-le dans ton `.env` à la place de `DRIVE_REFRESH_TOKEN`.

Les variables utilisées pour Gmail sont les mêmes que pour Drive :

- `DRIVE_CLIENT_ID`
- `DRIVE_CLIENT_SECRET`
- `DRIVE_REFRESH_TOKEN` (doit avoir été obtenu avec les scopes **drive** + **gmail.send**)

## 3. Emails en copie (CC)

Par défaut, les emails en copie sont lus depuis la variable d’environnement :

```env
NATHALIE_CC_EMAILS=martial@groupementunion.pro,autre@groupementunion.pro
```

(Séparer les adresses par des virgules.)

Tu peux aussi envoyer des CC différents par requête via le body de l’API : `"cc_emails": ["email1@…", "email2@…"]`.

## 4. Pièces jointes

Pour chaque email envoyé, le backend :

1. Récupère les liens Drive du client (RIB, Kbis, pièce d’identité) depuis la feuille LISTE CLIENT 2.
2. Télécharge le contenu des fichiers via l’API Drive (même compte OAuth).
3. Attache les fichiers au message MIME et envoie l’email via l’API Gmail.

Les pièces jointes sont donc bien **incluses** dans chaque mail envoyé.

## Résumé

| Étape | Action |
|-------|--------|
| 1 | Activer **Gmail API** dans Google Cloud |
| 2 | S’assurer que le scope **gmail.send** est ajouté au consentement OAuth |
| 3 | Réautoriser l’app (drive + gmail.send) et mettre à jour `DRIVE_REFRESH_TOKEN` dans `.env` |
| 4 | Optionnel : définir `NATHALIE_CC_EMAILS` dans `.env` |

Après ça, le bouton **« Envoyer les X emails »** dans l’interface Nathalie envoie bien les mails (avec pièces jointes) sans ouvrir la messagerie.
