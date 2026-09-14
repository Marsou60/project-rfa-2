import { fmtEuro } from './format';

export type CotisationPayload = {
  amount?: number;
  deducted?: number;
  facturee?: boolean;
  deduite?: boolean;
  is_offerte?: boolean;
  is_facture?: boolean;
  source?: string;
  label?: string;
  billed_at_group?: string;
  [key: string]: unknown;
};

export type CotisationView = {
  amount: number;
  badge: string;
  body: string;
  tone: 'green' | 'orange' | 'sky' | 'muted';
};

/**
 * Cotisation Union is independent of RFA: offered, billed-and-deducted, billed-not-deducted, or group-level.
 * Never infer “déduite” from the mere presence of an amount.
 */
export function describeCotisation(c?: CotisationPayload | null): CotisationView | null {
  if (!c) return null;
  const amount = Number(c.amount) || 0;
  const deductedNum = Number(c.deducted) || 0;
  const groupMember = c.source === 'group_member' || Boolean(c.billed_at_group);
  const isOfferte =
    Boolean(c.is_offerte) || (amount > 0 && c.facturee === false && c.deduite === false);
  const isFacture =
    Boolean(c.is_facture) || (amount > 0 && c.facturee === true && c.deduite === true);

  if (groupMember) {
    const group = String(c.billed_at_group || '').trim();
    return {
      amount,
      badge: 'Via le groupe',
      body: group
        ? `Facturée au groupe ${group}. Elle n’est pas prélevée sur la RFA de ce magasin.`
        : 'Facturée au niveau du groupe, pas sur la RFA de ce magasin.',
      tone: 'sky',
    };
  }

  if (amount <= 0) return null;

  if (isOfferte) {
    return {
      amount,
      badge: 'Offerte',
      body: `${fmtEuro(amount)} — geste commercial. Ce montant n’est pas déduit de la RFA.`,
      tone: 'green',
    };
  }

  if (isFacture || deductedNum > 0) {
    const taken = deductedNum > 0 ? deductedNum : amount;
    return {
      amount,
      badge: 'Déduite de la RFA',
      body: `${fmtEuro(taken)} sont retranchés de la RFA nette affichée.`,
      tone: 'orange',
    };
  }

  if (c.facturee === true && c.deduite === false) {
    return {
      amount,
      badge: 'Facturée, non déduite',
      body: `${fmtEuro(amount)} sont dus, mais ne sont pas retranchés de la RFA affichée.`,
      tone: 'muted',
    };
  }

  return {
    amount,
    badge: 'Non déduite',
    body: `${fmtEuro(amount)} figurent au barème, sans retranchement sur la RFA à date.`,
    tone: 'muted',
  };
}
