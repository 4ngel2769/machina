import Dockerode from 'dockerode';
import { CreateContainerRequest } from '@/types/container';

// Docker client singleton
let dockerClient: Dockerode | null = null;

// Security: Allowed image registries (whitelist approach)
const ALLOWED_REGISTRIES = [
  'docker.io',
  'ghcr.io',
  'registry.hub.docker.com',
  'quay.io',
];

// Security: Blocked dangerous capabilities
const BLOCKED_CAPABILITIES = [
  'SYS_ADMIN',
  'SYS_MODULE',
  'SYS_RAWIO',
  'SYS_PTRACE',
  'SYS_BOOT',
  'MAC_ADMIN',
  'MAC_OVERRIDE',
  'NET_ADMIN',
];

// Security: Resource limits per container
const DEFAULT_RESOURCE_LIMITS = {
  memory: 2 * 1024 * 1024 * 1024, // 2GB
  memorySwap: 4 * 1024 * 1024 * 1024, // 4GB (memory + swap)
  cpuShares: 1024, // Default CPU weight
  cpuQuota: 100000, // 100% of one CPU
  pidsLimit: 512, // Max processes
};

/**
 * Validate container name (prevent injection attacks)
 * Docker naming rules: [a-zA-Z0-9][a-zA-Z0-9_.-]*
 * Must be at least 2 characters
 */
function validateContainerName(name: string): boolean {
  // Allow alphanumeric, hyphens, underscores, and dots
  // Must start with alphanumeric character and be at least 2 characters
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
  return validPattern.test(name) && name.length >= 2 && name.length <= 63;
}

/**
 * Validate image name and registry
 */
function validateImage(image: string): void {
  // Check for path traversal attempts
  if (image.includes('..') || image.includes('//')) {
    throw new Error('Invalid image name: path traversal detected');
  }

  // Extract registry from image name
  let registry = 'docker.io'; // default
  if (image.includes('/')) {
    const parts = image.split('/');
    if (parts[0].includes('.')) {
      registry = parts[0];
    }
  }

  // Validate against whitelist
  const isAllowed = ALLOWED_REGISTRIES.some(allowed => 
    registry === allowed || registry.endsWith(`.${allowed}`)
  );

  if (!isAllowed) {
    throw new Error(`Image registry "${registry}" not allowed. Allowed: ${ALLOWED_REGISTRIES.join(', ')}`);
  }
}

/**
 * Validate environment variables (prevent injection)
 */
function validateEnvVars(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env)) {
    // Validate key format
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      throw new Error(`Invalid environment variable name: ${key}`);
    }
    // Check for dangerous values
    if (value.includes('\n') || value.includes('\r')) {
      throw new Error(`Environment variable value contains newline: ${key}`);
    }
  }
}

export function getDockerClient(): Dockerode {
  if (!dockerClient) {
    const defaultSocket = process.platform === 'win32'
      ? '//./pipe/docker_engine'
      : '/var/run/docker.sock';

    const socketPath = process.env.DOCKER_SOCKET_PATH || defaultSocket;
    const dockerHost = process.env.DOCKER_HOST;
    const dockerPort = process.env.DOCKER_PORT;

    if (dockerHost) {
      try {
        const parsedHost = new URL(dockerHost);
        const rawProtocol = parsedHost.protocol.replace(':', '');

        if (!['http', 'https', 'tcp'].includes(rawProtocol)) {
          throw new Error(`Unsupported DOCKER_HOST protocol: ${rawProtocol}`);
        }

        const protocol = rawProtocol === 'https' ? 'https' : 'http';

        dockerClient = new Dockerode({
          protocol: protocol as 'http' | 'https',
          host: parsedHost.hostname,
          port: Number(parsedHost.port || dockerPort || (protocol === 'https' ? 2376 : 2375)),
        });
      } catch (error) {
        console.warn('Invalid DOCKER_HOST provided, falling back to socket path', error);
        dockerClient = new Dockerode({ socketPath });
      }
    } else {
      dockerClient = new Dockerode({ socketPath });
    }
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
 * Create a new container with security hardening
 */
export async function createContainer(config: CreateContainerRequest) {
  try {
    const docker = getDockerClient();
    
    // Security: Validate image
    validateImage(config.image);
    
    // Generate container name if not provided
    const baseName = config.name || `${config.image.split('/').pop()?.split(':')[0]}-${Math.random().toString(36).substring(2, 8)}`;
    
    // Security: Validate container name
    if (!validateContainerName(baseName)) {
      throw new Error('Invalid container name. Must be 2-63 characters, start with a letter or number, and contain only letters, numbers, hyphens, underscores, and dots.');
    }
    
    const name = baseName;
    
    // Build port bindings
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    const exposedPorts: Record<string, Record<string, never>> = {};
    
    if (config.ports) {
      config.ports.forEach(port => {
        // Security: Validate port numbers
        if (port.host < 1024 || port.host > 65535) {
          throw new Error(`Invalid host port: ${port.host}. Must be between 1024-65535 (unprivileged ports)`);
        }
        if (port.container < 1 || port.container > 65535) {
          throw new Error(`Invalid container port: ${port.container}`);
        }
        
        const key = `${port.container}/${port.protocol}`;
        exposedPorts[key] = {};
        portBindings[key] = [{ HostPort: port.host.toString() }];
      });
    }
    
    // Build environment variables
    let env: string[] = [];
    if (config.env) {
      // Security: Validate environment variables
      validateEnvVars(config.env);
      env = Object.entries(config.env).map(([key, value]) => `${key}=${value}`);
    }
    
    // Security: Apply resource limits
    const resourceLimits = {
      Memory: DEFAULT_RESOURCE_LIMITS.memory,
      MemorySwap: DEFAULT_RESOURCE_LIMITS.memorySwap,
      CpuShares: DEFAULT_RESOURCE_LIMITS.cpuShares,
      CpuQuota: DEFAULT_RESOURCE_LIMITS.cpuQuota,
      PidsLimit: DEFAULT_RESOURCE_LIMITS.pidsLimit,
    };
    
    // Security: Drop dangerous capabilities
    const capDrop = [...BLOCKED_CAPABILITIES, 'ALL'];
    const capAdd = ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID']; // Minimal needed caps
    
    // Security: Apply seccomp profile (default Docker seccomp)
    const securityOpt = ['no-new-privileges:true'];
    
    // Create container options with security hardening
    const createOptions: Dockerode.ContainerCreateOptions = {
      Image: config.image,
      name,
      Env: env,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        AutoRemove: config.type === 'amnesic', // --rm flag for amnesic containers
        
        // Security: Resource limits
        ...resourceLimits,
        
        // Security: Drop dangerous capabilities
        CapDrop: capDrop,
        CapAdd: capAdd,
        
        // Security: Read-only root filesystem (commented out for compatibility)
        // ReadonlyRootfs: true, // Enable if containers support it
        
        // Security: No privileged mode
        Privileged: false,
        
        // Security: Prevent new privileges
        SecurityOpt: securityOpt,
        
        // Security: Isolate network (unless ports are needed)
        // NetworkMode: config.ports && config.ports.length > 0 ? 'bridge' : 'none',
      },
      Tty: true,
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: [config.shell], // Default shell
      
      // Security: User namespace remapping (run as non-root inside container)
      // User: '1000:1000', // Uncomment to enforce non-root user
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

