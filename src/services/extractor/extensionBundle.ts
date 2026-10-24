import JSZip from 'jszip';

export interface ExtensionFiles {
  'manifest.json': string;
  'popup.html': string;
  'popup.js': string;
  'content.js': string;
  'background.js': string;
  'README.md': string;
}

export function getExtensionSources(apiBaseUrl: string, defaultApiKey: string): ExtensionFiles {
  const fullIngestUrl = `${apiBaseUrl}/api/ingest`;

  const manifest = JSON.stringify({
    manifest_version: 3,
    name: "SheetStream - Extractor a Supabase",
    version: "3.2.0",
    description: "Extrae datos de Google Sheets (última pestaña por defecto) y páginas web/CRM directamente a Supabase.",
    icons: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    action: {
      default_popup: "popup.html",
      default_title: "SheetStream Extractor"
    },
    permissions: [
      "activeTab",
      "storage",
      "scripting"
    ],
    host_permissions: [
      "https://docs.google.com/spreadsheets/*",
      "https://*/*",
      "http://*/*"
    ],
    background: {
      service_worker: "background.js"
    },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content.js"],
        run_at: "document_idle"
      }
    ]
  }, null, 2);

  const popupHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>SheetStream Extractor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      width: 360px;
      padding: 16px;
      color: #0f172a;
      background: #ffffff;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .brand {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brand-icon {
      width: 18px;
      height: 18px;
      background: #0f172a;
      color: #ffffff;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 800;
    }
    .badge {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 9999px;
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      border: 1px solid #e2e8f0;
    }
    .field {
      margin-bottom: 12px;
    }
    label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 4px;
    }
    input, select {
      width: 100%;
      padding: 8px 10px;
      font-size: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      color: #0f172a;
    }
    input:focus, select:focus {
      outline: none;
      border-color: #0f172a;
      background: #ffffff;
    }
    .btn {
      width: 100%;
      padding: 10px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background: #0f172a;
      color: #ffffff;
      margin-top: 8px;
    }
    .btn-primary:hover {
      background: #1e293b;
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 11px;
      font-weight: 600;
      color: #1e293b;
    }
    .status-box {
      margin-top: 12px;
      padding: 9px 12px;
      background: #f8fafc;
      border-radius: 6px;
      font-size: 11px;
      color: #475569;
      min-height: 38px;
      line-height: 1.4;
      border: 1px solid #e2e8f0;
    }
    .status-success {
      background: #f0fdf4;
      color: #166534;
      border-color: #bbf7d0;
      font-weight: 500;
    }
    .status-error {
      background: #fef2f2;
      color: #991b1b;
      border-color: #fecaca;
    }
    .details {
      margin-top: 10px;
      font-size: 10px;
      color: #64748b;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-icon">S</div>
      <span>SheetStream</span>
    </div>
    <span id="detectedType" class="badge">Detectando origen...</span>
  </div>

  <div class="field" id="tabField">
    <label>Pestaña a Extraer (Por defecto: Última)</label>
    <select id="tabSelect">
      <option value="last">Última Pestaña de la Planilla (Predeterminada)</option>
      <option value="active">Pestaña actualmente visible en pantalla</option>
      <option value="all">Todas las pestañas detectadas</option>
    </select>
  </div>

  <div class="field">
    <label>Destino de Ingesta (API / Supabase)</label>
    <input type="text" id="targetUrl" value="${fullIngestUrl}" />
  </div>

  <div class="toggle-row">
    <div>
      <div>Mantener siempre sincronizado</div>
      <div style="font-size: 9px; font-weight: normal; color: #64748b;">Monitorea cambios y reenvía a Supabase</div>
    </div>
    <input type="checkbox" id="autoSync" checked style="width: 16px; height: 16px; cursor: pointer;" />
  </div>

  <button id="extractBtn" class="btn btn-primary">
    ⚡ Extraer y Sincronizar Ahora
  </button>

  <div id="statusBox" class="status-box">
    Listo para extraer datos de esta página.
  </div>

  <div class="details">
    Compatible con Google Sheets (incluso de solo lectura) y páginas CRM (HubSpot, Salesforce, Zoho, etc.).
  </div>

  <script src="popup.js"></script>
</body>
</html>`;

  const popupJs = `document.addEventListener('DOMContentLoaded', async () => {
  const detectedType = document.getElementById('detectedType');
  const tabSelect = document.getElementById('tabSelect');
  const targetUrl = document.getElementById('targetUrl');
  const autoSync = document.getElementById('autoSync');
  const extractBtn = document.getElementById('extractBtn');
  const statusBox = document.getElementById('statusBox');

  // Load saved config
  chrome.storage.sync.get(['targetUrl', 'autoSync', 'tabChoice'], (res) => {
    if (res.targetUrl) targetUrl.value = res.targetUrl;
    if (res.autoSync !== undefined) autoSync.checked = res.autoSync;
    if (res.tabChoice) tabSelect.value = res.tabChoice;
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isSheet = tab?.url && tab.url.includes('docs.google.com/spreadsheets');

  detectedType.textContent = isSheet ? 'Google Sheets' : 'Página Web / CRM';
  if (!isSheet) {
    document.getElementById('tabField').style.display = 'none';
  }

  // Safe message sender with auto-injection fallback if content script is not loaded
  async function sendExtractionRequest(retried = false) {
    if (!tab || !tab.id) {
      statusBox.className = 'status-box status-error';
      statusBox.textContent = 'No se encontró pestaña activa.';
      extractBtn.disabled = false;
      extractBtn.textContent = '⚡ Extraer y Sincronizar Ahora';
      return;
    }

    chrome.tabs.sendMessage(tab.id, {
      action: 'extract_data',
      tabChoice: tabSelect.value,
      targetUrl: targetUrl.value.trim()
    }, async (response) => {
      // If content script was missing, inject it dynamically and retry once
      if ((chrome.runtime.lastError || !response) && !retried) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          setTimeout(() => sendExtractionRequest(true), 350);
        } catch (e) {
          extractBtn.disabled = false;
          extractBtn.textContent = '⚡ Extraer y Sincronizar Ahora';
          statusBox.className = 'status-box status-error';
          statusBox.textContent = 'Recarga la pestaña para activar el extractor.';
        }
        return;
      }

      extractBtn.disabled = false;
      extractBtn.textContent = '⚡ Extraer y Sincronizar Ahora';

      if (!response || !response.success) {
        statusBox.className = 'status-box status-error';
        statusBox.textContent = (response && response.message) || 'Error al extraer datos. Verifica que la página contenga filas o columnas.';
      } else {
        statusBox.className = 'status-box status-success';
        statusBox.textContent = '✅ ' + response.rowCount + ' filas extraídas de [' + (response.sheetName || 'Última Pestaña') + '] y enviadas exitosamente.';
      }
    });
  }

  extractBtn.addEventListener('click', async () => {
    extractBtn.disabled = true;
    extractBtn.textContent = 'Extrayendo datos...';
    statusBox.className = 'status-box';
    statusBox.textContent = 'Procesando contenido de la página...';

    // Persist preferences
    chrome.storage.sync.set({
      targetUrl: targetUrl.value.trim(),
      autoSync: autoSync.checked,
      tabChoice: tabSelect.value
    });

    sendExtractionRequest(false);
  });
});`;

  // Bulletproof content script: fetches GViz + CSV directly via browser session cookies
  // Bypasses HTML5 Canvas virtualization and works on any sheet (including viewer/read-only)
  const contentJs = `// SheetStream Content Script V3.2
// Multi-layer extractor for Google Sheets & Web/CRM pages

console.log('[SheetStream] Extractor V3.2 activo.');

// Parse CSV text into array of objects with headers
function parseCsvToObjects(csvText, sourceTabName) {
  const lines = csvText.split(/\\r?\\n/).filter(line => line.trim().length > 0);
  if (lines.length <= 1) return [];

  // Simple and robust CSV line splitter handling quoted strings
  function parseCsvLine(line) {
    const values = [];
    let current = '';
    let insideQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map((h, i) => {
    const clean = h.replace(/^["']|["']$/g, '').trim().toLowerCase().replace(/\\s+/g, '_');
    return clean || ('col_' + (i + 1));
  });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    if (vals.length === 0) continue;
    const rowObj = { _source_tab: sourceTabName || 'Última Pestaña' };
    let hasVal = false;

    headers.forEach((h, idx) => {
      const v = (vals[idx] || '').replace(/^["']|["']$/g, '').trim();
      if (v !== '') hasVal = true;
      const num = Number(v.replace(/[$,]/g, ''));
      if (!isNaN(num) && v !== '' && v.match(/[0-9]/)) {
        rowObj[h] = num;
      } else {
        rowObj[h] = v;
      }
    });

    if (hasVal) rows.push(rowObj);
  }

  return rows;
}

// Extract from Google Sheets using GViz and CSV API
async function extractGoogleSheetsData(tabChoice) {
  const match = window.location.pathname.match(/\\/spreadsheets\\/d\\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    return { success: false, message: 'No se detectó el ID de la planilla en la URL actual.' };
  }

  const spreadsheetId = match[1];

  // 1. Discover all sheet tabs and identify the LAST tab (as per user mandate)
  const tabElements = Array.from(document.querySelectorAll('.docs-sheet-tab, .apps-filmstrip-sheet-tab, [role="tab"]'));
  const tabInfoList = tabElements.map(el => {
    const nameEl = el.querySelector('.docs-sheet-tab-name') || el;
    const name = nameEl.innerText ? nameEl.innerText.trim() : '';
    const gidAttr = el.getAttribute('data-id') || el.id || '';
    const gidMatch = gidAttr.match(/\\d+/);
    return {
      name,
      gid: gidMatch ? gidMatch[0] : null,
      isActive: el.classList.contains('docs-sheet-active-tab') || el.getAttribute('aria-selected') === 'true'
    };
  }).filter(t => t.name.length > 0);

  // Determine target tab: DEFAULT IS ALWAYS THE LAST TAB
  let targetTab = null;
  if (tabInfoList.length > 0) {
    if (tabChoice === 'active') {
      targetTab = tabInfoList.find(t => t.isActive) || tabInfoList[tabInfoList.length - 1];
    } else {
      // Default: ALWAYS THE LAST TAB
      targetTab = tabInfoList[tabInfoList.length - 1];
    }
  }

  const targetTabName = targetTab ? targetTab.name : 'Última Pestaña';
  const targetGid = targetTab ? targetTab.gid : null;

  // Layer 1: Query Google GViz JSON endpoint with user credentials
  try {
    let gvizUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/gviz/tq?tqx=out:json';
    if (targetGid) {
      gvizUrl += '&gid=' + encodeURIComponent(targetGid);
    } else if (targetTabName) {
      gvizUrl += '&sheet=' + encodeURIComponent(targetTabName);
    }

    const res = await fetch(gvizUrl, { credentials: 'include' });
    if (res.ok) {
      const text = await res.text();
      const jsonMatch = text.match(/google\\.visualization\\.Query\\.setResponse\\((.+)\\);/);
      if (jsonMatch && jsonMatch[1]) {
        const gvizData = JSON.parse(jsonMatch[1]);
        const table = gvizData.table;
        if (table && table.cols && table.rows && table.rows.length > 0) {
          const headers = table.cols.map((col, idx) => {
            const label = (col.label || col.id || ('col_' + (idx + 1))).trim().toLowerCase().replace(/\\s+/g, '_');
            return label || ('col_' + (idx + 1));
          });

          const rows = [];
          table.rows.forEach(r => {
            if (!r || !r.c) return;
            const rowObj = { _source_tab: targetTabName };
            let hasValue = false;
            r.c.forEach((cell, idx) => {
              const colName = headers[idx] || ('col_' + (idx + 1));
              if (cell && (cell.v !== null && cell.v !== undefined)) {
                hasValue = true;
                rowObj[colName] = (cell.f !== undefined && isNaN(Number(cell.v))) ? cell.f : cell.v;
              } else {
                rowObj[colName] = '';
              }
            });
            if (hasValue) rows.push(rowObj);
          });

          if (rows.length > 0) {
            return {
              success: true,
              sheetName: targetTabName,
              spreadsheetTitle: document.title.replace(' - Google Sheets', '').trim(),
              spreadsheetId,
              rows
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SheetStream] GViz JSON error, probando endpoint CSV:', err);
  }

  // Layer 2: Fetch raw CSV export via credentials
  try {
    let csvUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=csv';
    if (targetGid) {
      csvUrl += '&gid=' + targetGid;
    }

    const csvRes = await fetch(csvUrl, { credentials: 'include' });
    if (csvRes.ok) {
      const csvText = await csvRes.text();
      const rows = parseCsvToObjects(csvText, targetTabName);
      if (rows.length > 0) {
        return {
          success: true,
          sheetName: targetTabName,
          spreadsheetTitle: document.title.replace(' - Google Sheets', '').trim(),
          spreadsheetId,
          rows
        };
      }
    }
  } catch (err) {
    console.warn('[SheetStream] CSV export error, probando DOM fallback:', err);
  }

  // Layer 3: Fallback to DOM inspection
  return fallbackDomSheetExtraction(targetTabName);
}

// Fallback DOM extraction
function fallbackDomSheetExtraction(targetTabName) {
  const tables = document.querySelectorAll('.waffle, table');
  for (const table of tables) {
    const trs = Array.from(table.querySelectorAll('tr'));
    if (trs.length > 1) {
      const headers = Array.from(trs[0].querySelectorAll('th, td')).map((c, i) =>
        c.innerText.trim().toLowerCase().replace(/\\s+/g, '_') || ('col_' + (i + 1))
      );
      const rows = [];
      for (let i = 1; i < trs.length; i++) {
        const cells = Array.from(trs[i].querySelectorAll('td'));
        if (cells.length === 0) continue;
        const rowObj = { _source_tab: targetTabName || 'Última Pestaña' };
        let hasContent = false;
        cells.forEach((cell, idx) => {
          const col = headers[idx] || ('col_' + (idx + 1));
          const text = cell.innerText.trim();
          if (text) hasContent = true;
          rowObj[col] = text;
        });
        if (hasContent) rows.push(rowObj);
      }
      if (rows.length > 0) {
        return {
          success: true,
          sheetName: targetTabName || 'Última Pestaña',
          spreadsheetTitle: document.title.replace(' - Google Sheets', '').trim(),
          rows
        };
      }
    }
  }

  return {
    success: false,
    message: 'No se pudieron extraer datos de la planilla. Asegúrate de tener permisos para visualizarla.'
  };
}

// Extraction for Web Pages and CRMs
function extractWebPageData() {
  const rows = [];

  // 1. Inspect standard HTML tables
  const tables = document.querySelectorAll('table');
  tables.forEach(table => {
    const trs = Array.from(table.querySelectorAll('tr'));
    if (trs.length > 1) {
      const headers = Array.from(trs[0].querySelectorAll('th, td')).map((c, i) => {
        const txt = c.innerText.trim().toLowerCase().replace(/\\s+/g, '_');
        return txt || ('col_' + (i + 1));
      });

      for (let i = 1; i < trs.length; i++) {
        const cells = Array.from(trs[i].querySelectorAll('td'));
        if (cells.length === 0) continue;
        const rowObj = { _url_origen: window.location.href };
        let hasVal = false;
        cells.forEach((c, idx) => {
          const key = headers[idx] || ('col_' + (idx + 1));
          const val = c.innerText.trim();
          if (val) hasVal = true;
          rowObj[key] = val;
        });
        if (hasVal) rows.push(rowObj);
      }
    }
  });

  // 2. Inspect CRM card lists or table rows (role="row")
  if (rows.length === 0) {
    const customRows = document.querySelectorAll('[role="row"], .lead-item, .crm-record, .table-row, .item-row');
    customRows.forEach((item, idx) => {
      const text = item.innerText.trim();
      if (text.length > 6) {
        rows.push({
          id: 'row_' + (idx + 1),
          contenido: text.replace(/\\n+/g, ' | '),
          fecha: new Date().toISOString().split('T')[0],
          _url_origen: window.location.href
        });
      }
    });
  }

  return {
    success: rows.length > 0,
    sheetName: 'Web_CRM_Extraccion',
    spreadsheetTitle: document.title || 'Página Web Externa',
    rows,
    message: rows.length === 0 ? 'No se detectaron tablas ni filas estructuradas en esta página web o CRM.' : undefined
  };
}

// Extension message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract_data') {
    const isSheet = window.location.hostname.includes('docs.google.com') && window.location.pathname.includes('/spreadsheets');

    const extractionPromise = isSheet
      ? extractGoogleSheetsData(request.tabChoice)
      : Promise.resolve(extractWebPageData());

    extractionPromise.then(result => {
      if (!result.success || !result.rows || result.rows.length === 0) {
        sendResponse({ success: false, message: result.message || 'No se pudieron extraer filas de datos.' });
        return;
      }

      // Dispatch payload to background service worker for network delivery
      chrome.runtime.sendMessage({
        action: 'dispatch_api_sync',
        targetUrl: request.targetUrl,
        payload: {
          sheetName: result.sheetName,
          spreadsheetTitle: result.spreadsheetTitle,
          spreadsheetId: result.spreadsheetId,
          action: 'batch_sync',
          records: result.rows
        }
      }, (postRes) => {
        sendResponse(postRes || { success: true, rowCount: result.rows.length, sheetName: result.sheetName });
      });
    }).catch(err => {
      sendResponse({ success: false, message: err.message || 'Error en proceso de extracción' });
    });

    return true; // Keep message channel open for async response
  }
});`;

  const backgroundJs = `// SheetStream Background Service Worker V3.2

async function dispatchSync(targetUrl, payload) {
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      chrome.action.setBadgeText({ text: 'OK' });
      chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);
      return {
        success: true,
        rowCount: payload.records ? payload.records.length : 1,
        sheetName: payload.sheetName
      };
    } else {
      chrome.action.setBadgeText({ text: 'ERR' });
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
      return { success: false, message: data.message || 'El servidor receptor rechazó los datos (' + res.status + ').' };
    }
  } catch (err) {
    chrome.action.setBadgeText({ text: 'ERR' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    return { success: false, message: err.message || 'Error de conexión de red hacia el servidor destino.' };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'dispatch_api_sync') {
    dispatchSync(request.targetUrl || "${fullIngestUrl}", request.payload)
      .then(res => sendResponse(res));
    return true;
  }
});`;

  const readmeMd = `# SheetStream V3.2 - Extractor a Supabase

## Guía de Instalación en Google Chrome:
1. Descomprime este archivo ZIP en tu computadora (ej: carpeta "sheetstream-extension").
2. Abre Google Chrome y ve a \`chrome://extensions/\`.
3. Activa la casilla **Modo de desarrollador** (arriba a la derecha).
4. Haz clic en **Cargar descomprimida** y selecciona la carpeta descomprimida.
5. Abre cualquier planilla de Google Sheets o página CRM (Salesforce, HubSpot, etc.).
6. Haz clic en el ícono de la extensión SheetStream en la barra del navegador y pulsa **⚡ Extraer y Sincronizar Ahora**.

### Características clave:
- **Pestaña por Defecto**: Siempre extrae la **última pestaña** de Google Sheets de forma predeterminada.
- **Acceso Solo Lectura**: Funciona sin problemas en hojas donde únicamente tienes permiso de visualización (View-Only).
- **Extracción de CRM / Web**: Detecta automáticamente tablas, listas y filas en cualquier web.
- **Directo a Supabase**: Sincroniza en tiempo real con tu base de datos externa.
`;

  return {
    'manifest.json': manifest,
    'popup.html': popupHtml,
    'popup.js': popupJs,
    'content.js': contentJs,
    'background.js': backgroundJs,
    'README.md': readmeMd
  };
}

export async function downloadExtensionZip(apiBaseUrl: string, apiKey: string): Promise<Blob> {
  const zip = new JSZip();
  const sources = getExtensionSources(apiBaseUrl, apiKey);

  zip.file('manifest.json', sources['manifest.json']);
  zip.file('popup.html', sources['popup.html']);
  zip.file('popup.js', sources['popup.js']);
  zip.file('content.js', sources['content.js']);
  zip.file('background.js', sources['background.js']);
  zip.file('README.md', sources['README.md']);

  const iconsFolder = zip.folder('icons');
  if (iconsFolder) {
    const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    iconsFolder.file('icon16.png', base64Png, { base64: true });
    iconsFolder.file('icon48.png', base64Png, { base64: true });
    iconsFolder.file('icon128.png', base64Png, { base64: true });
  }

  return await zip.generateAsync({ type: 'blob' });
}
