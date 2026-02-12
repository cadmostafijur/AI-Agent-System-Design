import { GuardrailResult } from '../models/types';

/**
 * Guardrail / Moderation Agent
 * 
 * PURPOSE: Gate both inbound messages and outbound replies for safety.
 * MODEL:   Rules engine (regex) — no LLM needed for 95% of cases.
 * COST:    $0 per call (pure logic)
 * LATENCY: <5ms
 * 
 * Checks:
 * - Prompt injection attempts
 * - Spam patterns
 * - Profanity / hate speech
 * - PII in outbound messages
 * - Brand safety violations
 */
export class GuardrailAgent {
  // Prompt injection patterns
  private readonly injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /ignore\s+(all\s+)?above\s+instructions/i,
    /system\s*:\s*/i,
    /you\s+are\s+now\s+/i,
    /pretend\s+you\s+are/i,
    /act\s+as\s+(if\s+you\s+are\s+)?a?\s*/i,
    /forget\s+(everything|all|your)/i,
    /new\s+instructions?\s*:/i,
    /override\s+(previous|your|all)/i,
    /jailbreak/i,
    /\[system\]/i,
    /\[instruction\]/i,
    /DAN\s+mode/i,
  ];

  // Spam indicators
  private readonly spamPatterns = [
    /(.)\1{10,}/,                           // Repeated characters
    /(?:https?:\/\/\S+\s*){3,}/i,          // Multiple URLs
    /(bit\.ly|tinyurl|t\.co|goo\.gl)/i,    // URL shorteners
    /(?:buy|cheap|discount|free|click|winner|congratulations).*(?:buy|cheap|discount|free|click|winner)/i,
    /\b[A-Z\s]{20,}\b/,                     // ALL CAPS blocks
  ];

  // Profanity list (abbreviated — production would use a comprehensive list)
  private readonly profanityPatterns = [
    /\b(fuck|shit|damn|bitch|ass(?:hole)?|bastard|crap)\b/i,
  ];

  // PII patterns (for outbound check)
  private readonly piiPatterns = [
    /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,       // SSN
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email in outbound
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,       // Phone number
  ];

  /**
   * Check incoming message for safety.
   */
  async checkInput(
    text: string,
    context: { senderId: string; channel: string },
  ): Promise<GuardrailResult> {
    const flags: string[] = [];
    let riskScore = 0;

    // Check prompt injection
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(text)) {
        flags.push('prompt_injection');
        riskScore += 0.8;
        break;
      }
    }

    // Check spam
    for (const pattern of this.spamPatterns) {
      if (pattern.test(text)) {
        flags.push('spam');
        riskScore += 0.5;
        break;
      }
    }

    // Check profanity (flag but don't block — customer might be angry)
    for (const pattern of this.profanityPatterns) {
      if (pattern.test(text)) {
        flags.push('profanity');
        riskScore += 0.2;
        break;
      }
    }

    // Check message length (extremely long messages are suspicious)
    if (text.length > 5000) {
      flags.push('excessive_length');
      riskScore += 0.3;
    }

    // Empty message
    if (!text.trim()) {
      flags.push('empty_message');
      riskScore += 0.1;
    }

    riskScore = Math.min(1, riskScore);

    // Block if risk is very high (spam + injection)
    const passed = riskScore < 0.7;

    return {
      passed,
      flags,
      riskScore,
      blockedReason: passed ? undefined : `Blocked: ${flags.join(', ')}`,
    };
  }

  /**
   * Check outbound (AI-generated) reply for safety.
   */
  async checkOutput(
    text: string,
    context: { companyName: string; topic: string },
  ): Promise<GuardrailResult> {
    const flags: string[] = [];
    let riskScore = 0;

    // Check for PII leaks in the response
    for (const pattern of this.piiPatterns) {
      if (pattern.test(text)) {
        flags.push('pii_leak');
        riskScore += 0.9;
        break;
      }
    }

    // Check for hallucinated promises
    const dangerousPromises = [
      /guarantee/i,
      /100%\s*(refund|money\s*back)/i,
      /lawsuit|legal\s*action/i,
      /free\s*(forever|lifetime)/i,
      /\$\d+.*(?:off|discount)/i,     // Specific dollar amounts
    ];
    for (const pattern of dangerousPromises) {
      if (pattern.test(text)) {
        flags.push('dangerous_promise');
        riskScore += 0.4;
      }
    }

    // Check for profanity in output (should never happen)
    for (const pattern of this.profanityPatterns) {
      if (pattern.test(text)) {
        flags.push('profanity_in_output');
        riskScore += 0.8;
        break;
      }
    }

    // Check response isn't too long
    if (text.length > 2000) {
      flags.push('excessive_length');
      riskScore += 0.2;
    }

    // Check response isn't empty
    if (!text.trim()) {
      flags.push('empty_response');
      riskScore += 1.0;
    }

    riskScore = Math.min(1, riskScore);
    const passed = riskScore < 0.5;

    return {
      passed,
      flags,
      riskScore,
      blockedReason: passed ? undefined : `Output blocked: ${flags.join(', ')}`,
    };
  }
}
