-- ============================================
-- ReplyForce AI — Database Initialization
-- Sets up Row-Level Security for multi-tenancy
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create application role for RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replyforce_app') THEN
    CREATE ROLE replyforce_app;
  END IF;
END
$$;

-- Row-Level Security policies will be created after Prisma migration
-- These policies ensure tenant isolation at the database level

-- Function to get current tenant from session variable
CREATE OR REPLACE FUNCTION current_tenant_id() 
RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_tenant', true), '')::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- After Prisma migration, run these RLS policies:
-- (Stored as comments for post-migration execution)

/*
-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create isolation policies
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_channels ON channels
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_contacts ON contacts
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_conversations ON conversations
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_leads ON leads
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_crm_configs ON crm_configs
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_brand_voices ON brand_voices
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_token_budgets ON token_budgets
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (tenant_id = current_tenant_id());
*/
