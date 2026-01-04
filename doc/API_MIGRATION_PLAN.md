# API Migration Plan

## Overview

This document outlines the plan to migrate the client application from direct SQLite database access to using the cloud-based API.

## Current Status

✅ **Completed:**
- Backend API server with PostgreSQL
- Authentication system (login, registration, license activation)
- API endpoints for: Accounts, Contacts, Transactions, Categories, Projects, Buildings, Properties, Units, Invoices, Bills, Budgets, Rental Agreements, Project Agreements, Contracts
- API repositories for all entities
- API client service
- AuthContext integration
- AppContext updated to load from API and save to API when authenticated
- Deployment configuration for Render cloud

⏳ **Pending:**
- Update all components to use API repositories (in progress - AppContext handles most)
- Data migration from SQLite to PostgreSQL (manual process)

## Migration Strategy

### Phase 1: Core Entities (Current)
Create API repositories for the most commonly used entities:
- ✅ Accounts
- ✅ Contacts  
- ✅ Transactions

### Phase 2: Additional API Endpoints ✅
Create backend API endpoints for remaining entities:
- ✅ Categories
- ✅ Projects
- ✅ Buildings
- ✅ Properties
- ✅ Units
- ✅ Invoices
- ✅ Bills
- ✅ Budgets
- ✅ Rental Agreements
- ✅ Project Agreements
- ✅ Contracts

### Phase 3: API Repositories ✅
Create API repositories for all entities once endpoints are available.
- ✅ All repositories created and exported
- ✅ AppStateApiService updated with all repositories

### Phase 4: AppContext Migration ✅
Update `AppContext` to:
- ✅ Load data from API instead of local database (when authenticated)
- ✅ Save changes via API instead of local database (when authenticated)
- ✅ Handle loading states
- ✅ Handle errors gracefully (fallback to local database)

### Phase 5: Component Updates
Update all components to:
- Use API repositories instead of direct database access
- Handle async operations properly
- Show loading states
- Handle errors

## API Repository Pattern

All API repositories follow this pattern:

```typescript
export class EntityApiRepository {
  async findAll(): Promise<Entity[]>
  async findById(id: string): Promise<Entity | null>
  async create(entity: Partial<Entity>): Promise<Entity>
  async update(id: string, entity: Partial<Entity>): Promise<Entity>
  async delete(id: string): Promise<void>
  async exists(id: string): Promise<boolean>
}
```

## Migration Steps

### Step 1: Create API Endpoints (Backend)
For each entity, create:
- `GET /api/entity` - List all
- `GET /api/entity/:id` - Get one
- `POST /api/entity` - Create
- `PUT /api/entity/:id` - Update
- `DELETE /api/entity/:id` - Delete

### Step 2: Create API Repository (Frontend)
Create repository in `services/api/repositories/entityApi.ts`

### Step 3: Update AppContext
Replace direct database calls with API calls:
```typescript
// Before:
const accounts = this.accountsRepo.findAll();

// After:
const accountsRepo = new AccountsApiRepository();
const accounts = await accountsRepo.findAll();
```

### Step 4: Update Components
Replace state updates with API calls:
```typescript
// Before:
dispatch({ type: 'ADD_ACCOUNT', payload: newAccount });

// After:
const accountsRepo = new AccountsApiRepository();
const savedAccount = await accountsRepo.create(newAccount);
dispatch({ type: 'ADD_ACCOUNT', payload: savedAccount });
```

## Testing Strategy

For each migrated entity:
1. Test CRUD operations (Create, Read, Update, Delete)
2. Test error handling (network errors, validation errors)
3. Test loading states
4. Test data persistence across page refreshes
5. Test multi-tenant isolation

## Rollback Plan

If issues arise:
1. Keep old repositories available
2. Use feature flag to switch between API and database
3. Gradually migrate entity by entity
4. Test thoroughly before moving to next entity

## Next Steps

1. ✅ Create API repositories for Accounts, Contacts, Transactions
2. ✅ Create backend API endpoints for Categories, Projects, etc.
3. ✅ Create API repositories for remaining entities
4. ✅ Update AppContext to use API repositories
5. ✅ Create deployment configuration for Render
6. ⏳ Deploy to Render cloud
7. ⏳ Test in production environment
8. ⏳ Migrate existing SQLite data to PostgreSQL (manual process)

## Notes

- Both systems can coexist during migration
- Use feature flags to gradually enable API usage
- Monitor error rates and performance
- Keep SQLite as fallback for offline mode (future)

