-- Esquema para MySQL 8 / MariaDB 10.5+
-- La base de datos (DB_NAME) debe existir:  CREATE DATABASE mantenimiento CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS ubicaciones (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL UNIQUE,
  descripcion VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  rol           ENUM('admin','tecnico','usuario') NOT NULL,
  telefono      VARCHAR(30),
  especialidad  VARCHAR(120),
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  creado_en     DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equipos (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  num_inventario   VARCHAR(60) NOT NULL UNIQUE,
  tipo             ENUM('pc','laptop','impresora','proyector','router','otro') NOT NULL,
  marca            VARCHAR(80) NOT NULL,
  modelo           VARCHAR(80) NOT NULL,
  num_serie        VARCHAR(80),
  responsable_id   INT NULL,
  ubicacion_id     INT NULL,
  estado           ENUM('operativo','en_reparacion','fuera_servicio','baja') NOT NULL DEFAULT 'operativo',
  especificaciones TEXT,
  fecha_adquisicion DATE NULL,
  intervalo_meses  INT NOT NULL DEFAULT 6,
  proxima_revision DATE NULL,
  creado_en        DATETIME NOT NULL,
  CONSTRAINT fk_eq_resp FOREIGN KEY (responsable_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_eq_ubic FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id) ON DELETE SET NULL,
  INDEX idx_equipos_revision (proxima_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS catalogo_actividades (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE,
  tipo   ENUM('preventivo','correctivo') NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS catalogo_fallas (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(120) NOT NULL UNIQUE,
  categoria ENUM('hardware','software','red','periferico','otro') NOT NULL,
  activo    TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS solicitudes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  equipo_id      INT NOT NULL,
  solicitante_id INT NOT NULL,
  tecnico_id     INT NULL,
  descripcion    TEXT NOT NULL,
  prioridad      ENUM('baja','media','alta') NOT NULL DEFAULT 'media',
  estado         ENUM('pendiente','en_proceso','atendida','rechazada') NOT NULL DEFAULT 'pendiente',
  fecha          DATE NOT NULL,
  comentario     TEXT,
  CONSTRAINT fk_sol_eq   FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE,
  CONSTRAINT fk_sol_user FOREIGN KEY (solicitante_id) REFERENCES usuarios(id),
  CONSTRAINT fk_sol_tec  FOREIGN KEY (tecnico_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_sol_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mantenimientos (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  equipo_id        INT NOT NULL,
  tecnico_id       INT NOT NULL,
  solicitud_id     INT NULL,
  tipo             ENUM('preventivo','correctivo') NOT NULL,
  fecha            DATE NOT NULL,
  falla_id         INT NULL,
  diagnostico      TEXT,
  observaciones    TEXT,
  costo_mano_obra  DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado_resultante ENUM('operativo','en_reparacion','fuera_servicio','baja') NOT NULL,
  proxima_revision DATE NULL,
  creado_en        DATETIME NOT NULL,
  CONSTRAINT fk_m_eq    FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE,
  CONSTRAINT fk_m_tec   FOREIGN KEY (tecnico_id) REFERENCES usuarios(id),
  CONSTRAINT fk_m_sol   FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE SET NULL,
  CONSTRAINT fk_m_falla FOREIGN KEY (falla_id) REFERENCES catalogo_fallas(id) ON DELETE SET NULL,
  INDEX idx_mant_equipo (equipo_id, fecha),
  INDEX idx_mant_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mantenimiento_actividades (
  mantenimiento_id INT NOT NULL,
  actividad_id     INT NOT NULL,
  PRIMARY KEY (mantenimiento_id, actividad_id),
  CONSTRAINT fk_ma_m FOREIGN KEY (mantenimiento_id) REFERENCES mantenimientos(id) ON DELETE CASCADE,
  CONSTRAINT fk_ma_a FOREIGN KEY (actividad_id) REFERENCES catalogo_actividades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS piezas_reemplazadas (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  mantenimiento_id INT NOT NULL,
  pieza            VARCHAR(120) NOT NULL,
  cantidad         INT NOT NULL DEFAULT 1,
  costo            DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_p_m FOREIGN KEY (mantenimiento_id) REFERENCES mantenimientos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
