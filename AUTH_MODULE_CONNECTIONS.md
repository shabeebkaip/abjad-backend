# Auth Module - Complete Connection Guide

## 📊 Module Architecture (Layered)

```
┌─────────────────────────────────────────────┐
│         POSTMAN (Client)                    │
│  Sends HTTP Request                         │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│       routes.ts (Router Layer)              │
│  - Maps URL to controller method            │
│  - Applies middleware (validation, rate-    │
│    limiting, auth checks)                   │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│    validation.ts (Validation Layer)         │
│  - Checks if data is valid                  │
│  - Uses Zod to validate input               │
│  - Rejects bad data before proceeding       │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│    controller.ts (HTTP Handler Layer)       │
│  - Receives request from routes             │
│  - Calls service with data                  │
│  - Formats response as JSON                 │
│  - Handles errors                           │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│    service.ts (Business Logic Layer)        │
│  - Core authentication logic                │
│  - Calls repository for DB queries          │
│  - Calls utilities (OTP, JWT, etc)          │
│  - Returns data to controller               │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│    repository.ts (Data Access Layer)        │
│  - All database queries                     │
│  - Talks to User, OTP, Session models       │
│  - Returns data to service                  │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│      MongoDB (Database)                     │
│  - Stores users, OTP codes, sessions        │
└─────────────────────────────────────────────┘
```

---

## 🔄 How They Connect (Step by Step)

### **Example: Signup Verification Flow**

You send this to Postman:
```json
POST /api/auth/verify-otp
{
  "phone": "+966501234567",
  "code": "123456",
  "purpose": "signup",
  "email": "test@gmail.com"
}
```

### **Step 1: Server Receives Request**
```
Request arrives at Express app.ts
↓
Routes look for matching pattern
↓
Finds: POST /verify-otp
```

### **Step 2: routes.ts - ROUTER LAYER**
```typescript
router.post('/verify-otp', otpLimiter, validateVerifyOtp, authController.verifyOtp);
```

**What happens:**
- `otpLimiter` middleware checks rate limiting (max 5 requests per 10 min)
- `validateVerifyOtp` middleware validates the data
- If valid → calls `authController.verifyOtp()`
- If invalid → returns 400 error (never reaches controller)

---

### **Step 3: validation.ts - VALIDATION LAYER**
```typescript
export const verifyOtpSchema = z.object({
  phone: phoneSchema,  // Must match +966XXXXXXXXX
  code: z.string().length(6, 'OTP must be 6 digits'),
  purpose: z.enum(['signup', 'login', 'reset']),
});

export const validateVerifyOtp = validate(verifyOtpSchema);
```

**Checks:**
- ✅ Phone is Saudi format? (+966...)
- ✅ Code is exactly 6 digits?
- ✅ Purpose is signup/login/reset?

