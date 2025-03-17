import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

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

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Load users from file
function loadUsers(): User[] {
  ensureDataDir();
  
  if (!fs.existsSync(USERS_FILE)) {
    return [];
  }
  
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}

// Save users to file
function saveUsers(users: User[]): void {
  ensureDataDir();
  
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
    throw new Error('Failed to save users');
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Get all users (without passwords)
export function getAllUsers(): UserWithoutPassword[] {
  const users = loadUsers();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return users.map(({ passwordHash, ...user }) => user);
}

// Get user by username
export function getUserByUsername(username: string): User | null {
  const users = loadUsers();
  return users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
}

// Get user by ID
export function getUserById(id: string): User | null {
  const users = loadUsers();
  return users.find(u => u.id === id) || null;
}

// Create user
export async function createUser(
  username: string,
  password: string,
  role: UserRole = 'user'
): Promise<UserWithoutPassword> {
  const users = loadUsers();
  
  // Check if username already exists
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
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
  
  const newUser: User = {
    id: uuidv4(),
    username,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };
  
  users.push(newUser);
  saveUsers(users);
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword;
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
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.id === id);
  
  if (userIndex === -1) {
    throw new Error('User not found');
  }
  
  const user = users[userIndex];
  
  // Check if new username conflicts
  if (updates.username && updates.username !== user.username) {
    if (users.some(u => u.id !== id && u.username.toLowerCase() === updates.username!.toLowerCase())) {
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
  
  users[userIndex] = user;
  saveUsers(users);
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Delete user
export function deleteUser(id: string): void {
  const users = loadUsers();
  const filteredUsers = users.filter(u => u.id !== id);
  
  if (filteredUsers.length === users.length) {
    throw new Error('User not found');
  }
  
  // Prevent deleting the last admin
  const remainingAdmins = filteredUsers.filter(u => u.role === 'admin');
  if (remainingAdmins.length === 0) {
    throw new Error('Cannot delete the last admin user');
  }
  
  saveUsers(filteredUsers);
}

// Update last login
export function updateLastLogin(id: string): void {
  const users = loadUsers();
  const user = users.find(u => u.id === id);
  
  if (user) {
    user.lastLogin = new Date().toISOString();
    saveUsers(users);
  }
}

// Initialize with default admin user if no users exist
export async function initializeDefaultAdmin(): Promise<void> {
  const users = loadUsers();
  
  if (users.length === 0) {
    console.log('No users found. Creating default admin user...');
    await createUser('admin', 'admin123', 'admin');
    console.log('✓ Default admin user created (username: admin, password: admin123)');
    console.log('⚠️  IMPORTANT: Change the default password immediately!');
  }
}

// Get user count by role
export function getUserStats(): { total: number; admins: number; users: number } {
  const users = loadUsers();
  return {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    users: users.filter(u => u.role === 'user').length,
  };
}
