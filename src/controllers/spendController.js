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
  const { appId, date, spendAmount, settlement } = req.body || {};

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
        settlement: settlement || 'no',
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({ success: true, data: spend });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Get spends with filters
import { Payment } from '../models/Payment.js';

export async function getSpends(req, res) {
  const { appId, filter = 'this_week', startDate, endDate } = req.query;

  try {
    let dateFilter = {};

    if (filter === 'date_range' && startDate && endDate) {
      dateFilter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else if (filter === 'this_week') {
      const now = new Date();
      const day = now.getDay(); // 0 Sun..6 Sat
      const diffToMonday = (day + 6) % 7; // Monday as start
      const start = new Date(now);
      start.setDate(now.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      dateFilter.date = { $gte: start, $lte: end };
    } else if (filter === 'this_month') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      dateFilter.date = { $gte: start, $lte: end };
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

    // Fetch spends in range
    const spends = await Spend.find(queryFilter).sort({ date: -1 });

    // Calculate received amount per day from successful payments
    const paymentsAgg = await Payment.aggregate([
      { $match: {
          ...(appFilter.appId ? { appId: appFilter.appId } : appFilter),
          ...(dateFilter.date ? { transactionDate: dateFilter.date } : {}),
          ptStatus: 'success'
        }
      },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$transactionDate' } },
          receivedAmount: { $sum: '$amount' }
        }
      }
    ]);

    const receivedByDate = new Map(paymentsAgg.map(p => [p._id, p.receivedAmount]));

    // Merge spends with received; include days with payments but no spend
    const responseMap = new Map();

    spends.forEach(s => {
      const key = new Date(s.date); key.setHours(0,0,0,0);
      const k = key.toISOString().slice(0,10);
      responseMap.set(k, {
        date: k,
        appId: s.appId,
        spendAmount: s.spendAmount,
        settlement: s.settlement,
        receivedAmount: receivedByDate.get(k) || 0
      });
    });

    paymentsAgg.forEach(p => {
      if (!responseMap.has(p._id)) {
        responseMap.set(p._id, {
          date: p._id,
          appId: appFilter.appId || undefined,
          spendAmount: 0,
          settlement: 'no',
          receivedAmount: p.receivedAmount
        });
      }
    });

    const data = Array.from(responseMap.values()).sort((a,b) => (a.date < b.date ? 1 : -1));

    return res.json({ count: data.length, data });
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

