import { Router } from 'express';
import { createOrUpdatePayment, listPayments, getPaymentByUuid, getPaymentStatistics } from '../controllers/paymentController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// POST can be public for webhooks, GET requires auth
router.post('/', createOrUpdatePayment);
router.get('/stats', authenticate, getPaymentStatistics);
router.get('/', authenticate, listPayments);
router.get('/:uuid', authenticate, getPaymentByUuid);

export default router;


