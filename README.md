# RFA Excel Import - Application V0

Application locale (backend + frontend) pour importer un fichier Excel et afficher les chiffres par client (Code Union).

## Fonctionnalités

- ✅ Import de fichier Excel (.xlsx)
- ✅ **Mode Par Client (Code Union)** :
  - Liste des clients avec recherche et tri
  - Détail par client avec groupe client
  - Global plateformes (ACR/ALLIANCE/DCA/EXADIS)
  - Tri-partites (SBS/NK + ACR familles + EXADIS familles + ALLIANCE marques)
  - Totaux (global, tri, total général)
- ✅ **Mode Par Groupe Client** :
  - Liste des groupes clients avec nombre de comptes
  - Détail par groupe avec agrégation de tous les clients
  - Affichage des codes union du groupe
  - Global plateformes et tri-partites agrégés
  - Totaux (global, tri, total général)

## Stack Technique

- **Backend** : Python 3.11+, FastAPI, pandas, openpyxl, pydantic
- **Frontend** : React (Vite) + Tailwind CSS
- **Stockage** : En mémoire (imports) ; option **Google Sheets** comme source de données (voir ci‑dessous)

## Installation

### Prérequis

- Python 3.11 ou supérieur
- Node.js 18+ et npm

### Backend

1. Aller dans le dossier backend :
```bash
cd backend
```

2. Créer un environnement virtuel (recommandé) :
```bash
python -m venv venv
```

3. Activer l'environnement virtuel :
   - Windows : `venv\Scripts\activate`
   - Linux/Mac : `source venv/bin/activate`

4. Installer les dépendances :
```bash
pip install -r requirements.txt
```

### Frontend

1. Aller dans le dossier frontend :
```bash
cd frontend
```

2. Installer les dépendances :
```bash
npm install
```

## Lancement

### Backend

1. Dans le dossier `backend`, activer l'environnement virtuel si ce n'est pas déjà fait
2. Lancer le serveur FastAPI :
```bash
uvicorn app.main:app --reload --port 8000
```

Le backend sera accessible sur `http://localhost:8000`

### Frontend

1. Dans le dossier `frontend`, lancer le serveur de développement :
```bash
npm run dev
```

Le frontend sera accessible sur `http://localhost:5173`

## Utilisation

1. Ouvrir `http://localhost:5173` dans votre navigateur
2. Cliquer sur "Choisir un fichier" et sélectionner un fichier Excel (.xlsx)
3. Cliquer sur "Importer"
4. Une fois l'import réussi, la liste des clients s'affiche
5. Cliquer sur une ligne pour voir le détail du client (drawer latéral)

## Structure des colonnes Excel

L'application reconnaît automatiquement les colonnes suivantes (tolérance sur casse/accents) :

### Identifiants
- `Code Union` (obligatoire)
- `Nom Client` (optionnel)
- `Groupe Client` (obligatoire, jamais vide)

### Global plateformes (CA €)
- `CA RFA GLOBALE ACR (€)`
- `CA RFA GLOBALE ALLIANCE (€)`
- `CA RFA GLOBALE DCA (€)`
- `CA RFA GLOBALE EXADIS (€)`

### Tri-partites (CA €)
- `CA RFA NK (€)` ou `CA RFA SBS (€)` (même champ)
- `CA ACR FREINAGE (€)`
- `CA ACR EMBRAYAGE (€)`
- `CA ACR FILTRE (€)`
- `CA ACR DISTRIBUTION (€)`
- `CA EXADIS EMBRAYAGE (LUK/SACHS) (€)`
- `CA EXADIS FILTRATION (€)`
- `CA EXADIS DISTRIBUTION (€)`
- `CA EXADIS ETANCHEITE (ELRING) (€)`
- `CA EXADIS THERMIQUE (NRF) (€)`
- `CA RFA SCHAEFFLER (€)`
- `CA ALLIANCE DELPHI (€)`
- `CA ALLIANCE BREMBO ADD (€)`
- `CA ALLIANCE SOGEFI (€)`

## API Endpoints

- `POST /api/upload` : Upload d'un fichier Excel
- `POST /api/sync-from-sheets` : Import depuis un Google Sheet (voir section Google Sheets)
- `GET /api/imports/{import_id}/clients` : Liste des clients (compatibilité)
- `GET /api/imports/{import_id}/client/{code_union}` : Détail d'un client (compatibilité)
- `GET /api/imports/{import_id}/entities?mode=client|group` : Liste des entités (clients ou groupes)
- `GET /api/imports/{import_id}/entity?mode=client|group&id=...` : Détail d'une entité

## Google Sheets comme source de données

Pour un petit projet, vous pouvez utiliser **Google Sheets** comme « base » pour les données RFA au lieu d’uploader un Excel à chaque fois.

- **Même structure** : une feuille avec la 1ère ligne = en-têtes (Code Union, Groupe Client, CA RFA…), les lignes suivantes = données.
- **Partage** : le tableur est la source de vérité ; toute l’équipe peut le modifier dans Sheets.
- **Sans serveur de BDD** : pas besoin de Supabase ou autre, juste un compte Google et l’API Sheets.

### Mise en place

1. **Créer un projet Google Cloud** et activer l’API Google Sheets.
2. **Créer un compte de service** et télécharger le fichier JSON de clé.
3. **Partager votre Google Sheet** avec l’email du compte de service (ex. `xxx@xxx.iam.gserviceaccount.com`) en **lecture**.
4. **Backend** : installer les dépendances optionnelles et configurer les credentials :
   ```bash
   cd backend
   pip install -r requirements-sheets.txt
   set GOOGLE_APPLICATION_CREDENTIALS=chemin/vers/cle-compte-service.json
   ```
5. **Synchroniser** : appeler l’API avec l’ID du tableur (dans l’URL du Sheet : `.../d/SPREADSHEET_ID/edit`) :
   - `POST /api/sync-from-sheets` avec body JSON : `{"spreadsheet_id": "VOTRE_ID", "sheet_name": "Feuille1"}` (optionnel).
   - La réponse est identique à un upload Excel (`import_id`, `nb_lignes`, etc.) ; le reste de l’app (DAF, contrats, RFA) fonctionne pareil.

Les **contrats** restent dans SQLite (ou en import JSON). Seules les **données d’import** (lignes RFA par client) viennent du Sheet.

## Notes

- Les données d’import sont stockées en mémoire (perdues au redémarrage du backend) ; avec Google Sheets vous pouvez resynchroniser à tout moment
- Si un Code Union apparaît plusieurs fois dans le fichier, les montants sont sommés
- Les colonnes absentes sont considérées comme 0 (pas d'erreur)
- La normalisation des en-têtes ignore la casse, les accents et les doubles espaces
- **Mode Groupe Client** : Les montants sont agrégés par groupe (somme de tous les clients du groupe)
- Le nombre de comptes dans un groupe correspond au nombre de Code Union distincts

