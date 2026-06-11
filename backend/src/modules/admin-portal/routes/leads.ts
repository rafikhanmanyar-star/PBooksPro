// @ts-nocheck
import { Router } from 'express';
import {
  listLeadsForAdmin,
  updateLeadStatus,
  exportLeadsCsv,
  getLeadStats,
} from '../../../services/marketing/leadManagementService.js';
import { LEAD_STATUSES, isLeadStatus } from '../../../services/marketing/marketingLeadService.js';

const router = Router();

router.get('/stats', async (_req, res) => {
  try {
    const stats = await getLeadStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching lead stats:', error);
    res.status(500).json({ error: 'Failed to fetch lead stats' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const { search, source, status, campaign, from, to } = req.query;
    const csv = await exportLeadsCsv({
      search: typeof search === 'string' ? search : undefined,
      source: typeof source === 'string' ? source : undefined,
      status: typeof status === 'string' ? status : undefined,
      campaign: typeof campaign === 'string' ? campaign : undefined,
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
    });
    const filename = `pbookspro-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting leads:', error);
    res.status(500).json({ error: 'Failed to export leads' });
  }
});

router.get('/meta', (_req, res) => {
  res.json({
    statuses: LEAD_STATUSES,
    sources: [
      'checklist',
      'newsletter',
      'exit_intent',
      'demo_booking',
      'contact_form',
      'trial_signup',
      'pricing_cta',
    ],
  });
});

router.get('/', async (req, res) => {
  try {
    const { search, source, status, campaign, from, to, limit, offset } = req.query;
    const result = await listLeadsForAdmin({
      search: typeof search === 'string' ? search : undefined,
      source: typeof source === 'string' ? source : undefined,
      status: typeof status === 'string' ? status : undefined,
      campaign: typeof campaign === 'string' ? campaign : undefined,
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
      offset: typeof offset === 'string' ? parseInt(offset, 10) : undefined,
    });
    res.json(result);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (!status || !isLeadStatus(status)) {
      res.status(400).json({ error: 'Valid status is required' });
      return;
    }
    const lead = await updateLeadStatus(req.params.id, status);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.json(lead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

export default router;
