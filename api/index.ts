import cors from 'cors';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { neon } from '@neondatabase/serverless';

// ─────────────────────────────────────────────────────────────────────────────
// NEON CLIENT
// ─────────────────────────────────────────────────────────────────────────────

const sql = neon(process.env.DATABASE_URL!);

// ─────────────────────────────────────────────────────────────────────────────
// CALCCULO DE JUROS
// ─────────────────────────────────────────────────────────────────────────────

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

interface DebtRow {
  id?: string;
  principal_amount?: string | number;
  principalAmount?: string | number;
  interest_rate_monthly?: string | number;
  interestRateMonthly?: string | number;
  fine_rate?: string | number;
  fineRate?: string | number;
  due_date?: string;
  dueDate?: string;
  payment_date?: string | null;
  paymentDate?: string | null;
  paid_amount?: string | number;
  paidAmount?: string | number;
}

function getProp(row: DebtRow, snake: keyof DebtRow, camel: keyof DebtRow): string | number {
  return (row[camel] ?? row[snake] ?? 0) as string | number;
}

function calculateDebt(row: DebtRow, refDate?: string) {
  const principal = new Decimal(getProp(row, 'principal_amount', 'principalAmount'));
  const paid = new Decimal(getProp(row, 'paid_amount', 'paidAmount'));
  const outstanding = Decimal.max(principal.minus(paid), 0);

  const rawDueDate = (row.dueDate ?? row.due_date ?? '') as string;
  const rawPayDate = (row.paymentDate ?? row.payment_date) as string | null | undefined;

  const calcDate = rawPayDate ?? refDate ?? dayjs().format('YYYY-MM-DD');
  const daysOverdue = getDaysOverdue(rawDueDate.slice(0, 10), calcDate);
  const isOverdue = daysOverdue > 0;

  const monthlyRate = new Decimal(getProp(row, 'interest_rate_monthly', 'interestRateMonthly'));
  const fineRateVal = new Decimal(getProp(row, 'fine_rate', 'fineRate'));
  const dailyRate = monthlyRate.div(100).div(DAILY_DIVISOR);
  const fineAmount = isOverdue ? outstanding.mul(fineRateVal.div(100)) : new Decimal(0);
  const accruedInterest = outstanding.mul(dailyRate).mul(daysOverdue);
  const totalDue = outstanding.plus(fineAmount).plus(accruedInterest);

  let status: 'pending' | 'partial' | 'paid' | 'overdue' = 'pending';
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

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS APP
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

const clientSchema = z.object({
  name: z.string().min(2),
  cpfCnpj: z.string().min(11),
  phone: z.string().optional(),
  email: z.email().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const debtorSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(2),
  cpf: z.string().min(11),
  phone: z.string().optional(),
  email: z.email().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const debtSchema = z.object({
  clientId: z.string().uuid(),
  debtorId: z.string().uuid(),
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

// HEALTH
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'jurista-api' });
});

// CLIENTES
app.get('/api/clients', async (_req: Request, res: Response) => {
  const rows = await sql`
    SELECT id, name, cpf_cnpj AS "cpfCnpj", phone, email, status,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM clients ORDER BY created_at DESC
  `;
  res.json(rows);
});

app.post('/api/clients', async (req: Request, res: Response) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const { name, cpfCnpj, phone = null, email = null, status } = parsed.data;
  const id = randomUUID();
  const [row] = await sql`
    INSERT INTO clients (id, name, cpf_cnpj, phone, email, status, created_at, updated_at)
    VALUES (${id}, ${name}, ${cpfCnpj}, ${phone}, ${email}, ${status}, NOW(), NOW())
    RETURNING id, name, cpf_cnpj AS "cpfCnpj", phone, email, status,
              created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  return res.status(201).json(row);
});

app.patch('/api/clients/:id', async (req: Request, res: Response) => {
  const { name, phone, email, status } = req.body;
  const [row] = await sql`
    UPDATE clients
    SET name = COALESCE(${name ?? null}, name),
        phone = COALESCE(${phone ?? null}, phone),
        email = COALESCE(${email ?? null}, email),
        status = COALESCE(${status ?? null}, status),
        updated_at = NOW()
    WHERE id = ${req.params.id}
    RETURNING id, name, cpf_cnpj AS "cpfCnpj", phone, email, status,
              created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  if (!row) return res.status(404).json({ message: 'Cliente nao encontrado.' });
  return res.json(row);
});

