import { query } from '../database/db.js';

export async function getTarifasActivasPorRuta(origen, destino) {
  const { rows } = await query(`
    SELECT
      t.id AS tarifa_id,
      c.id AS embarcador_id,
      c.name AS embarcador,
      po.name AS origen,
      pd.name AS destino,
      t.freight_20_usd,
      t.freight_40_usd,
      t.transit_days,
      t.currency,
      t.valid_from,
      t.valid_to,
      ti.id AS import_id,
      ti.version AS import_version
    FROM tariffs t
    INNER JOIN tariff_imports ti
      ON ti.id = t.tariff_import_id
     AND ti.status = 'ACTIVE'
    INNER JOIN routes r
      ON r.id = t.route_id
     AND r.active = TRUE
    INNER JOIN ports po
      ON po.id = r.origin_port_id
     AND po.active = TRUE
    INNER JOIN ports pd
      ON pd.id = r.destination_port_id
     AND pd.active = TRUE
    INNER JOIN carriers c
      ON c.id = t.carrier_id
     AND c.active = TRUE
    WHERE LOWER(po.name) = LOWER($1)
      AND LOWER(pd.name) = LOWER($2)
      AND t.valid_from <= CURRENT_DATE
      AND (t.valid_to IS NULL OR t.valid_to >= CURRENT_DATE)
    ORDER BY t.freight_40_usd ASC, c.name ASC
  `, [origen, destino]);

  return rows.map((row) => ({
    tarifaId: row.tarifa_id,
    embarcadorId: row.embarcador_id,
    embarcador: row.embarcador,
    origen: row.origen,
    destino: row.destino,
    flete20: Number(row.freight_20_usd),
    flete40: Number(row.freight_40_usd),
    transitoDias: Number(row.transit_days),
    currency: row.currency,
    importId: row.import_id,
    importVersion: row.import_version,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  }));
}

export async function getActiveTariffStats() {
  const { rows } = await query(`
    SELECT
      ti.id,
      ti.version,
      ti.file_name,
      ti.row_count,
      ti.uploaded_at,
      u.username AS uploaded_by
    FROM tariff_imports ti
    LEFT JOIN users u ON u.id = ti.uploaded_by
    WHERE ti.status = 'ACTIVE'
    LIMIT 1
  `);
  return rows[0] ?? null;
}
