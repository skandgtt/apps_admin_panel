import mongoose from 'mongoose';

const CollectionSchema = new mongoose.Schema(
  {
    appId: { type: String, required: true, index: true },
    collectionId: { type: String, required: true },
    tag: {
      type: String,
      required: true,
      enum: ['primary', 'retry', 'backup', 'custom'],
      default: 'primary',
      index: true,
    },
    number: { type: Number, default: 1, index: true }, // slot position per tag
  },
  { timestamps: true }
);

// Ensure uniqueness by slot per app (numbers 1..5)
CollectionSchema.index({ appId: 1, number: 1 }, { unique: true });
// Also guard against duplicate IDs for an app
CollectionSchema.index({ appId: 1, collectionId: 1 }, { unique: true });

export const Collection = mongoose.model('Collection', CollectionSchema);

