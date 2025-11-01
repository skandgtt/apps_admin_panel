import { Payment } from '../models/Payment.js';

export async function createOrUpdatePayment(req, res) {
  const { uuid, appId, ptStatus, collectionId, ant } = req.body || {};

  const missing = ['uuid', 'appId', 'ptStatus', 'collectionId', 'ant']
    .filter((k) => typeof req.body?.[k] !== 'string' || req.body[k].trim() === '');

  if (missing.length > 0) {
    return res.status(400).json({ error: 'Missing or invalid fields', fields: missing });
  }

  try {
    const updated = await Payment.findOneAndUpdate(
      { uuid },
      { uuid, appId, ptStatus, collectionId, ant },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function listPayments(req, res) {
  const { appId } = req.query;
  const filter = {};
  if (typeof appId === 'string' && appId.trim() !== '') {
    filter.appId = appId;
  }
  try {
    const payments = await Payment.find(filter).sort({ createdAt: -1 });
    return res.json({ count: payments.length, data: payments });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

export async function getPaymentByUuid(req, res) {
  const { uuid } = req.params;
  try {
    const payment = await Payment.findOne({ uuid });
    if (!payment) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: payment });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}


