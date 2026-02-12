'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtime } from '@/hooks/use-realtime';
import { clsx } from 'clsx';

export default function DashboardOverview() {
  const { data: overview, refetch } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.getAnalyticsOverview(),
  });

  const { data: leadStats } = useQuery({
    queryKey: ['leads', 'stats'],
    queryFn: () => api.getLeadStats(),
  });

  // Real-time updates
  useRealtime({
    'message.new': () => refetch(),
    'lead.tag_updated': () => refetch(),
  });

  const stats = overview?.data;
  const leads = leadStats?.data;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-400 mt-1">Overview of your AI-powered social media operations</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          title="Open Conversations"
          value={stats?.conversations?.open ?? '—'}
          subtitle={`${stats?.conversations?.total ?? 0} total`}
          color="indigo"
        />
        <KpiCard
          title="Messages Today"
          value={stats?.messages?.today ?? '—'}
          subtitle={`${stats?.messages?.thisWeek ?? 0} this week`}
          color="blue"
        />
        <KpiCard
          title="Hot Leads"
          value={leads?.byTag?.hot ?? '—'}
          subtitle={`${leads?.conversionRate ?? 0}% conversion rate`}
          color="red"
        />
        <KpiCard
          title="AI Automation Rate"
          value={`${stats?.ai?.automationRate ?? 0}%`}
          subtitle={`${stats?.ai?.repliestoday ?? 0} auto-replies today`}
          color="green"
        />
      </div>

      {/* Lead Distribution & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Distribution */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Lead Distribution</h2>
          <div className="space-y-4">
            <LeadBar label="Hot" count={leads?.byTag?.hot ?? 0} total={leads?.total ?? 1} color="bg-red-500" />
            <LeadBar label="Warm" count={leads?.byTag?.warm ?? 0} total={leads?.total ?? 1} color="bg-amber-500" />
            <LeadBar label="Cold" count={leads?.byTag?.cold ?? 0} total={leads?.total ?? 1} color="bg-blue-500" />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-sm">
            <span className="text-gray-400">Total Leads</span>
            <span className="font-medium">{leads?.total ?? 0}</span>
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span className="text-gray-400">CRM Synced</span>
            <span className="font-medium text-green-400">{leads?.crmSynced ?? 0}</span>
          </div>
        </div>

        {/* Connected Channels */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Active Channels</h2>
          <div className="space-y-3">
            {['Facebook', 'Instagram', 'WhatsApp', 'Twitter/X'].map((channel) => (
              <div
                key={channel}
                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                    channel === 'Facebook' && 'bg-blue-600',
                    channel === 'Instagram' && 'bg-gradient-to-br from-purple-600 to-pink-500',
                    channel === 'WhatsApp' && 'bg-green-600',
                    channel === 'Twitter/X' && 'bg-gray-700',
                  )}>
                    {channel[0]}
                  </div>
                  <span className="text-sm font-medium">{channel}</span>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  Connected
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Hot Leads */}
      {leads?.recentHotLeads && leads.recentHotLeads.length > 0 && (
        <div className="mt-6 bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Hot Leads</h2>
          <div className="space-y-2">
            {leads.recentHotLeads.map((lead: any) => (
              <div key={lead.id} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-xs font-bold">
                    {lead.contact?.name?.[0] || '?'}
                  </div>
                  <span className="text-sm">{lead.contact?.name || 'Unknown'}</span>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                  HOT
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: 'border-indigo-500/30 bg-indigo-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    green: 'border-green-500/30 bg-green-500/5',
  };

  return (
    <div className={clsx('p-5 rounded-xl border', colorMap[color] || colorMap.indigo)}>
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
    </div>
  );
}

function LeadBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">{count} ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
