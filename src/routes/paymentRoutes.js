import { Router } from 'express';
import { createOrUpdatePayment, listPayments, getPaymentByUuid, getPaymentStatistics } from '../controllers/paymentController.js';

const router = Router();

router.post('/', createOrUpdatePayment);
router.get('/stats', getPaymentStatistics);
router.get('/', listPayments);
router.get('/:uuid', getPaymentByUuid);

export default router;


