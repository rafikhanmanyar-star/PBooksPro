# AI Coding Assistant Rules and Best Practices

This document outlines the rules and best practices for interacting with the AI coding assistant to avoid unnecessary code changes and ensure productive collaboration.

## Table of Contents
- [Current Mode: Ask Mode (Read-Only)](#current-mode-ask-mode-read-only)
- [Agent Mode Rules](#agent-mode-rules)
- [Rules I Follow](#rules-i-follow)
- [Best Practices for You](#best-practices-for-you)
- [How to Control Changes](#how-to-control-changes)
- [What I Will Do Right Now](#what-i-will-do-right-now)

---

## Current Mode: Ask Mode (Read-Only)

**Important:** You're currently in **Ask mode**, which means:
- ✅ I can read and analyze code
- ✅ I can search your codebase
- ✅ I can explain concepts
- ✅ I can show code examples (for you to review)
- ✅ I can answer questions

**I will NOT:**
- ❌ Edit any files
- ❌ Run commands
- ❌ Make changes automatically

**To apply changes:** Switch to **Agent mode** when you're ready for me to make edits.

---

## Agent Mode Rules

When you switch to **Agent mode**, I have the ability to make changes to your codebase. Here are the specific rules I follow in Agent mode:

### 1. Code Changes and File Operations

**I WILL:**
- ✅ Edit existing files when explicitly requested
- ✅ Create new files when asked to implement features
- ✅ Delete files only when explicitly requested
- ✅ Run terminal commands when needed for the task
- ✅ Make multiple related changes to complete a feature
- ✅ Fix linter errors I introduce (up to 3 attempts per file)

**I WILL NOT:**
- ❌ Make changes without explicit request
- ❌ Modify files outside the scope of your request
- ❌ Delete code without confirmation
- ❌ Run destructive commands without explicit permission
- ❌ Make changes to files you haven't asked me to touch

### 2. Reading and Understanding Before Changing

**Before making any changes, I will:**
- ✅ Read relevant files to understand the context
- ✅ Search the codebase to find related code
- ✅ Understand existing patterns and conventions
- ✅ Check for dependencies and relationships
- ✅ Verify the scope of changes needed

**I will gather information by:**
- Reading files you mention or that are clearly related
- Using semantic search to find relevant code
- Examining imports and dependencies
- Understanding the architecture before modifying

### 3. Making Code Changes

**When making edits, I will:**
- ✅ Preserve existing code style and formatting
- ✅ Maintain consistency with your codebase patterns
- ✅ Add necessary imports automatically
- ✅ Follow existing naming conventions
- ✅ Keep changes focused and minimal
- ✅ Add comments only if they add value

**I will avoid:**
- ❌ Changing code style unless asked
- ❌ Refactoring unrelated code
- ❌ Adding unnecessary dependencies
- ❌ Breaking existing functionality
- ❌ Making cosmetic changes without purpose

### 4. Error Handling and Linting

**If I introduce errors:**
- ✅ I'll fix linter errors I create (up to 3 attempts)
- ✅ I'll check for syntax errors after edits
- ✅ I'll verify the code compiles/runs if possible
- ✅ I'll read linter output to understand issues

**I will:**
- Fix errors in files I've edited
- Not loop more than 3 times on the same file
- Check linting after making changes
- Address only errors I've introduced

### 5. Terminal Commands

**I will run commands:**
- ✅ To install dependencies when adding features
- ✅ To build or test code when relevant
- ✅ To check status (git, npm, etc.) when needed
- ✅ To run scripts that are part of the workflow

**I will NOT:**
- ❌ Run destructive commands (rm -rf, etc.) without explicit request
- ❌ Run commands that require user interaction without non-interactive flags
- ❌ Run long-running processes in foreground (will use background mode)
- ❌ Run commands that modify system settings

### 6. Multi-Step Tasks

**For complex tasks, I will:**
- ✅ Create a todo list for tasks with 3+ steps
- ✅ Break down complex tasks into manageable steps
- ✅ Mark tasks as complete as I finish them
- ✅ Work on one task at a time
- ✅ Update progress as I go

**I will create todos for:**
- Complex multi-step implementations
- Non-trivial tasks requiring planning
- Tasks with multiple related changes
- Features that span multiple files

**I will NOT create todos for:**
- Simple single-step tasks
- Purely informational requests
- Tasks that are already straightforward

### 7. Batch Operations

**I will:**
- ✅ Make multiple related tool calls in parallel when possible
- ✅ Read multiple files simultaneously when needed
- ✅ Batch related edits efficiently
- ✅ Group similar operations together

**This helps:**
- Speed up the process
- Make related changes together
- Maintain consistency across changes

### 8. File Creation and Organization

**When creating new files, I will:**
- ✅ Follow your project's file structure
- ✅ Use appropriate file extensions and naming
- ✅ Place files in the correct directories
- ✅ Match existing patterns in your codebase

**I will NOT:**
- ❌ Create documentation files unless explicitly requested
- ❌ Create README files proactively
- ❌ Add files that don't serve a clear purpose

### 9. Communication During Changes

**I will:**
- ✅ Explain what I'm doing before making changes
- ✅ Describe the approach I'm taking
- ✅ Show what files I'm modifying
- ✅ Provide context for decisions

**I will NOT:**
- ❌ Make silent changes without explanation
- ❌ Hide what I'm doing
- ❌ Make changes without context

### 10. Respecting Your Codebase

**I will preserve:**
- ✅ Existing code patterns and conventions
- ✅ Current architecture and structure
- ✅ Existing functionality
- ✅ Your coding style and preferences

**I will maintain:**
- ✅ Backward compatibility when possible
- ✅ Existing API contracts
- ✅ Current data structures
- ✅ Established workflows

---

## Rules I Follow

### 1. Only Make Changes When Explicitly Requested
- I **never** change code unless you explicitly ask me to
- I **never** "fix" things I notice" unless you ask
- I **never** refactor or optimize code without permission

### 2. Ask Before Making Assumptions
- If something is unclear, I'll ask rather than guess
- I confirm intent before making major changes
- I verify understanding before proceeding

### 3. Explain Before Changing
- I explain what I'll change and why
- I show proposed changes before applying them
- I provide context for all modifications

### 4. Respect Your Codebase
- I don't change code style/formatting unless asked
- I don't remove code without confirmation
- I preserve existing patterns and conventions
- I maintain consistency with your codebase

---

## Best Practices for You

### To Avoid Unintended Changes

1. **Be Specific**
   - ✅ "Show me how to..." instead of "Fix this..."
   - ✅ "Explain..." instead of "Make it work..."
   - ✅ "What would happen if..." instead of "Change it so..."

2. **Use Questions**
   - ✅ "How does X work?" instead of "Make X work"
   - ✅ "Can you find..." instead of "Find and fix..."
   - ✅ "What is..." instead of "Update..."

3. **Review Before Applying**
   - I'll show code blocks you can review first
   - Take time to understand changes before applying
   - Ask questions if anything is unclear

4. **Use Ask Mode for Exploration**
   - Stay in Ask mode when exploring or learning
   - Switch to Agent mode only when ready to apply changes
   - Use Ask mode to understand before modifying

### Safe Phrases (Won't Trigger Changes)

These phrases are safe to use and will only result in explanations:

- "Explain how..."
- "Show me..."
- "What would happen if..."
- "Can you find..."
- "Help me understand..."
- "What is the purpose of..."
- "How does this work?"
- "Where is..."
- "Why does..."

### Phrases That Trigger Changes (In Agent Mode)

These phrases will cause me to make changes when in Agent mode:

- "Fix this..."
- "Implement..."
- "Add..."
- "Change..."
- "Update..."
- "Remove..."
- "Create..."
- "Modify..."
- "Refactor..."

**Note:** Even in Agent mode, I'll explain what I'm doing before making changes.

---

## How to Control Changes

### 1. Stay in Ask Mode for Exploration
- Perfect for understanding code
- Safe for asking questions
- No risk of unintended changes

### 2. Switch to Agent Mode Only When Ready
- Use when you want me to apply changes
- Review my explanations first
- Confirm before I proceed

### 3. Review Code Blocks Before Applying
- I'll show code in markdown blocks
- Review carefully before copying
- Ask questions if unclear

### 4. Be Explicit About Intent
- "Don't change anything, just explain..." - I'll only explain
- "Show me the code for..." - I'll show code, not change it
- "What would need to change to..." - I'll analyze, not modify

---

## What I Will Do Right Now

Since you're in **Ask mode**, I will:

✅ **Read and analyze code**
- Examine files you point to
- Understand your codebase structure
- Analyze relationships between components

✅ **Search your codebase**
- Find relevant code sections
- Locate specific functions or patterns
- Trace data flow and dependencies

✅ **Explain concepts**
- Clarify how things work
- Explain why code is structured a certain way
- Provide context and background

✅ **Show code examples**
- Display relevant code snippets
- Show how to implement something
- Provide code you can review and apply yourself

✅ **Answer questions**
- Technical questions about your code
- Best practices and recommendations
- Troubleshooting guidance

**I will NOT:**
- ❌ Edit any files
- ❌ Run terminal commands
- ❌ Make changes automatically
- ❌ Modify your codebase without permission

---

## Additional Guidelines

### When You Want Changes

1. **Be clear about scope**
   - "Add a function to..." (specific)
   - "Fix the bug in..." (targeted)
   - "Update the styling for..." (focused)

2. **Specify constraints**
   - "Don't change the API structure"
   - "Keep the existing format"
   - "Maintain backward compatibility"

3. **Request explanations**
   - "Explain why you're doing X"
   - "Show me what will change"
   - "Walk me through the changes"

### When You Want to Explore

1. **Ask open-ended questions**
   - "How does authentication work here?"
   - "What's the data flow for..."
   - "Where is X handled?"

2. **Request code reviews**
   - "Review this code"
   - "Find potential issues"
   - "Suggest improvements" (without implementing)

3. **Learn the codebase**
   - "Show me the main components"
   - "Explain the architecture"
   - "What are the key patterns?"

---

## Sample Prompts for Common Tasks

This section provides example prompts you can use when requesting changes. These examples demonstrate best practices for clear, specific requests.

### Database-Related Code Changes

#### Adding a New Table/Entity

**Good Examples:**
```
"Add a new 'notifications' table to the database schema with the following fields:
- id (primary key, auto-increment)
- user_id (foreign key to users table)
- message (text)
- read (boolean, default false)
- created_at (timestamp)

Also create the corresponding TypeScript types and API endpoints for CRUD operations."
```

```
"I need to add a 'project_notes' table. The table should:
- Link to the projects table via project_id
- Store note text, created_by user, and timestamps
- Include migration SQL file
- Update the TypeScript types file
- Add API endpoints in the server/api folder"
```

#### Modifying Existing Database Schema

**Good Examples:**
```
"Add a 'status' column to the 'invoices' table. The column should be:
- Type: VARCHAR(50)
- Default: 'pending'
- Not null
- Include a migration file
- Update the TypeScript Invoice type
- Update any related API endpoints that use invoices"
```

```
"Modify the 'transactions' table to add an optional 'reference_number' field.
Create a migration, update the TypeScript types, and ensure existing code
still works with this nullable field."
```

#### Database Query Changes

**Good Examples:**
```
"Update the getTransactions function in services/database/transactionService.ts
to include a filter by date range. Add optional startDate and endDate parameters
and modify the SQL query accordingly."
```

```
"Add a new database function to calculate total revenue for a specific project.
Include it in the projectService.ts file and create an API endpoint to expose it."
```

### Adding New Features/Options

#### Adding a New Feature Module

**Good Examples:**
```
"Add a new 'expense tracking' feature with the following:
1. Create a new Expense model/type
2. Add database table and migration
3. Create ExpenseService with CRUD operations
4. Add API endpoints in server/api/expenses.ts
5. Create a React component ExpensesPage.tsx in components/expenses/
6. Add route to the main App.tsx
7. Add menu item in the sidebar"
```

```
"I want to add a 'recurring payments' feature. This should:
- Allow users to set up recurring payment schedules
- Store schedule details in database
- Create a UI page to manage recurring payments
- Integrate with the existing payments system
- Follow the same patterns as the bills feature"
```

#### Adding Options to Existing Features

**Good Examples:**
```
"Add a 'payment method' option to the invoice creation form. 
The options should be: 'cash', 'bank_transfer', 'credit_card', 'other'.
Update the invoice type, database schema (add column), form component,
and display the payment method in the invoice list."
```

```
"Add filtering options to the transactions page. Allow users to filter by:
- Transaction type (income/expense)
- Date range
- Amount range
- Category

Update the TransactionsPage component and the API endpoint to support these filters."
```

#### Adding Settings/Configuration Options

**Good Examples:**
```
"Add a new setting in the settings page to enable/disable email notifications.
Store this in the user preferences table, add a toggle in SettingsPage.tsx,
and update the settings API to handle this preference."
```

```
"Add currency selection option to the settings. Allow users to choose from:
USD, EUR, GBP, PKR. Store the preference, update the settings UI,
and apply the currency formatting throughout the app where amounts are displayed."
```

### General Feature Addition Template

**Structure your request like this:**

```
"I want to add [FEATURE_NAME] that will:
1. [What it does - main purpose]
2. [Database changes needed - if any]
3. [New components/pages needed]
4. [API endpoints required]
5. [Integration points with existing features]
6. [Any specific requirements or constraints]

Please follow the existing patterns in the codebase and maintain consistency."
```

### Example: Complete Feature Request

**Example:**
```
"Add a 'project templates' feature that allows users to:
1. Create reusable project templates with predefined tasks and settings
2. Apply templates when creating new projects

Requirements:
- Create a 'project_templates' table with: id, name, description, user_id, template_data (JSON)
- Add migration file
- Create ProjectTemplate type in types.ts
- Add API endpoints: GET /api/templates, POST /api/templates, DELETE /api/templates/:id
- Create ProjectTemplatesPage component in components/projectManagement/
- Add 'Templates' option in the project management menu
- When creating a project, show option to 'Use Template'
- Follow the same UI patterns as the existing project management pages

Don't modify existing project creation flow, just add the template option as an enhancement."
```

### Example: Database Migration Request

**Example:**
```
"Create a database migration to:
1. Add 'archived' boolean column to 'projects' table (default false)
2. Add index on 'archived' column for performance
3. Add 'archived_at' timestamp column (nullable)
4. Update the Project TypeScript type
5. Update ProjectService to include archive/unarchive methods
6. Add 'Archive Project' button in the project details page

Ensure backward compatibility - existing projects should have archived=false."
```

### Example: Adding New Option to Existing Form

**Example:**
```
"Add a 'priority' field to the task creation form with options:
- Low
- Medium  
- High
- Urgent

Update:
- Task type definition
- Database schema (add priority column)
- TaskForm component
- TaskService to handle priority
- Task list to display priority badge
- Allow filtering/sorting by priority"
```

### Tips for Writing Effective Prompts

1. **Be Specific About Scope**
   - ✅ "Add a status field to invoices"
   - ❌ "Update invoices"

2. **List All Components Needed**
   - ✅ "Update the database schema, TypeScript types, API endpoint, and UI component"
   - ❌ "Add this feature"

3. **Specify Constraints**
   - ✅ "Don't modify existing API contracts"
   - ✅ "Maintain backward compatibility"
   - ✅ "Follow the same patterns as the bills feature"

4. **Mention Integration Points**
   - ✅ "Integrate with the existing authentication system"
   - ✅ "Use the same notification service"

5. **Request Explanations When Needed**
   - ✅ "Explain the approach before implementing"
   - ✅ "Show me what files will be modified"

---

## Summary

**Remember:**
- 🟢 **Ask Mode** = Safe exploration, no changes
- 🔵 **Agent Mode** = Ready to apply changes
- 📝 **Review** code blocks before applying
- ❓ **Ask questions** if anything is unclear
- 🎯 **Be specific** about what you want

**I'm here to help you understand and modify your codebase safely and effectively!**

---

*Last Updated: When this document was created*
*Mode: Ask Mode (Read-Only)*

