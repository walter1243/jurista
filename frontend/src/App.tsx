import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Client = { id: string; name: string; cpfCnpj: string }
type Debtor = { id: string; clientId: string; name: string; cpf: string }
type Debt = {
  id: string; clientId: string; debtorId: string; principalAmount: number
  interestRateMonthly: number; fineRate: number; dueDate: string; description?: string
  status: 'pending' | 'partial' | 'paid' | 'overdue'
  calculation: { daysOverdue: number; fineAmount: number; accruedInterest: number; totalDue: number }
  client: Client | null; debtor: Debtor | null
}
type Toast = { id: number; message: string; type: 'success' | 'error' | 'warn' }

const NAV_ITEMS = [
  { id: 'overview', label: 'Visão Geral', icon: '🏠' },
  { id: 'client-form', label: 'Novo Cliente', icon: '👤' },
  { id: 'debtor-form', label: 'Nova Pessoa', icon: '👥' },
  { id: 'debt-form', label: 'Nova Dívida', icon: '💸' },
  { id: 'debt-list', label: 'Lista de Dívidas', icon: '📋' },
]

const API_URL = import.meta.env.VITE_API_URL ?? ''
let toastIdCounter = 0

function App() {
  const [clients, setClients] = useState<Client[]>([])
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [monthFilter, setMonthFilter] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')
  const [toasts, setToasts] = useState<Toast[]>([])

  const [clientForm, setClientForm] = useState({ name: '', cpfCnpj: '', phone: '' })
  const [debtorForm, setDebtorForm] = useState({ clientId: '', name: '', cpf: '', phone: '' })
  const [debtForm, setDebtForm] = useState({
    clientId: '', debtorId: '', principalAmount: '',
    interestRateMonthly: '5', fineRate: '2', dueDate: '', description: '',
  })

  function addToast(message: string, type: Toast['type'] = 'success') {
    const id = ++toastIdCounter
    setToasts((old) => [...old, { id, message, type }])
    setTimeout(() => setToasts((old) => old.filter((t) => t.id !== id)), 4000)
  }

  const dashboard = useMemo(() => {
    const totalEmAberto = debts.reduce((acc, d) => acc + d.calculation.totalDue, 0)
    const totalVencido = debts.filter((d) => d.status === 'overdue').reduce((acc, d) => acc + d.calculation.totalDue, 0)
    const vencendoHoje = debts.filter((d) => {
      if (d.status === 'paid') return false
      const diff = Math.ceil((new Date(d.dueDate).getTime() - Date.now()) / 86400000)
      return diff >= 0 && diff <= 3
    })
    return { totalEmAberto, totalVencido, clientes: clients.length, pessoas: debtors.length, vencendoHoje }
  }, [clients, debtors, debts])

  async function loadAll(selectedMonth?: string) {
    const month = selectedMonth ?? monthFilter
    const q = month ? `?month=${month}` : ''
    const [cr, dr, dbr] = await Promise.all([
      fetch(`${API_URL}/api/clients`),
      fetch(`${API_URL}/api/debtors`),
      fetch(`${API_URL}/api/debts${q}`),
    ])
    const [c, d, db] = await Promise.all([cr.json(), dr.json(), dbr.json()])
    setClients(c); setDebtors(d); setDebts(db)
  }

  useEffect(() => {
    loadAll().catch(() => addToast('Não foi possível carregar os dados.', 'error'))
  }, [])

  function navigate(id: string) { setActiveSection(id); setMenuOpen(false) }

  async function submitClient(e: FormEvent) {
    e.preventDefault()
    const res = await fetch(`${API_URL}/api/clients`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clientForm) })
    if (!res.ok) { addToast('Erro ao cadastrar cliente.', 'error'); return }
    setClientForm({ name: '', cpfCnpj: '', phone: '' })
    addToast('Cliente cadastrado com sucesso!')
    await loadAll()
  }

  async function submitDebtor(e: FormEvent) {
    e.preventDefault()
    const res = await fetch(`${API_URL}/api/debtors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(debtorForm) })
    if (!res.ok) { addToast('Erro ao cadastrar pessoa.', 'error'); return }
    setDebtorForm({ clientId: '', name: '', cpf: '', phone: '' })
    addToast('Pessoa cadastrada com sucesso!')
    await loadAll()
  }

  async function submitDebt(e: FormEvent) {
    e.preventDefault()
    const payload = { ...debtForm, principalAmount: Number(debtForm.principalAmount), interestRateMonthly: Number(debtForm.interestRateMonthly), fineRate: Number(debtForm.fineRate) }
    const res = await fetch(`${API_URL}/api/debts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!res.ok) { addToast('Erro ao cadastrar dívida.', 'error'); return }
    setDebtForm({ clientId: '', debtorId: '', principalAmount: '', interestRateMonthly: '5', fineRate: '2', dueDate: '', description: '' })
    addToast('Dívida cadastrada com sucesso!')
    await loadAll()
  }

  const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const statusLabel: Record<string, string> = { pending: 'Pendente', partial: 'Parcial', paid: 'Pago', overdue: 'Vencido' }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-mark">J</div>
          <div className="sidebar-brand"><span className="brand-name">Jurista</span><span className="brand-sub">Cobranças</span></div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={`nav-btn ${activeSection === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)} type="button">
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {menuOpen && <div className="overlay" onClick={() => setMenuOpen(false)} />}

      <div className="main-wrap">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMenuOpen((v) => !v)} type="button" aria-label="Menu">
            <span /><span /><span />
          </button>
          <span className="page-title">{NAV_ITEMS.find((n) => n.id === activeSection)?.label ?? 'Jurista'}</span>
          {dashboard.vencendoHoje.length > 0 && (
            <button className="alert-badge" onClick={() => navigate('debt-list')} type="button">
              ⚠️ {dashboard.vencendoHoje.length} vencendo
            </button>
          )}
        </header>

        <div className="page-content" key={activeSection}>

          {activeSection === 'overview' && (
            <div className="page-anim">
              {dashboard.vencendoHoje.length > 0 && (
                <div className="alert-banner">
                  <span>⚠️</span>
                  <div>
                    <strong>Atenção!</strong> {dashboard.vencendoHoje.length} dívida(s) vence(m) nos próximos 3 dias.
                    <button className="link-btn" onClick={() => navigate('debt-list')} type="button">Ver lista →</button>
                  </div>
                </div>
              )}
              <div className="kpi-grid">
                <div className="kpi-card accent-blue"><p className="kpi-label">Total em Aberto</p><strong className="kpi-value">{currency(dashboard.totalEmAberto)}</strong></div>
                <div className="kpi-card accent-red"><p className="kpi-label">Total Vencido</p><strong className="kpi-value">{currency(dashboard.totalVencido)}</strong></div>
                <div className="kpi-card accent-green"><p className="kpi-label">Clientes</p><strong className="kpi-value">{dashboard.clientes}</strong></div>
                <div className="kpi-card accent-purple"><p className="kpi-label">Pessoas</p><strong className="kpi-value">{dashboard.pessoas}</strong></div>
              </div>
              <h3 className="section-title">Ações Rápidas</h3>
              <div className="action-grid">
                <button className="action-card" onClick={() => navigate('client-form')} type="button"><span className="action-icon">👤</span><span>Novo Cliente</span></button>
                <button className="action-card" onClick={() => navigate('debtor-form')} type="button"><span className="action-icon">👥</span><span>Nova Pessoa</span></button>
                <button className="action-card" onClick={() => navigate('debt-form')} type="button"><span className="action-icon">💸</span><span>Nova Dívida</span></button>
                <button className="action-card" onClick={() => navigate('debt-list')} type="button"><span className="action-icon">📋</span><span>Ver Dívidas</span></button>
              </div>
            </div>
          )}

          {activeSection === 'client-form' && (
            <div className="page-anim">
              <div className="form-card">
                <div className="form-header"><span className="form-icon">👤</span><div><h2 className="form-title">Novo Cliente</h2><p className="form-sub">Preencha os dados do cliente responsável pelas dívidas.</p></div></div>
                <form onSubmit={submitClient} className="form-body">
                  <div className="field"><label>Nome completo</label><input required placeholder="Ex: João Silva" value={clientForm.name} onChange={(e) => setClientForm((o) => ({ ...o, name: e.target.value }))} /></div>
                  <div className="field"><label>CPF / CNPJ</label><input required placeholder="000.000.000-00" value={clientForm.cpfCnpj} onChange={(e) => setClientForm((o) => ({ ...o, cpfCnpj: e.target.value }))} /></div>
                  <div className="field"><label>Telefone</label><input placeholder="(11) 99999-0000" value={clientForm.phone} onChange={(e) => setClientForm((o) => ({ ...o, phone: e.target.value }))} /></div>
                  <button className="btn-primary" type="submit">Salvar Cliente</button>
                </form>
              </div>
            </div>
          )}

          {activeSection === 'debtor-form' && (
            <div className="page-anim">
              <div className="form-card">
                <div className="form-header"><span className="form-icon">👥</span><div><h2 className="form-title">Nova Pessoa</h2><p className="form-sub">Pessoa que possui a dívida vinculada a um cliente.</p></div></div>
                <form onSubmit={submitDebtor} className="form-body">
                  <div className="field"><label>Cliente responsável</label><select required value={debtorForm.clientId} onChange={(e) => setDebtorForm((o) => ({ ...o, clientId: e.target.value }))}><option value="">Selecione um cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div className="field"><label>Nome da pessoa</label><input required placeholder="Nome completo" value={debtorForm.name} onChange={(e) => setDebtorForm((o) => ({ ...o, name: e.target.value }))} /></div>
                  <div className="field"><label>CPF</label><input required placeholder="000.000.000-00" value={debtorForm.cpf} onChange={(e) => setDebtorForm((o) => ({ ...o, cpf: e.target.value }))} /></div>
                  <button className="btn-primary" type="submit">Salvar Pessoa</button>
                </form>
              </div>
            </div>
          )}

          {activeSection === 'debt-form' && (
            <div className="page-anim">
              <div className="form-card">
                <div className="form-header"><span className="form-icon">💸</span><div><h2 className="form-title">Nova Dívida</h2><p className="form-sub">Registre o valor principal, juros, multa e vencimento.</p></div></div>
                <form onSubmit={submitDebt} className="form-body">
                  <div className="fields-row">
                    <div className="field"><label>Cliente</label><select required value={debtForm.clientId} onChange={(e) => setDebtForm((o) => ({ ...o, clientId: e.target.value }))}><option value="">Selecione</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div className="field"><label>Pessoa</label><select required value={debtForm.debtorId} onChange={(e) => setDebtForm((o) => ({ ...o, debtorId: e.target.value }))}><option value="">Selecione</option>{debtors.filter((d) => !debtForm.clientId || d.clientId === debtForm.clientId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  </div>
                  <div className="fields-row">
                    <div className="field"><label>Valor principal (R$)</label><input required type="number" min="0" step="0.01" placeholder="0,00" value={debtForm.principalAmount} onChange={(e) => setDebtForm((o) => ({ ...o, principalAmount: e.target.value }))} /></div>
                    <div className="field"><label>Juros mensal (%)</label><input required type="number" min="0" step="0.01" value={debtForm.interestRateMonthly} onChange={(e) => setDebtForm((o) => ({ ...o, interestRateMonthly: e.target.value }))} /></div>
                    <div className="field"><label>Multa (%)</label><input required type="number" min="0" step="0.01" value={debtForm.fineRate} onChange={(e) => setDebtForm((o) => ({ ...o, fineRate: e.target.value }))} /></div>
                  </div>
                  <div className="fields-row">
                    <div className="field"><label>Data de vencimento</label><input required type="date" value={debtForm.dueDate} onChange={(e) => setDebtForm((o) => ({ ...o, dueDate: e.target.value }))} /></div>
                    <div className="field field-grow"><label>Descrição</label><input placeholder="Opcional" value={debtForm.description} onChange={(e) => setDebtForm((o) => ({ ...o, description: e.target.value }))} /></div>
                  </div>
                  <button className="btn-primary" type="submit">Salvar Dívida</button>
                </form>
              </div>
            </div>
          )}

          {activeSection === 'debt-list' && (
            <div className="page-anim">
              <div className="list-header">
                <h2 className="section-title">Dívidas em Andamento</h2>
                <div className="field"><label>Filtrar por mês</label><input type="month" value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); loadAll(e.target.value) }} /></div>
              </div>
              {debts.length === 0 ? (
                <div className="empty-state"><span>📭</span><p>Nenhuma dívida encontrada.</p></div>
              ) : (
                <>
                  {debts.some((d) => { const diff = Math.ceil((new Date(d.dueDate).getTime() - Date.now()) / 86400000); return d.status !== 'paid' && diff >= 0 && diff <= 3 }) && (
                    <div className="alert-banner"><span>⚠️</span><strong>Há dívidas vencendo em até 3 dias!</strong></div>
                  )}
                  <div className="debt-cards">
                    {debts.map((debt) => {
                      const diff = Math.ceil((new Date(debt.dueDate).getTime() - Date.now()) / 86400000)
                      const nearDue = debt.status !== 'paid' && diff >= 0 && diff <= 3
                      return (
                        <div key={debt.id} className={`debt-card ${debt.status}${nearDue ? ' near-due' : ''}`}>
                          <div className="debt-card-top">
                            <div><strong className="debt-person">{debt.debtor?.name ?? '—'}</strong><span className="debt-client">👤 {debt.client?.name ?? '—'}</span></div>
                            <span className={`status-pill ${debt.status}`}>{statusLabel[debt.status]}</span>
                          </div>
                          {nearDue && <div className="near-due-tag">⚠️ Vence {diff === 0 ? 'hoje' : `em ${diff} dia(s)`}</div>}
                          <div className="debt-card-grid">
                            <div><span>Principal</span><strong>{currency(debt.principalAmount)}</strong></div>
                            <div><span>Juros</span><strong>{currency(debt.calculation.accruedInterest)}</strong></div>
                            <div><span>Multa</span><strong>{currency(debt.calculation.fineAmount)}</strong></div>
                            <div><span>Total</span><strong className="total-due">{currency(debt.calculation.totalDue)}</strong></div>
                          </div>
                          <div className="debt-card-footer">
                            <span>📅 {new Date(debt.dueDate).toLocaleDateString('pt-BR')}</span>
                            <span>{debt.calculation.daysOverdue > 0 ? `${debt.calculation.daysOverdue} dias em atraso` : 'Em dia'}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>

      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </div>
  )
}

export default App
