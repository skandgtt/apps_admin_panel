import { Spend } from '../models/Spend.js';
import { UserAppAccess } from '../models/UserAppAccess.js';

// Helper to get accessible appIds for child_admin
async function getAccessibleAppIds(user) {
  if (user.role === 'admin') {
    return null; // null means all apps
  }

  const accessRecords = await UserAppAccess.find({ userId: user._id }).populate('appId');
  return accessRecords.map((a) => a.appId?.appId).filter(Boolean);
}

// Create or update spend
export async function createOrUpdateSpend(req, res) {
  const { appId, date, spendAmount, roi, settlement, notes } = req.body || {};

  if (!appId || !date || spendAmount === undefined) {
    return res.status(400).json({
      error: 'appId, date, and spendAmount are required',
    });
  }

  try {
    const spend = await Spend.findOneAndUpdate(
      { appId, date: new Date(date) },
      {
        appId,
        date: new Date(date),
        spendAmount: Number(spendAmount),
        roi: roi !== undefined ? Number(roi) : 0,
        settlement: settlement || 'no',
        notes: notes || '',
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({ success: true, data: spend });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Get spends with filters
export async function getSpends(req, res) {
  const { appId, filter = 'last_7_days', startDate, endDate } = req.query;

  try {
    let dateFilter = {};

    if (filter === 'date_range' && startDate && endDate) {
      dateFilter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else if (filter === 'last_7_days') {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      dateFilter.date = { $gte: start, $lte: now };
    }

    const appFilter = {};
    if (appId) {
      appFilter.appId = appId;
      // Check if user has access to this app
      if (req.user.role === 'child_admin') {
        const accessibleApps = await getAccessibleAppIds(req.user);
        if (!accessibleApps.includes(appId)) {
          return res.status(403).json({ error: 'Access denied for this app' });
        }
      }
    } else if (req.user.role === 'child_admin') {
      const accessibleApps = await getAccessibleAppIds(req.user);
      if (accessibleApps.length === 0) {
        return res.json({ count: 0, data: [] });
      }
      appFilter.appId = { $in: accessibleApps };
    }

    const queryFilter = { ...appFilter, ...dateFilter };

    const spends = await Spend.find(queryFilter).sort({ date: -1 });

    return res.json({ count: spends.length, data: spends });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Delete spend
export async function deleteSpend(req, res) {
  const { spendId } = req.params;

  try {
    const spend = await Spend.findByIdAndDelete(spendId);
    if (!spend) {
      return res.status(404).json({ error: 'Spend not found' });
    }

    return res.json({ success: true, message: 'Spend deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

