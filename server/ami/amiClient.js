const net = require('net');
const EventEmitter = require('events');
const config = require('../config');
const logger = require('../utils/logger');

class AMIClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this.buffer = '';
    this.reconnectTimer = null;
    this.actionId = 0;
    this.pendingActions = new Map();
  }

  connect() {
    this.socket = net.createConnection({
      host: config.ami.host,
      port: config.ami.port,
    });

    this.socket.setEncoding('utf8');

    this.socket.on('connect', () => {
      this.connected = true;
      logger.info('AMI TCP connected');
    });

    this.socket.on('data', (data) => {
      this.buffer += data;
      this.processBuffer();
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.authenticated = false;
      logger.warn('AMI disconnected');
      this.scheduleReconnect();
    });

    this.socket.on('error', (err) => {
      logger.error('AMI socket error', err.message);
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info('Attempting AMI reconnect...');
      this.connect();
    }, 5000);
  }

  processBuffer() {
    const messages = this.buffer.split('\r\n\r\n');
    // Keep the last incomplete message in buffer
    this.buffer = messages.pop() || '';

    for (const msg of messages) {
      if (!msg.trim()) continue;
      const parsed = this.parseMessage(msg);

      if (parsed['Asterisk Call Manager']) {
        // Banner line - now authenticate
        this.login();
        continue;
      }

      if (parsed.Response) {
        // Handle action response
        const actionId = parsed.ActionID;
        if (actionId && this.pendingActions.has(actionId)) {
          const { resolve } = this.pendingActions.get(actionId);
          this.pendingActions.delete(actionId);
          resolve(parsed);
        }

        if (parsed.Response === 'Success' && parsed.Message === 'Authentication accepted') {
          this.authenticated = true;
          logger.info('AMI authenticated');
          this.emit('authenticated');
        }
      }

      if (parsed.Event) {
        this.emit('event', parsed);
        this.emit(parsed.Event, parsed);
      }
    }
  }

  parseMessage(msg) {
    const result = {};
    const lines = msg.split('\r\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      result[key] = value;
    }
    return result;
  }

  login() {
    this.sendRaw(
      `Action: Login\r\nUsername: ${config.ami.user}\r\nSecret: ${config.ami.pass}\r\n\r\n`
    );
  }

  sendRaw(data) {
    if (this.socket && this.connected) {
      this.socket.write(data);
    }
  }

  action(action, params = {}) {
    return new Promise((resolve, reject) => {
      const actionId = `${++this.actionId}`;
      let msg = `Action: ${action}\r\nActionID: ${actionId}\r\n`;
      for (const [key, value] of Object.entries(params)) {
        msg += `${key}: ${value}\r\n`;
      }
      msg += '\r\n';

      this.pendingActions.set(actionId, { resolve, reject });

      // Timeout pending action after 10 seconds
      setTimeout(() => {
        if (this.pendingActions.has(actionId)) {
          this.pendingActions.delete(actionId);
          reject(new Error(`AMI action ${action} timed out`));
        }
      }, 10000);

      this.sendRaw(msg);
    });
  }

  async getAgentStatus(sipUsername) {
    try {
      const result = await this.action('PJSIPShowEndpoint', { Endpoint: sipUsername });
      return result;
    } catch (err) {
      logger.error('AMI getAgentStatus error', err.message);
      return null;
    }
  }

  disconnect() {
    if (this.socket) {
      this.sendRaw('Action: Logoff\r\n\r\n');
      this.socket.destroy();
      this.socket = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connected = false;
    this.authenticated = false;
  }
}

const amiClient = new AMIClient();
module.exports = amiClient;
