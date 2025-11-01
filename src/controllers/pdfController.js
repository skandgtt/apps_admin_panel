import PDFDocument from 'pdfkit';
import { Payment } from '../models/Payment.js';
import { UserAppAccess } from '../models/UserAppAccess.js';

// Helper to get accessible appIds for child_admin
async function getAccessibleAppIds(user) {
  if (user.role === 'admin') {
    return null; // null means all apps
  }

  const accessRecords = await UserAppAccess.find({ userId: user._id }).populate('appId');
  return accessRecords.map((a) => a.appId?.appId).filter(Boolean);
}

// Generate payments overview PDF
export async function generatePaymentsPDF(req, res) {
  const { appId, filter = 'all_time', startDate, endDate } = req.query;

  try {
    // Build filters
    let dateFilter = {};
    if (filter !== 'all_time' && filter !== 'date_range') {
      const now = new Date();
      let start, end;

      switch (filter) {
        case 'yesterday': {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          start = new Date(yesterday.setHours(0, 0, 0, 0));
          end = new Date(yesterday.setHours(23, 59, 59, 999));
          break;
        }
        case 'last_7_days': {
          start = new Date(now);
          start.setDate(start.getDate() - 7);
          start.setHours(0, 0, 0, 0);
          end = new Date(now);
          end.setHours(23, 59, 59, 999);
          break;
        }
        case 'this_month': {
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now);
          end.setHours(23, 59, 59, 999);
          break;
        }
      }
      if (start && end) {
        dateFilter.transactionDate = { $gte: start, $lte: end };
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
        return res.status(403).json({ error: 'No accessible apps' });
      }
      appFilter.appId = { $in: accessibleApps };
    }

    const queryFilter = { ...appFilter, ...dateFilter };

    // Get payment statistics
    const [stats, payments] = await Promise.all([
      Payment.aggregate([
        { $match: queryFilter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            success: {
              $sum: { $cond: [{ $eq: ['$ptStatus', 'success'] }, 1, 0] },
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$ptStatus', 'failed'] }, 1, 0] },
            },
            retry: {
              $sum: { $cond: [{ $eq: ['$ptStatus', 'retry'] }, 1, 0] },
            },
            successAmount: {
              $sum: { $cond: [{ $eq: ['$ptStatus', 'success'] }, '$amount', 0] },
            },
          },
        },
      ]),
      Payment.find(queryFilter)
        .select('uuid appId ptStatus amount transactionDate')
        .sort({ transactionDate: -1 })
        .limit(1000),
    ]);

    const statsResult = stats[0] || {
      total: 0,
      totalAmount: 0,
      success: 0,
      failed: 0,
      retry: 0,
      successAmount: 0,
    };

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payments-overview-${Date.now()}.pdf"`
    );

    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Payments Overview Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Statistics
    doc.fontSize(16).text('Summary Statistics', { underline: true });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Total Transactions: ${statsResult.total}`);
    doc.text(`Total Amount: ₹${statsResult.totalAmount.toFixed(2)}`);
    doc.text(`Success: ${statsResult.success} (₹${statsResult.successAmount.toFixed(2)})`);
    doc.text(`Failed: ${statsResult.failed}`);
    doc.text(`Retry: ${statsResult.retry}`);
    doc.moveDown(2);

    // Transactions table header
    doc.fontSize(14).text('Transaction Details', { underline: true });
    doc.moveDown();

    let yPos = doc.y;
    const tableTop = yPos;
    const itemHeight = 20;
    const pageWidth = doc.page.width - 100;
    const colWidth = pageWidth / 5;

    // Table headers
    doc.fontSize(10);
    doc.text('Transaction ID', 50, yPos, { width: colWidth });
    doc.text('App ID', 50 + colWidth, yPos, { width: colWidth });
    doc.text('Amount', 50 + colWidth * 2, yPos, { width: colWidth });
    doc.text('Status', 50 + colWidth * 3, yPos, { width: colWidth });
    doc.text('Date', 50 + colWidth * 4, yPos, { width: colWidth });

    yPos += itemHeight;

    // Table rows
    payments.forEach((payment) => {
      if (yPos > doc.page.height - 100) {
        doc.addPage();
        yPos = 50;
      }

      doc.text(payment.uuid.substring(0, 12) + '...', 50, yPos, { width: colWidth });
      doc.text(payment.appId, 50 + colWidth, yPos, { width: colWidth });
      doc.text(`₹${payment.amount.toFixed(2)}`, 50 + colWidth * 2, yPos, { width: colWidth });
      doc.text(payment.ptStatus, 50 + colWidth * 3, yPos, { width: colWidth });
      doc.text(
        new Date(payment.transactionDate).toLocaleDateString(),
        50 + colWidth * 4,
        yPos,
        { width: colWidth }
      );

      yPos += itemHeight;
    });

    doc.end();
  } catch (err) {
    return res.status(500).json({ error: 'PDF generation failed', details: err.message });
  }
}

