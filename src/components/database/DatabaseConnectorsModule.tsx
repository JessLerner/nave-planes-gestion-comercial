import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Database,
  RefreshCw,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings,
  Link,
  Code,
  Copy,
  Check,
  FileSpreadsheet,
  Upload,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { DatabaseConnectorConfig } from '../../types/database';

export const DatabaseConnectorsModule: React.FC = () => {
  const {
    connectors,
    updateConnector,
    testConnector,
    syncConnector,
    testingConnectorId,
    syncingConnectorId,
    operations,
    sellers,
    teams,
    carteraMora,
    importBulkData,
  } = useApp();

  const [selectedConnector, setSelectedConnector] = useState<DatabaseConnectorConfig | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [showSqlSchema, setShowSqlSchema] = useState(false);

  const postgresDdl = `-- DDL DE TABLAS PARA CONCESIONARIA NAVE PLANES (PostgreSQL / Supabase)

CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  supervisor_id VARCHAR(64),
  supervisor_name VARCHAR(120) NOT NULL,
  branch VARCHAR(120) NOT NULL,
  target_override INT,
  color VARCHAR(20) DEFAULT '#2563EB'
);

CREATE TABLE IF NOT EXISTS sellers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  team_id VARCHAR(64) REFERENCES teams(id),
  active BOOLEAN DEFAULT TRUE,
  hire_date DATE NOT NULL,
  termination_date DATE,
  phone VARCHAR(40),
  email VARCHAR(120),
  dni VARCHAR(30) NOT NULL,
  individual_target INT DEFAULT 4
);

CREATE TABLE IF NOT EXISTS sales_operations (
  id VARCHAR(64) PRIMARY KEY,
  date DATE NOT NULL,
  client_name VARCHAR(140) NOT NULL,
  client_dni VARCHAR(30) NOT NULL,
  client_phone VARCHAR(40),
  subscription_number VARCHAR(60) UNIQUE NOT NULL,
  brand VARCHAR(40) NOT NULL,
  model VARCHAR(80) NOT NULL,
  plan_type VARCHAR(20) NOT NULL,
  cuota_1_value NUMERIC(12, 2) NOT NULL,
  total_collected NUMERIC(12, 2) NOT NULL,
  factory_account VARCHAR(60),
  used_car_flag BOOLEAN DEFAULT FALSE,
  seller_id VARCHAR(64) REFERENCES sellers(id),
  team_id VARCHAR(64) REFERENCES teams(id),
  lead_source VARCHAR(60) NOT NULL,
  status VARCHAR(30) NOT NULL, -- 'pending_scoring' | 'apto_fabrica' | 'ingresado_fabrica' | 'caido'
  scoring_status VARCHAR(20) NOT NULL, -- 'approved' | 'rejected' | 'pending'
  scoring_notes TEXT,
  audited_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_lists (
  id VARCHAR(64) PRIMARY KEY,
  brand VARCHAR(40) NOT NULL,
  model VARCHAR(80) NOT NULL,
  version VARCHAR(80) NOT NULL,
  plan_type VARCHAR(20) NOT NULL,
  cuota_1_value NUMERIC(12, 2) NOT NULL,
  factory_quota_value NUMERIC(12, 2) NOT NULL,
  car_value NUMERIC(14, 2) NOT NULL,
  bonus_discount NUMERIC(12, 2) DEFAULT 0,
  updated_at DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS cartera_mora (
  id VARCHAR(64) PRIMARY KEY,
  subscription_number VARCHAR(60) NOT NULL,
  client_name VARCHAR(140) NOT NULL,
  seller_id VARCHAR(64) REFERENCES sellers(id),
  team_id VARCHAR(64) REFERENCES teams(id),
  brand VARCHAR(40) NOT NULL,
  model VARCHAR(80) NOT NULL,
  grouping_status VARCHAR(40) NOT NULL,
  overdue_installments INT DEFAULT 0,
  total_debt NUMERIC(12, 2) DEFAULT 0,
  plan_status VARCHAR(40) NOT NULL,
  last_payment_date DATE
);`;

  const handleCopyDdl = () => {
    navigator.clipboard.writeText(postgresDdl);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2000);
  };

  const handleTest = async (conn: DatabaseConnectorConfig) => {
    const res = await testConnector(conn);
    setTestResult({
      id: conn.id,
      success: res.success,
      msg: res.message,
    });
  };

  const handleSync = async (conn: DatabaseConnectorConfig) => {
    const res = await syncConnector(conn.id);
    setTestResult({
      id: conn.id,
      success: res.success,
      msg: res.message,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Database className="w-4 h-4" />
            <span>Infraestructura de Datos & Integración Multi-Base</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            Conexiones a Bases de Datos & Pipelines ETL
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Conectores activos para extracción de datos reales desde PostgreSQL / Supabase, API de Data-Extractor (Fox CRM) y Google Sheets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSqlSchema(!showSqlSchema)}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Code className="w-3.5 h-3.5 text-blue-400" />
            <span>{showSqlSchema ? 'Ocultar DDL SQL' : 'Ver Esquema DDL SQL'}</span>
          </button>
        </div>
      </div>

      {/* SQL DDL Panel */}
      {showSqlSchema && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Esquema SQL Oficial de Base de Datos (PostgreSQL / Supabase)</span>
              </h3>
              <p className="text-xs text-slate-400">
                Ejecute este script en su servidor PostgreSQL para crear las tablas requeridas por la concesionaria.
              </p>
            </div>
            <button
              onClick={handleCopyDdl}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
            >
              {copiedDdl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedDdl ? 'Copiado al Portapapeles' : 'Copiar DDL'}</span>
            </button>
          </div>
          <pre className="bg-slate-950 p-4 rounded-lg font-mono text-xs text-slate-300 overflow-x-auto max-h-72 border border-slate-800">
            {postgresDdl}
          </pre>
        </div>
      )}

      {/* Active Connectors List */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {connectors.map(conn => {
          const isTesting = testingConnectorId === conn.id;
          const isSyncing = syncingConnectorId === conn.id;
          const isConnected = conn.status === 'connected';
          const isError = conn.status === 'error';

          return (
            <div
              key={conn.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      {conn.type === 'postgresql' || conn.type === 'supabase' ? (
                        <Server className="w-4 h-4" />
                      ) : conn.type === 'data_extractor' ? (
                        <Database className="w-4 h-4" />
                      ) : (
                        <FileSpreadsheet className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm leading-tight">{conn.name}</h4>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider font-mono">
                        {conn.type.toUpperCase()}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      isConnected
                        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                        : isError
                        ? 'bg-red-950/60 border-red-800 text-red-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {isConnected ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Conectado
                      </>
                    ) : isError ? (
                      <>
                        <XCircle className="w-3 h-3 text-red-400" /> Error
                      </>
                    ) : (
                      'Desconectado'
                    )}
                  </span>
                </div>

                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                  {conn.description}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-800 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Tablas / Entidades Mapeadas:</span>
                    <span className="font-mono text-slate-200">{conn.tables_mapped?.length || 0}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate font-mono">
                    {conn.tables_mapped?.join(', ')}
                  </div>
                  {conn.last_sync && (
                    <div className="text-[10px] text-slate-500">
                      Última extracción: {new Date(conn.last_sync).toLocaleTimeString()}
                    </div>
                  )}
                  {conn.error_message && (
                    <div className="text-[11px] text-red-400 pt-1">
                      {conn.error_message}
                    </div>
                  )}
                </div>
              </div>

              {testResult?.id === conn.id && (
                <div
                  className={`mt-3 p-2.5 rounded text-xs leading-snug ${
                    testResult.success
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
                      : 'bg-red-950/60 border border-red-800 text-red-200'
                  }`}
                >
                  {testResult.msg}
                </div>
              )}

              <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => setSelectedConnector(conn)}
                  className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition-colors"
                >
                  <Settings className="w-3 h-3 text-slate-400" />
                  <span>Configurar</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleTest(conn)}
                    disabled={isTesting}
                    className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
                  >
                    {isTesting ? 'Probando...' : 'Probar'}
                  </button>
                  <button
                    onClick={() => handleSync(conn)}
                    disabled={isSyncing}
                    className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Extrayendo...' : 'Extraer'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Database State Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-2">
          Estado Actual del Repositorio de la Concesionaria
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Conteo de entidades reales cargadas en memoria o extraídas desde la base de datos externa:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-400">Operaciones de Venta:</span>
            <div className="text-lg font-mono font-bold text-white mt-1">{operations.length}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-400">Vendedores en Nómina:</span>
            <div className="text-lg font-mono font-bold text-white mt-1">{sellers.length}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-400">Equipos Comerciales:</span>
            <div className="text-lg font-mono font-bold text-white mt-1">{teams.length}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-400">Contratos en Cartera:</span>
            <div className="text-lg font-mono font-bold text-white mt-1">{carteraMora.length}</div>
          </div>
        </div>
      </div>

      {/* Modal: Configurar Conector */}
      {selectedConnector && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-400" />
                <span>Configurar Conexión: {selectedConnector.name}</span>
              </h3>
              <button onClick={() => setSelectedConnector(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                updateConnector(selectedConnector);
                setSelectedConnector(null);
              }}
              className="mt-4 space-y-4 text-xs"
            >
              {selectedConnector.type === 'postgresql' || selectedConnector.type === 'supabase' ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-slate-300 font-medium mb-1">Host / Servidor</label>
                      <input
                        type="text"
                        placeholder="ep-example-pooler.us-east-1.postgres.database.azure.com"
                        value={selectedConnector.config.host || ''}
                        onChange={e =>
                          setSelectedConnector({
                            ...selectedConnector,
                            config: { ...selectedConnector.config, host: e.target.value },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Puerto</label>
                      <input
                        type="number"
                        placeholder="5432"
                        value={selectedConnector.config.port || 5432}
                        onChange={e =>
                          setSelectedConnector({
                            ...selectedConnector,
                            config: { ...selectedConnector.config, port: Number(e.target.value) },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Nombre de Base de Datos</label>
                      <input
                        type="text"
                        placeholder="postgres o naveplanes_db"
                        value={selectedConnector.config.database || ''}
                        onChange={e =>
                          setSelectedConnector({
                            ...selectedConnector,
                            config: { ...selectedConnector.config, database: e.target.value },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Usuario DB</label>
                      <input
                        type="text"
                        placeholder="postgres"
                        value={selectedConnector.config.username || ''}
                        onChange={e =>
                          setSelectedConnector({
                            ...selectedConnector,
                            config: { ...selectedConnector.config, username: e.target.value },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Contraseña</label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={selectedConnector.config.password || ''}
                      onChange={e =>
                        setSelectedConnector({
                          ...selectedConnector,
                          config: { ...selectedConnector.config, password: e.target.value },
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">O Connection String Directa (Opcional)</label>
                    <input
                      type="text"
                      placeholder="postgresql://user:password@host:5432/dbname?sslmode=require"
                      value={selectedConnector.config.connection_string || ''}
                      onChange={e =>
                        setSelectedConnector({
                          ...selectedConnector,
                          config: { ...selectedConnector.config, connection_string: e.target.value },
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedConnector.config.ssl !== false}
                      onChange={e =>
                        setSelectedConnector({
                          ...selectedConnector,
                          config: { ...selectedConnector.config, ssl: e.target.checked },
                        })
                      }
                      className="rounded border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <span>Requerir conexión SSL / TLS (Recomendado para Cloud/Supabase)</span>
                  </label>
                </>
              ) : selectedConnector.type === 'data_extractor' ? (
                <>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">URL Base de API Data-Extractor</label>
                    <input
                      type="text"
                      placeholder="https://api.data-extractor.com/v1"
                      value={selectedConnector.config.api_url || ''}
                      onChange={e =>
                        setSelectedConnector({
                          ...selectedConnector,
                          config: { ...selectedConnector.config, api_url: e.target.value },
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Token de Acceso / API Key</label>
                    <input
                      type="password"
                      placeholder="de_live_••••••••"
                      value={selectedConnector.config.api_key || ''}
                      onChange={e =>
                        setSelectedConnector({
                          ...selectedConnector,
                          config: { ...selectedConnector.config, api_key: e.target.value },
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">URL Pública / Webhook de Google Sheets</label>
                  <input
                    type="text"
                    placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv"
                    value={selectedConnector.config.sheet_url || ''}
                    onChange={e =>
                      setSelectedConnector({
                        ...selectedConnector,
                        config: { ...selectedConnector.config, sheet_url: e.target.value },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedConnector(null)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-600/20"
                >
                  Guardar Conexión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
