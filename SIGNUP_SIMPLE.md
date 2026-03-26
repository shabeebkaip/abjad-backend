# Simple Signup Testing Guide

## Make sure the server is running first!
```
pnpm dev
```

---

## **STEP 1: Request OTP Code**

### Open Postman and create a NEW request:

**Method:** POST  
**URL:** `http://localhost:8000/api/auth/send-otp`

**Click on "Headers" tab and add:**
```
Content-Type: application/json
```

**Click on "Body" tab, select "raw", paste this:**
```json
{
  "phone": "+966501234567",
  "purpose": "signup"
}
```

**Click SEND**

### You will see this response:
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

**⚠️ IMPORTANT:** The OTP code will be sent to the phone via SMS (Twilio). For testing, use `123456` as the code.

---

## **STEP 2: Verify OTP and Create Account**

### Create another NEW POST request:

**Method:** POST  
**URL:** `http://localhost:8000/api/auth/verify-otp`

**Click on "Headers" tab and add:**
```
Content-Type: application/json
```

**Click on "Body" tab, select "raw", paste this:**
```json
{
  "phone": "+966501234567",
  "code": "123456",
  "purpose": "signup",
  "email": "myemail@gmail.com"
}
```

**Change these to your values:**
- `"phone"` - use any number starting with +966
- `"code"` - use `123456` (or the actual code you received)
- `"email"` - use any email

**Click SEND**

### You will see this response:
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "123456789",
      "phone": "+966501234567",
      "email": "myemail@gmail.com",
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

## **✅ SUCCESS! User Created!**

Your new user account is ready. Save the `accessToken` value if you need it for later requests.

---

## **❌ Common Problems**

| Problem | Solution |
|---------|----------|
| "Invalid phone format" | Phone must start with +966 (Saudi format) |
| "Invalid or expired OTP" | Use code `123456` or check database |
| "Account locked" | Wait 15 minutes, too many wrong attempts |
| "Connection refused" | Server not running, do `pnpm dev` first |

---

## **That's it!** 🎉

You just signed up successfully. The account is created and you have an access token.
