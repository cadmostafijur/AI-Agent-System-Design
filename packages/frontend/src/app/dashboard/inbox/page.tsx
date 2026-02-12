'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtime } from '@/hooks/use-realtime';
import { clsx } from 'clsx';

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const queryClient = useQueryClient();

  // Fetch conversations
  const { data: convData } = useQuery({
    queryKey: ['conversations', statusFilter],
    queryFn: () => api.getConversations({ status: statusFilter, limit: '30' }),
  });

  // Fetch selected conversation detail
  const { data: detail } = useQuery({
    queryKey: ['conversation', selectedId],
    queryFn: () => api.getConversation(selectedId!),
    enabled: !!selectedId,
  });

  // Send reply mutation
  const sendReply = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.sendReply(id, content),
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['conversation', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Real-time message updates
  const handleNewMessage = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    if (selectedId) {
      queryClient.invalidateQueries({ queryKey: ['conversation', selectedId] });
    }
  }, [selectedId, queryClient]);

  useRealtime({
    'message.new': handleNewMessage,
    'conversation.status_changed': handleNewMessage,
  });

  const conversations = convData?.data || [];
  const messages = detail?.data?.messages || [];
  const selectedConversation = detail?.data;

  const channelColors: Record<string, string> = {
    FACEBOOK: 'bg-blue-600',
    INSTAGRAM: 'bg-linear-to-br from-purple-600 to-pink-500',
    WHATSAPP: 'bg-green-600',
    TWITTER: 'bg-gray-600',
  };

  return (
    <div className="flex h-full">
      {/* Conversation List */}
      <div className="w-96 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-semibold mb-3">Inbox</h1>
          <div className="flex gap-1">
            {['OPEN', 'NEEDS_HUMAN', 'CLOSED'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  statusFilter === status
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800',
                )}
              >
                {status === 'NEEDS_HUMAN' ? 'Escalated' : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv: any) => (
            <button
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              className={clsx(
                'w-full p-4 text-left border-b border-gray-800/50 hover:bg-gray-800/30 transition',
                selectedId === conv.id && 'bg-gray-800/50',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium">
                    {conv.contact?.name?.[0] || '?'}
                  </div>
                  <div className={clsx(
                    'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-gray-950',
                    channelColors[conv.channel?.type] || 'bg-gray-500',
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-medium truncate">
                      {conv.contact?.name || 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-500 ml-2 shrink-0">
                      {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {conv.lastMessagePreview || 'No messages yet'}
                  </p>
                  <div className="flex gap-1.5 mt-1.5">
                    {conv.lead?.tag && (
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                        conv.lead.tag === 'HOT' && 'bg-red-500/10 text-red-400',
                        conv.lead.tag === 'WARM' && 'bg-amber-500/10 text-amber-400',
                        conv.lead.tag === 'COLD' && 'bg-blue-500/10 text-blue-400',
                      )}>
                        {conv.lead.tag}
                      </span>
                    )}
                    {conv.status === 'NEEDS_HUMAN' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-medium">
                        Needs Human
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}

          {conversations.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              No conversations found
            </div>
          )}
        </div>
      </div>

      {/* Message Thread */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-medium">
                  {selectedConversation.contact?.name?.[0] || '?'}
                </div>
                <div>
                  <div className="font-medium">
                    {selectedConversation.contact?.name || 'Unknown'}
                  </div>
                  <div className="text-xs text-gray-400">
                    {selectedConversation.channel?.name} &middot; {selectedConversation.channel?.type}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => api.updateConversationStatus(selectedId!, 'CLOSED')}
                  className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg: any) => (
                <div
                  key={msg.id}
                  className={clsx(
                    'max-w-[70%] animate-slide-in',
                    msg.senderType === 'CONTACT' ? 'mr-auto' : 'ml-auto',
                  )}
                >
                  <div
                    className={clsx(
                      'px-4 py-2.5 rounded-2xl text-sm',
                      msg.senderType === 'CONTACT'
                        ? 'bg-gray-800 text-gray-100 rounded-bl-md'
                        : msg.senderType === 'AI_BOT'
                          ? 'bg-indigo-600/20 text-indigo-100 border border-indigo-500/20 rounded-br-md'
                          : 'bg-green-600/20 text-green-100 border border-green-500/20 rounded-br-md',
                    )}
                  >
                    {msg.content}
                  </div>
                  <div className={clsx(
                    'text-[10px] text-gray-500 mt-1 px-1',
                    msg.senderType === 'CONTACT' ? 'text-left' : 'text-right',
                  )}>
                    {msg.senderType === 'AI_BOT' && '🤖 AI · '}
                    {msg.senderType === 'HUMAN_AGENT' && '👤 Agent · '}
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {msg.aiConfidence && ` · ${(msg.aiConfidence * 100).toFixed(0)}% confident`}
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Box */}
            <div className="p-4 border-t border-gray-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && replyText.trim()) {
                      sendReply.mutate({ id: selectedId!, content: replyText });
                    }
                  }}
                  placeholder="Type your reply..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 transition"
                />
                <button
                  onClick={() => {
                    if (replyText.trim()) {
                      sendReply.mutate({ id: selectedId!, content: replyText });
                    }
                  }}
                  disabled={!replyText.trim() || sendReply.isPending}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium transition"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-3">💬</div>
              <p>Select a conversation to view messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
