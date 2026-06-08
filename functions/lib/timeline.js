const RULES = {
  kaizen_submission: { start: 1, end: 28 },
  kaizen_screening: { start: 29, end: 31 },
  kaizen_eval: { start: 15, end: 20, monthOffset: 1 },
  behavioral_eval: { start: 29, end: 31 },
  hr_approval: { start: 1, end: 5, monthOffset: 1 },
  qc_screening: { start: 22, end: 31, quarterEnd: true },
  qc_panel: { start: 1, end: 15, quarterStart: true }
};

export const isWithinWindow = (module) => {
  const rule = RULES[module];
  if (!rule) return { allowed: true, message: 'No timeline restriction' };

  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  if (rule.quarterEnd) {
    // Only allowed in last week of quarter-end months (Mar, Jun, Sep, Dec)
    const quarterEndMonths = [2, 5, 8, 11];
    if (!quarterEndMonths.includes(month)) {
      return { allowed: false, message: `${module} is only available in the last week of quarter-end months (Mar, Jun, Sep, Dec)` };
    }
  }

  if (rule.quarterStart) {
    // Only allowed in first 15 days after quarter ends (Apr, Jul, Oct, Jan)
    const quarterStartMonths = [0, 3, 6, 9];
    if (!quarterStartMonths.includes(month)) {
      return { allowed: false, message: `${module} is only available in the first 15 days after quarter end (Jan, Apr, Jul, Oct)` };
    }
  }

  if (day < rule.start || day > rule.end) {
    return {
      allowed: false,
      message: `${module} is only available from day ${rule.start} to ${rule.end} of the month`,
      opensAt: new Date(year, month, rule.start)
    };
  }

  return { allowed: true, message: 'Within submission window' };
}

export function getActiveWindows() {
  const windows = {};
  for (const [module, rule] of Object.entries(RULES)) {
    const check = isWithinWindow(module);
    windows[module] = {
      ...check,
      start_day: rule.start,
      end_day: rule.end
    };
  }
  return windows;
}

export function getCurrentQuarter() {
  const month = new Date().getMonth();
  return Math.floor(month / 3) + 1;
}

export function getQuarterRange(year, quarter) {
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, startMonth + 3, 0, 23, 59, 59)
  };
}
