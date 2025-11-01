import { Router } from 'express';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  assignAppsToUser,
} from '../controllers/userController.js';
import { authenticate, isAdmin } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Only admin can create users
router.post('/', isAdmin, createUser);

// Only admin can view all users and manage users
router.get('/', isAdmin, getAllUsers);
router.put('/:userId', isAdmin, updateUser);
router.delete('/:userId', isAdmin, deleteUser);
router.put('/:userId/assign-apps', isAdmin, assignAppsToUser);

// Users can view their own profile
router.get('/:userId', getUserById);

export default router;

