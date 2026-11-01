export type PriceListScope = 'manage' | 'manager' | 'supervisor';

export type PriceListVersion = {
  id: string;
  brand: string;
  name: string;
  effective_date: string;
  version_number?: number;
  status?: 'draft' | 'published_to_managers' | 'archived';
};

export type PriceListConfirmation = Omit<PriceListVersion, 'id' | 'status'> & {
  id: string;
  price_list_version_id: string;
  confirmed_at: string | null;
  status: 'pending' | 'confirmed' | 'superseded';
};

export type PriceListItemView = {
  id: string;
  price_list_version_id: string;
  model: string;
  plan_type: string;
  total_installments: number;
  basic_value: number;
  pure_installment: number;
  delivery_terms: string | null;
  cuota_1_value?: number;
  base_surcharge?: number;
  surcharge_amount?: number;
  subscription_value: number;
};

export type PriceListSegmentView = {
  price_list_item_id: string;
  installment_from: number;
  installment_to: number;
  total_value: number;
  sort_order: number;
};

export type PriceListsResponse = {
  success: boolean;
  message?: string;
  scope?: PriceListScope;
  versions?: PriceListVersion[];
  confirmations?: PriceListConfirmation[];
  items?: PriceListItemView[];
  segments?: PriceListSegmentView[];
};

async function request<T>(token: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/price-lists', {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  });
  const payload = await response.json() as T & { message?: string; success?: boolean };
  if (!response.ok || payload.success === false) throw new Error(payload.message || 'No se pudo procesar la lista de precios.');
  return payload;
}

export const getPriceLists = (token: string) => request<PriceListsResponse>(token);
export const publishPriceList = (token: string, versionId: string) => request<PriceListsResponse>(token, { method: 'POST', body: JSON.stringify({ action: 'publish', version_id: versionId }) });
export const saveSurcharges = (token: string, versionId: string, surcharges: Array<{ item_id: string; surcharge_amount: number }>) => request<PriceListsResponse>(token, { method: 'POST', body: JSON.stringify({ action: 'save_surcharges', version_id: versionId, surcharges }) });
export const confirmPriceList = (token: string, versionId: string) => request<PriceListsResponse>(token, { method: 'POST', body: JSON.stringify({ action: 'confirm', version_id: versionId }) });
export const createRenaultDraft = (token: string, draft: Record<string, unknown>) => request<PriceListsResponse>(token, { method: 'POST', body: JSON.stringify({ action: 'create_renault_draft', ...draft }) });
