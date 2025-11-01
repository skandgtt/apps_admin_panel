import { Router } from 'express';
import {
  createOrUpdateSpend,
  getSpends,
  deleteSpend,
} from '../controllers/spendController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', createOrUpdateSpend);
router.get('/', getSpends);
router.delete('/:spendId', deleteSpend);

export default router;

