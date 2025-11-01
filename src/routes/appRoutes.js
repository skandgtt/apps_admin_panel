import { Router } from 'express';
import {
  createApp,
  getAllApps,
  getAppById,
  updateApp,
  deleteApp,
} from '../controllers/appController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', createApp);
router.get('/', getAllApps);
router.get('/:appId', getAppById);
router.put('/:appId', updateApp);
router.delete('/:appId', deleteApp);

export default router;

