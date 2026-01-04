# Pre-Deployment Checklist

Complete these steps before deploying to Render cloud:

## ✅ Completed Tasks

- [x] All API endpoints created for core entities
- [x] All API repositories created
- [x] AppContext updated to use API repositories
- [x] AppContext saves to API when authenticated
- [x] Database schema updated with all tables
- [x] Deployment configuration (render.yaml) ready
- [x] Migration script created

## 🔍 Pre-Deployment Verification

### 1. Test API Endpoints Locally

```bash
# Start the server locally
cd server
npm run dev

# Test endpoints
curl http://localhost:3000/health
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"admin123"}'
```

### 2. Verify Database Schema

```bash
# Run migrations locally
cd server
npm run migrate

# Verify tables exist
psql $DATABASE_URL -c "\dt"
```

### 3. Test API Repositories

- [ ] Accounts CRUD operations
- [ ] Contacts CRUD operations
- [ ] Transactions CRUD operations
- [ ] Categories CRUD operations
- [ ] Projects CRUD operations
- [ ] Buildings CRUD operations
- [ ] Properties CRUD operations
- [ ] Units CRUD operations
- [ ] Invoices CRUD operations
- [ ] Bills CRUD operations
- [ ] Budgets CRUD operations
- [ ] Rental Agreements CRUD operations
- [ ] Project Agreements CRUD operations
- [ ] Contracts CRUD operations

### 4. Environment Variables

Ensure these are set in Render:
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `JWT_SECRET` - Strong random string
- [ ] `CORS_ORIGIN` - Comma-separated allowed origins
- [ ] `NODE_ENV` - Set to `production`
- [ ] `PORT` - Set to `3000` (or let Render auto-assign)

### 5. Security

- [ ] JWT_SECRET is strong and unique
- [ ] Default admin password will be changed
- [ ] CORS origins are restricted
- [ ] No sensitive data in code
- [ ] All secrets in environment variables

### 6. Database

- [ ] PostgreSQL database created on Render
- [ ] Database URL accessible
- [ ] Migration script tested
- [ ] Admin user creation verified

### 7. Build Process

- [ ] `npm run build` completes successfully
- [ ] No TypeScript errors
- [ ] All dependencies installed
- [ ] Output files generated correctly

## 🚀 Deployment Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Connect to Render**
   - Go to Render Dashboard
   - New → Blueprint (if using render.yaml)
   - Or manually create services

3. **Monitor Deployment**
   - Watch build logs
   - Check for errors
   - Verify services start correctly

4. **Post-Deployment**
   - Test API endpoints
   - Create admin user
   - Change default password
   - Test frontend connection
   - Verify data persistence

## 📝 Notes

- Migrations run automatically on server startup
- Admin user is created automatically if it doesn't exist
- Default credentials: Admin / admin123 (CHANGE IMMEDIATELY!)
- Free tier databases may pause after inactivity
- Consider upgrading to paid plan for production

## 🐛 Common Issues

1. **Database connection fails**
   - Check DATABASE_URL format
   - Verify database is not paused
   - Check network connectivity

2. **Build fails**
   - Check Node.js version
   - Verify all dependencies
   - Check TypeScript errors

3. **API not accessible**
   - Check CORS settings
   - Verify service is running
   - Check firewall rules

4. **Migrations fail**
   - Schema might already exist (safe to ignore)
   - Check database permissions
   - Verify SQL syntax

