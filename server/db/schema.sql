-- ============================================================
-- Call Center System — PostgreSQL Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TYPE agent_status AS ENUM ('available', 'busy', 'paused', 'offline', 'wrapup');
CREATE TYPE campaign_type AS ENUM ('blast', 'progressive', 'predictive');
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');
CREATE TYPE contact_status AS ENUM ('pending', 'dialing', 'completed', 'failed', 'dnc', 'retry');
CREATE TYPE call_direction AS ENUM ('inbound', 'outbound', 'internal');
CREATE TYPE call_status AS ENUM ('originated', 'ringing', 'answered', 'bridged', 'completed', 'failed', 'abandoned');
CREATE TYPE queue_strategy AS ENUM ('ringall', 'roundrobin', 'leastrecent', 'fewestcalls', 'random');
CREATE TYPE disposition_category AS ENUM ('sale', 'callback', 'noanswer', 'dnc', 'busy', 'voicemail', 'other');
CREATE TYPE trunk_transport AS ENUM ('udp', 'tcp', 'tls');
CREATE TYPE phone_type AS ENUM ('webrtc', 'external');

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role user_role NOT NULL DEFAULT 'agent',
    active BOOLEAN NOT NULL DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- AGENTS
-- ============================================================

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sip_username VARCHAR(50) UNIQUE NOT NULL,
    sip_password VARCHAR(255) NOT NULL,
    extension VARCHAR(10) UNIQUE NOT NULL,
    phone_type phone_type NOT NULL DEFAULT 'webrtc',
    status agent_status NOT NULL DEFAULT 'offline',
    status_changed_at TIMESTAMPTZ DEFAULT NOW(),
    max_channels INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_agent_user UNIQUE (user_id)
);

CREATE INDEX idx_agents_user_id ON agents(user_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_sip_username ON agents(sip_username);

-- ============================================================
-- AGENT SESSIONS
-- ============================================================

CREATE TABLE agent_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    logout_at TIMESTAMPTZ,
    total_talk_time INT DEFAULT 0,       -- seconds
    total_pause_time INT DEFAULT 0,      -- seconds
    total_wrapup_time INT DEFAULT 0,     -- seconds
    calls_handled INT DEFAULT 0,
    calls_missed INT DEFAULT 0
);

CREATE INDEX idx_agent_sessions_agent_id ON agent_sessions(agent_id);
CREATE INDEX idx_agent_sessions_login_at ON agent_sessions(login_at);

-- ============================================================
-- SIP TRUNKS
-- ============================================================

CREATE TABLE sip_trunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 5060,
    username VARCHAR(100),
    password_encrypted VARCHAR(512),
    codecs VARCHAR(100) DEFAULT 'ulaw,alaw,opus',
    transport trunk_transport NOT NULL DEFAULT 'udp',
    context VARCHAR(50) DEFAULT 'from-trunk',
    max_channels INT DEFAULT 30,
    active BOOLEAN NOT NULL DEFAULT true,
    last_health_check TIMESTAMPTZ,
    health_status VARCHAR(20) DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CAMPAIGNS
-- ============================================================

CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    type campaign_type NOT NULL DEFAULT 'progressive',
    status campaign_status NOT NULL DEFAULT 'draft',
    trunk_id UUID REFERENCES sip_trunks(id) ON DELETE SET NULL,
    caller_id VARCHAR(20),
    max_concurrency INT NOT NULL DEFAULT 5,
    retry_count INT NOT NULL DEFAULT 3,
    retry_interval INT NOT NULL DEFAULT 3600,   -- seconds
    amd_enabled BOOLEAN NOT NULL DEFAULT false,
    amd_initial_silence INT DEFAULT 2500,
    amd_greeting INT DEFAULT 1500,
    amd_after_greeting INT DEFAULT 800,
    amd_total_time INT DEFAULT 5000,
    schedule_start TIME,
    schedule_end TIME,
    timezone VARCHAR(50) DEFAULT 'UTC',
    queue_id UUID,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_status ON campaigns(status);

