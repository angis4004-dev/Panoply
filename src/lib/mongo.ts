import mongoose from 'mongoose';
import { UserModel } from './models/user';

const cached = globalThis as typeof globalThis & {
  mongoosePromise?: Promise<typeof mongoose>;
};

export async function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    return null;
  }

  if (cached.mongoosePromise) {
    try {
      return await cached.mongoosePromise;
    } catch {
      // A previously cached connection attempt failed - clear it so we
      // retry instead of failing forever with the same stale rejection.
      cached.mongoosePromise = undefined;
    }
  }

  try {
    cached.mongoosePromise = mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || 'aegis',
    });
    return await cached.mongoosePromise;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    cached.mongoosePromise = undefined;
    return null;
  }
}

export async function getUserModel() {
  const connection = await connectToDatabase();
  if (!connection) {
    return null;
  }

  // Return the User model from our models directory
  return UserModel;
}
