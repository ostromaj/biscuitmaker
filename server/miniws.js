// A tiny, dependency-free WebSocket server (RFC 6455), just enough for this game:
// text messages, ping/pong, close. Messages over maxPayload close the connection.
'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class Conn extends EventEmitter {
  constructor(socket, maxPayload) {
    super();
    this.socket = socket;
    this.maxPayload = maxPayload;
    this.readyState = 1;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.fragLen = 0;
    socket.setNoDelay(true);
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._closed());
    socket.on('end', () => this._closed());
    socket.on('error', () => this._closed());
  }

  _closed() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    try {
      this.socket.destroy();
    } catch (e) {}
    this.emit('close');
  }

  _onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.readyState === 1) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const hi = b.readUInt32BE(2);
        len = b.readUInt32BE(6);
        if (hi !== 0) return this.close(1009);
        off = 10;
      }
      if (len > this.maxPayload || this.fragLen + len > this.maxPayload) return this.close(1009);
      if (!masked) return this.close(1002); // clients must mask
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      off += 4;
      const payload = Buffer.from(b.subarray(off, off + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + len);

      if (op === 0x8) {
        this._send(0x8, Buffer.alloc(0));
        return this._closed();
      } else if (op === 0x9) {
        this._send(0xa, payload);
      } else if (op === 0xa) {
        this.emit('pong');
      } else if (op === 0x1 || op === 0x2 || op === 0x0) {
        if (op !== 0x0) {
          this.frags = [];
          this.fragLen = 0;
          this.fragOp = op;
        }
        this.frags.push(payload);
        this.fragLen += payload.length;
        if (fin) {
          const whole = Buffer.concat(this.frags);
          const wasText = this.fragOp === 0x1;
          this.frags = [];
          this.fragLen = 0;
          if (wasText) this.emit('message', whole.toString('utf8'));
        }
      }
    }
  }

  _send(op, payload) {
    if (this.socket.destroyed) return;
    const len = payload.length;
    let head;
    if (len < 126) {
      head = Buffer.from([0x80 | op, len]);
    } else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeUInt32BE(0, 2);
      head.writeUInt32BE(len, 6);
    }
    try {
      this.socket.write(Buffer.concat([head, payload]));
    } catch (e) {
      this._closed();
    }
  }

  send(str) {
    if (this.readyState !== 1) return;
    this._send(0x1, Buffer.from(String(str), 'utf8'));
  }
  ping() {
    if (this.readyState === 1) this._send(0x9, Buffer.alloc(0));
  }
  close(code) {
    if (this.readyState !== 1) return;
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code || 1000, 0);
    this._send(0x8, p);
    this.readyState = 2;
    setTimeout(() => this._closed(), 500);
  }
  terminate() {
    this._closed();
  }
}

// Attach to an http.Server. Calls onConnection(conn) for each new socket on `path`.
function attach(server, path, maxPayload, onConnection) {
  const clients = new Set();
  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://x');
    } catch (e) {
      return socket.destroy();
    }
    const key = req.headers['sec-websocket-key'];
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    if (url.pathname !== path || !key || upgrade !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      return socket.destroy();
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
    );
    const conn = new Conn(socket, maxPayload);
    clients.add(conn);
    conn.on('close', () => clients.delete(conn));
    onConnection(conn);
    if (head && head.length) conn._onData(head);
  });
  return clients;
}

module.exports = { attach };