-- ============================================================
-- CAMPAIGN CONTACTS
-- ============================================================

CREATE TABLE campaign_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    custom_data JSONB DEFAULT '{}',
    status contact_status NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_attempt TIMESTAMPTZ,
    next_attempt TIMESTAMPTZ,
    disposition VARCHAR(100),
    agent_id UUID REFERENCES agents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_contacts_campaign ON campaign_contacts(campaign_id);
CREATE INDEX idx_campaign_contacts_status ON campaign_contacts(campaign_id, status);
CREATE INDEX idx_campaign_contacts_phone ON campaign_contacts(phone);
CREATE INDEX idx_campaign_contacts_next_attempt ON campaign_contacts(campaign_id, status, next_attempt);

-- ============================================================
-- CALLS (CDR)
-- ============================================================

CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uniqueid VARCHAR(100) UNIQUE,
    channel VARCHAR(200),
    trunk_id UUID REFERENCES sip_trunks(id),
    campaign_id UUID REFERENCES campaigns(id),
    agent_id UUID REFERENCES agents(id),
    contact_id UUID REFERENCES campaign_contacts(id),
    queue_id UUID,
    caller_id VARCHAR(50),
    callee VARCHAR(50),
    direction call_direction NOT NULL DEFAULT 'outbound',
    status call_status NOT NULL DEFAULT 'originated',
    duration INT DEFAULT 0,          -- total seconds
    billsec INT DEFAULT 0,          -- billing seconds (after answer)
    hold_time INT DEFAULT 0,
    recording_path VARCHAR(500),
    amd_result VARCHAR(50),
    disposition VARCHAR(100),
    hangup_cause VARCHAR(50),
    hangup_cause_code INT,
    variables JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    bridged_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

CREATE INDEX idx_calls_uniqueid ON calls(uniqueid);
CREATE INDEX idx_calls_agent_id ON calls(agent_id);
CREATE INDEX idx_calls_campaign_id ON calls(campaign_id);
CREATE INDEX idx_calls_started_at ON calls(started_at);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_calls_direction ON calls(direction);

-- ============================================================
-- QUEUES (ACD)
-- ============================================================

CREATE TABLE queues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    strategy queue_strategy NOT NULL DEFAULT 'roundrobin',
    timeout INT NOT NULL DEFAULT 30,        -- ring timeout per agent
    max_wait INT NOT NULL DEFAULT 300,      -- max wait time in queue
    wrapup_time INT NOT NULL DEFAULT 10,    -- post-call wrapup seconds
    announce_frequency INT DEFAULT 60,
    announce_holdtime BOOLEAN DEFAULT true,
    music_on_hold VARCHAR(100) DEFAULT 'default',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUEUE AGENTS
-- ============================================================

CREATE TABLE queue_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    priority INT NOT NULL DEFAULT 1,
    penalty INT NOT NULL DEFAULT 0,
    UNIQUE(queue_id, agent_id)
);

CREATE INDEX idx_queue_agents_queue ON queue_agents(queue_id);
CREATE INDEX idx_queue_agents_agent ON queue_agents(agent_id);

-- ============================================================
-- CALL FLOWS (IVR)
-- ============================================================

CREATE TABLE call_flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    flow_json JSONB NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIO FILES
-- ============================================================

CREATE TABLE audio_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(50) DEFAULT 'audio/wav',
    size_bytes BIGINT,
    duration FLOAT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DNC LIST
-- ============================================================

CREATE TABLE dnc_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    reason VARCHAR(255),
    source VARCHAR(50) DEFAULT 'manual',
    added_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dnc_phone ON dnc_list(phone);

-- ============================================================
-- DISPOSITIONS
-- ============================================================

CREATE TABLE dispositions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    category disposition_category NOT NULL DEFAULT 'other',
    requires_callback BOOLEAN DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT DEFAULT 0
);

-- ============================================================
-- ASTERISK REALTIME TABLES (PJSIP)
-- ============================================================

