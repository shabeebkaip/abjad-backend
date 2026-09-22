// src/modules/auth/auth.routes.ts
// Router for auth — wires validation middleware + controller methods

import { Router } from 'express';
import authController from './auth.controller';
import {
  validateSendOtp,
  validateVerifyOtp,
  validateLogin,
  validateSetPassword,
  validateChangePassword,
  validateResetPassword,
  validateUpdateLanguage,
} from './auth.validation';
import { authenticate } from '../../middlewares/auth';
import { otpLimiter, verifyOtpLimiter, refreshLimiter, loginLimiter, strictLimiter } from '../../middlewares/rateLimiter';

const router: Router = Router();

// POST /auth/send-otp
router.post('/send-otp', otpLimiter, validateSendOtp, authController.sendOtp);

// POST /auth/verify-otp
router.post('/verify-otp', verifyOtpLimiter, validateVerifyOtp, authController.verifyOtp);

// POST /auth/login — email + password (teacher/school only; admins use /admin/auth/login)
router.post('/login', loginLimiter, validateLogin, authController.login);

// POST /auth/set-password — authenticated, only if no password set yet
router.post('/set-password', authenticate, strictLimiter, validateSetPassword, authController.setPassword);

// POST /auth/change-password — authenticated, requires currentPassword
router.post('/change-password', authenticate, strictLimiter, validateChangePassword, authController.changePassword);

// POST /auth/reset-password — forgot-password: valid reset OTP + new password
router.post('/reset-password', strictLimiter, validateResetPassword, authController.resetPassword);

// POST /auth/refresh
router.post('/refresh', refreshLimiter, authController.refresh);

// POST /auth/logout
router.post('/logout', authenticate, authController.logout);

// POST /auth/logout-all
router.post('/logout-all', authenticate, authController.logoutAll);

// GET /auth/me
router.get('/me', authenticate, authController.me);

// PATCH /auth/language — Panel i18n M1 task 2: server-stored language preference
router.patch('/language', authenticate, validateUpdateLanguage, authController.updateLanguage);

// GET /auth/sessions
router.get('/sessions', authenticate, authController.sessions);

export default router;