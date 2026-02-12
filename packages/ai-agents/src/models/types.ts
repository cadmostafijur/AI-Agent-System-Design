// ============================================
// ReplyForce AI — Agent Type Definitions
// ============================================

/** Input to the AI Agent pipeline */
export interface AgentInput {
  messageId: string;
  tenantId: string;
  conversationId: string;
  channelType: 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP' | 'TWITTER';

  // The incoming message
  message: {
    text: string;
    contentType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO';
    mediaUrl?: string;
    senderId: string;
    senderName?: string;
    timestamp: number;
  };

  // Conversation context (last N messages)
  conversationHistory: Array<{
    role: 'contact' | 'ai_bot' | 'human_agent';
    content: string;
    timestamp: number;
  }>;

  // Tenant configuration
  brandVoice: {
    companyName: string;
    tone: string;
    style: string;
    guidelines?: string;
    knowledgeBase?: string;
    maxReplyLength: number;
    useEmojis: boolean;
    language: string;
  };

  // Existing lead data (if any)
  existingLead?: {
    id: string;
    tag: string;
    score: number;
    signals: string[];
  };
}

/** Complete output from the AI Agent pipeline */
export interface AgentOutput {
  guardrailInput: GuardrailResult;
  understanding: MessageAnalysis;
  sentiment: SentimentResult;
  leadScore: LeadScore;
  reply: AutoReplyResult;
  guardrailOutput: GuardrailResult;
  processingTimeMs: number;
  tokensUsed: number;
}

/** Output from the Guardrail/Moderation Agent */
export interface GuardrailResult {
  passed: boolean;
  flags: string[];
  riskScore: number; // 0.0 - 1.0
  blockedReason?: string;
}

/** Output from the Message Understanding Agent */
export interface MessageAnalysis {
  language: string;
  entities: Array<{
    type: 'product' | 'person' | 'company' | 'location' | 'price' | 'date';
    value: string;
  }>;
  topic: 'pricing' | 'support' | 'complaint' | 'inquiry' | 'feedback' | 'greeting' | 'other';
  isQuestion: boolean;
  summary: string;
  keyPhrases: string[];
}

/** Output from the Sentiment Analysis Agent */
export interface SentimentResult {
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  score: number; // -1.0 to 1.0
  urgency: 'low' | 'medium' | 'high' | 'critical';
  emotions: string[];
}

/** Output from the Lead Scoring Agent */
export interface LeadScore {
  intent: string;
  confidence: number; // 0.0 - 1.0
  score: number; // 0 - 100
  tag: 'HOT' | 'WARM' | 'COLD';
  signals: string[];
  recommendedAction: string;
}

/** Output from the Auto-Reply Agent */
export interface AutoReplyResult {
  text: string;
  confidence: number; // 0.0 - 1.0
  requiresHuman: boolean;
  suggestedActions: string[];
  tokensUsed: number;
}

/** Configuration for the AI pipeline */
export interface PipelineConfig {
  openaiApiKey: string;
  primaryModel: string;     // e.g., 'gpt-4o'
  fastModel: string;        // e.g., 'gpt-4o-mini'
  maxTokens: number;
  temperature: number;
  enableCaching: boolean;
  cacheThreshold: number;   // Cosine similarity threshold for cache hits
}
