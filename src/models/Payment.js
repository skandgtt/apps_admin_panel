import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema(
  {
    uuid: { type: String, required: true, index: true, unique: true },
    appId: { type: String, required: true, index: true },
    ptStatus: { type: String, required: true },
    collectionId: { type: String, required: true },
    ant: { type: String, required: true },
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', PaymentSchema);


