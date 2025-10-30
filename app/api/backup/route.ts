import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

// Ensure backup directory exists
const BACKUP_DIR = process.env.BACKUP_PATH || join(process.cwd(), 'data', 'backups');

async function ensureBackupDir() {
  if (!existsSync(BACKUP_DIR)) {
    await mkdir(BACKUP_DIR, { recursive: true });
  }
}

// GET /api/backup - List all backups
export async function GET() {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureBackupDir();
    const files = await readdir(BACKUP_DIR);
    const backups = files
      .filter(f => f.endsWith('.json') || f.endsWith('.tar') || f.endsWith('.xml'))
      .map(file => {
        const parts = file.split('_');
        return {
          filename: file,
          type: file.includes('container') ? 'container' : 
                file.includes('vm') ? 'vm' : 
                file.includes('settings') ? 'settings' : 'unknown',
          timestamp: parts[parts.length - 1].replace(/\.(json|tar|xml)$/, ''),
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return NextResponse.json({ backups });
  } catch (error) {
    console.error('Error listing backups:', error);
    return NextResponse.json(
      { error: 'Failed to list backups' },
      { status: 500 }
    );
  }
}

// POST /api/backup - Create a new backup
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type, resourceId } = await request.json();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    await ensureBackupDir();

    let backupFile = '';

    switch (type) {
      case 'container': {
        // Backup container using docker export
        const containerName = resourceId;
        backupFile = join(BACKUP_DIR, `container_${containerName}_${timestamp}.tar`);
        
        try {
          await execAsync(`docker export ${containerName} > "${backupFile}"`);
          
          // Also save container metadata
          const { stdout } = await execAsync(`docker inspect ${containerName}`);
          const metadataFile = join(BACKUP_DIR, `container_${containerName}_${timestamp}.json`);
          await writeFile(metadataFile, stdout);
          
          return NextResponse.json({ 
            success: true,
            backup: {
              file: backupFile,
              metadata: metadataFile,
              type: 'container',
              timestamp
            }
          });
        } catch (error) {
          console.error('Docker export error:', error);
          return NextResponse.json(
            { error: 'Failed to backup container' },
            { status: 500 }
          );
        }
      }

      case 'vm': {
        // Backup VM configuration (XML)
        const vmName = resourceId;
        backupFile = join(BACKUP_DIR, `vm_${vmName}_${timestamp}.xml`);
        
        try {
          const { stdout } = await execAsync(`virsh dumpxml ${vmName}`);
          await writeFile(backupFile, stdout);
          
          return NextResponse.json({ 
            success: true,
            backup: {
              file: backupFile,
              type: 'vm',
              timestamp,
              note: 'VM XML configuration backed up. Disk image backup requires manual copy.'
            }
          });
        } catch (error) {
          console.error('Virsh dumpxml error:', error);
          return NextResponse.json(
            { error: 'Failed to backup VM configuration' },
            { status: 500 }
          );
        }
      }

      case 'settings': {
        // Backup all settings
        backupFile = join(BACKUP_DIR, `settings_${timestamp}.json`);
        
        try {
          const settingsDir = join(process.cwd(), 'data', 'settings');
          const userFiles = await readdir(settingsDir);
          
          const allSettings: Record<string, unknown> = {};
          for (const file of userFiles) {
            if (file.endsWith('.json')) {
              const content = await readFile(join(settingsDir, file), 'utf-8');
              allSettings[file] = JSON.parse(content);
            }
          }
          
          await writeFile(backupFile, JSON.stringify(allSettings, null, 2));
          
          return NextResponse.json({ 
            success: true,
            backup: {
              file: backupFile,
              type: 'settings',
              timestamp,
              filesBackedUp: userFiles.length
            }
          });
        } catch (error) {
          console.error('Settings backup error:', error);
          return NextResponse.json(
            { error: 'Failed to backup settings' },
            { status: 500 }
          );
        }
      }

      case 'full': {
        // Full system backup (containers + VMs + settings)
        const results = {
          containers: [] as string[],
          vms: [] as string[],
          settings: '',
        };

        try {
          // Backup all containers
          const { stdout: containers } = await execAsync('docker ps -a --format "{{.Names}}"');
          const containerList = containers.trim().split('\n').filter(Boolean);
          
          for (const container of containerList) {
            const file = join(BACKUP_DIR, `container_${container}_${timestamp}.tar`);
            await execAsync(`docker export ${container} > "${file}"`);
            results.containers.push(file);
          }

          // Backup all VMs
          const { stdout: vms } = await execAsync('virsh list --all --name');
          const vmList = vms.trim().split('\n').filter(Boolean);
          
          for (const vm of vmList) {
            const file = join(BACKUP_DIR, `vm_${vm}_${timestamp}.xml`);
            const { stdout } = await execAsync(`virsh dumpxml ${vm}`);
            await writeFile(file, stdout);
            results.vms.push(file);
          }

          // Backup settings
          const settingsFile = join(BACKUP_DIR, `settings_${timestamp}.json`);
          const settingsDir = join(process.cwd(), 'data', 'settings');
          const userFiles = await readdir(settingsDir);
          
          const allSettings: Record<string, unknown> = {};
          for (const file of userFiles) {
            if (file.endsWith('.json')) {
              const content = await readFile(join(settingsDir, file), 'utf-8');
              allSettings[file] = JSON.parse(content);
            }
          }
          
          await writeFile(settingsFile, JSON.stringify(allSettings, null, 2));
          results.settings = settingsFile;

          return NextResponse.json({ 
            success: true,
            backup: {
              type: 'full',
              timestamp,
              containers: results.containers.length,
              vms: results.vms.length,
              settingsFile: results.settings
            }
          });
        } catch (error) {
          console.error('Full backup error:', error);
          return NextResponse.json(
            { error: 'Failed to complete full backup' },
            { status: 500 }
          );
        }
      }

      default:
        return NextResponse.json(
          { error: 'Invalid backup type' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error creating backup:', error);
    return NextResponse.json(
      { error: 'Failed to create backup' },
      { status: 500 }
    );
  }
}

// DELETE /api/backup - Delete a backup
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
      return NextResponse.json({ error: 'Filename required' }, { status: 400 });
    }

    const filePath = join(BACKUP_DIR, filename);
    
    // Security check - ensure file is in backup directory
    if (!filePath.startsWith(BACKUP_DIR)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    await execAsync(`rm "${filePath}"`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting backup:', error);
    return NextResponse.json(
      { error: 'Failed to delete backup' },
      { status: 500 }
    );
  }
}
