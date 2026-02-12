'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

export default function AnalyticsPage() {
  const { data: overview } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.getAnalyticsOverview(),
  });

  const { data: funnel } = useQuery({
    queryKey: ['analytics', 'lead-funnel'],
    queryFn: () => api.getLeadFunnel(),
  });

  const { data: responseTime } = useQuery({
    queryKey: ['analytics', 'response-time'],
    queryFn: () => api.getResponseTimeStats(7),
  });

  const stats = overview?.data;
  const funnelData = funnel?.data?.funnel || [];
  const rtStats = responseTime?.data;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-gray-400 mt-1">Performance metrics for your AI agents and lead conversion</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Avg Response Time"
          value={rtStats?.avgResponseTime || '—'}
          detail={`P95: ${rtStats?.p95ResponseTime || '—'}`}
        />
        <MetricCard
          title="AI Auto-Replies"
          value={rtStats?.totalAutoReplies ?? '—'}
          detail={`Last ${rtStats?.period || '7d'}`}
        />
        <MetricCard
          title="Automation Rate"
          value={`${stats?.ai?.automationRate || 0}%`}
          detail="Messages handled by AI"
        />
        <MetricCard
          title="Active Channels"
          value={stats?.channels?.active ?? '—'}
          detail="Connected and running"
        />
      </div>

      {/* Lead Funnel */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-6">Lead Conversion Funnel</h2>
        <div className="space-y-4">
          {funnelData.map((stage: any, index: number) => {
            const width = Math.max(10, Number(stage.percentage));
            const colors = [
              'bg-gray-500',
              'bg-blue-500',
              'bg-amber-500',
              'bg-red-500',
              'bg-green-500',
            ];
            return (
              <div key={stage.stage} className="flex items-center gap-4">
                <div className="w-32 text-sm text-gray-400 text-right flex-shrink-0">
                  {stage.stage}
                </div>
                <div className="flex-1">
                  <div className="h-8 bg-gray-800 rounded-lg overflow-hidden">
                    <div
                      className={clsx(
                        'h-full rounded-lg flex items-center px-3 transition-all duration-700',
                        colors[index] || colors[0],
                      )}
                      style={{ width: `${width}%` }}
                    >
                      <span className="text-xs font-medium text-white">
                        {stage.count}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-16 text-sm text-gray-500 text-right">
                  {stage.percentage}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Agent Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">AI Agent Pipeline</h2>
          <div className="space-y-3">
            {[
              { agent: 'Guardrail Agent', latency: '<5ms', cost: '$0', model: 'Rules Engine' },
              { agent: 'Message Understanding', latency: '~300ms', cost: '$0.00015', model: 'GPT-4o-mini' },
              { agent: 'Sentiment Analysis', latency: '<10ms', cost: '$0', model: 'Local Model' },
              { agent: 'Lead Scoring', latency: '<5ms', cost: '$0', model: 'Rules Engine' },
              { agent: 'Auto-Reply', latency: '~800ms', cost: '$0.003', model: 'GPT-4o' },
              { agent: 'Output Guardrail', latency: '<5ms', cost: '$0', model: 'Rules Engine' },
            ].map((item) => (
              <div key={item.agent} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                <div>
                  <div className="text-sm font-medium">{item.agent}</div>
                  <div className="text-xs text-gray-500">{item.model}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-indigo-400">{item.latency}</div>
                  <div className="text-xs text-gray-500">{item.cost}/msg</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-sm">
            <span className="text-gray-400">Total per message</span>
            <div className="text-right">
              <div className="text-indigo-400">~2.3s</div>
              <div className="text-gray-500">$0.00315</div>
            </div>
          </div>
        </div>

        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">System Health</h2>
          <div className="space-y-3">
            {[
              { name: 'API Server', status: 'Healthy', uptime: '99.99%' },
              { name: 'Message Queue', status: 'Healthy', uptime: '99.98%' },
              { name: 'AI Pipeline', status: 'Healthy', uptime: '99.95%' },
              { name: 'Database', status: 'Healthy', uptime: '99.99%' },
              { name: 'Redis Cache', status: 'Healthy', uptime: '99.99%' },
              { name: 'WebSocket', status: 'Healthy', uptime: '99.97%' },
            ].map((item) => (
              <div key={item.name} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm">{item.name}</span>
                </div>
                <span className="text-xs text-gray-400">{item.uptime}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, detail }: { title: string; value: string | number; detail: string }) {
  return (
    <div className="p-5 rounded-xl border border-gray-800 bg-gray-900/50">
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{detail}</div>
    </div>
  );
}
