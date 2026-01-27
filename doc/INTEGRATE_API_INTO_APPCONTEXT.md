# Integrating API into AppContext - Implementation Guide

## Overview

This document outlines the steps to integrate API repositories into AppContext so that when a user is authenticated, data is loaded from the API instead of the local database.

## Current Status

✅ Created:
- `AppStateApiService` - Service to load/save state from API
- API repositories for Accounts, Contacts, Transactions

⏳ Next Steps:
- Update AppContext initialization to check authentication
- Load from API when authenticated
- Save to API when authenticated
- Update reducer actions to sync with API

## Implementation Steps

### Step 1: Add useAuth Hook to AppContext

```typescript
import { useAuth } from './AuthContext';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useAuth();
    // ... rest of code
}
```

### Step 2: Update Initialization to Load from API

In the initialization useEffect, check if user is authenticated:

```typescript
if (isAuthenticated) {
    // Load from API
    const apiService = getAppStateApiService();
    const apiState = await apiService.loadState();
    // Merge with current state
    setStoredState(prev => ({
        ...prev,
        accounts: apiState.accounts || prev.accounts,
        contacts: apiState.contacts || prev.contacts,
        transactions: apiState.transactions || prev.transactions,
    }));
} else {
    // Load from local database (existing code)
}
```

### Step 3: Update Reducer Actions to Save to API

For actions like ADD_ACCOUNT, UPDATE_ACCOUNT, DELETE_ACCOUNT:

```typescript
case 'ADD_ACCOUNT': {
    const account = action.payload;
    // Save to API if authenticated
    if (isAuthenticated) {
        const apiService = getAppStateApiService();
        apiService.saveAccount(account).catch(err => {
            console.error('Failed to save account to API:', err);
        });
    }
    return { ...state, accounts: [...state.accounts, account] };
}
```

### Step 4: Handle Loading States

Show loading indicators when fetching from API:

```typescript
const [isLoadingFromApi, setIsLoadingFromApi] = useState(false);

if (isAuthenticated) {
    setIsLoadingFromApi(true);
    try {
        const apiState = await apiService.loadState();
        // ... update state
    } finally {
        setIsLoadingFromApi(false);
    }
}
```

## Testing

1. **Test with Authentication:**
   - Login to app
   - Verify data loads from API
   - Create/update/delete entities
   - Verify changes sync to API

2. **Test without Authentication:**
   - Don't login
   - Verify data loads from local database
   - Verify app works normally

3. **Test Error Handling:**
   - Disconnect from network
   - Verify graceful fallback
   - Show user-friendly error messages

## Notes

- Both systems can coexist
- API takes precedence when authenticated
- Local database is fallback for offline mode
- Gradually migrate more entities as API endpoints are created

