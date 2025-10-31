/**
 * MongoDB User authentication initialization (CommonJS)
 * This file is loaded by server.js to initialize the default admin user
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define User Schema directly here to avoid TypeScript imports
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
  },
});

// Simple connection function
async function connectToMongoDB() {
  if (!process.env.MONGODB_URI) {
    console.error('[MongoDB] MONGODB_URI not found in .env file');
    console.log('[MongoDB] Falling back to JSON file storage');
    // Fall back to JSON file storage
    const fallback = require('./user-storage-init.cjs');
    return fallback.initializeDefaultAdmin();
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
    });
    console.log('[MongoDB] Connected successfully');
    return true;
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error.message);
    console.log('[MongoDB] Falling back to JSON file storage');
    // Fall back to JSON file storage
    const fallback = require('./user-storage-init.cjs');
    return fallback.initializeDefaultAdmin();
  }
}

async function initializeDefaultAdmin() {
  // Try MongoDB first
  const connected = await connectToMongoDB();
  
  if (!connected) {
    return; // Fallback already handled
  }

  try {
    // Get or create User model
    const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
    
    // Check if any users exist
    const userCount = await UserModel.countDocuments();
    
    if (userCount === 0) {
      const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
      const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      
      console.log('[Auth] No users found. Creating default admin user...');
      
      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);
      
      // Create admin user
      await UserModel.create({
        username,
        passwordHash,
        role: 'admin',
        createdAt: new Date(),
      });
      
      console.log('[Auth] ✓ Default admin user created');
      console.log(`[Auth]   Username: ${username}`);
      console.log(`[Auth]   Password: ${password}`);
      console.log('[Auth] ⚠️  IMPORTANT: Change the default password immediately!');
    } else {
      console.log(`[Auth] ✓ Loaded ${userCount} user(s)`);
    }
  } catch (error) {
    console.error('[Auth] Failed to initialize admin:', error.message);
    throw error;
  }
}

module.exports = {
  initializeDefaultAdmin,
};
