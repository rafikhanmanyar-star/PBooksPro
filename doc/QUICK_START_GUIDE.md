# Quick Start Guide - Enhanced Ledger

## 🚀 Getting Started in 60 Seconds

### 1. Open the Ledger
Navigate to **"General Ledger"** in the sidebar. The Enhanced Ledger loads automatically.

### 2. Understand the Layout
```
┌─────────────────────────────────────────────────────────────┐
│  [Search Box]         [Filter] [Export] [Import]            │ ← Toolbar
├─────────────────────────────────────────────────────────────┤
│  📊 Financial Summary Cards (6 cards showing totals)        │ ← Summary
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │ DATE │ TYPE │ DESCRIPTION │ ACCOUNT │ CATEGORY │ ... │  │ ← Fixed Header
│  ├───────────────────────────────────────────────────────┤  │
│  │  14  │ INC  │ Payment     │ Cash    │ Sales   │ ... │  │
│  │  15  │ EXP  │ Rent        │ Bank    │ Rent    │ ... │  │ ← Scrollable
│  │  16  │ TRX  │ Transfer    │ Bank→   │ -       │ ... │  │    Body
│  │  ... │ ...  │ ...         │ ...     │ ...     │ ... │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3. Try These Features (30 seconds each)

#### 🔍 Quick Search (30 sec)
1. Type anything in the search box at the top
2. Results filter instantly
3. Searches: descriptions, accounts, contacts, amounts, references

#### 🎯 Click a Transaction (30 sec)
1. Click any row in the table
2. Drawer slides in from right
3. Shows all transaction details
4. Click **Edit**, **Delete**, or **Print**

#### 🔽 Apply Filters (30 sec)
1. Click the **Filter** button (has badge showing active filters)
2. Set any filters: date range, type, account, category, etc.
3. Click **"Apply Filters"**
4. Table updates instantly

#### 🔄 Sort Data (30 sec)
1. Click any column header (Date, Type, Amount, etc.)
2. Data sorts instantly
3. Click again to reverse sort direction
4. Look for the arrow (↑↓) showing current sort

#### 📊 View Summaries (30 sec)
1. Look at the 6 summary cards at the top
2. **Green** = Income, **Red** = Expense, **Blue** = Transfer
3. Updates automatically when you apply filters
4. Always shows current state of visible data

#### 📦 Expand Batches (30 sec)
1. Look for rows with a **►** icon and colored left border
2. Click the **►** to expand
3. See all child transactions in a nested table
4. Click any child to view its details

---

## 🎨 Visual Legend

### Colors
- 🟢 **Green** = Income (money coming in)
- 🔴 **Red** = Expense (money going out)
- 🔵 **Blue** = Transfer (moving between accounts)
- 🟣 **Purple** = Loan (loan transactions)

### Icons
- 🔍 **Search** - Quick search box
- 🔽 **Filter** - Advanced filtering
- 📤 **Export** - Download to Excel
- 📥 **Import** - Upload data
- ✏️ **Edit** - Modify transaction
- 🗑️ **Delete** - Remove transaction
- 🖨️ **Print** - Print transaction
- ► **Expand** - Show batch children

### Badges
- 🔴 **Red badge on filter** = Active filters (shows count)
- 🟢 **Green border on row** = Batch transaction
- 🔵 **Blue nested table** = Batch children

---

## 💡 Power User Tips

### Tip 1: Keyboard Shortcuts (Coming Soon)
- `Ctrl/Cmd + F` - Focus search
- `Ctrl/Cmd + K` - Open filters
- `Escape` - Close drawer/filters
- `Arrow keys` - Navigate rows

### Tip 2: Combine Filters for Deep Analysis
```
Example: "Show me all expenses over $500 to vendors in December"
1. Set date range: Dec 1 - Dec 31
2. Type: Expense
3. Min Amount: 500
4. Contact: Select vendor
5. Apply Filters
```

### Tip 3: Use Grouping for Insights
```
Example: "How much did I spend per category last month?"
1. Set date range: Last month
2. Type: Expense
3. Group By: Category
4. See breakdown with totals
```

### Tip 4: Track Running Balance
- The **Balance** column (far right) is always visible
- Sticky column stays visible while scrolling
- Shows cumulative balance after each transaction
- Green = positive, Red = negative

### Tip 5: Export Filtered Data
```
Example: "Export all vendor payments from Q1"
1. Set date range: Q1 (Jan 1 - Mar 31)
2. Type: Expense
3. Contact: Select vendor
4. Apply Filters
5. Click Export → Downloads only filtered data
```

---

## 🎯 Common Tasks

### Task: Find a Transaction
**Method 1: Search**
1. Type description/amount in search box
2. Click the matching row

**Method 2: Filter + Sort**
1. Set date range (if known)
2. Sort by amount (if searching by amount)
3. Scroll to find it

**Method 3: Group**
1. Group by Account/Contact/Category
2. Look in the relevant group

### Task: Edit a Transaction
1. Click the row → Drawer opens
2. Click **"Edit"** button
3. Make changes in the form
4. Save

### Task: See Monthly Spending
1. Set date range: First to last day of month
2. Type: Expense
3. Look at summary cards at top
4. Or Group By: Category to see breakdown

### Task: Reconcile an Account
1. Filter by Account
2. Sort by Date
3. Check running balance column
4. Export for records

### Task: Find All Transactions with a Vendor
1. Filter by Contact: Select vendor
2. View all transactions
3. Check summary for total amount
4. Export if needed

---

## 🐛 Troubleshooting

### Problem: Can't find a transaction
**Solution**: Clear all filters first (click Filter → Clear All)

### Problem: Balance seems wrong
**Solution**: Check if filters are active (badge on filter button). Clear filters to see full balance.

### Problem: Table is too wide
**Solution**: Scroll horizontally. Date and Balance columns stay visible (sticky).

### Problem: Drawer won't close
**Solution**: Click the X button, click outside the drawer, or press Escape.

### Problem: Slow performance
**Solution**: Apply date range filter to reduce visible data. The system handles 10,000+ transactions but filters help.

---

## 📱 Mobile Tips

### For Tablet
- Use two-finger scroll for horizontal scrolling
- Tap once to open drawer
- Use landscape mode for better table view

### For Phone
- Horizontal scrolling required
- Summary cards stack vertically (2 columns)
- Drawer becomes full-screen
- Larger touch targets for easy tapping

---

## 🎓 Learning Path

### Beginner (Day 1)
- ✅ Open ledger
- ✅ Search for transactions
- ✅ Click rows to view details
- ✅ Understand summary cards

### Intermediate (Week 1)
- ✅ Apply filters
- ✅ Sort columns
- ✅ Edit/Delete transactions
- ✅ Group data
- ✅ Export to Excel

### Advanced (Month 1)
- ✅ Combine multiple filters
- ✅ Use grouping for analysis
- ✅ Track running balance
- ✅ Efficient workflows
- ✅ Monthly reconciliation

---

## 📊 Example Workflows

### Workflow 1: Monthly Review
```
1. Set date range to current month
2. Group by Type
3. Review income vs expense in summaries
4. Group by Category to see spending breakdown
5. Export for records
```

### Workflow 2: Vendor Analysis
```
1. Filter by Contact (select vendor)
2. Set date range to last quarter
3. Sort by Date
4. Review all transactions
5. Check total in summary card
6. Export for vendor records
```

### Workflow 3: Budget Tracking
```
1. Filter by Category (e.g., "Marketing")
2. Set date range to current month
3. Check total expense in summary
4. Compare with budget
5. Export for budget report
```

### Workflow 4: Account Reconciliation
```
1. Filter by Account
2. Sort by Date (ascending)
3. Check running balance column
4. Match with bank statement
5. Edit any discrepancies
6. Export reconciliation report
```

---

## ✅ Quick Reference

| Want to... | Do this... |
|-----------|-----------|
| Search | Type in search box at top |
| Filter | Click filter button, set filters, apply |
| Sort | Click column header |
| View details | Click row |
| Edit | Click row → Edit button |
| Delete | Click row → Delete button |
| Print | Click row → Print button |
| Export | Click Export button in toolbar |
| Import | Click Import button in toolbar |
| Group | Open filters → Set "Group By" |
| Clear filters | Open filters → Clear All |
| Expand batch | Click ► icon in row |
| See balance | Look at right sticky column |
| See totals | Look at summary cards at top |

---

## 🎉 You're Ready!

With this guide, you can now use **all the major features** of the Enhanced Ledger. Explore, experiment, and discover even more capabilities as you use it daily!

**Happy ledger-ing! 📊✨**

---

## 📚 More Resources

- **Full Documentation**: [ENHANCED_LEDGER.md](./ENHANCED_LEDGER.md)
- **Migration Guide**: [LEDGER_MIGRATION_GUIDE.md](./LEDGER_MIGRATION_GUIDE.md)
- **Summary**: [ENHANCED_LEDGER_SUMMARY.md](../ENHANCED_LEDGER_SUMMARY.md)

