---
name: Organization Email-Based Login Flow
overview: Implement two-step login flow where users first enter organization email to find matching tenants, then select organization and enter username/password. This replaces unreliable localStorage tenant_id lookup with a user-driven, privacy-friendly approach.
todos:
  - id: add-tenant-lookup-endpoint
    content: Create POST /auth/lookup-tenants endpoint in server/api/routes/auth.ts that accepts organization email and returns matching tenants (without revealing sensitive data)
    status: completed
  - id: update-login-endpoint
    content: Update /smart-login endpoint in server/api/routes/auth.ts to accept tenantId (from step 1 selection) along with username and password for final authentication
    status: completed
  - id: create-two-step-login-ui
    content: "Refactor CloudLoginPage.tsx to implement two-step flow: Step 1 (organization email lookup) and Step 2 (organization selection + username/password)"
    status: completed
  - id: update-auth-context
    content: Add lookupTenants function in context/AuthContext.tsx for step 1, and update smartLogin to work with selected tenantId from step 2
    status: completed
    dependencies:
      - add-tenant-lookup-endpoint
      - update-login-endpoint
  - id: add-loading-states
    content: Add proper loading states and error handling for both steps of the login flow in CloudLoginPage.tsx
    status: completed
  - id: remove-localstorage-tenantid
    content: Remove dependency on localStorage tenant_id for login (keep it only for post-login session management)
    status: completed
---

# Organization Email-Based Login Flow

## Problem

Current login relies on `tenant_id` from localStorage, which can be stale/wrong, causing login failures. Users cannot see all tenants (privacy), so we need a user-driven tenant identification mechanism.

## Solution

Implement a **two-step login flow** using organization email lookup:

1. **Step 1**: User enters organization email → System shows matching tenant(s)
2. **Step 2**: User selects organization → Enters username and password

This approach:

- ✅ Privacy-friendly (only shows tenants matching the email)
- ✅ No dependency on localStorage for tenant identification
- ✅ Uses existing `tenants.email` field (UNIQUE constraint)
- ✅ Clear, intuitive user flow
- ✅ Handles multiple tenants with same email gracefully

## Architecture Changes

### 1. Database Schema

- **Already exists**: `tenants.email` field (UNIQUE constraint, NOT NULL)
- **No migration needed** - uses existing data

### 2. Backend API Changes

#### File: `server/api/routes/auth.ts`

**New Endpoint: POST `/auth/lookup-tenants`**

- **Purpose**: Step 1 - Find tenants by organization email
- **Request**: `{ organizationEmail: string }`
- **Response**: 
  ```typescript
      {
        tenants: Array<{
          id: string;
          name: string;
          company_name: string;
          email: string;
          // No sensitive data (license info, etc.)
        }>
      }
  ```




