# Deployment Guide

Target: **Azure Container Apps** via **neurafixbridgeacr** (Central India).  
After initial setup, every `git push origin main` triggers a full automated deploy.

---

## Architecture

```
GitHub push
    │
    ▼ GitHub Actions
    ├─ Build 4 images → push to neurafixbridgeacr.azurecr.io
    ├─ Run Alembic migrations (main_backend + ai_service)
    └─ Update 5 Container Apps with new images
                │
                ▼ Azure Container Apps (neurafix-bridge-deployments, Central India)
                ├─ hamroguru-frontend      [external, port 80]   nginx + React SPA
                ├─ hamroguru-main-backend  [external, port 8000] FastAPI
                ├─ hamroguru-ai-service    [internal, port 8001] FastAPI + LangGraph
                ├─ hamroguru-worker        [no ingress]          Celery worker
                └─ hamroguru-worker-beat   [no ingress]          Celery beat scheduler
```

Internal service communication uses Azure Container Apps' internal DNS:  
`http://hamroguru-main-backend` → main-backend, `http://hamroguru-ai-service` → ai-service.

---

## One-Time Setup (do this once)

### Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed and logged in
- Docker Desktop running
- Python 3.11+ installed (for running initial migrations locally)
- Your repo pushed to GitHub

```bash
az login
az account set --subscription <your-subscription-id>
```

---

### Step 1 — Build and push initial images to ACR

Run this from the repo root. You need at least one image in ACR before provisioning Container Apps.

```bash
az acr login --name neurafixbridgeacr
bash scripts/build-push-acr.sh neurafixbridgeacr latest
```

---

### Step 2 — Run initial DB migrations

Run this once from your local machine (requires Python + alembic installed per service).

```bash
# Install dependencies if not already installed
cd main_backend && pip install -r requirements.txt && cd ..
cd ai_service  && pip install -r requirements.txt && cd ..

# Run migrations (loads DATABASE_URL from .env automatically)
bash scripts/run-migrations.sh
```

---

### Step 3 — Create infrastructure (run once)

Copy the example parameters file and fill in your values from `.env`:

```bash
cp infra/parameters.example.json infra/parameters.json
# Edit infra/parameters.json — fill in all values from your .env file
# For jwtSecretKey and mainBackendInternalSecret, generate strong secrets:
#   openssl rand -hex 32
```

Deploy all Azure resources:

```bash
az deployment group create \
  --resource-group neurafix-bridge-deployments \
  --template-file infra/main.bicep \
  --parameters @infra/parameters.json
```

This creates: Log Analytics workspace, Container Apps Environment, Managed Identity,
AcrPull role assignment, and all 5 Container Apps with secrets pre-configured.

**Save the output URLs** — you'll see them at the end:
```
frontendUrl     : https://hamroguru-frontend.<env-domain>
mainBackendUrl  : https://hamroguru-main-backend.<env-domain>
```

---

### Step 4 — Set up GitHub Actions OIDC (no stored passwords)

Run these commands **once**. Replace `YOUR_GITHUB_ORG/YOUR_REPO` with your actual GitHub path.

```bash
# 1. Create an app registration for GitHub Actions
APP_ID=$(az ad app create --display-name "hamroguru-github-actions" --query appId -o tsv)
echo "APP_ID: $APP_ID"   # Save this — you'll need it as AZURE_CLIENT_ID in GitHub

# 2. Create a service principal for the app
az ad sp create --id $APP_ID

# 3. Grant Contributor access on the resource group (needed to update Container Apps)
az role assignment create \
  --assignee $APP_ID \
  --role Contributor \
  --scope $(az group show --name neurafix-bridge-deployments --query id -o tsv)

# 4. Grant AcrPush access on the registry (needed to push Docker images)
az role assignment create \
  --assignee $APP_ID \
  --role AcrPush \
  --scope $(az acr show --name neurafixbridgeacr --query id -o tsv)

# 5. Create the federated credential — links GitHub repo to this app registration
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "hamroguru-main-deploy",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:YOUR_GITHUB_ORG/YOUR_REPO:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

---

### Step 5 — Add GitHub Secrets (4 only)

Go to: **GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `AZURE_CLIENT_ID` | The `APP_ID` output from Step 4 command 1 |
| `AZURE_TENANT_ID` | Run: `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | Run: `az account show --query id -o tsv` |
| `DATABASE_URL` | Your Neon connection string from `.env` (used only for migrations) |

**That's it — only 4 secrets.** All other app secrets (OpenAI, Pinecone, Redis, R2, etc.)  
are stored in Azure Container Apps secrets (set during Step 3) and never touch GitHub.

---

### Step 6 — First deploy

```bash
git push origin main
```

Go to **GitHub → Actions** to watch the workflow run.  
On success, your app is live at the `frontendUrl` from Step 3.

---

## After Initial Setup

Your role going forward:

| Task | Who does it |
|---|---|
| Write code | You |
| `git push origin main` | You |
| Build images, run migrations, deploy | GitHub Actions (automatic) |

---

## Updating infrastructure (env vars, scaling, secrets)

Re-run the Bicep deployment — it is idempotent:

```bash
az deployment group create \
  --resource-group neurafix-bridge-deployments \
  --template-file infra/main.bicep \
  --parameters @infra/parameters.json
```

Or update a single Container App secret directly:

```bash
az containerapp secret set \
  --name hamroguru-main-backend \
  --resource-group neurafix-bridge-deployments \
  --secrets "my-secret=new-value"
```

---

## Rollback

Each deploy creates a new Container Apps revision. To roll back:

```bash
# List revisions
az containerapp revision list \
  --name hamroguru-main-backend \
  --resource-group neurafix-bridge-deployments \
  --query "[].{name:name, active:properties.active, created:properties.createdTime}" \
  --output table

# Activate a previous revision
az containerapp revision activate \
  --name hamroguru-main-backend \
  --resource-group neurafix-bridge-deployments \
  --revision <revision-name>

az containerapp ingress traffic set \
  --name hamroguru-main-backend \
  --resource-group neurafix-bridge-deployments \
  --revision-weight <revision-name>=100
```

---

## Monitoring

View live logs for any service:

```bash
az containerapp logs show \
  --name hamroguru-main-backend \
  --resource-group neurafix-bridge-deployments \
  --follow
```

All structured logs also appear in the Log Analytics workspace: `hamroguru-env-logs`.

---

## Files reference

| File | Purpose |
|---|---|
| `infra/main.bicep` | All Azure resources (edit to change scaling, CPU, memory) |
| `infra/parameters.json` | Your secret values — **gitignored, never commit** |
| `infra/parameters.example.json` | Template — committed, no real values |
| `.github/workflows/deploy.yml` | CI/CD pipeline |
| `scripts/build-push-acr.sh` | Manual image push (used in Step 1) |
| `scripts/run-migrations.sh` | Manual migration run (used in Step 2) |
