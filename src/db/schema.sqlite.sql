-- Esquema para SQLite (desarrollo / instalación sin servidor de BD)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ubicaciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL UNIQUE,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('admin','tecnico','usuario')),
  telefono      TEXT,
  especialidad  TEXT,
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  num_inventario   TEXT NOT NULL UNIQUE,
  tipo             TEXT NOT NULL CHECK (tipo IN ('pc','laptop','impresora','proyector','router','otro')),
  marca            TEXT NOT NULL,
  modelo           TEXT NOT NULL,
  num_serie        TEXT,
  responsable_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ubicacion_id     INTEGER REFERENCES ubicaciones(id) ON DELETE SET NULL,
  estado           TEXT NOT NULL DEFAULT 'operativo'
                   CHECK (estado IN ('operativo','en_reparacion','fuera_servicio','baja')),
  especificaciones TEXT,
  fecha_adquisicion TEXT,
  intervalo_meses  INTEGER NOT NULL DEFAULT 6,
  proxima_revision TEXT,
  creado_en        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalogo_actividades (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  tipo   TEXT NOT NULL CHECK (tipo IN ('preventivo','correctivo')),
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS catalogo_fallas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre    TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL CHECK (categoria IN ('hardware','software','red','periferico','otro')),
  activo    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS solicitudes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id      INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
  tecnico_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  descripcion    TEXT NOT NULL,
  prioridad      TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta')),
  estado         TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','en_proceso','atendida','rechazada')),
  fecha          TEXT NOT NULL,
  comentario     TEXT
);

CREATE TABLE IF NOT EXISTS mantenimientos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id        INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  tecnico_id       INTEGER NOT NULL REFERENCES usuarios(id),
  solicitud_id     INTEGER REFERENCES solicitudes(id) ON DELETE SET NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('preventivo','correctivo')),
  fecha            TEXT NOT NULL,
  falla_id         INTEGER REFERENCES catalogo_fallas(id) ON DELETE SET NULL,
  diagnostico      TEXT,
  observaciones    TEXT,
  costo_mano_obra  REAL NOT NULL DEFAULT 0,
  estado_resultante TEXT NOT NULL
                   CHECK (estado_resultante IN ('operativo','en_reparacion','fuera_servicio','baja')),
  proxima_revision TEXT,
  creado_en        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mantenimiento_actividades (
  mantenimiento_id INTEGER NOT NULL REFERENCES mantenimientos(id) ON DELETE CASCADE,
  actividad_id     INTEGER NOT NULL REFERENCES catalogo_actividades(id),
  PRIMARY KEY (mantenimiento_id, actividad_id)
);

CREATE TABLE IF NOT EXISTS piezas_reemplazadas (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  mantenimiento_id INTEGER NOT NULL REFERENCES mantenimientos(id) ON DELETE CASCADE,
  pieza            TEXT NOT NULL,
  cantidad         INTEGER NOT NULL DEFAULT 1,
  costo            REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_equipos_revision ON equipos(proxima_revision);
CREATE INDEX IF NOT EXISTS idx_mant_equipo ON mantenimientos(equipo_id, fecha);
CREATE INDEX IF NOT EXISTS idx_mant_fecha ON mantenimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_sol_estado ON solicitudes(estado);
