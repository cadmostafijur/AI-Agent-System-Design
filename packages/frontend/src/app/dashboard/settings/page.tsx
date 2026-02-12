'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('brand-voice');
  const queryClient = useQueryClient();

  const tabs = [
    { id: 'brand-voice', label: 'Brand Voice' },
    { id: 'channels', label: 'Channels' },
    { id: 'team', label: 'Team' },
    { id: 'crm', label: 'CRM Integration' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-400 mt-1">Configure your AI assistant and integrations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px',
              activeTab === tab.id
                ? 'text-indigo-400 border-indigo-500'
                : 'text-gray-400 border-transparent hover:text-gray-200',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'brand-voice' && <BrandVoiceSettings />}
      {activeTab === 'channels' && <ChannelSettings />}
      {activeTab === 'team' && <TeamSettings />}
      {activeTab === 'crm' && <CrmSettings />}
    </div>
  );
}

function BrandVoiceSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['settings', 'brand-voice'],
    queryFn: () => api.getBrandVoice(),
  });

  const [formData, setFormData] = useState<any>(null);
  const brandVoice = formData || data?.data;

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.updateBrandVoice(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'brand-voice'] }),
  });

  if (!brandVoice) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="font-semibold">AI Brand Voice Configuration</h3>
        <p className="text-sm text-gray-400">
          Configure how your AI assistant communicates with customers. This affects all auto-generated replies.
        </p>

        <div>
          <label className="block text-sm font-medium mb-1.5">Company Name</label>
          <input
            type="text"
            value={brandVoice.companyName || ''}
            onChange={(e) => setFormData({ ...brandVoice, companyName: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Tone</label>
          <select
            value={brandVoice.tone || 'professional'}
            onChange={(e) => setFormData({ ...brandVoice, tone: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="casual">Casual</option>
            <option value="formal">Formal</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Style Description</label>
          <input
            type="text"
            value={brandVoice.style || ''}
            onChange={(e) => setFormData({ ...brandVoice, style: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
            placeholder="e.g., helpful and concise"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Guidelines</label>
          <textarea
            value={brandVoice.guidelines || ''}
            onChange={(e) => setFormData({ ...brandVoice, guidelines: e.target.value })}
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Additional instructions for the AI..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Knowledge Base</label>
          <textarea
            value={brandVoice.knowledgeBase || ''}
            onChange={(e) => setFormData({ ...brandVoice, knowledgeBase: e.target.value })}
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Product info, pricing, FAQ answers — the AI uses this to answer questions accurately..."
          />
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={brandVoice.useEmojis || false}
              onChange={(e) => setFormData({ ...brandVoice, useEmojis: e.target.checked })}
              className="rounded border-gray-600"
            />
            Allow emojis
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm">Max reply length:</label>
            <input
              type="number"
              value={brandVoice.maxReplyLength || 500}
              onChange={(e) => setFormData({ ...brandVoice, maxReplyLength: parseInt(e.target.value) })}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <button
          onClick={() => formData && updateMutation.mutate(formData)}
          disabled={!formData || updateMutation.isPending}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium transition"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function ChannelSettings() {
  const { data } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels(),
  });

  const channels = data?.data || [];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <h3 className="font-semibold mb-4">Connected Channels</h3>
        <div className="space-y-3">
          {['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TWITTER'].map((type) => {
            const connected = channels.find((c: any) => c.type === type);
            return (
              <div key={type} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold',
                    type === 'FACEBOOK' && 'bg-blue-600',
                    type === 'INSTAGRAM' && 'bg-gradient-to-br from-purple-600 to-pink-500',
                    type === 'WHATSAPP' && 'bg-green-600',
                    type === 'TWITTER' && 'bg-gray-600',
                  )}>
                    {type[0]}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{type.charAt(0) + type.slice(1).toLowerCase()}</div>
                    <div className="text-xs text-gray-500">
                      {connected ? connected.name : 'Not connected'}
                    </div>
                  </div>
                </div>
                <button
                  className={clsx(
                    'px-4 py-1.5 rounded-lg text-sm font-medium transition',
                    connected
                      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white',
                  )}
                >
                  {connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamSettings() {
  const { data } = useQuery({
    queryKey: ['settings', 'team'],
    queryFn: () => api.getTeamMembers(),
  });

  const members = data?.data || [];

  return (
    <div className="max-w-2xl">
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">Team Members</h3>
          <button className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition">
            Invite Member
          </button>
        </div>
        <div className="space-y-2">
          {members.map((member: any) => (
            <div key={member.id} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium">
                  {member.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <div className="text-sm font-medium">{member.name}</div>
                  <div className="text-xs text-gray-500">{member.email}</div>
                </div>
              </div>
              <span className={clsx(
                'text-xs px-2 py-1 rounded-full',
                member.role === 'ADMIN' && 'bg-indigo-500/10 text-indigo-400',
                member.role === 'AGENT' && 'bg-green-500/10 text-green-400',
                member.role === 'VIEWER' && 'bg-gray-500/10 text-gray-400',
              )}>
                {member.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CrmSettings() {
  const { data } = useQuery({
    queryKey: ['crm', 'integrations'],
    queryFn: () => api.getCrmIntegrations(),
  });

  return (
    <div className="max-w-2xl">
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <h3 className="font-semibold mb-4">CRM Integrations</h3>
        <div className="space-y-3">
          {['HubSpot', 'Salesforce', 'Pipedrive'].map((crm) => (
            <div key={crm} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg">
              <div>
                <div className="text-sm font-medium">{crm}</div>
                <div className="text-xs text-gray-500">Auto-sync leads and conversations</div>
              </div>
              <button className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition">
                Connect
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
