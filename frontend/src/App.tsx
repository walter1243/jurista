import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import DatePicker, { registerLocale } from 'react-datepicker'
import { ptBR } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  Inbox,
  Menu,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import './App.css'

registerLocale('pt-BR', ptBR)

type Client = { id: string; name: string; cpfCnpj: string }
type Debtor = { id: string; clientId: string; name: string; cpf: string }
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
  calculation: { daysOverdue: number; fineAmount: number; accruedInterest: number; totalDue: number }
  client: Client | null
  debtor: Debtor | null
}
type Toast = { id: number; message: string; type: 'success' | 'error' | 'warn' }

const NAV_ITEMS = [
  { id: 'overview', label: 'Visão Geral', Icon: Building2 },
  { id: 'client-form', label: 'Novo Cliente', Icon: UserPlus },
  { id: 'debtor-form', label: 'Nova Pessoa', Icon: Users },
  { id: 'debt-form', label: 'Nova Dívida', Icon: Banknote },
  { id: 'debt-list', label: 'Lista de Dívidas', Icon: ClipboardList },
] as const

const API_URL = import.meta.env.VITE_API_URL ?? ''
let toastIdCounter = 0

function toMonthValue(date: Date | null) {
  if (!date) {
    return ''
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function toDateValue(date: Date | null) {
  if (!date) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function App() {
  const [clients, setClients] = useState<Client[]>([])
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [monthFilter, setMonthFilter] = useState<Date | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')
  const [toasts, setToasts] = useState<Toast[]>([])

  const [clientForm, setClientForm] = useState({ name: '', cpfCnpj: '', phone: '' })
  const [debtorForm, setDebtorForm] = useState({ clientId: '', name: '', cpf: '', phone: '' })
  const [debtForm, setDebtForm] = useState({
    clientId: '',
    debtorId: '',
    principalAmount: '',
    interestRateMonthly: '5',
    fineRate: '2',
    dueDate: null as Date | null,
    description: '',
  })

  function addToast(message: string, type: Toast['type'] = 'success') {
    const id = ++toastIdCounter
    setToasts((old) => [...old, { id, message, type }])
    setTimeout(() => setToasts((old) => old.filter((toast) => toast.id !== id)), 4000)
  }

  const dashboard = useMemo(() => {
    const totalEmAberto = debts.reduce((acc, debt) => acc + debt.calculation.totalDue, 0)
    const totalVencido = debts
      .filter((debt) => debt.status === 'overdue')
      .reduce((acc, debt) => acc + debt.calculation.totalDue, 0)

    const vencendoHoje = debts.filter((debt) => {
      if (debt.status === 'paid') {
        return false
      }

      const diff = Math.ceil((new Date(debt.dueDate).getTime() - Date.now()) / 86400000)
      return diff >= 0 && diff <= 3
    })

    return {
      totalEmAberto,
      totalVencido,
      clientes: clients.length,
      pessoas: debtors.length,
      vencendoHoje,
    }
  }, [clients.length, debtors.length, debts])

  async function loadAll(selectedMonth?: Date | null) {
    const month = toMonthValue(selectedMonth === undefined ? monthFilter : selectedMonth)
    const query = month ? `?month=${month}` : ''

    const [clientsResponse, debtorsResponse, debtsResponse] = await Promise.all([
      fetch(`${API_URL}/api/clients`),
      fetch(`${API_URL}/api/debtors`),
      fetch(`${API_URL}/api/debts${query}`),
    ])

    const [clientsData, debtorsData, debtsData] = await Promise.all([
      clientsResponse.json(),
      debtorsResponse.json(),
      debtsResponse.json(),
    ])

    setClients(clientsData)
    setDebtors(debtorsData)
    setDebts(debtsData)
  }

  useEffect(() => {
    loadAll().catch(() => addToast('Não foi possível carregar os dados.', 'error'))
  }, [])

  function navigate(sectionId: string) {
    setActiveSection(sectionId)
    setMenuOpen(false)
  }

  async function submitClient(event: FormEvent) {
    event.preventDefault()

    const response = await fetch(`${API_URL}/api/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientForm),
    })

    if (!response.ok) {
      addToast('Erro ao cadastrar cliente.', 'error')
      return
    }

    setClientForm({ name: '', cpfCnpj: '', phone: '' })
    addToast('Cliente cadastrado com sucesso!')
    await loadAll()
  }

  async function submitDebtor(event: FormEvent) {
    event.preventDefault()

    const response = await fetch(`${API_URL}/api/debtors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(debtorForm),
    })

    if (!response.ok) {
      addToast('Erro ao cadastrar pessoa.', 'error')
      return
    }

    setDebtorForm({ clientId: '', name: '', cpf: '', phone: '' })
    addToast('Pessoa cadastrada com sucesso!')
    await loadAll()
  }

  async function submitDebt(event: FormEvent) {
    event.preventDefault()

    const dueDate = toDateValue(debtForm.dueDate)
    if (!dueDate) {
      addToast('Selecione a data de vencimento.', 'warn')
      return
    }

    const payload = {
      ...debtForm,
      dueDate,
      principalAmount: Number(debtForm.principalAmount),
      interestRateMonthly: Number(debtForm.interestRateMonthly),
      fineRate: Number(debtForm.fineRate),
    }

    const response = await fetch(`${API_URL}/api/debts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      addToast('Erro ao cadastrar dívida.', 'error')
      return
    }

    setDebtForm({
      clientId: '',
      debtorId: '',
      principalAmount: '',
      interestRateMonthly: '5',
      fineRate: '2',
      dueDate: null,
      description: '',
    })
    addToast('Dívida cadastrada com sucesso!')
    await loadAll()
  }

  const currency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const statusLabel: Record<string, string> = {
    pending: 'Pendente',
    partial: 'Parcial',
    paid: 'Pago',
    overdue: 'Vencido',
  }

  const currentNavItem = NAV_ITEMS.find((item) => item.id === activeSection)

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-mark">J</div>
          <div className="sidebar-brand">
            <span className="brand-name">Jurista</span>
            <span className="brand-sub">Cobranças</span>
          </div>
          <button
            className="sidebar-close"
            onClick={() => setMenuOpen(false)}
            type="button"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-btn ${activeSection === id ? 'active' : ''}`}
              onClick={() => navigate(id)}
              type="button"
            >
              <Icon size={18} strokeWidth={1.75} className="nav-icon" />
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {menuOpen ? <div className="overlay" onClick={() => setMenuOpen(false)} /> : null}

      <div className="main-wrap">
        <header className="topbar">
          <button
            className="hamburger"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
            aria-label="Abrir menu"
          >
            <Menu size={20} strokeWidth={1.8} />
          </button>

          <span className="page-title">{currentNavItem?.label ?? 'Jurista'}</span>

          {dashboard.vencendoHoje.length > 0 ? (
            <button className="alert-badge" onClick={() => navigate('debt-list')} type="button">
              <Bell size={13} strokeWidth={2} />
              <span>{dashboard.vencendoHoje.length} vencendo</span>
            </button>
          ) : null}
        </header>

        <div className="page-content" key={activeSection}>
          {activeSection === 'overview' ? (
            <div className="page-anim">
              {dashboard.vencendoHoje.length > 0 ? (
                <div className="alert-banner">
                  <AlertTriangle size={20} strokeWidth={1.8} className="alert-icon" />
                  <div>
                    <strong>Atenção!</strong> {dashboard.vencendoHoje.length} dívida(s) vence(m)
                    nos próximos 3 dias.
                    <button className="link-btn" onClick={() => navigate('debt-list')} type="button">
                      Ver lista
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="kpi-grid">
                <div className="kpi-card accent-blue">
                  <TrendingUp size={20} strokeWidth={1.8} className="kpi-icon" />
                  <p className="kpi-label">Total em Aberto</p>
                  <strong className="kpi-value">{currency(dashboard.totalEmAberto)}</strong>
                </div>
                <div className="kpi-card accent-red">
                  <TrendingDown size={20} strokeWidth={1.8} className="kpi-icon" />
                  <p className="kpi-label">Total Vencido</p>
                  <strong className="kpi-value">{currency(dashboard.totalVencido)}</strong>
                </div>
                <div className="kpi-card accent-green">
                  <BadgeCheck size={20} strokeWidth={1.8} className="kpi-icon" />
                  <p className="kpi-label">Clientes</p>
                  <strong className="kpi-value">{dashboard.clientes}</strong>
                </div>
                <div className="kpi-card accent-purple">
                  <Users size={20} strokeWidth={1.8} className="kpi-icon" />
                  <p className="kpi-label">Pessoas</p>
                  <strong className="kpi-value">{dashboard.pessoas}</strong>
                </div>
              </div>

              <h3 className="section-title">Ações Rápidas</h3>
              <div className="action-grid">
                <button className="action-card" onClick={() => navigate('client-form')} type="button">
                  <UserPlus size={28} strokeWidth={1.5} />
                  <span>Novo Cliente</span>
                </button>
                <button className="action-card" onClick={() => navigate('debtor-form')} type="button">
                  <Users size={28} strokeWidth={1.5} />
                  <span>Nova Pessoa</span>
                </button>
                <button className="action-card" onClick={() => navigate('debt-form')} type="button">
                  <Banknote size={28} strokeWidth={1.5} />
                  <span>Nova Dívida</span>
                </button>
                <button className="action-card" onClick={() => navigate('debt-list')} type="button">
                  <ClipboardList size={28} strokeWidth={1.5} />
                  <span>Ver Dívidas</span>
                </button>
              </div>
            </div>
          ) : null}

          {activeSection === 'client-form' ? (
            <div className="page-anim">
              <div className="form-card">
                <div className="form-header">
                  <UserPlus size={28} strokeWidth={1.6} className="form-icon-svg" />
                  <div>
                    <h2 className="form-title">Novo Cliente</h2>
                    <p className="form-sub">
                      Preencha os dados do cliente responsável pelas dívidas.
                    </p>
                  </div>
                </div>
                <form onSubmit={submitClient} className="form-body">
                  <div className="field">
                    <label>Nome completo</label>
                    <input
                      required
                      placeholder="Ex: João Silva"
                      value={clientForm.name}
                      onChange={(event) =>
                        setClientForm((old) => ({ ...old, name: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>CPF / CNPJ</label>
                    <input
                      required
                      placeholder="000.000.000-00"
                      value={clientForm.cpfCnpj}
                      onChange={(event) =>
                        setClientForm((old) => ({ ...old, cpfCnpj: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Telefone</label>
                    <input
                      placeholder="(11) 99999-0000"
                      value={clientForm.phone}
                      onChange={(event) =>
                        setClientForm((old) => ({ ...old, phone: event.target.value }))
                      }
                    />
                  </div>
                  <button className="btn-primary" type="submit">
                    Salvar Cliente
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {activeSection === 'debtor-form' ? (
            <div className="page-anim">
              <div className="form-card">
                <div className="form-header">
                  <Users size={28} strokeWidth={1.6} className="form-icon-svg" />
                  <div>
                    <h2 className="form-title">Nova Pessoa</h2>
                    <p className="form-sub">
                      Pessoa que possui a dívida vinculada a um cliente.
                    </p>
                  </div>
                </div>
                <form onSubmit={submitDebtor} className="form-body">
                  <div className="field">
                    <label>Cliente responsável</label>
                    <select
                      required
                      value={debtorForm.clientId}
                      onChange={(event) =>
                        setDebtorForm((old) => ({ ...old, clientId: event.target.value }))
                      }
                    >
                      <option value="">Selecione um cliente</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Nome da pessoa</label>
                    <input
                      required
                      placeholder="Nome completo"
                      value={debtorForm.name}
                      onChange={(event) =>
                        setDebtorForm((old) => ({ ...old, name: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>CPF</label>
                    <input
                      required
                      placeholder="000.000.000-00"
                      value={debtorForm.cpf}
                      onChange={(event) =>
                        setDebtorForm((old) => ({ ...old, cpf: event.target.value }))
                      }
                    />
                  </div>
                  <button className="btn-primary" type="submit">
                    Salvar Pessoa
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {activeSection === 'debt-form' ? (
            <div className="page-anim">
              <div className="form-card">
                <div className="form-header">
                  <Banknote size={28} strokeWidth={1.6} className="form-icon-svg" />
                  <div>
                    <h2 className="form-title">Nova Dívida</h2>
                    <p className="form-sub">
                      Registre o valor principal, juros, multa e vencimento.
                    </p>
                  </div>
                </div>
                <form onSubmit={submitDebt} className="form-body">
                  <div className="fields-row">
                    <div className="field">
                      <label>Cliente</label>
                      <select
                        required
                        value={debtForm.clientId}
                        onChange={(event) =>
                          setDebtForm((old) => ({ ...old, clientId: event.target.value }))
                        }
                      >
                        <option value="">Selecione</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Pessoa</label>
                      <select
                        required
                        value={debtForm.debtorId}
                        onChange={(event) =>
                          setDebtForm((old) => ({ ...old, debtorId: event.target.value }))
                        }
                      >
                        <option value="">Selecione</option>
                        {debtors
                          .filter(
                            (debtor) =>
                              !debtForm.clientId || debtor.clientId === debtForm.clientId,
                          )
                          .map((debtor) => (
                            <option key={debtor.id} value={debtor.id}>
                              {debtor.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="fields-row">
                    <div className="field">
                      <label>Valor principal (R$)</label>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={debtForm.principalAmount}
                        onChange={(event) =>
                          setDebtForm((old) => ({ ...old, principalAmount: event.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Juros mensal (%)</label>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={debtForm.interestRateMonthly}
                        onChange={(event) =>
                          setDebtForm((old) => ({
                            ...old,
                            interestRateMonthly: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Multa (%)</label>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={debtForm.fineRate}
                        onChange={(event) =>
                          setDebtForm((old) => ({ ...old, fineRate: event.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="fields-row">
                    <div className="field">
                      <label>Data de vencimento</label>
                      <div className="datepicker-wrap">
                        <CalendarDays size={16} strokeWidth={1.8} className="datepicker-icon" />
                        <DatePicker
                          selected={debtForm.dueDate}
                          onChange={(value: Date | null) =>
                            setDebtForm((old) => ({ ...old, dueDate: value }))
                          }
                          locale="pt-BR"
                          dateFormat="dd/MM/yyyy"
                          placeholderText="Selecione a data"
                          className="datepicker-input"
                          calendarClassName="custom-calendar"
                          showPopperArrow={false}
                        />
                      </div>
                    </div>
                    <div className="field field-grow">
                      <label>Descrição</label>
                      <input
                        placeholder="Opcional"
                        value={debtForm.description}
                        onChange={(event) =>
                          setDebtForm((old) => ({ ...old, description: event.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <button className="btn-primary" type="submit">
                    Salvar Dívida
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {activeSection === 'debt-list' ? (
            <div className="page-anim">
              <div className="list-header">
                <h2 className="section-title">Dívidas em Andamento</h2>
                <div className="field filter-field">
                  <label>Filtrar por mês</label>
                  <div className="datepicker-wrap">
                    <CalendarDays size={16} strokeWidth={1.8} className="datepicker-icon" />
                    <DatePicker
                      selected={monthFilter}
                      onChange={(value: Date | null) => {
                        setMonthFilter(value)
                        void loadAll(value)
                      }}
                      locale="pt-BR"
                      dateFormat="MM/yyyy"
                      showMonthYearPicker
                      placeholderText="Selecione o mês"
                      className="datepicker-input"
                      calendarClassName="custom-calendar custom-calendar-month"
                      showPopperArrow={false}
                      isClearable
                    />
                  </div>
                </div>
              </div>

              {debts.length === 0 ? (
                <div className="empty-state">
                  <Inbox size={48} strokeWidth={1.3} />
                  <p>Nenhuma dívida encontrada.</p>
                </div>
              ) : (
                <>
                  {debts.some((debt) => {
                    const diff = Math.ceil((new Date(debt.dueDate).getTime() - Date.now()) / 86400000)
                    return debt.status !== 'paid' && diff >= 0 && diff <= 3
                  }) ? (
                    <div className="alert-banner">
                      <AlertTriangle size={20} strokeWidth={1.8} className="alert-icon" />
                      <strong>Há dívidas vencendo em até 3 dias.</strong>
                    </div>
                  ) : null}

                  <div className="debt-cards">
                    {debts.map((debt) => {
                      const diff = Math.ceil((new Date(debt.dueDate).getTime() - Date.now()) / 86400000)
                      const nearDue = debt.status !== 'paid' && diff >= 0 && diff <= 3

                      return (
                        <div
                          key={debt.id}
                          className={`debt-card ${debt.status}${nearDue ? ' near-due' : ''}`}
                        >
                          <div className="debt-card-top">
                            <div>
                              <strong className="debt-person">{debt.debtor?.name ?? '—'}</strong>
                              <span className="debt-client">{debt.client?.name ?? '—'}</span>
                            </div>
                            <span className={`status-pill ${debt.status}`}>
                              {statusLabel[debt.status]}
                            </span>
                          </div>

                          {nearDue ? (
                            <div className="near-due-tag">
                              <AlertTriangle size={11} strokeWidth={2} />
                              <span>Vence {diff === 0 ? 'hoje' : `em ${diff} dia(s)`}</span>
                            </div>
                          ) : null}

                          <div className="debt-card-grid">
                            <div>
                              <span>Principal</span>
                              <strong>{currency(debt.principalAmount)}</strong>
                            </div>
                            <div>
                              <span>Juros</span>
                              <strong>{currency(debt.calculation.accruedInterest)}</strong>
                            </div>
                            <div>
                              <span>Multa</span>
                              <strong>{currency(debt.calculation.fineAmount)}</strong>
                            </div>
                            <div>
                              <span>Total</span>
                              <strong className="total-due">{currency(debt.calculation.totalDue)}</strong>
                            </div>
                          </div>

                          <div className="debt-card-footer">
                            <span>
                              <CalendarDays size={12} strokeWidth={2} />
                              {new Date(debt.dueDate).toLocaleDateString('pt-BR')}
                            </span>
                            <span>
                              {debt.calculation.daysOverdue > 0
                                ? `${debt.calculation.daysOverdue} dias em atraso`
                                : 'Em dia'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
