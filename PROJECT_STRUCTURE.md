# Abjad Backend - Project Structure

## Folder Structure

```
src/
├── config/              # Configuration files
│   └── index.ts        # Centralized config
│
├── middlewares/         # Express middlewares
│   ├── errorHandler.ts # Global error handler
│   └── notFound.ts     # 404 handler
│
├── models/              # Mongoose models
│   └── user.model.ts   # User model
│
├── modules/             # Feature modules
│   └── users/          # Users module
│       ├── users.controller.ts   # Request handlers
│       ├── users.service.ts      # Business logic
│       ├── users.repository.ts   # Database operations
│       ├── users.routes.ts       # Route definitions
│       ├── users.types.ts        # TypeScript interfaces
│       └── users.validation.ts   # Request validation
│
├── routes/              # Route aggregator
│   └── index.ts        # Combines all module routes
│
├── app.ts              # Express app setup
└── server.ts           # Server entry point (Vercel-ready)

api/                     # Vercel serverless entry
└── index.ts            # Serverless handler
```

## Module Pattern

Each module follows this structure:

```
modules/
└── [module-name]/
    ├── [module].controller.ts   # HTTP request/response handling
    ├── [module].service.ts      # Business logic
    ├── [module].repository.ts   # Database queries
    ├── [module].routes.ts       # Route definitions
    ├── [module].types.ts        # TypeScript types/interfaces
    └── [module].validation.ts   # Request validation
```

## API Endpoints

### Users Module

- `POST /api/users` - Create a new user
- `GET /api/users` - Get all users (with pagination & filters)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `PATCH /api/users/:id/verify-email` - Verify email
- `PATCH /api/users/:id/toggle-status` - Toggle active status

### Query Parameters (GET /api/users)

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `role` - Filter by role (teacher, admin, student)
- `search` - Search by name or email
- `isActive` - Filter by active status (true/false)

## Example Request

```bash
# Create a user
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "teacher",
    "phoneNumber": "+1234567890"
  }'

# Get all users with filters
curl "http://localhost:5000/api/users?page=1&limit=10&role=teacher&search=john"
```

## Adding a New Module

1. Create folder: `src/modules/[module-name]/`
2. Create files:
   - `[module].types.ts` - Define interfaces
   - `[module].repository.ts` - Database operations
   - `[module].service.ts` - Business logic
   - `[module].controller.ts` - Request handlers
   - `[module].routes.ts` - Route definitions
   - `[module].validation.ts` - Validation rules
3. Create model: `src/models/[module].model.ts`
4. Register routes in `src/routes/index.ts`

## Deployment

Works seamlessly on Vercel and local development.
See `VERCEL_DEPLOYMENT.md` for deployment instructions.
