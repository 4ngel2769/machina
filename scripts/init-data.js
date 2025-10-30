#!/usr/bin/env node

/**
 * Initialize data directory and default admin user
 * Run this script on the production server after deployment
 */

const fs = require('fs');
const path = require('path');
const { initializeDefaultAdmin } = require('../lib/auth/user-storage-init.cjs');

async function main() {
  console.log('🔧 Initializing data directory...');
  
  const dataDir = path.join(process.cwd(), 'data');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✓ Created data/ directory');
  } else {
    console.log('✓ data/ directory already exists');
  }
  
  // Initialize default files
  const files = [
    'users.json',
    'containers.json',
    'vms.json',
    'quotas.json',
    'pricing-templates.json',
    'token-requests.json',
    'user-contracts.json'
  ];
  
  for (const file of files) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf-8');
      console.log(`✓ Created ${file}`);
    } else {
      console.log(`  ${file} already exists`);
    }
  }
  
  // Initialize default admin user
  console.log('\n👤 Initializing users...');
  await initializeDefaultAdmin();
  
  console.log('\n✅ Initialization complete!');
  console.log('You can now start the server with: npm start');
}

main().catch(error => {
  console.error('❌ Initialization failed:', error);
  process.exit(1);
});
