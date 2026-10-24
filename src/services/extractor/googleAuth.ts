import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach(scope => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Error al iniciar sesión con Google:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime: string;
  sharedWithMe?: boolean;
  capabilities?: {
    canEdit?: boolean;
    canComment?: boolean;
  };
}

export async function fetchDriveSpreadsheets(token: string): Promise<DriveSpreadsheetFile[]> {
  const query = encodeURIComponent("mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const fields = encodeURIComponent("files(id, name, modifiedTime, sharedWithMe, capabilities)");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=25&orderBy=modifiedTime desc`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Error al listar planillas de Google Drive');
  }

  const data = await res.json();
  return data.files || [];
}

export interface SheetTabSummary {
  sheetId: number;
  title: string;
  index: number;
  rowCount?: number;
  columnCount?: number;
}

export interface ExtractedSheetData {
  spreadsheetId: string;
  title: string;
  sheetName: string;
  headers: string[];
  rows: Array<Record<string, any>>;
  isReadOnly: boolean;
  availableTabs?: SheetTabSummary[];
}

export async function fetchSpreadsheetTabs(
  spreadsheetId: string,
  token: string
): Promise<{ title: string; tabs: SheetTabSummary[] }> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Error al obtener las pestañas de la planilla.');
  }

  const metaData = await metaRes.json();
  const title = metaData.properties?.title || 'Planilla de Google';
  const sheets = metaData.sheets || [];

  const tabs: SheetTabSummary[] = sheets.map((s: any) => ({
    sheetId: s.properties?.sheetId || 0,
    title: s.properties?.title || 'Hoja',
    index: s.properties?.index || 0,
    rowCount: s.properties?.gridProperties?.rowCount,
    columnCount: s.properties?.gridProperties?.columnCount
  }));

  return { title, tabs };
}

export async function fetchSpreadsheetContent(
  spreadsheetId: string,
  token: string,
  targetSheetNames?: string[]
): Promise<ExtractedSheetData> {
  const meta = await fetchSpreadsheetTabs(spreadsheetId, token);
  const spreadsheetTitle = meta.title;
  const allTabs = meta.tabs;

  if (allTabs.length === 0) {
    throw new Error('La planilla no contiene hojas disponibles.');
  }

  // Default is ALWAYS the last tab per requirement
  const lastTab = allTabs[allTabs.length - 1];
  const selectedTabs = (targetSheetNames && targetSheetNames.length > 0)
    ? allTabs.filter(t => targetSheetNames.includes(t.title))
    : [lastTab];

  const finalTabsToRead = selectedTabs.length > 0 ? selectedTabs : [lastTab];

  let combinedRows: Array<Record<string, any>> = [];
  let commonHeaders: string[] = [];

  for (const tab of finalTabsToRead) {
    const range = encodeURIComponent(`'${tab.title}'!A1:Z500`);
    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (!dataRes.ok) {
      console.warn(`Could not read tab ${tab.title}`);
      continue;
    }

    const valuesData = await dataRes.json();
    const rawValues: any[][] = valuesData.values || [];
    if (rawValues.length <= 1) continue;

    const rawHeaders = rawValues[0] || [];
    const headers = rawHeaders.map((h: any, i: number) => {
      const str = String(h || '').trim();
      return str.toLowerCase().replace(/\s+/g, '_') || `col_${i + 1}`;
    });

    if (commonHeaders.length === 0) {
      commonHeaders = headers;
    }

    for (let r = 1; r < rawValues.length; r++) {
      const rowCells = rawValues[r];
      if (!rowCells || rowCells.length === 0) continue;
      const rowObj: Record<string, any> = {
        _source_tab: tab.title
      };
      let hasValue = false;

      headers.forEach((h: string, idx: number) => {
        const cellVal = rowCells[idx] !== undefined ? rowCells[idx] : '';
        if (cellVal !== '') hasValue = true;
        const cleaned = String(cellVal).replace(/[$,]/g, '').trim();
        const num = Number(cleaned);
        if (!isNaN(num) && cleaned !== '' && String(cellVal).match(/[0-9]/)) {
          rowObj[h] = num;
        } else {
          rowObj[h] = cellVal;
        }
      });

      if (hasValue) {
        combinedRows.push(rowObj);
      }
    }
  }

  const primarySheetName = finalTabsToRead.map(t => t.title).join(', ');

  return {
    spreadsheetId,
    title: spreadsheetTitle,
    sheetName: primarySheetName,
    headers: commonHeaders.length > 0 ? ['_source_tab', ...commonHeaders] : [],
    rows: combinedRows,
    isReadOnly: true,
    availableTabs: allTabs
  };
}
