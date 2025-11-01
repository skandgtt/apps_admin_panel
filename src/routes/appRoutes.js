import { Router } from 'express';
import {
  createApp,
  getAllApps,
  getAppById,
  updateApp,
  deleteApp,
} from '../controllers/appController.js';

const router = Router();

router.post('/', createApp);
router.get('/', getAllApps);
router.get('/:appId', getAppById);
router.put('/:appId', updateApp);
router.delete('/:appId', deleteApp);

export default router;

