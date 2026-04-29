const axios = require('axios');
const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('../config');
const logger = require('../utils/logger');

class ARIClient extends EventEmitter {
  constructor() {
    super();
    this.baseUrl = config.ari.url;
    this.user = config.ari.user;
    this.pass = config.ari.pass;
    this.app = config.ari.app;
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.http = axios.create({
      baseURL: `${this.baseUrl}/ari`,
      auth: { username: this.user, password: this.pass },
      timeout: 10000,
    });
  }

  // Connect to ARI WebSocket for events
  connect() {
    const wsUrl = this.baseUrl.replace('http', 'ws');
    const url = `${wsUrl}/ari/events?api_key=${this.user}:${this.pass}&app=${this.app}&subscribeAll=true`;

    try {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.connected = true;
        logger.info('ARI WebSocket connected');
        this.emit('connected');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      });

      this.ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.emit('event', event);
          this.emit(event.type, event);
        } catch (err) {
          logger.error('ARI event parse error', err);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        logger.warn('ARI WebSocket disconnected');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        logger.error('ARI WebSocket error', err.message);
      });
    } catch (err) {
      logger.error('ARI connect error', err.message);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      logger.info('Attempting ARI reconnect...');
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  // REST API methods

  async originate({ endpoint, extension, context, callerId, variables, timeout }) {
    try {
      const res = await this.http.post('/channels', null, {
        params: {
          endpoint,
          extension: extension || 's',
          context: context || 'from-dialer',
          callerId: callerId || '',
          timeout: timeout || 30,
          app: this.app,
          variables: variables ? JSON.stringify(variables) : undefined,
        },
      });
      return res.data;
    } catch (err) {
      logger.error('ARI originate error', err.response?.data || err.message);
      throw err;
    }
  }

  async hangup(channelId, reason = 'normal') {
    try {
      await this.http.delete(`/channels/${channelId}`, {
        params: { reason_code: reason },
      });
    } catch (err) {
      logger.error('ARI hangup error', err.response?.data || err.message);
    }
  }

  async getChannels() {
    try {
      const res = await this.http.get('/channels');
      return res.data;
    } catch (err) {
      logger.error('ARI getChannels error', err.response?.data || err.message);
      return [];
    }
  }

  async createBridge(type = 'mixing', name = '') {
    try {
      const res = await this.http.post('/bridges', null, {
        params: { type, name },
      });
      return res.data;
    } catch (err) {
      logger.error('ARI createBridge error', err.response?.data || err.message);
      throw err;
    }
  }

  async addToBridge(bridgeId, channelId) {
    try {
      await this.http.post(`/bridges/${bridgeId}/addChannel`, null, {
        params: { channel: channelId },
      });
    } catch (err) {
      logger.error('ARI addToBridge error', err.response?.data || err.message);
    }
  }

  async playback(channelId, media) {
    try {
      const res = await this.http.post(`/channels/${channelId}/play`, null, {
        params: { media },
      });
      return res.data;
    } catch (err) {
      logger.error('ARI playback error', err.response?.data || err.message);
    }
  }

  async record(channelId, name, format = 'wav') {
    try {
      const res = await this.http.post(`/channels/${channelId}/record`, null, {
        params: {
          name,
          format,
          maxDurationSeconds: 7200,
          ifExists: 'overwrite',
          beep: false,
        },
      });
      return res.data;
    } catch (err) {
      logger.error('ARI record error', err.response?.data || err.message);
    }
  }

  async muteChannel(channelId, direction = 'in') {
    try {
      await this.http.post(`/channels/${channelId}/mute`, null, {
        params: { direction },
      });
    } catch (err) {
      logger.error('ARI mute error', err.response?.data || err.message);
    }
  }

  async unmuteChannel(channelId, direction = 'in') {
    try {
      await this.http.delete(`/channels/${channelId}/mute`, {
        params: { direction },
      });
    } catch (err) {
      logger.error('ARI unmute error', err.response?.data || err.message);
    }
  }

  async holdChannel(channelId) {
    try {
      await this.http.post(`/channels/${channelId}/hold`);
    } catch (err) {
      logger.error('ARI hold error', err.response?.data || err.message);
    }
  }

  async unholdChannel(channelId) {
    try {
      await this.http.delete(`/channels/${channelId}/hold`);
    } catch (err) {
      logger.error('ARI unhold error', err.response?.data || err.message);
    }
  }

  async sendDTMF(channelId, dtmf) {
    try {
      await this.http.post(`/channels/${channelId}/dtmf`, null, {
        params: { dtmf },
      });
    } catch (err) {
      logger.error('ARI DTMF error', err.response?.data || err.message);
    }
  }

  async redirect(channelId, endpoint) {
    try {
      await this.http.post(`/channels/${channelId}/redirect`, null, {
        params: { endpoint },
      });
    } catch (err) {
      logger.error('ARI redirect error', err.response?.data || err.message);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connected = false;
  }
}

// Singleton
const ariClient = new ARIClient();
module.exports = ariClient;
