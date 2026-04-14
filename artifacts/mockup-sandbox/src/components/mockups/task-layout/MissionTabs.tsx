import React, { useState } from 'react';
import { 
  Search, Plus, Filter, Calendar as CalendarIcon, 
  CheckCircle2, Circle, Clock, AlertCircle, 
  MoreVertical, LayoutDashboard, Users,
  Target, Info, ArrowRight
} from 'lucide-react';

type Priority = 'high' | 'medium' | 'low';
type Status = 'todo' | 'in-progress' | 'review' | 'done';

interface Task {
  id: string;
  title: string;
  type: string;
  priority: Priority;
  dueDate: string;
  assignee: string;
  status: Status;
  subtasks: { completed: number; total: number };
}

const mockTasks: Task[] = [
  { id: '1', title: 'Q2 MMP Close Report', type: 'Project', priority: 'high', dueDate: 'Today', assignee: 'Sarah J.', status: 'in-progress', subtasks: { completed: 3, total: 5 } },
  { id: '2', title: 'Approve Travel Advance – Khartoum', type: 'Finance', priority: 'high', dueDate: 'Tomorrow', assignee: 'Me', status: 'todo', subtasks: { completed: 0, total: 0 } },
  { id: '3', title: 'Site Verification: Um Durman', type: 'Field Ops', priority: 'medium', dueDate: 'Oct 15', assignee: 'Me', status: 'todo', subtasks: { completed: 1, total: 4 } },
  { id: '4', title: 'Data Quality Review – West Darfur', type: 'Audit', priority: 'medium', dueDate: 'Oct 18', assignee: 'Me', status: 'in-progress', subtasks: { completed: 12, total: 20 } },
  { id: '5', title: 'Update Security Protocols', type: 'Admin', priority: 'high', dueDate: 'Overdue', assignee: 'Me', status: 'todo', subtasks: { completed: 0, total: 2 } },
  { id: '6', title: 'Weekly Partner Sync Preparation', type: 'Collaborative', priority: 'low', dueDate: 'Oct 12', assignee: 'Me', status: 'done', subtasks: { completed: 3, total: 3 } },
  { id: '7', title: 'Review Q3 Budget Allocation', type: 'Finance', priority: 'medium', dueDate: 'Oct 20', assignee: 'Me', status: 'todo', subtasks: { completed: 0, total: 1 } },
];

const priorityColors = {
  high: 'border-l-red-500 bg-red-50 text-red-700',
  medium: 'border-l-amber-500 bg-amber-50 text-amber-700',
  low: 'border-l-blue-500 bg-blue-50 text-blue-700',
};

const statusIcons = {
  'todo': <Circle className="w-4 h-4 text-slate-300" />,
  'in-progress': <Clock className="w-4 h-4 text-blue-500" />,
  'review': <AlertCircle className="w-4 h-4 text-purple-500" />,
  'done': <CheckCircle2 className="w-4 h-4 text-emerald-500" />
};

