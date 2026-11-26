import { useEffect, useState } from 'react';
import { getClientMonthlyEvolution, getClientRfa, getImpayesByAdherent } from '../api/consultation';
import { alertBadge, buildOwnAlerts } from '../utils/adherentAlerts';

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
    ])
      .then(([rfa, monthly, impayes]) => {
        if (cancel) return;
        const alerts = buildOwnAlerts(rfa, monthly?.platforms || []);
        const actifs = (impayes?.items || []).filter((item) => item.actif).length;
        const next = alertBadge(alerts, actifs);
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