- **Logic**:
- Case-insensitive email lookup: `SELECT * FROM tenants WHERE LOWER(email) = LOWER($1)`
- Return only safe fields (id, name, company_name, email)
- Return empty array if no match (don't reveal if email exists for security)
- Rate limit: Prevent email enumeration attacks

**Updated Endpoint: POST `/auth/smart-login`**

- **Purpose**: Step 2 - Authenticate with selected tenant
- **Request**: `{ username: string, password: string, tenantId: string }`
- **Changes**:
- Make `tenantId` **required** (no longer optional/from localStorage)
- Remove auto-resolution logic (tenant is already selected)
- Simplified flow: Verify tenant exists → Find user in tenant → Verify password
- **Response**: Same as current (token, user, tenant)

#### Security Considerations

- Rate limit `/auth/lookup-tenants` to prevent email enumeration
- Don't reveal if email exists (return empty array for invalid emails)
- Validate email format before querying

### 3. Frontend Changes

#### File: `components/auth/CloudLoginPage.tsx`

**Two-Step UI Flow:Step 1: Organization Email Lookup**

```tsx
┌─────────────────────────────────────┐
│  Find Your Organization            │
├─────────────────────────────────────┤
│  Organization Email:                │
│  [admin@company.com        ]        │
│                                     │
│  [Next →]                          │
└─────────────────────────────────────┘
```

**Step 2: Select Organization + Login**

```tsx
┌─────────────────────────────────────┐
│  Sign In to [Company Name]          │
├─────────────────────────────────────┤
│  Organization:                       │
│  ○ Company Name (admin@company.com) │
│                                     │
│  Username:                          │
│  [john.doe            ]             │
│                                     │
│  Password:                          │
│  [********            ]             │
│                                     │
│  [← Back]  [Sign In]               │
└─────────────────────────────────────┘
```

**Implementation Details:**

- State management for current step (`'lookup' | 'login'`)
- Store organization email and selected tenant between steps
- Show loading state during tenant lookup
- Handle multiple tenants (show selection list)
- Handle single tenant (auto-select, show confirmation)
- Handle no tenants found (error message, allow retry)
- "Back" button to return to step 1

#### File: `context/AuthContext.tsx`

**New Function: `lookupTenants(organizationEmail: string)`**

```typescript
lookupTenants: (organizationEmail: string) => Promise<{
  tenants: Array<{
    id: string;
    name: string;
    company_name: string;
    email: string;
  }>
}>
```

**Updated Function: `smartLogin(username, password, tenantId)`**

- Make `tenantId` required (no longer optional)
- Remove localStorage tenant_id dependency for login
- Keep localStorage for post-login session management only

### 4. User Experience Flow

```javascript
┌─────────────────────────────────────┐
│  STEP 1: Organization Email        │
│  admin@company.com                  │
│  [Next →]                          │
└─────────────────────────────────────┘
         │
         ▼ (API: POST /auth/lookup-tenants)
┌─────────────────────────────────────┐
│  Found 1 Organization:              │
│  ○ Acme Corporation                 │
│    admin@company.com                │
│                                     │
│  Username: [john.doe    ]          │
│  Password: [********    ]          │
│  [← Back]  [Sign In]               │
└─────────────────────────────────────┘
         │
         ▼ (API: POST /auth/smart-login)
┌─────────────────────────────────────┐
│  ✅ Login Successful                │
│  Redirecting to dashboard...        │
└─────────────────────────────────────┘
```

**Edge Cases:**

- **Multiple tenants found**: Show selection list with radio buttons
- **No tenants found**: Show error "No organization found with this email. Please check and try again."
- **Invalid email format**: Client-side validation before API call
- **Network error**: Show retry option

### 5. Backward Compatibility

- **Old flow**: If user has tenant_id in localStorage, we can skip step 1 (optional enhancement)
- **New flow**: Always use two-step process for new logins
- **Migration**: No data migration needed (uses existing tenant.email field)

## Implementation Steps

1. **Backend**: Create `/auth/lookup-tenants` endpoint
2. **Backend**: Update `/auth/smart-login` to require tenantId
3. **Frontend**: Refactor CloudLoginPage to two-step flow
4. **Frontend**: Add lookupTenants function to AuthContext
5. **Testing**: Test with single tenant, multiple tenants, no tenants, invalid email
6. **Security**: Add rate limiting for lookup endpoint

## Files to Modify

- `server/api/routes/auth.ts` - Add lookup-tenants endpoint, update smart-login
- `components/auth/CloudLoginPage.tsx` - Implement two-step UI flow
- `context/AuthContext.tsx` - Add lookupTenants function, update smartLogin
- `services/api/client.ts` - No changes (tenant_id still used post-login)

## Security Considerations

1. **Email Enumeration Prevention**:

- Rate limit `/auth/lookup-tenants` endpoint (e.g., 5 requests per IP per minute)
- Don't reveal if email exists (return empty array for invalid emails)
- Add CAPTCHA after multiple failed attempts (optional)

2. **Input Validation**:

- Validate email format on client and server
- Sanitize email input to prevent SQL injection
- Case-insensitive comparison (already handled by LOWER())

3. **Privacy**:

- Only return safe tenant fields (id, name, company_name, email)
- Don't expose license status, subscription details, etc.

4. **Session Management**:

- After successful login, tenant_id stored in localStorage is valid (from server)
- Clear stale tenant_id on logout

## Benefits Over Previous Approach

1. ✅ **No subdomain/alias field needed** - Uses existing tenant.email
2. ✅ **More intuitive** - Users know their organization email
3. ✅ **Privacy-friendly** - Only shows tenants matching entered email
4. ✅ **Handles edge cases** - Multiple tenants with same email shown for selection