-- ps_endpoints
CREATE TABLE ps_endpoints (
    id VARCHAR(40) PRIMARY KEY,
    transport VARCHAR(40),
    aors VARCHAR(200),
    auth VARCHAR(40),
    context VARCHAR(40) DEFAULT 'from-internal',
    disallow VARCHAR(200) DEFAULT 'all',
    allow VARCHAR(200) DEFAULT 'opus,ulaw,alaw',
    direct_media VARCHAR(10) DEFAULT 'no',
    force_rport VARCHAR(10) DEFAULT 'yes',
    rewrite_contact VARCHAR(10) DEFAULT 'yes',
    rtp_symmetric VARCHAR(10) DEFAULT 'yes',
    ice_support VARCHAR(10) DEFAULT 'no',
    webrtc VARCHAR(10) DEFAULT 'no',
    dtls_auto_generate_cert VARCHAR(10) DEFAULT 'no',
    media_encryption VARCHAR(40) DEFAULT 'no',
    media_encryption_optimistic VARCHAR(10) DEFAULT 'no',
    dtmf_mode VARCHAR(20) DEFAULT 'rfc4733',
    callerid VARCHAR(100),
    callerid_privacy VARCHAR(40),
    send_pai VARCHAR(10) DEFAULT 'no',
    trust_id_inbound VARCHAR(10) DEFAULT 'no',
    from_user VARCHAR(40),
    from_domain VARCHAR(100),
    language VARCHAR(10) DEFAULT 'en',
    max_audio_streams INT DEFAULT 1,
    device_state_busy_at INT DEFAULT 1,
    allow_subscribe VARCHAR(10) DEFAULT 'yes',
    mailboxes VARCHAR(200),
    named_call_group VARCHAR(100),
    named_pickup_group VARCHAR(100),
    outbound_auth VARCHAR(40),
    outbound_proxy VARCHAR(200)
);

-- ps_auths
CREATE TABLE ps_auths (
    id VARCHAR(40) PRIMARY KEY,
    auth_type VARCHAR(20) DEFAULT 'userpass',
    password VARCHAR(80),
    username VARCHAR(40),
    realm VARCHAR(40),
    md5_cred VARCHAR(40)
);

-- ps_aors
CREATE TABLE ps_aors (
    id VARCHAR(40) PRIMARY KEY,
    max_contacts INT DEFAULT 1,
    remove_existing VARCHAR(10) DEFAULT 'yes',
    qualify_frequency INT DEFAULT 60,
    authenticate_qualify VARCHAR(10) DEFAULT 'no',
    minimum_expiration INT DEFAULT 60,
    default_expiration INT DEFAULT 3600,
    maximum_expiration INT DEFAULT 7200,
    support_path VARCHAR(10) DEFAULT 'no',
    mailboxes VARCHAR(200)
);

-- ============================================================
-- DEFAULT DISPOSITIONS
-- ============================================================

INSERT INTO dispositions (name, category, requires_callback, sort_order) VALUES
    ('Sale', 'sale', false, 1),
    ('Interested - Callback', 'callback', true, 2),
    ('Not Interested', 'other', false, 3),
    ('No Answer', 'noanswer', false, 4),
    ('Busy', 'busy', false, 5),
    ('Voicemail', 'voicemail', false, 6),
    ('Wrong Number', 'other', false, 7),
    ('Do Not Call', 'dnc', false, 8),
    ('Disconnected', 'other', false, 9),
    ('Answering Machine', 'voicemail', false, 10);

-- ============================================================
-- Add foreign key for campaigns.queue_id after queues table exists
-- ============================================================
ALTER TABLE campaigns ADD CONSTRAINT fk_campaigns_queue
    FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL;

ALTER TABLE calls ADD CONSTRAINT fk_calls_queue
    FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL;

-- ============================================================
-- Updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sip_trunks_updated_at BEFORE UPDATE ON sip_trunks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_queues_updated_at BEFORE UPDATE ON queues FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_call_flows_updated_at BEFORE UPDATE ON call_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at();
