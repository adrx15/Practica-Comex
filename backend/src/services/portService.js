import { query } from '../database/db.js';

export async function getPuertos() {
  const { rows } = await query(`
    SELECT
      ARRAY_AGG(DISTINCT po.name ORDER BY po.name) AS origenes,
      ARRAY_AGG(DISTINCT pd.name ORDER BY pd.name) AS destinos
    FROM tariffs t
    INNER JOIN tariff_imports ti ON ti.id = t.tariff_import_id AND ti.status = 'ACTIVE'
    INNER JOIN routes r ON r.id = t.route_id AND r.active = TRUE
    INNER JOIN ports po ON po.id = r.origin_port_id AND po.active = TRUE
    INNER JOIN ports pd ON pd.id = r.destination_port_id AND pd.active = TRUE
  `);

  return {
    origenes: rows[0]?.origenes ?? [],
    destinos: rows[0]?.destinos ?? [],
  };
}
