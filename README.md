# Sistema de Mantenimiento de Equipos de Cómputo

Aplicación web para registrar, controlar y dar seguimiento al mantenimiento **preventivo** y **correctivo** de computadoras y periféricos básicos (impresoras, proyectores, routers).

Proyecto de *Administración de Proyectos*, ITIC, Instituto Tecnológico de Apizaco.

## Módulos

| Módulo | Qué hace | Requisito / actividad |
|---|---|---|
| **Equipos** | Alta, edición y consulta: inventario, tipo, marca, modelo, serie, responsable, ubicación, estado, especificaciones e intervalo de revisión | Módulo de equipos (A8) |
| **Mantenimientos** | Registro de actividades realizadas, falla atendida, diagnóstico, piezas reemplazadas, costos, técnico, estado resultante y próxima revisión | Módulo de mantenimiento (A9) |
| **Historial** | Ficha de cada equipo con su línea de tiempo de mantenimientos, fallas, costos y solicitudes | Módulo de historial |
| **Agenda** | Calendario mensual de revisiones preventivas programadas | Programar mantenimiento preventivo |
| **Solicitudes** | El usuario responsable reporta fallas; el técnico las toma, las atiende con un mantenimiento o las rechaza | Involucrar al usuario responsable |
| **Reportes** | Equipos que necesitan mantenimiento, fallas más comunes y trabajos realizados, con gráficas, exportación CSV e impresión o PDF | Módulo de reportes (A11) |
| **Técnicos** | Datos de contacto y carga de trabajo de cada técnico | Módulo de técnicos (A10) |
| **Usuarios y catálogos** | Cuentas y roles, ubicaciones, catálogo de actividades y catálogo de fallas | Módulo de usuarios (A7) |

### Roles

- **Administrador**: acceso total, incluida la administración de usuarios y catálogos.
- **Técnico**: registra equipos y mantenimientos, atiende solicitudes y consulta reportes. Solo puede editar sus propios registros de mantenimiento.
- **Usuario responsable**: ve los equipos a su cargo y su historial, y reporta fallas.

## Tecnologías (todas de código abierto)

- **Backend:** Node.js 22.5 o superior y Express, con una API REST.
- **Base de datos relacional:** SQLite (integrado en Node, sin instalación) o **MySQL / MariaDB**.
- **Frontend:** HTML, CSS y JavaScript sin frameworks, con Tailwind CSS compilado, Chart.js y Font Awesome. Todo se sirve localmente, sin CDN, para que funcione en una intranet sin internet.
- **Seguridad:** contraseñas con bcrypt, sesiones con cookie `httpOnly`, permisos por rol en el servidor, límite de intentos de acceso, escape automático de HTML (XSS), protección CSRF y cabeceras CSP.

## Instalación y ejecución

```bash
npm install
npm start            # http://localhost:3000
```

Al iniciar por primera vez se crea la base de datos con los catálogos y, si `SEED_DEMO` no es `false`, con datos de ejemplo.

