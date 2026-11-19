-- PROPOSITION UNIQUEMENT. Ne pas exécuter depuis l'application, ni au démarrage,
-- ni par ce dépôt. À relire puis appliquer à la main, hors de cette PR,
-- sur le projet Supabase, après backend/migrations/20261119_adherent_positions.sql.
--
-- Ajoute un verrou d'origine sur la position. Le script
-- backend/scripts/geocode_adherents.py ne géocode pas les adhérents fermés,
-- et n'écrase jamais une ligne dont position_source vaut ok_manual ou insee
-- (même avec --force). Tant que cette colonne n'existe pas, le script
-- l'indique et ne verrouille rien.
--
-- Valeurs :
--   ban        géocodage API Adresse, remplaçable si l'adresse change
--   ok_manual  position posée à la main, verrouillée
--   insee      position issue d'un fichier INSEE, verrouillée
--
-- Exemple une fois la colonne en place (adapter le code, ne pas lancer tel quel) :
--   UPDATE public.adherent_positions
--   SET position_source = 'ok_manual'
--   WHERE code_union = 'CODE';

ALTER TABLE public.adherent_positions
    ADD COLUMN IF NOT EXISTS position_source text;

UPDATE public.adherent_positions
SET position_source = 'ban'
WHERE position_source IS NULL;

ALTER TABLE public.adherent_positions
    ALTER COLUMN position_source SET DEFAULT 'ban';

ALTER TABLE public.adherent_positions
    ALTER COLUMN position_source SET NOT NULL;

ALTER TABLE public.adherent_positions
    DROP CONSTRAINT IF EXISTS adherent_positions_source_chk;

ALTER TABLE public.adherent_positions
    ADD CONSTRAINT adherent_positions_source_chk
    CHECK (position_source IN ('ban', 'ok_manual', 'insee'));

COMMENT ON COLUMN public.adherent_positions.position_source IS
    'Origine du point. ok_manual et insee sont verrouillés : le géocodage BAN ne les écrase pas.';
