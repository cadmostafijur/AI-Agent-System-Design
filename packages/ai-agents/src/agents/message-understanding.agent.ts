import OpenAI from 'openai';
import { AgentInput, MessageAnalysis, PipelineConfig } from '../models/types';
import { MESSAGE_UNDERSTANDING_PROMPT } from '../prompts/understanding.prompt';

/**
 * Message Understanding Agent
 * 
 * PURPOSE: Parse and structure incoming messages — extract language, entities,
 *          topic, and key phrases for downstream agents.
 * MODEL:   GPT-4o-mini (fast, cost-effective for structured extraction)
 * COST:    ~$0.00015 per message
 * LATENCY: ~300ms
 */
export class MessageUnderstandingAgent {
  private openai: OpenAI;
  private model: string;

  constructor(private config: PipelineConfig) {
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.model = config.fastModel; // gpt-4o-mini
  }

  /**
   * Analyze a message and return structured understanding.
   */
  async analyze(input: AgentInput): Promise<MessageAnalysis> {
    try {
      // Build conversation context string
      const contextStr = input.conversationHistory
        .slice(-5) // Last 5 messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.1, // Low temperature for factual extraction
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: MESSAGE_UNDERSTANDING_PROMPT,
          },
          {
            role: 'user',
            content: [
              `Channel: ${input.channelType}`,
              `Company: ${input.brandVoice.companyName}`,
              contextStr ? `\nConversation context:\n${contextStr}` : '',
              `\nCurrent message:\n${input.message.text}`,
            ].join('\n'),
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.fallbackAnalysis(input.message.text);
      }

      const parsed = JSON.parse(content);
      return this.validateAndNormalize(parsed);
    } catch (error) {
      console.error('MessageUnderstandingAgent error:', error);
      return this.fallbackAnalysis(input.message.text);
    }
  }

  /**
   * Fallback: basic analysis without LLM.
   * Used when the LLM call fails or times out.
   */
  private fallbackAnalysis(text: string): MessageAnalysis {
    const isQuestion = /\?|^(what|how|when|where|why|who|which|can|could|would|do|does|is|are)\b/i.test(text);

    // Basic topic detection via keywords
    let topic: MessageAnalysis['topic'] = 'other';
    if (/price|cost|plan|pricing|subscription|pay|fee/i.test(text)) topic = 'pricing';
    else if (/help|issue|problem|error|broken|fix|support/i.test(text)) topic = 'support';
    else if (/angry|terrible|worst|hate|disappointed|unacceptable/i.test(text)) topic = 'complaint';
    else if (/tell me|info|information|details|learn|about/i.test(text)) topic = 'inquiry';
    else if (/great|love|awesome|thanks|good|excellent/i.test(text)) topic = 'feedback';
    else if (/^(hi|hello|hey|good morning|good evening|howdy)/i.test(text)) topic = 'greeting';

    return {
      language: 'en', // Fallback to English
      entities: [],
      topic,
      isQuestion,
      summary: text.substring(0, 100),
      keyPhrases: text.split(/\s+/).filter(w => w.length > 4).slice(0, 5),
    };
  }

  /**
   * Validate and normalize the LLM response to ensure type safety.
   */
  private validateAndNormalize(parsed: any): MessageAnalysis {
    const validTopics = ['pricing', 'support', 'complaint', 'inquiry', 'feedback', 'greeting', 'other'];

    return {
      language: typeof parsed.language === 'string' ? parsed.language : 'en',
      entities: Array.isArray(parsed.entities)
        ? parsed.entities.map((e: any) => ({
            type: e.type || 'other',
            value: String(e.value || ''),
          }))
        : [],
      topic: validTopics.includes(parsed.topic) ? parsed.topic : 'other',
      isQuestion: Boolean(parsed.is_question || parsed.isQuestion),
      summary: String(parsed.summary || '').substring(0, 200),
      keyPhrases: Array.isArray(parsed.key_phrases || parsed.keyPhrases)
        ? (parsed.key_phrases || parsed.keyPhrases).slice(0, 5).map(String)
        : [],
    };
  }
}
