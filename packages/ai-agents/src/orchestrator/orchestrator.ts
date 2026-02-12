import { GuardrailAgent } from '../agents/guardrail.agent';
import { MessageUnderstandingAgent } from '../agents/message-understanding.agent';
import { SentimentAgent } from '../agents/sentiment.agent';
import { LeadScoringAgent } from '../agents/lead-scoring.agent';
import { AutoReplyAgent } from '../agents/auto-reply.agent';
import {
  AgentInput,
  AgentOutput,
  PipelineConfig,
  GuardrailResult,
} from '../models/types';

/**
 * Agent Orchestrator — Coordinates the AI agent pipeline.
 * 
 * Pipeline sequence:
 * 1. Guardrail (input)    → Block spam/injection/profanity
 * 2. Message Understanding → Parse and structure the message
 * 3. Sentiment Analysis    → Determine emotional tone and urgency
 * 4. Lead Scoring          → Score purchase intent, assign HOT/WARM/COLD
 * 5. Auto-Reply            → Generate contextual response
 * 6. Guardrail (output)    → Validate the AI response
 * 
 * Steps 2+3 run in parallel (no dependency on each other).
 * Step 4 depends on 2+3.
 * Step 5 depends on 2+3+4.
 */
export class AgentOrchestrator {
  private guardrail: GuardrailAgent;
  private understanding: MessageUnderstandingAgent;
  private sentiment: SentimentAgent;
  private leadScoring: LeadScoringAgent;
  private autoReply: AutoReplyAgent;

  constructor(private config: PipelineConfig) {
    this.guardrail = new GuardrailAgent();
    this.understanding = new MessageUnderstandingAgent(config);
    this.sentiment = new SentimentAgent(config);
    this.leadScoring = new LeadScoringAgent(config);
    this.autoReply = new AutoReplyAgent(config);
  }

  /**
   * Process a message through the full AI pipeline.
   * Returns complete analysis and auto-generated reply.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    let totalTokens = 0;

    // ── Step 1: Input Guardrail ──
    const guardrailInput = await this.guardrail.checkInput(input.message.text, {
      senderId: input.message.senderId,
      channel: input.channelType,
    });

    if (!guardrailInput.passed) {
      // Message blocked — return early with blocked response
      return this.buildBlockedResponse(guardrailInput, startTime);
    }

    // ── Steps 2 & 3: Understanding + Sentiment (parallel) ──
    const [understanding, sentiment] = await Promise.all([
      this.understanding.analyze(input),
      this.sentiment.analyze(input),
    ]);

    totalTokens += 200; // Approximate tokens for understanding

    // ── Step 4: Lead Scoring ──
    const leadScore = await this.leadScoring.score(input, understanding, sentiment);

    // ── Check for human escalation triggers ──
    if (this.shouldEscalateToHuman(sentiment, understanding, input)) {
      return this.buildEscalationResponse(
        guardrailInput, understanding, sentiment, leadScore, startTime, totalTokens,
      );
    }

    // ── Step 5: Auto-Reply Generation ──
    const reply = await this.autoReply.generate(input, understanding, sentiment, leadScore);
    totalTokens += reply.tokensUsed;

    // ── Step 6: Output Guardrail ──
    const guardrailOutput = await this.guardrail.checkOutput(reply.text, {
      companyName: input.brandVoice.companyName,
      topic: understanding.topic,
    });

    // If output fails guardrail, use fallback
    if (!guardrailOutput.passed) {
      reply.text = this.getFallbackReply(input.brandVoice.companyName, understanding.topic);
      reply.confidence = 0.5;
      reply.requiresHuman = true;
    }

    return {
      guardrailInput,
      understanding,
      sentiment,
      leadScore,
      reply,
      guardrailOutput,
      processingTimeMs: Date.now() - startTime,
      tokensUsed: totalTokens,
    };
  }

  /**
   * Determine if the conversation should be escalated to a human agent.
   */
  private shouldEscalateToHuman(
    sentiment: any,
    understanding: any,
    input: AgentInput,
  ): boolean {
    // Critical negative sentiment
    if (sentiment.urgency === 'critical' && sentiment.sentiment === 'negative') {
      return true;
    }

    // Customer explicitly requests human
    const humanRequestPatterns = [
      /speak.*(human|person|agent|someone|representative)/i,
      /talk.*(human|person|agent|someone|representative)/i,
      /real (person|human)/i,
      /transfer.*agent/i,
      /customer (service|support)/i,
    ];
    if (humanRequestPatterns.some(p => p.test(input.message.text))) {
      return true;
    }

    // Legal/compliance keywords
    const legalPatterns = [
      /lawyer|attorney|legal|lawsuit|sue|court/i,
      /gdpr|privacy|data (deletion|removal)/i,
      /refund|chargeback|dispute/i,
    ];
    if (legalPatterns.some(p => p.test(input.message.text))) {
      return true;
    }

    // Long unresolved conversation (3+ customer messages without resolution)
    const recentCustomerMsgs = input.conversationHistory
      .filter(m => m.role === 'contact')
      .slice(-5);
    if (recentCustomerMsgs.length >= 4) {
      return true;
    }

    return false;
  }

  private buildBlockedResponse(guardrail: GuardrailResult, startTime: number): AgentOutput {
    return {
      guardrailInput: guardrail,
      understanding: {
        language: 'en',
        entities: [],
        topic: 'other',
        isQuestion: false,
        summary: 'Message blocked by guardrail',
        keyPhrases: [],
      },
      sentiment: {
        sentiment: 'neutral',
        score: 0,
        urgency: 'low',
        emotions: [],
      },
      leadScore: {
        intent: 'blocked',
        confidence: 1,
        score: 0,
        tag: 'COLD',
        signals: ['guardrail_blocked'],
        recommendedAction: 'ignore',
      },
      reply: {
        text: '',
        confidence: 0,
        requiresHuman: false,
        suggestedActions: ['blocked_by_guardrail'],
        tokensUsed: 0,
      },
      guardrailOutput: { passed: true, flags: [], riskScore: 0 },
      processingTimeMs: Date.now() - startTime,
      tokensUsed: 0,
    };
  }

  private buildEscalationResponse(
    guardrail: GuardrailResult,
    understanding: any,
    sentiment: any,
    leadScore: any,
    startTime: number,
    tokens: number,
  ): AgentOutput {
    return {
      guardrailInput: guardrail,
      understanding,
      sentiment,
      leadScore,
      reply: {
        text: "Thank you for reaching out. Let me connect you with a team member who can assist you further. Someone will be with you shortly.",
        confidence: 1,
        requiresHuman: true,
        suggestedActions: ['escalate_to_human', 'notify_agent'],
        tokensUsed: 0,
      },
      guardrailOutput: { passed: true, flags: [], riskScore: 0 },
      processingTimeMs: Date.now() - startTime,
      tokensUsed: tokens,
    };
  }

  private getFallbackReply(companyName: string, topic: string): string {
    const fallbacks: Record<string, string> = {
      pricing: `Thanks for your interest in ${companyName}! I'll have a team member get back to you with detailed pricing information shortly.`,
      support: `Thank you for reaching out to ${companyName}. A support team member will assist you soon.`,
      complaint: `We're sorry to hear about your experience. A team member will look into this and get back to you as soon as possible.`,
      default: `Thank you for contacting ${companyName}! A team member will be with you shortly.`,
    };
    return fallbacks[topic] || fallbacks.default;
  }
}
