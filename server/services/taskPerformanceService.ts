/**
 * Task Performance Service
 * 
 * Calculates performance scores for users based on task completion,
 * deadline adherence, and KPI achievement.
 */

import { getDatabaseService } from './databaseService.js';

export interface PerformanceMetrics {
  totalTasks: number;
  completedTasks: number;
  onTimeCompletions: number;
  overdueTasks: number;
  averageKpiAchievement: number;
  completionRate: number;
  deadlineAdherenceRate: number;
}

export class TaskPerformanceService {
  private db: any;

  constructor() {
    this.db = getDatabaseService();
  }

  /**
   * Calculate performance metrics for a user in a given period
   */
  async calculateUserMetrics(
    userId: string,
    tenantId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<PerformanceMetrics> {
    // Get all tasks for user in period
    const tasks = await this.db.query(
      `SELECT * FROM tasks 
       WHERE tenant_id = $1 
         AND (created_by_id = $2 OR assigned_to_id = $2)
         AND created_at >= $3 
         AND created_at <= $4`,
      [tenantId, userId, periodStart, periodEnd]
    );

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t: any) => t.status === 'Completed').length;
    
    // Calculate on-time completions (completed before or on deadline)
    const onTimeCompletions = tasks.filter((t: any) => {
      if (t.status !== 'Completed') return false;
      const completedDate = new Date(t.updated_at);
      const deadline = new Date(t.hard_deadline);
      return completedDate <= deadline;
    }).length;

    // Calculate overdue tasks (past deadline and not completed)
    const now = new Date();
    const overdueTasks = tasks.filter((t: any) => {
      if (t.status === 'Completed') return false;
      const deadline = new Date(t.hard_deadline);
      return deadline < now;
    }).length;

    // Calculate average KPI achievement
    const tasksWithKpi = tasks.filter((t: any) => t.kpi_target_value && t.kpi_target_value > 0);
    let averageKpiAchievement = 0;
    if (tasksWithKpi.length > 0) {
      const totalKpiProgress = tasksWithKpi.reduce((sum: number, t: any) => {
        return sum + (t.kpi_progress_percentage || 0);
      }, 0);
      averageKpiAchievement = totalKpiProgress / tasksWithKpi.length;
    }

    // Calculate rates
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const deadlineAdherenceRate = completedTasks > 0 ? (onTimeCompletions / completedTasks) * 100 : 0;

    return {
      totalTasks,
      completedTasks,
      onTimeCompletions,
      overdueTasks,
      averageKpiAchievement,
      completionRate,
      deadlineAdherenceRate,
    };
  }

  /**
   * Calculate performance score using configurable weights
   */
  async calculatePerformanceScore(
    userId: string,
    tenantId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<number> {
    // Get performance config
    const configs = await this.db.query(
      'SELECT * FROM task_performance_config WHERE tenant_id = $1',
      [tenantId]
    );

    const config = configs.length > 0 ? configs[0] : {
      completion_rate_weight: 0.33,
      deadline_adherence_weight: 0.33,
      kpi_achievement_weight: 0.34,
    };

    // Get metrics
    const metrics = await this.calculateUserMetrics(userId, tenantId, periodStart, periodEnd);

    // Calculate weighted score
    const score =
      metrics.completionRate * config.completion_rate_weight +
      metrics.deadlineAdherenceRate * config.deadline_adherence_weight +
      metrics.averageKpiAchievement * config.kpi_achievement_weight;

    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate and save performance score for a user
   */
  async calculateAndSaveScore(
    userId: string,
    tenantId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<void> {
    const metrics = await this.calculateUserMetrics(userId, tenantId, periodStart, periodEnd);
    const performanceScore = await this.calculatePerformanceScore(userId, tenantId, periodStart, periodEnd);

    // Check if score already exists
    const existing = await this.db.query(
      `SELECT id FROM task_performance_scores 
       WHERE tenant_id = $1 AND user_id = $2 AND period_start = $3 AND period_end = $4`,
      [tenantId, userId, periodStart, periodEnd]
    );

    const scoreId = existing.length > 0
      ? existing[0].id
      : `score_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (existing.length > 0) {
      // Update existing
      await this.db.query(
        `UPDATE task_performance_scores SET
          total_tasks = $1,
          completed_tasks = $2,
          on_time_completions = $3,
          overdue_tasks = $4,
          average_kpi_achievement = $5,
          completion_rate = $6,
          deadline_adherence_rate = $7,
          performance_score = $8,
          calculated_at = NOW()
        WHERE id = $9`,
        [
          metrics.totalTasks,
          metrics.completedTasks,
          metrics.onTimeCompletions,
          metrics.overdueTasks,
          metrics.averageKpiAchievement,
          metrics.completionRate,
          metrics.deadlineAdherenceRate,
          performanceScore,
          scoreId,
        ]
      );
    } else {
      // Insert new
      await this.db.query(
        `INSERT INTO task_performance_scores (
          id, tenant_id, user_id, period_start, period_end,
          total_tasks, completed_tasks, on_time_completions, overdue_tasks,
          average_kpi_achievement, completion_rate, deadline_adherence_rate,
          performance_score, calculated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
        [
          scoreId,
          tenantId,
          userId,
          periodStart,
          periodEnd,
          metrics.totalTasks,
          metrics.completedTasks,
          metrics.onTimeCompletions,
          metrics.overdueTasks,
          metrics.averageKpiAchievement,
          metrics.completionRate,
          metrics.deadlineAdherenceRate,
          performanceScore,
        ]
      );
    }
  }

  /**
   * Recalculate scores for all users in a tenant for a period
   */
  async recalculateAllScores(
    tenantId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<void> {
    // Get all users in tenant
    const users = await this.db.query(
      'SELECT id FROM users WHERE tenant_id = $1 AND is_active = true',
      [tenantId]
    );

    // Calculate scores for each user
    for (const user of users) {
      await this.calculateAndSaveScore(user.id, tenantId, periodStart, periodEnd);
    }
  }

  /**
   * Trigger recalculation when task is completed
   */
  async onTaskCompleted(taskId: string, tenantId: string): Promise<void> {
    // Get task
    const tasks = await this.db.query(
      'SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2',
      [taskId, tenantId]
    );
    if (tasks.length === 0) return;

    const task = tasks[0];
    const userId = task.assigned_to_id || task.created_by_id;
    if (!userId) return;

    // Get current month period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    // Recalculate score
    await this.calculateAndSaveScore(userId, tenantId, periodStart, periodEnd);
  }
}

export function getTaskPerformanceService(): TaskPerformanceService {
  return new TaskPerformanceService();
}
