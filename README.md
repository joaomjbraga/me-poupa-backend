# Me Poupa - Backend

API RESTful para gestão de finanças pessoais e familiares.

## Tecnologias

- **Node.js** com Express
- **PostgreSQL** para banco de dados
- **JWT** para autenticação com cookies httpOnly
- **bcryptjs** para hash de senhas (12 rounds)
- **Socket.IO** para comunicação em tempo real
- **Helmet.js** para headers de segurança
- **pdfkit** para geração de relatórios PDF
- **Docker** para containerização

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/financas_casa
JWT_SECRET=sua_chave_secreta_aqui_muito_longa_e_aleatoria
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

Certifique-se de ter o Docker e Docker Compose instalados.

```bash
docker-compose up -d
```

Isso irá:
1. Subir o banco de dados PostgreSQL na porta 5432
2. Buildar e iniciar a API na porta 3001
3. Criar automaticamente o banco de dados e aplicar o schema

O servidor estará disponível em `http://localhost:3001`

**Logs:**
```bash
docker-compose logs -f api    # Ver logs da API
docker-compose logs -f        # Ver todos os logs
```

**Parar:**
```bash
docker-compose down           # Parar sem remover dados
docker-compose down -v        # Parar e remover volumes (reset completo)
```

## API Endpoints

### Autenticação

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/register` | Cadastro de usuário |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Dados do usuário logado |
| PUT | `/api/auth/profile` | Atualizar perfil |
| PUT | `/api/auth/email` | Alterar email |
| PUT | `/api/auth/password` | Alterar senha |

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
- `limit`: Limite de resultados (máx 1000)
- `offset`: Paginação

### Categorias

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/categories` | Lista categorias |
| POST | `/api/categories` | Criar categoria |
| DELETE | `/api/categories/:id` | Remover categoria |

### Família Compartilhada

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/family/create` | Criar uma nova família |
| POST | `/api/family/join` | Entrar em uma família via código |
| POST | `/api/family/leave` | Sair da família |
| GET | `/api/family/members` | Listar membros da família |

**Fluxo de família:**
- Ao se registrar, o usuário não pertence a nenhuma família
- O usuário pode criar uma família própria via `/family/create`
- Ou entrar em uma família existente usando o código de convite
- Ao criar uma família, categorias padrão são criadas automaticamente

### Notificações

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/notifications` | Lista notificações |
| PUT | `/api/notifications/:id/read` | Marcar como lida |
| PUT | `/api/notifications/read-all` | Marcar todas como lidas |
| DELETE | `/api/notifications/:id` | Remover notificação |

### Relatórios

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/reports/pdf` | Gerar relatório PDF do período |

**Parâmetros:**
- `month` e `year`: Mês/ano específico
- `date_from` e `date_to`: Período customizado

## Segurança

### Implementado

- **Cookies httpOnly**: JWT armazenado em cookies seguros
- **Helmet.js**: Headers de segurança (CSP, X-Frame-Options, etc.)
- **Rate Limiting**: 500 req/15min geral, 20 req/15min para auth
- **Validação de Input**: Middleware de validação em todas as rotas
- **CORS**: Origins configuráveis via variável de ambiente
- **Sanitização**: Strings limitadas e escapadas
- **bcrypt**: Hash com 12 rounds
- **JWT**: Tokens com expiração configurável
- **WebSocket Rate Limit**: 100 msgs/min por usuário

### Requisitos de Senha

- Mínimo 8 caracteres
- Pelo menos uma letra maiúscula
- Pelo menos uma letra minúscula
- Pelo menos um número

### Validações

- Email: Regex validado
- Transações: Tipo, valor positivo, data, descrição
- Query params: Limites máximos definidos

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
│   ├── auth.js        # Autenticação JWT + cookies
│   ├── rateLimiter.js # Rate limiting
│   └── validate.js    # Validação de input
├── routes/
│   ├── auth.js        # Rotas de autenticação
│   ├── transactions.js # Rotas de transações
│   ├── resources.js   # Categorias
│   ├── family.js     # Rotas de família compartilhada
│   ├── notifications.js # Rotas de notificações
│   └── reports.js    # Rotas de relatórios PDF
├── utils/
│   └── socketHelpers.js # Helpers para Socket.IO
└── index.js          # Entry point
```

## Suporte

Reporte issues em:
https://github.com/joaomjbraga/me-poupa/issues

| [![João M J Braga](https://github.com/joaomjbraga.png?size=100)](https://github.com/joaomjbraga)

Se você gostou deste tema, considere deixar uma ⭐ no repositório!

## Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.