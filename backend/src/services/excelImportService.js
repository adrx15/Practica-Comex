import XLSX from 'xlsx';
import crypto from 'node:crypto';
import { withTransaction } from '../database/db.js';

const COLUMNAS_REQUERIDAS = [
  'Origen',
  'Destino',
  'Embarcador',
  'Flete20_USD',
  'Flete40_USD',
  'Transito_Dias',
];

function normalizarNumero(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number(value);
  const clean = value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return Number(clean);
}

export function leerFilasPlanilla(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    const err = new Error('No fue posible leer el archivo Excel/CSV.');
    err.status = 422;
    throw err;
  }

  const nombreHoja = workbook.SheetNames.includes('Tarifas')
    ? 'Tarifas'
    : workbook.SheetNames[0];
  if (!nombreHoja) {
    const err = new Error('El archivo no contiene hojas de cálculo.');
    err.status = 422;
    throw err;
  }

  const filas = XLSX.utils.sheet_to_json(workbook.Sheets[nombreHoja], { defval: null });
  if (filas.length === 0) {
    const err = new Error('La planilla está vacía.');
    err.status = 422;
    throw err;
  }

  const headers = Object.keys(filas[0]);
  const faltantes = COLUMNAS_REQUERIDAS.filter((column) => !headers.includes(column));
  if (faltantes.length > 0) {
    const err = new Error(`Faltan columnas requeridas: ${faltantes.join(', ')}.`);
    err.status = 422;
    throw err;
  }

  const normalizadas = filas.map((f, index) => ({
    fila: index + 2,
    origen: String(f.Origen ?? '').trim(),
    destino: String(f.Destino ?? '').trim(),
    embarcador: String(f.Embarcador ?? '').trim(),
    flete20: normalizarNumero(f.Flete20_USD),
    flete40: normalizarNumero(f.Flete40_USD),
    transitoDias: normalizarNumero(f.Transito_Dias),
  }));

  const invalidas = normalizadas.filter((t) =>
    !t.origen || !t.destino || !t.embarcador ||
    !Number.isFinite(t.flete20) || t.flete20 <= 0 ||
    !Number.isFinite(t.flete40) || t.flete40 <= 0 ||
    !Number.isFinite(t.transitoDias) || t.transitoDias <= 0
  );

  if (invalidas.length > 0) {
    const detalle = invalidas.slice(0, 5).map((r) => `fila ${r.fila}`).join(', ');
    const err = new Error(`La planilla contiene filas inválidas (${detalle}${invalidas.length > 5 ? ', …' : ''}).`);
    err.status = 422;
    throw err;
  }

  const combinaciones = new Set();
  for (const row of normalizadas) {
    const key = `${row.origen.toLowerCase()}|${row.destino.toLowerCase()}|${row.embarcador.toLowerCase()}`;
    if (combinaciones.has(key)) {
      const err = new Error(`La planilla contiene una tarifa duplicada para ${row.origen} → ${row.destino} / ${row.embarcador}.`);
      err.status = 422;
      throw err;
    }
    combinaciones.add(key);
  }

  return normalizadas;
}

export async function importarPlanilla(buffer, originalname, uploadedBy) {
  const filas = leerFilasPlanilla(buffer);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  return withTransaction(async (client) => {
    const { rows: versionRows } = await client.query(`
      SELECT COALESCE(MAX(version), 0) + 1 AS next_version
      FROM tariff_imports
    `);
    const version = Number(versionRows[0].next_version);

    await client.query(`
      UPDATE tariff_imports
      SET status = 'ARCHIVED'
      WHERE status = 'ACTIVE'
    `);

    const { rows: importRows } = await client.query(`
      INSERT INTO tariff_imports (
        file_name,
        checksum_sha256,
        version,
        row_count,
        uploaded_by,
        status
      )
      VALUES ($1,$2,$3,$4,$5,'ACTIVE')
      RETURNING id, version, uploaded_at
    `, [originalname, checksum, version, filas.length, uploadedBy]);

    const tariffImport = importRows[0];

    for (const row of filas) {
      const { rows: originRows } = await client.query(`
        INSERT INTO ports (name, active)
        VALUES ($1, TRUE)
        ON CONFLICT (name) DO UPDATE SET active = TRUE
        RETURNING id
      `, [row.origen]);

      const { rows: destinationRows } = await client.query(`
        INSERT INTO ports (name, active)
        VALUES ($1, TRUE)
        ON CONFLICT (name) DO UPDATE SET active = TRUE
        RETURNING id
      `, [row.destino]);

      const { rows: carrierRows } = await client.query(`
        INSERT INTO carriers (name, active)
        VALUES ($1, TRUE)
        ON CONFLICT (name) DO UPDATE SET active = TRUE
        RETURNING id
      `, [row.embarcador]);

      const { rows: routeRows } = await client.query(`
        INSERT INTO routes (origin_port_id, destination_port_id, active)
        VALUES ($1,$2,TRUE)
        ON CONFLICT (origin_port_id, destination_port_id)
        DO UPDATE SET active = TRUE
        RETURNING id
      `, [originRows[0].id, destinationRows[0].id]);

      await client.query(`
        INSERT INTO tariffs (
          tariff_import_id,
          route_id,
          carrier_id,
          freight_20_usd,
          freight_40_usd,
          transit_days,
          currency,
          valid_from
        )
        VALUES ($1,$2,$3,$4,$5,$6,'USD',CURRENT_DATE)
      `, [
        tariffImport.id,
        routeRows[0].id,
        carrierRows[0].id,
        row.flete20,
        row.flete40,
        row.transitoDias,
      ]);
    }

    await client.query(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
      VALUES ($1, 'UPLOAD_TARIFFS', 'tariff_imports', $2, $3::jsonb)
    `, [uploadedBy, tariffImport.id, JSON.stringify({
      fileName: originalname,
      rows: filas.length,
      version,
      checksum,
    })]);

    return {
      id: tariffImport.id,
      version: tariffImport.version,
      uploadedAt: tariffImport.uploaded_at,
      rows: filas.length,
      checksum,
    };
  });
}
