/**
 * Job Queue API endpoints.
 * Allows clients to submit heavy jobs (e.g. report generation, bulk export)
 * and poll for their completion status.
 */

import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { enqueueJob, getJobStatus, getActiveJobs } from '../../services/jobQueue.js';

const router = Router();

/**
 * POST /api/jobs
 * Submit a new background job.
 * Body: { name: string, payload?: object }
 */
router.post('/', async (req: TenantRequest, res) => {
  try {
    const { name, payload = {} } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Job name is required' });
    }

    const jobPayload = {
      ...payload,
      tenantId: req.tenantId,
      userId: req.user?.userId,
    };

    const jobId = enqueueJob(name, jobPayload);
    res.status(202).json({ jobId, status: 'pending' });
  } catch (error: any) {
    console.error('Error submitting job:', error);
    res.status(500).json({ error: 'Failed to submit job', message: error.message });
  }
});

/**
 * GET /api/jobs/:id
 * Check the status of a submitted job.
 */
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const job = getJobStatus(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.payload.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({
      id: job.id,
      name: job.name,
      status: job.status,
      result: job.status === 'completed' ? job.result : undefined,
      error: job.status === 'failed' ? job.error : undefined,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (error: any) {
    console.error('Error fetching job status:', error);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

/**
 * GET /api/jobs
 * List active (pending + running) jobs for the current tenant.
 */
router.get('/', async (req: TenantRequest, res) => {
  try {
    const activeJobs = getActiveJobs()
      .filter(j => j.payload.tenantId === req.tenantId)
      .map(j => ({
        id: j.id,
        name: j.name,
        status: j.status,
        createdAt: j.createdAt,
        startedAt: j.startedAt,
      }));

    res.json(activeJobs);
  } catch (error: any) {
    console.error('Error listing jobs:', error);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

export default router;
