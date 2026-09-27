// Lectura de la planilla maestra (.xlsx) que simula el archivo de OneDrive
import XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ARCHIVO_MAESTRO = path.join(DATA_DIR, 'planilla_maestra.xlsx');

/**
 * Lee la planilla maestra y retorna las tarifas normalizadas.
 * Formato esperado (hoja "Tarifas"):
 * Origen | Destino | Embarcador | Flete20_USD | Flete40_USD | Transito_Dias
 */
export function leerTarifas() {
  if (!fs.existsSync(ARCHIVO_MAESTRO)) {
    const err = new Error('No existe la planilla maestra. Ejecute "npm run seed".');
    err.status = 503;
    throw err;
  }
  const wb = XLSX.readFile(ARCHIVO_MAESTRO);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: null });

  return filas.map((f, i) => ({
    origen: String(f.Origen ?? '').trim(),
    destino: String(f.Destino ?? '').trim(),
    embarcador: String(f.Embarcador ?? '').trim(),
    flete20: Number(f.Flete20_USD),
    flete40: Number(f.Flete40_USD),
    transitoDias: Number(f.Transito_Dias),
    _fila: i + 2,
  })).filter(t =>
    t.origen && t.destino && t.embarcador &&
    Number.isFinite(t.flete20) && t.flete20 > 0 &&
    Number.isFinite(t.flete40) && t.flete40 > 0 &&
    Number.isFinite(t.transitoDias) && t.transitoDias > 0
  );
}

/** Catálogo único de puertos de origen y destino para los selects del frontend. */
export function getPuertos() {
  const tarifas = leerTarifas();
  const origenes = [...new Set(tarifas.map(t => t.origen))].sort();
  const destinos = [...new Set(tarifas.map(t => t.destino))].sort();
  return { origenes, destinos };
}

/** Reemplaza la planilla maestra con un archivo subido (.xlsx o .csv). */
export function guardarPlanilla(buffer, originalname) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const ext = path.extname(originalname).toLowerCase();

  if (ext === '.csv') {
    // Interpretar el CSV y reescribirlo como .xlsx para mantener un único formato interno
    const texto = buffer.toString('utf-8');
    const wb = XLSX.read(texto, { type: 'string' });
    XLSX.writeFile(wb, ARCHIVO_MAESTRO);
  } else {
    fs.writeFileSync(ARCHIVO_MAESTRO, buffer);
  }

  // Validar que el archivo recién escrito sea legible y tenga el formato esperado
  try {
    leerTarifas();
  } catch (e) {
    fs.unlinkSync(ARCHIVO_MAESTRO);
    const err = new Error('El archivo no tiene el formato esperado (Origen, Destino, Embarcador, Flete20_USD, Flete40_USD, Transito_Dias).');
    err.status = 422;
    throw err;
  }
}
