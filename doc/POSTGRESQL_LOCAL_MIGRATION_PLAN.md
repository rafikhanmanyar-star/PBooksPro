# Database Architecture Plan - Simplified

## Overview

This document outlines the database architecture for the application with a simplified approach that avoids local PostgreSQL setup:

- **Desktop/Web**: Local SQLite (via sql.js) with offline support and sync to cloud PostgreSQL via API
- **Mobile (PWA)**: Cloud PostgreSQL only (via API, no local database, requires internet connection)

## Platform-Specific Strategy

### Desktop/Web Browsers
- **Local Database**: SQLite (via sql.js - runs in browser)
- **Offline Support**: Yes (local SQLite + sync queue)
- **Cloud Sync**: Bidirectional sync when online (via API)
- **Multi-User Locking**: Yes (when offline)
- **No Local API Server Required**: SQLite runs directly in browser

### Mobile Devices (PWA)
- **Local Database**: None (PostgreSQL cannot run on mobile, SQLite not needed)
- **Offline Support**: No (requires internet connection)
- **Cloud Database**: Direct connection to cloud PostgreSQL via API
- **Multi-User Locking**: Yes (via cloud-based locking)

## Architecture Decision

### Selected Approach: SQLite for Local, PostgreSQL for Cloud (Simplified)

**Why this approach:**
- **No local API server needed**: SQLite runs directly in browser via sql.js
- **Simpler setup**: No PostgreSQL installation required for users
- **Works everywhere**: SQLite works in all browsers without additional setup
- **Offline support**: Full offline capability on desktop
- **Cloud sync**: Seamless sync to cloud PostgreSQL via existing API
- **Mobile friendly**: Mobile uses cloud only (no local DB needed)

**Why not local PostgreSQL:**
- Requires a local Node.js server and PostgreSQL installation
- Complex setup for end users
- PostgreSQL cannot run directly in browser
- Unnecessary complexity for the local use case

## Architecture

**Desktop/Web Platform:**
```
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (React Components, Hooks, Context)     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   Platform Detection & DB Selection     │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────┐
│ Local       │  │   Cloud      │
│ SQLite      │  │ PostgreSQL   │
│ (sql.js)    │  │  (via API)   │
│ (Primary)   │  │   (Sync)     │
└─────────────┘  └──────────────┘
```

**Mobile Platform (PWA):**
```
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (React Components, Hooks, Context)     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   Cloud PostgreSQL Service (Direct)     │
│   (No Local Database - Internet Required)│
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────┐
│   Cloud     │
│ PostgreSQL  │
│ (Staging/   │
│ Production) │
└─────────────┘
```

## Implementation Notes

### Platform Detection
- Use a platform detection utility to determine desktop vs mobile.
- Desktop uses local SQLite; mobile uses cloud API only.

### Local SQLite
- Uses `sql.js` in the browser.
- Provides offline capability and local persistence.
- Sync queue handles changes while offline.

### Cloud PostgreSQL
- Accessed via API layer.
- Used for sync (desktop) and primary storage (mobile).

## Status

This plan reflects the current simplified strategy. Any future exploration of local PostgreSQL should be captured in a separate document to avoid mixing approaches.
