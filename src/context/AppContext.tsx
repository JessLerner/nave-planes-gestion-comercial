import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  User,
  Team,
  Seller,
  SalesOperation,
  PriceListItem,
  WageAdvance,
  MonthlyConfig,
  CarteraMora,
  Candidate,
  LeadDistribution,
  Recommendation,
  ScoringStatus,
  OperationStatus,
} from '../types';
import {
  DEFAULT_USERS,
  DEFAULT_CONNECTORS,
  DEFAULT_MONTHLY_CONFIG,
  EMPTY_TEAMS,
  EMPTY_SELLERS,
  EMPTY_OPERATIONS,
  EMPTY_CARTERA,
  EMPTY_ADVANCES,
  EMPTY_CANDIDATES,
  EMPTY_LEADS,
  EMPTY_PRICE_LIST,
  EMPTY_RECOMMENDATIONS,
} from '../data/dbDefaults';
import { DatabaseConnectorConfig } from '../types/database';
import {
  calculateTeamTarget,
  calculateWorkingDays,
  calculatePacing,
  canPresentToFactory,
  validateAdvanceEligibility,
} from '../utils/businessLogic';

interface AppContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];

  // Database Connectors
  connectors: DatabaseConnectorConfig[];
  updateConnector: (conn: DatabaseConnectorConfig) => void;
  testConnector: (conn: DatabaseConnectorConfig) => Promise<{ success: boolean; message: string }>;
  syncConnector: (connectorId: string) => Promise<{ success: boolean; message: string }>;
  testingConnectorId: string | null;
  syncingConnectorId: string | null;

  // Real Database entities
  teams: Team[];
  sellers: Seller[];
  operations: SalesOperation[];
  priceLists: PriceListItem[];
  wageAdvances: WageAdvance[];
  monthlyConfig: MonthlyConfig;
  carteraMora: CarteraMora[];
  candidates: Candidate[];
  leadDistributions: LeadDistribution[];
  recommendations: Recommendation[];

  // Selected filters
  selectedTeamId: string;
  setSelectedTeamId: (id: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;

  // Sync state
  isSyncingDataExtractor: boolean;
  syncDataExtractor: () => Promise<void>;
  lastSyncTime: string;

  // Actions
  addOperation: (op: Omit<SalesOperation, 'id' | 'status' | 'scoring_status'>) => { success: boolean; message: string };
  auditScoring: (operationId: string, status: ScoringStatus, notes: string, reasons?: string[]) => { success: boolean; message: string };
  requestAdvance: (sellerId: string, amount: number, reason: string) => { success: boolean; message: string };
  reviewAdvance: (advanceId: string, status: 'approved' | 'rejected', notes?: string) => void;
  distributeLeads: (sellerId: string, count: number, source: any) => void;
  updateMonthlyConfig: (config: Partial<MonthlyConfig>) => void;
  updatePriceListItem: (item: PriceListItem) => void;
  addPriceListItem: (item: Omit<PriceListItem, 'id' | 'updated_at'>) => void;
  updateCandidateStage: (candidateId: string, stage: Candidate['stage']) => void;
  updateCandidateDocs: (candidateId: string, docKey: keyof Candidate['docs'], value: boolean) => void;
  importCarteraBatch: (newRecords: CarteraMora[]) => void;
  updateSellerTarget: (sellerId: string, newTarget: number) => void;
  updateTeamTargetOverride: (teamId: string, override?: number) => void;
  addSeller: (seller: Omit<Seller, 'id'>) => void;
  addTeam: (team: Omit<Team, 'id'>) => void;
  importBulkData: (entityType: string, records: any[]) => Promise<void>;

  // Computed data
  activeSellers: Seller[];
  sellersByTeam: Record<string, Seller[]>;
  salesBySeller: Record<string, number>;
  sellersAtZero: Seller[];
  sellersAtOne: Seller[];
  sellersAtTwoPlus: Seller[];
  teamMetrics: Array<{
    team: Team;
    activeSellersCount: number;
    teamTarget: number;
    currentSales: number;
    pacing: ReturnType<typeof calculatePacing>;
    sellersAtZeroCount: number;
    sellersAtOneCount: number;
  }>;
  workingDaysInfo: ReturnType<typeof calculateWorkingDays>;
  overallPacing: ReturnType<typeof calculatePacing>;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users] = useState<User[]>(DEFAULT_USERS);
  const [currentUser, setCurrentUser] = useState<User>(DEFAULT_USERS[0]);

  // Database Connectors
  const [connectors, setConnectors] = useState<DatabaseConnectorConfig[]>(DEFAULT_CONNECTORS);
  const [testingConnectorId, setTestingConnectorId] = useState<string | null>(null);
  const [syncingConnectorId, setSyncingConnectorId] = useState<string | null>(null);

  // Real Database entities - Start empty or load from backend
  const [teams, setTeams] = useState<Team[]>(EMPTY_TEAMS);
  const [sellers, setSellers] = useState<Seller[]>(EMPTY_SELLERS);
  const [operations, setOperations] = useState<SalesOperation[]>(EMPTY_OPERATIONS);
  const [priceLists, setPriceLists] = useState<PriceListItem[]>(EMPTY_PRICE_LIST);
  const [wageAdvances, setWageAdvances] = useState<WageAdvance[]>(EMPTY_ADVANCES);
  const [monthlyConfig, setMonthlyConfig] = useState<MonthlyConfig>(DEFAULT_MONTHLY_CONFIG);
  const [carteraMora, setCarteraMora] = useState<CarteraMora[]>(EMPTY_CARTERA);
  const [candidates, setCandidates] = useState<Candidate[]>(EMPTY_CANDIDATES);
  const [leadDistributions, setLeadDistributions] = useState<LeadDistribution[]>(EMPTY_LEADS);

  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-10');
  const [isSyncingDataExtractor, setIsSyncingDataExtractor] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Sin sincronización previa');

  // Load from backend on start
  useEffect(() => {
    fetch('/api/data')
      .then(res => res.json())
      .then(res => {
        if (res.success && res.data) {
          const d = res.data;
          if (d.connectors && d.connectors.length > 0) setConnectors(d.connectors);
          if (d.teams && d.teams.length > 0) setTeams(d.teams);
          if (d.sellers && d.sellers.length > 0) setSellers(d.sellers);
          if (d.operations && d.operations.length > 0) setOperations(d.operations);
          if (d.priceLists && d.priceLists.length > 0) setPriceLists(d.priceLists);
          if (d.wageAdvances && d.wageAdvances.length > 0) setWageAdvances(d.wageAdvances);
          if (d.carteraMora && d.carteraMora.length > 0) setCarteraMora(d.carteraMora);
          if (d.candidates && d.candidates.length > 0) setCandidates(d.candidates);
          if (d.leadDistributions && d.leadDistributions.length > 0) setLeadDistributions(d.leadDistributions);
          if (d.monthlyConfig) setMonthlyConfig(d.monthlyConfig);
        }
      })
      .catch(err => console.log('Backend not available yet, using local state'));
  }, []);

  // Save to backend helper
  const syncToBackend = (partialData: any) => {
    fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partialData),
    }).catch(err => console.log('Error syncing to backend:', err));
  };

  // If currentUser is supervisor, constrain team selection to their team
  useEffect(() => {
    if (currentUser.role === 'supervisor' && currentUser.team_id) {
      setSelectedTeamId(currentUser.team_id);
    }
  }, [currentUser]);

  // Working days info for current month
  const workingDaysInfo = useMemo(() => {
    return calculateWorkingDays(monthlyConfig.start_date, monthlyConfig.end_date);
  }, [monthlyConfig]);

  // Active sellers
  const activeSellers = useMemo(() => sellers.filter(s => s.active), [sellers]);

  // Sellers by team
  const sellersByTeam = useMemo(() => {
    const map: Record<string, Seller[]> = {};
    sellers.forEach(s => {
      if (!map[s.team_id]) map[s.team_id] = [];
      map[s.team_id].push(s);
    });
    return map;
  }, [sellers]);

  // Sales count per seller
  const salesBySeller = useMemo(() => {
    const map: Record<string, number> = {};
    sellers.forEach(s => (map[s.id] = 0));
    operations.forEach(op => {
      if (op.status !== 'caido' && op.seller_id) {
        map[op.seller_id] = (map[op.seller_id] || 0) + 1;
      }
    });
    return map;
  }, [sellers, operations]);

  // Sellers at 0, 1, 2+ sales (active only)
  const { sellersAtZero, sellersAtOne, sellersAtTwoPlus } = useMemo(() => {
    const zero: Seller[] = [];
    const one: Seller[] = [];
    const twoPlus: Seller[] = [];

    activeSellers.forEach(s => {
      const count = salesBySeller[s.id] || 0;
      if (count === 0) zero.push(s);
      else if (count === 1) one.push(s);
      else twoPlus.push(s);
    });

    return { sellersAtZero: zero, sellersAtOne: one, sellersAtTwoPlus: twoPlus };
  }, [activeSellers, salesBySeller]);

  // Team metrics with dynamic ideal targets
  const teamMetrics = useMemo(() => {
    return teams.map(team => {
      const teamSellers = sellers.filter(s => s.team_id === team.id && s.active);
      const teamTarget = calculateTeamTarget(
        monthlyConfig.default_team_target_per_seller,
        teamSellers.length,
        team.target_override
      );
      const teamOps = operations.filter(op => op.team_id === team.id && op.status !== 'caido');
      const currentSales = teamOps.length;

      const pacing = calculatePacing(
        currentSales,
        teamTarget,
        workingDaysInfo.elapsedWorkingDays,
        workingDaysInfo.totalWorkingDays
      );

      const zeros = teamSellers.filter(s => (salesBySeller[s.id] || 0) === 0).length;
      const ones = teamSellers.filter(s => (salesBySeller[s.id] || 0) === 1).length;

      return {
        team,
        activeSellersCount: teamSellers.length,
        teamTarget,
        currentSales,
        pacing,
        sellersAtZeroCount: zeros,
        sellersAtOneCount: ones,
      };
    });
  }, [teams, sellers, operations, monthlyConfig, workingDaysInfo, salesBySeller]);

  // Overall company pacing
  const overallPacing = useMemo(() => {
    const totalCurrentSales = operations.filter(op => op.status !== 'caido').length;
    const totalTarget = teamMetrics.reduce((sum, tm) => sum + tm.teamTarget, 0);

    return calculatePacing(
      totalCurrentSales,
      totalTarget,
      workingDaysInfo.elapsedWorkingDays,
      workingDaysInfo.totalWorkingDays
    );
  }, [operations, teamMetrics, workingDaysInfo]);

  // Dynamic recommendations based on REAL data
  const recommendations = useMemo<Recommendation[]>(() => {
    if (sellers.length === 0 && operations.length === 0) {
      return [
        {
          id: 'rec-init',
          type: 'opportunity',
          audience: 'all',
          title: 'Conectar Base de Datos para Iniciar Ingesta',
          description: 'La plataforma está lista para extraer contratos, vendedores y leads desde su base de datos PostgreSQL, Supabase o Fox CRM.',
          suggested_action: 'Acceda a "Bases de Datos & ETL" y configure sus credenciales de conexión.',
          metric_tag: 'Sistema / Conectores',
        },
      ];
    }

    const recs: Recommendation[] = [];

    if (sellersAtZero.length > 0) {
      recs.push({
        id: 'rec-zeros',
        type: 'critical',
        audience: 'supervisor',
        title: `${sellersAtZero.length} vendedores en 0 ventas`,
        description: `En el transcurso del mes operativo, ${sellersAtZero.map(s => s.name).slice(0, 3).join(', ')} no registran operaciones cerradas.`,
        suggested_action: 'Revisar asignación de leads de prospección y coordinar auditoría de escuchas telefónicas.',
        metric_tag: 'Pacing / Alerta Vendedores en 0',
      });
    }

    if (overallPacing.targetAchievementPct < 60 && workingDaysInfo.elapsedWorkingDays > 15) {
      recs.push({
        id: 'rec-pacing-low',
        type: 'warning',
        audience: 'gerente',
        title: 'Ritmo proyectado por debajo del objetivo ideal',
        description: `El cumplimiento actual es de ${overallPacing.targetAchievementPct}% con ${workingDaysInfo.remainingWorkingDays} días hábiles restantes.`,
        suggested_action: 'Reforzar captación presencial en stands y evaluar reasignación de cuotas de leads.',
        metric_tag: 'Gerencia General / Pacing',
      });
    }

    return recs;
  }, [sellers, operations, sellersAtZero, overallPacing, workingDaysInfo]);

  // Connector Actions
  const updateConnector = (updated: DatabaseConnectorConfig) => {
    setConnectors(prev => {
      const next = prev.map(c => (c.id === updated.id ? updated : c));
      syncToBackend({ connectors: next });
      return next;
    });
  };

  const testConnector = async (conn: DatabaseConnectorConfig) => {
    setTestingConnectorId(conn.id);
    try {
      const res = await fetch('/api/connectors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorId: conn.id, config: conn.config, type: conn.type }),
      });
      const data = await res.json();
      setTestingConnectorId(null);
      return {
        success: data.success,
        message: data.message || (data.success ? 'Conexión verificada exitosamente.' : 'Error al conectar.'),
      };
    } catch (err: any) {
      setTestingConnectorId(null);
      return { success: false, message: `Error de red al probar conexión: ${err.message}` };
    }
  };

  const syncConnector = async (connectorId: string) => {
    setSyncingConnectorId(connectorId);
    try {
      const res = await fetch('/api/connectors/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorId }),
      });
      const data = await res.json();
      setSyncingConnectorId(null);

      if (data.success && data.data) {
        if (data.data.teams) setTeams(data.data.teams);
        if (data.data.sellers) setSellers(data.data.sellers);
        if (data.data.operations) setOperations(data.data.operations);
      }

      setLastSyncTime(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs');
      return { success: data.success, message: data.message || 'Sincronización finalizada.' };
    } catch (err: any) {
      setSyncingConnectorId(null);
      return { success: false, message: `Error de sincronización: ${err.message}` };
    }
  };

  // Sync Fox CRM via Data-Extractor shortcut
  const syncDataExtractor = async () => {
    setIsSyncingDataExtractor(true);
    const foxConn = connectors.find(c => c.type === 'data_extractor');
    if (foxConn) {
      await syncConnector(foxConn.id);
    } else {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    setIsSyncingDataExtractor(false);
  };

  // Add Operation
  const addOperation = (opData: Omit<SalesOperation, 'id' | 'status' | 'scoring_status'>) => {
    const newId = `op-${Date.now().toString().slice(-4)}`;
    const newOp: SalesOperation = {
      ...opData,
      id: newId,
      status: 'pending_scoring',
      scoring_status: 'pending',
      scoring_notes: 'Registrado en sistema. Pendiente de llamado de auditoría por Calidad/RRHH.',
    };

    setOperations(prev => {
      const next = [newOp, ...prev];
      syncToBackend({ operations: next });
      return next;
    });
    return { success: true, message: 'Operación registrada exitosamente. En espera de Scoring de Calidad.' };
  };

  // Audit Scoring
  const auditScoring = (operationId: string, status: ScoringStatus, notes: string, reasons?: string[]) => {
    const apto = canPresentToFactory(status);
    setOperations(prev => {
      const next = prev.map(op => {
        if (op.id !== operationId) return op;
        return {
          ...op,
          scoring_status: status,
          scoring_notes: notes,
          scoring_rejection_reasons: reasons || [],
          status: (apto ? 'apto_fabrica' : 'pending_scoring') as OperationStatus,
          audited_at: new Date().toISOString().replace('T', ' ').slice(0, 16),
        };
      });
      syncToBackend({ operations: next });
      return next;
    });

    if (status === 'approved') {
      return { success: true, message: 'Scoring APROBADO. Contrato habilitado como "Apto Presentación a Fábrica".' };
    } else if (status === 'rejected') {
      return { success: false, message: 'Scoring RECHAZADO. Bloqueado para presentación a Fábrica por inconsistencias.' };
    }
    return { success: true, message: 'Estado de scoring actualizado a Pendiente.' };
  };

  // Request Wage Advance
  const requestAdvance = (sellerId: string, amount: number, reason: string) => {
    const seller = sellers.find(s => s.id === sellerId);
    if (!seller) return { success: false, message: 'Vendedor no encontrado.' };

    const sellerSales = salesBySeller[sellerId] || 0;
    const currentDay = new Date().getDate();

    const validation = validateAdvanceEligibility(
      sellerSales,
      monthlyConfig.min_sales_for_advance,
      amount,
      monthlyConfig.max_advance_amount,
      currentDay,
      monthlyConfig.advance_deadline_day
    );

    if (!validation.eligible) {
      return {
        success: false,
        message: validation.reasons.join(' '),
      };
    }

    const newAdvance: WageAdvance = {
      id: `wa-${Date.now().toString().slice(-4)}`,
      seller_id: sellerId,
      request_date: new Date().toISOString().slice(0, 10),
      amount,
      status: 'pending',
      seller_sales_count_at_date: sellerSales,
      min_sales_required: monthlyConfig.min_sales_for_advance,
      reason,
    };

    setWageAdvances(prev => {
      const next = [newAdvance, ...prev];
      syncToBackend({ wageAdvances: next });
      return next;
    });
    return { success: true, message: `Solicitud de adelanto enviada correctamente para ${seller.name}.` };
  };

  const reviewAdvance = (advanceId: string, status: 'approved' | 'rejected', notes?: string) => {
    setWageAdvances(prev => {
      const next = prev.map(wa => {
        if (wa.id !== advanceId) return wa;
        return {
          ...wa,
          status,
          rejection_reason: status === 'rejected' ? notes : undefined,
          reviewed_at: new Date().toISOString().replace('T', ' ').slice(0, 16),
          reviewed_by: `${currentUser.name} (${currentUser.role.toUpperCase()})`,
        };
      });
      syncToBackend({ wageAdvances: next });
      return next;
    });
  };

  const distributeLeads = (sellerId: string, count: number, source: any) => {
    setLeadDistributions(prev => {
      const existing = prev.find(ld => ld.seller_id === sellerId && ld.lead_source === source);
      let next: LeadDistribution[];
      if (existing) {
        next = prev.map(ld =>
          ld.id === existing.id ? { ...ld, assigned_leads: ld.assigned_leads + count } : ld
        );
      } else {
        const seller = sellers.find(s => s.id === sellerId);
        const newLd: LeadDistribution = {
          id: `ld-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString().slice(0, 10),
          seller_id: sellerId,
          team_id: seller?.team_id || 'team-1',
          assigned_leads: count,
          contacted_leads: 0,
          closed_leads: 0,
          lost_leads: 0,
          lead_source: source,
          loss_reasons: {},
        };
        next = [newLd, ...prev];
      }
      syncToBackend({ leadDistributions: next });
      return next;
    });
  };

  const updateMonthlyConfig = (newConf: Partial<MonthlyConfig>) => {
    setMonthlyConfig(prev => {
      const next = { ...prev, ...newConf };
      syncToBackend({ monthlyConfig: next });
      return next;
    });
  };

  const updatePriceListItem = (item: PriceListItem) => {
    setPriceLists(prev => {
      const next = prev.map(pl => (pl.id === item.id ? item : pl));
      syncToBackend({ priceLists: next });
      return next;
    });
  };

  const addPriceListItem = (item: Omit<PriceListItem, 'id' | 'updated_at'>) => {
    const newItem: PriceListItem = {
      ...item,
      id: `pl-${Date.now().toString().slice(-4)}`,
      updated_at: new Date().toISOString().slice(0, 10),
    };
    setPriceLists(prev => {
      const next = [newItem, ...prev];
      syncToBackend({ priceLists: next });
      return next;
    });
  };

  const updateCandidateStage = (candidateId: string, stage: Candidate['stage']) => {
    setCandidates(prev => {
      const next = prev.map(c => (c.id === candidateId ? { ...c, stage } : c));
      syncToBackend({ candidates: next });
      return next;
    });
  };

  const updateCandidateDocs = (candidateId: string, docKey: keyof Candidate['docs'], value: boolean) => {
    setCandidates(prev => {
      const next = prev.map(c => {
        if (c.id !== candidateId) return c;
        return { ...c, docs: { ...c.docs, [docKey]: value } };
      });
      syncToBackend({ candidates: next });
      return next;
    });
  };

  const importCarteraBatch = (newRecords: CarteraMora[]) => {
    setCarteraMora(prev => {
      const next = [...newRecords, ...prev];
      syncToBackend({ carteraMora: next });
      return next;
    });
  };

  const updateSellerTarget = (sellerId: string, newTarget: number) => {
    setSellers(prev => {
      const next = prev.map(s => (s.id === sellerId ? { ...s, individual_target: newTarget } : s));
      syncToBackend({ sellers: next });
      return next;
    });
  };

  const updateTeamTargetOverride = (teamId: string, override?: number) => {
    setTeams(prev => {
      const next = prev.map(t => (t.id === teamId ? { ...t, target_override: override } : t));
      syncToBackend({ teams: next });
      return next;
    });
  };

  const addSeller = (sellerData: Omit<Seller, 'id'>) => {
    const newSeller: Seller = {
      ...sellerData,
      id: `seller-${Date.now().toString().slice(-4)}`,
    };
    setSellers(prev => {
      const next = [...prev, newSeller];
      syncToBackend({ sellers: next });
      return next;
    });
  };

  const addTeam = (teamData: Omit<Team, 'id'>) => {
    const newTeam: Team = {
      ...teamData,
      id: `team-${Date.now().toString().slice(-4)}`,
    };
    setTeams(prev => {
      const next = [...prev, newTeam];
      syncToBackend({ teams: next });
      return next;
    });
  };

  const importBulkData = async (entityType: string, records: any[]) => {
    await fetch('/api/data/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType, records }),
    });
    // refresh state
    const res = await fetch('/api/data');
    const data = await res.json();
    if (data.data) {
      if (data.data.teams) setTeams(data.data.teams);
      if (data.data.sellers) setSellers(data.data.sellers);
      if (data.data.operations) setOperations(data.data.operations);
      if (data.data.carteraMora) setCarteraMora(data.data.carteraMora);
      if (data.data.priceLists) setPriceLists(data.data.priceLists);
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        users,
        connectors,
        updateConnector,
        testConnector,
        syncConnector,
        testingConnectorId,
        syncingConnectorId,
        teams,
        sellers,
        operations,
        priceLists,
        wageAdvances,
        monthlyConfig,
        carteraMora,
        candidates,
        leadDistributions,
        recommendations,
        selectedTeamId,
        setSelectedTeamId,
        selectedMonth,
        setSelectedMonth,
        isSyncingDataExtractor,
        syncDataExtractor,
        lastSyncTime,
        addOperation,
        auditScoring,
        requestAdvance,
        reviewAdvance,
        distributeLeads,
        updateMonthlyConfig,
        updatePriceListItem,
        addPriceListItem,
        updateCandidateStage,
        updateCandidateDocs,
        importCarteraBatch,
        updateSellerTarget,
        updateTeamTargetOverride,
        addSeller,
        addTeam,
        importBulkData,
        activeSellers,
        sellersByTeam,
        salesBySeller,
        sellersAtZero,
        sellersAtOne,
        sellersAtTwoPlus,
        teamMetrics,
        workingDaysInfo,
        overallPacing,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
