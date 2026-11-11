import type { Command, PlayerRecord, ServerMessage } from '../../shared/types';

const TOKEN_KEY = 'mojing.session.v1';
export const session = {
  get token(): string { return localStorage.getItem(TOKEN_KEY) ?? ''; },
  set token(token: string) { localStorage.setItem(TOKEN_KEY, token); },
  clear() { localStorage.removeItem(TOKEN_KEY); },
};
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '请求失败，请稍后再试');
  return result as T;
}
export async function characters(): Promise<PlayerRecord[]> {
  return (await api<{ characters: PlayerRecord[] }>('/characters')).characters;
}
export class Connection {
  private socket?: WebSocket;
  private stopped = false;
  private welcomed = false;
  private retry?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private pingTimer?: ReturnType<typeof setInterval>;
  latency = 0;
  get connected() { return !this.stopped && this.welcomed && this.socket?.readyState === WebSocket.OPEN; }
  constructor(private characterId: string, private receive: (message: ServerMessage) => void, private status: (connected: boolean, text: string, permanent?: boolean) => void) {}
  connect() {
    if (this.stopped) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket = socket;
    this.welcomed = false;
    socket.onopen = () => {
      if (this.stopped || this.socket !== socket) return;
      socket.send(JSON.stringify({ type: 'hello', token: session.token, characterId: this.characterId }));
    };
    socket.onmessage = event => {
      if (this.stopped || this.socket !== socket) return;
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === 'welcome') {
        this.welcomed = true;
        this.attempts = 0;
        this.status(true, '已连接');
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.send({ type: 'ping', time: Date.now() }), 5000);
      }
      if (message.type === 'pong') this.latency = Math.max(0, Date.now() - message.time);
      this.receive(message);
    };
    socket.onclose = event => {
      if (this.socket !== socket) return;
      this.welcomed = false;
      clearInterval(this.pingTimer);
      if (this.stopped) return;
      const permanent = event.code === 4001 || event.code === 4003 || event.code === 4009;
      this.status(false, permanent ? '会话已结束，请重新登录' : '连接中断，正在重连…', permanent);
      if (!permanent) this.retry = setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.attempts++, 10000));
    };
    socket.onerror = () => { if (!this.stopped && this.socket === socket) this.status(false, '正在连接服务器…'); };
  }
  send(command: Command) {
    if (!this.connected) return false;
    this.socket!.send(JSON.stringify(command));
    return true;
  }
  close() {
    this.stopped = true;
    this.welcomed = false;
    clearTimeout(this.retry);
    clearInterval(this.pingTimer);
    this.socket?.close();
  }
}
