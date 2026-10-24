import { SheetRecord, SyncLog, SystemStats, ApiConfig, IngestPayload } from '../../types/extractor';

export const extractorApi = {
  async getRecords(sheet = 'all', search = ''): Promise<{ records: SheetRecord[]; total: number; sheets: string[] }> {
    const params = new URLSearchParams();
    if (sheet && sheet !== 'all') params.append('sheet', sheet);
    if (search) params.append('search', search);

    const res = await fetch(`/api/records?${params.toString()}`);
    if (!res.ok) throw new Error('Error al cargar registros');
    return res.json();
  },

  async getSyncLogs(): Promise<{ logs: SyncLog[]; totalLogs: number }> {
    const res = await fetch('/api/sync-logs');
    if (!res.ok) throw new Error('Error al cargar logs');
    return res.json();
  },

  async getStats(): Promise<SystemStats> {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Error al cargar estadísticas');
    return res.json();
  },

  async getConfig(): Promise<ApiConfig> {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Error al obtener configuración');
    return res.json();
  },

  async updateApiKey(newKey: string): Promise<{ success: boolean; apiKey: string }> {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: newKey })
    });
    if (!res.ok) throw new Error('Error al actualizar API Key');
    return res.json();
  },

  async ingestData(payload: IngestPayload): Promise<any> {
    const res = await fetch('/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(payload.apiKey ? { 'Authorization': `Bearer ${payload.apiKey}` } : {})
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Error en la sincronización');
    }
    return data;
  },

  async deleteRecord(id: string): Promise<any> {
    const res = await fetch('/api/records', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    return res.json();
  },

  async clearAllRecords(): Promise<any> {
    const res = await fetch('/api/records', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearAll: true })
    });
    return res.json();
  },

  async resetDemoData(): Promise<any> {
    const res = await fetch('/api/reset-demo', { method: 'POST' });
    return res.json();
  }
};

export class RealtimeStreamService {
  private eventSource: EventSource | null = null;
  private listeners: Array<(event: string, data: any) => void> = [];
  private isConnected = false;
  private reconnectTimer: any = null;

  connect() {
    if (this.eventSource) return;

    try {
      this.eventSource = new EventSource('/api/stream');

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.notify('status_change', { connected: true });
      };

      this.eventSource.addEventListener('connected', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        this.notify('connected', data);
      });

      this.eventSource.addEventListener('record_ingested', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        this.notify('record_ingested', data);
      });

      this.eventSource.addEventListener('sync_log', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        this.notify('sync_log', data);
      });

      this.eventSource.addEventListener('records_cleared', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        this.notify('records_cleared', data);
      });

      this.eventSource.addEventListener('record_deleted', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        this.notify('record_deleted', data);
      });

      this.eventSource.addEventListener('reset_demo', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        this.notify('reset_demo', data);
      });

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this.notify('status_change', { connected: false });
        this.cleanup();
        
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 4000);
        }
      };
    } catch (err) {
      console.warn('SSE connection failed, will retry', err);
    }
  }

  subscribe(callback: (event: string, data: any) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notify(event: string, data: any) {
    this.listeners.forEach(cb => {
      try {
        cb(event, data);
      } catch (e) {
        console.error('Error in SSE listener callback', e);
      }
    });
  }

  cleanup() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  getStatus() {
    return this.isConnected;
  }
}

export const realtimeStream = new RealtimeStreamService();
