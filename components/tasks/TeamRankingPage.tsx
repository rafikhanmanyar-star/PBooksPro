import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { TaskPerformanceScore, TaskPerformanceConfig } from '../../types';
import { TasksApiRepository } from '../../services/api/repositories/tasksApi';
import { formatDate } from '../../utils/dateUtils';
import { ICONS } from '../../constants';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Modal from '../ui/Modal';

const TeamRankingPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useNotification();
  const tasksApi = new TasksApiRepository();

  const [scores, setScores] = useState<TaskPerformanceScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<TaskPerformanceConfig | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Period selection
  const [periodStart, setPeriodStart] = useState(() => {
    const date = new Date();
    date.setDate(1); // First day of current month
    return formatDate(date);
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(0); // Last day of current month
    return formatDate(date);
  });

  // Config form state
  const [completionWeight, setCompletionWeight] = useState('0.33');
  const [deadlineWeight, setDeadlineWeight] = useState('0.33');
  const [kpiWeight, setKpiWeight] = useState('0.34');

  // Load leaderboard
  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const data = await tasksApi.getLeaderboard(periodStart, periodEnd);
      setScores(data);
    } catch (error: any) {
      console.error('Error loading leaderboard:', error);
      showToast(error.message || 'Failed to load leaderboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load performance config
  const loadConfig = async () => {
    try {
      const data = await tasksApi.getPerformanceConfig();
      setConfig(data);
      setCompletionWeight(data.completion_rate_weight.toString());
      setDeadlineWeight(data.deadline_adherence_weight.toString());
      setKpiWeight(data.kpi_achievement_weight.toString());
    } catch (error: any) {
      console.error('Error loading config:', error);
    }
  };

  useEffect(() => {
    loadLeaderboard();
    loadConfig();
  }, [periodStart, periodEnd]);

  const handleSaveConfig = async () => {
    const completion = parseFloat(completionWeight);
    const deadline = parseFloat(deadlineWeight);
    const kpi = parseFloat(kpiWeight);

    // Validate
    if (isNaN(completion) || isNaN(deadline) || isNaN(kpi)) {
      showToast('All weights must be valid numbers', 'error');
      return;
    }
    if (completion < 0 || completion > 1 || deadline < 0 || deadline > 1 || kpi < 0 || kpi > 1) {
      showToast('Weights must be between 0 and 1', 'error');
      return;
    }
    const sum = completion + deadline + kpi;
    if (Math.abs(sum - 1.0) > 0.01) {
      showToast('Weights must sum to 1.0', 'error');
      return;
    }

    try {
      await tasksApi.updatePerformanceConfig({
        completion_rate_weight: completion,
        deadline_adherence_weight: deadline,
        kpi_achievement_weight: kpi,
      });
      showToast('Performance configuration updated', 'success');
      await loadConfig();
      setIsConfigModalOpen(false);
      // Reload leaderboard to recalculate scores
      await loadLeaderboard();
    } catch (error: any) {
      showToast(error.message || 'Failed to update configuration', 'error');
    }
  };

  // Quick period presets
  const setPeriodPreset = (preset: 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter') => {
    const today = new Date();
    let start: Date, end: Date;

    switch (preset) {
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'thisQuarter':
        const quarter = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), quarter * 3, 1);
        end = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
        break;
      case 'lastQuarter':
        const lastQuarter = Math.floor(today.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
        const q = lastQuarter < 0 ? 3 : lastQuarter;
        start = new Date(year, q * 3, 1);
        end = new Date(year, (q + 1) * 3, 0);
        break;
    }

    setPeriodStart(formatDate(start));
    setPeriodEnd(formatDate(end));
  };

  // Sort options
  const [sortBy, setSortBy] = useState<'score' | 'completion' | 'deadline' | 'kpi'>('score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const sortedScores = useMemo(() => {
    const sorted = [...scores];
    sorted.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortBy) {
        case 'score':
          aVal = a.performance_score;
          bVal = b.performance_score;
          break;
        case 'completion':
          aVal = a.completion_rate;
          bVal = b.completion_rate;
          break;
        case 'deadline':
          aVal = a.deadline_adherence_rate;
          bVal = b.deadline_adherence_rate;
          break;
        case 'kpi':
          aVal = a.average_kpi_achievement;
          bVal = b.average_kpi_achievement;
          break;
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [scores, sortBy, sortDirection]);

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (rank === 2) return 'bg-gray-100 text-gray-800 border-gray-300';
    if (rank === 3) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-white text-gray-700 border-gray-200';
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Team Ranking</h1>
        <Button onClick={() => setIsConfigModalOpen(true)} variant="secondary">
          {ICONS.settings}
          <span>Configure Weights</span>
        </Button>
      </div>

      {/* Period Selection */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 grid grid-cols-2 gap-4">
            <Input
              label="Period Start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
            <Input
              label="Period End"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setPeriodPreset('thisMonth')} variant="ghost" size="sm">
              This Month
            </Button>
            <Button onClick={() => setPeriodPreset('lastMonth')} variant="ghost" size="sm">
              Last Month
            </Button>
            <Button onClick={() => setPeriodPreset('thisQuarter')} variant="ghost" size="sm">
              This Quarter
            </Button>
          </div>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex gap-4 mb-4">
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="w-48"
        >
          <option value="score">Performance Score</option>
          <option value="completion">Completion Rate</option>
          <option value="deadline">Deadline Adherence</option>
          <option value="kpi">KPI Achievement</option>
        </Select>
        <Button
          onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
          variant="ghost"
          size="icon"
        >
          {sortDirection === 'asc' ? ICONS.arrowUp : ICONS.arrowDown}
        </Button>
      </div>

      {/* Leaderboard Table */}
      {loading ? (
        <div className="text-center py-8">Loading leaderboard...</div>
      ) : sortedScores.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No performance data available for the selected period.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Performance Score</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Completion Rate</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Deadline Adherence</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">KPI Achievement</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedScores.map((score, idx) => {
                const rank = idx + 1;
                return (
                  <tr key={score.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full border-2 font-bold ${getRankColor(rank)}`}
                      >
                        {rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {(score as any).user_name || 'Unknown User'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {score.performance_score.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {score.completion_rate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {score.deadline_adherence_rate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {score.average_kpi_achievement.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">
                      {score.completed_tasks} / {score.total_tasks}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Performance Config Modal */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title="Configure Performance Weights"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Configure how performance scores are calculated. All weights must sum to 1.0.
          </p>

          <Input
            label="Completion Rate Weight"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={completionWeight}
            onChange={(e) => setCompletionWeight(e.target.value)}
          />

          <Input
            label="Deadline Adherence Weight"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={deadlineWeight}
            onChange={(e) => setDeadlineWeight(e.target.value)}
          />

          <Input
            label="KPI Achievement Weight"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={kpiWeight}
            onChange={(e) => setKpiWeight(e.target.value)}
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Total:</strong>{' '}
              {(parseFloat(completionWeight) + parseFloat(deadlineWeight) + parseFloat(kpiWeight)).toFixed(2)}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              onClick={() => setIsConfigModalOpen(false)}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button onClick={handleSaveConfig}>Save Configuration</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TeamRankingPage;
