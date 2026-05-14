targetScope = 'resourceGroup'

// ── Parameters ────────────────────────────────────────────────────────────────

param location string = 'centralindia'
param environmentName string = 'hamroguru-env'
param acrName string = 'neurafixbridgeacr'
param imageTag string = 'latest'

@secure()
param databaseUrl string

@secure()
param jwtSecretKey string

@secure()
param mainBackendInternalSecret string

@secure()
param azureOpenAIEndpoint string

@secure()
param azureOpenAIApiKey string

param azureOpenAIApiVersion string = '2025-01-01-preview'
param modelChatFast string = 'gpt-4o-mini'
param modelChatThinking string = 'gpt-4o'
param modelEmbedding string = 'text-embedding-3-large'

@secure()
param pineconeApiKey string

@secure()
param upstashRedisRestUrl string

@secure()
param upstashRedisRestToken string

@secure()
param r2AccountId string

@secure()
param r2Endpoint string

@secure()
param r2TokenValue string

@secure()
param r2AccessKeyId string

@secure()
param r2SecretAccessKey string

param r2BucketName string

// ── Existing ACR reference ────────────────────────────────────────────────────

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

// ── Log Analytics (required by Container Apps Environment) ────────────────────

resource logs 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${environmentName}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ── Container Apps Environment ────────────────────────────────────────────────

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

// ── Managed Identity (used by all Container Apps to pull from ACR) ────────────

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${environmentName}-identity'
  location: location
}

// AcrPull role — lets the managed identity pull images from ACR
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identity.id, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Shared config helpers ─────────────────────────────────────────────────────

var registry = '${acrName}.azurecr.io'

// Within the same Container Apps Environment, apps resolve each other by name.
// Python services use glibc (search domains work), nginx does not — use short name for Python
var mainBackendInternal = 'http://hamroguru-main-backend'
// Nginx proxy_pass needs a fully-resolvable public URL (no K8s search domain support)
var mainBackendPublic = 'https://hamroguru-main-backend.${containerEnv.properties.defaultDomain}'
var aiServiceInternal   = 'http://hamroguru-ai-service'

// Frontend URL is derived from the environment's DNS domain — used for CORS.
var frontendFqdn = 'https://hamroguru-frontend.${containerEnv.properties.defaultDomain}'

// ── main-backend ──────────────────────────────────────────────────────────────

