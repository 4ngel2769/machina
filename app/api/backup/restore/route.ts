import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

const BACKUP_DIR = process.env.BACKUP_PATH || join(process.cwd(), 'data', 'backups');

// POST /api/backup/restore - Restore from backup
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filename, newName } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: 'Filename required' }, { status: 400 });
    }

    const filePath = join(BACKUP_DIR, filename);
    
    // Security check
    if (!filePath.startsWith(BACKUP_DIR)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    // Determine backup type from filename
    if (filename.includes('container_')) {
      // Restore container
      const containerName = newName || filename.split('_')[1];
      
      try {
        // Import container from tar file
        await execAsync(`docker import "${filePath}" ${containerName}:restored`);
        
        // Try to restore metadata if available
        const metadataFile = filePath.replace('.tar', '.json');
        try {
          const metadata = await readFile(metadataFile, 'utf-8');
          // Metadata contains docker inspect output - could be used to recreate with same config
          console.log('Container metadata available for manual recreation:', metadata);
        } catch {
          // Metadata file doesn't exist, that's okay
        }

        return NextResponse.json({ 
          success: true,
          message: `Container restored as ${containerName}:restored`,
          note: 'You may need to manually start the container and reconfigure settings'
        });
      } catch (error) {
        console.error('Container restore error:', error);
        return NextResponse.json(
          { error: 'Failed to restore container' },
          { status: 500 }
        );
      }
    } else if (filename.includes('vm_')) {
      // Restore VM configuration
      const vmName = newName || filename.split('_')[1];
      
      try {
        // Define VM from XML backup
        await execAsync(`virsh define "${filePath}"`);
        
        return NextResponse.json({ 
          success: true,
          message: `VM configuration restored for ${vmName}`,
          note: 'Disk images must be restored manually to the correct location'
        });
      } catch (error) {
        console.error('VM restore error:', error);
        return NextResponse.json(
          { error: 'Failed to restore VM configuration' },
          { status: 500 }
        );
      }
    } else if (filename.includes('settings_')) {
      // Restore settings
      try {
        const content = await readFile(filePath, 'utf-8');
        const allSettings = JSON.parse(content);
        
        const settingsDir = join(process.cwd(), 'data', 'settings');
        
        // Restore each settings file
        for (const [file, data] of Object.entries(allSettings)) {
          await execAsync(`echo '${JSON.stringify(data)}' > "${join(settingsDir, file)}"`);
        }

        return NextResponse.json({ 
          success: true,
          message: 'Settings restored successfully',
          filesRestored: Object.keys(allSettings).length
        });
      } catch (error) {
        console.error('Settings restore error:', error);
        return NextResponse.json(
          { error: 'Failed to restore settings' },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Unknown backup type' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error restoring backup:', error);
    return NextResponse.json(
      { error: 'Failed to restore from backup' },
      { status: 500 }
    );
  }
}
