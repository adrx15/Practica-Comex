-- Esquema PostgreSQL para CINTAC Comex.
-- Puede ejecutarse directamente en pgAdmin/psql.
-- Las migraciones oficiales viven en ../migrations/.

CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'ANALISTA',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_username_nonempty CHECK (LENGTH(TRIM(username)) > 0),
  CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'ANALISTA'))
);
CREATE UNIQUE INDEX users_username_lower_unique ON users (LOWER(username));

CREATE TABLE ports (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  country VARCHAR(100),
  code VARCHAR(20),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ports_name_nonempty CHECK (LENGTH(TRIM(name)) > 0)
);
CREATE UNIQUE INDEX ports_name_lower_unique ON ports (LOWER(name));

CREATE TABLE carriers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT carriers_name_nonempty CHECK (LENGTH(TRIM(name)) > 0)
);
CREATE UNIQUE INDEX carriers_name_lower_unique ON carriers (LOWER(name));

CREATE TABLE routes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  origin_port_id INTEGER NOT NULL REFERENCES ports(id) ON DELETE RESTRICT,
  destination_port_id INTEGER NOT NULL REFERENCES ports(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT routes_origin_destination_different CHECK (origin_port_id <> destination_port_id),
  CONSTRAINT routes_unique_origin_destination UNIQUE (origin_port_id, destination_port_id)
);

CREATE TABLE tariff_imports (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  checksum_sha256 CHAR(64),
  version INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tariff_imports_version_positive CHECK (version > 0),
  CONSTRAINT tariff_imports_row_count_nonnegative CHECK (row_count >= 0),
  CONSTRAINT tariff_imports_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  CONSTRAINT tariff_imports_checksum_format CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  CONSTRAINT tariff_imports_version_unique UNIQUE (version)
);
CREATE UNIQUE INDEX tariff_imports_one_active_unique ON tariff_imports ((status)) WHERE status = 'ACTIVE';

CREATE TABLE tariffs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tariff_import_id INTEGER NOT NULL REFERENCES tariff_imports(id) ON DELETE RESTRICT,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
  carrier_id INTEGER NOT NULL REFERENCES carriers(id) ON DELETE RESTRICT,
  freight_20_usd NUMERIC(12,2) NOT NULL,
  freight_40_usd NUMERIC(12,2) NOT NULL,
  transit_days INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tariffs_positive_20 CHECK (freight_20_usd > 0),
  CONSTRAINT tariffs_positive_40 CHECK (freight_40_usd > 0),
  CONSTRAINT tariffs_positive_transit CHECK (transit_days > 0),
  CONSTRAINT tariffs_validity CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT tariffs_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT tariffs_import_route_carrier_unique UNIQUE (tariff_import_id, route_id, carrier_id)
);
CREATE INDEX tariffs_active_route_idx ON tariffs (tariff_import_id, route_id, carrier_id);
CREATE INDEX tariffs_carrier_idx ON tariffs (carrier_id);

CREATE TABLE quotes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  origin_port_id INTEGER NOT NULL REFERENCES ports(id) ON DELETE RESTRICT,
  destination_port_id INTEGER NOT NULL REFERENCES ports(id) ON DELETE RESTRICT,
  container_type VARCHAR(2) NOT NULL,
  weight_kg NUMERIC(12,3) NOT NULL,
  weight_tons NUMERIC(12,3) NOT NULL,
  containers_required INTEGER NOT NULL,
  contingency_days INTEGER NOT NULL DEFAULT 0,
  tariff_import_id INTEGER REFERENCES tariff_imports(id) ON DELETE RESTRICT,
  calculation_tax_rate NUMERIC(6,5) NOT NULL DEFAULT 0.19,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotes_container_type_check CHECK (container_type IN ('20', '40')),
  CONSTRAINT quotes_weight_positive CHECK (weight_kg > 0 AND weight_tons > 0),
  CONSTRAINT quotes_containers_check CHECK (containers_required BETWEEN 1 AND 10),
  CONSTRAINT quotes_contingency_check CHECK (contingency_days BETWEEN 0 AND 60),
  CONSTRAINT quotes_tax_rate_check CHECK (calculation_tax_rate >= 0 AND calculation_tax_rate <= 1)
);
CREATE INDEX quotes_user_created_idx ON quotes (user_id, created_at DESC);

CREATE TABLE quote_options (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  tariff_id INTEGER NOT NULL REFERENCES tariffs(id) ON DELETE RESTRICT,
  carrier_id INTEGER NOT NULL REFERENCES carriers(id) ON DELETE RESTRICT,
  unit_freight_usd NUMERIC(12,2) NOT NULL,
  total_freight_usd NUMERIC(14,2) NOT NULL,
  tax_cif_usd NUMERIC(14,2) NOT NULL,
  total_usd NUMERIC(14,2) NOT NULL,
  base_transit_days INTEGER NOT NULL,
  total_days INTEGER NOT NULL,
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  tariff_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quote_options_freight_nonnegative CHECK (unit_freight_usd >= 0 AND total_freight_usd >= 0),
  CONSTRAINT quote_options_tax_nonnegative CHECK (tax_cif_usd >= 0 AND total_usd >= 0),
  CONSTRAINT quote_options_days_positive CHECK (base_transit_days > 0 AND total_days >= base_transit_days)
);
CREATE UNIQUE INDEX quote_options_one_recommended ON quote_options (quote_id) WHERE is_recommended = TRUE;
CREATE INDEX quote_options_quote_idx ON quote_options (quote_id, total_usd);

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(60),
  entity_id BIGINT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER ports_set_updated_at BEFORE UPDATE ON ports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER carriers_set_updated_at BEFORE UPDATE ON carriers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER routes_set_updated_at BEFORE UPDATE ON routes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE VIEW v_active_tariffs AS
SELECT
  t.id AS tariff_id,
  ti.id AS tariff_import_id,
  ti.version AS tariff_version,
  po.name AS origin,
  pd.name AS destination,
  c.name AS carrier,
  t.freight_20_usd,
  t.freight_40_usd,
  t.transit_days,
  t.currency,
  t.valid_from,
  t.valid_to
FROM tariffs t
INNER JOIN tariff_imports ti ON ti.id = t.tariff_import_id AND ti.status = 'ACTIVE'
INNER JOIN routes r ON r.id = t.route_id AND r.active = TRUE
INNER JOIN ports po ON po.id = r.origin_port_id AND po.active = TRUE
INNER JOIN ports pd ON pd.id = r.destination_port_id AND pd.active = TRUE
INNER JOIN carriers c ON c.id = t.carrier_id AND c.active = TRUE;
