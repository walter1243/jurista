export type EntityStatus = 'active' | 'inactive';

export interface Client {
  id: string;
  name: string;
  cpfCnpj: string;
  phone?: string;
  email?: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Debtor {
  id: string;
  clientId: string;
  name: string;
  cpf: string;
  phone?: string;
  email?: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export type DebtStatus = 'pending' | 'partial' | 'paid' | 'overdue';

export interface Payment {
  id: string;
  debtId: string;
  amount: number;
  paymentDate: string;
  createdAt: string;
}

export interface Debt {
  id: string;
  clientId: string;
  debtorId: string;
  principalAmount: number;
  interestRateMonthly: number;
  fineRate: number;
  dueDate: string;
  paymentDate?: string;
  paidAmount: number;
  description?: string;
  status: DebtStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CalculatedDebt {
  daysOverdue: number;
  principalOutstanding: number;
  fineAmount: number;
  accruedInterest: number;
  totalDue: number;
  status: DebtStatus;
}
