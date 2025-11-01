import { Payment } from '../models/Payment.js';
import { Spend } from '../models/Spend.js';
import { UserAppAccess } from '../models/UserAppAccess.js';
import { App } from '../models/App.js';

// Helper to get accessible appIds for child_admin
async function getAccessibleAppIds(user) {
  if (user.role === 'admin') {
    return null; // null means all apps
  }

  const accessRecords = await UserAppAccess.find({ userId: user._id }).populate('appId');
  return accessRecords.map((a) => a.appId?.appId).filter(Boolean);
}

// Helper function to get date range based on filter
function getDateRange(filter) {
  const now = new Date();
  let startDate, endDate;

  switch (filter) {
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = new Date(yesterday.setHours(0, 0, 0, 0));
      endDate = new Date(yesterday.setHours(23, 59, 59, 999));
      break;
    }
    case 'last_7_days': {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case 'this_month': {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case 'all_time':
      return null; // No date filter
    default:
      return null;
  }

  return { startDate, endDate };
}


// Dashboard overview with filters
export async function getDashboard(req, res) {
  const { appId, filter = 'all_time', startDate, endDate } = req.query;

  try {
    // Build date filter
    let dateFilter = {};
    if (filter !== 'all_time' && filter !== 'date_range') {
      const range = getDateRange(filter);
      if (range) {
        dateFilter.transactionDate = { $gte: range.startDate, $lte: range.endDate };
      }
    } else if (filter === 'date_range' && startDate && endDate) {
      dateFilter.transactionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Build app filter - respect user's app access
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
      // If no appId specified, only show user's accessible apps
      const accessibleApps = await getAccessibleAppIds(req.user);
      if (accessibleApps.length === 0) {
        return res.json({
          totalTransactions: 0,
          totalAmount: 0,
          successCount: 0,
          failedCount: 0,
          retryCount: 0,
          charts: {
            dailySales: [],
            statusDistribution: [],
          },
        });
      }
      appFilter.appId = { $in: accessibleApps };
    }

    const queryFilter = { ...appFilter, ...dateFilter };

    // Get aggregations
    const [stats, dailySales, statusCounts] = await Promise.all([
      Payment.aggregate([
        { $match: queryFilter },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            successAmount: {
              $sum: { $cond: [{ $eq: ['$ptStatus', 'success'] }, '$amount', 0] },
            },
          },
        },
      ]),
      Payment.aggregate([
        { $match: queryFilter },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$transactionDate' },
            },
            count: { $sum: 1 },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([
        { $match: queryFilter },
        {
          $group: {
            _id: '$ptStatus',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statsResult = stats[0] || {
      totalTransactions: 0,
      totalAmount: 0,
      successAmount: 0,
    };

    const statusMap = {};
    statusCounts.forEach((s) => {
      statusMap[s._id] = s.count;
    });

    return res.json({
      totalTransactions: statsResult.totalTransactions,
      totalAmount: statsResult.totalAmount,
      totalAmountReceived: statsResult.successAmount,
      successCount: statusMap.success || 0,
      failedCount: statusMap.failed || 0,
      retryCount: statusMap.retry || 0,
      charts: {
        dailySales: dailySales.map((d) => ({
          date: d._id,
          transactions: d.count,
          amount: d.amount,
        })),
        statusDistribution: statusCounts.map((s) => ({
          status: s._id,
          count: s.count,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Get transactions list with filters
export async function getTransactions(req, res) {
  const { appId, filter = 'all_time', startDate, endDate, status, page = 1, limit = 50 } = req.query;

  try {
    let dateFilter = {};
    if (filter !== 'all_time' && filter !== 'date_range') {
      const range = getDateRange(filter);
      if (range) {
        dateFilter.transactionDate = { $gte: range.startDate, $lte: range.endDate };
      }
    } else if (filter === 'date_range' && startDate && endDate) {
      dateFilter.transactionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
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
        return res.json({ count: 0, data: [], page: 1, totalPages: 0 });
      }
      appFilter.appId = { $in: accessibleApps };
    }

    const statusFilter = status ? { ptStatus: status } : {};

    const queryFilter = { ...appFilter, ...dateFilter, ...statusFilter };

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      Payment.find(queryFilter)
        .select('uuid appId ptStatus transactionDate createdAt')
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Payment.countDocuments(queryFilter),
    ]);

    return res.json({
      count: transactions.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      data: transactions,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Get daily sales with spend data
export async function getDailySales(req, res) {
  const { date, appId } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
  }

  try {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

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
        return res.json({ data: [] });
      }
      appFilter.appId = { $in: accessibleApps };
    }

    const [payments, spends] = await Promise.all([
      Payment.find({
        ...appFilter,
        transactionDate: { $gte: targetDate, $lte: endDate },
      }).sort({ transactionDate: -1 }),
      Spend.find({
        ...appFilter,
        date: { $gte: targetDate, $lte: endDate },
      }),
    ]);

    // Group by appId
    const appMap = {};
    payments.forEach((p) => {
      if (!appMap[p.appId]) {
        appMap[p.appId] = { payments: [], spend: null };
      }
      appMap[p.appId].payments.push(p);
    });

    spends.forEach((s) => {
      if (!appMap[s.appId]) {
        appMap[s.appId] = { payments: [], spend: null };
      }
      appMap[s.appId].spend = s;
    });

    const result = Object.keys(appMap).map((aid) => {
      const group = appMap[aid];
      const totalSales = group.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const successSales = group.payments
        .filter((p) => p.ptStatus === 'success')
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      return {
        appId: aid,
        date,
        totalTransactions: group.payments.length,
        totalSales,
        successSales,
        spend: group.spend
          ? {
              amount: group.spend.spendAmount,
              roi: group.spend.roi,
              settlement: group.spend.settlement,
            }
          : null,
        payments: group.payments.map((p) => ({
          id: p.uuid,
          status: p.ptStatus,
        })),
      };
    });

    return res.json({ date, data: result });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

