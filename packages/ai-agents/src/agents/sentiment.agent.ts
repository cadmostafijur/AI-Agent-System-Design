import OpenAI from 'openai';
import { AgentInput, SentimentResult, PipelineConfig } from '../models/types';
import { SENTIMENT_ANALYSIS_PROMPT } from '../prompts/sentiment.prompt';

/**
 * Sentiment Analysis Agent
 * 
 * PURPOSE: Determine emotional tone, urgency level, and specific emotions.
 * MODEL:   Rules-based (primary) + GPT-4o-mini (complex/ambiguous cases)
 * COST:    ~$0 (rules) to ~$0.0001 (LLM fallback)
 * LATENCY: <10ms (rules) to ~200ms (LLM)
 * 
 * In production, this would use a fine-tuned DistilBERT model running
 * locally for near-zero cost and <10ms inference. The LLM fallback is
 * for edge cases where the local model has low confidence.
 */
export class SentimentAgent {
  private openai: OpenAI;
  private model: string;

  // Sentiment keyword lists for rule-based analysis
  private readonly positiveWords = new Set([
    'great', 'amazing', 'awesome', 'excellent', 'fantastic', 'love', 'wonderful',
    'perfect', 'best', 'thank', 'thanks', 'appreciate', 'happy', 'glad',
    'excited', 'pleased', 'helpful', 'impressed', 'beautiful', 'brilliant',
    'outstanding', 'superb', 'terrific', 'delighted', 'enjoy', 'good',
    'nice', 'cool', 'interesting', 'recommend',
  ]);

  private readonly negativeWords = new Set([
    'terrible', 'awful', 'horrible', 'worst', 'hate', 'angry', 'frustrated',
    'disappointed', 'unacceptable', 'useless', 'pathetic', 'ridiculous',
    'disgusting', 'annoying', 'waste', 'scam', 'fraud', 'broken', 'bad',
    'slow', 'poor', 'rude', 'incompetent', 'never', 'complaint', 'refund',
    'cancel', 'problem', 'issue', 'bug', 'error', 'fail', 'wrong',
  ]);

  private readonly urgencyWords = new Set([
    'urgent', 'asap', 'immediately', 'emergency', 'critical', 'now',
    'right away', 'today', 'hurry', 'deadline', 'time-sensitive',
  ]);

  constructor(private config: PipelineConfig) {
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.model = config.fastModel;
  }

  /**
   * Analyze sentiment of a message.
   * Uses rule-based approach first; falls back to LLM for ambiguous cases.
   */
  async analyze(input: AgentInput): Promise<SentimentResult> {
    // Try rule-based analysis first (fast, free)
    const ruleResult = this.ruleBasedAnalysis(input.message.text);

    // If rule-based analysis is confident, use it
    if (ruleResult.confidence > 0.7) {
      return ruleResult.result;
    }

    // Fall back to LLM for ambiguous cases
    try {
      return await this.llmAnalysis(input);
    } catch (error) {
      console.error('Sentiment LLM fallback error:', error);
      return ruleResult.result; // Use rule-based result even if low confidence
    }
  }

  /**
   * Rule-based sentiment analysis.
   * Handles 70-80% of messages without any LLM call.
   */
  private ruleBasedAnalysis(text: string): { result: SentimentResult; confidence: number } {
    const words = text.toLowerCase().split(/\W+/).filter(Boolean);
    let positiveCount = 0;
    let negativeCount = 0;
    let urgencyCount = 0;
    const emotions: string[] = [];

    for (const word of words) {
      if (this.positiveWords.has(word)) positiveCount++;
      if (this.negativeWords.has(word)) negativeCount++;
      if (this.urgencyWords.has(word)) urgencyCount++;
    }

    // Check for negation (e.g., "not good" flips sentiment)
    const negationPattern = /\b(not|no|don't|doesn't|won't|can't|never|neither|nor|hardly|barely)\s+(\w+)/gi;
    let match;
    while ((match = negationPattern.exec(text)) !== null) {
      const negatedWord = match[2].toLowerCase();
      if (this.positiveWords.has(negatedWord)) {
        positiveCount--;
        negativeCount++;
      } else if (this.negativeWords.has(negatedWord)) {
        negativeCount--;
        positiveCount++;
      }
    }

    // Exclamation marks and CAPS add intensity
    const exclamationCount = (text.match(/!/g) || []).length;
    const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);

    // Calculate sentiment score (-1 to 1)
    const total = positiveCount + negativeCount || 1;
    let score = (positiveCount - negativeCount) / total;

    // Determine sentiment category
    let sentiment: SentimentResult['sentiment'];
    if (positiveCount > 0 && negativeCount > 0) sentiment = 'mixed';
    else if (score > 0.2) sentiment = 'positive';
    else if (score < -0.2) sentiment = 'negative';
    else sentiment = 'neutral';

    // Determine urgency
    let urgency: SentimentResult['urgency'] = 'low';
    if (urgencyCount > 0 || exclamationCount > 2 || capsRatio > 0.5) urgency = 'high';
    else if (negativeCount > 2 || exclamationCount > 0) urgency = 'medium';
    if (urgencyCount > 1 && negativeCount > 1) urgency = 'critical';

    // Detect specific emotions
    if (positiveCount > 1) emotions.push('satisfied');
    if (negativeCount > 1) emotions.push('frustrated');
    if (urgencyCount > 0) emotions.push('anxious');
    if (/\b(thank|appreciate)\b/i.test(text)) emotions.push('grateful');
    if (/\b(confused|don't understand|unclear)\b/i.test(text)) emotions.push('confused');
    if (/\b(angry|furious|outraged)\b/i.test(text)) emotions.push('angry');

    // Confidence based on signal strength
    const signalStrength = positiveCount + negativeCount;
    const confidence = Math.min(1, 0.4 + signalStrength * 0.15);

    return {
      result: {
        sentiment,
        score: Math.max(-1, Math.min(1, score)),
        urgency,
        emotions: emotions.length > 0 ? emotions : ['neutral'],
      },
      confidence,
    };
  }

  /**
   * LLM-based sentiment analysis for ambiguous cases.
   */
  private async llmAnalysis(input: AgentInput): Promise<SentimentResult> {
    const response = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      max_tokens: 150,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SENTIMENT_ANALYSIS_PROMPT },
        { role: 'user', content: input.message.text },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { sentiment: 'neutral', score: 0, urgency: 'medium', emotions: ['neutral'] };
    }

    const parsed = JSON.parse(content);
    return {
      sentiment: parsed.sentiment || 'neutral',
      score: typeof parsed.score === 'number' ? Math.max(-1, Math.min(1, parsed.score)) : 0,
      urgency: parsed.urgency || 'medium',
      emotions: Array.isArray(parsed.emotions) ? parsed.emotions : ['neutral'],
    };
  }
}
