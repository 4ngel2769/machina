/**
 * MongoDB User authentication initialization (CommonJS)
 * This file is loaded by server.js to initialize the default admin user
 */

const mongoose = require('mongoose');

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
    // Use the MongoDB user storage
    const { initializeDefaultAdmin: mongoInit } = require('./user-storage');
    await mongoInit();
  } catch (error) {
    console.error('[Auth] Failed to initialize admin:', error.message);
    throw error;
  }
}

module.exports = {
  initializeDefaultAdmin,
};
