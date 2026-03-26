# Complete Postman Testing Guide - Step by Step

## Prerequisites
1. Make sure the server is running: `pnpm dev` (runs on http://localhost:8000)
2. Open Postman
3. Follow the requests in order from top to bottom

---

## PART 1: USER SIGNUP (Sign up a new user)

### Step 1: Send OTP for Signup
**Method:** `POST`  
**URL:** `http://localhost:8000/api/auth/send-otp`

**Headers:**
```
Content-Type: application/json
```

**Body (Raw JSON):**
```json
{
  "phone": "+966501234567",
  "purpose": "signup"
}
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "phone": "+966501234567",
    "expiresIn": 600
  }
}
```

**What to do with OTP:**
- Twilio will send the OTP code via SMS to the phone number
- Save the OTP code for the next step
- If you don't have Twilio setup, check the database directly or use test OTP: `123456` (if in test mode)

---

### Step 2: Verify OTP and Create Account (Complete Signup)
**Method:** `POST`  
**URL:** `http://localhost:8000/api/auth/verify-otp`

**Headers:**
```
Content-Type: application/json
```

**Body (Raw JSON):**
```json
{
  "phone": "+966501234567",
  "code": "123456",
  "purpose": "signup",
  "email": "user@example.com"
}
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "phone": "+966501234567",
      "email": "user@example.com",
      "role": "teacher",
      "status": "active",
      "isPhoneVerified": true,
      "loginCount": 1,
      "createdAt": "2026-03-25T10:30:00.000Z"
    }
  }
}
```

**Important:** 
- The system automatically sets a refresh token cookie (HTTP-Only)
- Save the `accessToken` for the next requests
- Replace `123456` with the actual OTP code you received

---

## PART 2: GET USER PROFILE

### Step 3: Get Your Profile Info
**Method:** `GET`  
**URL:** `http://localhost:8000/api/auth/me`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {accessToken}
```

**Replace `{accessToken}` with the token from Step 2**

**Body:** (leave empty, just send the request)

**Expected Response (Success):**
```json
{
  "success": true,
  "data": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+966501234567",
    "email": "user@example.com",
    "role": "teacher",
    "status": "active",
    "isPhoneVerified": true,
    "loginCount": 1,
    "createdAt": "2026-03-25T10:30:00.000Z",
    "updatedAt": "2026-03-25T10:30:00.000Z"
  }
}
```

---

## PART 3: USER LOGIN (Login an existing user)

### Step 4: Send OTP for Login
**Method:** `POST`  
**URL:** `http://localhost:8000/api/auth/send-otp`

**Headers:**
```
Content-Type: application/json
```

**Body (Raw JSON):**
```json
{
  "phone": "+966501234567",
  "purpose": "login"
}
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "phone": "+966501234567",
    "expiresIn": 600
  }
}
```

**What to do:**
- Twilio will send a new OTP code via SMS
- Save this OTP code for the next step

---

### Step 5: Verify OTP and Login
**Method:** `POST`  
**URL:** `http://localhost:8000/api/auth/verify-otp`

**Headers:**
```
Content-Type: application/json
```

**Body (Raw JSON):**
```json
{
  "phone": "+966501234567",
  "code": "123456",
  "purpose": "login"
}
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "phone": "+966501234567",
      "email": "user@example.com",
      "role": "teacher",
      "status": "active",
      "isPhoneVerified": true,
      "loginCount": 2,
      "createdAt": "2026-03-25T10:30:00.000Z"
    }
  }
}
```

**Important:**
- Notice `loginCount` increased from 1 to 2
- A new refresh token cookie is set automatically
- Replace `123456` with the actual OTP code you received

---

## PART 4: TOKEN REFRESH

### Step 6: Get a New Access Token (Refresh Token)
**Method:** `POST`  
**URL:** `http://localhost:8000/api/auth/refresh`

**Headers:**
```
Content-Type: application/json
```

**Body:** (leave empty, the refresh token is sent automatically from the cookie)

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Use Case:**
- When your access token expires (15 minutes)
- The refresh token is stored in an HTTP-Only cookie automatically
- This gives you a new access token without re-entering OTP

---

## PART 5: SESSION MANAGEMENT

### Step 7: Get All Your Active Sessions
**Method:** `GET`  
**URL:** `http://localhost:8000/api/auth/sessions`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {accessToken}
```

**Body:** (leave empty)

**Expected Response (Success):**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "507f1f77bcf86cd799439011",
        "device": "Chrome on macOS",
        "ipAddress": "192.168.1.100",
        "lastActive": "2026-03-25T10:35:00.000Z",
        "isRevoked": false
      }
    ],
    "totalSessions": 1
  }
}
```

**What this shows:**
- All devices where you're logged in
- IP addresses and device information
- Each session can be logged out individually

---

### Step 8: Logout (Logout from Current Device Only)
**Method:** `POST`  
**URL:** `http://localhost:8000/api/auth/logout`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {accessToken}
```

**Body:** (leave empty)

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**What happens:**
- You are logged out from THIS device only
- Refresh token is revoked
- Other devices remain logged in
- After this, you'll need OTP to login again

---

### Step 9: Logout from All Devices
**Method:** `POST`  
**URL:** `http://localhost:8000/api/auth/logout-all`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {accessToken}
```

**Body:** (leave empty)

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Logged out from all devices successfully"
}
```

**What happens:**
- You are logged out from ALL devices simultaneously
- All refresh tokens are revoked
- All sessions are terminated
- All devices must log in again with OTP

---

## QUICK REFERENCE TABLE

