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
} from '../types';
import { DatabaseConnectorConfig, IngestionLog } from '../types/database';

/**
 * Functional system roles for executive access
 */
export const DEFAULT_USERS: User[] = [
  {
    id: 'user-admin',
    name: 'Administración General',
    email: 'admin@concesionaria.com',
    role: 'admin',
    branch: 'Sede Central',
  },
  {
    id: 'user-gerente',
    name: 'Gerencia Comercial',
    email: 'gerencia@concesionaria.com',
    role: 'gerente',
    branch: 'Todas las Sucursales',
  },
  {
    id: 'user-sup',
    name: 'Supervisión de Ventas',
    email: 'supervision@concesionaria.com',
    role: 'supervisor',
    team_id: 'team-1',
    branch: 'Sucursal Oficial',
  },
  {
    id: 'user-rrhh',
    name: 'Auditoría & Calidad (RRHH)',
    email: 'calidad@concesionaria.com',
    role: 'rrhh',
    branch: 'Auditoría Central',
  },
];

/**
 * Standard operational calendar configuration
 */
export const DEFAULT_MONTHLY_CONFIG: MonthlyConfig = {
  id: 'conf-active',
  year: 2026,
  month: 10,
  month_name: 'Octubre 2026',
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  working_days: 27,
  min_sales_for_advance: 2,
  max_advance_amount: 350000,
  advance_deadline_day: 15,
  default_team_target_per_seller: 4,
};

/**
 * Default Database and API Connectors available for ingestion
 */
export const DEFAULT_CONNECTORS: DatabaseConnectorConfig[] = [
  {
    id: 'conn-pg-main',
    name: 'PostgreSQL / Supabase (Base Central)',
    type: 'postgresql',
    description: 'Base de datos relacional para operaciones, contratos y nómina de vendedores.',
    enabled: true,
    status: 'disconnected',
    config: {
      host: 'localhost',
      port: 5432,
      database: 'naveplanes_db',
      username: 'postgres',
      ssl: true,
    },
    tables_mapped: ['sellers', 'teams', 'sales_operations', 'cartera_mora', 'price_lists'],
  },
  {
    id: 'conn-fox-crm',
    name: 'Data-Extractor API (Fox CRM & Webhooks)',
    type: 'data_extractor',
    description: 'Pipeline de ingesta continua de leads calificados por canal de origen.',
    enabled: true,
    status: 'disconnected',
    config: {
      api_url: 'https://api.data-extractor.com/v1',
      api_key: '',
    },
    tables_mapped: ['leads_distribution', 'lead_sources', 'loss_reasons'],
  },
  {
    id: 'conn-google-sheets',
    name: 'Google Sheets (Auditoría de Scoring & Precios)',
    type: 'google_sheets',
    description: 'Sincronización de planillas donde Administración vuelca el llamado de calidad.',
    enabled: true,
    status: 'disconnected',
    config: {
      sheet_url: '',
    },
    tables_mapped: ['scoring_records', 'price_lists'],
  },
];

/**
 * Empty data collections - NO FAKE / INVENTED RECORDS IN CODE
 */
export const EMPTY_TEAMS: Team[] = [];
export const EMPTY_SELLERS: Seller[] = [];
export const EMPTY_OPERATIONS: SalesOperation[] = [];
export const EMPTY_CARTERA: CarteraMora[] = [];
export const EMPTY_ADVANCES: WageAdvance[] = [];
export const EMPTY_CANDIDATES: Candidate[] = [];
export const EMPTY_LEADS: LeadDistribution[] = [];
export const EMPTY_PRICE_LIST: PriceListItem[] = [];
export const EMPTY_RECOMMENDATIONS: Recommendation[] = [];
export const EMPTY_LOGS: IngestionLog[] = [];
