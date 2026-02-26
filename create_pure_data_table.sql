-- Table Pure Data pour Groupement Union Hub
-- A executer dans Supabase SQL Editor (Settings > SQL Editor)

CREATE TABLE IF NOT EXISTS pure_data (
    id               SERIAL PRIMARY KEY,
    mois             INTEGER,
    annee            INTEGER,
    code_union       TEXT,
    raison_sociale   TEXT,
    groupe_client    TEXT,
    region_commerciale TEXT,
    fournisseur      TEXT,
    marque           TEXT,
    groupe_frs       TEXT,
    famille          TEXT,
    sous_famille     TEXT,
    ca               DECIMAL(15, 2) DEFAULT 0,
    commercial       TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requetes de comparaison
CREATE INDEX IF NOT EXISTS idx_pure_data_annee       ON pure_data(annee);
CREATE INDEX IF NOT EXISTS idx_pure_data_mois        ON pure_data(mois);
CREATE INDEX IF NOT EXISTS idx_pure_data_fournisseur ON pure_data(fournisseur);
CREATE INDEX IF NOT EXISTS idx_pure_data_code_union  ON pure_data(code_union);
CREATE INDEX IF NOT EXISTS idx_pure_data_commercial  ON pure_data(commercial);
CREATE INDEX IF NOT EXISTS idx_pure_data_annee_mois  ON pure_data(annee, mois);
