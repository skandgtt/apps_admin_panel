import { Router } from 'express';
import {
  createOrUpdateCollection,
  getCollectionsByAppId,
  getAllCollections,
  deleteCollection,
} from '../controllers/collectionController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', createOrUpdateCollection);
router.get('/', getAllCollections);
router.get('/app/:appId', getCollectionsByAppId);
router.delete('/:collectionId', deleteCollection);

export default router;