// PESSOAS
app.get('/api/debtors', async (_req: Request, res: Response) => {
  const rows = await sql`
    SELECT id, client_id AS "clientId", name, cpf, phone, email, status,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM debtors ORDER BY created_at DESC
  `;
  res.json(rows);
});

app.post('/api/debtors', async (req: Request, res: Response) => {
  const parsed = debtorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const { clientId, name, cpf, phone = null, email = null, status } = parsed.data;
  const [exists] = await sql`SELECT id FROM clients WHERE id = ${clientId}`;
  if (!exists) return res.status(404).json({ message: 'Cliente nao encontrado.' });
  const id = randomUUID();
  const [row] = await sql`
    INSERT INTO debtors (id, client_id, name, cpf, phone, email, status, created_at, updated_at)
    VALUES (${id}, ${clientId}, ${name}, ${cpf}, ${phone}, ${email}, ${status}, NOW(), NOW())
    RETURNING id, client_id AS "clientId", name, cpf, phone, email, status,
              created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  return res.status(201).json(row);
});

// DIVIDAS
app.get('/api/debts', async (req: Request, res: Response) => {
  const month = z.string().regex(/^\d{4}-\d{2}$/).optional().parse(req.query.month);
  const rows = await sql`
    SELECT
      d.id, d.client_id AS "clientId", d.debtor_id AS "debtorId",
      d.principal_amount AS "principalAmount",
      d.interest_rate_monthly AS "interestRateMonthly",
      d.fine_rate AS "fineRate",
      TO_CHAR(d.due_date, 'YYYY-MM-DD') AS "dueDate",
      TO_CHAR(d.payment_date, 'YYYY-MM-DD') AS "paymentDate",
      d.paid_amount AS "paidAmount",
      d.description, d.status,
      d.created_at AS "createdAt", d.updated_at AS "updatedAt",
      json_build_object('id', c.id, 'name', c.name, 'cpfCnpj', c.cpf_cnpj) AS client,
      json_build_object('id', dr.id, 'name', dr.name, 'cpf', dr.cpf) AS debtor
    FROM debts d
    LEFT JOIN clients c ON c.id = d.client_id
    LEFT JOIN debtors dr ON dr.id = d.debtor_id
    WHERE (${month ?? null}::text IS NULL OR TO_CHAR(d.due_date, 'YYYY-MM') = ${month ?? null})
    ORDER BY d.due_date ASC
  `;
  const enriched = rows.map((row) => ({ ...row, calculation: calculateDebt(row as DebtRow) }));
  res.json(enriched);
});

app.post('/api/debts', async (req: Request, res: Response) => {
  const parsed = debtSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const { clientId, debtorId, principalAmount, interestRateMonthly, fineRate, dueDate, description = null } = parsed.data;
  const [clientExists] = await sql`SELECT id FROM clients WHERE id = ${clientId}`;
  const [debtorExists] = await sql`SELECT id FROM debtors WHERE id = ${debtorId}`;
  if (!clientExists || !debtorExists)
    return res.status(404).json({ message: 'Cliente ou pessoa nao encontrados.' });
  const id = randomUUID();
  const [row] = await sql`
    INSERT INTO debts (id, client_id, debtor_id, principal_amount, interest_rate_monthly,
                       fine_rate, due_date, paid_amount, description, status, created_at, updated_at)
    VALUES (${id}, ${clientId}, ${debtorId}, ${principalAmount}, ${interestRateMonthly},
            ${fineRate}, ${dueDate}, 0, ${description}, 'pending', NOW(), NOW())
    RETURNING id, client_id AS "clientId", debtor_id AS "debtorId",
              principal_amount AS "principalAmount",
              interest_rate_monthly AS "interestRateMonthly",
              fine_rate AS "fineRate",
              TO_CHAR(due_date, 'YYYY-MM-DD') AS "dueDate",
              TO_CHAR(payment_date, 'YYYY-MM-DD') AS "paymentDate",
              paid_amount AS "paidAmount", description, status,
              created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  const calc = calculateDebt(row as DebtRow);
  await sql`UPDATE debts SET status = ${calc.status} WHERE id = ${id}`;
  return res.status(201).json({ ...row, status: calc.status, calculation: calc });
});

