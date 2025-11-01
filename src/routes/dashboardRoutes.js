import { Router } from 'express';
import {
  getDashboard,
  getTransactions,
  getDailySales,
} from '../controllers/dashboardController.js';

const router = Router();

router.get('/overview', getDashboard);
router.get('/transactions', getTransactions);
router.get('/daily-sales', getDailySales);

export default router;