| # | Action | Method | URL | Requires Token |
|---|--------|--------|-----|----------------|
| 1 | Send OTP (Signup) | POST | `/api/auth/send-otp` | ❌ |
| 2 | Verify OTP & Signup | POST | `/api/auth/verify-otp` | ❌ |
| 3 | Get Profile | GET | `/api/auth/me` | ✅ |
| 4 | Send OTP (Login) | POST | `/api/auth/send-otp` | ❌ |
| 5 | Verify OTP & Login | POST | `/api/auth/verify-otp` | ❌ |
| 6 | Refresh Token | POST | `/api/auth/refresh` | ❌ |
| 7 | Get All Sessions | GET | `/api/auth/sessions` | ✅ |
| 8 | Logout (Current) | POST | `/api/auth/logout` | ✅ |
| 9 | Logout All | POST | `/api/auth/logout-all` | ✅ |

---

## IMPORTANT NOTES

### Access Token
- **Lifespan:** 15 minutes
- **Header:** `Authorization: Bearer {accessToken}`
- **When it expires:** You'll get a 401 Unauthorized error
- **How to fix:** Use Step 6 (Refresh Token) to get a new one

### Refresh Token
- **Lifespan:** 30 days
- **Storage:** HTTP-Only cookie (automatic)
- **When it expires:** You'll need to login again with OTP
- **Cannot be lost:** It's stored securely in cookies

### OTP Code
- **Sent via:** Twilio SMS (if configured)
- **Lifespan:** 10 minutes
- **Attempts:** Maximum 3 wrong attempts, then account locks for 15 minutes
- **Deletion:** Automatically deleted after successful verification

### Rate Limiting
- **OTP requests:** Maximum 5 per 10 minutes per phone number
- **General API:** Maximum 100 requests per 15 minutes
- **Response if exceeded:** 429 Too Many Requests

### Phone Number Format
- **Must be:** Saudi phone format starting with `+966`
- **Example:** `+966501234567`
- **Invalid format:** Will return validation error

---

## TESTING WORKFLOW

### First Time Users - Complete Signup to Get Token
1. Start with Step 1 (Send OTP)
2. Get OTP from SMS or database
3. Do Step 2 (Verify OTP) to create account and get token
4. Save the `accessToken` from response
5. Use this token in subsequent requests

### Already Logged In - Just Use Existing Token
1. If you already have an `accessToken`, skip Steps 1-2
2. Start with Step 3 (Get Profile) to verify you're logged in
3. All endpoints with ✅ require this token

### Token Expired - Refresh It
1. When you get 401 error, go to Step 6
2. Click Send (refresh token is in cookie)
3. Use the new `accessToken` for subsequent requests

### Test Multiple Devices
1. Complete signup on one browser/device
2. In another browser/device, do login (Steps 4-5)
3. Go to Step 7 to see both devices in sessions list
4. Use Step 8 to logout from one or Step 9 to logout all

---

## ERROR RESPONSES

### 400 Bad Request (Wrong OTP)
```json
{
  "success": false,
  "message": "Invalid or expired OTP"
}
```
**Fix:** Make sure you're using the most recent OTP code sent

### 401 Unauthorized (Missing/Invalid Token)
```json
{
  "success": false,
  "message": "Unauthorized"
}
```
**Fix:** Use Step 6 to refresh your token

### 403 Forbidden (Account Locked)
```json
{
  "success": false,
  "message": "Account locked due to multiple failed attempts. Try again in 15 minutes"
}
```
**Fix:** Wait 15 minutes, then try again

### 429 Too Many Requests (Rate Limit)
```json
{
  "success": false,
  "message": "Too many requests, please try again later"
}
```
**Fix:** Wait a few minutes before making the same request

### 422 Unprocessable Entity (Invalid Data)
```json
{
  "success": false,
  "message": "Invalid phone format"
}
```
**Fix:** Use correct format like `+966501234567`

---

## COPY-PASTE BODIES

### Body 1 - Send OTP
```json
{
  "phone": "+966501234567",
  "purpose": "signup"
}
```

### Body 2 - Verify OTP (Signup)
```json
{
  "phone": "+966501234567",
  "code": "123456",
  "purpose": "signup",
  "email": "user@example.com"
}
```

### Body 4 - Send OTP (Login)
```json
{
  "phone": "+966501234567",
  "purpose": "login"
}
```

### Body 5 - Verify OTP (Login)
```json
{
  "phone": "+966501234567",
  "code": "123456",
  "purpose": "login"
}
```

---

## POSTMAN CONFIGURATION TIPS

### Save Token in Variable
1. After Step 2 or Step 5, copy the `accessToken` value
2. In Postman, click **Environment** (bottom left)
3. Create new variable: `token` = paste your token
4. In other requests, use `{{token}}` in Authorization header

### Automatically Set Token
1. Go to the response from Step 2
2. Click **Tests** tab
3. Add: `pm.environment.set("token", pm.response.json().data.accessToken);`
4. Now token is automatically saved after each login!

### Create Collection
1. Create a new collection named "Abjad Auth API"
2. Add all 9 requests
3. Organize by folders: Signup, Login, Profile, Sessions, Logout
4. Export and share with team

---

## NEXT STEPS

1. ✅ Run `pnpm dev` to start the server
2. ✅ Open Postman
3. ✅ Start with Step 1 and follow in order
4. ✅ Test each endpoint by copying the URL, headers, and body
5. ✅ Save the `accessToken` for requests that need it
6. ✅ Verify each response matches the expected output

You now have everything you need to test all authentication endpoints! 🚀
