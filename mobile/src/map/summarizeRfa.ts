import { ClientRfaResponse, RfaLine } from '../api/consultation';
import { fmtEuro, fmtPct } from '../utils/format';
import { globalProgress, parseTiers } from '../utils/rfaProgress';

const SILVER_MIN = 100_001;
const GOLD_MIN = 300_001;

export type TierLine = {
  key: string;
  label: string;
  ca: number;
  rateLabel: string;
  detail: string;
  progress: number;
};

export type RfaSummary = {
  ca: number;
  rfa: number;
  level: string | null;
  contract: string | null;
  objectiveTitle: string;
  objectiveBody: string;
  progress: number;
  done: boolean;
  lines: TierLine[];
};

function lineProgress(line: RfaLine) {
  return globalProgress(
    line.ca || 0,
    parseTiers(line.tiers_rfa),
    parseTiers(line.tiers_bonus),
    line.ca_exclu ? line.ca_remunere : null,
  );
}

/** Résumé compact : mêmes chiffres et mêmes paliers que la fiche RFA. */
export function summarizeRfa(data: ClientRfaResponse | null | undefined): RfaSummary | null {
  if (!data?.available) return null;
  const ca = Number(data.ca?.totals?.global_total) || 0;
  const rfa = Number(data.rfa_net ?? data.rfa?.totals?.grand_total) || 0;
  const level = data.contract_level?.id || data.contract_applied?.level || null;
  const entries = Object.entries(data.rfa?.global || {}).filter(([, line]) => (line.ca || 0) > 0);
  const lines: TierLine[] = entries.slice(0, 4).map(([key, line]) => {
    const prog = lineProgress(line);
    const detail =
      prog.nextMin != null
        ? `Encore ${fmtEuro(prog.missing)} pour le palier suivant`
        : 'Palier maximum atteint';
    return {
      key,
      label: line.label || key,
      ca: line.ca || 0,
      rateLabel: fmtPct(prog.rate),
      detail,
      progress: prog.progress,
    };
  });

  const gapSilver = Math.max(SILVER_MIN - ca, 0);
  const gapGold = Math.max(GOLD_MIN - ca, 0);
  const levelId = String(level || '').toUpperCase();
  const closest = [...lines].filter((line) => line.progress < 100).sort((a, b) => b.progress - a.progress)[0];

  let objectiveTitle = 'Paliers';
  let objectiveBody = lines.length ? 'Barème appliqué sur les plateformes.' : 'Pas de palier à afficher.';
  let progress = closest?.progress || 0;
  let done = false;

  if (levelId === 'CLASSIQUE' && gapSilver > 0) {
    objectiveTitle = 'Objectif : Silver';
    objectiveBody = `Encore ${fmtEuro(gapSilver)} de CA global pour débloquer les tripartites.`;
    progress = Math.min((ca / SILVER_MIN) * 100, 100);
  } else if (levelId === 'SILVER' && gapGold > 0) {
    objectiveTitle = 'Objectif : Gold';
    objectiveBody = `Encore ${fmtEuro(gapGold)} de CA global pour le bonus Union supérieur.`;
    progress = Math.min((ca / GOLD_MIN) * 100, 100);
  } else if (closest) {
    objectiveTitle = `Prochain palier · ${closest.label}`;
    objectiveBody = closest.detail;
    progress = closest.progress;
  } else if (lines.length) {
    objectiveTitle = 'Objectifs atteints';
    objectiveBody = 'Paliers maximaux atteints sur les plateformes suivies.';
    progress = 100;
    done = true;
  }

  return {
    ca,
    rfa,
    level,
    contract: data.contract_applied?.name || null,
    objectiveTitle,
    objectiveBody,
    progress,
    done,
    lines,
  };
}
