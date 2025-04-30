/**
 * MongoDB Database Connection
 * Production database for users, settings, audit logs, and all persistent data
 */

import mongoose from 'mongoose';
import logger from '../logger';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://100.100.1.3:27017/machina_dev?authSource=admin';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Cache connection in development to prevent multiple connections during hot reload
let cached: MongooseCache = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      logger.info('MongoDB connected successfully', {
        host: MONGODB_URI.split('@')[1]?.split('/')[0] || 'unknown',
        database: MONGODB_URI.split('/').pop()?.split('?')[0] || 'unknown',
      });
      return mongoose;
    }).catch((error) => {
      logger.error('MongoDB connection failed', { error });
      throw error;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export async function disconnectDB() {
  if (cached.conn) {
    await cached.conn.disconnect();
    cached.conn = null;
    cached.promise = null;
    logger.info('MongoDB disconnected');
  }
}

// Handle connection events
mongoose.connection.on('connected', () => {
  logger.info('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  logger.error('Mongoose connection error', { error: err });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected from MongoDB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});

export default connectDB;
