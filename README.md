# Me Poupa - Backend

API RESTful para gestão de finanças de casais. Desenvolvido para casais controlarem despesas domésticas juntos.

## Tecnologias

- **Node.js** com Express
- **PostgreSQL** para banco de dados
- **JWT** para autenticação
- **bcryptjs** para hash de senhas
- **pdfkit** para geração de relatórios PDF
- **Docker** para containerização

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/financas_casa
JWT_SECRET=sua_chave_secreta_aqui
JWT_EXPIRES_IN=7d
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Instalação

### Sem Docker

```bash
npm install
npm run dev
```

### Com Docker

```bash
docker-compose up -d
```

O servidor estará disponível em `http://localhost:3001`

## Categorias Padrão

Ao criar uma conta, as seguintes categorias são automaticamente criadas:

**Receitas:**
- Salário
- Extra/Banco

**Despesas:**
- Móveis Parcelados
- Comida
- Luz e Água
- Faculdade
- Internet
- Entretenimento

## API Endpoints

### Autenticação

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/register` | Cadastro de usuário |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Dados do usuário logado |

### Transações

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/transactions` | Lista transações (com filtros) |
| GET | `/api/transactions/summary` | Resumo do período |
| GET | `/api/transactions/history` | Histórico de meses |
| GET | `/api/transactions/export` | Exportar CSV |
| POST | `/api/transactions` | Criar transação |
| PUT | `/api/transactions/:id` | Atualizar transação |
| DELETE | `/api/transactions/:id` | Remover transação |

**Filtros disponíveis:**
- `month` e `year`: Filtrar por mês/ano
- `date_from` e `date_to`: Filtrar por período customizado (YYYY-MM-DD)
- `type`: Filtrar por tipo ('income', 'expense')
- `category_id`: Filtrar por categoria
- `account_id`: Filtrar por conta

### Transferências

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/transfers` | Transferir entre contas |

### Contas

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/accounts` | Lista contas |
| POST | `/api/accounts` | Criar conta |
| PUT | `/api/accounts/:id` | Atualizar conta |
| DELETE | `/api/accounts/:id` | Remover conta |

### Categorias

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/categories` | Lista categorias |
| POST | `/api/categories` | Criar categoria |
| DELETE | `/api/categories/:id` | Remover categoria |

### Orçamentos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/budgets` | Lista orçamentos do mês |
| POST | `/api/budgets` | Criar orçamento |
| DELETE | `/api/budgets/:id` | Remover orçamento |

### Metas

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/goals` | Lista metas |
| POST | `/api/goals` | Criar meta |
| PUT | `/api/goals/:id` | Atualizar meta |
| DELETE | `/api/goals/:id` | Remover meta |

### Família Compartilhada

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/family/join` | Entrar em uma família via código |
| POST | `/api/family/leave` | Sair da família |
| GET | `/api/family/members` | Listar membros da família |

### Notificações

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/notifications` | Lista notificações |
| GET | `/api/notifications/unread-count` | Contagem de não lidas |
| PUT | `/api/notifications/:id/read` | Marcar como lida |
| PUT | `/api/notifications/read-all` | Marcar todas como lidas |
| DELETE | `/api/notifications/:id` | Remover notificação |

**Tipos de notificação:**
- `family_join`: Quando alguém entra na família
- `family_leave`: Quando alguém sai da família
- `finance_change`: Quando alguém altera transações

### Relatórios

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/reports/pdf` | Gerar relatório PDF do período |

**Parâmetros:**
- `month` e `year`: Mês/ano específico
- `date_from` e `date_to`: Período customizado

## Segurança

- **Rate Limiting**: 100 req/15min geral, 10 req/15min para auth
- **Validação de Input**: Middleware de validação em todas as rotas
- **CORS**: Origins configuráveis via variável de ambiente
- **Senhas**: Hash com bcrypt (12 rounds)
- **JWT**: Tokens com expiração configurável

## Scripts

```bash
npm start      # Iniciar produção
npm run dev    # Iniciar desenvolvimento (com nodemon)
```

## Estrutura do Projeto

```
src/
├── db/
│   ├── pool.js       # Conexão PostgreSQL
│   └── init.sql      # Schema do banco
├── middleware/
│   ├── auth.js        # Autenticação JWT
│   ├── rateLimiter.js # Rate limiting
│   └── validate.js    # Validação de input
├── routes/
│   ├── auth.js       # Rotas de autenticação
│   ├── transactions.js # Rotas de transações
│   ├── resources.js   # Contas, categorias, orçamentos, metas
│   ├── family.js     # Rotas de família compartilhada
│   ├── notifications.js # Rotas de notificações
│   └── reports.js    # Rotas de relatórios PDF
└── index.js          # Entry point
```
