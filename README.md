## Payments Tracking Server (Express + MongoDB)

Layered structure with controllers, routes, models using MongoDB via Mongoose.

### Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
# edit .env if needed (PORT, MONGODB_URI)
```

Note: If your MongoDB password includes special characters like `@` or `#`, ensure they are URL-encoded (e.g., `@` → `%40`, `#` → `%23`). The provided example already encodes `AppDashboard@4#` as `AppDashboard%404%23`.

3. Start the server:

```bash
npm start
```

Server runs on `http://localhost:3000` by default.

### Endpoints

- `GET /health` → `{ status: 'ok' }`

- `POST /coinCollect`
  - Body (JSON): `uuid`, `appId`, `ptStatus`, `collectionId`, `ant` (all strings)
  - Upserts a payment by `uuid`.

- `GET /coinCollect?appId=APP_ID`
  - If `appId` provided, returns all payments for that `appId`; otherwise returns all.

- `GET /coinCollect/:uuid`
  - Returns a single payment by `uuid`.

**Apps Management (CRUD):**

- `POST /apps`
  - Body (JSON): `appName` (string), `appLogoUrl` (string)
  - Creates a new app with auto-generated 5-digit unique `appId` (10000-99999).
  - Returns: `{ success: true, data: app }`

- `GET /apps`
  - Returns all apps: `{ count: number, data: apps[] }`

- `GET /apps/:appId`
  - Returns a single app by `appId`.

- `PUT /apps/:appId`
  - Body (JSON): `appName` (string, optional), `appLogoUrl` (string, optional)
  - Updates an app by `appId`. At least one field must be provided.

- `DELETE /apps/:appId`
  - Deletes an app by `appId`.
  - Returns: `{ success: true, message: 'App deleted successfully', data: app }`

### Project Structure

```
src/
  app.js
  index.js
  config/
    db.js
  controllers/
    paymentController.js
    appController.js
  models/
    Payment.js
    App.js
  routes/
    paymentRoutes.js
    appRoutes.js
```

## Deploy to Render (CLI)

Prereqs: Install the Render CLI and log in.

```bash
npm i -g render-cli
render login
```

This repo includes a `render.yaml` blueprint. It defines a Node web service that runs `npm start` and exposes `/health`.

1) Create the service from the blueprint (first time):

```bash
render blueprint create --from-file render.yaml
```

2) Set environment variables in Render (replace with your actual URI, URL-encoded where needed):

```bash
render env set MONGODB_URI "mongodb+srv://skgt:AppDashboard%404%23@dashboard.xhbjoyk.mongodb.net/?appName=dashboard" \
  --service apps-admin-coincollect-api
```

3) Trigger a deploy when you push changes or manually via CLI:

```bash
render deploy --service apps-admin-coincollect-api
```

Notes:
- `render.yaml` has `plan: free`. Adjust as needed.
- `PORT` is respected by the server; health check is `/health`.
- You can also connect the repo in Render’s dashboard and it will auto-deploy on pushes to `main`.



