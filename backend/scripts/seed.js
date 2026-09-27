import 'dotenv/config';
import XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { query, closeDatabase } from '../src/database/db.js';
import { importarPlanilla } from '../src/services/excelImportService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const planilla = path.join(dataDir, 'planilla_maestra.xlsx');

const filas = [
  ['Shanghai', 'San Antonio', 'Naviera Pacífico', 1850, 2850, 40],
  ['Shanghai', 'San Antonio', 'TransAndina Shipping', 1780, 2750, 42],
  ['Shanghai', 'San Antonio', 'OceanBridge', 1920, 2980, 38],
  ['Shanghai', 'Valparaíso', 'Naviera Pacífico', 1900, 2900, 41],
  ['Shanghai', 'Valparaíso', 'TransAndina Shipping', 1830, 2800, 43],
  ['Shanghai', 'Valparaíso', 'OceanBridge', 1970, 3050, 39],
  ['Shenzhen', 'San Antonio', 'Naviera Pacífico', 1800, 2790, 42],
  ['Shenzhen', 'San Antonio', 'TransAndina Shipping', 1740, 2700, 44],
  ['Shenzhen', 'San Antonio', 'OceanBridge', 1880, 2920, 40],
  ['Hamburgo', 'San Antonio', 'Naviera Pacífico', 2400, 3600, 32],
  ['Hamburgo', 'San Antonio', 'TransAndina Shipping', 2320, 3480, 34],
  ['Hamburgo', 'Valparaíso', 'OceanBridge', 2480, 3720, 30],
  ['Rotterdam', 'Valparaíso', 'Naviera Pacífico', 2350, 3550, 33],
  ['Rotterdam', 'Valparaíso', 'TransAndina Shipping', 2280, 3420, 35],
  ['Rotterdam', 'San Antonio', 'OceanBridge', 2450, 3680, 31],
  ['Santos', 'San Antonio', 'Naviera Pacífico', 1250, 1950, 18],
  ['Santos', 'San Antonio', 'TransAndina Shipping', 1190, 1850, 20],
  ['Santos', 'Valparaíso', 'OceanBridge', 1300, 2020, 17],
  ['Houston', 'San Antonio', 'Naviera Pacífico', 2100, 3200, 24],
  ['Houston', 'San Antonio', 'TransAndina Shipping', 2020, 3080, 26],
  ['Houston', 'Valparaíso', 'OceanBridge', 2180, 3300, 23],
];

function generarPlanilla() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(planilla)) return;
  const encabezados = ['Origen', 'Destino', 'Embarcador', 'Flete20_USD', 'Flete40_USD', 'Transito_Dias'];
  const ws = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tarifas');
  XLSX.writeFile(wb, planilla);
  console.log(`Planilla de ejemplo generada: ${planilla}`);
}

async function ensureUser(username, fullName, role, password) {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await query(`
    INSERT INTO users (username, full_name, password_hash, role, active)
    VALUES ($1,$2,$3,$4,TRUE)
    ON CONFLICT ((LOWER(username)))
    DO UPDATE SET
      full_name = EXCLUDED.full_name,
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      active = TRUE
    RETURNING id, username, full_name, role
  `, [username, fullName, hash, role]);
  return rows[0];
}

try {
  generarPlanilla();

  const password = process.env.SEED_PASSWORD || 'comex2024';
  const jefatura = await ensureUser('jefatura', 'Jefatura Comex', 'ADMIN', password);
  await ensureUser('analista', 'Analista Comex', 'ANALISTA', password);

  const { rows: importRows } = await query(`SELECT COUNT(*)::int AS count FROM tariff_imports`);
  if (importRows[0].count === 0) {
    const buffer = fs.readFileSync(planilla);
    const result = await importarPlanilla(buffer, path.basename(planilla), jefatura.id);
    console.log(`Tarifas importadas a PostgreSQL: versión ${result.version}, ${result.rows} filas.`);
  } else {
    console.log('La base ya contiene importaciones de tarifas; no se volvió a importar la planilla.');
  }

  console.log('Seed completado correctamente.');
  console.log(`Usuarios demo: jefatura / ${password} y analista / ${password}`);
} catch (err) {
  console.error('Error ejecutando seed:', err);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
