import { AgentInput, MessageAnalysis, SentimentResult, LeadScore, PipelineConfig } from '../models/types';

/**
 * Intent & Lead Scoring Agent
 * 
 * PURPOSE: Classify purchase intent and assign HOT/WARM/COLD tag.
 * MODEL:   Weighted rules engine (primary) — LLM only for edge cases.
 * COST:    ~$0 per call (pure logic for 90%+ of cases)
 * LATENCY: <5ms
 * 
 * This agent uses a deterministic, interpretable scoring model rather than
 * an LLM because:
 * 1. Lead scoring needs to be consistent and reproducible
 * 2. Business rules need to be easily adjustable without retraining
 * 3. Score explanations must be auditable (signals array)
 * 4. Cost at scale: 10K messages/day × $0 = $0
 */
export class LeadScoringAgent {
  constructor(private config: PipelineConfig) {}

  /**
   * Score a lead based on message content, sentiment, and conversation history.
   */
  async score(
    input: AgentInput,
    understanding: MessageAnalysis,
    sentiment: SentimentResult,
  ): Promise<LeadScore> {
    let score = 0;
    const signals: string[] = [];
    let intent = 'unknown';
    let recommendedAction = 'monitor';

    // ── Scoring Rules ──

    // Topic-based signals
    switch (understanding.topic) {
      case 'pricing':
        score += 30;
        signals.push('pricing_inquiry');
        intent = 'purchase_evaluation';
        break;
      case 'inquiry':
        score += 20;
        signals.push('product_inquiry');
        intent = 'information_seeking';
        break;
      case 'support':
        score += 10;
        signals.push('support_request');
        intent = 'support';
        break;
      case 'complaint':
        score -= 10;
        signals.push('complaint');
        intent = 'complaint_resolution';
        break;
      case 'feedback':
        score += 15;
        signals.push('feedback');
        intent = 'engagement';
        break;
      case 'greeting':
        score += 5;
        signals.push('initial_contact');
        intent = 'initial_contact';
        break;
    }

    // Question-based signals
    if (understanding.isQuestion) {
      score += 5;
      signals.push('active_inquiry');
    }

    // Entity-based signals
    for (const entity of understanding.entities) {
      if (entity.type === 'product') {
        score += 15;
        signals.push(`product_mention:${entity.value}`);
        intent = 'product_interest';
      }
      if (entity.type === 'price') {
        score += 20;
        signals.push('price_mention');
        intent = 'purchase_evaluation';
      }
    }

    // Keyword-based purchase intent signals
    const text = input.message.text.toLowerCase();

    // High-intent keywords
    if (/\b(buy|purchase|order|subscribe|sign up|get started|pricing|demo|trial)\b/i.test(text)) {
      score += 25;
      signals.push('high_intent_keyword');
      intent = 'purchase_intent';
    }

    // Availability/urgency keywords
    if (/\b(available|in stock|how soon|when can|delivery|shipping)\b/i.test(text)) {
      score += 15;
      signals.push('availability_inquiry');
    }

    // Urgency language
    if (/\b(need|asap|urgent|today|right now|immediately)\b/i.test(text)) {
      score += 15;
      signals.push('urgency_language');
    }

    // Comparison shopping
    if (/\b(compare|vs|versus|alternative|better than|difference)\b/i.test(text)) {
      score += 10;
      signals.push('comparison_shopping');
      intent = 'evaluation';
    }

    // Negative intent signals
    if (/\b(not interested|unsubscribe|stop|remove|spam)\b/i.test(text)) {
      score -= 30;
      signals.push('negative_intent');
      intent = 'opt_out';
    }

    if (/\b(cancel|refund|return|exchange)\b/i.test(text)) {
      score -= 15;
      signals.push('cancellation_signal');
      intent = 'cancellation';
    }

    // Sentiment-based adjustments
    if (sentiment.sentiment === 'positive') {
      score += 10;
      signals.push('positive_sentiment');
    } else if (sentiment.sentiment === 'negative') {
      score -= 10;
      signals.push('negative_sentiment');
    }

    // Engagement signals from conversation history
    const customerMessages = input.conversationHistory.filter(m => m.role === 'contact');
    if (customerMessages.length >= 3) {
      score += 15;
      signals.push('repeat_engagement');
    }
    if (customerMessages.length >= 5) {
      score += 10;
      signals.push('high_engagement');
    }

    // Existing lead history — momentum
    if (input.existingLead) {
      // If lead was previously warm and showing more signals, boost
      if (input.existingLead.tag === 'WARM' && score > 30) {
        score += 10;
        signals.push('warming_up');
      }
      // Blend with existing score (70% new, 30% existing)
      score = Math.round(score * 0.7 + input.existingLead.score * 0.3);
    }

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine tag
    let tag: LeadScore['tag'];
    if (score >= 70) {
      tag = 'HOT';
      recommendedAction = 'immediate_follow_up';
    } else if (score >= 40) {
      tag = 'WARM';
      recommendedAction = 'nurture_campaign';
    } else {
      tag = 'COLD';
      recommendedAction = 'monitor';
    }

    // Confidence based on signal count and clarity
    const confidence = Math.min(1, 0.5 + signals.length * 0.08);

    return {
      intent,
      confidence,
      score,
      tag,
      signals,
      recommendedAction,
    };
  }
}
