import bcrypt from 'bcryptjs';
import connectDB from '../mongoose';
import UserModel, { IUser } from '../models/User';

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  lastLogin?: string;
}

export type UserWithoutPassword = Omit<User, 'passwordHash'>;

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Get all users (without passwords)
export async function getAllUsers(): Promise<UserWithoutPassword[]> {
  await connectDB();
  const users = await UserModel.find({}).sort({ createdAt: -1 }).lean<IUser[]>();
  
  return users.map(user => ({
    id: (user._id as any).toString(),
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    lastLogin: user.lastLogin?.toISOString(),
  }));
}

// Get user by username
export async function getUserByUsername(username: string): Promise<User | null> {
  await connectDB();
  const user = await UserModel.findOne({ 
    username: { $regex: new RegExp(`^${username}$`, 'i') } 
  }).lean<IUser>();
  
  if (!user) return null;
  
  return {
    id: (user._id as any).toString(),
    username: user.username,
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    lastLogin: user.lastLogin?.toISOString(),
  };
}

// Get user by ID
export async function getUserById(id: string): Promise<User | null> {
  await connectDB();
  const user = await UserModel.findById(id).lean<IUser>();
  
  if (!user) return null;
  
  return {
    id: (user._id as any).toString(),
    username: user.username,
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    lastLogin: user.lastLogin?.toISOString(),
  };
}

// Create user
export async function createUser(
  username: string,
  password: string,
  role: UserRole = 'user'
): Promise<UserWithoutPassword> {
  await connectDB();
  
  // Check if username already exists
  const existing = await UserModel.findOne({ 
    username: { $regex: new RegExp(`^${username}$`, 'i') } 
  });
  
  if (existing) {
    throw new Error('Username already exists');
  }
  
  // Validate username
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
    throw new Error('Username must be 3-20 characters and contain only letters, numbers, hyphens, and underscores');
  }
  
  // Validate password
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  
  const passwordHash = await hashPassword(password);
  
  const newUser = await UserModel.create({
    username,
    passwordHash,
    role,
    createdAt: new Date(),
  });
  
  return {
    id: newUser._id.toString(),
    username: newUser.username,
    role: newUser.role,
    createdAt: newUser.createdAt.toISOString(),
    lastLogin: newUser.lastLogin?.toISOString(),
  };
}

// Update user
export async function updateUser(
  id: string,
  updates: {
    username?: string;
    password?: string;
    role?: UserRole;
  }
): Promise<UserWithoutPassword> {
  await connectDB();
  
  const user = await UserModel.findById(id);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Check if new username conflicts
  if (updates.username && updates.username !== user.username) {
    const existing = await UserModel.findOne({
      _id: { $ne: id },
      username: { $regex: new RegExp(`^${updates.username}$`, 'i') }
    });
    
    if (existing) {
      throw new Error('Username already exists');
    }
    
    // Validate username
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(updates.username)) {
      throw new Error('Username must be 3-20 characters and contain only letters, numbers, hyphens, and underscores');
    }
    
    user.username = updates.username;
  }
  
  // Update password
  if (updates.password) {
    if (updates.password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    user.passwordHash = await hashPassword(updates.password);
  }
  
  // Update role
  if (updates.role) {
    user.role = updates.role;
  }
  
  await user.save();
  
  return {
    id: user._id.toString(),
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    lastLogin: user.lastLogin?.toISOString(),
  };
}

// Delete user
export async function deleteUser(id: string): Promise<void> {
  await connectDB();
  
  const user = await UserModel.findById(id);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Prevent deleting the last admin
  const adminCount = await UserModel.countDocuments({ role: 'admin' });
  if (user.role === 'admin' && adminCount <= 1) {
    throw new Error('Cannot delete the last admin user');
  }
  
  await UserModel.findByIdAndDelete(id);
}

// Update last login
export async function updateLastLogin(id: string): Promise<void> {
  await connectDB();
  await UserModel.findByIdAndUpdate(id, { lastLogin: new Date() });
}

// Initialize with default admin user if no users exist
export async function initializeDefaultAdmin(): Promise<void> {
  await connectDB();
  
  const userCount = await UserModel.countDocuments();
  
  if (userCount === 0) {
    const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    
    console.log('[Auth] No users found. Creating default admin user...');
    await createUser(username, password, 'admin');
    console.log('[Auth] ✓ Default admin user created');
    console.log(`[Auth]   Username: ${username}`);
    console.log(`[Auth]   Password: ${password}`);
    console.log('[Auth] ⚠️  IMPORTANT: Change the default password immediately!');
  } else {
    console.log(`[Auth] ✓ Loaded ${userCount} user(s)`);
  }
}
