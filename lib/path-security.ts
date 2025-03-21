import path from 'path';
import fs from 'fs';

/**
 * Whitelist of allowed directories for file operations
 */
const ALLOWED_DIRECTORIES = [
  '/var/lib/libvirt/images', // VM disk images
  '/var/lib/libvirt/boot', // ISO files
  '/usr/share/virtio-win', // Windows drivers
  process.env.ISO_DIRECTORY || '/var/lib/libvirt/images', // Configurable ISO directory
];

/**
 * Check if a path is within allowed directories
 * @param filePath - The path to validate
 * @returns true if path is safe, false otherwise
 */
export function isPathSafe(filePath: string): boolean {
  try {
    // Resolve to absolute path
    const absolutePath = path.resolve(filePath);
    
    // Check if path contains traversal attempts
    if (filePath.includes('..')) {
      return false;
    }
    
    // Check if path is within allowed directories
    return ALLOWED_DIRECTORIES.some(allowedDir => {
      const resolvedAllowedDir = path.resolve(allowedDir);
      return absolutePath.startsWith(resolvedAllowedDir);
    });
  } catch (error) {
    console.error('Path validation error:', error);
    return false;
  }
}

/**
 * Sanitize a filename to prevent directory traversal and special characters
 * @param filename - The filename to sanitize
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, '') // Remove ..
    .replace(/[/\\]/g, '') // Remove slashes
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
    .substring(0, 255); // Limit length
}

/**
 * Validate and resolve a safe file path
 * @param basePath - The base directory (must be in whitelist)
 * @param relativePath - The relative path to append
 * @returns Resolved safe path or null if invalid
 */
export function resolveSafePath(basePath: string, relativePath: string): string | null {
  try {
    // Sanitize the relative path
    const sanitizedPath = relativePath.split('/').map(sanitizeFilename).join('/');
    
    // Resolve the full path
    const fullPath = path.resolve(basePath, sanitizedPath);
    
    // Verify it's still within the base path
    if (!fullPath.startsWith(path.resolve(basePath))) {
      console.warn('Path traversal attempt detected:', { basePath, relativePath, fullPath });
      return null;
    }
    
    // Verify base path is in whitelist
    if (!isPathSafe(fullPath)) {
      console.warn('Path outside allowed directories:', fullPath);
      return null;
    }
    
    return fullPath;
  } catch (error) {
    console.error('Path resolution error:', error);
    return null;
  }
}

/**
 * List files in a directory (safely)
 * @param dirPath - Directory to list
 * @returns Array of filenames or null if invalid
 */
export function listDirectorySafe(dirPath: string): string[] | null {
  try {
    // Validate path
    if (!isPathSafe(dirPath)) {
      console.warn('Attempted to list unauthorized directory:', dirPath);
      return null;
    }
    
    // Check if directory exists
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return null;
    }
    
    // List files
    return fs.readdirSync(dirPath);
  } catch (error) {
    console.error('Directory listing error:', error);
    return null;
  }
}

/**
 * Check if a file exists (safely)
 * @param filePath - File to check
 * @returns true if file exists and is accessible
 */
export function fileExistsSafe(filePath: string): boolean {
  try {
    if (!isPathSafe(filePath)) {
      return false;
    }
    
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Validate container/VM name
 * @param name - Name to validate
 * @returns true if valid
 */
export function isValidResourceName(name: string): boolean {
  // 1-63 characters
  if (name.length < 1 || name.length > 63) {
    return false;
  }
  
  // Must start with letter or number
  // Can contain letters, numbers, hyphens, underscores
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);
}

/**
 * Add a custom allowed directory (for configuration)
 * @param dirPath - Directory to add to whitelist
 */
export function addAllowedDirectory(dirPath: string): void {
  const resolved = path.resolve(dirPath);
  if (!ALLOWED_DIRECTORIES.includes(resolved)) {
    ALLOWED_DIRECTORIES.push(resolved);
  }
}

/**
 * Get list of allowed directories
 * @returns Array of allowed directory paths
 */
export function getAllowedDirectories(): string[] {
  return [...ALLOWED_DIRECTORIES];
}
