// src/modules/auth/auth.routes.ts
// Router for auth — wires validation middleware + controller methods

import { Router } from 'express';
import authController from './auth.controller';
import { validateSendOtp, validateVerifyOtp } from './auth.validation';

const router: Router = Router();

// POST /auth/send-otp
router.post('/send-otp', validateSendOtp, authController.sendOtp);

// POST /auth/verify-otp
router.post('/verify-otp', validateVerifyOtp, authController.verifyOtp);

// POST /auth/refresh-tokens
router.post('/refresh-tokens', authController.refreshTokens);

// POST /auth/logout
router.post('/logout', authController.logout);

// POST /auth/logout-all
router.post('/logout-all', authController.logoutAll);

export default router;