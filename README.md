## Admin Dashboard API Server (Express + MongoDB)

Complete admin panel backend with authentication, role-based access, dashboard analytics, and PDF reports.

### Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
# Add JWT_SECRET for authentication
```

Required environment variables:
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens (add to .env)
- `PORT` - Server port (default: 3000)

Note: If your MongoDB password includes special characters like `@` or `#`, ensure they are URL-encoded (e.g., `@` → `%40`, `#` → `%23`).

3. Start the server:

```bash
npm start
```

Server runs on `http://localhost:3000` by default.

### Authentication

All protected routes require JWT token in header:
```
Authorization: Bearer <token>
```
or
```
x-auth-token: <token>
```

### API Endpoints

#### Authentication (Public)

- `POST /auth/login`
  - Body: `{ username, password }` or `{ email, password }`
  - Returns: `{ success, token, user }`

- `GET /auth/me` (Protected)
  - Returns current user info

#### Apps Management (Protected - All authenticated users)

- `POST /apps`
  - Body: `{ appName, appLogoUrl }`
  - Creates app with auto-generated 5-digit unique `appId`

- `GET /apps`
  - Returns all apps user has access to

- `GET /apps/:appId`
  - Returns single app

- `PUT /apps/:appId`
  - Body: `{ appName?, appLogoUrl? }`
  - Updates app

- `DELETE /apps/:appId`
  - Deletes app

#### User Management (Protected - Admin only)

- `POST /users`
  - Body: `{ username, email, password, role: 'admin'|'child_admin', appIds?: [] }`
  - Creates user (admin can assign apps to child_admin)

- `GET /users`
  - Lists all users (admin only)

- `GET /users/:userId`
  - Get user details with app access

- `PUT /users/:userId`
  - Body: `{ username?, email?, role?, isActive?, appIds? }`
  - Update user

- `DELETE /users/:userId`
  - Delete user

- `PUT /users/:userId/assign-apps` (Admin only)
  - Body: `{ appIds: [] }`
  - Assign apps to child_admin

#### Payments (Partially Protected)

- `POST /coinCollect` (Public - for webhooks)
  - Body: `{ uuid, appId, ptStatus: 'success'|'failed'|'retry', collectionId, ant, amount?, upiId?, transactionDate? }`
  - Upserts payment

- `GET /coinCollect?appId=APP_ID` (Protected)
  - Lists payments (filtered by appId if provided)

- `GET /coinCollect/:uuid` (Protected)
  - Get payment by UUID

#### Dashboard (Protected)

- `GET /dashboard/overview?appId=&filter=&startDate=&endDate=`
  - Filter options: `all_time`, `yesterday`, `last_7_days`, `this_month`, `date_range`
  - Returns:
    ```json
    {
      "totalTransactions": 100,
      "totalAmount": 50000,
      "totalAmountReceived": 45000,
      "successCount": 90,
      "failedCount": 5,
      "retryCount": 5,
      "charts": {
        "dailySales": [{ "date": "2025-10-31", "transactions": 10, "amount": 5000 }],
        "statusDistribution": [{ "status": "success", "count": 90 }]
      }
    }
    ```

- `GET /dashboard/transactions?appId=&filter=&status=&page=&limit=`
  - Get paginated transaction list
  - Returns: `{ count, total, page, totalPages, data }`
  - Each transaction includes: `uuid, appId, ptStatus, amount, upiId, transactionDate`

- `GET /dashboard/daily-sales?date=YYYY-MM-DD&appId=`
  - Get daily sales with spend data
  - Returns sales per app with ROI and settlement info

#### Spend Management (Protected)

- `POST /spends`
  - Body: `{ appId, date, spendAmount, roi?, settlement?: 'yes'|'no', notes? }`
  - Create/update daily spend

- `GET /spends?appId=&filter=last_7_days|date_range&startDate=&endDate=`
  - Get spends with filters

- `DELETE /spends/:spendId`
  - Delete spend

#### PDF Reports (Protected)

- `GET /pdf/payments?appId=&filter=&startDate=&endDate=`
  - Generates PDF report of payments overview
  - Downloadable PDF file

### Roles

- **Admin**: Full access to all apps and users
- **Child Admin**: Limited access to assigned apps only

### Filters

- `all_time` - All records
- `yesterday` - Previous day
- `last_7_days` - Last 7 days
- `this_month` - Current month
- `date_range` - Custom range (requires `startDate` and `endDate` in YYYY-MM-DD format)

### Project Structure

```
src/
  app.js
  index.js
  config/
    db.js
  middleware/
    auth.js
  controllers/
    authController.js
    userController.js
    appController.js
    paymentController.js
    dashboardController.js
    spendController.js
    pdfController.js
  models/
    User.js
    UserAppAccess.js
    App.js
    Payment.js
    Spend.js
  routes/
    authRoutes.js
    userRoutes.js
    appRoutes.js
    paymentRoutes.js
    dashboardRoutes.js
    spendRoutes.js
    pdfRoutes.js
```

## Deploy to Render (CLI)

Prereqs: Install the Render CLI and log in.

```bash
brew install render
render login
```

This repo includes a `render.yaml` blueprint. It defines a Node web service that runs `npm start` and exposes `/health`.

1) Create the service from the blueprint (first time):

```bash
render blueprint create --from-file render.yaml
```

2) Set environment variables in Render:

```bash
render env set MONGODB_URI "mongodb+srv://..." --service apps-admin-coincollect-api
render env set JWT_SECRET "your-secret-key" --service apps-admin-coincollect-api
```

3) Trigger a deploy:

```bash
render deploy --service apps-admin-coincollect-api
```

Notes:
- `render.yaml` has `plan: free`. Adjust as needed.
- `PORT` is respected by the server; health check is `/health`.
- You can also connect the repo in Render's dashboard and it will auto-deploy on pushes to `main`.
