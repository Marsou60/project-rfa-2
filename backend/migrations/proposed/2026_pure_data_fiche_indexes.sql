-- PROPOSITION UNIQUEMENT. Ne pas exécuter depuis l'application, ni au démarrage,
-- ni par une migration automatique. À relire puis appliquer à la main, hors de cette PR.
--
-- Les fiches filtrent par égalité sur la graphie stockée (code_union ou groupe_client),
-- après avoir choisi ces graphies en Python. Un index d'expression UPPER(TRIM(...))
-- ne serait pas utilisé : il n'est pas proposé.
--
-- (code_union, annee) sert la lecture par code, avec ou sans année (préfixe gauche).
-- (groupe_client, annee) sert la lecture par groupe.
-- Pas d'index séparé sur code_union ou groupe_client : il ferait double emploi.
-- Pas d'index sur annee seule : le filtre réseau est
--   annee = :year OR CAST(annee AS TEXT) LIKE '%year%'
-- et ce OR empêche un index scan utile. Le gain réseau est le volume renvoyé, pas l'index.

CREATE INDEX IF NOT EXISTS idx_pure_data_cumulative_code_annee
    ON pure_data_cumulative (code_union, annee);

CREATE INDEX IF NOT EXISTS idx_pure_data_cumulative_groupe_annee
    ON pure_data_cumulative (groupe_client, annee);

CREATE INDEX IF NOT EXISTS idx_pure_data_monthly_code_annee
    ON pure_data_monthly (code_union, annee);

CREATE INDEX IF NOT EXISTS idx_pure_data_monthly_groupe_annee
    ON pure_data_monthly (groupe_client, annee);
