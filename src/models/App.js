import mongoose from 'mongoose';

const AppSchema = new mongoose.Schema(
  {
    appId: { type: String, required: true, unique: true, index: true },
    appName: { type: String, required: true },
    appLogoUrl: { type: String, required: true },
  },
  { timestamps: true }
);

export const App = mongoose.model('App', AppSchema);

