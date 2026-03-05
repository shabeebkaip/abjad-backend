# API Testing Examples

Test the Users API endpoints using these curl commands or import into Postman/Insomnia.

## Base URL
- Local: `http://localhost:5000`
- Vercel: `https://your-app.vercel.app`

## Health Check
```bash
curl http://localhost:5000/health
```

## Users Endpoints

### 1. Create a User
```bash
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "teacher",
    "phoneNumber": "+1234567890"
  }'
```

### 2. Get All Users (with pagination)
```bash
curl "http://localhost:5000/api/users?page=1&limit=10"
```

### 3. Get All Users (with filters)
```bash
# Filter by role
curl "http://localhost:5000/api/users?role=teacher"

# Search by name or email
curl "http://localhost:5000/api/users?search=john"

# Filter by active status
curl "http://localhost:5000/api/users?isActive=true"

# Combined filters
curl "http://localhost:5000/api/users?page=1&limit=5&role=teacher&search=john&isActive=true"
```

### 4. Get User by ID
```bash
curl http://localhost:5000/api/users/USER_ID_HERE
```

### 5. Update User
```bash
curl -X PUT http://localhost:5000/api/users/USER_ID_HERE \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Updated",
    "phoneNumber": "+9876543210"
  }'
```

### 6. Verify Email
```bash
curl -X PATCH http://localhost:5000/api/users/USER_ID_HERE/verify-email
```

### 7. Toggle User Status
```bash
curl -X PATCH http://localhost:5000/api/users/USER_ID_HERE/toggle-status
```

### 8. Delete User
```bash
curl -X DELETE http://localhost:5000/api/users/USER_ID_HERE
```

## Expected Response Format

### Success Response
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "_id": "65f1a2b3c4d5e6f7g8h9i0j1",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "teacher",
    "phoneNumber": "+1234567890",
    "isEmailVerified": false,
    "isActive": true,
    "createdAt": "2026-03-06T02:00:00.000Z",
    "updatedAt": "2026-03-06T02:00:00.000Z"
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Email already exists"
  ]
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 50,
    "page": 1,
    "totalPages": 5
  }
}
```

## Testing in JavaScript/TypeScript

```javascript
// Create User
const response = await fetch('http://localhost:5000/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    password: 'password123',
    role: 'teacher',
  }),
});

const data = await response.json();
console.log(data);
```
