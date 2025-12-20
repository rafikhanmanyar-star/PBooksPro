
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { Task } from '../types';
import useDatabaseTasks from '../hooks/useDatabaseTasks';

const PRIORITY_WEIGHTS = {
  high: 3,
  medium: 2,
  low: 1,
};

export const TodoList: React.FC = () => {
  const [tasks, setTasks] = useDatabaseTasks();
  const [newTask, setNewTask] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'priority'>('date');

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;

    const task: Task = {
      id: crypto.randomUUID(),
      text: newTask,
      completed: false,
      priority,
      createdAt: Date.now(),
    };

    setTasks([task, ...tasks]);
    setNewTask('');
    setPriority('medium');
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => 
      t.id === id ? { ...t, completed: !t.completed } : t
    ));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const getFilteredAndSortedTasks = () => {
    let result = tasks;

    // Filter
    if (filter !== 'all') {
      result = tasks.filter(t => 
        filter === 'active' ? !t.completed : t.completed
      );
    }

    // Sort
    return [...result].sort((a, b) => {
      if (sortBy === 'priority') {
        // Sort by priority weight (High -> Low)
        const weightDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
        if (weightDiff !== 0) return weightDiff;
      }
      // Default / Fallback: Sort by date (Newest -> Oldest)
      return b.createdAt - a.createdAt;
    });
  };

  const filteredTasks = getFilteredAndSortedTasks();

  return (
    <div className="max-w-2xl mx-auto p-6">
      <form onSubmit={addTask} className="mb-8 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="What needs to be done?"
            className="flex-1 p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task['priority'])}
            className="p-3 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button
            type="submit"
            className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
          >
            <Plus size={20} />
            Add
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
          <div className="flex gap-2">
            {(['all', 'active', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-medium">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'priority')}
              className="bg-transparent border-none text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer hover:text-blue-600"
            >
              <option value="date">Date Added</option>
              <option value="priority">Priority</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No tasks found
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div
                key={task.id}
                className={`group flex items-center justify-between p-4 hover:bg-gray-50 transition-colors ${
                  task.completed ? 'bg-gray-50/50' : ''
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <button
                    onClick={() => toggleTask(task.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      task.completed
                        ? 'bg-green-500 border-green-500'
                        : 'border-gray-300 hover:border-blue-500'
                    }`}
                  >
                    {task.completed && <Check size={14} className="text-white" />}
                  </button>
                  
                  <div className="flex flex-col gap-1">
                    <span
                      className={`text-gray-800 font-medium transition-all ${
                        task.completed ? 'line-through text-gray-400' : ''
                      }`}
                    >
                      {task.text}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full w-fit font-medium ${
                        task.priority === 'high'
                          ? 'bg-red-100 text-red-700'
                          : task.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => deleteTask(task.id)}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-red-50 rounded-full"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
