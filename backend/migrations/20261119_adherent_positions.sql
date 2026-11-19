-- Coordonnées des adhérents pour l'écran Carte de la PWA.
--
-- À lancer UNE FOIS, par Martial, sur le projet Supabase groupement-union-rfa.
-- Ne pas l'exécuter depuis l'application : le backend lit ensuite cette table
-- avec la connexion déjà en place (rôle postgres), après authentification.
--
-- Comment lancer :
--   1. Tableau de bord Supabase → SQL Editor → coller ce fichier → Run.
--   ou, depuis un terminal où DATABASE_URL est déjà exporté (ne pas coller
--   le mot de passe dans la commande ni dans un fichier du dépôt) :
--   psql "$DATABASE_URL" -f backend/migrations/20261119_adherent_positions.sql
--
-- Ensuite seulement : python backend/scripts/geocode_adherents.py
-- puis le même script avec --apply.
--
-- Pourquoi une table dédiée : les adresses vivent dans nathalie_adherents,
-- et adherent_profils est la photo CA (une ligne par code, année 2026),
-- sans rue ni code postal. La clé reste code_union.

CREATE TABLE IF NOT EXISTS public.adherent_positions (
    code_union text PRIMARY KEY,
    lat double precision,
    lng double precision,
    geocode_status text NOT NULL DEFAULT 'pending',
    geocode_score double precision,
    result_type text,
    address_fingerprint text,
    geocoded_at timestamptz,
    CONSTRAINT adherent_positions_status_chk CHECK (
        geocode_status IN ('ok', 'no_address', 'failed', 'ambiguous', 'pending')
    ),
    CONSTRAINT adherent_positions_pair_chk CHECK (
        (lat IS NULL AND lng IS NULL)
        OR (lat IS NOT NULL AND lng IS NOT NULL)
    )
);

COMMENT ON TABLE public.adherent_positions IS
    'Lat/lng des adhérents. Pas d''adresse en clair. Lecture réservée au backend authentifié.';

COMMENT ON COLUMN public.adherent_positions.address_fingerprint IS
    'Empreinte de l''adresse, pour ne pas regéocoder si rien n''a changé. Pas l''adresse elle-même.';

-- RLS ouvert sans policy = personne via l'API Supabase (anon / authenticated).
-- Le backend Railway utilise le rôle postgres, qui contourne le RLS, comme
-- pour le reste du métier. On retire en plus les droits directs.
ALTER TABLE public.adherent_positions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.adherent_positions FROM PUBLIC;
REVOKE ALL ON TABLE public.adherent_positions FROM anon;
REVOKE ALL ON TABLE public.adherent_positions FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.adherent_positions TO service_role;
