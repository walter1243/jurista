import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import type { CalculatedDebt, Debt } from './types.js';

const DAILY_DIVISOR = new Decimal(30);

function roundMoney(value: Decimal): number {
  return Number(value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString());
}

export function getDaysOverdue(dueDateISO: string, referenceDateISO: string): number {
  const due = dayjs(dueDateISO).startOf('day');
  const ref = dayjs(referenceDateISO).startOf('day');

  if (!ref.isAfter(due)) {
    return 0;
  }

  return ref.diff(due, 'day');
}

export function calculateDebt(debt: Debt, referenceDateISO?: string): CalculatedDebt {
  const principal = new Decimal(debt.principalAmount);
  const paidAmount = new Decimal(debt.paidAmount || 0);
  const principalOutstanding = Decimal.max(principal.minus(paidAmount), 0);

  const calcDate = debt.paymentDate ?? referenceDateISO ?? dayjs().format('YYYY-MM-DD');
  const daysOverdue = getDaysOverdue(debt.dueDate, calcDate);

  const isOverdue = daysOverdue > 0;
  const monthlyRate = new Decimal(debt.interestRateMonthly).div(100);
  const dailyRate = monthlyRate.div(DAILY_DIVISOR);

  const fineAmount = isOverdue
    ? principalOutstanding.mul(new Decimal(debt.fineRate).div(100))
    : new Decimal(0);

  const accruedInterest = principalOutstanding.mul(dailyRate).mul(daysOverdue);
  const totalDue = principalOutstanding.plus(fineAmount).plus(accruedInterest);

  let status: CalculatedDebt['status'] = 'pending';
  if (principalOutstanding.eq(0)) {
    status = 'paid';
  } else if (paidAmount.gt(0)) {
    status = isOverdue ? 'overdue' : 'partial';
  } else if (isOverdue) {
    status = 'overdue';
  }

  return {
    daysOverdue,
    principalOutstanding: roundMoney(principalOutstanding),
    fineAmount: roundMoney(fineAmount),
    accruedInterest: roundMoney(accruedInterest),
    totalDue: roundMoney(totalDue),
    status,
  };
}
