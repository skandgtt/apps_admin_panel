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

// Performance API: one endpoint handling multiple filters
// Filters supported:
// last_7_days, last_15_days, last_30_days (daily buckets)
// this_month, last_month (daily buckets)
// last_6_months, this_year (monthly buckets)
export async function getPerformance(req, res) {
  const { appId, filter } = req.query;

  if (!filter) return res.status(400).json({ error: 'filter is required' });

  try {
    // Build app filter with access control
    const appFilter = {};
    if (appId) {
      appFilter.appId = appId;
      if (req.user.role === 'child_admin') {
        const accessibleApps = await getAccessibleAppIds(req.user);
        if (!accessibleApps.includes(appId)) {
          return res.status(403).json({ error: 'Access denied for this app' });
        }
      }
    } else if (req.user.role === 'child_admin') {
      const accessibleApps = await getAccessibleAppIds(req.user);
      if (accessibleApps.length === 0) {
        return res.json({ buckets: [] });
      }
      appFilter.appId = { $in: accessibleApps };
    }

    // Compute date range and bucket type
    const now = new Date();
    let start, end, bucket = 'day';

    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

    switch (filter) {
      case 'last_7_days': {
        start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0,0,0,0);
        end = new Date(now); end.setHours(23,59,59,999);
        bucket = 'day';
        break;
      }
      case 'last_15_days': {
        start = new Date(now); start.setDate(now.getDate() - 14); start.setHours(0,0,0,0);
        end = new Date(now); end.setHours(23,59,59,999);
        bucket = 'day';
        break;
      }
      case 'last_30_days': {
        start = new Date(now); start.setDate(now.getDate() - 29); start.setHours(0,0,0,0);
        end = new Date(now); end.setHours(23,59,59,999);
        bucket = 'day';
        break;
      }
      case 'this_month': {
        start = startOfMonth(now); start.setHours(0,0,0,0);
        end = endOfMonth(now);
        bucket = 'day';
        break;
      }
      case 'last_month': {
        const firstThis = startOfMonth(now);
        end = new Date(firstThis.getTime() - 1);
        start = startOfMonth(end);
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
        bucket = 'day';
        break;
      }
      case 'last_6_months': {
        const sixAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        start = sixAgo; start.setHours(0,0,0,0);
        end = endOfMonth(now);
        bucket = 'month';
        break;
      }
      case 'this_year': {
        start = new Date(now.getFullYear(), 0, 1);
        start.setHours(0,0,0,0);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        bucket = 'month';
        break;
      }
      default:
        return res.status(400).json({ error: 'Unsupported filter' });
    }

    const dateMatch = { transactionDate: { $gte: start, $lte: end } };
    const matchStage = { $match: { ...appFilter, ...dateMatch, ptStatus: 'success' } };
    const dateFormat = bucket === 'day' ? '%Y-%m-%d' : '%Y-%m';

    const agg = await Payment.aggregate([
      matchStage,
      { $group: {
          _id: { $dateToString: { format: dateFormat, date: '$transactionDate' } },
          successCount: { $sum: 1 },
          successAmount: { $sum: { $convert: { input: '$ant', to: 'int', onError: 0, onNull: 0 } } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const buckets = agg.map(a => ({
      bucket: a._id,
      successCount: a.successCount,
      successAmount: a.successAmount
    }));

    return res.json({ bucketType: bucket, start: start.toISOString(), end: end.toISOString(), buckets });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Performance hourly: last_8_hours, last_12_hours, last_24_hours
export async function getPerformanceHourly(req, res) {
  const { appId, filter } = req.query;

  if (!filter) return res.status(400).json({ error: 'filter is required' });

  try {
    // Build app filter with access control
    const appFilter = {};
    if (appId) {
      appFilter.appId = appId;
      if (req.user.role === 'child_admin') {
        const accessibleApps = await getAccessibleAppIds(req.user);
        if (!accessibleApps.includes(appId)) {
          return res.status(403).json({ error: 'Access denied for this app' });
        }
      }
    } else if (req.user.role === 'child_admin') {
      const accessibleApps = await getAccessibleAppIds(req.user);
      if (accessibleApps.length === 0) {
        return res.json({ bucketType: 'hour', buckets: [] });
      }
      appFilter.appId = { $in: accessibleApps };
    }

    const now = new Date();
    let start, end;
    switch (filter) {
      case 'last_8_hours': {
        start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
        break;
      }
      case 'last_12_hours': {
        start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        break;
      }
      case 'last_24_hours': {
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      }
      default:
        return res.status(400).json({ error: 'Unsupported filter' });
    }
    end = now;

    const dateMatch = { transactionDate: { $gte: start, $lte: end } };
    const matchStage = { $match: { ...appFilter, ...dateMatch, ptStatus: 'success' } };

    const agg = await Payment.aggregate([
      matchStage,
      { $group: {
          _id: {
            y: { $year: '$transactionDate' },
            m: { $month: '$transactionDate' },
            d: { $dayOfMonth: '$transactionDate' },
            h: { $hour: '$transactionDate' }
          },
          successCount: { $sum: 1 },
          successAmount: { $sum: { $convert: { input: '$ant', to: 'int', onError: 0, onNull: 0 } } }
        }
      },
      { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1, '_id.h': 1 } }
    ]);

    const fmt = (g) => `${g.y.toString().padStart(4,'0')}-${g.m.toString().padStart(2,'0')}-${g.d.toString().padStart(2,'0')} ${g.h.toString().padStart(2,'0')}:00`;
    const buckets = agg.map(a => ({
      bucket: fmt(a._id),
      successCount: a.successCount,
      successAmount: a.successAmount
    }));

    return res.json({ bucketType: 'hour', start: start.toISOString(), end: end.toISOString(), buckets });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

