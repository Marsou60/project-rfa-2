import { useEffect, useState } from 'react';
import { getClientMonthlyEvolution, getClientRfa, getClientDashboard, getImpayesByAdherent } from '../api/consultation';
import { getMyMissingDocs } from '../api/fiches';
import { alertBadge, buildOwnAlerts } from '../utils/adherentAlerts';
import { buildSituationAlerts } from '../utils/adherentSituation';

/** Compte pour le badge de l’onglet. 0 reste invisible. */
export function useAdherentAlertBadge(code?: string | null, groupe?: string | null): number | undefined {
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!code && !groupe) {
      setCount(undefined);
      return undefined;
    }
    let cancel = false;
    Promise.all([
      getClientRfa({ codeUnion: code, groupeClient: code ? null : groupe, year: 2026 }),
      getClientMonthlyEvolution({ codeUnion: code, groupeClient: code ? null : groupe }).catch(() => null),
      code ? getImpayesByAdherent(code).catch(() => null) : Promise.resolve(null),
      getClientDashboard({ codeUnion: code, groupeClient: code ? null : groupe }).catch(() => null),
      code ? getMyMissingDocs().catch(() => []) : Promise.resolve([]),
    ])
      .then(([rfa, monthly, impayes, dash, missing]) => {
        if (cancel) return;
        const alerts = buildOwnAlerts(rfa, monthly?.platforms || []);
        const situation = buildSituationAlerts({
          brands: dash?.top_marques || [],
          months: monthly?.months || [],
          missingDocs: missing,
          reached: alerts.reached,
          reportingMonth: rfa.reporting_month,
        });
        const actifs = (impayes?.items || []).filter((item) => item.actif).length;
        const next = alertBadge(alerts, actifs) + situation.badge;
        setCount(next > 0 ? next : undefined);
      })
      .catch(() => {
        if (!cancel) setCount(undefined);
      });
    return () => {
      cancel = true;
    };
  }, [code, groupe]);

  return count;
}
