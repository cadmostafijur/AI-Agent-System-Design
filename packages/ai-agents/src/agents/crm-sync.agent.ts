import { AgentInput, AgentOutput } from '../models/types';

/**
 * CRM Sync Agent
 * 
 * PURPOSE: Map conversation data and lead scores to CRM fields.
 * MODEL:   Pure rules engine — no LLM needed.
 * COST:    $0 per call
 * LATENCY: <1ms
 * 
 * This agent prepares the data payload for CRM sync.
 * Actual CRM API calls happen in the CRM service layer.
 */
export class CrmSyncAgent {
  /**
   * Prepare CRM sync payload from agent pipeline output.
   */
  prepareSyncPayload(
    input: AgentInput,
    output: AgentOutput,
  ): CrmPayload {
    return {
      contact: {
        name: input.message.senderName || 'Unknown',
        platformId: input.message.senderId,
        channel: input.channelType,
      },
      lead: {
        tag: output.leadScore.tag,
        score: output.leadScore.score,
        intent: output.leadScore.intent,
        signals: output.leadScore.signals,
      },
      conversation: {
        id: input.conversationId,
        summary: this.generateConversationSummary(input, output),
        messageCount: input.conversationHistory.length + 1,
        sentiment: output.sentiment.sentiment,
        lastActivity: new Date().toISOString(),
      },
      metadata: {
        aiConfidence: output.reply.confidence,
        processingTimeMs: output.processingTimeMs,
        autoReplied: !output.reply.requiresHuman,
      },
    };
  }

  /**
   * Generate a conversation summary for the CRM note.
   */
  private generateConversationSummary(input: AgentInput, output: AgentOutput): string {
    const parts = [
      `Channel: ${input.channelType}`,
      `Topic: ${output.understanding.topic}`,
      `Sentiment: ${output.sentiment.sentiment} (${output.sentiment.urgency} urgency)`,
      `Lead Score: ${output.leadScore.score}/100 (${output.leadScore.tag})`,
      `Intent: ${output.leadScore.intent}`,
      `Last Message: "${input.message.text.substring(0, 200)}"`,
      output.reply.requiresHuman ? 'Status: Escalated to human agent' : 'Status: Auto-replied by AI',
    ];

    if (output.leadScore.signals.length > 0) {
      parts.push(`Signals: ${output.leadScore.signals.join(', ')}`);
    }

    return parts.join('\n');
  }
}

export interface CrmPayload {
  contact: {
    name: string;
    platformId: string;
    channel: string;
  };
  lead: {
    tag: string;
    score: number;
    intent: string;
    signals: string[];
  };
  conversation: {
    id: string;
    summary: string;
    messageCount: number;
    sentiment: string;
    lastActivity: string;
  };
  metadata: {
    aiConfidence: number;
    processingTimeMs: number;
    autoReplied: boolean;
  };
}
