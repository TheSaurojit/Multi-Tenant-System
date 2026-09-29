# 🚀 Enterprise Multi-Tenant SaaS Business Analytics Platform

[![Next.js 16](https://img.shields.io/badge/Next.js-16.3-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.2-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-7.10-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![Stripe](https://img.shields.io/badge/Stripe-Billing-635BFF?style=for-the-badge&logo=stripe)](https://stripe.com/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)

A modern, enterprise-ready **B2B Multi-Tenant SaaS Platform** built with **Next.js 16 (App Router)**, **PostgreSQL**, **Prisma ORM**, and **Stripe**. 

It enables companies (Organizations) and their teams to upload business CSV data (sales, marketing, conversion metrics), automatically generates real-time KPI dashboards and interactive charts, isolates project data across Child Workspaces, enforces granular Role-Based Access Control (RBAC), and manages tiered subscription quotas through Stripe.

---

## 📑 Table of Contents

- [Core Features](#-core-features)
- [Multi-Tenant Architecture](#-multi-tenant-architecture)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Step-by-Step Setup Guide](#-step-by-step-setup-guide)
- [Stripe Configuration & Webhooks](#-stripe-configuration--webhooks)
- [Default Demo Credentials](#-default-demo-credentials)
- [Platform Usage Guide](#-platform-usage-guide)
- [Project Directory Structure](#-project-directory-structure)
- [NPM Scripts](#-npm-scripts)

---

## ✨ Core Features

### 🏢 1. Hierarchical 2-Level Multi-Tenancy
- **Level 1 (Organization)**: Holds company-wide billing subscriptions, invoices, and team memberships.
- **Level 2 (Child Workspaces)**: Departmental sandboxes (e.g., *Sales Operations*, *Marketing Labs*). Datasets, KPI calculations, and reports are strictly isolated per workspace.

### 📊 2. Dynamic CSV Ingestion & Validation Engine
- Instant CSV parsing and validation using **PapaParse**.
- Automated schema detection for sales, marketing, and custom business data.
- Handles row validation, date standardization, and numerical normalization.
- Enforces plan-based ingestion limits (e.g., 50k rows on Free vs. 5M rows on Advanced).

### 📈 3. Real-Time Analytics & Interactive Dashboards
- **Instant KPI Computation**: Gross & Net Revenue, Average Order Value (AOV), Total Orders, and Conversion Rates.
- **Interactive Visualizations (Recharts)**: Revenue over time, sales by channel, regional performance, and category distribution.
- **Saved Reports & Views**: Save custom filters, metrics, and chart views; export any view back to clean CSV.

### 🔐 4. Granular Role-Based Access Control (RBAC)
- 4 built-in roles:
  - **`OWNER`**: Company billing, organization settings, role assignments, audit logs.
  - **`ADMIN`**: Team invites, dataset uploads, report creation, audit log access.
  - **`MEMBER`**: Dataset uploads, report creation, dashboard exploration.
  - **`VIEWER`**: Read-only dashboard access.
- Declarative UI components (`<AuthGuard>`, `<RoleGate>`, `<PermissionGate>`).

### 💳 5. Tiered Stripe Subscription Billing & Quota Gating
- Self-serve Stripe Checkout with tiered monthly subscriptions:
  - **Free (₹0/mo)**: 1 workspace, 3 members, 10 uploads/mo, 50k rows/CSV.
  - **Pro (₹1,499/mo)**: 5 workspaces, 15 members, 100 uploads/mo, 500k rows/CSV, 1-yr retention.
  - **Advanced (₹4,999/mo)**: Unlimited workspaces, 50+ members, 500 uploads/mo, 5M rows/CSV, 3-yr retention.
- Real-time usage quota enforcement (workspace limits, seat limits, upload allowances).
- Full Stripe Customer Portal integration for customer card updates and invoice downloads.
- Real-time webhook synchronization (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`).

### 👥 6. Team Collaboration & Onboarding
- Invite team members via unique tokenized email links.
- Onboarding invite acceptance flow (`/invite/[token]`).
- Instant role reassignment and seat revocation.

### 🛡️ 7. Security, Auth & Enterprise Audit Trail
- Stateless session security with encrypted JWTs in HTTP-Only cookies.
- Edge proxy middleware (`src/proxy.ts`) verifying authentication and cryptographic tokens.
- Immutable Audit Log (`/workspace/audit-logs`) tracking logins, data uploads, role modifications, and plan upgrades.

---

## 🏛 Multi-Tenant Architecture

```
                       ┌───────────────────────────────┐
                       │   Organization (Company)      │ ─── Tied to Stripe Subscription (Free / Pro / Advanced)
                       └───────────────┬───────────────┘
                                       │
                      ┌────────────────┴────────────────┐
                      ▼                                 ▼
           ┌───────────────────────┐         ┌───────────────────────┐
           │ Workspace: Sales Ops  │         │ Workspace: Marketing  │ ─── Isolated Project Sandboxes
           └──────────┬────────────┘         └──────────┬────────────┘
                      │                                 │
           ┌──────────┴────────────┐         ┌──────────┴────────────┐
           │ • Sales Datasets      │         │ • Marketing Datasets  │
           │ • Revenue Reports     │         │ • Campaign Reports    │
           │ • KPI Dashboards      │         │ • Cohort Analytics    │
           └───────────────────────┘         └───────────────────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16.3 (App Router, Server Actions, Server Components, Route Handlers) |
| **Language & UI** | TypeScript 5, React 19, Tailwind CSS v4, Lucide React Icons |
| **Data Visualization** | Recharts (Line, Bar, Area, Distribution charts) |
| **Database & ORM** | PostgreSQL 16 with Prisma ORM 7.10 |
| **Authentication** | Jose (Stateless JWTs), Bcrypt.js (Password Hashing), HTTP-Only Cookies |
| **Payments & Billing** | Stripe Node SDK (Checkout Sessions, Customer Portal, Webhook HMAC Verification) |
| **File Processing** | PapaParse (Client & Server CSV Ingestion) |
| **Containerization** | Docker & Docker Compose (Local PostgreSQL) |

---

## 📦 Prerequisites

Before running the project locally, ensure you have:
- **Node.js** (v18.18+ or v20+ recommended)
- **npm** or **pnpm**
- **Docker Desktop** (optional, for local PostgreSQL container) OR a hosted PostgreSQL database (e.g. Neon, Supabase, AWS RDS).
- **Stripe Account** (optional for test-mode payments; the app has a built-in simulation fallback if no keys are provided).

---

## 🚀 Step-by-Step Setup Guide

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd "Multi Tenant System"
npm install
```

### 2. Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```

Open `.env` and review the values:
```env
# Database Connection
DATABASE_URL="postgresql://saas_user:saas_password@localhost:5432/saas_analytics?schema=public"

# App & Authentication Secrets
NEXT_PUBLIC_APP_URL="http://localhost:3000"
JWT_SECRET="multi-tenant-saas-jwt-secret-key-32-chars-long"

# Stripe Configuration (Test Mode)
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Stripe Recurring Price IDs
STRIPE_PRO_PRICE_ID="price_..."
STRIPE_ADVANCED_PRICE_ID="price_..."
```

### 3. Start PostgreSQL Database
If you have Docker installed, spin up the local PostgreSQL container:
```bash
npm run db:up
```
*(Or point `DATABASE_URL` in `.env` to your existing PostgreSQL instance).*

### 4. Push Database Schema
Apply the Prisma schema to your database:
```bash
npx prisma db push
```

### 5. Seed Demo Data
Populate the database with sample organizations, multiple workspaces, team members with different roles, sample sales/marketing datasets, and audit logs:
```bash
npm run db:seed
```

### 6. Start the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 💳 Stripe Configuration & Webhooks

The platform features full Stripe Checkout and Customer Portal integration.

### Setting Up Test Mode in Stripe Dashboard
1. Go to the [Stripe Dashboard](https://dashboard.stripe.com/) and toggle **Test Mode** on.
2. In **Developers ➔ API Keys**, copy:
   - **Secret key** (`sk_test_...`) ➔ `STRIPE_SECRET_KEY`
   - **Publishable key** (`pk_test_...`) ➔ `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. In **Product Catalog**, create your subscription products:
   - **Pro Plan**: Recurring monthly (e.g. ₹1,499) ➔ copy the Price ID (`price_...`) into `STRIPE_PRO_PRICE_ID`.
   - **Advanced Plan**: Recurring monthly (e.g. ₹4,999) ➔ copy the Price ID (`price_...`) into `STRIPE_ADVANCED_PRICE_ID`.
4. In **Settings ➔ Billing ➔ Customer portal**, click **Activate** so users can manage cards and cancel subscriptions.

### Forwarding Webhooks Locally
To test end-to-end webhook delivery on `localhost`, use the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe --all-snapshot
```

The CLI will display your webhook secret:
```text
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Copy this secret into `.env`:
```env
STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Restart `npm run dev`. When you complete checkout with test card `4242 4242 4242 4242`, Stripe will dispatch the webhook and update your database immediately!

---

## 🔑 Default Demo Credentials

When running `npm run db:seed`, the following accounts are created with password **`password123`**:

| Email | Role | Organization | Current Plan | Permissions |
|---|---|---|---|---|
| `owner@acme.com` | **OWNER** | Acme Analytics Inc. | Pro Plan | Full Admin, Billing, Invites, Audit Logs |
| `admin@acme.com` | **ADMIN** | Acme Analytics Inc. | Pro Plan | Team Invites, Uploads, Audit Logs |
| `member@acme.com` | **MEMBER** | Acme Analytics Inc. | Pro Plan | Upload Datasets, Create Reports |
| `viewer@acme.com` | **VIEWER** | Acme Analytics Inc. | Pro Plan | Read-only Dashboards |
| `owner@beta.com` | **OWNER** | Beta Launch Labs | Free Plan | Demonstrates Free Tier & Quota Limits |

---

## 📖 Platform Usage Guide

### 1. Switching & Creating Workspaces
- Click the **Workspace Switcher** in the left sidebar to toggle between sibling workspaces (e.g., *Sales Operations* vs. *Marketing Labs*).
- Click **"New Workspace"** to navigate to `/workspace/create` to add a new project sandbox.
- Quotas are actively checked against the organization's plan (e.g., Free: 1 workspace, Pro: 5 workspaces).

### 2. Creating New Organizations
- Click the **Organization Switcher** in the top section of the sidebar.
- Click **"New Organization"** to navigate to `/organization/create`.
- Creating an organization assigns you the `OWNER` role, generates an initial `Primary Workspace`, and starts you on the Free plan.

### 3. Uploading CSV Data
- Navigate to **Datasets** or click **"Upload CSV"** in the top navigation header.
- Drag and drop any sales or marketing CSV file.
- The platform processes the file, computes statistics, and automatically generates KPI visualizations.

### 4. Custom Reports & Filters
- Under **Saved Reports**, apply dynamic date range filters, category segmentations, and chart preferences.
- Save custom reports for team-wide sharing or export the filtered data to CSV.

### 5. Managing Team & Invitations
- Navigate to **Team & Roles** (`/workspace/team`).
- Enter a colleague's email address and assign a role (`ADMIN`, `MEMBER`, `VIEWER`).
- An invitation link is generated that allows the invitee to join the organization.

### 6. Billing & Quota Management
- Navigate to **Billing & Plans** (`/workspace/billing`).
- Review live quota progress bars (Team Seats, Monthly Uploads, Workspaces).
- Upgrade to **Pro** or **Advanced** via Stripe Checkout.
- Click **"Stripe Customer Portal"** to manage cards or view past invoices.

### 7. Audit Activity Trail
- Navigate to **Audit Logs** (`/workspace/audit-logs`) (accessible to Owners and Admins).
- Filter and inspect immutable security logs for logins, file uploads, role changes, and plan upgrades with exact timestamps and IP addresses.

---

## 📁 Project Directory Structure

```text
├── prisma/
│   ├── schema.prisma             # Multi-tenant PostgreSQL database models & enums
│   └── seed.ts                   # Demo dataset & user seeding script
├── src/
│   ├── app/
│   │   ├── (auth)/               # Auth routes (login, signup, invite acceptance)
│   │   ├── (dashboard)/          # Authenticated app shell
│   │   │   ├── dashboard/        # Main KPI charts & metrics view
│   │   │   ├── datasets/         # CSV upload & dataset management
│   │   │   ├── reports/          # Saved custom reports & export
│   │   │   ├── organization/     # Organization creation page
│   │   │   └── workspace/        # Workspace creation, billing, team, audit logs
│   │   ├── actions/              # Next.js Server Actions (auth, billing, team, dataset)
│   │   └── api/                  # API Route Handlers (webhooks/stripe, auth/verify)
│   ├── components/
│   │   ├── auth/                 # Auth guards, role gates & access denied UI
│   │   ├── billing/              # Plan comparison cards & Stripe portal trigger
│   │   ├── layout/               # Sidebar, dashboard shell & headers
│   │   ├── organization/         # Organization creation form
│   │   ├── team/                 # Member management & invite dialogs
│   │   ├── ui/                   # Reusable UI primitives (buttons, modals, badges)
│   │   └── workspace/            # Workspace creation form
│   ├── contexts/                 # Client React AuthContext
│   ├── lib/
│   │   ├── analytics-engine.ts   # Metric computations, AOV, revenue aggregations
│   │   ├── audit.ts              # Immutable audit logging helper
│   │   ├── auth.ts               # Session verification & password hashing
│   │   ├── csv-parser.ts         # PapaParse engine & schema validation
│   │   ├── db.ts                 # Prisma Client singleton
│   │   ├── feature-limits.ts     # Plan quota gatekeeping logic
│   │   ├── permissions.ts        # RBAC role-to-permission mapping
│   │   ├── plans.ts              # Plan configurations & pricing metadata
│   │   └── stripe.ts             # Stripe SDK, checkout & portal session generators
│   └── proxy.ts                  # Edge security middleware & route protection
├── .env.example                  # Environment variable reference template
├── docker-compose.yml            # Local PostgreSQL Docker configuration
└── package.json                  # Dependencies and execution scripts
```

---

## 📜 NPM Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Next.js local development server on `http://localhost:3000` |
| `npm run build` | Compiles and builds the production Next.js application |
| `npm run start` | Runs the compiled production build |
| `npm run lint` | Runs ESLint to check code quality |
| `npm run db:up` | Starts the local PostgreSQL container via Docker Compose |
| `npm run db:down` | Stops the local PostgreSQL container |
| `npm run db:seed` | Resets and seeds the database with demo users, orgs, and datasets |
| `npm run db:studio` | Launches Prisma Studio GUI on `http://localhost:5555` to view/edit database records |

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
