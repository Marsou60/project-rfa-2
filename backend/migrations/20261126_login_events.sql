-- Journal des connexions réussies (mot de passe saisi).
--
-- APPLIQUÉ le 26 novembre 2026 sur le projet Supabase groupement-union-rfa
-- (réf. ccoctyncllgpycagltrq). Ne pas relancer.
--
-- Ne crée que public.login_events. Aucune autre table n'est modifiée.
-- Pas de clé étrangère vers public.user.
-- RLS activé, aucune policy. anon et authenticated n'ont aucun droit.
-- Le backend Railway (rôle postgres) écrit dans la même connexion que le login.
--
-- Retour arrière (efface l'historique) :
--   DROP TABLE IF EXISTS public.login_events;

CREATE TABLE public.login_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id integer NOT NULL,
    logged_at timestamptz NOT NULL DEFAULT now(),
    channel text NOT NULL,
    user_agent text,
    CONSTRAINT login_events_channel_check CHECK (channel IN ('web', 'mobile')),
    CONSTRAINT login_events_user_agent_len CHECK (
        user_agent IS NULL OR char_length(user_agent) <= 300
    )
);

COMMENT ON TABLE public.login_events IS
    'Connexions réussies (mot de passe saisi) des comptes RFA. web = site admin, mobile = PWA. Pas d''adresse IP, pas de jeton.';

CREATE INDEX login_events_user_id_logged_at_idx
    ON public.login_events (user_id, logged_at);

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.login_events FROM PUBLIC;
REVOKE ALL ON TABLE public.login_events FROM anon;
REVOKE ALL ON TABLE public.login_events FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_events TO postgres;

REVOKE ALL ON SEQUENCE public.login_events_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.login_events_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.login_events_id_seq FROM authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.login_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.login_events_id_seq TO postgres;
