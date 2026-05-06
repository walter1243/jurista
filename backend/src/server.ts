import cors from 'cors';
import dayjs from 'dayjs';
import express from 'express';
import { z } from 'zod';
import { calculateDebt } from './calc.js';
import { createClient, createDebt, createDebtor, db, registerPayment } from './store.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

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

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'jurista-api' });
});

app.get('/api/clients', (_req, res) => {
  res.json(db.clients);
});

app.post('/api/clients', (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const client = createClient(parsed.data);
  return res.status(201).json(client);
});

app.get('/api/debtors', (_req, res) => {
  res.json(db.debtors);
});

app.post('/api/debtors', (req, res) => {
  const parsed = debtorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const clientExists = db.clients.some((item) => item.id === parsed.data.clientId);
  if (!clientExists) {
    return res.status(404).json({ message: 'Cliente nao encontrado.' });
  }

  const debtor = createDebtor(parsed.data);
  return res.status(201).json(debtor);
});

app.get('/api/debts', (req, res) => {
  const month = z.string().regex(/^\d{4}-\d{2}$/).optional().parse(req.query.month);

  const filtered = month
    ? db.debts.filter((debt) => dayjs(debt.dueDate).format('YYYY-MM') === month)
    : db.debts;

  const enriched = filtered.map((debt) => ({
    ...debt,
    calculation: calculateDebt(debt),
    client: db.clients.find((c) => c.id === debt.clientId) ?? null,
    debtor: db.debtors.find((d) => d.id === debt.debtorId) ?? null,
  }));

  res.json(enriched);
});

app.post('/api/debts', (req, res) => {
  const parsed = debtSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const clientExists = db.clients.some((item) => item.id === parsed.data.clientId);
  const debtorExists = db.debtors.some((item) => item.id === parsed.data.debtorId);
  if (!clientExists || !debtorExists) {
    return res.status(404).json({ message: 'Cliente ou pessoa nao encontrados.' });
  }

  const debt = createDebt(parsed.data);
  const calculation = calculateDebt(debt);
  debt.status = calculation.status;
  return res.status(201).json({ ...debt, calculation });
});

app.post('/api/debts/:id/payments', (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const payment = registerPayment(req.params.id, parsed.data.amount, parsed.data.paymentDate);
  if (!payment) {
    return res.status(404).json({ message: 'Divida nao encontrada.' });
  }

  const debt = db.debts.find((item) => item.id === req.params.id);
  if (debt) {
    debt.status = calculateDebt(debt).status;
  }

  return res.status(201).json(payment);
});

app.get('/api/dashboard', (_req, res) => {
  const totals = db.debts.reduce(
    (acc, debt) => {
      const calculation = calculateDebt(debt);
      acc.totalPrincipal += debt.principalAmount;
      acc.totalOutstanding += calculation.totalDue;
      if (calculation.status === 'overdue') {
        acc.totalOverdue += calculation.totalDue;
      }
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

app.listen(port, () => {
  console.log(`Jurista API rodando em http://localhost:${port}`);
});
