import { Router } from 'express';
import {
  createOrUpdateCollection,
  getCollectionsByAppId,
  getAllCollections,
  deleteCollection,
  getRandomSuccessCollection,
  getRandomRetryCollection,
} from '../controllers/collectionController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All routes require authentication

router.post('/', createOrUpdateCollection);
router.get('/', getAllCollections);
router.get('/app/:appId', getCollectionsByAppId);
router.get('/sc', getRandomSuccessCollection);
router.get('/rt', getRandomRetryCollection);
router.delete('/:collectionId', deleteCollection);

export default router;