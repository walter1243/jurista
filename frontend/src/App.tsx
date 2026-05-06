import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Client = {
  id: string
  name: string
  cpfCnpj: string
}

type Debtor = {
  id: string
  clientId: string
  name: string
  cpf: string
}

type Debt = {
  id: string
  clientId: string
  debtorId: string
  principalAmount: number
  interestRateMonthly: number
  fineRate: number
  dueDate: string
  description?: string
  status: 'pending' | 'partial' | 'paid' | 'overdue'
  calculation: {
    daysOverdue: number
    fineAmount: number
    accruedInterest: number
    totalDue: number
  }
  client: Client | null
  debtor: Debtor | null
}

// Em produção (Vercel) usa URL relativa; localmente usa a variável .env.local
const API_URL = import.meta.env.VITE_API_URL ?? ''

function App() {
  const [clients, setClients] = useState<Client[]>([])
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [monthFilter, setMonthFilter] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const [clientForm, setClientForm] = useState({
    name: '',
    cpfCnpj: '',
    phone: '',
  })

  const [debtorForm, setDebtorForm] = useState({
    clientId: '',
    name: '',
    cpf: '',
    phone: '',
  })

  const [debtForm, setDebtForm] = useState({
    clientId: '',
    debtorId: '',
    principalAmount: '',
    interestRateMonthly: '5',
    fineRate: '2',
    dueDate: '',
    description: '',
  })

  const dashboard = useMemo(() => {
    const totalEmAberto = debts.reduce((acc, debt) => acc + debt.calculation.totalDue, 0)
    const totalVencido = debts
      .filter((debt) => debt.status === 'overdue')
      .reduce((acc, debt) => acc + debt.calculation.totalDue, 0)

    return {
      totalEmAberto,
      totalVencido,
      clientes: clients.length,
      pessoas: debtors.length,
    }
  }, [clients.length, debtors.length, debts])

  async function loadAll(selectedMonth?: string) {
    const month = selectedMonth ?? monthFilter
    const debtQuery = month ? `?month=${month}` : ''

    const [clientsRes, debtorsRes, debtsRes] = await Promise.all([
      fetch(`${API_URL}/api/clients`),
      fetch(`${API_URL}/api/debtors`),
      fetch(`${API_URL}/api/debts${debtQuery}`),
    ])

    const [clientsData, debtorsData, debtsData] = await Promise.all([
      clientsRes.json(),
      debtorsRes.json(),
      debtsRes.json(),
    ])

    setClients(clientsData)
    setDebtors(debtorsData)
    setDebts(debtsData)
  }

  useEffect(() => {
    loadAll().catch(() => setStatusMessage('Nao foi possivel carregar os dados.'))
  }, [])

  async function submitClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const res = await fetch(`${API_URL}/api/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientForm),
    })

    if (!res.ok) {
      setStatusMessage('Erro ao cadastrar cliente.')
      return
    }

    setClientForm({ name: '', cpfCnpj: '', phone: '' })
    setStatusMessage('Cliente cadastrado com sucesso.')
    await loadAll()
  }

  async function submitDebtor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const res = await fetch(`${API_URL}/api/debtors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(debtorForm),
    })

    if (!res.ok) {
      setStatusMessage('Erro ao cadastrar pessoa.')
      return
    }

    setDebtorForm({ clientId: '', name: '', cpf: '', phone: '' })
    setStatusMessage('Pessoa cadastrada com sucesso.')
    await loadAll()
  }

  async function submitDebt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const payload = {
      ...debtForm,
      principalAmount: Number(debtForm.principalAmount),
      interestRateMonthly: Number(debtForm.interestRateMonthly),
      fineRate: Number(debtForm.fineRate),
    }

    const res = await fetch(`${API_URL}/api/debts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      setStatusMessage('Erro ao cadastrar divida.')
      return
    }

    setDebtForm({
      clientId: '',
      debtorId: '',
      principalAmount: '',
      interestRateMonthly: '5',
      fineRate: '2',
      dueDate: '',
      description: '',
    })
    setStatusMessage('Divida cadastrada com sucesso.')
    await loadAll()
  }

  async function handleMonthFilter(month: string) {
    setMonthFilter(month)
    await loadAll(month)
  }

  const currency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Jurista PWA</p>
          <h1>Controle de cobrancas com juros por dias vencidos</h1>
          <p className="subtitle">
            Cadastre clientes, pessoas e dividas. O sistema calcula multa no vencimento e
            juros proporcional por dia apos o atraso.
          </p>
        </div>
        <div className="kpis">
          <article>
            <p>Total em aberto</p>
            <strong>{currency(dashboard.totalEmAberto)}</strong>
          </article>
          <article>
            <p>Total vencido</p>
            <strong>{currency(dashboard.totalVencido)}</strong>
          </article>
          <article>
            <p>Clientes</p>
            <strong>{dashboard.clientes}</strong>
          </article>
          <article>
            <p>Pessoas</p>
            <strong>{dashboard.pessoas}</strong>
          </article>
        </div>
      </header>

      <main className="grid">
        <section className="card">
          <h2>Novo cliente</h2>
          <form onSubmit={submitClient}>
            <label>
              Nome
              <input
                required
                value={clientForm.name}
                onChange={(event) => setClientForm((old) => ({ ...old, name: event.target.value }))}
              />
            </label>
            <label>
              CPF/CNPJ
              <input
                required
                value={clientForm.cpfCnpj}
                onChange={(event) =>
                  setClientForm((old) => ({ ...old, cpfCnpj: event.target.value }))
                }
              />
            </label>
            <label>
              Telefone
              <input
                value={clientForm.phone}
                onChange={(event) => setClientForm((old) => ({ ...old, phone: event.target.value }))}
              />
            </label>
            <button type="submit">Salvar cliente</button>
          </form>
        </section>

        <section className="card">
          <h2>Nova pessoa</h2>
          <form onSubmit={submitDebtor}>
            <label>
              Cliente responsavel
              <select
                required
                value={debtorForm.clientId}
                onChange={(event) =>
                  setDebtorForm((old) => ({ ...old, clientId: event.target.value }))
                }
              >
                <option value="">Selecione</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome da pessoa
              <input
                required
                value={debtorForm.name}
                onChange={(event) => setDebtorForm((old) => ({ ...old, name: event.target.value }))}
              />
            </label>
            <label>
              CPF
              <input
                required
                value={debtorForm.cpf}
                onChange={(event) => setDebtorForm((old) => ({ ...old, cpf: event.target.value }))}
              />
            </label>
            <button type="submit">Salvar pessoa</button>
          </form>
        </section>

        <section className="card large">
          <h2>Nova divida</h2>
          <form onSubmit={submitDebt} className="debt-form">
            <label>
              Cliente
              <select
                required
                value={debtForm.clientId}
                onChange={(event) => setDebtForm((old) => ({ ...old, clientId: event.target.value }))}
              >
                <option value="">Selecione</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pessoa
              <select
                required
                value={debtForm.debtorId}
                onChange={(event) => setDebtForm((old) => ({ ...old, debtorId: event.target.value }))}
              >
                <option value="">Selecione</option>
                {debtors
                  .filter((debtor) => !debtForm.clientId || debtor.clientId === debtForm.clientId)
                  .map((debtor) => (
                    <option key={debtor.id} value={debtor.id}>
                      {debtor.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Valor principal
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={debtForm.principalAmount}
                onChange={(event) =>
                  setDebtForm((old) => ({ ...old, principalAmount: event.target.value }))
                }
              />
            </label>
            <label>
              Juros mensal (%)
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={debtForm.interestRateMonthly}
                onChange={(event) =>
                  setDebtForm((old) => ({ ...old, interestRateMonthly: event.target.value }))
                }
              />
            </label>
            <label>
              Multa (%)
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={debtForm.fineRate}
                onChange={(event) => setDebtForm((old) => ({ ...old, fineRate: event.target.value }))}
              />
            </label>
            <label>
              Data de vencimento
              <input
                required
                type="date"
                value={debtForm.dueDate}
                onChange={(event) => setDebtForm((old) => ({ ...old, dueDate: event.target.value }))}
              />
            </label>
            <label className="full">
              Descricao
              <input
                value={debtForm.description}
                onChange={(event) =>
                  setDebtForm((old) => ({ ...old, description: event.target.value }))
                }
              />
            </label>
            <button type="submit" className="full">
              Salvar divida
            </button>
          </form>
        </section>
      </main>

      <section className="card table-card">
        <div className="table-header">
          <h2>Dividas</h2>
          <label>
            Filtrar por mes
            <input
              type="month"
              value={monthFilter}
              onChange={(event) => handleMonthFilter(event.target.value)}
            />
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Cliente</th>
                <th>Principal</th>
                <th>Juros</th>
                <th>Multa</th>
                <th>Dias vencidos</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {debts.map((debt) => (
                <tr key={debt.id}>
                  <td>{debt.debtor?.name ?? '---'}</td>
                  <td>{debt.client?.name ?? '---'}</td>
                  <td>{currency(debt.principalAmount)}</td>
                  <td>{currency(debt.calculation.accruedInterest)}</td>
                  <td>{currency(debt.calculation.fineAmount)}</td>
                  <td>{debt.calculation.daysOverdue}</td>
                  <td>{currency(debt.calculation.totalDue)}</td>
                  <td>
                    <span className={`badge ${debt.status}`}>{debt.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {statusMessage ? <p className="status">{statusMessage}</p> : null}

      <footer>
        <p>
          Para instalar no celular: abra no navegador, toque no menu e use "Adicionar a tela
          inicial".
        </p>
      </footer>
    </div>
  )
}

export default App
