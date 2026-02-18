/** Date helpers: previous month (PM) and the month before that (PPM) */
export function getMonthlyRanges() {
  const now = new Date();
  const pmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const ppmStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const ppmEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return {
    prevMonth: { startDate: fmt(pmStart), endDate: fmt(pmEnd) },
    prevPrevMonth: { startDate: fmt(ppmStart), endDate: fmt(ppmEnd) },
  };
}
