# ReplyForce AI — System Architecture Document

**Version:** 1.0.0  
**Date:** 2026-02-12  
**Author:** Staff Architect  
**Status:** Production Design  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [AI Agent Design](#3-ai-agent-design)
4. [Data Flow: End-to-End](#4-data-flow-end-to-end)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Data Security & Privacy](#6-data-security--privacy)
7. [Cost Optimization Strategy](#7-cost-optimization-strategy)
8. [Failure Scenarios & Recovery](#8-failure-scenarios--recovery)
9. [Tech Stack](#9-tech-stack)
10. [Database Schema](#10-database-schema)
11. [API Contracts](#11-api-contracts)
12. [SaaS Pricing & Multi-Tenant Strategy](#12-saas-pricing--multi-tenant-strategy)

---

## 1. Executive Summary

**ReplyForce AI** is a multi-tenant SaaS platform that enables businesses to connect their social media accounts (Facebook, Instagram, WhatsApp Business, Twitter/X), receive AI-powered automated replies to customer messages, automatically score and tag leads (HOT/WARM/COLD), and synchronize all conversations and lead data with their CRM system.

### Core Value Propositions

| Capability | Business Value |
|---|---|
| Unified Inbox | One dashboard for all social channels |
| AI Auto-Reply | 24/7 instant response, <2s latency |
| Lead Scoring | Automatic HOT/WARM/COLD tagging |
| CRM Sync | Zero manual data entry |
| Human Handoff | Seamless AI→human escalation |

---

## 2. System Architecture Overview

### 2.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              REPLYFORCE AI PLATFORM                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         FRONTEND LAYER                                   │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────────┐    │   │
│  │  │  Next.js     │ │  Dashboard   │ │  Inbox     │ │  Analytics     │    │   │
│  │  │  App Router  │ │  Components  │ │  Real-time │ │  & Reports     │    │   │
│  │  └──────┬──────┘ └──────┬───────┘ └─────┬──────┘ └───────┬────────┘    │   │
│  │         │               │               │                 │             │   │
│  │         └───────────────┴───────┬───────┴─────────────────┘             │   │
│  │                                 │ WebSocket + REST                      │   │
│  └─────────────────────────────────┼──────────────────────────────────────┘    │
│                                    │                                           │
│  ┌─────────────────────────────────┼──────────────────────────────────────┐    │
│  │                      API GATEWAY / LOAD BALANCER                       │    │
│  │           (Nginx / AWS ALB — Rate Limiting, TLS Termination)           │    │
│  └─────────────────────────────────┼──────────────────────────────────────┘    │
│                                    │                                           │
│  ┌─────────────────────────────────┼──────────────────────────────────────┐    │
│  │                         BACKEND LAYER (NestJS)                         │    │
│  │                                                                        │    │
│  │  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │  Auth    │ │  Webhook  │ │  Message   │ │  Lead    │ │  CRM     │  │    │
│  │  │  Module  │ │  Receiver │ │  Service   │ │  Service │ │  Sync    │  │    │
│  │  └────┬─────┘ └─────┬─────┘ └─────┬─────┘ └────┬─────┘ └────┬─────┘  │    │
│  │       │              │             │            │            │         │    │
│  │  ┌────┴─────┐ ┌──────┴──────┐ ┌───┴────┐ ┌────┴────┐ ┌────┴─────┐   │    │
│  │  │  Tenant  │ │  Channel    │ │  Queue  │ │  Rules  │ │  Webhook │   │    │
│  │  │  Manager │ │  Connector  │ │  Publis │ │  Engine │ │  Dispatch│   │    │
│  │  └──────────┘ └─────────────┘ └────┬────┘ └─────────┘ └──────────┘   │    │
│  └────────────────────────────────────┼──────────────────────────────────┘    │
│                                       │                                       │
│  ┌────────────────────────────────────┼──────────────────────────────────┐    │
│  │                      MESSAGE QUEUE (BullMQ / Redis)                    │    │
│  │                                                                        │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐   │    │
│  │  │  inbound.msg │ │  ai.process  │ │  outbound.msg│ │  crm.sync   │   │    │
│  │  │  queue       │ │  queue       │ │  queue       │ │  queue      │   │    │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬──────┘   │    │
│  │         │                │                │                │          │    │
│  │  ┌──────┴────────────────┴────────────────┴────────────────┴──────┐   │    │
│  │  │                     Dead Letter Queue (DLQ)                     │   │    │
│  │  └────────────────────────────────────────────────────────────────┘   │    │
│  └───────────────────────────────────┼───────────────────────────────────┘    │
│                                      │                                        │
│  ┌───────────────────────────────────┼───────────────────────────────────┐    │
│  │                        AI AGENT ORCHESTRATOR                          │    │
│  │                                                                       │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────────┐  │    │
│  │  │  Message     │ │  Intent &   │ │  Auto-Reply │ │  Sentiment    │  │    │
│  │  │  Understand  │ │  Lead Score │ │  Generator  │ │  Analyzer     │  │    │
│  │  │  Agent       │ │  Agent      │ │  Agent      │ │  Agent        │  │    │
│  │  └──────────────┘ └─────────────┘ └─────────────┘ └───────────────┘  │    │
│  │  ┌─────────────┐ ┌─────────────┐                                     │    │
│  │  │  Guardrail  │ │  CRM Sync   │                                     │    │
│  │  │  /Moderat.  │ │  Agent      │                                     │    │
│  │  └─────────────┘ └─────────────┘                                     │    │
│  └───────────────────────────────────┼───────────────────────────────────┘    │
│                                      │                                        │
│  ┌───────────────────────────────────┼───────────────────────────────────┐    │
│  │                        DATA LAYER                                     │    │
│  │                                                                       │    │
│  │  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────────┐  │    │
│  │  │  PostgreSQL  │  │  Redis   │  │  S3 / Blob   │  │  Vault      │  │    │
│  │  │  (Primary DB)│  │  (Cache  │  │  (Media      │  │  (Secrets   │  │    │
│  │  │  Multi-tenant│  │   + Queue│  │   Storage)   │  │   + Tokens) │  │    │
│  │  │  Row-Level   │  │   + Pub/ │  │              │  │             │  │    │
│  │  │  Security)   │  │    Sub)  │  │              │  │             │  │    │
│  │  └──────────────┘  └──────────┘  └──────────────┘  └─────────────┘  │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐    │
│  │                   OBSERVABILITY & MONITORING                          │    │
│  │                                                                       │    │
│  │  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────────┐  │    │
│  │  │  Structured  │  │  Metrics │  │  Distributed │  │  Alerting   │  │    │
│  │  │  Logging     │  │  (Prom/  │  │  Tracing     │  │  (PagerDuty │  │    │
│  │  │  (Pino)      │  │   DD)    │  │  (OpenTelem) │  │   / Slack)  │  │    │
│  │  └──────────────┘  └──────────┘  └──────────────┘  └─────────────┘  │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐    │
│  │                   EXTERNAL INTEGRATIONS                               │    │
│  │                                                                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │    │
│  │  │ Facebook │ │Instagram │ │ WhatsApp │ │ Twitter  │ │   CRM    │   │    │
│  │  │ Graph API│ │ Graph API│ │ Business │ │ /X API   │ │ (HubSpot │   │    │
│  │  │          │ │          │ │ Cloud API│ │ v2       │ │  Salesf.) │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities & Justification

| Component | Responsibility | Why It Exists |
|---|---|---|
| **Next.js Frontend** | Dashboard UI, inbox, analytics, settings | SSR for SEO on marketing pages; React for rich interactive dashboard; App Router for streaming |
| **API Gateway (Nginx/ALB)** | TLS termination, rate limiting, routing | Decouples infra concerns from application logic; enables blue-green deploys |
| **NestJS Backend** | Business logic, API endpoints, webhook handling | TypeScript end-to-end; dependency injection; modular architecture; excellent for microservice migration later |
| **Auth Module** | JWT issuance, OAuth flows, RBAC enforcement | Multi-tenant security is non-negotiable; social OAuth is a core feature |
| **Webhook Receiver** | Ingests webhooks from FB/IG/WA/X | Must be fast (<200ms response), idempotent, and resilient to spikes |
| **Message Queue (BullMQ)** | Decouples ingestion from processing | Social platforms send bursts; queue absorbs spikes; enables retry/DLQ |
| **AI Agent Orchestrator** | Coordinates all AI agents in pipeline | Single responsibility per agent; orchestrator manages sequencing and failure |
| **PostgreSQL** | Primary data store with RLS | Multi-tenant isolation via Row-Level Security; JSONB for flexible metadata |
| **Redis** | Caching, queue backend, pub/sub for real-time | Sub-millisecond reads; BullMQ backend; WebSocket fan-out via pub/sub |
| **Vault (HashiCorp/AWS SSM)** | OAuth tokens, API keys | Social media tokens are crown jewels; must be encrypted and rotated |
| **S3/Blob Storage** | Media attachments from messages | Messages include images/videos; must be stored durably and served via CDN |
| **Observability Stack** | Logs, metrics, traces, alerts | Production SaaS requires <5min incident detection; distributed tracing for debugging |

### 2.3 Network Topology

```
Internet
    │
    ├── CDN (CloudFront) ──→ Next.js Static Assets
    │
    ├── ALB (Public) ──→ NestJS API Cluster (3+ instances, auto-scaling)
    │       │
    │       ├── /api/* ──→ REST endpoints
    │       ├── /ws   ──→ WebSocket upgrade (sticky sessions)
    │       └── /webhooks/* ──→ Webhook receiver (separate target group)
    │
    └── Social Platform Webhooks ──→ ALB /webhooks/*
    
Private Subnet:
    ├── PostgreSQL (RDS Multi-AZ)
    ├── Redis Cluster (ElastiCache)
    ├── AI Agent Workers (ECS/K8s pods)
    └── CRM Sync Workers (ECS/K8s pods)
```

---

## 3. AI Agent Design

### 3.1 Agent Pipeline Architecture

```
Incoming Message
       │
       ▼
┌──────────────────┐
│  1. GUARDRAIL    │ ← First: block spam, profanity, injection attacks
│     AGENT        │
└────────┬─────────┘
         │ (passes moderation)
         ▼
┌──────────────────┐
│  2. MESSAGE      │ ← Extract: language, entities, topic, context
│     UNDERSTAND   │
│     AGENT        │
└────────┬─────────┘
         │ (structured understanding)
         ▼
┌──────────────────┐
│  3. SENTIMENT    │ ← Classify: positive/negative/neutral + urgency
│     ANALYSIS     │
│     AGENT        │
└────────┬─────────┘
         │ (sentiment + urgency score)
         ▼
┌──────────────────┐
│  4. INTENT &     │ ← Score: purchase_intent, engagement_level → HOT/WARM/COLD
│     LEAD SCORING │
│     AGENT        │
└────────┬─────────┘
         │ (intent + lead_tag)
         ▼
┌──────────────────┐
│  5. AUTO-REPLY   │ ← Generate contextual, brand-voice reply
│     GENERATION   │
│     AGENT        │
└────────┬─────────┘
         │ (draft reply)
         ▼
┌──────────────────┐
│  6. GUARDRAIL    │ ← Validate output: no hallucinations, PII leaks, brand safety
│     (OUTPUT)     │
└────────┬─────────┘
         │ (approved reply)
         ▼
   Send Reply + Update Lead + Trigger CRM Sync
```

### 3.2 Agent Specifications

#### Agent 1: Guardrail / Moderation Agent

| Attribute | Detail |
|---|---|
| **Purpose** | Gate both input messages and output replies for safety |
| **Inputs** | Raw message text, sender metadata, conversation history |
| **Outputs** | `{passed: boolean, flags: string[], risk_score: 0-1}` |
| **Model** | Rules engine (regex) + OpenAI Moderation API + small classifier (distilbert) |
| **Prompt Strategy** | No LLM prompt — rule-based first pass, then moderation API |
| **Failure Handling** | On timeout → default PASS with flag `moderation_skipped`; log for manual review |
| **Cost** | Near-zero (rules engine) + $0.0001/call (moderation API) |

**Rules Engine Checks:**
- Prompt injection patterns (`ignore previous instructions`, `system:`, etc.)
- Known spam patterns (URL shorteners, repeated messages)
- Profanity word list (multi-language)
- PII in outbound messages (SSN, credit card regex)

#### Agent 2: Message Understanding Agent

| Attribute | Detail |
|---|---|
| **Purpose** | Parse and structure the incoming message |
| **Inputs** | Raw text, channel type, conversation history (last 5 messages) |
| **Outputs** | `{language, entities[], topic, is_question, summary, key_phrases[]}` |
| **Model** | GPT-4o-mini (cost-effective, fast) |
| **Prompt Strategy** | Few-shot with structured JSON output schema |
| **Failure Handling** | On LLM timeout → extract entities via spaCy fallback; on parse failure → return raw text as summary |
| **Cost** | ~$0.00015 per message (150 input + 100 output tokens avg) |

**System Prompt:**
```
You are a message analysis engine. Given a customer message from {channel}, 
extract the following as JSON:
- language: ISO 639-1 code
- entities: [{type: "product"|"person"|"company"|"location", value: string}]
- topic: one of ["pricing", "support", "complaint", "inquiry", "feedback", "other"]
- is_question: boolean
- summary: max 50 words
- key_phrases: string[] (max 5)

Conversation context: {last_5_messages}
Current message: {message}

Respond ONLY with valid JSON.
```

#### Agent 3: Sentiment Analysis Agent

| Attribute | Detail |
|---|---|
| **Purpose** | Determine emotional tone and urgency |
| **Inputs** | Message text, message understanding output |
| **Outputs** | `{sentiment: "positive"|"negative"|"neutral"|"mixed", score: -1..1, urgency: "low"|"medium"|"high"|"critical", emotions: string[]}` |
| **Model** | Fine-tuned DistilBERT (local, <10ms inference) with GPT-4o-mini fallback for edge cases |
| **Prompt Strategy** | N/A for primary model (classification head). LLM fallback uses zero-shot. |
| **Failure Handling** | On model failure → default to `neutral` with `urgency: medium`; flag for review |
| **Cost** | ~$0 (local inference) or $0.0001 (LLM fallback) |

**Why local model:** Sentiment is a solved classification problem. Running a fine-tuned model locally saves 100x cost vs LLM per call and runs in <10ms.

#### Agent 4: Intent & Lead Scoring Agent

| Attribute | Detail |
|---|---|
| **Purpose** | Classify purchase intent and assign lead temperature |
| **Inputs** | Message understanding output, sentiment output, conversation history, lead profile |
| **Outputs** | `{intent: string, confidence: 0-1, lead_score: 0-100, lead_tag: "HOT"|"WARM"|"COLD", signals: string[], recommended_action: string}` |
| **Model** | Rules engine (primary) + GPT-4o-mini (complex cases) |
| **Prompt Strategy** | Weighted scoring model with LLM-assisted edge case resolution |
| **Failure Handling** | On LLM failure → use rules engine only; never fail to produce a score |
| **Cost** | ~$0 (rules) to $0.0002 (LLM assist) |

**Scoring Rules:**
```
HOT (score 70-100):
  +30: Mentions pricing/buying/purchasing
  +20: Asks about availability
  +15: Requests demo/trial
  +10: Repeat engagement (3+ messages)
  +10: Positive sentiment on product
  +15: Uses urgency language ("need", "asap", "today")

WARM (score 40-69):
  +20: General product inquiry
  +15: Asks about features
  +10: First-time engagement with interest
  +10: Follows/subscribes

COLD (score 0-39):
  +10: Generic greeting
  +5:  Unrelated question
  +0:  Spam/irrelevant
  -10: Negative sentiment about product
  -20: Explicit "not interested"
```

#### Agent 5: Auto-Reply Generation Agent

| Attribute | Detail |
|---|---|
| **Purpose** | Generate contextual, on-brand replies |
| **Inputs** | All previous agent outputs, conversation history, brand voice config, product knowledge base |
| **Outputs** | `{reply_text: string, confidence: 0-1, requires_human: boolean, suggested_actions: string[]}` |
| **Model** | GPT-4o (quality matters here — this is customer-facing) |
| **Prompt Strategy** | RAG with brand voice + product knowledge; chain-of-thought for complex queries |
| **Failure Handling** | On failure → send templated fallback response; flag for human review |
| **Cost** | ~$0.003 per reply (500 input + 200 output tokens avg) |

**System Prompt:**
```
You are a customer service AI for {company_name}. 
Brand voice: {brand_voice_description}
Tone: {tone_setting} (professional/friendly/casual)

RULES:
1. Never make promises about pricing unless in the knowledge base
2. Never share internal information
3. If unsure, acknowledge and offer to connect with a human
4. Keep replies under {max_reply_length} characters
5. Match the customer's language
6. Do NOT use emojis unless the brand voice allows it
7. For complaints, always empathize first

KNOWLEDGE BASE CONTEXT:
{rag_retrieved_chunks}

CONVERSATION HISTORY:
{conversation_history}

CURRENT MESSAGE ANALYSIS:
- Topic: {topic}
- Sentiment: {sentiment}  
- Intent: {intent}
- Lead Score: {lead_tag}

CUSTOMER MESSAGE:
{message}

Generate a helpful, accurate reply. If you cannot answer confidently, 
set requires_human=true and still provide a holding response.
```

#### Agent 6: CRM Sync Agent

| Attribute | Detail |
|---|---|
| **Purpose** | Map conversation data to CRM fields and sync |
| **Inputs** | Lead profile, conversation summary, lead tag, all agent outputs |
| **Outputs** | `{crm_payload: object, sync_status: string, field_mappings: object}` |
| **Model** | Rules engine + field mapping templates (no LLM needed) |
| **Prompt Strategy** | N/A — deterministic field mapping with configurable templates per CRM |
| **Failure Handling** | On CRM API failure → queue for retry (exponential backoff); on mapping failure → store raw data + alert |
| **Cost** | $0 (pure logic) |

**Supported CRMs & Mapping:**
```
HubSpot:
  contact.email        ← lead.email
  contact.firstname    ← lead.name.split()[0]
  contact.lead_status  ← lead_tag (HOT→"Sales Qualified", WARM→"Marketing Qualified", COLD→"Subscriber")
  deal.dealname        ← "{company} - {topic} - {date}"
  note.body            ← conversation_summary

Salesforce:
  Lead.Email           ← lead.email
  Lead.Status          ← lead_tag mapping
  Lead.LeadSource      ← channel_type
  Task.Description     ← conversation_summary
```

---

## 4. Data Flow: End-to-End

### 4.1 Flow 1: User Connects a Social Media Account

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
│Dashboard │────▶│ Backend  │────▶│ Social    │────▶│ Callback │────▶│ Token    │
│ "Connect │     │ /auth/   │     │ Platform  │     │ /auth/   │     │ Vault    │
│  Facebook│     │ {channel}│     │ OAuth     │     │ callback │     │ Encrypt  │
│  " button│     │ /connect │     │ Consent   │     │ Exchange │     │ & Store  │
└──────────┘     └──────────┘     └───────────┘     └──────────┘     └──────────┘
                                                          │
                                                          ▼
                                                   ┌──────────┐
                                                   │ Subscribe│
                                                   │ Webhook  │
                                                   │ (platform│
                                                   │  API)    │
                                                   └──────────┘
```

**API Endpoint:** `POST /api/v1/channels/connect`
```json
{
  "channel_type": "facebook",
  "redirect_uri": "https://app.replyforce.ai/auth/callback/facebook"
}
// Returns: { "oauth_url": "https://facebook.com/v18.0/dialog/oauth?..." }
```

**Callback Endpoint:** `GET /api/v1/auth/callback/:channel`
```
Query params: code, state (CSRF token)
→ Exchange code for access_token + page_token
→ Encrypt tokens with AES-256-GCM
→ Store in vault (encrypted_token, iv, tenant_id, channel_id, expires_at)
→ Subscribe to platform webhooks
→ Redirect to dashboard with success status
```

### 4.2 Flow 2: Incoming Message Processing (Complete)

```
Step  Latency   Component           Action
─────────────────────────────────────────────────────────────────
 1    0ms       Social Platform  →  POST /webhooks/{channel}
 2    <50ms     Webhook Receiver →  Validate signature, dedup check
 3    <100ms    Webhook Receiver →  ACK 200 to platform immediately
 4    <100ms    Queue Publisher  →  Publish to `inbound.messages` queue
 5    <200ms    Message Worker   →  Dequeue, hydrate with conversation context
 6    <500ms    Guardrail Agent  →  Input moderation check
 7    <800ms    Understanding    →  Parse message (LLM call ~300ms)
 8    <900ms    Sentiment Agent  →  Classify sentiment (local model ~10ms)
 9    <1200ms   Lead Score Agent →  Score and tag lead (rules ~5ms, LLM ~300ms)
10    <2000ms   Reply Agent      →  Generate reply (LLM call ~800ms)
11    <2100ms   Guardrail Agent  →  Output validation
12    <2200ms   Outbound Queue   →  Publish to `outbound.messages` queue
13    <2500ms   Channel Sender   →  Send reply via platform API
14    <2600ms   DB Writer        →  Persist message, lead update, conversation
15    <2700ms   WebSocket        →  Push update to dashboard (Redis pub/sub)
16    async     CRM Sync Queue   →  Publish to `crm.sync` queue
17    async     CRM Worker       →  Sync to CRM via API
```

**Total user-perceived latency: <3 seconds from message to reply.**

### 4.3 API Endpoints Summary

```
Authentication:
  POST   /api/v1/auth/register          - New tenant registration
  POST   /api/v1/auth/login             - Login (returns JWT)
  POST   /api/v1/auth/refresh           - Refresh JWT
  DELETE /api/v1/auth/logout            - Invalidate session

Channels:
  GET    /api/v1/channels               - List connected channels
  POST   /api/v1/channels/connect       - Initiate OAuth connection
  GET    /api/v1/auth/callback/:channel - OAuth callback
  DELETE /api/v1/channels/:id           - Disconnect channel
  GET    /api/v1/channels/:id/status    - Channel health check

Conversations:
  GET    /api/v1/conversations                     - List conversations (paginated)
  GET    /api/v1/conversations/:id                 - Get conversation with messages
  GET    /api/v1/conversations/:id/messages        - Get messages (paginated)
  POST   /api/v1/conversations/:id/messages        - Send manual reply
  PATCH  /api/v1/conversations/:id/assign          - Assign to human agent
  PATCH  /api/v1/conversations/:id/status          - Update status (open/closed/snoozed)

Leads:
  GET    /api/v1/leads                  - List leads (filterable by tag)
  GET    /api/v1/leads/:id              - Get lead detail
  PATCH  /api/v1/leads/:id/tag          - Manual tag override
  GET    /api/v1/leads/stats            - Lead statistics

CRM:
  GET    /api/v1/crm/integrations       - List CRM connections
  POST   /api/v1/crm/connect            - Connect CRM
  POST   /api/v1/crm/sync/:leadId       - Force sync a lead
  GET    /api/v1/crm/sync/status        - Sync queue status

Webhooks (External → Platform):
  POST   /webhooks/facebook             - Facebook webhook receiver
  POST   /webhooks/instagram            - Instagram webhook receiver
  POST   /webhooks/whatsapp             - WhatsApp webhook receiver
  POST   /webhooks/twitter              - Twitter/X webhook receiver
  GET    /webhooks/:channel             - Webhook verification (challenge)

Settings:
  GET    /api/v1/settings/brand-voice   - Get brand voice config
  PUT    /api/v1/settings/brand-voice   - Update brand voice
  GET    /api/v1/settings/auto-reply    - Get auto-reply settings
  PUT    /api/v1/settings/auto-reply    - Update auto-reply settings
  GET    /api/v1/settings/team          - List team members
  POST   /api/v1/settings/team/invite   - Invite team member

Analytics:
  GET    /api/v1/analytics/overview     - Dashboard metrics
  GET    /api/v1/analytics/response-time - Response time stats
  GET    /api/v1/analytics/lead-funnel  - Lead conversion funnel
  GET    /api/v1/analytics/agent-perf   - AI agent performance

WebSocket:
  WS     /ws                            - Real-time updates (conversations, leads)
```

### 4.4 Queue Architecture

```
Queue: inbound.messages
  Priority: HIGH
  Concurrency: 20 workers
  Max retries: 3
  Backoff: exponential (1s, 4s, 16s)
  DLQ: inbound.messages.dlq

Queue: ai.process
  Priority: MEDIUM
  Concurrency: 10 workers (limited by LLM rate limits)
  Max retries: 2
  Backoff: exponential (2s, 8s)
  DLQ: ai.process.dlq
  
Queue: outbound.messages
  Priority: HIGH
  Concurrency: 15 workers
  Max retries: 5 (platform APIs can be flaky)
  Backoff: exponential (1s, 2s, 4s, 8s, 16s)
  DLQ: outbound.messages.dlq
  Rate limit: per-channel (FB: 200/hr, WA: 1000/hr)

Queue: crm.sync
  Priority: LOW
  Concurrency: 5 workers
  Max retries: 5
  Backoff: exponential (5s, 15s, 45s, 135s, 405s)
  DLQ: crm.sync.dlq
  Batch: up to 10 records per CRM API call
```

---

## 5. Authentication & Authorization

### 5.1 Auth Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  Frontend   │────▶│  Auth Guard  │────▶│  JWT Verify   │
│  (Bearer    │     │  (NestJS     │     │  + RBAC Check │
│   token in  │     │   Guard)     │     │  + Tenant     │
│   header)   │     │              │     │    Isolation   │
└─────────────┘     └──────────────┘     └───────────────┘
```

### 5.2 JWT Structure

```json
{
  "sub": "user_abc123",
  "tid": "tenant_xyz789",
  "role": "admin",
  "permissions": ["read:conversations", "write:conversations", "manage:team"],
  "iat": 1707700000,
  "exp": 1707703600,
  "iss": "replyforce.ai"
}
```

- **Access Token TTL:** 1 hour
- **Refresh Token TTL:** 7 days (stored in httpOnly cookie + DB)
- **Rotation:** Refresh tokens are single-use; new pair issued on refresh

### 5.3 Role-Based Access Control

| Permission | Admin | Agent | Viewer |
|---|:---:|:---:|:---:|
| View dashboard | ✅ | ✅ | ✅ |
| View conversations | ✅ | ✅ | ✅ |
| Send replies | ✅ | ✅ | ❌ |
| Override lead tags | ✅ | ✅ | ❌ |
| Connect channels | ✅ | ❌ | ❌ |
| Manage CRM integration | ✅ | ❌ | ❌ |
| Manage team members | ✅ | ❌ | ❌ |
| Configure AI settings | ✅ | ❌ | ❌ |
| View analytics | ✅ | ✅ | ✅ |
| Export data | ✅ | ❌ | ❌ |
| Delete data (GDPR) | ✅ | ❌ | ❌ |

### 5.4 Multi-Tenant Isolation

- **Database:** PostgreSQL Row-Level Security (RLS) with `tenant_id` on every table
- **Every query** automatically scoped by `SET app.current_tenant = '{tenant_id}'`
- **RLS Policy:** `CREATE POLICY tenant_isolation ON {table} USING (tenant_id = current_setting('app.current_tenant')::uuid)`
- **API Layer:** Tenant ID extracted from JWT and set on every DB connection
- **Cache:** Redis key prefix: `tenant:{tid}:*`
- **Queue:** Jobs tagged with `tenant_id`; workers validate before processing

### 5.5 Rate Limiting

```
Tier-based rate limits (per tenant):

Free Tier:
  API: 100 requests/minute
  Messages: 500/day
  AI Replies: 100/day

Pro Tier:
  API: 1000 requests/minute
  Messages: 10,000/day
  AI Replies: 5,000/day

Enterprise:
  API: 10,000 requests/minute
  Messages: Unlimited
  AI Replies: 50,000/day

Implementation: Redis sliding window counter
Key: rate:{tenant_id}:{endpoint}:{window}
```

---

## 6. Data Security & Privacy

### 6.1 Encryption

| Layer | Method |
|---|---|
| In Transit | TLS 1.3 everywhere (API, WebSocket, DB connections, Redis) |
| At Rest (DB) | AES-256 via AWS RDS encryption |
| At Rest (S3) | SSE-S3 or SSE-KMS |
| OAuth Tokens | AES-256-GCM with per-tenant keys stored in AWS KMS |
| PII Fields | Application-level encryption for email, phone, name |

### 6.2 Token Vaulting

```
┌──────────────┐     ┌───────────────┐     ┌───────────────┐
│  Application │────▶│  Token Vault  │────▶│  AWS KMS      │
│  "I need FB  │     │  Service      │     │  (Master Key) │
│   token for  │     │  ┌─────────┐  │     │               │
│   tenant X"  │     │  │Decrypt  │  │     │  Envelope     │
│              │     │  │with DEK │  │     │  Encryption   │
└──────────────┘     │  └─────────┘  │     └───────────────┘
                     │  ┌─────────┐  │
                     │  │Audit    │  │
                     │  │Log      │  │
                     │  └─────────┘  │
                     └───────────────┘
```

### 6.3 Webhook Validation

- **Facebook/Instagram:** Verify `X-Hub-Signature-256` header with HMAC-SHA256
- **WhatsApp:** Verify `X-Hub-Signature-256` header
- **Twitter/X:** Verify `X-Twitter-Webhooks-Signature` with HMAC-SHA256
- **Replay Protection:** Reject webhooks older than 5 minutes (timestamp check)
- **Idempotency:** Deduplicate by `message_id` using Redis SET with 24h TTL

### 6.4 GDPR Compliance

```
Data Subject Rights Implementation:

Right to Access:
  GET /api/v1/gdpr/export/:contactId
  → Generates JSON/CSV of all data associated with contact
  → Includes: messages, lead scores, CRM syncs, AI analysis
  → Delivered via secure download link (expires in 24h)

Right to Deletion:
  DELETE /api/v1/gdpr/erase/:contactId
  → Soft-delete immediately (excluded from queries)
  → Hard-delete after 30-day grace period
  → Cascades to: messages, conversations, lead records, media, AI outputs
  → Triggers CRM deletion webhook
  → Audit log entry (retained for compliance)

Right to Portability:
  GET /api/v1/gdpr/export/:contactId?format=json
  → Machine-readable format

Data Retention:
  - Conversations: 2 years (configurable per tenant)
  - AI outputs: 90 days
  - Audit logs: 7 years
  - Deleted data: 30-day grace → permanent deletion
```

### 6.5 Audit Logging

Every sensitive operation produces an immutable audit log:

```json
{
  "event_id": "evt_abc123",
  "timestamp": "2026-02-12T10:30:00Z",
  "tenant_id": "tenant_xyz",
  "actor": { "user_id": "user_123", "role": "admin", "ip": "1.2.3.4" },
  "action": "channel.connected",
  "resource": { "type": "channel", "id": "ch_456", "channel_type": "facebook" },
  "metadata": { "page_name": "Acme Corp" },
  "result": "success"
}
```

---

## 7. Cost Optimization Strategy

### 7.1 AI Cost Model (Per Message)

```
Without optimization:
  GPT-4o for everything: ~$0.01/message
  10,000 messages/day = $100/day = $3,000/month 💸

With optimization:
  Guardrail (rules):        $0.0000
  Understanding (4o-mini):   $0.00015
  Sentiment (local model):   $0.00000
  Lead scoring (rules):      $0.00000
  Auto-reply (GPT-4o):      $0.00300
  Guardrail output (rules):  $0.0000
  ─────────────────────────
  Total:                     $0.00315/message
  10,000 messages/day = $31.50/day = $945/month ✅
  
Savings: 68% reduction
```

### 7.2 Optimization Strategies

| Strategy | Implementation | Savings |
|---|---|---|
| **Model Tiering** | Use GPT-4o only for reply generation; GPT-4o-mini for understanding; local models for classification | 60-70% |
| **Response Caching** | Cache replies for identical/similar queries (cosine similarity > 0.95) with tenant-scoped Redis cache | 20-30% on repeat queries |
| **Rules First** | Lead scoring uses weighted rules engine; LLM only for edge cases | 90% of scoring is free |
| **Batch Processing** | Batch CRM syncs (up to 10 per API call); batch low-priority analytics | Reduces API calls 80% |
| **Token Budgeting** | Per-tenant daily token budget; alert at 80%; hard cap at 100% | Prevents runaway costs |
| **Prompt Optimization** | Minimal system prompts; structured output (JSON mode) reduces output tokens | 15-20% token reduction |
| **Short-Circuit** | If message is simple greeting → use template response, skip LLM entirely | 30% of messages need no LLM |

### 7.3 Token Budget Per Tenant

```typescript
interface TokenBudget {
  tenant_id: string;
  plan: 'free' | 'pro' | 'enterprise';
  daily_limit: number;       // Free: 10K, Pro: 100K, Enterprise: 1M
  monthly_limit: number;     // Free: 200K, Pro: 2M, Enterprise: 20M
  current_daily_usage: number;
  current_monthly_usage: number;
  alert_threshold: 0.8;      // Alert at 80%
  hard_cap: boolean;         // Free: true, Pro: true (with overage), Enterprise: false
}
```

---

## 8. Failure Scenarios & Recovery

### 8.1 Failure Matrix

| Scenario | Detection | Response | Recovery |
|---|---|---|---|
| **Social API Down** | Health check fails; webhook 5xx | Queue outbound messages; show "delayed" in dashboard | Retry with exponential backoff; alert after 5 failures |
| **AI Model Timeout** | 30s timeout on LLM call | Use cached similar response or template fallback | Retry once; if fails, use template + flag for human review |
| **Webhook Duplication** | Redis dedup check (message_id) | Silently drop duplicate | Log dedup event for monitoring |
| **Queue Backlog** | Queue depth > threshold | Scale workers horizontally; alert team | Auto-scaling policy; manual intervention if >10min lag |
| **CRM Sync Failure** | CRM API 4xx/5xx | Retry with exponential backoff (5 attempts) | DLQ after max retries; manual retry button in dashboard |
| **Invalid AI Response** | JSON parse failure; guardrail rejection | Use fallback template response | Log failure; retrain/adjust prompt; alert if error rate >5% |
| **Database Connection** | Connection pool exhaustion | Queue requests; serve from cache where possible | Auto-reconnect; failover to read replica |
| **Redis Down** | Connection refused | Fallback to DB for cache reads; queue to memory | Auto-reconnect; Redis Sentinel failover |

### 8.2 Circuit Breaker Pattern

```typescript
// Circuit breaker states per external service
interface CircuitBreaker {
  service: 'facebook' | 'instagram' | 'whatsapp' | 'twitter' | 'openai' | 'crm';
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failure_count: number;
  failure_threshold: 5;       // Open circuit after 5 failures
  recovery_timeout: 30000;    // Try again after 30 seconds
  success_threshold: 3;       // Close circuit after 3 successes in HALF_OPEN
}
```

### 8.3 Human Takeover Mode

```
Triggers for automatic human escalation:
1. AI confidence < 0.4 on reply generation
2. Customer explicitly requests human agent
3. Sentiment = negative AND urgency = critical
4. 3+ consecutive messages with no resolution
5. Message contains legal/compliance keywords
6. AI model circuit breaker is OPEN

Escalation flow:
  AI detects trigger → Set conversation.status = "needs_human"
  → Send holding message: "Let me connect you with a team member..."
  → Push notification to assigned agent (WebSocket + email)
  → Dashboard shows conversation in "Escalated" queue
  → Human agent takes over; AI assists with suggested replies
```

### 8.4 Dead Letter Queue Processing

```
DLQ items are reviewed via:
1. Automated: Retry job runs every 15 minutes, attempts reprocessing
2. Dashboard: Admin can view DLQ items, inspect payloads, manually retry
3. Alert: If DLQ depth > 100, PagerDuty alert fires
4. Expiry: DLQ items expire after 7 days → archived to S3 for forensics
```

---

## 9. Tech Stack

### 9.1 Stack Decision Matrix

| Layer | Choice | Alternatives Considered | Why This Choice |
|---|---|---|---|
| **Frontend** | Next.js 15 (App Router) | Remix, SvelteKit | SSR for marketing pages; React ecosystem; excellent DX; Vercel deployment |
| **UI Components** | shadcn/ui + Tailwind CSS | MUI, Chakra UI | Unstyled primitives; full control; tree-shakeable; excellent accessibility |
| **State Management** | TanStack Query + Zustand | Redux, Jotai | TanStack for server state; Zustand for client state; minimal boilerplate |
| **Real-time** | Socket.io | native WebSocket, SSE | Auto-reconnection; room support; binary transport; fallback to polling |
| **Backend** | NestJS (Node.js) | FastAPI (Python), Go | TypeScript E2E; DI container; modular; excellent for microservice migration |
| **ORM** | Prisma | TypeORM, Drizzle | Type-safe queries; excellent migrations; good multi-tenant support |
| **Database** | PostgreSQL 16 | MySQL, CockroachDB | RLS for multi-tenancy; JSONB; full-text search; battle-tested |
| **Cache + Queue** | Redis 7 + BullMQ | RabbitMQ, SQS | Single dependency for cache + queue + pub/sub; BullMQ is production-proven |
| **AI/LLM** | OpenAI GPT-4o + GPT-4o-mini | Claude, Gemini | Best structured output; function calling; reliable JSON mode |
| **Local ML** | ONNX Runtime (DistilBERT) | TensorFlow.js | Fast inference; small memory footprint; no GPU required |
| **File Storage** | AWS S3 | GCS, Azure Blob | CDN integration via CloudFront; lifecycle policies; cheap |
| **Secrets** | AWS Secrets Manager | HashiCorp Vault | Managed service; KMS integration; auto-rotation |
| **Auth** | Custom JWT + Passport.js | Auth0, Clerk | Full control over multi-tenant auth; no per-MAU cost at scale |
| **Infra** | AWS (ECS Fargate) | GCP, K8s | Serverless containers; auto-scaling; no cluster management |
| **CI/CD** | GitHub Actions | GitLab CI, CircleCI | GitHub-native; excellent caching; good secret management |
| **Monitoring** | DataDog | Grafana + Prometheus | All-in-one APM, logs, metrics; excellent Node.js integration |
| **Error Tracking** | Sentry | Bugsnag | Best stack traces; replay; breadcrumbs; excellent SDK |

---

## 10. Database Schema

### 10.1 Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   tenants    │       │    users     │       │    roles     │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │◄──┐   │ id (PK)      │       │ id (PK)      │
│ name         │   │   │ tenant_id(FK)│───┐   │ name         │
│ slug         │   │   │ email        │   │   │ permissions  │
│ plan         │   │   │ password_hash│   │   └──────────────┘
│ settings     │   │   │ role_id (FK) │───┘
│ created_at   │   │   │ created_at   │
└──────────────┘   │   └──────────────┘
                   │
┌──────────────┐   │   ┌──────────────┐       ┌──────────────┐
│   channels   │   │   │conversations │       │   messages   │
├──────────────┤   │   ├──────────────┤       ├──────────────┤
│ id (PK)      │   │   │ id (PK)      │◄──────│ id (PK)      │
│ tenant_id(FK)│───┘   │ tenant_id(FK)│───┐   │ conversation │
│ type         │       │ channel_id(FK│───┘   │ _id (FK)     │
│ platform_id  │       │ contact_id(FK│       │ sender_type  │
│ name         │       │ lead_id (FK) │       │ content      │
│ access_token │       │ assigned_to  │       │ platform_mid │
│ config       │       │ status       │       │ ai_analysis  │
│ status       │       │ last_msg_at  │       │ created_at   │
│ created_at   │       │ created_at   │       └──────────────┘
└──────────────┘       └──────────────┘
                                              ┌──────────────┐
┌──────────────┐       ┌──────────────┐       │  crm_syncs   │
│   contacts   │       │    leads     │       ├──────────────┤
├──────────────┤       ├──────────────┤       │ id (PK)      │
│ id (PK)      │◄──────│ id (PK)      │◄──────│ lead_id (FK) │
│ tenant_id(FK)│       │ tenant_id(FK)│       │ tenant_id(FK)│
│ platform_id  │       │ contact_id(FK│       │ crm_type     │
│ name         │       │ tag (HOT/    │       │ crm_record_id│
│ email        │       │  WARM/COLD)  │       │ status       │
│ phone        │       │ score        │       │ last_synced  │
│ avatar_url   │       │ signals      │       │ payload      │
│ metadata     │       │ crm_synced   │       │ error        │
│ created_at   │       │ created_at   │       └──────────────┘
└──────────────┘       └──────────────┘
                                              ┌──────────────┐
┌──────────────┐       ┌──────────────┐       │  audit_logs  │
│ crm_configs  │       │ brand_voice  │       ├──────────────┤
├──────────────┤       ├──────────────┤       │ id (PK)      │
│ id (PK)      │       │ id (PK)      │       │ tenant_id    │
│ tenant_id(FK)│       │ tenant_id(FK)│       │ actor_id     │
│ crm_type     │       │ tone         │       │ action       │
│ api_key_enc  │       │ style        │       │ resource     │
│ field_map    │       │ guidelines   │       │ metadata     │
│ sync_enabled │       │ knowledge_base│      │ ip_address   │
│ created_at   │       │ created_at   │       │ created_at   │
└──────────────┘       └──────────────┘       └──────────────┘
```

---

## 11. API Contract Examples

### 11.1 Webhook Payload (Facebook)

```json
POST /webhooks/facebook
Headers:
  X-Hub-Signature-256: sha256=abc123...
  Content-Type: application/json

{
  "object": "page",
  "entry": [{
    "id": "page_123",
    "time": 1707700000,
    "messaging": [{
      "sender": { "id": "user_456" },
      "recipient": { "id": "page_123" },
      "timestamp": 1707700000,
      "message": {
        "mid": "m_abc123",
        "text": "Hi, what's the price of your Pro plan?"
      }
    }]
  }]
}
```

### 11.2 Internal Message Event (After Processing)

```json
{
  "event_type": "message.processed",
  "message_id": "msg_789",
  "tenant_id": "tenant_xyz",
  "conversation_id": "conv_456",
  "channel": "facebook",
  "contact": {
    "id": "contact_123",
    "name": "Jane Doe",
    "platform_id": "user_456"
  },
  "ai_analysis": {
    "understanding": {
      "language": "en",
      "topic": "pricing",
      "entities": [{"type": "product", "value": "Pro plan"}],
      "is_question": true,
      "summary": "Customer asking about Pro plan pricing"
    },
    "sentiment": {
      "sentiment": "positive",
      "score": 0.7,
      "urgency": "medium"
    },
    "lead_score": {
      "score": 82,
      "tag": "HOT",
      "signals": ["pricing_inquiry", "specific_product_mention"],
      "intent": "purchase_evaluation"
    },
    "reply": {
      "text": "Hi Jane! Great question about our Pro plan. It starts at $49/month and includes unlimited conversations, 5 connected channels, and priority support. Would you like me to set up a free trial for you?",
      "confidence": 0.92,
      "requires_human": false
    }
  }
}
```

---

## 12. SaaS Pricing & Multi-Tenant Strategy

### 12.1 Pricing Tiers

| Feature | Starter ($29/mo) | Pro ($99/mo) | Enterprise (Custom) |
|---|---|---|---|
| Connected channels | 2 | 5 | Unlimited |
| Messages/month | 1,000 | 10,000 | Unlimited |
| AI replies/month | 500 | 5,000 | 50,000 |
| Team members | 2 | 10 | Unlimited |
| Lead tagging | ✅ | ✅ | ✅ |
| CRM sync | ❌ | ✅ | ✅ |
| Custom brand voice | ❌ | ✅ | ✅ |
| Analytics | Basic | Advanced | Custom |
| Support | Email | Priority | Dedicated |
| SLA | — | 99.9% | 99.99% |

### 12.2 Multi-Tenant Scaling

```
Scale-Out Strategy:

Phase 1 (0-100 tenants):
  - Single PostgreSQL instance (db.r6g.xlarge)
  - Single Redis cluster
  - 3 API instances (ECS Fargate)
  - 3 Worker instances

Phase 2 (100-1000 tenants):
  - PostgreSQL with read replicas
  - Redis cluster (3 nodes)
  - Auto-scaling API (3-20 instances)
  - Auto-scaling Workers (3-30 instances)
  - CDN for all static assets

Phase 3 (1000+ tenants):
  - Database sharding by tenant_id range
  - Dedicated Redis per shard
  - Regional deployment (US, EU, APAC)
  - Enterprise tenants get isolated infrastructure
  - Event-driven architecture (move from BullMQ to Kafka)
```

---

*End of Architecture Document. See the codebase for implementation.*
