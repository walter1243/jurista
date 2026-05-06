# App Jurista (MVP)

MVP full-stack com frontend PWA e backend API para:
- cadastro de clientes
- cadastro de pessoas (devedores)
- cadastro de dividas
- calculo de juros mensal proporcional por dia de atraso
- multa fixa percentual no vencimento
- filtro por mes

## Estrutura

- frontend: React + Vite + TypeScript + PWA
- backend: Node + Express + TypeScript

## Regras de calculo (MVP)

- juros diario = (juros mensal / 100) / 30
- dias vencidos = diferenca de dias entre vencimento e data de referencia
- multa aplicada uma unica vez quando ha atraso
- total devido = principal em aberto + multa + juros acumulado

## Como rodar

1. Backend
   - cd backend
   - npm install
   - npm run dev

2. Frontend
   - cd frontend
   - npm install
   - npm run dev -- --host

## URLs locais

- API: http://localhost:4000
- Web: http://localhost:5173

## Instalar no celular (PWA)

1. Abra a URL do frontend no navegador do celular.
2. Use a opcao "Adicionar a tela inicial".
3. Toque no icone para abrir em modo app.
