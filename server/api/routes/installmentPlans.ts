import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all installment plans
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { projectId, leadId, unitId } = req.query;
    
    let query = 'SELECT * FROM installment_plans WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

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
    
    const result = await db.query(
      `INSERT INTO installment_plans (
        id, tenant_id, project_id, lead_id, unit_id, duration_years, 
        down_payment_percentage, frequency, list_price, customer_discount, 
        floor_discount, lump_sum_discount, misc_discount, net_value, 
        down_payment_amount, installment_amount, total_installments, 
        description, intro_text, version, root_id, status, discounts,
        customer_discount_category_id, floor_discount_category_id, 
        lump_sum_discount_category_id, misc_discount_category_id, 
        selected_amenities, amenities_total, user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb, $24, $25, $26, $27, $28::jsonb, $29, $30,
                COALESCE((SELECT created_at FROM installment_plans WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        lead_id = EXCLUDED.lead_id,
        unit_id = EXCLUDED.unit_id,
        duration_years = EXCLUDED.duration_years,
        down_payment_percentage = EXCLUDED.down_payment_percentage,
        frequency = EXCLUDED.frequency,
        list_price = EXCLUDED.list_price,
        customer_discount = EXCLUDED.customer_discount,
        floor_discount = EXCLUDED.floor_discount,
        lump_sum_discount = EXCLUDED.lump_sum_discount,
        misc_discount = EXCLUDED.misc_discount,
        net_value = EXCLUDED.net_value,
        down_payment_amount = EXCLUDED.down_payment_amount,
        installment_amount = EXCLUDED.installment_amount,
        total_installments = EXCLUDED.total_installments,
        description = EXCLUDED.description,
        intro_text = EXCLUDED.intro_text,
        version = EXCLUDED.version,
        root_id = EXCLUDED.root_id,
        status = EXCLUDED.status,
        discounts = EXCLUDED.discounts,
        customer_discount_category_id = EXCLUDED.customer_discount_category_id,
        floor_discount_category_id = EXCLUDED.floor_discount_category_id,
        lump_sum_discount_category_id = EXCLUDED.lump_sum_discount_category_id,
        misc_discount_category_id = EXCLUDED.misc_discount_category_id,
        selected_amenities = EXCLUDED.selected_amenities,
        amenities_total = EXCLUDED.amenities_total,
        user_id = EXCLUDED.user_id,
        updated_at = NOW()
      RETURNING *`,
      [
        planId,
        req.tenantId,
        plan.projectId,
        plan.leadId,
        plan.unitId,
        plan.durationYears,
        plan.downPaymentPercentage,
        plan.frequency,
        plan.listPrice,
        plan.customerDiscount || 0,
        plan.floorDiscount || 0,
        plan.lumpSumDiscount || 0,
        plan.miscDiscount || 0,
        plan.netValue,
        plan.downPaymentAmount,
        plan.installmentAmount,
        plan.totalInstallments,
        plan.description || null,
        plan.introText || null,
        plan.version || 1,
        plan.rootId || null,
        plan.status || 'Draft',
        discountsJson, // $24 - will be cast to jsonb
        plan.customerDiscountCategoryId || null,
        plan.floorDiscountCategoryId || null,
        plan.lumpSumDiscountCategoryId || null,
        plan.miscDiscountCategoryId || null,
        selectedAmenitiesJson, // $29 - will be cast to jsonb
        plan.amenitiesTotal || 0,
        req.user?.userId || null
      ]
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
