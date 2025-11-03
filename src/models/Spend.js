import mongoose from 'mongoose';

const SpendSchema = new mongoose.Schema(
  {
    appId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    spendAmount: { type: Number, required: true },
    settlement: {
      type: String,
      enum: ['yes', 'no'],
      default: 'no',
      index: true,
    },
  },
  { timestamps: true }
);

// Index for efficient date range queries
SpendSchema.index({ appId: 1, date: -1 });

export const Spend = mongoose.model('Spend', SpendSchema);

