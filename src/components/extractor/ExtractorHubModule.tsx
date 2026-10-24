import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  FileSpreadsheet,
  Globe,
  Database,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertCircle,
  Download,
  Trash2,
  Search,
  Check,
  Chrome,
  UploadCloud,
  FileText,
  CheckSquare,
  Square,
  Sliders,
  Sparkles,
  Info,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Copy,
  Layers,
  ChevronRight,
  Clock,
  Eye,
  X
} from 'lucide-react';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  fetchSpreadsheetTabs,
  fetchSpreadsheetContent,
  SheetTabSummary,
  ExtractedSheetData
} from '../../services/extractor/googleAuth';
import { User as FirebaseUser } from 'firebase/auth';
import {
  SupabaseConfig,
  loadSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  sendRowsToSupabase,
  getSupabaseSqlScript
} from '../../services/extractor/supabaseClient';
import { extractorApi, realtimeStream } from '../../services/extractor/extractorApi';
import { SheetRecord, SyncLog, SystemStats } from '../../types/extractor';
import { parseSpreadsheetFile, filterColumns, ParsedFileResult } from '../../services/extractor/fileParser';
import { downloadExtensionZip } from '../../services/extractor/extensionBundle';

export const ExtractorHubModule: React.FC = () => {
  const { currentUser } = useApp();

  // Active sub-tab inside Extractor
  const [activeSubTab, setActiveSubTab] = useState<'hub' | 'explorer' | 'supabase' | 'extension' | 'logs'>('hub');

  // Source Selection: 'sheets' | 'file' | 'web'
  const [sourceType, setSourceType] = useState<'sheets' | 'file' | 'web'>('sheets');

  // Google Sheets Auth & Tabs State
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState<boolean>(false);
  const [sheetUrl, setSheetUrl] = useState<string>('');
  const [availableTabs, setAvailableTabs] = useState<SheetTabSummary[]>([]);
  const [selectedTabNames, setSelectedTabNames] = useState<string[]>([]);
  const [loadingTabs, setLoadingTabs] = useState<boolean>(false);
  const [sheetsDetectedData, setSheetsDetectedData] = useState<ExtractedSheetData | null>(null);

  // External File Upload (XLS / XLSX / CSV / VSC) State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedFileData, setParsedFileData] = useState<ParsedFileResult | null>(null);
  const [isParsingFile, setIsParsingFile] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Web/CRM URL Source State
  const [webUrl, setWebUrl] = useState<string>('');
  const [webMonthFilter, setWebMonthFilter] = useState<'current' | 'all'>('current');
  const [webTeamFilter, setWebTeamFilter] = useState<string>('all');

  // Column Selection for Export / Sync
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [columnSearch, setColumnSearch] = useState<string>('');

  // Supabase Config State
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>(loadSupabaseConfig());
  const [supabaseStatus, setSupabaseStatus] = useState<{ checked: boolean; success: boolean; message: string; rowCount?: number }>({
    checked: false,
    success: false,
    message: ''
  });
  const [checkingSupabase, setCheckingSupabase] = useState<boolean>(false);

  // Target table option
  const [targetDestination, setTargetDestination] = useState<string>('sheet_records');

  // Continuous Auto-Sync Toggle ("Mantener siempre sincronizado")
  const [keepSynced, setKeepSynced] = useState<boolean>(true);

  // Synced Records in Database
  const [syncedRecords, setSyncedRecords] = useState<SheetRecord[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [inspectRecord, setInspectRecord] = useState<SheetRecord | null>(null);

  // Logs and System Stats
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);

  // Execution states & notifications
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [actionStatus, setActionStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showSqlModal, setShowSqlModal] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  // The ingestion key is a server secret. It is never embedded in the UI or
  // repository; the production extractor reads it from its runtime secrets.
  const [apiKey, setApiKey] = useState<string>('');
  const [copiedApiKey, setCopiedApiKey] = useState<boolean>(false);

  const apiBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  // 1. Role Check: Strictly Admin Only
  if (currentUser.role !== 'admin') {
    return (
      <div className="py-16 px-4">
        <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Acceso Restringido</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            El módulo de extracción de datos (Google Sheets, archivos y CRM) y traslado SQL a Supabase está reservado exclusivamente para la <strong className="text-slate-200">Administración General</strong>.
          </p>
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-[11px] text-slate-400">
            Usuario actual: <span className="font-semibold text-slate-200">{currentUser.name}</span> ({currentUser.role})
          </div>
        </div>
      </div>
    );
  }

  // Init Google Auth
  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsub();
  }, []);

  // Save Supabase config when changed
  useEffect(() => {
    saveSupabaseConfig(supabaseConfig);
  }, [supabaseConfig]);

  // Load records and stats
  const refreshRecords = async () => {
    try {
      const res = await extractorApi.getRecords();
      setSyncedRecords(res.records);
      if (res.records.length > 0) {
        setLastSyncTime(new Date(res.records[0].ingestedAt).toLocaleTimeString());
      }
      const stats = await extractorApi.getStats();
      setSystemStats(stats);
      const logs = await extractorApi.getSyncLogs();
      setSyncLogs(logs.logs);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    refreshRecords();
  }, []);

  // Connect SSE Stream
  useEffect(() => {
    realtimeStream.connect();

    const unsubscribe = realtimeStream.subscribe((event, data) => {
      if (event === 'status_change') {
        setIsLiveConnected(data.connected);
      } else if (event === 'connected') {
        setIsLiveConnected(true);
      } else if (event === 'record_ingested') {
        refreshRecords();
        setActionStatus({
          type: 'success',
          text: `⚡ Ingesta en tiempo real recibida: ${data.insertedCount || 1} fila(s) de [${data.sheetName}]`
        });

        // Auto-forward to Supabase if configured
        const supConfig = loadSupabaseConfig();
        if (supConfig.autoForward && supConfig.projectUrl && supConfig.apiKey && data.records) {
          sendRowsToSupabase(data.records.map((r: any) => r.data || r), supConfig, {
            sheetName: data.sheetName,
            spreadsheetTitle: data.spreadsheetTitle
          }).catch(console.error);
        }
      } else if (event === 'sync_log') {
        refreshRecords();
      }
    });

    return () => {
      unsubscribe();
      realtimeStream.cleanup();
    };
  }, []);

  // Test Supabase connection
  const handleTestSupabase = async () => {
    setCheckingSupabase(true);
    setActionStatus(null);
    try {
      const res = await testSupabaseConnection(supabaseConfig);
      setSupabaseStatus({ checked: true, success: res.success, message: res.message, rowCount: res.rowCount });
      if (res.success) {
        setActionStatus({ type: 'success', text: res.message });
      } else {
        setActionStatus({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setSupabaseStatus({ checked: true, success: false, message: err.message });
      setActionStatus({ type: 'error', text: err.message });
    } finally {
      setCheckingSupabase(false);
    }
  };

  // Google Login
  const handleGoogleLogin = async () => {
    setIsLoggingInGoogle(true);
    setActionStatus(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        setActionStatus({ type: 'success', text: `Google conectado: ${res.user.email} (Solo Lectura activo)` });
      }
    } catch (err: any) {
      setActionStatus({ type: 'error', text: err.message || 'Error al iniciar sesión con Google' });
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setGoogleToken(null);
    setAvailableTabs([]);
    setSheetsDetectedData(null);
    setActionStatus({ type: 'info', text: 'Sesión de Google cerrada.' });
  };

  // Helper to extract clean spreadsheet ID
  const parseSpreadsheetId = (url: string): string => {
    const trimmed = url.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : trimmed;
  };

  // Load Google Sheets Tabs - ALWAYS DEFAULTS TO LAST TAB
  const handleLoadTabs = async () => {
    const cleanId = parseSpreadsheetId(sheetUrl);
    if (!cleanId) {
      setActionStatus({ type: 'error', text: 'Pega la URL o ID de la planilla de Google Sheets.' });
      return;
    }
    if (!googleToken) {
      setActionStatus({ type: 'error', text: 'Inicia sesión con tu cuenta de Google para leer la planilla.' });
      return;
    }

    setLoadingTabs(true);
    setActionStatus({ type: 'info', text: 'Obteniendo pestañas y columnas de Google Sheets...' });

    try {
      const meta = await fetchSpreadsheetTabs(cleanId, googleToken);
      setAvailableTabs(meta.tabs);

      // Default is ALWAYS the last tab
      if (meta.tabs.length > 0) {
        const lastTab = meta.tabs[meta.tabs.length - 1];
        setSelectedTabNames([lastTab.title]);

        try {
          const content = await fetchSpreadsheetContent(cleanId, googleToken, [lastTab.title]);
          setSheetsDetectedData(content);
          if (content.headers.length > 0) {
            const cols = content.headers.filter(h => h !== '_source_tab');
            setDetectedColumns(cols);
            setSelectedColumns(cols);
          }
          setActionStatus({
            type: 'success',
            text: `Planilla "${meta.title}" vinculada. Pestaña por defecto: [${lastTab.title}] (${content.rows.length} filas detectadas).`
          });
        } catch (fetchErr: any) {
          setActionStatus({ type: 'info', text: `Pestañas cargadas. Selecciona una para extraer.` });
        }
      }
    } catch (err: any) {
      setActionStatus({ type: 'error', text: err.message || 'Error al conectar con la planilla de Google Sheets.' });
    } finally {
      setLoadingTabs(false);
    }
  };

  // File Upload Handlers (Excel / CSV / VSC)
  const processUploadedFile = async (file: File) => {
    setIsParsingFile(true);
    setUploadedFile(file);
    setActionStatus(null);

    try {
      const parsed = await parseSpreadsheetFile(file);
      setParsedFileData(parsed);
      setDetectedColumns(parsed.columns);
      setSelectedColumns(parsed.columns);
      setActionStatus({
        type: 'success',
        text: `Archivo "${file.name}" leído con éxito. Pestaña activa: "${parsed.activeSheet}" (${parsed.totalRows} filas, ${parsed.columns.length} columnas).`
      });
    } catch (err: any) {
      setActionStatus({ type: 'error', text: err.message || 'Error al procesar el archivo.' });
      setParsedFileData(null);
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => {
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  // Web CRM Dataset Simulator / Generator
  const webCrmRows = useMemo(() => {
    const sample = [
      { codigo_crm: 'CRM-2026-1001', cliente: 'Laboratorios Farmacéuticos Andinos', contacto: 'Dr. Alejandro Ruiz', equipo: 'Equipo Enterprise', fecha: '2026-10-02', monto: 18500, moneda: 'USD', estado: 'Cerrado Ganado', canal: 'Portal Web CRM' },
      { codigo_crm: 'CRM-2026-1002', cliente: 'Soluciones Logísticas del Plata', contacto: 'Ing. Marcelo Gómez', equipo: 'Equipo Ventas Oficial', fecha: '2026-10-06', monto: 7400, moneda: 'USD', estado: 'En Negociación', canal: 'Run One' },
      { codigo_crm: 'CRM-2026-1003', cliente: 'Metalúrgica San Jorge S.A.', contacto: 'Carlos Fontana', equipo: 'Equipo Central', fecha: '2026-10-10', monto: 12000, moneda: 'USD', estado: 'Propuesta Enviada', canal: 'Stand' },
      { codigo_crm: 'CRM-2026-1004', cliente: 'Consultora de Software Cono Sur', contacto: 'Lic. Mariana Valdez', equipo: 'Equipo Enterprise', fecha: '2026-10-12', monto: 9200, moneda: 'USD', estado: 'Cerrado Ganado', canal: 'Subite' },
      { codigo_crm: 'CRM-2026-1005', cliente: 'Agropecuaria Las Marías', contacto: 'Esteban Benítez', equipo: 'Equipo Ventas Oficial', fecha: '2026-10-15', monto: 24500, moneda: 'USD', estado: 'Cerrado Ganado', canal: 'Facebook Ads' },
      { codigo_crm: 'CRM-2026-1006', cliente: 'Distribuidora Mayorista del Norte', contacto: 'Paula Méndez', equipo: 'Equipo Central', fecha: '2026-10-18', monto: 11000, moneda: 'USD', estado: 'En Negociación', canal: 'Dato Propio' }
    ];
    return sample;
  }, []);

  // Update detected columns based on active source
  useEffect(() => {
    if (sourceType === 'file' && parsedFileData) {
      setDetectedColumns(parsedFileData.columns);
      setSelectedColumns(prev => prev.length === 0 ? parsedFileData.columns : prev);
    } else if (sourceType === 'sheets' && sheetsDetectedData) {
      const cols = sheetsDetectedData.headers.filter(h => h !== '_source_tab');
      setDetectedColumns(cols);
      setSelectedColumns(prev => prev.length === 0 ? cols : prev);
    } else if (sourceType === 'web') {
      const cols = Object.keys(webCrmRows[0] || {});
      setDetectedColumns(cols);
      setSelectedColumns(prev => prev.length === 0 ? cols : prev);
    }
  }, [sourceType, parsedFileData, sheetsDetectedData, webCrmRows]);

  // Filter columns to export
  const toggleColumn = (col: string) => {
    setSelectedColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const selectAllColumns = () => setSelectedColumns(detectedColumns);
  const deselectAllColumns = () => setSelectedColumns([]);

  const filteredColumnList = useMemo(() => {
    if (!columnSearch) return detectedColumns;
    return detectedColumns.filter(c => c.toLowerCase().includes(columnSearch.toLowerCase()));
  }, [detectedColumns, columnSearch]);

  // Master Extraction & Supabase SQL Push Execution
  const handleExtractAndSyncToSupabase = async () => {
    setIsExtracting(true);
    setActionStatus(null);

    try {
      let rowsToProcess: Array<Record<string, any>> = [];
      let sourceName = '';
      let spreadsheetTitle = '';
      let spreadsheetId = '';

      if (sourceType === 'sheets') {
        const cleanId = parseSpreadsheetId(sheetUrl);
        if (!cleanId || !googleToken) {
          throw new Error('Vincula la planilla de Google Sheets y autentícate con Google primero.');
        }
        const data = await fetchSpreadsheetContent(cleanId, googleToken, selectedTabNames);
        rowsToProcess = data.rows;
        sourceName = data.sheetName;
        spreadsheetTitle = data.title;
        spreadsheetId = data.spreadsheetId;
      } else if (sourceType === 'file') {
        if (!parsedFileData || parsedFileData.rows.length === 0) {
          throw new Error('Carga un archivo Excel o CSV válido primero.');
        }
        rowsToProcess = parsedFileData.rows;
        sourceName = parsedFileData.activeSheet;
        spreadsheetTitle = parsedFileData.fileName;
      } else if (sourceType === 'web') {
        rowsToProcess = webCrmRows;
        sourceName = 'Web_CRM_Extraccion';
        spreadsheetTitle = 'Portal Fox CRM & Web';
      }

      if (rowsToProcess.length === 0) {
        throw new Error('No se encontraron filas para extraer de la fuente seleccionada.');
      }

      // Filter rows by selected columns
      const finalRows = filterColumns(rowsToProcess, selectedColumns);

      // Step 1: Save in Nave backend API / cache
      const ingestRes = await extractorApi.ingestData({
        sheetName: sourceName,
        spreadsheetTitle,
        spreadsheetId,
        action: 'batch_sync',
        records: finalRows,
        apiKey
      });

      // Step 2: Push directly to Supabase SQL Database!
      let supabaseMessage = '';
      if (supabaseConfig.projectUrl && supabaseConfig.apiKey) {
        const supConfigToUse = { ...supabaseConfig, tableName: targetDestination };
        const supRes = await sendRowsToSupabase(finalRows, supConfigToUse, {
          sheetName: sourceName,
          spreadsheetTitle,
          spreadsheetId
        });

        if (supRes.success) {
          supabaseMessage = ` y trasladadas exitosamente a Supabase (tabla: "${targetDestination}").`;
        } else {
          supabaseMessage = `. Nota de Supabase: ${supRes.error || 'No se pudo insertar en Supabase'}`;
        }
      } else {
        supabaseMessage = `. (Supabase no configurado: configure URL y API Key en la pestaña "Conexión Supabase").`;
      }

      setActionStatus({
        type: 'success',
        text: `✓ ${finalRows.length} filas extraídas (${selectedColumns.length} columnas filtradas)${supabaseMessage}`
      });

      refreshRecords();
    } catch (err: any) {
      setActionStatus({ type: 'error', text: err.message || 'Error durante la extracción.' });
    } finally {
      setIsExtracting(false);
    }
  };

  // Download Chrome Extension ZIP
  const handleDownloadExtension = async () => {
    setIsDownloading(true);
    try {
      const zipBlob = await downloadExtensionZip(apiBaseUrl, apiKey);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nave-extractor-supabase-v3.2.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error al compilar el archivo ZIP de la extensión.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Filter synced records for table
  const displayedRecords = useMemo(() => {
    if (!searchFilter) return syncedRecords;
    const q = searchFilter.toLowerCase();
    return syncedRecords.filter(r => {
      const text = `${r.sourceSheet} ${r.spreadsheetTitle} ${JSON.stringify(r.data)}`.toLowerCase();
      return text.includes(q);
    });
  }, [syncedRecords, searchFilter]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
                <Sparkles className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Extractor de Datos Multifuente & Traslado a Supabase SQL
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Solo Administración General
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2 max-w-2xl leading-relaxed">
              Extrae datos estructurados desde <strong>Google Sheets</strong> (incluso en modo de solo lectura o sin API directa), archivos <strong>Excel / CSV</strong> y portales <strong>CRM externos</strong>, y trasládalos en tiempo real a tus tablas SQL en Supabase.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status indicators */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
              <span className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <span className="text-slate-400">Stream SSE:</span>
              <span className={`font-medium ${isLiveConnected ? 'text-emerald-300' : 'text-slate-500'}`}>
                {isLiveConnected ? 'Conectado' : 'Reconectando'}
              </span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
              <span className={`w-2 h-2 rounded-full ${supabaseStatus.success ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-slate-400">Supabase:</span>
              <span className={`font-medium ${supabaseStatus.success ? 'text-emerald-300' : 'text-amber-300'}`}>
                {supabaseStatus.success ? 'Conectado' : 'Pendiente'}
              </span>
            </div>

            <button
              onClick={handleDownloadExtension}
              disabled={isDownloading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-lg shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Chrome className="w-4 h-4" />
              <span>{isDownloading ? 'Generando ZIP...' : 'Descargar Extensión Chrome'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-800 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveSubTab('hub')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeSubTab === 'hub'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Extracción & Traslado</span>
          </button>

          <button
            onClick={() => setActiveSubTab('explorer')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeSubTab === 'explorer'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Explorador de Datos</span>
            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
              {syncedRecords.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('supabase')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeSubTab === 'supabase'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Conexión Supabase SQL</span>
          </button>

          <button
            onClick={() => setActiveSubTab('extension')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeSubTab === 'extension'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Chrome className="w-4 h-4" />
            <span>Extensión Chrome & Webhooks</span>
          </button>

          <button
            onClick={() => setActiveSubTab('logs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeSubTab === 'logs'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Logs & Auditoría</span>
          </button>
        </div>
      </div>

      {/* Action Status Feedback Banner */}
      {actionStatus && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 ${
            actionStatus.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : actionStatus.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionStatus.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {actionStatus.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            {actionStatus.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
            <span className="font-medium">{actionStatus.text}</span>
          </div>
          <button
            onClick={() => setActionStatus(null)}
            className="text-slate-400 hover:text-white p-1 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================== SUB-VIEW 1: HUB DE EXTRACCIÓN ==================== */}
      {activeSubTab === 'hub' && (
        <div className="space-y-6">
          {/* Step 1: Select Source */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
                  1
                </span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Seleccionar Fuente de Extracción
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                Elige de dónde se extraerán los datos
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSourceType('sheets')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  sourceType === 'sheets'
                    ? 'bg-blue-600/10 border-blue-500 text-white shadow-md shadow-blue-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${sourceType === 'sheets' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Google Sheets</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Vía URL o Auth (Solo lectura)</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSourceType('file')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  sourceType === 'file'
                    ? 'bg-blue-600/10 border-blue-500 text-white shadow-md shadow-blue-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${sourceType === 'file' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Archivos Locales</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Excel (.xlsx/.xls) y CSV</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSourceType('web')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  sourceType === 'web'
                    ? 'bg-blue-600/10 border-blue-500 text-white shadow-md shadow-blue-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${sourceType === 'web' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Portal Web / Fox CRM</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Captura web sin API directa</div>
                  </div>
                </div>
              </button>
            </div>

            {/* Source Configuration Body */}
            <div className="mt-5 p-5 bg-slate-950/60 border border-slate-800 rounded-xl">
              {/* GOOGLE SHEETS */}
              {sourceType === 'sheets' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                    <div className="text-xs text-slate-300">
                      <strong>Conexión con Cuenta Google</strong>: Requerida para leer planillas protegidas o compartidas.
                    </div>
                    {googleUser ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-400 font-medium">✓ {googleUser.email}</span>
                        <button
                          onClick={handleGoogleLogout}
                          className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          Desconectar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleGoogleLogin}
                        disabled={isLoggingInGoogle}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
                      >
                        <Chrome className="w-3.5 h-3.5" />
                        <span>{isLoggingInGoogle ? 'Conectando...' : 'Iniciar Sesión con Google'}</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300">
                      URL o ID de la Planilla Google Sheets:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={sheetUrl}
                        onChange={e => setSheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleLoadTabs}
                        disabled={loadingTabs || !sheetUrl.trim()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-2 shrink-0 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingTabs ? 'animate-spin' : ''}`} />
                        <span>{loadingTabs ? 'Inspeccionando...' : 'Inspeccionar Planilla'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Tabs selector */}
                  {availableTabs.length > 0 && (
                    <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Pestañas encontradas en la planilla:</span>
                        <span className="text-emerald-400 font-mono text-[11px]">
                          Pestaña por defecto: {availableTabs[availableTabs.length - 1]?.title} (Última)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {availableTabs.map((t, idx) => {
                          const isSelected = selectedTabNames.includes(t.title);
                          const isLast = idx === availableTabs.length - 1;
                          return (
                            <button
                              key={t.title}
                              type="button"
                              onClick={() => {
                                setSelectedTabNames([t.title]);
                                if (googleToken) {
                                  const cleanId = parseSpreadsheetId(sheetUrl);
                                  fetchSpreadsheetContent(cleanId, googleToken, [t.title]).then(res => {
                                    setSheetsDetectedData(res);
                                    const cols = res.headers.filter(h => h !== '_source_tab');
                                    setDetectedColumns(cols);
                                    setSelectedColumns(cols);
                                  });
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-500 text-white'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <span>{t.title}</span>
                              {isLast && <span className="ml-1.5 text-[10px] text-emerald-300 font-normal">(Última)</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* LOCAL FILES */}
              {sourceType === 'file' && (
                <div className="space-y-4">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                      isDraggingFile
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv,.tsv,.vsc"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          processUploadedFile(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                    <UploadCloud className="w-10 h-10 text-blue-400 mx-auto mb-3" />
                    <div className="text-xs font-bold text-white">
                      {isParsingFile ? 'Leyendo archivo...' : uploadedFile ? uploadedFile.name : 'Arrastra tu archivo aquí o haz clic para seleccionarlo'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Soporta Excel (.xlsx, .xls), CSV, TSV y VSC (Selecciona la última pestaña automáticamente)
                    </div>
                  </div>

                  {parsedFileData && (
                    <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span className="text-slate-200 font-medium">{parsedFileData.fileName}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">{parsedFileData.totalRows} filas detectadas</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">{parsedFileData.columns.length} columnas</span>
                      </div>
                      <span className="text-emerald-400 font-mono text-[11px]">Pestaña activa: [{parsedFileData.activeSheet}]</span>
                    </div>
                  )}
                </div>
              )}

              {/* WEB / CRM SOURCE */}
              {sourceType === 'web' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">URL del Portal / Fox CRM:</label>
                      <input
                        type="text"
                        value={webUrl}
                        onChange={e => setWebUrl(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Rango de Datos:</label>
                      <select
                        value={webMonthFilter}
                        onChange={e => setWebMonthFilter(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="current">Mes en Curso (Octubre 2026)</option>
                        <option value="all">Todo el Histórico</option>
                      </select>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs flex items-center justify-between text-slate-400">
                    <span>Dataset CRM simulado con normalización automática de campos comerciales.</span>
                    <span className="text-blue-400 font-semibold">{webCrmRows.length} registros listos para transferir</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Interactive Column Picker */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
                  2
                </span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Mapeo & Selección de Columnas para Supabase
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllColumns}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Seleccionar Todo
                </button>
                <button
                  type="button"
                  onClick={deselectAllColumns}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Limpiar
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Selecciona qué campos de la fuente deseas trasladar a la base SQL de Supabase. ({selectedColumns.length} de {detectedColumns.length} columnas seleccionadas).
            </p>

            {detectedColumns.length > 8 && (
              <div className="mb-3 relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={columnSearch}
                  onChange={e => setColumnSearch(e.target.value)}
                  placeholder="Buscar columnas por nombre..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto p-1">
              {filteredColumnList.map(col => {
                const isSelected = selectedColumns.includes(col);
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => toggleColumn(col)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-200'
                        : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-600" />
                    )}
                    <span>{col}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Destination & Transfer to Supabase */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
                  3
                </span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Destino Supabase SQL & Ejecución del Traslado
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                Traslado directo hacia la base relacional
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Tabla de Destino en Supabase:</label>
                <select
                  value={targetDestination}
                  onChange={e => setTargetDestination(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="sheet_records">sheet_records (Tabla JSONB Flexible Recomendada)</option>
                  <option value="sales_operations">sales_operations (Operaciones de Ventas Concesionaria)</option>
                  <option value="price_lists">price_lists (Listas de Precios de Modelos)</option>
                  <option value="cartera_mora">cartera_mora (Cartera & Cuotas en Mora)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {targetDestination === 'sheet_records'
                    ? 'Almacena cualquier estructura dinámica en columnas record_id, sheet_name y data jsonb.'
                    : `Inserta directamente en la tabla relacional de la concesionaria.`}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Sincronización Continua:</label>
                <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <div>
                    <div className="text-xs text-white font-medium">Reenvío en Tiempo Real</div>
                    <div className="text-[10px] text-slate-400">Si la extensión envía datos, pasarlos a Supabase</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={keepSynced}
                    onChange={e => setKeepSynced(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Execute Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                Se procesarán los datos de la fuente activa con las <strong>{selectedColumns.length}</strong> columnas seleccionadas.
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowSqlModal(true)}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Terminal className="w-3.5 h-3.5 text-blue-400" />
                  <span>Ver Script SQL Supabase</span>
                </button>

                <button
                  type="button"
                  onClick={handleExtractAndSyncToSupabase}
                  disabled={isExtracting || selectedColumns.length === 0}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 ${isExtracting ? 'animate-spin' : ''}`} />
                  <span>{isExtracting ? 'Trasladando a Supabase...' : '🚀 Extraer & Trasladar a Supabase SQL'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Preview of Stored Records */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Registros Extraídos en el Sistema ({displayedRecords.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Última sincronización: {lastSyncTime || 'Ninguna registrada aún'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    placeholder="Filtrar registros..."
                    className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={refreshRecords}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                  title="Refrescar"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {displayedRecords.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                No hay registros extraídos aún. Inicia una extracción desde Google Sheets, un archivo o el CRM.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="p-3">ID / Código</th>
                      <th className="p-3">Fuente / Hoja</th>
                      <th className="p-3">Planilla Origen</th>
                      <th className="p-3">Datos Extraídos (Campos Clave)</th>
                      <th className="p-3 text-right">Fecha Ingesta</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-sans">
                    {displayedRecords.slice(0, 15).map(r => (
                      <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono text-blue-400 whitespace-nowrap">
                          {r.data.codigo || r.data.id || r.data.subscription_number || r.id.substring(0, 12)}
                        </td>
                        <td className="p-3 text-slate-300 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono">
                            {r.sourceSheet}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400 truncate max-w-[140px]">
                          {r.spreadsheetTitle}
                        </td>
                        <td className="p-3 text-slate-300 truncate max-w-[260px]">
                          {Object.entries(r.data)
                            .slice(0, 3)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' · ')}
                        </td>
                        <td className="p-3 text-right text-slate-400 font-mono whitespace-nowrap text-[11px]">
                          {new Date(r.ingestedAt).toLocaleTimeString()}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => setInspectRecord(r)}
                            className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
                            title="Ver JSON completo"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              await extractorApi.deleteRecord(r.id);
                              refreshRecords();
                            }}
                            className="p-1 text-slate-400 hover:text-rose-400 transition-colors ml-1"
                            title="Eliminar fila"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SUB-VIEW 2: EXPLORADOR DE DATOS ==================== */}
      {activeSubTab === 'explorer' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white">Explorador & Exportador de Datos</h3>
              <p className="text-xs text-slate-400 mt-1">
                Visualiza, filtra y descarga los registros acumulados en formatos CSV o JSON para backup o análisis externo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/api/export?format=csv"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </a>
              <button
                onClick={async () => {
                  if (confirm('¿Estás seguro de que deseas vaciar todos los registros del extractor?')) {
                    await extractorApi.clearAllRecords();
                    refreshRecords();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vaciar Base</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Hoja</th>
                  <th className="p-3">Planilla</th>
                  <th className="p-3">Objeto de Datos</th>
                  <th className="p-3 text-right">Ingreso</th>
                  <th className="p-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {displayedRecords.map(r => (
                  <tr key={r.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-blue-400">{r.id.substring(0, 14)}</td>
                    <td className="p-3 text-slate-300">{r.sourceSheet}</td>
                    <td className="p-3 text-slate-400">{r.spreadsheetTitle}</td>
                    <td className="p-3 text-slate-300 font-mono text-[11px]">
                      {JSON.stringify(r.data)}
                    </td>
                    <td className="p-3 text-right text-slate-400 font-mono text-[11px]">
                      {new Date(r.ingestedAt).toLocaleString()}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setInspectRecord(r)}
                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                      >
                        Inspeccionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== SUB-VIEW 3: CONEXIÓN SUPABASE SQL ==================== */}
      {activeSubTab === 'supabase' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Configuración del Proyecto Supabase SQL</h3>
                <p className="text-xs text-slate-400">
                  Establece la conexión directa mediante el cliente oficial de Supabase para volcar las extracciones.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Supabase Project URL:
                </label>
                <input
                  type="text"
                  value={supabaseConfig.projectUrl}
                  onChange={e => setSupabaseConfig({ ...supabaseConfig, projectUrl: e.target.value })}
                  placeholder="https://xyzprojectid.supabase.co"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Supabase API Key (Anon o Service Role):
                </label>
                <input
                  type="password"
                  value={supabaseConfig.apiKey}
                  onChange={e => setSupabaseConfig({ ...supabaseConfig, apiKey: e.target.value })}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Nombre de Tabla por Defecto:
                </label>
                <input
                  type="text"
                  value={supabaseConfig.tableName}
                  onChange={e => setSupabaseConfig({ ...supabaseConfig, tableName: e.target.value })}
                  placeholder="sheet_records"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Reenvío Automático:</label>
                <label className="flex items-center gap-2 p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={supabaseConfig.autoForward}
                    onChange={e => setSupabaseConfig({ ...supabaseConfig, autoForward: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span>Reenviar a Supabase automáticamente al recibir datos</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-5 border-t border-slate-800">
              <button
                type="button"
                onClick={handleTestSupabase}
                disabled={checkingSupabase || !supabaseConfig.projectUrl}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingSupabase ? 'animate-spin' : ''}`} />
                <span>{checkingSupabase ? 'Verificando...' : 'Probar Conexión con Supabase'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSqlModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-all cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                <span>Generar Script SQL DDL</span>
              </button>
            </div>

            {supabaseStatus.checked && (
              <div
                className={`mt-4 p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  supabaseStatus.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {supabaseStatus.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{supabaseStatus.message}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SUB-VIEW 4: EXTENSIÓN CHROME & WEBHOOKS ==================== */}
      {activeSubTab === 'extension' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
                <Chrome className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Extensión de Chrome SheetStream & Ingesta por Webhook</h3>
                <p className="text-xs text-slate-400">
                  Usa la extensión oficial para extraer directamente desde pestañas de Google Sheets en tu navegador o envía datos desde Apps Script.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {/* Card 1: Chrome Extension */}
              <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Paquete Extensión Chrome
                    </span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-mono">
                      Manifest V3
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Descarga el paquete pre-configurado con la URL de este servidor y tu API Key. Abre <code className="text-blue-300 bg-slate-900 px-1 py-0.5 rounded">chrome://extensions</code>, activa el <strong>Modo Desarrollador</strong> y carga la carpeta descomprimida.
                  </p>
                  <ul className="text-[11px] text-slate-400 space-y-1.5 mb-4 list-disc list-inside">
                    <li>Extrae automáticamente la <strong>última pestaña</strong> por defecto.</li>
                    <li>Funciona en hojas de <strong>solo lectura</strong> (sin permisos de edición).</li>
                    <li>Soporta extracción de tablas en CRM web (Fox CRM, Salesforce, etc.).</li>
                  </ul>
                </div>

                <button
                  onClick={handleDownloadExtension}
                  disabled={isDownloading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{isDownloading ? 'Generando ZIP...' : 'Descargar Extensión (.ZIP)'}</span>
                </button>
              </div>

              {/* Card 2: Webhook Endpoint */}
              <div className="bg-slate-950 p-5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    API Key & Endpoint Webhook
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono">
                    POST /api/ingest
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">URL Completa del Webhook:</label>
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded font-mono text-blue-300 text-[11px] select-all">
                      {apiBaseUrl}/api/ingest
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Clave de API de Extracción:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                      />
                      <button
                        onClick={async () => {
                          await extractorApi.updateApiKey(apiKey);
                          setCopiedApiKey(true);
                          setTimeout(() => setCopiedApiKey(false), 2000);
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs"
                      >
                        {copiedApiKey ? 'Guardado' : 'Guardar'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Header de Autorización:</label>
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded font-mono text-slate-300 text-[11px]">
                      Authorization: Bearer {apiKey}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SUB-VIEW 5: LOGS & AUDITORÍA ==================== */}
      {activeSubTab === 'logs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white">Auditoría en Tiempo Real de Extracciones</h3>
              <p className="text-xs text-slate-400">
                Historial de llamados recibidos por el webhook y sincronizaciones ejecutadas hacia Supabase.
              </p>
            </div>
            <button
              onClick={refreshRecords}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {syncLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No hay logs registrados todavía.
              </div>
            ) : (
              syncLogs.map(l => (
                <div
                  key={l.id}
                  className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        l.status === 'success' ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                    <span className="font-mono text-blue-400 font-bold">{l.action}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-300">{l.sourceSheet}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400">{l.rowCount} fila(s)</span>
                  </div>

                  <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
                    <span>{l.durationMs}ms</span>
                    <span>{l.clientIp}</span>
                    <span className="text-slate-400">{new Date(l.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: Supabase SQL Script */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Script DDL SQL para Supabase</h3>
              </div>
              <button
                onClick={() => setShowSqlModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Copia y pega este script en el <strong>SQL Editor</strong> del Dashboard de tu proyecto en Supabase. Creará la tabla <code className="text-blue-300 bg-slate-950 px-1 py-0.5 rounded">{supabaseConfig.tableName || 'sheet_records'}</code> con políticas RLS e índices optimizados.
            </p>

            <div className="flex-1 overflow-y-auto bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-200 select-all mb-4">
              <pre className="whitespace-pre-wrap">{getSupabaseSqlScript(supabaseConfig.tableName || 'sheet_records')}</pre>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(getSupabaseSqlScript(supabaseConfig.tableName || 'sheet_records'));
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2000);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                {copiedSql ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSql ? '¡Copiado al Portapapeles!' : 'Copiar Script SQL'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Record JSON Inspector */}
      {inspectRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">
                  Detalle del Registro ({inspectRecord.id})
                </h3>
              </div>
              <button
                onClick={() => setInspectRecord(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-300 select-all mb-4">
              <pre className="whitespace-pre-wrap">{JSON.stringify(inspectRecord, null, 2)}</pre>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setInspectRecord(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
