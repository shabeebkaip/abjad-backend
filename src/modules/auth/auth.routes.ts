// src/modules/auth/auth.routes.ts
// Router for auth — wires validation middleware + controller methods

import { Router } from 'express';
import authController from './auth.controller';
import { validateSendOtp, validateVerifyOtp } from './auth.validation';
import { authenticate } from '../../middlewares/auth';
import { otpLimiter, refreshLimiter } from '../../middlewares/rateLimiter';

const router: Router = Router();

// POST /auth/send-otp
router.post('/send-otp', otpLimiter, validateSendOtp, authController.sendOtp);

// POST /auth/verify-otp
router.post('/verify-otp', otpLimiter, validateVerifyOtp, authController.verifyOtp);

// POST /auth/refresh
router.post('/refresh', refreshLimiter, authController.refresh);

// POST /auth/logout
router.post('/logout', authenticate, authController.logout);

// POST /auth/logout-all
router.post('/logout-all', authenticate, authController.logoutAll);

// GET /auth/me
router.get('/me', authenticate, authController.me);

// GET /auth/sessions
router.get('/sessions', authenticate, authController.sessions);

export default router;