resource mainBackend 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'hamroguru-main-backend'
  location: location
  dependsOn: [acrPullAssignment]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    environmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
        transport: 'http'
      }
      registries: [{ server: '${acrName}.azurecr.io', identity: identity.id }]
      secrets: [
        { name: 'db-url',          value: databaseUrl }
        { name: 'jwt-key',         value: jwtSecretKey }
        { name: 'internal-secret', value: mainBackendInternalSecret }
        { name: 'redis-url',       value: upstashRedisRestUrl }
        { name: 'redis-token',     value: upstashRedisRestToken }
        { name: 'r2-account-id',   value: r2AccountId }
        { name: 'r2-endpoint',     value: r2Endpoint }
        { name: 'r2-token',        value: r2TokenValue }
        { name: 'r2-access-key',   value: r2AccessKeyId }
        { name: 'r2-secret-key',   value: r2SecretAccessKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'main-backend'
          image: '${registry}/hamroguru-main-backend:${imageTag}'
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: [
            { name: 'DATABASE_URL',                 secretRef: 'db-url' }
            { name: 'JWT_SECRET_KEY',               secretRef: 'jwt-key' }
            { name: 'MAIN_BACKEND_INTERNAL_SECRET', secretRef: 'internal-secret' }
            { name: 'UPSTASH_REDIS_REST_URL',       secretRef: 'redis-url' }
            { name: 'UPSTASH_REDIS_REST_TOKEN',     secretRef: 'redis-token' }
            { name: 'R2_ACCOUNT_ID',                secretRef: 'r2-account-id' }
            { name: 'R2_ENDPOINT',                  secretRef: 'r2-endpoint' }
            { name: 'R2_TOKEN_VALUE',               secretRef: 'r2-token' }
            { name: 'R2_ACCESS_KEY_ID',             secretRef: 'r2-access-key' }
            { name: 'R2_SECRET_ACCESS_KEY',         secretRef: 'r2-secret-key' }
            { name: 'R2_BUCKET_NAME',               value: r2BucketName }
            { name: 'AI_SERVICE_URL',               value: aiServiceInternal }
            { name: 'ALLOWED_ORIGINS',              value: '["${frontendFqdn}"]' }
            { name: 'APP_ENV',                      value: 'production' }
            { name: 'DEBUG',                        value: 'false' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 8000 }
              initialDelaySeconds: 15
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 8000 }
              initialDelaySeconds: 10
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// ── ai-service ────────────────────────────────────────────────────────────────

resource aiService 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'hamroguru-ai-service'
  location: location
  dependsOn: [acrPullAssignment]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    environmentId: containerEnv.id
    configuration: {
      ingress: {
        external: false   // Internal only — called only by main-backend and worker
        targetPort: 8001
        transport: 'http'
      }
      registries: [{ server: '${acrName}.azurecr.io', identity: identity.id }]
      secrets: [
        { name: 'db-url',          value: databaseUrl }
        { name: 'jwt-key',         value: jwtSecretKey }
        { name: 'internal-secret', value: mainBackendInternalSecret }
        { name: 'openai-endpoint', value: azureOpenAIEndpoint }
        { name: 'openai-key',      value: azureOpenAIApiKey }
        { name: 'pinecone-key',    value: pineconeApiKey }
        { name: 'redis-url',       value: upstashRedisRestUrl }
        { name: 'redis-token',     value: upstashRedisRestToken }
        { name: 'r2-account-id',   value: r2AccountId }
        { name: 'r2-endpoint',     value: r2Endpoint }
        { name: 'r2-token',        value: r2TokenValue }
        { name: 'r2-access-key',   value: r2AccessKeyId }
        { name: 'r2-secret-key',   value: r2SecretAccessKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'ai-service'
          image: '${registry}/hamroguru-ai-service:${imageTag}'
          resources: { cpu: json('2.0'), memory: '4Gi' }
          env: [
            { name: 'DATABASE_URL',                 secretRef: 'db-url' }
            { name: 'JWT_SECRET_KEY',               secretRef: 'jwt-key' }
            { name: 'MAIN_BACKEND_INTERNAL_SECRET', secretRef: 'internal-secret' }
            { name: 'AZURE_OPENAI_ENDPOINT',        secretRef: 'openai-endpoint' }
            { name: 'AZURE_OPENAI_API_KEY',         secretRef: 'openai-key' }
            { name: 'AZURE_OPENAI_API_VERSION',     value: azureOpenAIApiVersion }
            { name: 'MODEL_CHAT_FAST',              value: modelChatFast }
            { name: 'MODEL_CHAT_THINKING',          value: modelChatThinking }
            { name: 'MODEL_EMBEDDING',              value: modelEmbedding }
            { name: 'PINECONE_API_KEY',             secretRef: 'pinecone-key' }
            { name: 'UPSTASH_REDIS_REST_URL',       secretRef: 'redis-url' }
            { name: 'UPSTASH_REDIS_REST_TOKEN',     secretRef: 'redis-token' }
            { name: 'R2_ACCOUNT_ID',                secretRef: 'r2-account-id' }
            { name: 'R2_ENDPOINT',                  secretRef: 'r2-endpoint' }
            { name: 'R2_TOKEN_VALUE',               secretRef: 'r2-token' }
            { name: 'R2_ACCESS_KEY_ID',             secretRef: 'r2-access-key' }
            { name: 'R2_SECRET_ACCESS_KEY',         secretRef: 'r2-secret-key' }
            { name: 'R2_BUCKET_NAME',               value: r2BucketName }
            { name: 'MAIN_BACKEND_URL',             value: mainBackendInternal }
            { name: 'APP_ENV',                      value: 'production' }
            { name: 'DEBUG',                        value: 'false' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 8001 }
              initialDelaySeconds: 20
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 8001 }
              initialDelaySeconds: 15
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 2 }
    }
  }
}

// ── worker ────────────────────────────────────────────────────────────────────

resource worker 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'hamroguru-worker'
  location: location
  dependsOn: [acrPullAssignment]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    environmentId: containerEnv.id
    configuration: {
      // No ingress — background Celery worker
      registries: [{ server: '${acrName}.azurecr.io', identity: identity.id }]
      secrets: [
        { name: 'db-url',          value: databaseUrl }
        { name: 'jwt-key',         value: jwtSecretKey }
        { name: 'internal-secret', value: mainBackendInternalSecret }
        { name: 'redis-url',       value: upstashRedisRestUrl }
        { name: 'redis-token',     value: upstashRedisRestToken }
        { name: 'openai-endpoint', value: azureOpenAIEndpoint }
        { name: 'openai-key',      value: azureOpenAIApiKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: '${registry}/hamroguru-worker:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'CELERY_MODE',                  value: 'worker' }
            { name: 'DATABASE_URL',                 secretRef: 'db-url' }
            { name: 'JWT_SECRET_KEY',               secretRef: 'jwt-key' }
            { name: 'MAIN_BACKEND_INTERNAL_SECRET', secretRef: 'internal-secret' }
            { name: 'UPSTASH_REDIS_REST_URL',       secretRef: 'redis-url' }
            { name: 'UPSTASH_REDIS_REST_TOKEN',     secretRef: 'redis-token' }
            { name: 'AZURE_OPENAI_ENDPOINT',        secretRef: 'openai-endpoint' }
            { name: 'AZURE_OPENAI_API_KEY',         secretRef: 'openai-key' }
            { name: 'AZURE_OPENAI_API_VERSION',     value: azureOpenAIApiVersion }
            { name: 'MODEL_CHAT_FAST',              value: modelChatFast }
            { name: 'MODEL_CHAT_THINKING',          value: modelChatThinking }
            { name: 'MODEL_EMBEDDING',              value: modelEmbedding }
            { name: 'MAIN_BACKEND_URL',             value: mainBackendInternal }
            { name: 'AI_SERVICE_URL',               value: aiServiceInternal }
            { name: 'APP_ENV',                      value: 'production' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }   // Exactly one worker to avoid duplicate task execution
    }
  }
}

// ── worker-beat ───────────────────────────────────────────────────────────────

resource workerBeat 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'hamroguru-worker-beat'
  location: location
  dependsOn: [acrPullAssignment]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    environmentId: containerEnv.id
    configuration: {
      // No ingress — Celery beat scheduler
      registries: [{ server: '${acrName}.azurecr.io', identity: identity.id }]
      secrets: [
        { name: 'db-url',          value: databaseUrl }
        { name: 'jwt-key',         value: jwtSecretKey }
        { name: 'internal-secret', value: mainBackendInternalSecret }
        { name: 'redis-url',       value: upstashRedisRestUrl }
        { name: 'redis-token',     value: upstashRedisRestToken }
        { name: 'openai-endpoint', value: azureOpenAIEndpoint }
        { name: 'openai-key',      value: azureOpenAIApiKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker-beat'
          image: '${registry}/hamroguru-worker:${imageTag}'   // Same image, beat mode
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'CELERY_MODE',                  value: 'beat' }
            { name: 'DATABASE_URL',                 secretRef: 'db-url' }
            { name: 'JWT_SECRET_KEY',               secretRef: 'jwt-key' }
            { name: 'MAIN_BACKEND_INTERNAL_SECRET', secretRef: 'internal-secret' }
            { name: 'UPSTASH_REDIS_REST_URL',       secretRef: 'redis-url' }
            { name: 'UPSTASH_REDIS_REST_TOKEN',     secretRef: 'redis-token' }
            { name: 'AZURE_OPENAI_ENDPOINT',        secretRef: 'openai-endpoint' }
            { name: 'AZURE_OPENAI_API_KEY',         secretRef: 'openai-key' }
            { name: 'AZURE_OPENAI_API_VERSION',     value: azureOpenAIApiVersion }
            { name: 'MODEL_CHAT_FAST',              value: modelChatFast }
            { name: 'MODEL_CHAT_THINKING',          value: modelChatThinking }
            { name: 'MODEL_EMBEDDING',              value: modelEmbedding }
            { name: 'MAIN_BACKEND_URL',             value: mainBackendInternal }
            { name: 'AI_SERVICE_URL',               value: aiServiceInternal }
            { name: 'APP_ENV',                      value: 'production' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }   // Exactly one beat scheduler
    }
  }
}

// ── frontend ──────────────────────────────────────────────────────────────────

resource frontend 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'hamroguru-frontend'
  location: location
  dependsOn: [acrPullAssignment, mainBackend]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    environmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 80
        transport: 'http'
      }
      registries: [{ server: '${acrName}.azurecr.io', identity: identity.id }]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${registry}/hamroguru-frontend:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            // nginx uses the public FQDN — its resolver doesn't apply K8s search domains
            { name: 'MAIN_BACKEND_URL', value: mainBackendPublic }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output frontendUrl string = 'https://hamroguru-frontend.${containerEnv.properties.defaultDomain}'
output mainBackendUrl string = 'https://hamroguru-main-backend.${containerEnv.properties.defaultDomain}'
output environmentDomain string = containerEnv.properties.defaultDomain