**If any check fails:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": ["Invalid phone format"]
}
```

**If all valid:** Continues to controller

---

### **Step 4: controller.ts - HTTP HANDLER LAYER**
```typescript
async verifyOtp(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Extract device info from request
    const deviceInfo = {
      userAgent: req.get('user-agent'),
      ip: req.ip,
    };

    // 2. Prepare data object
    const data: VerifyOtpDTO = {
      phone: req.body.phone,
      code: req.body.code,
      purpose: req.body.purpose,
      deviceInfo,
    };

    // 3. Call service (THIS IS WHERE THE WORK HAPPENS)
    const [authResponse, refreshToken] = await authService.verifyOtp(data);

    // 4. Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // 5. Send response back to client
    res.status(200).json({
      success: true,
      message: 'Account created and verified successfully',
      data: {
        accessToken: authResponse.tokens.accessToken,
        user: authResponse.user,
        isNewUser: true,
      }
    });
  } catch (error) {
    next(error); // Pass error to error handler middleware
  }
}
```

**Key points:**
- Doesn't do business logic (just calls service)
- Formats the response nicely for client
- Sets cookies
- Catches errors and passes to error handler

---

### **Step 5: service.ts - BUSINESS LOGIC LAYER**

This is where ALL the real work happens!

```typescript
async verifyOtp(dto: VerifyOtpDTO): Promise<[AuthResponseDTO, string]> {
  const { phone, code, purpose, deviceInfo } = dto;

  // 1. Check if account is locked
  let user = await authRepository.findUserByPhone(phone);
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw AppError.tooManyRequests('Account locked...');
  }
  // Calls REPOSITORY to check user in DB

  // 2. Find OTP record
  const otpRecord = await authRepository.findOtp(phone, purpose);
  if (!otpRecord) {
    throw AppError.notFound(`No OTP found...`);
  }
  // Calls REPOSITORY to get OTP from DB

  // 3. Check max attempts
  if (otpRecord.attempts >= config.otp.maxAttempts) {
    await authRepository.lockAccount(phone, lockUntil);
    throw AppError.tooManyRequests('Too many attempts...');
  }

  // 4. Verify OTP hash
  const valid = await verifyOtpHash(code, otpRecord.code);
  // Calls UTILITY to verify OTP
  if (!valid) {
    await authRepository.incrementOtpAttempts(otpRecord._id);
    throw AppError.unauthorized('Invalid OTP...');
  }

  // 5. Delete used OTP
  await authRepository.deleteOtp(phone, purpose);
  // Calls REPOSITORY

  // 6. Find or CREATE user
  const isNewUser = !user;
  if (!user) {
    user = await authRepository.createUser({
      phone,
      role: 'teacher',
    });
    // Calls REPOSITORY to create user in DB
  }

  // 7. Reset login attempts
  await authRepository.resetFailedLogins(phone);

  // 8. Issue tokens
  const payload = {
    userId: user._id.toString(),
    role: user.role,
    phone,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  // Calls UTILITY to create JWT tokens

  // 9. Save session to DB
  await authRepository.createSession({
    userId: user._id.toString(),
    refreshTokenHash: hashToken(refreshToken),
    deviceInfo,
    ipAddress: deviceInfo?.ip,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  // Calls REPOSITORY to save session

  // 10. Return data to controller
  return [
    {
      user: mapToAuthUserDTO(user),
      tokens: {
        accessToken,
        expiresIn: 900, // 15 min
      },
      isNewUser,
      nextStep: isNewUser ? 'complete-profile' : undefined,
    },
    refreshToken,
  ];
}
```

**What it does:**
- Controls the whole signup verification flow
- Calls repository for DB operations
- Calls utilities for hashing, JWT, OTP verification
- Makes decisions (is user new? lock account?)
- Throws errors if something goes wrong

---

### **Step 6: repository.ts - DATA ACCESS LAYER**

When service calls `authRepository.createUser()`:

```typescript
async createUser(data: {
  phone: string;
  role: 'teacher' | 'school' | 'admin';
  language?: string;
}) {
  // Create user object with defaults
  const user = new User({
    phone: data.phone,
    role: data.role || 'teacher',
    language: data.language || 'ar',
    status: 'active',
    isPhoneVerified: true,
    isEmailVerified: false,
    isProfileComplete: false,
    profileStep: 'basic',
    failedLoginAttempts: 0,
    loginCount: 0,
    pushNotificationsEnabled: true,
    emailNotificationsEnabled: true,
    deviceTokens: [],
  });

  // Save to MongoDB
  await user.save();
  
  // Return created user
  return user;
}
```

**What it does:**
- Runs database queries
- Uses MongoDB models (User, OtpCode, Session)
- Saves/reads/updates/deletes data
- Returns data to service

---

### **Step 7: MongoDB - DATABASE**

Actually stores the data:
```
Users Collection:
{
  _id: ObjectId,
  phone: "+966501234567",
  role: "teacher",
  status: "active",
  isPhoneVerified: true,
  ...
}
```

---

### **Step 8: Response Goes Back**

Service returns to controller:
```
authService.verifyOtp() → [authResponse, refreshToken]
```

Controller sends to client:
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "_id": "123456",
      "phone": "+966501234567",
      "role": "teacher"
    },
    "isNewUser": true,
    "nextStep": "complete-profile"
  }
}
```

And you see it in Postman! ✅

---

## 📞 How Files Call Each Other

```
routes.ts
  ↓ imports
  ├─ controller.ts
  ├─ validation.ts (middleware)
  └─ middlewares/rateLimiter (middleware)

controller.ts
  ↓ imports
  ├─ service.ts
  ├─ types.ts (interfaces)
  └─ config (settings)

service.ts
  ↓ imports
  ├─ repository.ts (calls for DB queries)
  ├─ types.ts (interfaces)
  ├─ utils/otp.util (generates OTP)
  ├─ utils/jwt.util (creates tokens)
  ├─ utils/otp-sender.util (sends SMS)
  └─ utils/app-error.util (throws errors)

repository.ts
  ↓ imports
  ├─ models/user.model (User schema)
  ├─ models/otp-code.model (OTP schema)
  └─ models/session.model (Session schema)

validation.ts
  ↓ imports
  ├─ zod (validation library)
  └─ utils/validate.util (validator middleware)

types.ts
  └─ Just interfaces (no imports)
```

---

## 🎯 The Complete Request Journey

```
1. You send POST /verify-otp from Postman
   ↓
2. Routes catches it, runs rateLimiter middleware
   ↓
3. Routes runs validateVerifyOtp middleware
   ↓ (if validation fails, return error here)
   ↓
4. Routes calls controller.verifyOtp()
   ↓
5. Controller calls service.verifyOtp()
   ↓
6. Service calls:
   - repository.findUserByPhone() → checks DB
   - repository.findOtp() → gets OTP from DB
   - verifyOtpHash() → utility function
   - repository.createUser() → creates new user in DB
   - signAccessToken() → utility function
   - signRefreshToken() → utility function
   - repository.createSession() → saves session in DB
   ↓
7. Service returns [authResponse, refreshToken] to controller
   ↓
8. Controller sets cookie with refreshToken
   ↓
9. Controller sends JSON response
   ↓
10. Postman receives response with accessToken
    ↓
11. You're now logged in! 🎉
```

---

## 🔌 Utilities Used (Connected from service.ts)

```
service.ts uses:

utils/otp.util.ts
├─ generateOtp() → Creates random 6-digit code
├─ hashOtp() → Hashes the OTP
├─ verifyOtp() → Checks if code matches hash
└─ otpExpiry() → Returns expiry time

utils/jwt.util.ts
├─ signAccessToken() → Creates access token
├─ signRefreshToken() → Creates refresh token
├─ verifyRefreshToken() → Validates refresh token
└─ hashToken() → Hashes token for storage

utils/otp-sender.util.ts
└─ sendOtpSms() → Sends OTP via Twilio SMS

utils/app-error.util.ts
├─ AppError.unauthorized()
├─ AppError.tooManyRequests()
├─ AppError.notFound()
└─ Other error types

config/index.ts
├─ OTP settings (max attempts, timeout)
├─ JWT settings (secret, expiry)
├─ Cookie settings (httpOnly, secure)
└─ Port, DB URL, etc.
```

---

## 📝 Data Flow Example: Signup User

### REQUEST:
```
POST /api/auth/verify-otp
Content-Type: application/json

{
  "phone": "+966501234567",
  "code": "123456",
  "purpose": "signup",
  "email": "user@example.com"
}
```

### PROCESSING (What happens inside):

```
1. routes.ts:
   - Check rate limit ✅
   - Validate input ✅
   - Call controller ✅

2. validation.ts:
   - Phone format valid? ✅
   - Code is 6 digits? ✅
   - Purpose is valid? ✅

3. controller.ts:
   - Extract device info from request
   - Call service
   - Wait for response

4. service.ts:
   - Check if user exists → No (new user)
   - Find OTP in DB
   - Verify OTP hash
   - DELETE OTP from DB
   - CREATE NEW USER in DB
   - Generate access token
   - Generate refresh token
   - Save session in DB
   - Return [userData, refreshToken]

5. repository.ts:
   - Query DB: findUserByPhone() → null
   - Query DB: findOtp() → returns OTP record
   - Query DB: createUser() → inserts new user
   - Query DB: createSession() → inserts session
   - Return results to service

6. controller.ts:
   - Set refresh token cookie
   - Send JSON response

7. Postman:
   - Receives response
   - Shows accessToken
   - Shows user data
   - Stores refreshToken in cookie
```

### RESPONSE:
```json
{
  "success": true,
  "message": "Account created and verified successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "phone": "+966501234567",
      "email": "user@example.com",
      "role": "teacher",
      "isPhoneVerified": true,
      "isProfileComplete": false,
      "profileStep": "basic",
      "language": "en"
    },
    "isNewUser": true,
    "nextStep": "complete-profile"
  }
}
```

---

## 💾 What Gets Saved in MongoDB

### Users Collection:
```javascript
{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  phone: "+966501234567",
  email: null,
  name: null,  // Not required anymore
  role: "teacher",
  status: "active",
  isPhoneVerified: true,
  isEmailVerified: false,
  isProfileComplete: false,
  profileStep: "basic",
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastLoginAt: ISODate("2026-03-26T10:30:00.000Z"),
  loginCount: 1,
  pushNotificationsEnabled: true,
  emailNotificationsEnabled: true,
  deviceTokens: [],
  language: "en",
  createdAt: ISODate("2026-03-26T10:30:00.000Z"),
  updatedAt: ISODate("2026-03-26T10:30:00.000Z")
}
```

### Sessions Collection:
```javascript
{
  _id: ObjectId("507f1f77bcf86cd799439012"),
  userId: ObjectId("507f1f77bcf86cd799439011"),
  refreshTokenHash: "a7f3c9e2b1d4f6a8c9e2b1d4f6a8c9e2",
  deviceInfo: {
    userAgent: "PostmanRuntime/7.32.3",
    ip: "192.168.1.100",
    platform: "darwin"
  },
  ipAddress: "192.168.1.100",
  isRevoked: false,
  expiresAt: ISODate("2026-04-25T10:30:00.000Z"),
  createdAt: ISODate("2026-03-26T10:30:00.000Z"),
  updatedAt: ISODate("2026-03-26T10:30:00.000Z")
}
```

---

## 🎓 Study Guide Summary

1. **Learn flow:** Request → routes → controller → service → repository → DB
2. **Understand validation:** Bad data is rejected early at routes level
3. **See how service orchestrates:** Service calls repository + utilities
4. **Know what's saved:** Users, OTPs, Sessions in MongoDB
5. **Follow error handling:** Service throws errors, controller catches them
6. **Trace one request:** Pick verify-otp and follow it through all 6 layers

---

## 🚀 Test This Understanding

Try these scenarios and trace the flow:

1. **Wrong phone format:** Rejected at validation.ts (400 error)
2. **Wrong OTP:** Service checks, increments attempts, rejects (401 error)
3. **Max attempts:** Repository locks account, service throws error
4. **Valid signup:** All layers work together, user created, tokens issued
5. **Login existing user:** Service finds user, doesn't create new one, issues tokens

Each scenario exercises different parts of the flow!

Good luck studying! 🎯