export function MissionTabs() {
  const [activeTab, setActiveTab] = useState('my-tasks');
  const [activeFilter, setActiveFilter] = useState('All');
  const [calendarConnected, setCalendarConnected] = useState(false);

  const filters = ['All', 'Personal', 'Project', 'Collaborative', 'Overdue'];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-[#0F2041] text-white shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold">P</div>
            <h1 className="text-xl font-semibold tracking-tight">PACT Command Center</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search tasks..." 
                className="bg-white/10 border border-white/20 rounded-md py-1.5 pl-9 pr-4 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-600 border border-white/20 flex items-center justify-center text-sm font-medium">
              JD
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="px-6 bg-white border-b flex gap-6">
          {[
            { id: 'my-tasks', label: 'My Tasks', icon: LayoutDashboard },
            { id: 'team-tasks', label: 'Team Tasks', icon: Users },
            { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
            { id: 'planning', label: 'Planning', icon: Target },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id 
                  ? 'border-blue-600 text-blue-700' 
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        {!calendarConnected && (
          <div className="bg-blue-50 border-b border-blue-100 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-2 text-blue-800 text-sm">
              <Info className="w-4 h-4 text-blue-600" />
              <span>Connect your PACT email to enable calendar sync and automated scheduling.</span>
            </div>
            <button 
              onClick={() => setCalendarConnected(true)}
              className="text-sm font-medium text-blue-700 bg-white px-3 py-1.5 rounded border border-blue-200 hover:bg-blue-50 transition-colors"
            >
              Connect Email
            </button>
          </div>
        )}

        <div className="p-6 max-w-7xl mx-auto">
          {activeTab === 'my-tasks' && (
            <div className="space-y-6">
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row justify-between gap-4 sm:items-center">
                <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
                  {filters.map(filter => (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                        activeFilter === filter
                          ? 'bg-slate-800 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1 sm:w-64">
                    <input 
                      type="text" 
                      placeholder="Quick add task... (Press Enter)" 
                      className="w-full bg-white border border-slate-300 rounded-md py-2 pl-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    />
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-blue-600">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mockTasks.map(task => (
                  <div key={task.id} className={`bg-white rounded-lg border shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow border-l-4 ${priorityColors[task.priority].split(' ')[0]}`}>
                    <div className="p-4 flex-1 flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-start gap-2">
                          <button className="mt-0.5 shrink-0">
                            {statusIcons[task.status]}
                          </button>
                          <h3 className={`font-medium text-slate-900 leading-snug ${task.status === 'done' ? 'line-through text-slate-500' : ''}`}>
                            {task.title}
                          </h3>
                        </div>
                        <button className="text-slate-400 hover:text-slate-600 shrink-0">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="mt-auto pt-2 flex flex-wrap gap-2 items-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                          {task.type}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          task.dueDate === 'Overdue' ? 'bg-red-100 text-red-700' : 
                          task.dueDate === 'Today' ? 'bg-amber-100 text-amber-700' : 
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {task.dueDate}
                        </span>
                      </div>
                    </div>
                    
                    <div className="px-4 py-3 bg-slate-50 border-t flex justify-between items-center text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                          {task.assignee === 'Me' ? 'ME' : task.assignee.substring(0,2).toUpperCase()}
                        </div>
                        <span>{task.assignee}</span>
                      </div>
                      {task.subtasks.total > 0 && (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{task.subtasks.completed}/{task.subtasks.total}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'team-tasks' && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Team Overview</h2>
              <p className="text-slate-500 max-w-md mb-6">
                You have organizational view permissions. Here you can monitor workload across all field teams and departments.
              </p>
              <button className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-md hover:bg-slate-800 transition-colors">
                View Department Rollup <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeTab === 'planning' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                  <div className="bg-white rounded-lg border shadow-sm p-5">
                    <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <Target className="w-5 h-5 text-blue-600" />
                      Daily Briefing
                    </h3>
                    <div className="space-y-4">
                      <div className="p-3 bg-slate-50 rounded-md border border-slate-100">
                        <p className="text-sm text-slate-600 mb-2">You have <strong className="text-slate-900">3</strong> high-priority items due today.</p>
                        <p className="text-sm text-slate-600">The West Darfur Audit requires your review before EOD.</p>
                      </div>
                      <div className="flex justify-between items-center text-sm border-t pt-4">
                        <span className="text-slate-500">Focus Score</span>
                        <span className="font-medium text-emerald-600">High (85%)</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-lg border shadow-sm p-5 h-full">
                    <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <LayoutDashboard className="w-5 h-5 text-indigo-600" />
                      Priority Matrix
                    </h3>
                    <div className="grid grid-cols-2 grid-rows-2 gap-4 h-64">
                      <div className="bg-red-50 rounded-md p-3 border border-red-100 flex flex-col">
                        <span className="text-xs font-semibold text-red-800 uppercase tracking-wider mb-2">Urgent & Important</span>
                        <div className="text-sm text-red-900 font-medium">2 Tasks</div>
                      </div>
                      <div className="bg-amber-50 rounded-md p-3 border border-amber-100 flex flex-col">
                        <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">Important, Not Urgent</span>
                        <div className="text-sm text-amber-900 font-medium">5 Tasks</div>
                      </div>
                      <div className="bg-blue-50 rounded-md p-3 border border-blue-100 flex flex-col">
                        <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-2">Urgent, Not Important</span>
                        <div className="text-sm text-blue-900 font-medium">1 Task</div>
                      </div>
                      <div className="bg-slate-50 rounded-md p-3 border border-slate-200 flex flex-col">
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Neither</span>
                        <div className="text-sm text-slate-700 font-medium">0 Tasks</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="bg-white rounded-lg border shadow-sm p-8 text-center h-64 flex flex-col items-center justify-center">
              <CalendarIcon className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">Schedule View</h3>
              <p className="text-slate-500">Connect your calendar to see your tasks alongside your meetings.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
