/**
 * Every libvirt domain on the host, not just machina's.
 *
 * Machina owns some of these (it created them from an instance row) and the
 * operator owns the rest. Both are shown, but ownership is carried explicitly
 * because it decides how a VM may be removed: a machina VM is deleted through
 * its instance row (which also frees the IP, the overlay and the seed), while a
 * foreign domain is just undefine.
 *
 * Split by concern: types, XML scraping, the list, the detail page, the config
 * edits and the one-shot management calls. Callers keep importing this path.
 */
export * from './domains/types';
export * from './domains/list';
export * from './domains/detail';
export * from './domains/ops';
export * from './domains/manage';
