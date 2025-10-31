#!/usr/bin/env node

/**
 * Migration script: JSON files → MongoDB (ES Module version)
 * This script migrates all data from local JSON files to MongoDB
 */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Import models (will be dynamically imported)
const DATA_DIR = path.join(process.cwd(), 'data');

// Helper function to read JSON file
function readJSONFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  ${filename} not found, skipping...`);
    return [];
  }
  
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`  ❌ Error reading ${filename}:`, error.message);
    return [];
  }
}

// Migration functions
async function migrateUsers(UserModel) {
  console.log('\n📥 Migrating users...');
  const users = readJSONFile('users.json');
  
  if (users.length === 0) {
    console.log('  No users to migrate');
    return;
  }
  
  let migrated = 0;
  for (const user of users) {
    try {
      await UserModel.findOneAndUpdate(
        { username: user.username },
        {
          username: user.username,
          passwordHash: user.passwordHash,
          role: user.role,
          createdAt: new Date(user.createdAt),
          lastLogin: user.lastLogin ? new Date(user.lastLogin) : undefined,
        },
        { upsert: true, new: true }
      );
      migrated++;
      console.log(`  ✓ Migrated user: ${user.username}`);
    } catch (error) {
      console.error(`  ❌ Failed to migrate user ${user.username}:`, error.message);
    }
  }
  
  console.log(`  ✅ Migrated ${migrated}/${users.length} users`);
}

async function migrateContainers(ContainerModel) {
  console.log('\n📥 Migrating containers...');
  const containers = readJSONFile('containers.json');
  
  if (containers.length === 0) {
    console.log('  No containers to migrate');
    return;
  }
  
  let migrated = 0;
  for (const container of containers) {
    try {
      await ContainerModel.findOneAndUpdate(
        { id: container.id },
        {
          id: container.id,
          name: container.name,
          userId: container.userId,
          username: container.username,
          dockerImage: container.dockerImage,
          port: container.port,
          vnc: container.vnc,
          status: container.status,
          createdAt: new Date(container.createdAt),
          lastStarted: container.lastStarted ? new Date(container.lastStarted) : undefined,
          specs: container.specs,
        },
        { upsert: true, new: true }
      );
      migrated++;
      console.log(`  ✓ Migrated container: ${container.name} (${container.id})`);
    } catch (error) {
      console.error(`  ❌ Failed to migrate container ${container.id}:`, error.message);
    }
  }
  
  console.log(`  ✅ Migrated ${migrated}/${containers.length} containers`);
}

async function migrateVMs(VMModel) {
  console.log('\n📥 Migrating VMs...');
  const vms = readJSONFile('vms.json');
  
  if (vms.length === 0) {
    console.log('  No VMs to migrate');
    return;
  }
  
  let migrated = 0;
  for (const vm of vms) {
    try {
      await VMModel.findOneAndUpdate(
        { id: vm.id },
        {
          id: vm.id,
          name: vm.name,
          userId: vm.userId,
          username: vm.username,
          os: vm.os,
          vcpus: vm.vcpus,
          memory: vm.memory,
          disk: vm.disk,
          vncPort: vm.vncPort,
          vncPassword: vm.vncPassword,
          status: vm.status,
          createdAt: new Date(vm.createdAt),
          lastStarted: vm.lastStarted ? new Date(vm.lastStarted) : undefined,
          imageUrl: vm.imageUrl,
        },
        { upsert: true, new: true }
      );
      migrated++;
      console.log(`  ✓ Migrated VM: ${vm.name} (${vm.id})`);
    } catch (error) {
      console.error(`  ❌ Failed to migrate VM ${vm.id}:`, error.message);
    }
  }
  
  console.log(`  ✅ Migrated ${migrated}/${vms.length} VMs`);
}

async function migrateQuotas(QuotaModel) {
  console.log('\n📥 Migrating quotas...');
  const quotas = readJSONFile('quotas.json');
  
  if (quotas.length === 0) {
    console.log('  No quotas to migrate');
    return;
  }
  
  let migrated = 0;
  for (const quota of quotas) {
    try {
      await QuotaModel.findOneAndUpdate(
        { userId: quota.userId },
        {
          userId: quota.userId,
          username: quota.username,
          maxContainers: quota.maxContainers,
          maxVMs: quota.maxVMs,
          maxCPU: quota.maxCPU,
          maxMemory: quota.maxMemory,
          maxDisk: quota.maxDisk,
          tokenBalance: quota.tokenBalance,
          createdAt: new Date(quota.createdAt || Date.now()),
          updatedAt: new Date(quota.updatedAt || Date.now()),
        },
        { upsert: true, new: true }
      );
      migrated++;
      console.log(`  ✓ Migrated quota for: ${quota.username}`);
    } catch (error) {
      console.error(`  ❌ Failed to migrate quota for ${quota.username}:`, error.message);
    }
  }
  
  console.log(`  ✅ Migrated ${migrated}/${quotas.length} quotas`);
}

async function migratePricingTemplates(PricingTemplateModel) {
  console.log('\n📥 Migrating pricing templates...');
  const templates = readJSONFile('pricing-templates.json');
  
  if (templates.length === 0) {
    console.log('  No pricing templates to migrate');
    return;
  }
  
  let migrated = 0;
  for (const template of templates) {
    try {
      await PricingTemplateModel.findOneAndUpdate(
        { name: template.name, type: template.type },
        {
          type: template.type,
          name: template.name,
          description: template.description,
          billingType: template.billingType,
          tokenCost: template.tokenCost,
          specs: template.specs,
          active: template.active,
          featured: template.featured,
          createdAt: new Date(template.createdAt || Date.now()),
          updatedAt: new Date(template.updatedAt || Date.now()),
        },
        { upsert: true, new: true }
      );
      migrated++;
      console.log(`  ✓ Migrated template: ${template.name}`);
    } catch (error) {
      console.error(`  ❌ Failed to migrate template ${template.name}:`, error.message);
    }
  }
  
  console.log(`  ✅ Migrated ${migrated}/${templates.length} pricing templates`);
}

async function migrateTokenRequests(TokenRequestModel) {
  console.log('\n📥 Migrating token requests...');
  const requests = readJSONFile('token-requests.json');
  
  if (requests.length === 0) {
    console.log('  No token requests to migrate');
    return;
  }
  
  let migrated = 0;
  for (const request of requests) {
    try {
      await TokenRequestModel.create({
        userId: request.userId,
        username: request.username,
        amount: request.amount,
        reason: request.reason,
        status: request.status,
        createdAt: new Date(request.createdAt),
        reviewedAt: request.reviewedAt ? new Date(request.reviewedAt) : undefined,
        reviewedBy: request.reviewedBy,
        adminNotes: request.adminNotes,
      });
      migrated++;
      console.log(`  ✓ Migrated token request: ${request.username} (${request.amount} tokens)`);
    } catch (error) {
      // Skip duplicates
      if (error.code !== 11000) {
        console.error(`  ❌ Failed to migrate token request:`, error.message);
      }
    }
  }
  
  console.log(`  ✅ Migrated ${migrated}/${requests.length} token requests`);
}

async function migrateUserContracts(UserContractModel) {
  console.log('\n📥 Migrating user contracts...');
  const contracts = readJSONFile('user-contracts.json');
  
  if (contracts.length === 0) {
    console.log('  No user contracts to migrate');
    return;
  }
  
  let migrated = 0;
  for (const contract of contracts) {
    try {
      await UserContractModel.create({
        userId: contract.userId,
        username: contract.username,
        tokensPerMonth: contract.tokensPerMonth,
        durationMonths: contract.durationMonths,
        startDate: new Date(contract.startDate),
        endDate: new Date(contract.endDate),
        nextRefillDate: new Date(contract.nextRefillDate),
        status: contract.status,
        totalRefills: contract.totalRefills,
        createdAt: new Date(contract.createdAt),
        createdBy: contract.createdBy,
        notes: contract.notes,
      });
      migrated++;
      console.log(`  ✓ Migrated contract: ${contract.username} (${contract.tokensPerMonth} tokens/month)`);
    } catch (error) {
      // Skip duplicates
      if (error.code !== 11000) {
        console.error(`  ❌ Failed to migrate contract:`, error.message);
      }
    }
  }
  
  console.log(`  ✅ Migrated ${migrated}/${contracts.length} user contracts`);
}

async function main() {
  console.log('🚀 Starting migration from JSON to MongoDB...\n');
  
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env file');
    console.log('Please add: MONGODB_URI=mongodb://localhost:27017/machina');
    process.exit(1);
  }
  
  console.log(`📍 MongoDB URI: ${process.env.MONGODB_URI.replace(/\/\/.*:.*@/, '//***:***@')}`);
  console.log(`📂 Data directory: ${DATA_DIR}\n`);
  
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Import models dynamically
    const { default: UserModel } = await import('../lib/models/User.js');
    const { default: ContainerModel } = await import('../lib/models/Container.js');
    const { default: VMModel } = await import('../lib/models/VM.js');
    const { default: QuotaModel } = await import('../lib/models/Quota.js');
    const { default: PricingTemplateModel } = await import('../lib/models/PricingTemplate.js');
    const { default: TokenRequestModel } = await import('../lib/models/TokenRequest.js');
    const { default: UserContractModel } = await import('../lib/models/UserContract.js');
    
    // Run migrations
    await migrateUsers(UserModel);
    await migrateQuotas(QuotaModel);
    await migrateContainers(ContainerModel);
    await migrateVMs(VMModel);
    await migratePricingTemplates(PricingTemplateModel);
    await migrateTokenRequests(TokenRequestModel);
    await migrateUserContracts(UserContractModel);
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`  Users: ${await UserModel.countDocuments()}`);
    console.log(`  Containers: ${await ContainerModel.countDocuments()}`);
    console.log(`  VMs: ${await VMModel.countDocuments()}`);
    console.log(`  Quotas: ${await QuotaModel.countDocuments()}`);
    console.log(`  Pricing Templates: ${await PricingTemplateModel.countDocuments()}`);
    console.log(`  Token Requests: ${await TokenRequestModel.countDocuments()}`);
    console.log(`  User Contracts: ${await UserContractModel.countDocuments()}`);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

main();
