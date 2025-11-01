import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { UserAppAccess } from '../models/UserAppAccess.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-auth-token'];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Check if user is admin
export const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Check if user has access to specific app (for child_admin)
export const hasAppAccess = async (req, res, next) => {
  if (req.user.role === 'admin') {
    return next(); // Admin has access to all apps
  }

  const appId = req.params.appId || req.query.appId || req.body.appId;

  if (!appId) {
    return res.status(400).json({ error: 'appId is required' });
  }

  // Find the App document to get its ObjectId
  const { App } = await import('../models/App.js');
  const app = await App.findOne({ appId: appId });
  
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }

  const access = await UserAppAccess.findOne({
    userId: req.user._id,
    appId: app._id,
  });

  if (!access) {
    return res.status(403).json({ error: 'Access denied for this app' });
  }

  req.appId = appId;
  next();
};

