-- APA Marseille 2026 : tableau de base sous le seuil, avenant au-dessus, sans cumul.
--
-- PAS ENCORE APPLIQUÉ. Ne pas lancer ce script tant qu'il n'a pas été relu.
-- Il ne met à jour que les 4 règles GLOBAL du contrat nommé
-- « APA Marseille 2026 » (id 37 en production au 26 novembre 2026).
-- La sélection se fait par le nom, pas par l'id.
--
-- Ne modifie pas :
--   « APA Marseille – Avenant Union Nord + Franchise » (contrat 2025, id 7)
--   les règles tripartites
--   les autres contrats et les affectations
--
-- Le moteur RFA lit contractrule. Déployer le code ne suffit pas :
-- sans cette mise à jour, la projection 2026 reste à 0 % sous le seuil.
--
-- À lancer UNE FOIS, à la main, sur le projet Supabase groupement-union-rfa :
--   Tableau de bord → SQL Editor → coller ce fichier → Run.
-- Le script Python équivalent, qui lit le JSON et refuse les effets de bord,
-- est backend/_sync_apa_marseille_2026_base_and_addendum.py (--apply).
--
-- En cas d'échec, la transaction est annulée.

BEGIN;

DO $$
DECLARE
    apa_count integer;
    legacy_count integer;
    global_count integer;
BEGIN
    SELECT count(*) INTO apa_count
    FROM contract
    WHERE name = 'APA Marseille 2026';
    IF apa_count <> 1 THEN
        RAISE EXCEPTION 'Contrat APA Marseille 2026 introuvable ou dupliqué (%s)', apa_count;
    END IF;

    SELECT count(*) INTO legacy_count
    FROM contract
    WHERE name = $name$APA Marseille – Avenant Union Nord + Franchise$name$;
    IF legacy_count <> 1 THEN
        RAISE EXCEPTION 'Contrat APA 2025 inattendu (%s). Aucune écriture.', legacy_count;
    END IF;

    SELECT count(*) INTO global_count
    FROM contractrule AS r
    JOIN contract AS c ON c.id = r.contract_id
    WHERE c.name = 'APA Marseille 2026'
      AND r.scope = 'GLOBAL'
      AND r.key IN ('GLOBAL_ACR', 'GLOBAL_ALLIANCE', 'GLOBAL_DCA', 'GLOBAL_EXADIS');
    IF global_count <> 4 THEN
        RAISE EXCEPTION 'Règles globales APA 2026 inattendues (%s). Aucune écriture.', global_count;
    END IF;
END $$;

CREATE TEMP TABLE _apa_other_rules AS
SELECT r.id, r.tiers_rfa, r.tiers_bonus, r.tiers, r.bonus_groups
FROM contractrule AS r
JOIN contract AS c ON c.id = r.contract_id
WHERE NOT (
    c.name = 'APA Marseille 2026'
    AND r.scope = 'GLOBAL'
    AND r.key IN ('GLOBAL_ACR', 'GLOBAL_ALLIANCE', 'GLOBAL_DCA', 'GLOBAL_EXADIS')
);

CREATE TEMP TABLE _apa_other_contracts AS
SELECT id, name, description, use_combined_global_rate, is_active, scope
FROM contract
WHERE name <> 'APA Marseille 2026';

CREATE TEMP TABLE _apa_assignments AS
SELECT id, contract_id, target_type, target_value, priority
FROM contractassignment;

UPDATE contract
SET description = $apa$RFA 2026 APA Marseille. Sous le seuil de l'avenant : tableau de base 2026 (RFA + bonus, jusqu'à 3,5 % + 3 %). À partir du seuil, l'avenant remplace le tableau et ne se cumule pas : Alliance/EXADIS/ACR 11 % dès 450 k€ (bonus remis à 0), DCA 10,5 % dès 150 k€ (bonus remis à 0). Bonus Nord+Franchise : Alliance+ACR passent à 12 % si Alliance≥450 k€ ET ACR≥450 k€ ET CA total≥2 M€ (géré par le calculateur, hors barème). Tripartites livret 2026 inchangés. Partenaires FUCHS/TOTAL/NPS hors moteur RFA. Cotisation Alliance offerte (ne pas déduire).$apa$,
    updated_at = now()
WHERE name = 'APA Marseille 2026';

UPDATE contractrule AS r
SET tiers_rfa = $apa$[{"min": 20000, "rate": 0.01}, {"min": 50000, "rate": 0.015}, {"min": 75000, "rate": 0.02}, {"min": 100000, "rate": 0.025}, {"min": 150000, "rate": 0.03}, {"min": 200000, "rate": 0.035}, {"min": 450000, "rate": 0.11}]$apa$,
    tiers_bonus = $apa$[{"min": 20000, "rate": 0.005}, {"min": 50000, "rate": 0.01}, {"min": 75000, "rate": 0.015}, {"min": 100000, "rate": 0.02}, {"min": 150000, "rate": 0.025}, {"min": 200000, "rate": 0.03}, {"min": 450000, "rate": 0.0}]$apa$,
    updated_at = now()
