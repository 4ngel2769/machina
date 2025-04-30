/**
 * Database Service Layer
 * Provides unified interface for both file-based (dev) and MongoDB (production) storage
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import connectDB from './mongodb';
import { User, IUser } from './models/User';
import { GlobalSettings, UserSettings, IGlobalSettings, IUserSettings } from './models/Settings';
import { AuditLog, IAuditLog } from './models/AuditLog';
import { TokenTransaction, ITokenTransaction } from './models/TokenTransaction';
import logger from '../logger';

const USE_MONGODB = process.env.USE_MONGODB === 'true' || process.env.NODE_ENV === 'production';

// ============================================
// USER OPERATIONS
// ============================================

export async function dbGetUserByUsername(username: string): Promise<IUser | null> {
  if (!USE_MONGODB) {
    // Fallback to file-based storage
    const { getUserByUsername } = await import('../auth/user-storage');
    return getUserByUsername(username) as any;
  }

  await connectDB();
  return (await User.findOne({ username, isActive: true }).lean()) as IUser | null;
}

export async function dbGetUserById(id: string): Promise<IUser | null> {
  if (!USE_MONGODB) {
    const { getUserById } = await import('../auth/user-storage');
    return getUserById(id) as any;
  }

  await connectDB();
  return (await User.findById(id).lean()) as IUser | null;
}

export async function dbCreateUser(userData: {
  username: string;
  passwordHash: string;
  role?: 'admin' | 'user';
  tokenPlan?: string;
  email?: string;
}): Promise<IUser> {
  if (!USE_MONGODB) {
    const { createUser } = await import('../auth/user-storage');
    return createUser(userData.username, userData.passwordHash, userData.role) as any;
  }

  await connectDB();
  const user = new User(userData);
  await user.save();
  return user.toObject();
}

export async function dbUpdateUserLastLogin(userId: string): Promise<void> {
  if (!USE_MONGODB) {
    const { updateLastLogin } = await import('../auth/user-storage');
    updateLastLogin(userId);
    return;
  }

  await connectDB();
  await User.findByIdAndUpdate(userId, { lastLogin: new Date() });
}

export async function dbGetAllUsers(): Promise<IUser[]> {
  if (!USE_MONGODB) {
    const { getAllUsers } = await import('../auth/user-storage');
    return getAllUsers() as any;
  }

  await connectDB();
  return User.find({ isActive: true }).lean() as unknown as IUser[];
}

export async function dbUpdateUser(userId: string, updates: Partial<IUser>): Promise<boolean> {
  if (!USE_MONGODB) {
    const { updateUser } = await import('../auth/user-storage');
    return !!updateUser(userId, updates as any);
  }

  await connectDB();
  const result = await User.findByIdAndUpdate(userId, updates, { new: true });
  return !!result;
}

export async function dbDeleteUser(userId: string): Promise<boolean> {
  if (!USE_MONGODB) {
    const { deleteUser } = await import('../auth/user-storage');
    deleteUser(userId);
    return true;
  }

  await connectDB();
  // Soft delete
  const result = await User.findByIdAndUpdate(userId, { isActive: false });
  return !!result;
}

// ============================================
// SETTINGS OPERATIONS
// ============================================

export async function dbGetGlobalSettings(): Promise<IGlobalSettings> {
  if (!USE_MONGODB) {
    const { getGlobalSettings } = await import('../settings-storage');
    return getGlobalSettings() as any;
  }

  await connectDB();
  let settings = await GlobalSettings.findOne({ key: 'global' }).lean();
  
  if (!settings) {
    // Create default settings
    settings = await GlobalSettings.create({ key: 'global' });
  }
  
  return settings as any;
}

export async function dbSaveGlobalSettings(settings: Partial<IGlobalSettings>): Promise<boolean> {
  if (!USE_MONGODB) {
    const { saveGlobalSettings } = await import('../settings-storage');
    return saveGlobalSettings(settings as any);
  }

  await connectDB();
  const result = await GlobalSettings.findOneAndUpdate(
    { key: 'global' },
    settings,
    { upsert: true, new: true }
  );
  return !!result;
}

export async function dbGetUserSettings(userId: string): Promise<IUserSettings> {
  if (!USE_MONGODB) {
    const { getUserSettings } = await import('../settings-storage');
    return getUserSettings(userId) as any;
  }

  await connectDB();
  let settings = await UserSettings.findOne({ userId }).lean();
  
  if (!settings) {
    settings = await UserSettings.create({ userId });
  }
  
  return settings as any;
}

export async function dbSaveUserSettings(userId: string, settings: Partial<IUserSettings>): Promise<boolean> {
  if (!USE_MONGODB) {
    const { updateUserSettings } = await import('../settings-storage');
    return updateUserSettings(userId, settings as any);
  }

  await connectDB();
  const result = await UserSettings.findOneAndUpdate(
    { userId },
    settings,
    { upsert: true, new: true }
  );
  return !!result;
}

// ============================================
// AUDIT LOG OPERATIONS
// ============================================

export async function dbLogAudit(entry: Omit<IAuditLog, 'timestamp'>): Promise<void> {
  if (!USE_MONGODB) {
    const { logAudit } = await import('../audit-logger');
    await logAudit(entry as any);
    return;
  }

  try {
    await connectDB();
    await AuditLog.create({
      ...entry,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Failed to log audit entry to MongoDB', { error, entry });
  }
}

export async function dbGetAuditLogs(filters: {
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<IAuditLog[]> {
  if (!USE_MONGODB) {
    const { getAuditLogs } = await import('../audit-logger');
    return getAuditLogs(filters as any) as any;
  }

  await connectDB();
  
  const query: any = {};
  if (filters.userId) query.userId = filters.userId;
  if (filters.action) query.action = filters.action;
  if (filters.resourceType) query.resourceType = filters.resourceType;
  if (filters.startDate || filters.endDate) {
    query.timestamp = {};
    if (filters.startDate) query.timestamp.$gte = filters.startDate;
    if (filters.endDate) query.timestamp.$lte = filters.endDate;
  }

  return AuditLog.find(query)
    .sort({ timestamp: -1 })
    .limit(filters.limit || 100)
    .skip(filters.offset || 0)
    .lean();
}

export async function dbGetAuditStats(userId?: string) {
  if (!USE_MONGODB) {
    const { getAuditStats } = await import('../audit-logger');
    return getAuditStats(userId);
  }

  await connectDB();
  
  const query = userId ? { userId } : {};
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [total, successCount, failureCount, recentActions, byAction, byResourceType] = await Promise.all([
    AuditLog.countDocuments(query),
    AuditLog.countDocuments({ ...query, success: true }),
    AuditLog.countDocuments({ ...query, success: false }),
    AuditLog.countDocuments({ ...query, timestamp: { $gte: oneDayAgo } }),
    AuditLog.aggregate([
      { $match: query },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]),
    AuditLog.aggregate([
      { $match: query },
      { $group: { _id: '$resourceType', count: { $sum: 1 } } },
    ]),
  ]);

  return {
    total,
    successCount,
    failureCount,
    recentActions,
    byAction: Object.fromEntries(byAction.map((item: any) => [item._id, item.count])),
    byResourceType: Object.fromEntries(byResourceType.map((item: any) => [item._id || 'unknown', item.count])),
  };
}

// ============================================
// TOKEN TRANSACTION OPERATIONS
// ============================================

export async function dbRecordTokenTransaction(transaction: {
  userId: string;
  username: string;
  type: ITokenTransaction['type'];
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  performedBy?: string;
}): Promise<void> {
  if (!USE_MONGODB) {
    // No file-based equivalent, just log
    logger.info('Token transaction (file mode, not persisted)', transaction);
    return;
  }

  await connectDB();
  await TokenTransaction.create({
    ...transaction,
    timestamp: new Date(),
  });
}

export async function dbGetTokenTransactions(userId: string, limit = 50): Promise<ITokenTransaction[]> {
  if (!USE_MONGODB) {
    return [];
  }

  await connectDB();
  return await TokenTransaction.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
}

export async function dbUpdateTokenBalance(
  userId: string,
  amount: number,
  type: ITokenTransaction['type'],
  reason: string,
  performedBy?: string
): Promise<boolean> {
  if (!USE_MONGODB) {
    logger.warn('Token balance update not supported in file mode');
    return false;
  }

  await connectDB();
  
  const user = await User.findById(userId);
  if (!user) return false;

  const balanceBefore = user.tokenBalance;
  const balanceAfter = balanceBefore + amount;

  if (balanceAfter < 0) {
    logger.error('Insufficient token balance', { userId, balanceBefore, amount });
    return false;
  }

  user.tokenBalance = balanceAfter;
  await user.save();

  await dbRecordTokenTransaction({
    userId,
    username: user.username,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    reason,
    performedBy,
  });

  return true;
}

export { USE_MONGODB };
