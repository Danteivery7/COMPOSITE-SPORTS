function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function moneylineToProbability(odds) {
  const numeric = toNumber(String(odds ?? '').replace('+', ''));
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) {
    return Math.abs(numeric) / (Math.abs(numeric) + 100);
  }
  return 100 / (numeric + 100);
}

export function americanToDecimal(odds) {
  const numeric = toNumber(String(odds ?? '').replace('+', ''));
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) {
    return 1 + 100 / Math.abs(numeric);
  }
  return 1 + numeric / 100;
}

export function formatAmericanOdds(odds) {
  const numeric = toNumber(odds);
  if (!Number.isFinite(numeric)) return 'No line';
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

export function extractEspnOdds(competition = {}, fallback = null) {
  const odds = competition?.odds?.[0] || competition?.pickcenter?.[0] || fallback || null;
  if (!odds) return null;

  const homeMoneyline = odds?.moneyline?.home?.close?.odds ?? odds?.homeTeamOdds?.moneyLine ?? null;
  const awayMoneyline = odds?.moneyline?.away?.close?.odds ?? odds?.awayTeamOdds?.moneyLine ?? null;
  const homeSpread = odds?.pointSpread?.home?.close?.line ?? odds?.homeTeamOdds?.spread ?? null;
  const awaySpread = odds?.pointSpread?.away?.close?.line ?? odds?.awayTeamOdds?.spread ?? null;
  const overUnder = toNumber(odds?.overUnder);

  return {
    provider: odds?.provider?.displayName || odds?.provider?.name || 'DraftKings via ESPN',
    details: odds?.details || '',
    overUnder,
    spread: toNumber(odds?.spread),
    homeMoneyline: toNumber(homeMoneyline),
    awayMoneyline: toNumber(awayMoneyline),
    homeSpread: toNumber(homeSpread),
    awaySpread: toNumber(awaySpread),
    link: odds?.link?.href || '',
  };
}

export function buildParlayOdds(legs = []) {
  const decimals = legs
    .map((leg) => americanToDecimal(leg?.americanOdds))
    .filter((value) => Number.isFinite(value) && value > 1);
  if (!decimals.length) return null;

  const decimal = decimals.reduce((product, value) => product * value, 1);
  const american =
    decimal >= 2
      ? Math.round((decimal - 1) * 100)
      : Math.round(-100 / (decimal - 1));

  return {
    decimal: Math.round(decimal * 100) / 100,
    american,
  };
}

export function calculateReturn(stake, americanOdds) {
  const decimal = americanToDecimal(americanOdds);
  if (!Number.isFinite(decimal)) return null;
  return Math.round(stake * decimal * 100) / 100;
}
