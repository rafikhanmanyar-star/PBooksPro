import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { generateTemplate } from '../../services/templateService.js';
import { exportData } from '../../services/dataExportService.js';
import { importData } from '../../services/dataImportService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();

/**
 * GET /api/data-import-export/template
 * Download Excel template - either single sheet or all sheets
 * Query params: ?sheet=SheetName (optional, if provided generates only that sheet)
 */
router.get('/template', async (req: TenantRequest, res) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sheetName = req.query.sheet as string | undefined;
    const buffer = await generateTemplate({
      tenantId: req.tenantId,
      includeSampleData: false,
      sheetName
    });

    const filename = sheetName 
      ? `import-template-${sheetName.toLowerCase()}.xlsx`
      : 'import-template.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Error generating template:', error);
    res.status(500).json({
      error: 'Failed to generate template',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/data-import-export/export
 * Export current data as Excel with sample entries
 */
router.get('/export', async (req: TenantRequest, res) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const buffer = await exportData(req.tenantId);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="export-data.xlsx"');
    res.send(buffer);
  } catch (error: any) {
    console.error('Error exporting data:', error);
    res.status(500).json({
      error: 'Failed to export data',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/data-import-export/import
 * Import Excel file with validation and duplicate checking.
 * Data is persisted to the tenant's cloud DB (same as POST /transactions);
 * imported records are returned by GET /transactions and loaded on relogin/refresh.
 * Accepts file as base64 string in JSON body: { file: "base64string", sheetName?: "SheetName" }
 * If sheetName is provided, imports only that sheet.
 */
router.post('/import', async (req: TenantRequest, res) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.user?.userId) {
      return res.status(401).json({
        error: 'User information missing',
        message: 'Unable to identify user for import'
      });
    }

    // Accept file as base64 string in JSON body
    if (!req.body || !req.body.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide file data as base64 string in body.file (JSON format: { file: "base64string" })'
      });
    }

    // Decode base64 file data
    let base64Data = req.body.file;
    // Remove data URL prefix if present (e.g., "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,...")
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }
    
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(base64Data, 'base64');
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid file data',
        message: 'File data must be a valid base64 string'
      });
    }

    // Validate file size (10MB limit)
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size must be less than 10MB'
      });
    }

    const sheetName = req.body.sheetName as string | undefined;
    const result = await importData(
      fileBuffer,
      req.tenantId,
      req.user.userId,
      sheetName
    );

    if (result.success && result.imported) {
      const importedEntities = Object.entries(result.imported)
        .filter(([, v]) => v.count > 0)
        .map(([key]) => key);

      if (importedEntities.length > 0) {
        emitToTenant(req.tenantId, WS_EVENTS.BULK_IMPORT_COMPLETED, {
          importedEntities,
          userId: req.user.userId,
          username: req.user.username,
        });
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error importing data:', error);
    res.status(500).json({
      error: 'Failed to import data',
      message: error.message || 'Internal server error',
      success: false,
      canProceed: false,
      validationErrors: [],
      duplicates: [],
      summary: {
        totalRows: 0,
        validRows: 0,
        errorRows: 0,
        duplicateRows: 0
      }
    });
  }
});

export default router;
