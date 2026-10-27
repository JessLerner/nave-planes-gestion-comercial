export type UserRole = 'admin' | 'gerente' | 'supervisor' | 'rrhh';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team_id?: string;
  staff_member_id?: string;
  branch: string;
  avatar?: string;
}

export interface Team {
  id: string;
  name: string;
  supervisor_id: string;
  supervisor_name: string;
  supervisor_staff_id?: string;
  manager_staff_id?: string;
  manager_name?: string;
  commercial_structure?: string;
  branch: string;
  target_override?: number;
  color: string;
}

export interface Seller {
  id: string;
  name: string;
  team_id: string;
  staff_member_id?: string;
  active: boolean;
  hire_date?: string;
  termination_date?: string;
  legajo?: string;
  employment_type?: string;
  phone: string;
  email: string;
  dni: string;
  avatar?: string;
  individual_target?: number;
}

export type BrandType = 'Peugeot' | 'Fiat' | 'Renault' | 'Leapmotor' | 'Jeep' | 'Citroën';

export type PlanType = '100%' | '80/20' | '70/30' | '60/40';

export type LeadSource = 'Prospect' | 'Run One' | 'Stand' | 'Subite' | 'AGP' | 'Facebook Ads' | 'Dato Propio';

export type OperationStatus = 'pending_scoring' | 'apto_fabrica' | 'ingresado_fabrica' | 'caido';

export type ScoringStatus = 'approved' | 'rejected' | 'pending';

export interface UsedCarAppraisal {
  make: string;
  model: string;
  year: number;
  kilometers: number;
  appraisal_value: number;
  inspection_notes: string;
  license_plate: string;
}

export interface SalesOperation {
  id: string;
  date: string;
  client_name: string;
  client_dni: string;
  client_phone: string;
  subscription_number: string;
  brand: BrandType;
  model: string;
  plan_type: PlanType;
  cuota_1_value: number;
  total_collected: number;
  factory_account: string;
  used_car_flag: boolean;
  used_car_details?: UsedCarAppraisal;
  seller_id: string;
  team_id: string;
  lead_source: LeadSource;
  status: OperationStatus;
  scoring_status: ScoringStatus;
  scoring_notes?: string;
  scoring_rejection_reasons?: string[];
  audited_at?: string;
}

export interface ScoringRecord {
  id: string;
  operation_id: string;
  status: ScoringStatus;
  call_notes: string;
  rejection_reasons: string[];
  audited_at: string;
  auditor_id: string;
  auditor_name: string;
  verified_income: boolean;
  verified_delivery_terms: boolean;
  verified_quota_value: boolean;
}

// Read-only mirror of the quality-control spreadsheets.  It intentionally
// preserves the category reported by Administración instead of guessing a
// normalized approval state from it.
export interface ScoringSourceRow {
  id: string;
  brand: string;
  subscription_number: string;
  scoring_date?: string;
  seller_name?: string;
  supervisor_name?: string;
  observed_category?: string;
  rejection_reason_1?: string;
  rejection_reason_2?: string;
  approval_reason?: string;
  cancellation_reason?: string;
  last_seen_at?: string;
}

export interface LeadDistribution {
  id: string;
  date: string;
  seller_id: string;
  team_id: string;
  assigned_leads: number;
  contacted_leads: number;
  closed_leads: number;
  lost_leads: number;
  lead_source: LeadSource;
  loss_reasons: {
    no_califica_ingresos?: number;
    dudas_cuota_pura?: number;
    fuera_de_zona?: number;
    sin_interes_inmediato?: number;
    eligio_competencia?: number;
    numero_invalido?: number;
  };
}

export interface PriceListItem {
  id: string;
  brand: BrandType;
  model: string;
  version: string;
  plan_type: PlanType;
  cuota_1_value: number;
  factory_quota_value: number;
  car_value: number;
  bonus_discount: number;
  active: boolean;
  updated_at: string;
}

export interface WageAdvance {
  id: string;
  seller_id: string;
  request_date: string;
  amount: number;
  status: 'approved' | 'rejected' | 'pending';
  seller_sales_count_at_date: number;
  min_sales_required: number;
  reason?: string;
  rejection_reason?: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

export interface MonthlyConfig {
  id: string;
  year: number;
  month: number;
  month_name: string;
  start_date: string;
  end_date: string;
  working_days: number;
  min_sales_for_advance: number;
  max_advance_amount: number;
  advance_deadline_day: number;
  default_team_target_per_seller: number;
}

export interface CarteraMora {
  id: string;
  operation_id: string;
  subscription_number: string;
  client_name: string;
  seller_id: string;
  team_id: string;
  brand: BrandType;
  model: string;
  grouping_status: 'Agrupado' | 'En Formación' | 'Licitación' | 'Adjudicado' | 'Cancelado';
  overdue_installments: number;
  total_debt: number;
  plan_status: 'Al Día' | 'Mora Leve (1-2)' | 'Mora Severa (3+)' | 'Rescindido';
  last_payment_date: string;
  group_number: string;
  order_number: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  stage: 'postulacion' | 'entrevista_rrhh' | 'entrevista_supervisor' | 'documentacion' | 'alta_confirmada' | 'descartado';
  applied_date: string;
  target_team_id: string;
  notes: string;
  docs: {
    dni: boolean;
    cv: boolean;
    cuil: boolean;
    antecedentes: boolean;
  };
}

export interface Recommendation {
  id: string;
  type: 'critical' | 'warning' | 'opportunity' | 'praise';
  audience: 'supervisor' | 'gerente' | 'all';
  target_team_id?: string;
  title: string;
  description: string;
  suggested_action: string;
  metric_tag: string;
}
