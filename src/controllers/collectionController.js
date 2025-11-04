import { Collection } from '../models/Collection.js';
import { UserAppAccess } from '../models/UserAppAccess.js';

// Helper to get accessible appIds for child_admin
async function getAccessibleAppIds(user) {
  if (user.role === 'admin') {
    return null; // null means all apps
  }

  const accessRecords = await UserAppAccess.find({ userId: user._id }).populate('appId');
  return accessRecords.map((a) => a.appId?.appId).filter(Boolean);
}

// Create or update collection IDs (accepts array, each with its own tag)
export async function createOrUpdateCollection(req, res) {
  const { appId, collections } = req.body || {};

  if (!appId || !collections) {
    return res.status(400).json({
      error: 'appId and collections (array) are required',
    });
  }

  // Validate collections is an array
  if (!Array.isArray(collections) || collections.length === 0) {
    return res.status(400).json({
      error: 'collections must be a non-empty array',
    });
  }

  // Validate tag enum
  const validTags = ['primary', 'retry', 'backup', 'custom'];

  try {
    // Check if user has access to this app
    if (req.user && req.user.role === 'child_admin') {
      const accessibleApps = await getAccessibleAppIds(req.user);
      if (!accessibleApps.includes(appId)) {
        return res.status(403).json({ error: 'Access denied for this app' });
      }
    }

    // Process all collection IDs with their tags
    const results = [];
    const errors = [];

    for (const item of collections) {
      const { collectionId, tag } = item || {};

      // Validate each item
      if (!collectionId || typeof collectionId !== 'string' || collectionId.trim() === '') {
        errors.push({ collectionId: item.collectionId || 'missing', error: 'Invalid or missing collectionId' });
        continue;
      }

      if (!tag || typeof tag !== 'string' || !validTags.includes(tag.trim())) {
        errors.push({
          collectionId: collectionId.trim(),
          error: `tag must be one of: ${validTags.join(', ')}`,
        });
        continue;
      }

      try {
        const collection = await Collection.findOneAndUpdate(
          { appId: appId.trim(), collectionId: collectionId.trim() },
          {
            appId: appId.trim(),
            collectionId: collectionId.trim(),
            tag: tag.trim(),
          },
          { upsert: true, new: true, runValidators: true }
        );
        results.push(collection);
      } catch (err) {
        if (err.code === 11000) {
          errors.push({ collectionId: collectionId.trim(), error: 'Collection ID already exists for this app' });
        } else {
          errors.push({ collectionId: collectionId.trim(), error: err.message });
        }
      }
    }

    return res.status(201).json({
      success: true,
      created: results.length,
      failed: errors.length,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Get all collections for an app
export async function getCollectionsByAppId(req, res) {
  const { appId } = req.params;

  if (!appId || appId.trim() === '') {
    return res.status(400).json({ error: 'appId is required' });
  }

  try {
    // Check if user has access to this app
    if (req.user && req.user.role === 'child_admin') {
      const accessibleApps = await getAccessibleAppIds(req.user);
      if (!accessibleApps.includes(appId.trim())) {
        return res.status(403).json({ error: 'Access denied for this app' });
      }
    }

    const collections = await Collection.find({ appId: appId.trim() }).sort({ tag: 1, createdAt: -1 });

    return res.json({ count: collections.length, data: collections });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Get all collections (filtered by user's accessible apps)
export async function getAllCollections(req, res) {
  const { appId, tag } = req.query;

  try {
    const filter = {};

    if (appId) {
      filter.appId = appId.trim();
      // Check if user has access to this app
      if (req.user && req.user.role === 'child_admin') {
        const accessibleApps = await getAccessibleAppIds(req.user);
        if (!accessibleApps.includes(appId.trim())) {
          return res.status(403).json({ error: 'Access denied for this app' });
        }
      }
    } else if (req.user && req.user.role === 'child_admin') {
      // Only show collections for user's accessible apps
      const accessibleApps = await getAccessibleAppIds(req.user);
      if (accessibleApps.length === 0) {
        return res.json({ count: 0, data: [] });
      }
      filter.appId = { $in: accessibleApps };
    }

    if (tag) {
      filter.tag = tag.trim();
    }

    const collections = await Collection.find(filter).sort({ appId: 1, tag: 1, createdAt: -1 });

    return res.json({ count: collections.length, data: collections });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Delete collection
export async function deleteCollection(req, res) {
  const { collectionId } = req.params;
  const { appId } = req.query;

  if (!collectionId || !appId) {
    return res.status(400).json({ error: 'collectionId and appId are required' });
  }

  try {
    // Check if user has access to this app
    if (req.user && req.user.role === 'child_admin') {
      const accessibleApps = await getAccessibleAppIds(req.user);
      if (!accessibleApps.includes(appId.trim())) {
        return res.status(403).json({ error: 'Access denied for this app' });
      }
    }

    const collection = await Collection.findOneAndDelete({
      appId: appId.trim(),
      collectionId: collectionId.trim(),
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    return res.json({ success: true, message: 'Collection deleted successfully', data: collection });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Get a random collectionId for a given app and tag
async function getRandomCollectionByTag(req, res, tag) {
  const { appId } = req.query;

  if (!appId || appId.trim() === '') {
    return res.status(400).json({ error: 'appId is required' });
  }

  try {
    // Access control only if auth is present; otherwise allow public use
    if (req.user && req.user.role === 'child_admin') {
      const accessibleApps = await getAccessibleAppIds(req.user);
      if (!accessibleApps.includes(appId.trim())) {
        return res.status(403).json({ error: 'Access denied for this app' });
      }
    }

    const docs = await Collection.aggregate([
      { $match: { appId: appId.trim(), tag } },
      { $sample: { size: 1 } },
      { $project: { _id: 0, appId: 1, collectionId: 1, tag: 1 } }
    ]);

    if (!docs || docs.length === 0) {
      return res.status(404).json({ error: 'No collection found for given tag' });
    }

    return res.json({ data: docs[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Map: "success" tab → primary tag
export async function getRandomSuccessCollection(req, res) {
  return getRandomCollectionByTag(req, res, 'primary');
}

// Retry tag
export async function getRandomRetryCollection(req, res) {
  return getRandomCollectionByTag(req, res, 'retry');
}

