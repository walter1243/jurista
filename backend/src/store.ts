import crypto from 'node:crypto';
import type { Client, Debt, Debtor, Payment } from './types.js';

function nowISO(): string {
  return new Date().toISOString();
}

function id(): string {
  return crypto.randomUUID();
}

export const db = {
  clients: [] as Client[],
  debtors: [] as Debtor[],
  debts: [] as Debt[],
  payments: [] as Payment[],
};

export function createClient(payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Client {
  const now = nowISO();
  const client: Client = {
    id: id(),
    createdAt: now,
    updatedAt: now,
    ...payload,
  };

  db.clients.push(client);
  return client;
}

export function createDebtor(payload: Omit<Debtor, 'id' | 'createdAt' | 'updatedAt'>): Debtor {
  const now = nowISO();
  const debtor: Debtor = {
    id: id(),
    createdAt: now,
    updatedAt: now,
    ...payload,
  };

  db.debtors.push(debtor);
  return debtor;
}

export function createDebt(payload: Omit<Debt, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'paidAmount'>): Debt {
  const now = nowISO();
  const debt: Debt = {
    id: id(),
    status: 'pending',
    paidAmount: 0,
    createdAt: now,
    updatedAt: now,
    ...payload,
  };

  db.debts.push(debt);
  return debt;
}

export function registerPayment(debtId: string, amount: number, paymentDate: string): Payment | undefined {
  const debt = db.debts.find((item) => item.id === debtId);
  if (!debt) {
    return undefined;
  }

  const payment: Payment = {
    id: id(),
    debtId,
    amount,
    paymentDate,
    createdAt: nowISO(),
  };

  debt.paidAmount += amount;
  debt.paymentDate = paymentDate;
  debt.updatedAt = nowISO();
  db.payments.push(payment);

  return payment;
}
