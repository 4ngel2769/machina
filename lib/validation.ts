import { z } from 'zod';

/**
 * Container name validation
 * - Must be 1-63 characters
 * - Can contain lowercase letters, numbers, hyphens, underscores
 * - Must start with a letter or number
 */
export const containerNameSchema = z
  .string()
  .min(1, 'Container name is required')
  .max(63, 'Container name must be 63 characters or less')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    'Container name must start with a letter or number and contain only letters, numbers, hyphens, and underscores'
  );

/**
 * VM name validation
 * - Similar to container names
 */
export const vmNameSchema = z
  .string()
  .min(1, 'VM name is required')
  .max(63, 'VM name must be 63 characters or less')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    'VM name must start with a letter or number and contain only letters, numbers, hyphens, and underscores'
  );

/**
 * Port mapping validation
 */
export const portMappingSchema = z.object({
  container: z.number().int().min(1).max(65535, 'Port must be between 1 and 65535'),
  host: z.number().int().min(1).max(65535, 'Port must be between 1 and 65535'),
  protocol: z.enum(['tcp', 'udp']),
});

/**
 * Environment variable validation
 */
export const envVarSchema = z.record(
  z.string().regex(/^[A-Z_][A-Z0-9_]*$/, 'Invalid environment variable name'),
  z.string()
);

/**
 * Container creation schema
 */
export const createContainerSchema = z.object({
  name: containerNameSchema.optional(),
  image: z.string().min(1, 'Image is required'),
  type: z.enum(['normal', 'amnesic']),
  shell: z.string().min(1, 'Shell is required'),
  ports: z.array(portMappingSchema).optional(),
  env: z.record(z.string()).optional(),
});

/**
 * VM resource limits
 */
export const vmMemorySchema = z
  .number()
  .int()
  .min(512, 'Minimum memory is 512 MB')
  .max(65536, 'Maximum memory is 64 GB');

export const vmVcpusSchema = z
  .number()
  .int()
  .min(1, 'Minimum 1 vCPU')
  .max(32, 'Maximum 32 vCPUs');

export const vmDiskSizeSchema = z
  .number()
  .int()
  .min(1, 'Minimum disk size is 1 GB')
  .max(1000, 'Maximum disk size is 1000 GB');

/**
 * VM creation schema
 */
export const createVMSchema = z.object({
  name: vmNameSchema.optional(),
  installation_medium: z.object({
    type: z.enum(['download', 'local', 'url', 'pxe']),
    source: z.string().optional(),
    os_variant: z.string().optional(),
  }),
  storage: z.object({
    pool: z.string().default('default'),
    size: vmDiskSizeSchema,
    format: z.enum(['qcow2', 'raw', 'vmdk']).default('qcow2'),
  }),
  memory: vmMemorySchema,
  vcpus: vmVcpusSchema,
  network: z
    .object({
      type: z.enum(['network', 'bridge']).default('network'),
      source: z.string().default('default'),
    })
    .optional(),
});

/**
 * User creation/update schema
 */
export const userSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be 20 characters or less')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, hyphens, and underscores'
    ),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'user']).optional(),
});

export const updateUserSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be 20 characters or less')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, hyphens, and underscores'
    )
    .optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  role: z.enum(['admin', 'user']).optional(),
});

/**
 * File path validation (prevent path traversal)
 */
export const safePathSchema = z
  .string()
  .refine(
    (path) => !path.includes('..'),
    'Path cannot contain ".." (path traversal not allowed)'
  )
  .refine(
    (path) => !path.startsWith('/'),
    'Absolute paths are not allowed'
  );