FROM contract AS c
WHERE r.contract_id = c.id
  AND c.name = 'APA Marseille 2026'
  AND r.key = 'GLOBAL_ACR'
  AND r.scope = 'GLOBAL';

UPDATE contractrule AS r
SET tiers_rfa = $apa$[{"min": 20000, "rate": 0.01}, {"min": 50000, "rate": 0.015}, {"min": 75000, "rate": 0.02}, {"min": 100000, "rate": 0.025}, {"min": 150000, "rate": 0.03}, {"min": 200000, "rate": 0.035}, {"min": 450000, "rate": 0.11}]$apa$,
    tiers_bonus = $apa$[{"min": 20000, "rate": 0.005}, {"min": 50000, "rate": 0.01}, {"min": 75000, "rate": 0.015}, {"min": 100000, "rate": 0.02}, {"min": 150000, "rate": 0.025}, {"min": 200000, "rate": 0.03}, {"min": 450000, "rate": 0.0}]$apa$,
    updated_at = now()
FROM contract AS c
WHERE r.contract_id = c.id
  AND c.name = 'APA Marseille 2026'
  AND r.key = 'GLOBAL_ALLIANCE'
  AND r.scope = 'GLOBAL';

UPDATE contractrule AS r
SET tiers_rfa = $apa$[{"min": 20000, "rate": 0.01}, {"min": 50000, "rate": 0.015}, {"min": 75000, "rate": 0.02}, {"min": 100000, "rate": 0.025}, {"min": 150000, "rate": 0.105}]$apa$,
    tiers_bonus = $apa$[{"min": 20000, "rate": 0.005}, {"min": 50000, "rate": 0.01}, {"min": 75000, "rate": 0.015}, {"min": 100000, "rate": 0.02}, {"min": 150000, "rate": 0.0}]$apa$,
    updated_at = now()
FROM contract AS c
WHERE r.contract_id = c.id
  AND c.name = 'APA Marseille 2026'
  AND r.key = 'GLOBAL_DCA'
  AND r.scope = 'GLOBAL';

UPDATE contractrule AS r
SET tiers_rfa = $apa$[{"min": 20000, "rate": 0.01}, {"min": 50000, "rate": 0.015}, {"min": 75000, "rate": 0.02}, {"min": 100000, "rate": 0.025}, {"min": 150000, "rate": 0.03}, {"min": 200000, "rate": 0.035}, {"min": 450000, "rate": 0.11}]$apa$,
    tiers_bonus = $apa$[{"min": 20000, "rate": 0.005}, {"min": 50000, "rate": 0.01}, {"min": 75000, "rate": 0.015}, {"min": 100000, "rate": 0.02}, {"min": 150000, "rate": 0.025}, {"min": 200000, "rate": 0.03}, {"min": 450000, "rate": 0.0}]$apa$,
    updated_at = now()
FROM contract AS c
WHERE r.contract_id = c.id
  AND c.name = 'APA Marseille 2026'
  AND r.key = 'GLOBAL_EXADIS'
  AND r.scope = 'GLOBAL';

DO $$
DECLARE
    n integer;
    drifted integer;
