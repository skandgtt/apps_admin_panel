import mongoose from 'mongoose';

const UserAppAccessSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    appId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'App',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Ensure one user-app pair is unique
UserAppAccessSchema.index({ userId: 1, appId: 1 }, { unique: true });

export const UserAppAccess = mongoose.model('UserAppAccess', UserAppAccessSchema);

