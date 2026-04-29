require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'callcenter',
  user: process.env.DB_USER || 'callcenter',
  password: process.env.DB_PASS || 'changeme',
});

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding database...\n');
    await client.query('BEGIN');

    // --- Users ---
    const adminHash = await bcrypt.hash('admin123', 12);
    const supervisorHash = await bcrypt.hash('super123', 12);
    const agentHash = await bcrypt.hash('agent123', 12);

    const adminResult = await client.query(
      `INSERT INTO users (username, password_hash, email, first_name, last_name, role)
       VALUES ('admin', $1, 'admin@callcenter.local', 'System', 'Admin', 'admin')
       ON CONFLICT (username) DO UPDATE SET password_hash = $1
       RETURNING id`, [adminHash]
    );
    console.log('✅ Admin user: admin / admin123');

    const supResult = await client.query(
      `INSERT INTO users (username, password_hash, email, first_name, last_name, role)
       VALUES ('supervisor', $1, 'supervisor@callcenter.local', 'Lead', 'Supervisor', 'supervisor')
       ON CONFLICT (username) DO UPDATE SET password_hash = $1
       RETURNING id`, [supervisorHash]
    );
    console.log('✅ Supervisor user: supervisor / super123');

    // Create 3 test agents (agent3 uses external SIP phone)
    for (let i = 1; i <= 3; i++) {
      const userResult = await client.query(
        `INSERT INTO users (username, password_hash, email, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, 'agent')
         ON CONFLICT (username) DO UPDATE SET password_hash = $2
         RETURNING id`,
        [`agent${i}`, agentHash, `agent${i}@callcenter.local`, `Agent`, `${i}`]
      );

      const sipUsername = `agent_10${i}`;
      const sipPassword = `agentpass${i}`;
      const extension = `10${i}`;
      const phoneType = i === 3 ? 'external' : 'webrtc';

      await client.query(
        `INSERT INTO agents (user_id, sip_username, sip_password, extension, phone_type)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET sip_password = $3, phone_type = $5
         RETURNING id`,
        [userResult.rows[0].id, sipUsername, sipPassword, extension, phoneType]
      );

      // PJSIP Realtime records — different settings based on phone type
      if (phoneType === 'webrtc') {
        await client.query(
          `INSERT INTO ps_endpoints (id, transport, aors, auth, context, disallow, allow,
           webrtc, dtls_auto_generate_cert, media_encryption, dtmf_mode, direct_media,
           force_rport, rewrite_contact, rtp_symmetric, ice_support, device_state_busy_at)
           VALUES ($1, 'transport-wss', $1, $1, 'from-internal', 'all', 'opus,ulaw,alaw',
           'yes', 'yes', 'dtls', 'rfc4733', 'no', 'yes', 'yes', 'yes', 'yes', 1)
           ON CONFLICT (id) DO NOTHING`,
          [sipUsername]
        );
      } else {
        await client.query(
          `INSERT INTO ps_endpoints (id, transport, aors, auth, context, disallow, allow,
           webrtc, dtmf_mode, direct_media, force_rport, rewrite_contact, rtp_symmetric,
           ice_support, device_state_busy_at)
           VALUES ($1, 'transport-udp', $1, $1, 'from-internal', 'all', 'ulaw,alaw,opus',
           'no', 'rfc4733', 'no', 'yes', 'yes', 'yes', 'no', 1)
           ON CONFLICT (id) DO NOTHING`,
          [sipUsername]
        );
      }

      await client.query(
        `INSERT INTO ps_auths (id, auth_type, password, username)
         VALUES ($1, 'userpass', $2, $1)
         ON CONFLICT (id) DO UPDATE SET password = $2`,
        [sipUsername, sipPassword]
      );

      await client.query(
        `INSERT INTO ps_aors (id, max_contacts, remove_existing, qualify_frequency)
         VALUES ($1, 1, 'yes', 60)
         ON CONFLICT (id) DO NOTHING`,
        [sipUsername]
      );

      const phoneLabel = phoneType === 'external' ? '📱 External SIP' : '🌐 WebRTC';
      console.log(`✅ Agent ${i}: agent${i} / agent123 (SIP: ${sipUsername} / ${sipPassword}, Ext: ${extension}, ${phoneLabel})`);
    }

    // --- Sample SIP Trunk ---
    await client.query(
      `INSERT INTO sip_trunks (name, host, port, username, codecs, transport, context)
       VALUES ('Demo Trunk', 'sip.example.com', 5060, 'demo_user', 'ulaw,alaw,opus', 'udp', 'from-trunk')
       ON CONFLICT (name) DO NOTHING`
    );
    console.log('✅ Sample SIP trunk: Demo Trunk');

    // --- Sample Queue ---
    const queueResult = await client.query(
      `INSERT INTO queues (name, strategy, timeout, max_wait, wrapup_time)
       VALUES ('Sales Queue', 'roundrobin', 30, 300, 10)
       ON CONFLICT (name) DO UPDATE SET strategy = 'roundrobin'
       RETURNING id`
    );
    console.log('✅ Sample queue: Sales Queue');

    // Add agents to queue
    const agentRows = await client.query('SELECT id FROM agents');
    for (const agent of agentRows.rows) {
      await client.query(
        `INSERT INTO queue_agents (queue_id, agent_id) VALUES ($1, $2)
         ON CONFLICT (queue_id, agent_id) DO NOTHING`,
        [queueResult.rows[0].id, agent.id]
      );
    }

    // --- Sample Campaign with contacts ---
    const campResult = await client.query(
      `INSERT INTO campaigns (name, type, caller_id, max_concurrency, retry_count, queue_id, created_by)
       VALUES ('Welcome Campaign', 'progressive', '+15551234567', 5, 3, $1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [queueResult.rows[0].id, adminResult.rows[0].id]
    );

    if (campResult.rows.length > 0) {
      const campId = campResult.rows[0].id;
      // Insert 100 test contacts
      for (let i = 1; i <= 100; i++) {
        const phone = `155500${String(i).padStart(4, '0')}`;
        await client.query(
          `INSERT INTO campaign_contacts (campaign_id, phone, first_name, last_name)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [campId, phone, `Test`, `Contact ${i}`]
        );
      }
      console.log('✅ Sample campaign: Welcome Campaign (100 contacts)');
    }

    // --- Sample IVR Flow ---
    const ivrFlow = {
      nodes: [
        { id: '1', type: 'play', label: 'Play Audio', config: { file: 'sound:welcome' } },
        { id: '2', type: 'collect', label: 'Collect Digits', config: { maxDigits: 1, timeout: 5, actions: { '1': 'sales', '2': 'support' } } },
        { id: '3', type: 'transfer_queue', label: 'Transfer to Queue', config: { queueId: queueResult.rows[0].id } },
      ],
    };

    await client.query(
      `INSERT INTO call_flows (name, description, flow_json, created_by)
       VALUES ('Main IVR', 'Main incoming call flow', $1, $2)
       ON CONFLICT DO NOTHING`,
      [JSON.stringify(ivrFlow), adminResult.rows[0].id]
    );
    console.log('✅ Sample IVR flow: Main IVR');

    await client.query('COMMIT');
    console.log('\n🎉 Seed completed successfully!');
    console.log('\n--- Test Accounts ---');
    console.log('Admin:      admin / admin123');
    console.log('Supervisor: supervisor / super123');
    console.log('Agent 1:    agent1 / agent123 (SIP: agent_101, Ext: 101, 🌐 WebRTC)');
    console.log('Agent 2:    agent2 / agent123 (SIP: agent_102, Ext: 102, 🌐 WebRTC)');
    console.log('Agent 3:    agent3 / agent123 (SIP: agent_103, Ext: 103, 📱 External SIP)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
