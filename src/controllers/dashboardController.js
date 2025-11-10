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

const IST_OFFSET_MINUTES = 330;

function toIST(date) {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}

function fromIST(date) {
  return new Date(date.getTime() - IST_OFFSET_MINUTES * 60 * 1000);
}

function startOfDayIST(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDayIST(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getISTDateComponents(date) {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function formatIST(date) {
  const lookup = getISTDateComponents(date);
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}+05:30`;
}

function getCurrentISTDate() {
  const now = new Date();
  const parts = getISTDateComponents(now);
  return new Date(
    parseInt(parts.year),
    parseInt(parts.month) - 1,
    parseInt(parts.day),
    parseInt(parts.hour),
    parseInt(parts.minute),
    parseInt(parts.second)
  );
}

// Helper function to get date range based on filter
function getDateRange(filter) {
  const nowUTC = new Date();
  const nowIST = toIST(nowUTC);
  let startIST, endIST;

  switch (filter) {
    case 'yesterday': {
      const yesterdayIST = new Date(nowIST);
      yesterdayIST.setDate(yesterdayIST.getDate() - 1);
      startIST = startOfDayIST(yesterdayIST);
      endIST = endOfDayIST(yesterdayIST);
      break;
    }
    case 'last_7_days': {
      endIST = endOfDayIST(nowIST);
      startIST = new Date(endIST);
      startIST.setDate(startIST.getDate() - 7);
      startIST = startOfDayIST(startIST);
      break;
    }
    case 'this_month': {
      const startMonthIST = startOfDayIST(new Date(nowIST));
      startMonthIST.setDate(1);
      startIST = startMonthIST;
      endIST = endOfDayIST(nowIST);
      break;
    }
    case 'all_time':
      return null; // No date filter
    default:
      return null;
  }

  return { startDate: fromIST(startIST), endDate: fromIST(endIST) };
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
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$transactionDate',
                timezone: 'Asia/Kolkata',
              },
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
  const { appId, filter, status = 'success' } = req.query;

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

    // Compute date range and bucket type using IST
    const nowUTC = new Date();
    const nowISTParts = getISTDateComponents(nowUTC);
    let bucket = 'day';
    
    // Create UTC dates that represent IST dates (IST is UTC+5:30)
    function createUTCFromIST(year, month, day, hour = 0, minute = 0, second = 0) {
      const istDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
      // Subtract 5.5 hours to get the UTC equivalent
      return new Date(istDate.getTime() - IST_OFFSET_MINUTES * 60 * 1000);
    }
    
    const todayYear = parseInt(nowISTParts.year);
    const todayMonth = parseInt(nowISTParts.month);
    const todayDay = parseInt(nowISTParts.day);
    
    let start;
    let end;

    switch (filter) {
      case 'last_7_days': {
        end = createUTCFromIST(todayYear, todayMonth, todayDay, 23, 59, 59);
        const startISTDay = todayDay - 7; // 7 days back from today (inclusive of today = 8 days total)
        const startDate = new Date(todayYear, todayMonth - 1, startISTDay);
        start = createUTCFromIST(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate(), 0, 0, 0);
        break;
      }
      case 'last_15_days': {
        end = createUTCFromIST(todayYear, todayMonth, todayDay, 23, 59, 59);
        const startISTDay = todayDay - 14;
        const startDate = new Date(todayYear, todayMonth - 1, startISTDay);
        start = createUTCFromIST(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate(), 0, 0, 0);
        break;
      }
      case 'last_30_days': {
        end = createUTCFromIST(todayYear, todayMonth, todayDay, 23, 59, 59);
        const startISTDay = todayDay - 29;
        const startDate = new Date(todayYear, todayMonth - 1, startISTDay);
        start = createUTCFromIST(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate(), 0, 0, 0);
        break;
      }
      case 'this_month': {
        start = createUTCFromIST(todayYear, todayMonth, 1, 0, 0, 0);
        end = createUTCFromIST(todayYear, todayMonth, todayDay, 23, 59, 59);
        break;
      }
      case 'last_month': {
        const lastMonthDate = new Date(todayYear, todayMonth - 2, 1);
        const lastMonthLastDay = new Date(todayYear, todayMonth - 1, 0).getDate();
        start = createUTCFromIST(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 1, 0, 0, 0);
        end = createUTCFromIST(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, lastMonthLastDay, 23, 59, 59);
        break;
      }
      case 'last_6_months': {
        bucket = 'month';
        end = createUTCFromIST(todayYear, todayMonth, todayDay, 23, 59, 59);
        const startDate = new Date(todayYear, todayMonth - 6, 1);
        start = createUTCFromIST(startDate.getFullYear(), startDate.getMonth() + 1, 1, 0, 0, 0);
        break;
      }
      case 'this_year': {
        bucket = 'month';
        start = createUTCFromIST(todayYear, 1, 1, 0, 0, 0);
        end = createUTCFromIST(todayYear, 12, 31, 23, 59, 59);
        break;
      }
      default:
        return res.status(400).json({ error: 'Unsupported filter' });
    }

    // Validate status without changing existing default behavior
    const allowed = ['success', 'failed', 'retry'];
    const ptStatus = allowed.includes(String(status)) ? String(status) : 'success';

    const dateMatch = { transactionDate: { $gte: start, $lte: end } };
    const matchStage = { $match: { ...appFilter, ...dateMatch, ptStatus } };
    const dateFormat = bucket === 'day' ? '%Y-%m-%d' : '%Y-%m';

    const agg = await Payment.aggregate([
      matchStage,
      { $group: {
          _id: {
            $dateToString: {
              format: dateFormat,
              date: '$transactionDate',
              timezone: 'Asia/Kolkata',
            },
          },
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

    return res.json({
      bucketType: bucket,
      start: formatIST(start),
      end: formatIST(end),
      buckets,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

// Performance hourly: last_8_hours, last_12_hours, last_24_hours
export async function getPerformanceHourly(req, res) {
  const { appId, filter, status = 'success' } = req.query;

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

    const nowUTC = new Date();
    const nowIST = toIST(nowUTC);
    let granularity = 'hour';
    let endIST = new Date(nowIST);
    let startIST;

    switch (filter) {
      case 'last_8_hours': {
        startIST = new Date(endIST.getTime() - 8 * 60 * 60 * 1000);
        break;
      }
      case 'last_12_hours': {
        startIST = new Date(endIST.getTime() - 12 * 60 * 60 * 1000);
        break;
      }
      case 'last_24_hours': {
        startIST = new Date(endIST.getTime() - 24 * 60 * 60 * 1000);
        break;
      }
      case 'last_10_min': {
        startIST = new Date(endIST.getTime() - 10 * 60 * 1000);
        granularity = 'minute';
        break;
      }
      case 'last_30_min': {
        startIST = new Date(endIST.getTime() - 30 * 60 * 1000);
        granularity = 'minute';
        break;
      }
      default:
        return res.status(400).json({ error: 'Unsupported filter' });
    }

    const start = fromIST(startIST);
    const end = fromIST(endIST);

    const allowed = ['success', 'failed', 'retry'];
    const ptStatus = allowed.includes(String(status)) ? String(status) : 'success';

    const dateMatch = { transactionDate: { $gte: start, $lte: end } };
    const matchStage = { $match: { ...appFilter, ...dateMatch, ptStatus } };

    if (granularity === 'minute') {
      const agg = await Payment.aggregate([
        matchStage,
        { $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d %H:%M',
                date: '$transactionDate',
                timezone: 'Asia/Kolkata',
              },
            },
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

      return res.json({ bucketType: 'minute', start: formatIST(start), end: formatIST(end), buckets });
    }

    const agg = await Payment.aggregate([
      matchStage,
      { $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d %H:00',
              date: '$transactionDate',
              timezone: 'Asia/Kolkata',
            },
          },
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

    return res.json({ bucketType: 'hour', start: formatIST(start), end: formatIST(end), buckets });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

