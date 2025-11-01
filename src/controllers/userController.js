import { User } from '../models/User.js';
import { UserAppAccess } from '../models/UserAppAccess.js';
import { App } from '../models/App.js';

// Create user (admin only)
export async function createUser(req, res) {
  const { username, email, password, role = 'child_admin', appIds = [] } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  if (role !== 'admin' && role !== 'child_admin') {
    return res.status(400).json({ error: 'Role must be admin or child_admin' });
  }

  try {
    const user = await User.create({
      username,
      email,
      password,
      role,
    });

    // If child_admin, assign app access
    if (role === 'child_admin' && appIds.length > 0) {
      const appDocs = await App.find({ appId: { $in: appIds } });
      const accessRecords = appDocs.map((app) => ({
        userId: user._id,
        appId: app._id,
      }));

      if (accessRecords.length > 0) {
        await UserAppAccess.insertMany(accessRecords);
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    return res.status(500).json({ error: 'Failed to create user', details: err.message });
  }
}

// Get all users
export async function getAllUsers(req, res) {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    return res.json({ count: users.length, data: users });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Get user by ID
export async function getUserById(req, res) {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get app access if child_admin
    let appAccess = [];
    if (user.role === 'child_admin') {
      const accessRecords = await UserAppAccess.find({ userId: user._id }).populate('appId');
      appAccess = accessRecords.map((a) => a.appId?.appId || null).filter(Boolean);
    }

    return res.json({
      data: {
        ...user.toObject(),
        appAccess,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Update user
export async function updateUser(req, res) {
  const { userId } = req.params;
  const { username, email, role, isActive, appIds } = req.body || {};

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    Object.assign(user, updateData);
    await user.save();

    // Update app access for child_admin
    if (role === 'child_admin' && appIds !== undefined) {
      await UserAppAccess.deleteMany({ userId: user._id });
      if (appIds.length > 0) {
        const appDocs = await App.find({ appId: { $in: appIds } });
        const accessRecords = appDocs.map((app) => ({
          userId: user._id,
          appId: app._id,
        }));
        if (accessRecords.length > 0) {
          await UserAppAccess.insertMany(accessRecords);
        }
      }
    }

    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Delete user
export async function deleteUser(req, res) {
  const { userId } = req.params;

  try {
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Clean up app access
    await UserAppAccess.deleteMany({ userId: user._id });

    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Assign apps to child admin
export async function assignAppsToUser(req, res) {
  const { userId } = req.params;
  const { appIds } = req.body || {};

  if (!Array.isArray(appIds)) {
    return res.status(400).json({ error: 'appIds must be an array' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'child_admin') {
      return res.status(400).json({ error: 'Can only assign apps to child_admin users' });
    }

    // Remove existing access
    await UserAppAccess.deleteMany({ userId: user._id });

    // Add new access
    if (appIds.length > 0) {
      const appDocs = await App.find({ appId: { $in: appIds } });
      const accessRecords = appDocs.map((app) => ({
        userId: user._id,
        appId: app._id,
      }));
      if (accessRecords.length > 0) {
        await UserAppAccess.insertMany(accessRecords);
      }
    }

    return res.json({ success: true, message: 'Apps assigned successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

