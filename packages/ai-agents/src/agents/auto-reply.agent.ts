import OpenAI from 'openai';
import {
  AgentInput,
  MessageAnalysis,
  SentimentResult,
  LeadScore,
  AutoReplyResult,
  PipelineConfig,
} from '../models/types';
import { AUTO_REPLY_PROMPT } from '../prompts/auto-reply.prompt';

/**
 * Auto-Reply Generation Agent
 * 
 * PURPOSE: Generate contextual, on-brand replies to customer messages.
 * MODEL:   GPT-4o (quality matters — this text is customer-facing)
 * COST:    ~$0.003 per reply (500 input + 200 output tokens avg)
 * LATENCY: ~800ms
 * 
 * Uses RAG pattern: brand voice + knowledge base + conversation context
 * are injected into the prompt for grounded, accurate responses.
 */
export class AutoReplyAgent {
  private openai: OpenAI;
  private model: string;

  constructor(private config: PipelineConfig) {
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.model = config.primaryModel; // gpt-4o for quality
  }

  /**
   * Generate a reply based on message analysis, sentiment, and lead score.
   */
  async generate(
    input: AgentInput,
    understanding: MessageAnalysis,
    sentiment: SentimentResult,
    leadScore: LeadScore,
  ): Promise<AutoReplyResult> {
    // Check for template-eligible messages (skip LLM for simple cases)
    const templateReply = this.checkTemplates(understanding, input);
    if (templateReply) {
      return templateReply;
    }

    try {
      // Build the system prompt with brand voice and context
      const systemPrompt = this.buildSystemPrompt(input, understanding, sentiment, leadScore);

      // Build conversation history for context
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
      ];

      // Add conversation history
      for (const msg of input.conversationHistory.slice(-5)) {
        messages.push({
          role: msg.role === 'contact' ? 'user' : 'assistant',
          content: msg.content,
        });
      }

      // Add current message
      messages.push({ role: 'user', content: input.message.text });

      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        messages,
      });

      const replyText = response.choices[0]?.message?.content || '';
      const tokensUsed =
        (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);

      // Determine confidence based on response characteristics
      const confidence = this.calculateConfidence(replyText, understanding, response);

      return {
        text: replyText.trim(),
        confidence,
        requiresHuman: confidence < 0.5,
        suggestedActions: this.getSuggestedActions(leadScore, understanding),
        tokensUsed,
      };
    } catch (error) {
      console.error('AutoReplyAgent error:', error);
      // Return fallback response
      return {
        text: `Thank you for reaching out to ${input.brandVoice.companyName}! A team member will get back to you shortly.`,
        confidence: 0.3,
        requiresHuman: true,
        suggestedActions: ['escalate_to_human'],
        tokensUsed: 0,
      };
    }
  }

  /**
   * Check if the message can be handled with a template (no LLM needed).
   * Saves ~$0.003 per message for simple greetings and common patterns.
   */
  private checkTemplates(
    understanding: MessageAnalysis,
    input: AgentInput,
  ): AutoReplyResult | null {
    const companyName = input.brandVoice.companyName;

    // Simple greetings
    if (understanding.topic === 'greeting' && !understanding.isQuestion) {
      const greetings = [
        `Hi there! Welcome to ${companyName}. How can I help you today?`,
        `Hello! Thanks for reaching out to ${companyName}. What can I assist you with?`,
        `Hey! Great to hear from you. How can ${companyName} help you today?`,
      ];
      return {
        text: greetings[Math.floor(Math.random() * greetings.length)],
        confidence: 0.95,
        requiresHuman: false,
        suggestedActions: [],
        tokensUsed: 0,
      };
    }

    // "Thanks" with no question
    if (/^(thank|thanks|thx|ty)\b/i.test(input.message.text) && !understanding.isQuestion) {
      return {
        text: `You're welcome! If you need anything else, don't hesitate to reach out. We're here to help!`,
        confidence: 0.95,
        requiresHuman: false,
        suggestedActions: [],
        tokensUsed: 0,
      };
    }

    return null; // No template match — use LLM
  }

  /**
   * Build the system prompt with full context.
   */
  private buildSystemPrompt(
    input: AgentInput,
    understanding: MessageAnalysis,
    sentiment: SentimentResult,
    leadScore: LeadScore,
  ): string {
    let prompt = AUTO_REPLY_PROMPT;

    // Replace template variables
    prompt = prompt.replace('{company_name}', input.brandVoice.companyName);
    prompt = prompt.replace('{tone}', input.brandVoice.tone);
    prompt = prompt.replace('{style}', input.brandVoice.style);
    prompt = prompt.replace('{guidelines}', input.brandVoice.guidelines || 'None specified');
    prompt = prompt.replace('{max_reply_length}', String(input.brandVoice.maxReplyLength));
    prompt = prompt.replace('{language}', input.brandVoice.language);
    prompt = prompt.replace('{channel}', input.channelType);
    prompt = prompt.replace('{use_emojis}', input.brandVoice.useEmojis ? 'allowed' : 'not allowed');

    // Inject knowledge base if available
    const knowledgeBase = input.brandVoice.knowledgeBase || 'No specific knowledge base provided.';
    prompt = prompt.replace('{knowledge_base}', knowledgeBase);

    // Inject analysis context
    prompt = prompt.replace('{topic}', understanding.topic);
    prompt = prompt.replace('{sentiment}', sentiment.sentiment);
    prompt = prompt.replace('{urgency}', sentiment.urgency);
    prompt = prompt.replace('{lead_tag}', leadScore.tag);
    prompt = prompt.replace('{intent}', leadScore.intent);

    return prompt;
  }

  /**
   * Calculate response confidence.
   */
  private calculateConfidence(
    reply: string,
    understanding: MessageAnalysis,
    response: any,
  ): number {
    let confidence = 0.8; // Base confidence

    // Reduce if response seems generic
    if (reply.length < 20) confidence -= 0.2;
    if (/I'm not sure|I don't know|I cannot/i.test(reply)) confidence -= 0.2;

    // Reduce for complex topics
    if (understanding.topic === 'complaint') confidence -= 0.1;
    if (understanding.topic === 'support') confidence -= 0.05;

    // Boost for clear matches
    if (understanding.topic === 'greeting') confidence += 0.15;
    if (understanding.topic === 'feedback') confidence += 0.1;

    // Reduce if finish reason suggests truncation
    if (response.choices?.[0]?.finish_reason === 'length') confidence -= 0.15;

    return Math.max(0.1, Math.min(1, confidence));
  }

  /**
   * Suggest follow-up actions based on the analysis.
   */
  private getSuggestedActions(leadScore: LeadScore, understanding: MessageAnalysis): string[] {
    const actions: string[] = [];

    if (leadScore.tag === 'HOT') {
      actions.push('notify_sales_team');
      actions.push('schedule_follow_up');
    }

    if (understanding.topic === 'pricing') {
      actions.push('send_pricing_info');
    }

    if (understanding.topic === 'complaint') {
      actions.push('create_support_ticket');
      actions.push('escalate_if_unresolved');
    }

    return actions;
  }
}
