import { useState } from 'react';
import { Folder, FileText, Image, Clock, Search, Plus, ChevronRight, Download, Eye, Star, GitFork, AlertCircle, Upload, Lock, Globe, Users } from 'lucide-react';

const breadcrumb = ['PACT Drive', 'HR', 'Profiles'];

const entries = [
  { name: 'Contracts', type: 'folder', items: 9, message: 'Updated auto-sync policy', time: '2 hours ago' },
  { name: 'Payroll Records', type: 'folder', items: 24, message: 'Added Q3 payslips', time: 'Yesterday' },
  { name: 'Training', type: 'folder', items: 18, message: 'New onboarding materials', time: '3 days ago' },
  { name: 'Elsiddig_Ibrahim_Profile.pdf', type: 'pdf', size: '1.4 MB', message: 'Auto-generated on profile save', time: '2 hours ago', badge: 'New' },
  { name: 'Amira_Khalil_Profile.pdf', type: 'pdf', size: '980 KB', message: 'Auto-generated on profile save', time: '5 hours ago' },
  { name: 'Marcus_Tutu_Profile.pdf', type: 'pdf', size: '1.1 MB', message: 'Auto-generated on profile save', time: 'Yesterday' },
  { name: 'Lena_Mwangi_Profile.pdf', type: 'pdf', size: '870 KB', message: 'Updated after verification', time: '3 days ago' },
  { name: 'HR_Overview.md', type: 'doc', size: '12 KB', message: 'Updated index', time: '1 week ago' },
];

const about = {
  description: 'Centralized HR document repository for PACT field operations. Auto-synced profiles and managed contracts.',
  tags: ['hr', 'profiles', 'auto-generated', 'confidential'],
  files: 847,
  size: '63 GB',
};

export function GithubLayout() {
  const [starred, setStarred] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  return (
    <div className="flex h-screen bg-[#0D1117] text-[#E6EDF3] font-mono text-sm overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-[#161B22] border-b border-[#30363D] px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-[#58A6FF] hover:underline cursor-pointer">pact-team</span>
            <span className="text-gray-500">/</span>
            <span className="text-white font-semibold">workspace</span>
            <span className="text-[10px] border border-[#30363D] rounded-full px-2 py-0.5 text-gray-400 ml-1">Internal</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#21262D] border border-[#30363D] rounded-md px-3 py-1.5 hover:border-[#58A6FF] cursor-pointer">
              <Eye className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-300">Watch</span>
              <span className="text-xs text-gray-500 border-l border-[#30363D] pl-1.5 ml-0.5">12</span>
            </div>
            <button onClick={() => setStarred(!starred)} className={`flex items-center gap-1.5 border rounded-md px-3 py-1.5 ${starred ? 'bg-yellow-600/20 border-yellow-600/50 text-yellow-400' : 'bg-[#21262D] border-[#30363D] text-gray-300 hover:border-[#58A6FF]'}`}>
              <Star className={`w-3.5 h-3.5 ${starred ? 'fill-yellow-400' : ''}`} />
              <span className="text-xs">{starred ? 'Starred' : 'Star'}</span>
              <span className="text-xs text-gray-500 border-l border-[#30363D] pl-1.5 ml-0.5">38</span>
            </button>
            <button className="flex items-center gap-1.5 bg-[#21262D] border border-[#30363D] rounded-md px-3 py-1.5 hover:border-[#58A6FF]">
              <Upload className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-300">Upload</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* File browser */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm mb-4">
              {breadcrumb.map((crumb, i) => (
                <span key={crumb} className="flex items-center gap-1">
                  <span className={i < breadcrumb.length - 1 ? 'text-[#58A6FF] hover:underline cursor-pointer' : 'text-white font-semibold'}>
                    {crumb}
                  </span>
                  {i < breadcrumb.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                </span>
              ))}
            </div>

            {/* Commit bar */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-t-lg px-4 py-2.5 flex items-center gap-3 text-xs">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-[9px]">EI</div>
              <span className="text-gray-300">Auto-sync profiles</span>
              <span className="text-[#58A6FF] ml-auto font-mono">a3f9b21</span>
              <span className="text-gray-500">2 hours ago</span>
              <span className="text-gray-500 border-l border-[#30363D] pl-3 ml-1 flex items-center gap-1"><Clock className="w-3 h-3" /> 124 commits</span>
            </div>

            {/* File table */}
            <div className="border border-[#30363D] border-t-0 rounded-b-lg overflow-hidden">
              {entries.map((entry, i) => {
                const isFolder = entry.type === 'folder';
                return (
                  <div
                    key={entry.name}
                    onMouseEnter={() => setHoveredRow(entry.name)}
                    onMouseLeave={() => setHoveredRow(null)}
                    className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-[#21262D]' : ''} hover:bg-[#161B22] cursor-pointer group`}
                  >
                    {isFolder
                      ? <Folder className="w-4 h-4 text-[#58A6FF] shrink-0" />
                      : <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <span className="text-[#58A6FF] hover:underline text-xs">{entry.name}</span>
                      {(entry as any).badge && <span className="ml-2 text-[9px] bg-green-900/60 text-green-400 border border-green-700/50 rounded-full px-1.5">{(entry as any).badge}</span>}
                    </div>
                    <span className="text-xs text-gray-500 flex-1 truncate hidden md:block">{entry.message}</span>
                    <span className="text-xs text-gray-500 shrink-0 w-24 text-right">{entry.time}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* About sidebar */}
          <div className="w-60 shrink-0 border-l border-[#30363D] p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-2">About</h3>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">{about.description}</p>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {about.tags.map(tag => (
                <span key={tag} className="text-[10px] text-[#58A6FF] border border-[#1F6FEB]/50 rounded-full px-2 py-0.5 hover:bg-[#1F6FEB]/10 cursor-pointer">{tag}</span>
              ))}
            </div>

            <div className="space-y-2 text-xs text-gray-400">
              <div className="flex items-center gap-2"><Star className="w-3.5 h-3.5" /><span>38 starred</span></div>
              <div className="flex items-center gap-2"><Eye className="w-3.5 h-3.5" /><span>12 watching</span></div>
              <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" /><span>{about.files} files</span></div>
              <div className="flex items-center gap-2"><Download className="w-3.5 h-3.5" /><span>{about.size} total</span></div>
            </div>

            <div className="mt-4 pt-4 border-t border-[#30363D]">
              <div className="text-xs font-semibold text-white mb-2">Security</div>
              <div className="flex items-center gap-2 text-xs text-green-400">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>No vulnerabilities</span>
              </div>
            </div>

            <button className="w-full mt-4 text-xs bg-[#21262D] border border-[#30363D] text-gray-300 rounded-md py-2 hover:border-[#58A6FF] flex items-center justify-center gap-2">
              <Lock className="w-3.5 h-3.5" /> Manage access
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
