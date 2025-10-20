## Dash (Railway Deploy)

### Requisitos locales
- Node 18+
- PowerShell (Windows) o bash (macOS/Linux)

### Desarrollo
1. Backend
   - `cd server`
   - `npm install`
   - Crear `.env` (copiar de `.env.example`) y completar credenciales `LINISCO_EMAIL_1..7` y `LINISCO_PASSWORD_1..7`.
   - `npm run dev` (inicia en :3000)
2. Frontend
   - `cd client`
   - `npm install`
   - `npm run dev` (abre :5173, proxy a :3000)

### Deploy en Railway
1. Crear nuevo proyecto y conectar este repo
2. Variables de entorno (Service):
   - `PORT=3000`
   - `SESSION_SECRET=<un-secreto>`
   - `SQLITE_PATH=/data/data.db` (usa almacenamiento persistente de Railway)
   - `LINISCO_BASE=http://pos.linisco.com.ar`
   - `LINISCO_LOGIN=https://pos.linisco.com.ar/users/sign_in`
   - `LINISCO_EMAIL_1..7`, `LINISCO_PASSWORD_1..7`
3. Volúmenes persistentes (opcional pero recomendado):
   - Montar `/data`
4. Build y Start
   - Railway usa `railway.toml`:
     - build: instala y compila `client`, instala `server` y copia build a `server/public`
     - start: `node server/index.js`

### Endpoints
- `POST /auth/login` body: `{ "user": "H4", "pass": "SRL" }`
- `POST /sync` body: `{ fromDate: "YYYY-MM-DD", toDate: "YYYY-MM-DD" }`
- `GET /stats/overview?fromDate&toDate&storeIds`
- `GET /stats/by-store?fromDate&toDate&storeIds`
- `GET /stats/daily?fromDate&toDate&storeIds`
- `GET /stats/top-products?fromDate&toDate&storeIds`


