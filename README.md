<p align="center">
  <img src=".github/logo-horizontal.svg" alt="Me Poupa" width="320" />
</p>

<p align="center">
  <strong>API RESTful para gestão de finanças pessoais e familiares</strong><br/>
  Controle compartilhado de receitas e despesas, em tempo real, com segurança de ponta a ponta.
</p>

<p align="center">
  <a href="https://me-poupa.vercel.app" target="_blank">
    <img src="https://img.shields.io/badge/demo-ao%20vivo-4CAF50?style=for-the-badge&logo=vercel&logoColor=white" alt="Demo" />
  </a>
  <img src="https://img.shields.io/badge/node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/typescript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/licença-MIT-yellow?style=for-the-badge" alt="MIT" />
</p>

---

## 📋 Índice

- [Sobre o Projeto](#-sobre-o-projeto)
- [Funcionalidades](#-funcionalidades)
- [Tecnologias](#-tecnologias)
- [Configuração do Ambiente](#-configuração-do-ambiente)
- [Instalação](#-instalação)
- [Endpoints da API](#-endpoints-da-api)
- [Segurança](#-segurança)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Scripts Disponíveis](#-scripts-disponíveis)
- [Contribuição](#-contribuição)
- [Licença](#-licença)

---

## 💡 Sobre o Projeto

O **Me Poupa** nasceu para resolver um problema simples e cotidiano: como casais e famílias podem controlar suas finanças juntos, de forma organizada e segura?

A API oferece uma base sólida para aplicações de gestão financeira compartilhada — com autenticação robusta, organização por categorias, notificações em tempo real e geração de relatórios. Tudo pensado para funcionar tanto de forma individual quanto em grupo familiar.

> 🌐 O frontend está disponível em **[me-poupa.vercel.app](https://me-poupa.vercel.app)**

---

## ✨ Funcionalidades

- 👤 **Autenticação segura** com JWT armazenado em cookies httpOnly
- 💸 **Gestão de transações** — receitas, despesas, filtros avançados e exportação CSV
- 🏷️ **Categorias personalizáveis** por grupo familiar
- 👨‍👩‍👧 **Grupos familiares** com código de convite e controle compartilhado
- 🔔 **Notificações em tempo real** via WebSocket (Socket.IO)
- 📄 **Relatórios em PDF** por período ou mês/ano
- 🛡️ **Camadas de segurança** com rate limiting, validação e sanitização de inputs
- 🐳 **Docker-ready** com ambiente completo via Docker Compose

---

## 🛠 Tecnologias

| Tecnologia | Finalidade |
|---|---|
| **Node.js + Express** | Framework principal da API |
| **TypeScript** | Tipagem estática para melhor DX e menos erros |
| **PostgreSQL** | Banco de dados relacional |
| **JWT + Cookies httpOnly** | Autenticação segura sem exposição de token |
| **bcryptjs** | Hash de senhas com 12 rounds |
| **Socket.IO** | Notificações em tempo real |
| **Helmet.js** | Proteção via headers HTTP |
| **pdfkit** | Geração de relatórios PDF |
| **Docker + Docker Compose** | Containerização e orquestração |

---

## ⚙️ Configuração do Ambiente

Copie o arquivo de exemplo e preencha com suas variáveis:

```bash
cp .env.example .env
```

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/financas_casa
JWT_SECRET=sua_chave_secreta_aqui_muito_longa_e_aleatoria
JWT_EXPIRES_IN=7d
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

> ⚠️ **Nunca versione o `.env`.** Ele já está no `.gitignore`.

---

## 🚀 Instalação

### Opção 1 — Sem Docker

```bash
# Instalar dependências
npm install

# Iniciar em modo desenvolvimento (hot reload)
npm run dev
```

### Opção 2 — Com Docker *(recomendado)*

Requer [Docker](https://docs.docker.com/get-docker/) e [Docker Compose](https://docs.docker.com/compose/) instalados.

```bash
docker-compose up -d
```

Esse único comando irá:

1. ✅ Subir o PostgreSQL na porta `5432`
2. ✅ Fazer o build e iniciar a API na porta `3001`
3. ✅ Criar o banco de dados e aplicar o schema automaticamente

A API estará disponível em **`http://localhost:3001`**

#### Comandos úteis

```bash
# Acompanhar logs da API
docker-compose logs -f api

# Acompanhar todos os serviços
docker-compose logs -f

# Parar os serviços (mantém os dados)
docker-compose down

# Parar e resetar tudo (remove volumes)
docker-compose down -v
```

---

## 📡 Endpoints da API

### 🔐 Autenticação

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/auth/register` | Cadastrar novo usuário |
| `POST` | `/api/auth/login` | Realizar login |
| `POST` | `/api/auth/logout` | Encerrar sessão |
| `GET` | `/api/auth/me` | Dados do usuário autenticado |
| `PUT` | `/api/auth/profile` | Atualizar nome/perfil |
| `PUT` | `/api/auth/email` | Alterar e-mail |
| `PUT` | `/api/auth/password` | Alterar senha |

---

### 💸 Transações

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/transactions` | Listar transações com filtros |
| `GET` | `/api/transactions/summary` | Resumo financeiro do período |
| `GET` | `/api/transactions/history` | Histórico mensal |
| `GET` | `/api/transactions/export` | Exportar transações em CSV |
| `POST` | `/api/transactions` | Criar nova transação |
| `PUT` | `/api/transactions/:id` | Editar transação existente |
| `DELETE` | `/api/transactions/:id` | Remover transação |

#### Filtros disponíveis (query params)

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `month` + `year` | `number` | Filtrar por mês e ano |
| `date_from` + `date_to` | `YYYY-MM-DD` | Filtrar por intervalo de datas |
| `type` | `income` \| `expense` | Filtrar por tipo |
| `category_id` | `number` | Filtrar por categoria |
| `limit` | `number` | Máximo de resultados (até 1000) |
| `offset` | `number` | Deslocamento para paginação |

---

### 🏷️ Categorias

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/categories` | Listar categorias |
| `POST` | `/api/categories` | Criar nova categoria |
| `DELETE` | `/api/categories/:id` | Remover categoria |

---

### 👨‍👩‍👧 Família Compartilhada

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/family/create` | Criar um grupo familiar |
| `POST` | `/api/family/join` | Entrar em um grupo via código de convite |
| `POST` | `/api/family/leave` | Sair do grupo familiar |
| `GET` | `/api/family/members` | Listar membros do grupo |

#### Fluxo de uso

```
Novo usuário
     │
     ├──► Cria uma família  ──► Torna-se administrador
     │         └── Categorias padrão criadas automaticamente
     │
     └──► Entra em família existente  ──► Usa código de convite
```

---

### 🔔 Notificações

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/notifications` | Listar notificações |
| `PUT` | `/api/notifications/:id/read` | Marcar uma como lida |
| `PUT` | `/api/notifications/read-all` | Marcar todas como lidas |
| `DELETE` | `/api/notifications/:id` | Remover notificação |

---

### 📄 Relatórios

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/reports/pdf` | Gerar relatório PDF do período |

| Parâmetro | Descrição |
|---|---|
| `month` + `year` | Relatório de um mês específico |
| `date_from` + `date_to` | Relatório de um intervalo customizado |

---

## 🔒 Segurança

### Mecanismos implementados

| Camada | Detalhes |
|---|---|
| **Cookies httpOnly** | JWT inacessível via JavaScript — protegido contra XSS |
| **Helmet.js** | Headers de segurança: CSP, X-Frame-Options, HSTS e outros |
| **Rate Limiting** | 500 req/15min geral · 20 req/15min nas rotas de autenticação |
| **TypeScript** | Tipagem estática em toda a codebase |
| **Validação Custom** | Validação e sanitização de todos os inputs da API |
| **CORS** | Origins restritas e configuráveis via variável de ambiente |
| **bcrypt** | Hash de senhas com 12 rounds |
| **JWT** | Tokens com expiração configurável e renovação controlada |
| **WebSocket Rate Limit** | Máximo de 100 mensagens/min por usuário conectado |

### Requisitos mínimos de senha

```
✅ Mínimo de 8 caracteres
✅ Pelo menos uma letra maiúscula (A–Z)
✅ Pelo menos uma letra minúscula (a–z)
✅ Pelo menos um número (0–9)
```

---

## 📁 Estrutura do Projeto

```
me-poupa-backend/
│
├── src/
│   ├── db/
│   │   └── pool.ts             # Conexão com o PostgreSQL
│   │
│   ├── middleware/
│   │   ├── auth.ts             # Autenticação via JWT + cookies
│   │   ├── rateLimiter.ts      # Controle de taxa de requisições
│   │   └── validate.ts          # Validação de inputs
│   │
│   ├── routes/
│   │   ├── auth.ts             # Autenticação e perfil
│   │   ├── transactions.ts     # CRUD de transações
│   │   ├── resources.ts        # Categorias
│   │   ├── family.ts           # Grupos familiares
│   │   ├── notifications.ts    # Notificações
│   │   └── reports.ts          # Geração de PDF
│   │
│   ├── utils/
│   │   └── socketHelpers.ts    # Helpers para eventos Socket.IO
│   │
│   ├── types/
│   │   └── index.ts            # Tipos TypeScript
│   │
│   └── index.ts                # Entry point da aplicação
│
├── tsconfig.json               # Configuração do TypeScript
├── .env.example                # Modelo de variáveis de ambiente
├── docker-compose.yml          # Orquestração dos serviços
├── Dockerfile                  # Imagem da aplicação
└── package.json
```

---

## 📜 Scripts Disponíveis

```bash
npm run typecheck  # Verificar tipos TypeScript
npm run build      # Compilar TypeScript para JavaScript
npm start          # Iniciar em produção (usa dist/)
npm run dev        # Iniciar em desenvolvimento (com ts-node/esm)
```

---

## 🤝 Contribuição

Contribuições são bem-vindas! Para reportar bugs ou sugerir melhorias, abra uma issue:

**👉 [github.com/joaomjbraga/me-poupa-backend/issues](https://github.com/joaomjbraga/me-poupa-backend/issues)**

<br/>

<p align="center">
  <a href="https://github.com/joaomjbraga">
    <img src="https://github.com/joaomjbraga.png?size=96" width="72" style="border-radius: 50%" alt="João M J Braga" />
  </a>
  <br/>
  <strong><a href="https://github.com/joaomjbraga">João M J Braga</a></strong>
  <br/>
  <sub>Autor e mantenedor</sub>
</p>

<p align="center">
  Se este projeto te ajudou, deixe uma ⭐ no repositório — isso ajuda muito!
</p>

---

## 📝 Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.
