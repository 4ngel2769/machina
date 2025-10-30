/**
 * User authentication and storage initialization (CommonJS)
 * This file is loaded by server.js to initialize the default admin user
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Load users from file
function loadUsers() {
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
function saveUsers(users) {
  ensureDataDir();
  
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
    throw new Error('Failed to save users');
  }
}

// Hash password
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// Create user
async function createUser(username, password, role = 'user') {
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
  
  const newUser = {
    id: uuidv4(),
    username,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };
  
  users.push(newUser);
  saveUsers(users);
  
  const { passwordHash: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword;
}

// Initialize with default admin user if no users exist
async function initializeDefaultAdmin() {
  const users = loadUsers();
  
  if (users.length === 0) {
    const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    
    console.log('[Auth] No users found. Creating default admin user...');
    await createUser(username, password, 'admin');
    console.log('[Auth] ✓ Default admin user created');
    console.log(`[Auth]   Username: ${username}`);
    console.log(`[Auth]   Password: ${password}`);
    console.log('[Auth] ⚠️  IMPORTANT: Change the default password immediately!');
  } else {
    console.log(`[Auth] ✓ Loaded ${users.length} user(s)`);
  }
}

module.exports = {
  initializeDefaultAdmin,
  loadUsers,
  createUser,
  hashPassword,
};
