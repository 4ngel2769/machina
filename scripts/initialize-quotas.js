#!/usr/bin/env node

/**
 * Initialize missing user quotas
 * Run this script to create quota records for users who don't have them
 */

import { getAllUsers, initializeUserQuota } from '../lib/auth/user-storage.js';
import { getAllQuotas } from '../lib/quota-system.js';

async function initializeMissingQuotas() {
  try {
    console.log('🔍 Checking for users without quotas...');

    const users = await getAllUsers();
    const existingQuotas = await getAllQuotas();
    const existingUserIds = new Set(existingQuotas.map(q => q.userId));

    const missingQuotas = users.filter(user => !existingUserIds.has(user.id));

    if (missingQuotas.length === 0) {
      console.log('✅ All users have quotas!');
      return;
    }

    console.log(`📝 Found ${missingQuotas.length} users without quotas`);

    for (const user of missingQuotas) {
      try {
        console.log(`  📝 Initializing quota for ${user.username} (${user.id})`);
        await initializeUserQuota(user.id, user.username, user.role);
        console.log(`  ✅ Created quota for ${user.username}`);
      } catch (error) {
        console.error(`  ❌ Failed to create quota for ${user.username}:`, error);
      }
    }

    console.log('🎉 Quota initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing quotas:', error);
    process.exit(1);
  }
}

initializeMissingQuotas();