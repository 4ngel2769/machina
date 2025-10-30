import Dockerode from 'dockerode';
import { CreateContainerRequest } from '@/types/container';

// Docker client singleton
let dockerClient: Dockerode | null = null;

export function getDockerClient(): Dockerode {
  if (!dockerClient) {
    dockerClient = new Dockerode({
      // Default socket path - this will need to be configured based on OS
      socketPath: process.platform === 'win32' 
        ? '//./pipe/docker_engine' 
        : '/var/run/docker.sock'
    });
  }
  return dockerClient;
}

/**
 * Check if Docker daemon is reachable
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const docker = getDockerClient();
    await docker.ping();
    return true;
  } catch (error) {
    console.error('Docker daemon unreachable:', error);
    return false;
  }
}

/**
 * List all containers
 */
export async function listContainers(all = true) {
  try {
    const docker = getDockerClient();
    return await docker.listContainers({ all });
  } catch (error) {
    console.error('Error listing containers:', error);
    throw new Error('Failed to list containers. Is Docker daemon running?');
  }
}

/**
 * Create a new container
 */
export async function createContainer(config: CreateContainerRequest) {
  try {
    const docker = getDockerClient();
    
    // Generate container name if not provided
    const name = config.name || `${config.image.split('/').pop()?.split(':')[0]}-${Math.random().toString(36).substring(2, 8)}`;
    
    // Build port bindings
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    const exposedPorts: Record<string, Record<string, never>> = {};
    
    if (config.ports) {
      config.ports.forEach(port => {
        const key = `${port.container}/${port.protocol}`;
        exposedPorts[key] = {};
        portBindings[key] = [{ HostPort: port.host.toString() }];
      });
    }
    
    // Build environment variables
    const env = config.env ? Object.entries(config.env).map(([key, value]) => `${key}=${value}`) : [];
    
    // Create container options
    const createOptions: Dockerode.ContainerCreateOptions = {
      Image: config.image,
      name,
      Env: env,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        AutoRemove: config.type === 'amnesic', // --rm flag for amnesic containers
      },
      Tty: true,
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: [config.shell], // Default shell
    };
    
    const container = await docker.createContainer(createOptions);
    return container;
  } catch (error) {
    console.error('Error creating container:', error);
    if (error instanceof Error && error.message.includes('No such image')) {
      throw new Error(`Image "${config.image}" not found. Pull it first with: docker pull ${config.image}`);
    }
    throw new Error(`Failed to create container: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Start a container
 */
export async function startContainer(containerId: string) {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);
    await container.start();
    return { success: true };
  } catch (error) {
    console.error('Error starting container:', error);
    throw new Error(`Failed to start container: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Stop a container
 */
export async function stopContainer(containerId: string) {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);
    await container.stop({ t: 10 }); // 10 second timeout
    return { success: true };
  } catch (error) {
    console.error('Error stopping container:', error);
    throw new Error(`Failed to stop container: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Restart a container
 */
export async function restartContainer(containerId: string) {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);
    await container.restart({ t: 10 }); // 10 second timeout
    return { success: true };
  } catch (error) {
    console.error('Error restarting container:', error);
    throw new Error(`Failed to restart container: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Remove a container
 */
export async function removeContainer(containerId: string, force = false) {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);
    await container.remove({ force });
    return { success: true };
  } catch (error) {
    console.error('Error removing container:', error);
    throw new Error(`Failed to remove container: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get container logs
 */
export async function getContainerLogs(containerId: string, tail = 100) {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    });
    return logs;
  } catch (error) {
    console.error('Error getting container logs:', error);
    throw new Error(`Failed to get container logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get container stats (real-time)
 */
export async function getContainerStats(containerId: string) {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });
    return stats;
  } catch (error) {
    console.error('Error getting container stats:', error);
    throw new Error(`Failed to get container stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get container details
 */
export async function getContainerInfo(containerId: string) {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info;
  } catch (error) {
    console.error('Error getting container info:', error);
    throw new Error(`Failed to get container info: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Execute command in container
 */
export async function execInContainer(containerId: string, cmd: string[]) {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });
    return exec;
  } catch (error) {
    console.error('Error executing in container:', error);
    throw new Error(`Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

