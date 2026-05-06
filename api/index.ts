import cors from 'cors';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

type EntityStatus = 'active' | 'inactive';

interface Client {
  id: string;
  name: string;
  cpfCnpj: string;
  phone?: string;
  email?: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

interface Debtor {
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

interface Payment {
  id: string;
  debtId: string;
  amount: number;
  paymentDate: string;
  createdAt: string;
}

interface Debt {
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
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  createdAt: string;
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// IN-MEMORY STORE (MVP — substituir por banco para produção)
// ────────────────────────────────────────────────────────────────────────────

const db = {
  clients: [] as Client[],
  debtors: [] as Debtor[],
  debts: [] as Debt[],
  payments: [] as Payment[],
};

function nowISO() {
  return new Date().toISOString();
}
function uid() {
  return crypto.randomUUID();
}

// ────────────────────────────────────────────────────────────────────────────
// CÁLCULO DE JUROS
// ────────────────────────────────────────────────────────────────────────────

const DAILY_DIVISOR = new Decimal(30);

function roundMoney(value: Decimal): number {
  return Number(value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString());
}

function getDaysOverdue(dueDateISO: string, referenceDateISO: string): number {
  const due = dayjs(dueDateISO).startOf('day');
  const ref = dayjs(referenceDateISO).startOf('day');
  if (!ref.isAfter(due)) return 0;
  return ref.diff(due, 'day');
}

function calculateDebt(debt: Debt, refDate?: string) {
  const principal = new Decimal(debt.principalAmount);
  const paid = new Decimal(debt.paidAmount || 0);
  const outstanding = Decimal.max(principal.minus(paid), 0);

  const calcDate = debt.paymentDate ?? refDate ?? dayjs().format('YYYY-MM-DD');
  const daysOverdue = getDaysOverdue(debt.dueDate, calcDate);
  const isOverdue = daysOverdue > 0;

  const dailyRate = new Decimal(debt.interestRateMonthly).div(100).div(DAILY_DIVISOR);
  const fineAmount = isOverdue
    ? outstanding.mul(new Decimal(debt.fineRate).div(100))
    : new Decimal(0);
  const accruedInterest = outstanding.mul(dailyRate).mul(daysOverdue);
  const totalDue = outstanding.plus(fineAmount).plus(accruedInterest);

  let status: Debt['status'] = 'pending';
  if (outstanding.eq(0)) status = 'paid';
  else if (paid.gt(0)) status = isOverdue ? 'overdue' : 'partial';
  else if (isOverdue) status = 'overdue';

  return {
    daysOverdue,
    principalOutstanding: roundMoney(outstanding),
    fineAmount: roundMoney(fineAmount),
    accruedInterest: roundMoney(accruedInterest),
    totalDue: roundMoney(totalDue),
    status,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXPRESS APP
// ────────────────────────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json());

// Schemas Zod v4
const clientSchema = z.object({
  name: z.string().min(2),
  cpfCnpj: z.string().min(11),
  phone: z.string().optional(),
  email: z.email().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const debtorSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2),
  cpf: z.string().min(11),
  phone: z.string().optional(),
  email: z.email().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const debtSchema = z.object({
  clientId: z.string().min(1),
  debtorId: z.string().min(1),
  principalAmount: z.number().positive(),
  interestRateMonthly: z.number().min(0).max(100),
  fineRate: z.number().min(0).max(100).default(2),
  dueDate: z.iso.date(),
  description: z.string().optional(),
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  paymentDate: z.iso.date(),
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'jurista-api' });
});

app.get('/api/clients', (_req: Request, res: Response) => {
  res.json(db.clients);
});

app.post('/api/clients', (req: Request, res: Response) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const now = nowISO();
  const client: Client = { id: uid(), createdAt: now, updatedAt: now, ...parsed.data };
  db.clients.push(client);
  return res.status(201).json(client);
});

app.patch('/api/clients/:id', (req: Request, res: Response) => {
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ message: 'Cliente não encontrado.' });
  Object.assign(client, req.body, { updatedAt: nowISO() });
  return res.json(client);
});

app.get('/api/debtors', (_req: Request, res: Response) => {
  res.json(db.debtors);
});

app.post('/api/debtors', (req: Request, res: Response) => {
  const parsed = debtorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  if (!db.clients.some((c) => c.id === parsed.data.clientId))
    return res.status(404).json({ message: 'Cliente não encontrado.' });

  const now = nowISO();
  const debtor: Debtor = { id: uid(), createdAt: now, updatedAt: now, ...parsed.data };
  db.debtors.push(debtor);
  return res.status(201).json(debtor);
});

app.get('/api/debts', (req: Request, res: Response) => {
  const month = z.string().regex(/^\d{4}-\d{2}$/).optional().parse(req.query.month);
  const filtered = month
    ? db.debts.filter((d) => dayjs(d.dueDate).format('YYYY-MM') === month)
    : db.debts;

  const enriched = filtered.map((debt) => ({
    ...debt,
    calculation: calculateDebt(debt),
    client: db.clients.find((c) => c.id === debt.clientId) ?? null,
    debtor: db.debtors.find((d) => d.id === debt.debtorId) ?? null,
  }));
  res.json(enriched);
});

app.post('/api/debts', (req: Request, res: Response) => {
  const parsed = debtSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  if (!db.clients.some((c) => c.id === parsed.data.clientId) ||
      !db.debtors.some((d) => d.id === parsed.data.debtorId))
    return res.status(404).json({ message: 'Cliente ou pessoa não encontrados.' });

  const now = nowISO();
  const debt: Debt = {
    id: uid(),
    status: 'pending',
    paidAmount: 0,
    createdAt: now,
    updatedAt: now,
    ...parsed.data,
  };
  debt.status = calculateDebt(debt).status;
  db.debts.push(debt);
  return res.status(201).json({ ...debt, calculation: calculateDebt(debt) });
});

app.post('/api/debts/:id/payments', (req: Request, res: Response) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const debt = db.debts.find((d) => d.id === req.params.id);
  if (!debt) return res.status(404).json({ message: 'Dívida não encontrada.' });

  const payment: Payment = {
    id: uid(),
    debtId: debt.id,
    amount: parsed.data.amount,
    paymentDate: parsed.data.paymentDate,
    createdAt: nowISO(),
  };

  debt.paidAmount += parsed.data.amount;
  debt.paymentDate = parsed.data.paymentDate;
  debt.updatedAt = nowISO();
  debt.status = calculateDebt(debt).status;
  db.payments.push(payment);

  return res.status(201).json(payment);
});

app.get('/api/payments', (req: Request, res: Response) => {
  const debtId = String(req.query.debtId ?? '');
  const list = debtId ? db.payments.filter((p) => p.debtId === debtId) : db.payments;
  res.json(list);
});

app.get('/api/dashboard', (_req: Request, res: Response) => {
  const totals = db.debts.reduce(
    (acc, debt) => {
      const calc = calculateDebt(debt);
      acc.totalPrincipal += debt.principalAmount;
      acc.totalOutstanding += calc.totalDue;
      if (calc.status === 'overdue') acc.totalOverdue += calc.totalDue;
      return acc;
    },
    {
      totalPrincipal: 0,
      totalOutstanding: 0,
      totalOverdue: 0,
      clients: db.clients.length,
      debtors: db.debtors.length,
    },
  );
  res.json(totals);
});

// Para uso local (npm run dev no backend)
if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`Jurista API rodando em http://localhost:${port}`));
}

// Export para Vercel serverless
export default app;
