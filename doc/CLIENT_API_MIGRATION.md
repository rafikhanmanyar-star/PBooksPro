# Client API Migration Guide

## Overview

This document describes the changes made to migrate the client application from direct SQLite database access to using the cloud-based API.

## What's Been Implemented

### 1. API Client Service (`services/api/client.ts`)
- Centralized HTTP client for API communication
- Handles authentication tokens and tenant ID
- Automatic error handling and network error detection
- Singleton pattern for easy access throughout the app

### 2. Authentication Context (`context/AuthContext.tsx`)
- Manages tenant authentication state
- Provides login, registration, and license activation methods
- Handles JWT token storage and validation
- Checks license status on app load

### 3. Authentication Components
- **`components/auth/CloudLoginPage.tsx`**: New cloud-based login page with:
  - Tenant lookup by email/company name
  - Direct tenant ID input
  - Username/password login
  - Links to registration and license activation

- **`components/auth/TenantRegistration.tsx`**: Tenant self-registration with free trial

- **`components/auth/LicenseActivation.tsx`**: License key activation interface

### 4. Backend API Updates
- Added `/api/auth/lookup-tenant` endpoint for public tenant lookup
- Existing endpoints support tenant context via middleware

## What Still Needs to Be Done

### High Priority

1. **Update App.tsx to Use AuthContext**
   - Wrap app with `AuthProvider`
   - Show `CloudLoginPage` when not authenticated
   - Show main app when authenticated

2. **Create API-Based Repositories**
   - Replace direct database calls with API calls
   - Create API adapters for:
     - Accounts
     - Contacts
     - Transactions
     - Invoices
     - Bills
     - Projects
     - Buildings
     - Properties
     - Units
     - And all other entities

3. **Update AppContext**
   - Load data from API instead of local database
   - Save changes via API instead of local database
   - Handle offline mode (optional, for future)

4. **Complete API Routes**
   - Ensure all entities have CRUD endpoints
   - Add bulk operations where needed
   - Add search/filter capabilities

### Medium Priority

1. **Error Handling**
   - Handle API errors gracefully
   - Show user-friendly error messages
   - Retry logic for network failures

2. **Loading States**
   - Show loading indicators during API calls
   - Optimistic updates where appropriate

3. **Caching**
   - Cache API responses locally
   - Invalidate cache on updates
   - Sync local cache with server

4. **Data Migration**
   - Script to export SQLite data
   - Import to PostgreSQL with tenant mapping
   - Verify data integrity

### Low Priority

1. **Offline Support**
   - Queue operations when offline
   - Sync when connection restored

2. **Real-time Updates**
   - WebSocket support for live updates
   - Notifications for changes

3. **Performance Optimization**
   - Request batching
   - Pagination for large datasets
   - Lazy loading

## Migration Steps

### Step 1: Update Entry Point

Update `index.tsx` to include `AuthProvider`:

```tsx
import { AuthProvider } from './context/AuthContext';

// In the render section:
<AuthProvider>
  <AppProvider>
    {/* ... other providers ... */}
    <App />
  </AppProvider>
</AuthProvider>
```

### Step 2: Update App.tsx

Replace `LoginPage` with `CloudLoginPage` and add authentication check:

```tsx
import { useAuth } from './context/AuthContext';
import CloudLoginPage from './components/auth/CloudLoginPage';

const App: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <Loading />;
  }
  
  if (!isAuthenticated) {
    return <CloudLoginPage />;
  }
  
  // ... rest of app
};
```

### Step 3: Create API Repository Adapters

For each entity type, create an API adapter:

```typescript
// services/api/repositories/accountsApi.ts
import { apiClient } from '../client';
import { Account } from '../../../types';

export class AccountsApiRepository {
  async findAll(): Promise<Account[]> {
    return apiClient.get<Account[]>('/api/accounts');
  }
  
  async findById(id: string): Promise<Account | null> {
    return apiClient.get<Account>(`/api/accounts/${id}`);
  }
  
  async create(account: Partial<Account>): Promise<Account> {
    return apiClient.post<Account>('/api/accounts', account);
  }
  
  async update(id: string, account: Partial<Account>): Promise<Account> {
    return apiClient.put<Account>(`/api/accounts/${id}`, account);
  }
  
  async delete(id: string): Promise<void> {
    return apiClient.delete(`/api/accounts/${id}`);
  }
}
```

### Step 4: Update AppContext

Replace database service calls with API calls:

```typescript
// In AppContext.tsx
import { AccountsApiRepository } from '../services/api/repositories/accountsApi';

// Replace:
// const accounts = this.accountsRepo.findAll();

// With:
// const accountsRepo = new AccountsApiRepository();
// const accounts = await accountsRepo.findAll();
```

### Step 5: Update All Components

Replace direct state updates with API calls:

```typescript
// Before:
dispatch({ type: 'ADD_ACCOUNT', payload: newAccount });

// After:
const accountsRepo = new AccountsApiRepository();
const savedAccount = await accountsRepo.create(newAccount);
dispatch({ type: 'ADD_ACCOUNT', payload: savedAccount });
```

## Testing Checklist

- [ ] Login with existing tenant
- [ ] Register new tenant
- [ ] Activate license key
- [ ] View all entities (accounts, contacts, transactions, etc.)
- [ ] Create new entities
- [ ] Update existing entities
- [ ] Delete entities
- [ ] Search/filter functionality
- [ ] Error handling (network errors, validation errors)
- [ ] Loading states
- [ ] License expiry handling

## Environment Variables

Add to `.env` or environment configuration:

```
VITE_API_URL=http://localhost:3000
```

For production, update to your Render backend URL.

## Notes

- The old SQLite database code is still present but will be gradually replaced
- Both systems can coexist during migration
- Consider keeping SQLite as a fallback for offline mode (future enhancement)
- All API calls require authentication token
- Tenant ID is automatically included in all requests via middleware

## Next Steps

1. Complete the high-priority tasks listed above
2. Test thoroughly with real data
3. Deploy to staging environment
4. Migrate existing SQLite data to PostgreSQL
5. Deploy to production

