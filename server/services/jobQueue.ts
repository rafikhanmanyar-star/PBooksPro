/**
 * Lightweight in-process job queue for heavy backend operations.
 *
 * Supports:
 * - Enqueueing jobs with a name, payload, and optional priority
 * - Concurrent job execution with configurable concurrency
 * - Job status tracking (pending, running, completed, failed)
 * - Automatic retry on failure
 *
 * For production at 500+ tenants, replace with Bull/BullMQ backed by Redis.
 */

export interface Job {
  id: string;
  name: string;
  payload: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  retries: number;
  maxRetries: number;
  priority: number;
}

type JobHandler = (payload: Record<string, any>) => Promise<any>;

const jobs = new Map<string, Job>();
const handlers = new Map<string, JobHandler>();
const queue: string[] = [];
let running = 0;
const MAX_CONCURRENCY = 3;
let idCounter = 0;

function generateId(): string {
  return `job_${Date.now()}_${++idCounter}`;
}

export function registerJobHandler(name: string, handler: JobHandler): void {
  handlers.set(name, handler);
}

export function enqueueJob(
  name: string,
  payload: Record<string, any>,
  options: { maxRetries?: number; priority?: number } = {}
): string {
  const id = generateId();
  const job: Job = {
    id,
    name,
    payload,
    status: 'pending',
    createdAt: new Date(),
    retries: 0,
    maxRetries: options.maxRetries ?? 2,
    priority: options.priority ?? 0,
  };

  jobs.set(id, job);
  queue.push(id);
  queue.sort((a, b) => (jobs.get(b)?.priority ?? 0) - (jobs.get(a)?.priority ?? 0));

  processQueue();
  return id;
}

export function getJobStatus(id: string): Job | undefined {
  return jobs.get(id);
}

export function getActiveJobs(): Job[] {
  return Array.from(jobs.values())
    .filter(j => j.status === 'pending' || j.status === 'running')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

async function processQueue(): Promise<void> {
  while (running < MAX_CONCURRENCY && queue.length > 0) {
    const jobId = queue.shift();
    if (!jobId) break;

    const job = jobs.get(jobId);
    if (!job || job.status !== 'pending') continue;

    running++;
    job.status = 'running';
    job.startedAt = new Date();

    const handler = handlers.get(job.name);
    if (!handler) {
      job.status = 'failed';
      job.error = `No handler registered for job: ${job.name}`;
      job.completedAt = new Date();
      running--;
      continue;
    }

    executeJob(job, handler).finally(() => {
      running--;
      processQueue();
    });
  }
}

async function executeJob(job: Job, handler: JobHandler): Promise<void> {
  try {
    job.result = await handler(job.payload);
    job.status = 'completed';
    job.completedAt = new Date();
  } catch (err: any) {
    job.retries++;
    if (job.retries <= job.maxRetries) {
      job.status = 'pending';
      queue.push(job.id);
      console.warn(`[JobQueue] Retrying job ${job.id} (${job.name}): attempt ${job.retries}/${job.maxRetries}`);
    } else {
      job.status = 'failed';
      job.error = err.message || 'Unknown error';
      job.completedAt = new Date();
      console.error(`[JobQueue] Job ${job.id} (${job.name}) failed after ${job.maxRetries} retries:`, err.message);
    }
  }
}

/**
 * Cleanup old completed/failed jobs to prevent memory leaks.
 * Call periodically (e.g. every 10 minutes).
 */
export function cleanupOldJobs(maxAgeMs: number = 30 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  let cleaned = 0;
  for (const [id, job] of jobs) {
    if (
      (job.status === 'completed' || job.status === 'failed') &&
      job.completedAt &&
      job.completedAt.getTime() < cutoff
    ) {
      jobs.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}
