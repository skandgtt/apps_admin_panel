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
  },
  { timestamps: true }
);

// Ensure unique combination of appId and collectionId
CollectionSchema.index({ appId: 1, collectionId: 1 }, { unique: true });

export const Collection = mongoose.model('Collection', CollectionSchema);

