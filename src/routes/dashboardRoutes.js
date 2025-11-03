import { Router } from 'express';
import {
  getDashboard,
  getTransactions,
  getDailySales,
} from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

router.get('/overview', getDashboard);
router.get('/transactions', getTransactions);
router.get('/daily-sales', getDailySales);

export default router;