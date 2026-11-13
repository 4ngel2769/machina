/**
 * Minimal ambient declarations for bun's builtin test runner.
 *
 * `bun test` is the project's runner (CONTRIBUTING.md §1) and bun ships its
 * types with the binary rather than as an installable @types package.
 * Declaring only what the test files use keeps `tsc --noEmit` honest without
 * adding a dependency.
 */
declare module 'bun:test' {
  type TestBody = () => void | Promise<void>;

  interface Matchers {
    readonly not: Matchers;
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeDefined(): void;
    toContain(expected: string): void;
  }

  export function describe(name: string, body: () => void): void;
  export function test(name: string, body: TestBody): void;
  export function it(name: string, body: TestBody): void;
  export function beforeEach(body: TestBody): void;
  export function afterEach(body: TestBody): void;
  export function expect(actual: unknown): Matchers;
}
