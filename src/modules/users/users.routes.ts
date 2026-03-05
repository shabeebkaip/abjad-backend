import { Router } from 'express';
import usersController from './users.controller';
import { validateCreateUser, validateUpdateUser } from './users.validation';

const router = Router();

/**
 * @route   POST /api/users
 * @desc    Create a new user
 * @access  Public (will be protected later with auth middleware)
 */
router.post('/', validateCreateUser, usersController.createUser);

/**
 * @route   GET /api/users
 * @desc    Get all users with pagination and filters
 * @access  Public (will be protected later)
 */
router.get('/', usersController.getAllUsers);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Public (will be protected later)
 */
router.get('/:id', usersController.getUserById);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Public (will be protected later)
 */
router.put('/:id', validateUpdateUser, usersController.updateUser);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Public (will be protected later)
 */
router.delete('/:id', usersController.deleteUser);

/**
 * @route   PATCH /api/users/:id/verify-email
 * @desc    Verify user email
 * @access  Public (will be protected later)
 */
router.patch('/:id/verify-email', usersController.verifyEmail);

/**
 * @route   PATCH /api/users/:id/toggle-status
 * @desc    Toggle user active status
 * @access  Public (will be protected later)
 */
router.patch('/:id/toggle-status', usersController.toggleUserStatus);

export default router;
