import { App } from '../models/App.js';
import { UserAppAccess } from '../models/UserAppAccess.js';

// Helper to get accessible appIds for child_admin
async function getAccessibleAppIds(user) {
  if (user.role === 'admin') {
    return null; // null means all apps
  }

  const accessRecords = await UserAppAccess.find({ userId: user._id }).populate('appId');
  return accessRecords.map((a) => a.appId?.appId).filter(Boolean);
}

// Helper function to generate a unique 5-digit appId
async function generateUniqueAppId() {
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    // Generate random 5-digit number (10000 to 99999)
    const randomId = Math.floor(10000 + Math.random() * 90000).toString();

    const existing = await App.findOne({ appId: randomId });
    if (!existing) {
      return randomId;
    }
    attempts++;
  }

  throw new Error('Failed to generate unique appId after multiple attempts');
}

// Create a new app
export async function createApp(req, res) {
  const { appName, appLogoUrl } = req.body || {};

  if (!appName || typeof appName !== 'string' || appName.trim() === '') {
    return res.status(400).json({ error: 'appName is required and must be a non-empty string' });
  }

  if (!appLogoUrl || typeof appLogoUrl !== 'string' || appLogoUrl.trim() === '') {
    return res.status(400).json({ error: 'appLogoUrl is required and must be a non-empty string' });
  }

  try {
    const appId = await generateUniqueAppId();
    const app = await App.create({
      appId,
      appName: appName.trim(),
      appLogoUrl: appLogoUrl.trim(),
    });

    return res.status(201).json({ success: true, data: app });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'App with this appId already exists' });
    }
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Get all apps (filtered by user access for child_admin)
export async function getAllApps(req, res) {
  try {
    let apps;
    
    if (req.user.role === 'admin') {
      // Admin sees all apps
      apps = await App.find({}).sort({ createdAt: -1 });
    } else {
      // Child admin only sees assigned apps
      const accessibleAppIds = await getAccessibleAppIds(req.user);
      if (accessibleAppIds.length === 0) {
        return res.json({ count: 0, data: [] });
      }
      apps = await App.find({ appId: { $in: accessibleAppIds } }).sort({ createdAt: -1 });
    }
    
    return res.json({ count: apps.length, data: apps });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Get app by appId
export async function getAppById(req, res) {
  const { appId } = req.params;

  if (!appId || appId.trim() === '') {
    return res.status(400).json({ error: 'appId is required' });
  }

  try {
    const app = await App.findOne({ appId: appId.trim() });
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }
    return res.json({ data: app });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Update app by appId
export async function updateApp(req, res) {
  const { appId } = req.params;
  const { appName, appLogoUrl } = req.body || {};

  if (!appId || appId.trim() === '') {
    return res.status(400).json({ error: 'appId is required' });
  }

  const updateData = {};
  if (appName !== undefined) {
    if (typeof appName !== 'string' || appName.trim() === '') {
      return res.status(400).json({ error: 'appName must be a non-empty string' });
    }
    updateData.appName = appName.trim();
  }

  if (appLogoUrl !== undefined) {
    if (typeof appLogoUrl !== 'string' || appLogoUrl.trim() === '') {
      return res.status(400).json({ error: 'appLogoUrl must be a non-empty string' });
    }
    updateData.appLogoUrl = appLogoUrl.trim();
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'At least one field (appName or appLogoUrl) must be provided' });
  }

  try {
    const app = await App.findOneAndUpdate(
      { appId: appId.trim() },
      updateData,
      { new: true, runValidators: true }
    );

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    return res.json({ success: true, data: app });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Delete app by appId
export async function deleteApp(req, res) {
  const { appId } = req.params;

  if (!appId || appId.trim() === '') {
    return res.status(400).json({ error: 'appId is required' });
  }

  try {
    const app = await App.findOneAndDelete({ appId: appId.trim() });
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }
    return res.json({ success: true, message: 'App deleted successfully', data: app });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

