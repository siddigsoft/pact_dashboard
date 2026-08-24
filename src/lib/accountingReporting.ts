export interface AccountingReportingPeriod {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  fiscal_year_id: string;
}

const localDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Prefer the period containing today. If it does not exist, use the newest
 * open/soft-closed period, then the newest period of any status.
 */
export function getDefaultAccountingPeriod<T extends AccountingReportingPeriod>(
  periods: T[],
  today = new Date(),
): T | undefined {
  const todayString = localDateString(today);
  const byNewestStart = (a: T, b: T) => b.start_date.localeCompare(a.start_date);

  const currentPeriod = periods
    .filter(period => period.start_date <= todayString && period.end_date >= todayString)
    .sort(byNewestStart)[0];
  if (currentPeriod) return currentPeriod;

  const openPeriod = periods
    .filter(period => period.status === 'open' || period.status === 'soft_closed')
    .sort(byNewestStart)[0];
  return openPeriod ?? [...periods].sort(byNewestStart)[0];
}