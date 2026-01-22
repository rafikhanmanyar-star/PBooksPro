import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();
const INSTALLMENT_PLAN_COLUMNS_TTL_MS = 5 * 60 * 1000;
let installmentPlanColumnsCache: { columns: Set<string>; loadedAt: number } | null = null;
let loggedMissingInstallmentPlanColumns = false;

const getInstallmentPlanColumns = async (db: ReturnType<typeof getDb>): Promise<Set<string>> => {
  if (installmentPlanColumnsCache && Date.now() - installmentPlanColumnsCache.loadedAt < INSTALLMENT_PLAN_COLUMNS_TTL_MS) {
    return installmentPlanColumnsCache.columns;
  }

  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'installment_plans'
       AND table_schema = current_schema()`
  );
  const columns = new Set(rows.map((row) => row.column_name));
  installmentPlanColumnsCache = { columns, loadedAt: Date.now() };
  return columns;
};

// GET all installment plans
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { projectId, leadId, unitId } = req.query;
    const currentUserId = req.user?.userId;
    
    // Privacy Logic: 
    // 1. Admins see everything
    // 2. Others see only plans they created, requested approval for, or are assigned to approve
    let query = 'SELECT * FROM installment_plans WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (req.userRole !== 'Admin') {
      query += ` AND (user_id = $${paramIndex} OR approval_requested_by = $${paramIndex} OR approval_requested_to = $${paramIndex})`;
      params.push(currentUserId);
      paramIndex++;
    }

    if (projectId) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }
    if (leadId) {
      query += ` AND lead_id = $${paramIndex++}`;
      params.push(leadId);
    }
    if (unitId) {
      query += ` AND unit_id = $${paramIndex++}`;
      params.push(unitId);
    }

    query += ' ORDER BY created_at DESC';

    const plans = await db.query(query, params);
    
    // Map snake_case to camelCase
    const mapped = plans.map((p: any) => ({
      id: p.id,
      projectId: p.project_id,
      leadId: p.lead_id,
      unitId: p.unit_id,
      durationYears: p.duration_years,
      downPaymentPercentage: parseFloat(p.down_payment_percentage),
      frequency: p.frequency,
      listPrice: parseFloat(p.list_price),
      customerDiscount: parseFloat(p.customer_discount) || 0,
      floorDiscount: parseFloat(p.floor_discount) || 0,
      lumpSumDiscount: parseFloat(p.lump_sum_discount) || 0,
      miscDiscount: parseFloat(p.misc_discount) || 0,
      netValue: parseFloat(p.net_value),
      downPaymentAmount: parseFloat(p.down_payment_amount),
      installmentAmount: parseFloat(p.installment_amount),
      totalInstallments: p.total_installments,
      description: p.description,
      introText: p.intro_text || undefined,
      version: p.version || 1,
      rootId: p.root_id || undefined,
      status: p.status || 'Draft',
      approvalRequestedById: p.approval_requested_by || undefined,
      approvalRequestedToId: p.approval_requested_to || undefined,
      approvalRequestedAt: p.approval_requested_at || undefined,
      approvalReviewedById: p.approval_reviewed_by || undefined,
      approvalReviewedAt: p.approval_reviewed_at || undefined,
      userId: p.user_id || undefined,
      discounts: (() => {
        if (p.discounts) {
          if (typeof p.discounts === 'string') {
            try {
              return JSON.parse(p.discounts);
            } catch {
              return [];
            }
          }
          return Array.isArray(p.discounts) ? p.discounts : [];
        }
        return [];
      })(),
      customerDiscountCategoryId: p.customer_discount_category_id,
      floorDiscountCategoryId: p.floor_discount_category_id,
      lumpSumDiscountCategoryId: p.lump_sum_discount_category_id,
      miscDiscountCategoryId: p.misc_discount_category_id,
      selectedAmenities: typeof p.selected_amenities === 'string' ? JSON.parse(p.selected_amenities) : (p.selected_amenities || []),
      amenitiesTotal: parseFloat(p.amenities_total) || 0,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    res.json(mapped);
  } catch (error) {
    console.error('Error fetching installment plans:', error);
    res.status(500).json({ error: 'Failed to fetch installment plans' });
  }
});

// POST create/update installment plan (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const plan = req.body;
    
    console.log('📥 POST /installment-plans - Request received:', {
      tenantId: req.tenantId,
      userId: req.user?.userId,
      planId: plan.id,
      projectId: plan.projectId,
      leadId: plan.leadId,
      unitId: plan.unitId
    });
    
    if (!plan.projectId || !plan.leadId || !plan.unitId) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Project ID, Lead ID, and Unit ID are required'
      });
    }
    
    // Validate required numeric fields
    if (plan.durationYears === undefined || plan.durationYears === null) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Duration years is required'
      });
    }
    if (plan.downPaymentPercentage === undefined || plan.downPaymentPercentage === null) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Down payment percentage is required'
      });
    }
    if (!plan.frequency) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Frequency is required'
      });
    }
    if (plan.listPrice === undefined || plan.listPrice === null) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'List price is required'
      });
    }
    if (plan.netValue === undefined || plan.netValue === null) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Net value is required'
      });
    }
    if (plan.downPaymentAmount === undefined || plan.downPaymentAmount === null) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Down payment amount is required'
      });
    }
    if (plan.installmentAmount === undefined || plan.installmentAmount === null) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Installment amount is required'
      });
    }
    if (plan.totalInstallments === undefined || plan.totalInstallments === null) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Total installments is required'
      });
    }
    
    const planId = plan.id || `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const existing = await db.query(
      'SELECT id FROM installment_plans WHERE id = $1 AND tenant_id = $2',
      [planId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Prepare JSONB fields
    let discountsJson = '[]';
    if (plan.discounts) {
      if (typeof plan.discounts === 'string') {
        try {
          JSON.parse(plan.discounts); // Validate it's valid JSON
          discountsJson = plan.discounts;
        } catch {
          discountsJson = '[]';
        }
      } else {
        discountsJson = JSON.stringify(plan.discounts);
      }
    }
    
    let selectedAmenitiesJson = '[]';
    if (plan.selectedAmenities) {
      if (typeof plan.selectedAmenities === 'string') {
        try {
          JSON.parse(plan.selectedAmenities); // Validate it's valid JSON
          selectedAmenitiesJson = plan.selectedAmenities;
        } catch {
          selectedAmenitiesJson = '[]';
        }
      } else {
        selectedAmenitiesJson = JSON.stringify(plan.selectedAmenities);
      }
    }
    
    const availableColumns = await getInstallmentPlanColumns(db);
    const requiredColumns = [
      'id',
      'tenant_id',
      'project_id',
      'lead_id',
      'unit_id',
      'duration_years',
      'down_payment_percentage',
      'frequency',
      'list_price',
      'customer_discount',
      'floor_discount',
      'lump_sum_discount',
      'misc_discount',
      'net_value',
      'down_payment_amount',
      'installment_amount',
      'total_installments',
      'description',
      'user_id',
      'created_at',
      'updated_at',
    ];

    const missingRequired = requiredColumns.filter((column) => !availableColumns.has(column));
    if (missingRequired.length > 0) {
      console.error('❌ Missing required columns on installment_plans:', missingRequired);
      return res.status(500).json({
        error: 'Failed to save installment plan',
        message: `Database schema missing required columns: ${missingRequired.join(', ')}`
      });
    }

    type InsertColumn = {
      name: string;
      value?: any;
      cast?: string;
      raw?: string;
      update?: boolean;
    };

    const insertColumns: InsertColumn[] = [
      { name: 'id', value: planId },
      { name: 'tenant_id', value: req.tenantId },
      { name: 'project_id', value: plan.projectId, update: true },
      { name: 'lead_id', value: plan.leadId, update: true },
      { name: 'unit_id', value: plan.unitId, update: true },
      { name: 'duration_years', value: plan.durationYears, update: true },
      { name: 'down_payment_percentage', value: plan.downPaymentPercentage, update: true },
      { name: 'frequency', value: plan.frequency, update: true },
      { name: 'list_price', value: plan.listPrice, update: true },
      { name: 'customer_discount', value: plan.customerDiscount || 0, update: true },
      { name: 'floor_discount', value: plan.floorDiscount || 0, update: true },
      { name: 'lump_sum_discount', value: plan.lumpSumDiscount || 0, update: true },
      { name: 'misc_discount', value: plan.miscDiscount || 0, update: true },
      { name: 'net_value', value: plan.netValue, update: true },
      { name: 'down_payment_amount', value: plan.downPaymentAmount, update: true },
      { name: 'installment_amount', value: plan.installmentAmount, update: true },
      { name: 'total_installments', value: plan.totalInstallments, update: true },
      { name: 'description', value: plan.description || null, update: true },
      { name: 'user_id', value: req.user?.userId || null, update: true },
      { name: 'created_at', raw: 'NOW()' },
      { name: 'updated_at', raw: 'NOW()' },
    ];

    const optionalColumns = [
      { name: 'intro_text', value: plan.introText || null, update: true },
      { name: 'version', value: plan.version || 1, update: true },
      { name: 'root_id', value: plan.rootId || null, update: true },
      { name: 'status', value: plan.status || 'Draft', update: true },
      { name: 'approval_requested_by', value: plan.approvalRequestedById || null, update: true },
      { name: 'approval_requested_to', value: plan.approvalRequestedToId || null, update: true },
      { name: 'approval_requested_at', value: plan.approvalRequestedAt || null, update: true },
      { name: 'approval_reviewed_by', value: plan.approvalReviewedById || null, update: true },
      { name: 'approval_reviewed_at', value: plan.approvalReviewedAt || null, update: true },
      { name: 'discounts', value: discountsJson, cast: 'jsonb', update: true },
      { name: 'customer_discount_category_id', value: plan.customerDiscountCategoryId || null, update: true },
      { name: 'floor_discount_category_id', value: plan.floorDiscountCategoryId || null, update: true },
      { name: 'lump_sum_discount_category_id', value: plan.lumpSumDiscountCategoryId || null, update: true },
      { name: 'misc_discount_category_id', value: plan.miscDiscountCategoryId || null, update: true },
      { name: 'selected_amenities', value: selectedAmenitiesJson, cast: 'jsonb', update: true },
      { name: 'amenities_total', value: plan.amenitiesTotal || 0, update: true },
    ];

    const missingOptional = optionalColumns
      .map((column) => column.name)
      .filter((column) => !availableColumns.has(column));

    if (missingOptional.length > 0 && !loggedMissingInstallmentPlanColumns) {
      loggedMissingInstallmentPlanColumns = true;
      console.warn('⚠️ installment_plans missing optional columns:', missingOptional);
    }

    optionalColumns.forEach((column) => {
      if (availableColumns.has(column.name)) {
        insertColumns.push(column);
      }
    });

    const params: any[] = [];
    const columnsSql: string[] = [];
    const valuesSql: string[] = [];
    const updateSql: string[] = [];

    insertColumns.forEach((column) => {
      columnsSql.push(column.name);

      if (column.raw) {
        valuesSql.push(column.raw);
      } else {
        const paramIndex = params.length + 1;
        const castSql = column.cast ? `::${column.cast}` : '';
        valuesSql.push(`$${paramIndex}${castSql}`);
        params.push(column.value);
      }

      if (column.update) {
        updateSql.push(`${column.name} = EXCLUDED.${column.name}`);
      }
    });

    if (availableColumns.has('updated_at')) {
      updateSql.push('updated_at = NOW()');
    }

    const result = await db.query(
      `INSERT INTO installment_plans (${columnsSql.join(', ')})
       VALUES (${valuesSql.join(', ')})
       ON CONFLICT (id)
       DO UPDATE SET ${updateSql.join(', ')}
       RETURNING *`,
      params
    );
    
    if (!result || result.length === 0) {
      console.error('❌ POST /installment-plans - No result returned from query');
      return res.status(500).json({ error: 'Failed to save installment plan', message: 'No data returned from database' });
    }
    
    console.log('✅ POST /installment-plans - Plan saved successfully:', {
      id: result[0].id,
      projectId: result[0].project_id,
      tenantId: req.tenantId
    });
    
    const saved = result[0];
    const mapped = {
      ...plan,
      id: saved.id,
      introText: saved.intro_text || plan.introText,
      version: saved.version || plan.version || 1,
      rootId: saved.root_id || plan.rootId,
      status: saved.status || plan.status || 'Draft',
      approvalRequestedById: saved.approval_requested_by || plan.approvalRequestedById,
      approvalRequestedToId: saved.approval_requested_to || plan.approvalRequestedToId,
      approvalRequestedAt: saved.approval_requested_at || plan.approvalRequestedAt,
      approvalReviewedById: saved.approval_reviewed_by || plan.approvalReviewedById,
      approvalReviewedAt: saved.approval_reviewed_at || plan.approvalReviewedAt,
      userId: saved.user_id || plan.userId || req.user?.userId,
      discounts: (() => {
        if (saved.discounts) {
          if (typeof saved.discounts === 'string') {
            try {
              return JSON.parse(saved.discounts);
            } catch {
              return plan.discounts || [];
            }
          }
          return Array.isArray(saved.discounts) ? saved.discounts : (plan.discounts || []);
        }
        return plan.discounts || [];
      })(),
      createdAt: saved.created_at,
      updatedAt: saved.updated_at
    };
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.INSTALLMENT_PLAN_UPDATED : WS_EVENTS.INSTALLMENT_PLAN_CREATED, {
      plan: mapped,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
    res.status(isUpdate ? 200 : 201).json(mapped);
  } catch (error: any) {
    console.error('Error saving installment plan:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table,
      column: error.column
    });
    res.status(500).json({ 
      error: 'Failed to save installment plan',
      message: error.message || 'Unknown error',
      detail: error.detail || undefined
    });
  }
});

// DELETE installment plan
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM installment_plans WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Installment plan not found' });
    }
    
    emitToTenant(req.tenantId!, WS_EVENTS.INSTALLMENT_PLAN_DELETED, {
      planId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting installment plan:', error);
    res.status(500).json({ error: 'Failed to delete installment plan' });
  }
});

export default router;
