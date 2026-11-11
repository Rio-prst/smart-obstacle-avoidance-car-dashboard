import { io, Socket } from 'socket.io-client';
import { ensureToken } from './api-client';

const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000/realtime';

export type RealtimeListener = (event: string, payload: unknown) => void;

class RealtimeClient {
  private socket: Socket | null = null;
  private listeners: Set<RealtimeListener> = new Set();
  private activeDeviceId = 'car01';
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  async connect(deviceId = 'car01'): Promise<Socket> {
    this.activeDeviceId = deviceId;

    if (this.socket?.connected) {
      this.socket.emit('subscribe', { deviceId });
      return this.socket;
    }

    const token = await ensureToken();

    this.socket = io(WS_BASE_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.socket?.emit('subscribe', { deviceId: this.activeDeviceId });
      this.notify('connection.status', { connected: true });
    });

    this.socket.on('disconnect', () => {
      this.notify('connection.status', { connected: false });
    });

    // Pasang listener untuk seluruh event dari server
    const events = [
      'telemetry',
      'status',
      'event',
      'command.update',
      'config.update',
      'control.update',
      'rtt',
      'drive.rejected',
    ];

    for (const ev of events) {
      this.socket.on(ev, (data) => {
        this.notify(ev, data);
      });
    }

    return this.socket;
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.notify('connection.status', { connected: false });
  }

  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: string, payload: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, payload);
      } catch (err) {
        console.error('Error in realtime listener:', err);
      }
    }
  }

  sendDrive(dir: 'F' | 'L' | 'R' | 'S', spd: number): void {
    if (!this.socket?.connected) return;
    this.socket.emit('drive', {
      deviceId: this.activeDeviceId,
      dir,
      spd,
    });
  }

  startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('control.heartbeat', { deviceId: this.activeDeviceId });
      }
    }, 3000);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }
}

export const realtimeClient = new RealtimeClient();