| Cuenta | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@mantenimiento.local` | `admin123` |
| Técnico (demo) | `carlos@mantenimiento.local` | `demo1234` |
| Técnica (demo) | `ana@mantenimiento.local` | `demo1234` |
| Usuario responsable (demo) | `maria@mantenimiento.local` | `demo1234` |

> Cambia la contraseña del administrador desde **Mi perfil** antes de usar el sistema en serio.

### Comandos

| Comando | Descripción |
|---|---|
| `npm start` | Inicia el servidor |
| `npm run dev` | Inicia el servidor y lo reinicia al cambiar archivos |
| `npm run db:reset` | Borra la base de datos y la recrea con datos de ejemplo |
| `npm run db:init` | Crea las tablas que falten (sin datos demo) |
| `npm run build:css` | Recompila `public/css/app.css` (necesario si cambias clases de Tailwind) |
| `npm run watch:css` | Recompila el CSS automáticamente mientras desarrollas |
| `npm test` | Ejecuta las pruebas de la API en una base de datos temporal |

### Usar MySQL o MariaDB

1. Crea la base de datos y un usuario:
   ```sql
   CREATE DATABASE mantenimiento CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'mantenimiento'@'localhost' IDENTIFIED BY 'una-contraseña';
   GRANT ALL ON mantenimiento.* TO 'mantenimiento'@'localhost';
   ```
2. Copia `.env.example` como `.env` y configura `DB_CLIENT=mysql` con los datos de conexión.
3. Ejecuta `npm start`. Las tablas se crean solas (el esquema está en `src/db/schema.mysql.sql`).

### Producción en la intranet

- Define `NODE_ENV=production` y un `SESSION_SECRET` largo y aleatorio.
- Si se sirve por HTTP sin HTTPS, define también `COOKIE_SECURE=false`.
- Para que el proceso siga corriendo, usa un gestor como `pm2` o un servicio de systemd o Windows.
- Las sesiones se guardan en memoria: al reiniciar el servidor, los usuarios vuelven a iniciar sesión.

## Estructura

```
server.js                 Punto de entrada
src/
  app.js                  Configuración de Express (seguridad, sesiones, rutas)
  config.js               Variables de entorno
  utils.js                Fechas, validación, CSV, errores
  db/
    index.js              Adaptador SQLite / MySQL (misma interfaz)
    init.js               Creación del esquema y datos iniciales y de ejemplo
    schema.sqlite.sql     Esquema para SQLite
    schema.mysql.sql      Esquema para MySQL / MariaDB
  middleware/auth.js      Sesión, roles y protección CSRF
  routes/                 API REST: auth, usuarios, catalogos, equipos, mantenimientos, solicitudes, reportes
  styles/input.css        Fuente de Tailwind
public/
  index.html              Página única (SPA)
  css/app.css             CSS compilado
  js/main.js              Enrutador y layout
  js/api.js, js/ui.js     Cliente de la API y utilidades de interfaz
  js/views/               Pantallas
test/api.test.js          Pruebas de la API (node:test)
```

## Modelo de datos

```
usuarios ─┬─< equipos (responsable) >── ubicaciones
          ├─< mantenimientos (técnico) >── equipos
          └─< solicitudes (solicitante / técnico) >── equipos
mantenimientos ─< mantenimiento_actividades >── catalogo_actividades
mantenimientos ─< piezas_reemplazadas
mantenimientos >── catalogo_fallas
mantenimientos >── solicitudes (opcional)
```

**Regla clave:** el *estado* y la *próxima revisión* de un equipo se toman de su mantenimiento **más reciente**. Registrar un mantenimiento atrasado no sobrescribe el estado actual, y al borrar o editar un registro el equipo se recalcula.

## API (resumen)

Todas las rutas están bajo `/api` y, salvo el login, requieren sesión.

| Método y ruta | Descripción |
|---|---|
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/password` | Sesión |
| `GET/POST /equipos`, `GET/PUT/DELETE /equipos/:id` | Equipos. Filtros: `q`, `tipo`, `estado`, `ubicacion_id`, `revision=vencida\|proxima\|sin`, `formato=csv` |
| `GET/POST /mantenimientos`, `GET/PUT/DELETE /mantenimientos/:id` | Mantenimientos. Filtros: `equipo_id`, `tecnico_id`, `tipo`, `desde`, `hasta`, `formato=csv` |
| `GET/POST /solicitudes`, `PUT /solicitudes/:id` | Solicitudes de servicio |
| `GET /reportes/dashboard`, `/pendientes`, `/fallas`, `/trabajos` | Reportes (con `formato=csv` donde aplica) |
| `GET/POST/PUT /usuarios`, `GET /usuarios/tecnicos`, `GET /usuarios/opciones` | Usuarios y técnicos |
| `GET/POST/PUT/DELETE /catalogos/{ubicaciones,actividades,fallas}` | Catálogos |
