import { Router } from 'express';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  assignAppsToUser,
} from '../controllers/userController.js';

const router = Router();

router.post('/', createUser);
router.get('/', getAllUsers);
router.get('/:userId', getUserById);
router.put('/:userId', updateUser);
router.delete('/:userId', deleteUser);
router.put('/:userId/assign-apps', assignAppsToUser);

export default router;