BEGIN
    SELECT count(*) INTO n
    FROM contractrule AS r
    JOIN contract AS c ON c.id = r.contract_id
    WHERE c.name = 'APA Marseille 2026'
      AND r.key = 'GLOBAL_ACR'
      AND r.scope = 'GLOBAL'
      AND r.tiers_rfa = $apa$[{"min": 20000, "rate": 0.01}, {"min": 50000, "rate": 0.015}, {"min": 75000, "rate": 0.02}, {"min": 100000, "rate": 0.025}, {"min": 150000, "rate": 0.03}, {"min": 200000, "rate": 0.035}, {"min": 450000, "rate": 0.11}]$apa$
      AND r.tiers_bonus = $apa$[{"min": 20000, "rate": 0.005}, {"min": 50000, "rate": 0.01}, {"min": 75000, "rate": 0.015}, {"min": 100000, "rate": 0.02}, {"min": 150000, "rate": 0.025}, {"min": 200000, "rate": 0.03}, {"min": 450000, "rate": 0.0}]$apa$;
    IF n <> 1 THEN
        RAISE EXCEPTION 'GLOBAL_ACR non mis à jour (lignes=%s)', n;
    END IF;
    SELECT count(*) INTO n
    FROM contractrule AS r
    JOIN contract AS c ON c.id = r.contract_id
    WHERE c.name = 'APA Marseille 2026'
      AND r.key = 'GLOBAL_ALLIANCE'
      AND r.scope = 'GLOBAL'
      AND r.tiers_rfa = $apa$[{"min": 20000, "rate": 0.01}, {"min": 50000, "rate": 0.015}, {"min": 75000, "rate": 0.02}, {"min": 100000, "rate": 0.025}, {"min": 150000, "rate": 0.03}, {"min": 200000, "rate": 0.035}, {"min": 450000, "rate": 0.11}]$apa$
      AND r.tiers_bonus = $apa$[{"min": 20000, "rate": 0.005}, {"min": 50000, "rate": 0.01}, {"min": 75000, "rate": 0.015}, {"min": 100000, "rate": 0.02}, {"min": 150000, "rate": 0.025}, {"min": 200000, "rate": 0.03}, {"min": 450000, "rate": 0.0}]$apa$;
    IF n <> 1 THEN
        RAISE EXCEPTION 'GLOBAL_ALLIANCE non mis à jour (lignes=%s)', n;
    END IF;
    SELECT count(*) INTO n
    FROM contractrule AS r
    JOIN contract AS c ON c.id = r.contract_id
    WHERE c.name = 'APA Marseille 2026'
      AND r.key = 'GLOBAL_DCA'
      AND r.scope = 'GLOBAL'
      AND r.tiers_rfa = $apa$[{"min": 20000, "rate": 0.01}, {"min": 50000, "rate": 0.015}, {"min": 75000, "rate": 0.02}, {"min": 100000, "rate": 0.025}, {"min": 150000, "rate": 0.105}]$apa$
      AND r.tiers_bonus = $apa$[{"min": 20000, "rate": 0.005}, {"min": 50000, "rate": 0.01}, {"min": 75000, "rate": 0.015}, {"min": 100000, "rate": 0.02}, {"min": 150000, "rate": 0.0}]$apa$;
    IF n <> 1 THEN
        RAISE EXCEPTION 'GLOBAL_DCA non mis à jour (lignes=%s)', n;
    END IF;
    SELECT count(*) INTO n
    FROM contractrule AS r
    JOIN contract AS c ON c.id = r.contract_id
    WHERE c.name = 'APA Marseille 2026'
      AND r.key = 'GLOBAL_EXADIS'
      AND r.scope = 'GLOBAL'
      AND r.tiers_rfa = $apa$[{"min": 20000, "rate": 0.01}, {"min": 50000, "rate": 0.015}, {"min": 75000, "rate": 0.02}, {"min": 100000, "rate": 0.025}, {"min": 150000, "rate": 0.03}, {"min": 200000, "rate": 0.035}, {"min": 450000, "rate": 0.11}]$apa$
      AND r.tiers_bonus = $apa$[{"min": 20000, "rate": 0.005}, {"min": 50000, "rate": 0.01}, {"min": 75000, "rate": 0.015}, {"min": 100000, "rate": 0.02}, {"min": 150000, "rate": 0.025}, {"min": 200000, "rate": 0.03}, {"min": 450000, "rate": 0.0}]$apa$;
    IF n <> 1 THEN
        RAISE EXCEPTION 'GLOBAL_EXADIS non mis à jour (lignes=%s)', n;
    END IF;

    SELECT count(*) INTO drifted
    FROM _apa_other_rules AS g
    JOIN contractrule AS r ON r.id = g.id
    WHERE r.tiers_rfa IS DISTINCT FROM g.tiers_rfa
       OR r.tiers_bonus IS DISTINCT FROM g.tiers_bonus
       OR r.tiers IS DISTINCT FROM g.tiers
       OR r.bonus_groups IS DISTINCT FROM g.bonus_groups;
    IF drifted <> 0 THEN
        RAISE EXCEPTION 'Une règle hors barème global APA 2026 a changé (%s). Annulation.', drifted;
    END IF;

    SELECT count(*) INTO drifted
    FROM _apa_other_contracts AS g
    JOIN contract AS c ON c.id = g.id
    WHERE c.name IS DISTINCT FROM g.name
       OR c.description IS DISTINCT FROM g.description
       OR c.use_combined_global_rate IS DISTINCT FROM g.use_combined_global_rate
       OR c.is_active IS DISTINCT FROM g.is_active
       OR c.scope IS DISTINCT FROM g.scope;
    IF drifted <> 0 THEN
        RAISE EXCEPTION 'Un autre contrat a changé (%s). Annulation.', drifted;
    END IF;

    SELECT count(*) INTO drifted
    FROM _apa_assignments AS g
    JOIN contractassignment AS a ON a.id = g.id
    WHERE a.contract_id IS DISTINCT FROM g.contract_id
       OR a.target_type IS DISTINCT FROM g.target_type
       OR a.target_value IS DISTINCT FROM g.target_value
       OR a.priority IS DISTINCT FROM g.priority;
    IF drifted <> 0 THEN
        RAISE EXCEPTION 'Une affectation a changé (%s). Annulation.', drifted;
    END IF;
END $$;

COMMIT;
