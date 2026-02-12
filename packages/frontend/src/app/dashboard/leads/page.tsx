'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

export default function LeadsPage() {
  const [tagFilter, setTagFilter] = useState<string>('');
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: leadsData } = useQuery({
    queryKey: ['leads', tagFilter],
    queryFn: () => api.getLeads({ tag: tagFilter || undefined, limit: '50', sortBy: 'score', sortOrder: 'desc' }),
  });

  const { data: statsData } = useQuery({
    queryKey: ['leads', 'stats'],
    queryFn: () => api.getLeadStats(),
  });

  const updateTag = useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) => api.updateLeadTag(id, tag),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const leads = leadsData?.data || [];
  const stats = statsData?.data;

  const tagConfig: Record<string, { bg: string; text: string; border: string }> = {
    HOT: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
    WARM: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    COLD: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-gray-400 mt-1">AI-scored leads from social media conversations</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: stats?.total ?? 0, color: 'gray' },
          { label: 'Hot', value: stats?.byTag?.hot ?? 0, color: 'red' },
          { label: 'Warm', value: stats?.byTag?.warm ?? 0, color: 'amber' },
          { label: 'Cold', value: stats?.byTag?.cold ?? 0, color: 'blue' },
        ].map(({ label, value, color }) => (
          <button
            key={label}
            onClick={() => setTagFilter(label === 'Total' ? '' : label.toUpperCase())}
            className={clsx(
              'p-4 rounded-xl border transition text-left',
              tagFilter === (label === 'Total' ? '' : label.toUpperCase())
                ? 'border-indigo-500/50 bg-indigo-500/5'
                : 'border-gray-800 bg-gray-900/50 hover:border-gray-700',
            )}
          >
            <div className="text-sm text-gray-400">{label}</div>
            <div className="text-2xl font-bold mt-1">{value}</div>
          </button>
        ))}
      </div>

      {/* Lead Table */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Contact</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Channel</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Score</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Tag</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Intent</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">CRM</th>
              <th className="text-right p-4 text-xs font-medium text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead: any) => {
              const tc = tagConfig[lead.tag] || tagConfig.COLD;
              return (
                <tr key={lead.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium">
                        {lead.contact?.name?.[0] || '?'}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{lead.contact?.name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">{lead.contact?.email || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-gray-400">
                    {lead.contact?.channel || '—'}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={clsx('h-full rounded-full', tc.bg.replace('/10', ''))}
                          style={{ width: `${lead.score}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono">{lead.score}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={clsx('text-xs px-2 py-1 rounded-full font-medium border', tc.bg, tc.text, tc.border)}>
                      {lead.tag}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-400">
                    {lead.intent || '—'}
                  </td>
                  <td className="p-4">
                    {lead.crmSynced ? (
                      <span className="text-xs text-green-400">Synced</span>
                    ) : (
                      <span className="text-xs text-gray-500">Pending</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-1 justify-end">
                      {['HOT', 'WARM', 'COLD'].map((tag) => (
                        <button
                          key={tag}
                          onClick={() => updateTag.mutate({ id: lead.id, tag })}
                          disabled={lead.tag === tag}
                          className={clsx(
                            'px-2 py-1 rounded text-[10px] font-medium transition',
                            lead.tag === tag
                              ? 'opacity-50 cursor-not-allowed'
                              : 'hover:opacity-80',
                            tagConfig[tag].bg, tagConfig[tag].text,
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {leads.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            No leads found. Leads are created automatically when customers message you.
          </div>
        )}
      </div>
    </div>
  );
}