// PAGAMENTOS
app.post('/api/debts/:id/payments', async (req: Request, res: Response) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const [debt] = await sql`
    SELECT id, principal_amount AS "principalAmount", interest_rate_monthly AS "interestRateMonthly",
           fine_rate AS "fineRate", TO_CHAR(due_date, 'YYYY-MM-DD') AS "dueDate",
           paid_amount AS "paidAmount"
    FROM debts WHERE id = ${req.params.id}
  `;
  if (!debt) return res.status(404).json({ message: 'Divida nao encontrada.' });
  const { amount, paymentDate } = parsed.data;
  const paymentId = randomUUID();
  await sql`
    INSERT INTO payments (id, debt_id, amount, payment_date, created_at)
    VALUES (${paymentId}, ${req.params.id}, ${amount}, ${paymentDate}, NOW())
  `;
  const [updated] = await sql`
    UPDATE debts
    SET paid_amount = paid_amount + ${amount}, payment_date = ${paymentDate}, updated_at = NOW()
    WHERE id = ${req.params.id}
    RETURNING id, principal_amount AS "principalAmount",
              interest_rate_monthly AS "interestRateMonthly",
              fine_rate AS "fineRate",
              TO_CHAR(due_date, 'YYYY-MM-DD') AS "dueDate",
              TO_CHAR(payment_date, 'YYYY-MM-DD') AS "paymentDate",
              paid_amount AS "paidAmount"
  `;
  const newStatus = calculateDebt(updated as DebtRow).status;
  await sql`UPDATE debts SET status = ${newStatus} WHERE id = ${req.params.id}`;
  return res.status(201).json({ id: paymentId, debtId: req.params.id, amount, paymentDate });
});

app.get('/api/payments', async (req: Request, res: Response) => {
  const debtId = String(req.query.debtId ?? '');
  const rows = debtId
    ? await sql`SELECT id, debt_id AS "debtId", amount, TO_CHAR(payment_date,'YYYY-MM-DD') AS "paymentDate", created_at AS "createdAt" FROM payments WHERE debt_id=${debtId} ORDER BY payment_date DESC`
    : await sql`SELECT id, debt_id AS "debtId", amount, TO_CHAR(payment_date,'YYYY-MM-DD') AS "paymentDate", created_at AS "createdAt" FROM payments ORDER BY payment_date DESC`;
  res.json(rows);
});

// DASHBOARD
app.get('/api/dashboard', async (_req: Request, res: Response) => {
  const debts = await sql`
    SELECT principal_amount AS "principalAmount", interest_rate_monthly AS "interestRateMonthly",
           fine_rate AS "fineRate", TO_CHAR(due_date,'YYYY-MM-DD') AS "dueDate",
           TO_CHAR(payment_date,'YYYY-MM-DD') AS "paymentDate", paid_amount AS "paidAmount"
    FROM debts
  `;
  const [counts] = await sql`
    SELECT (SELECT COUNT(*) FROM clients) AS clients, (SELECT COUNT(*) FROM debtors) AS debtors
  `;
  const totals = debts.reduce(
    (acc, d) => {
      const calc = calculateDebt(d as DebtRow);
      acc.totalPrincipal += Number(d.principalAmount);
      acc.totalOutstanding += calc.totalDue;
      if (calc.status === 'overdue') acc.totalOverdue += calc.totalDue;
      return acc;
    },
    { totalPrincipal: 0, totalOutstanding: 0, totalOverdue: 0 },
  );
  res.json({ ...totals, clients: Number(counts.clients), debtors: Number(counts.debtors) });
});

// DEV LOCAL
if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`Jurista API -> http://localhost:${port}`));
}

export default app;
