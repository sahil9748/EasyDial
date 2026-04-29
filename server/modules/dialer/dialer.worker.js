const { query } = require('../../db/pool');
const { redis } = require('../../db/redis');
const ariClient = require('../../ari/ariClient');
const logger = require('../../utils/logger');

class DialerWorker {
  constructor() {
    this.running = false;
    this.interval = null;
    this.activeCalls = new Map(); // channelId -> { campaignId, contactId, ... }
  }

  start() {
    if (this.running) return;
    this.running = true;
    logger.info('Dialer worker started');

    // Run every 2 seconds
    this.interval = setInterval(() => this.tick(), 2000);

    // Listen for ARI events
    ariClient.on('StasisStart', (event) => this.handleStasisStart(event));
    ariClient.on('StasisEnd', (event) => this.handleStasisEnd(event));
    ariClient.on('ChannelStateChange', (event) => this.handleStateChange(event));
    ariClient.on('ChannelDestroyed', (event) => this.handleChannelDestroyed(event));
  }

  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info('Dialer worker stopped');
  }

  async tick() {
    try {
      // Get active campaigns from Redis
      const activeCampaignIds = await redis.smembers('active_campaigns');
      if (activeCampaignIds.length === 0) return;

      for (const campaignId of activeCampaignIds) {
        await this.processCampaign(campaignId);
      }
    } catch (err) {
      logger.error('Dialer tick error', err.message);
    }
  }

  async processCampaign(campaignId) {
    try {
      // Get campaign config
      const campResult = await query(
        `SELECT c.*, t.name as trunk_name, t.host as trunk_host, t.username as trunk_username
         FROM campaigns c LEFT JOIN sip_trunks t ON c.trunk_id = t.id
         WHERE c.id = $1 AND c.status = 'active'`,
        [campaignId]
      );

      if (campResult.rows.length === 0) {
        await redis.srem('active_campaigns', campaignId);
        return;
      }

      const campaign = campResult.rows[0];

      // Check current concurrency
      const currentConcurrency = parseInt(
        (await redis.get(`campaign:${campaignId}:concurrency`)) || '0', 10
      );

      if (currentConcurrency >= campaign.max_concurrency) return;

      // For progressive/predictive, check available agents
      let availableAgents = [];
      if (campaign.type !== 'blast') {
        const agentResult = await query(
          `SELECT a.id, a.sip_username, a.extension FROM agents a
           JOIN queue_agents qa ON a.id = qa.agent_id
           WHERE qa.queue_id = $1 AND a.status = 'available'`,
          [campaign.queue_id]
        );
        availableAgents = agentResult.rows;
        if (availableAgents.length === 0) return;
      }

      // Calculate how many calls to place
      let slotsAvailable = campaign.max_concurrency - currentConcurrency;

      if (campaign.type === 'progressive') {
        slotsAvailable = Math.min(slotsAvailable, availableAgents.length);
      } else if (campaign.type === 'predictive') {
        // Simple predictive: dial 1.5x available agents
        slotsAvailable = Math.min(slotsAvailable, Math.ceil(availableAgents.length * 1.5));
      }

      if (slotsAvailable <= 0) return;

      // Get pending contacts
      const contactsResult = await query(
        `SELECT cc.* FROM campaign_contacts cc
         WHERE cc.campaign_id = $1 AND cc.status = 'pending'
         AND cc.attempts < cc.max_attempts
         AND (cc.next_attempt IS NULL OR cc.next_attempt <= NOW())
         AND NOT EXISTS (SELECT 1 FROM dnc_list d WHERE d.phone = cc.phone)
         ORDER BY cc.created_at ASC
         LIMIT $2`,
        [campaignId, slotsAvailable]
      );

      if (contactsResult.rows.length === 0) {
        // Check if campaign is complete
        const remaining = await query(
          `SELECT COUNT(*) FROM campaign_contacts
           WHERE campaign_id = $1 AND status IN ('pending', 'retry')`,
          [campaignId]
        );
        if (parseInt(remaining.rows[0].count, 10) === 0) {
          await query(`UPDATE campaigns SET status = 'completed' WHERE id = $1`, [campaignId]);
          await redis.srem('active_campaigns', campaignId);
          logger.info(`Campaign ${campaignId} completed — no more contacts`);
        }
        return;
      }

      // Originate calls
      for (const contact of contactsResult.rows) {
        try {
          // Mark as dialing
          await query(
            `UPDATE campaign_contacts SET status = 'dialing', attempts = attempts + 1, last_attempt = NOW()
             WHERE id = $1`, [contact.id]
          );

          // Build endpoint
          const trunkName = campaign.trunk_name
            ? `trunk_${campaign.trunk_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
            : null;

          const endpoint = trunkName
            ? `PJSIP/${contact.phone}@${trunkName}`
            : `PJSIP/${contact.phone}`;

          const channel = await ariClient.originate({
            endpoint,
            callerId: campaign.caller_id || contact.phone,
            context: 'from-dialer',
            extension: 's',
            variables: {
              CAMPAIGN_ID: campaignId,
              CONTACT_ID: contact.id,
              AMD_ENABLED: campaign.amd_enabled ? '1' : '0',
            },
          });

          if (channel && channel.id) {
            // Track active call
            this.activeCalls.set(channel.id, {
              campaignId,
              contactId: contact.id,
              phone: contact.phone,
              startedAt: new Date(),
            });

            // Create call record
            await query(
              `INSERT INTO calls (uniqueid, channel, campaign_id, contact_id, callee, caller_id,
               direction, status, trunk_id)
               VALUES ($1, $2, $3, $4, $5, $6, 'outbound', 'originated', $7)`,
              [channel.id, channel.name, campaignId, contact.id, contact.phone,
               campaign.caller_id, campaign.trunk_id]
            );

            await redis.incr(`campaign:${campaignId}:concurrency`);

            logger.debug(`Originated call to ${contact.phone} for campaign ${campaignId}`);
          }
        } catch (err) {
          logger.error(`Failed to originate call to ${contact.phone}`, err.message);
          // Mark contact as failed for retry
          const retryAt = new Date(Date.now() + campaign.retry_interval * 1000);
          await query(
            `UPDATE campaign_contacts SET status = 'retry', next_attempt = $2 WHERE id = $1`,
            [contact.id, retryAt]
          );
        }
      }
    } catch (err) {
      logger.error(`Process campaign ${campaignId} error`, err.message);
    }
  }

  async handleStasisStart(event) {
    const channelId = event.channel?.id;
    if (!channelId) return;

    const callInfo = this.activeCalls.get(channelId);
    if (!callInfo) return;

    logger.debug(`StasisStart for channel ${channelId}`);

    // If AMD is enabled, the dialplan would have already run AMD()
    // Check for AMD result in channel variable
    const amdResult = event.channel?.channelvars?.AMD_STATUS;
    if (amdResult) {
      await query(`UPDATE calls SET amd_result = $1 WHERE uniqueid = $2`, [amdResult, channelId]);

      if (amdResult === 'MACHINE') {
        // Hang up on answering machines
        await ariClient.hangup(channelId);
        return;
      }
    }

    // Start recording
    try {
      const recName = `${callInfo.campaignId}_${channelId}_${Date.now()}`;
      await ariClient.record(channelId, recName, 'wav');
      await query(
        `UPDATE calls SET recording_path = $1, status = 'answered', answered_at = NOW() WHERE uniqueid = $2`,
        [`/var/spool/asterisk/monitor/${recName}.wav`, channelId]
      );
    } catch (err) {
      logger.error('Recording start error', err.message);
    }

    // For progressive/predictive, bridge to available agent
    try {
      const campResult = await query(`SELECT type, queue_id FROM campaigns WHERE id = $1`, [callInfo.campaignId]);
      if (campResult.rows.length === 0) return;
      const campaign = campResult.rows[0];

      if (campaign.type !== 'blast' && campaign.queue_id) {
        // Find available agent
        const agentResult = await query(
          `SELECT a.id, a.sip_username, a.extension FROM agents a
           JOIN queue_agents qa ON a.id = qa.agent_id
           WHERE qa.queue_id = $1 AND a.status = 'available'
           ORDER BY RANDOM() LIMIT 1`,
          [campaign.queue_id]
        );

        if (agentResult.rows.length > 0) {
          const agent = agentResult.rows[0];

          // Set agent as busy
          await query(`UPDATE agents SET status = 'busy', status_changed_at = NOW() WHERE id = $1`, [agent.id]);
          await redis.hset(`agent:${agent.id}`, 'status', 'busy');
          await redis.publish('agent:status', JSON.stringify({ agentId: agent.id, status: 'busy' }));

          // Create bridge and add both channels
          const bridge = await ariClient.createBridge('mixing', `call_${channelId}`);

          // Add customer channel to bridge
          await ariClient.addToBridge(bridge.id, channelId);

          // Originate to agent
          const agentChannel = await ariClient.originate({
            endpoint: `PJSIP/${agent.sip_username}`,
            context: 'from-internal',
            extension: agent.extension,
            callerId: callInfo.phone,
          });

          if (agentChannel && agentChannel.id) {
            await ariClient.addToBridge(bridge.id, agentChannel.id);

            // Update call record
            await query(
              `UPDATE calls SET agent_id = $1, status = 'bridged', bridged_at = NOW() WHERE uniqueid = $2`,
              [agent.id, channelId]
            );

            await query(
              `UPDATE campaign_contacts SET agent_id = $1 WHERE id = $2`,
              [agent.id, callInfo.contactId]
            );
          }
        }
      }
    } catch (err) {
      logger.error('Bridge to agent error', err.message);
    }
  }

  async handleStasisEnd(event) {
    const channelId = event.channel?.id;
    if (!channelId) return;

    const callInfo = this.activeCalls.get(channelId);
    if (!callInfo) return;

    this.activeCalls.delete(channelId);

    // Decrement concurrency
    await redis.decr(`campaign:${callInfo.campaignId}:concurrency`);

    // Update call record
    await query(
      `UPDATE calls SET status = 'completed', ended_at = NOW(),
       duration = EXTRACT(EPOCH FROM (NOW() - started_at))::int,
       billsec = CASE WHEN answered_at IS NOT NULL
         THEN EXTRACT(EPOCH FROM (NOW() - answered_at))::int ELSE 0 END
       WHERE uniqueid = $1`,
      [channelId]
    );

    // Update contact status
    await query(
      `UPDATE campaign_contacts SET status = 'completed' WHERE id = $1 AND status = 'dialing'`,
      [callInfo.contactId]
    );

    // Release agent
    const callResult = await query('SELECT agent_id FROM calls WHERE uniqueid = $1', [channelId]);
    if (callResult.rows.length > 0 && callResult.rows[0].agent_id) {
      const agentId = callResult.rows[0].agent_id;
      await query(`UPDATE agents SET status = 'wrapup', status_changed_at = NOW() WHERE id = $1`, [agentId]);
      await redis.hset(`agent:${agentId}`, 'status', 'wrapup');
      await redis.publish('agent:status', JSON.stringify({ agentId, status: 'wrapup' }));

      // Auto-transition from wrapup to available after queue wrapup time
      setTimeout(async () => {
        try {
          const current = await query('SELECT status FROM agents WHERE id = $1', [agentId]);
          if (current.rows.length > 0 && current.rows[0].status === 'wrapup') {
            await query(`UPDATE agents SET status = 'available', status_changed_at = NOW() WHERE id = $1`, [agentId]);
            await redis.hset(`agent:${agentId}`, 'status', 'available');
            await redis.publish('agent:status', JSON.stringify({ agentId, status: 'available' }));
          }
        } catch (e) { /* ignore */ }
      }, 10000);
    }

    // Publish call ended event
    await redis.publish('call:ended', JSON.stringify({ channelId, ...callInfo }));

    logger.debug(`Call ended: ${channelId}`);
  }

  handleStateChange(event) {
    // Track ringing, answered states
    const channelId = event.channel?.id;
    const state = event.channel?.state;
    if (channelId && state === 'Up') {
      query(`UPDATE calls SET status = 'answered', answered_at = NOW() WHERE uniqueid = $1 AND answered_at IS NULL`, [channelId])
        .catch(err => logger.error('State change update error', err.message));
    }
  }

  handleChannelDestroyed(event) {
    const channelId = event.channel?.id;
    if (channelId && this.activeCalls.has(channelId)) {
      this.handleStasisEnd(event);
    }
  }
}

const dialerWorker = new DialerWorker();
module.exports = dialerWorker;
