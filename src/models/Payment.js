import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema(
  {
    uuid: { type: String, required: true, index: true, unique: true },
    appId: { type: String, required: true, index: true },
    ptStatus: {
      type: String,
      enum: ['success', 'failed', 'retry'],
      required: true,
      index: true,
    },
    collectionId: { type: String, required: true },
    ant: { type: String, required: true }, // Keeping for backward compatibility
    amount: { type: Number, required: true, index: true }, // Amount as number
    transactionDate: { type: Date, default: Date.now, index: true }, // Payment date
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', PaymentSchema);


