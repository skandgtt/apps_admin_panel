import mongoose from 'mongoose';

export async function connectDB(mongoUri) {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }
  await mongoose.connect(mongoUri, {
    // Recommended options are defaults in Mongoose 6+
  });
  return mongoose.connection;
}


