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
    readonly rejects: Matchers;
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeDefined(): void;
    toContain(expected: string): void;
    toMatchObject(expected: object): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledTimes(expected: number): void;
    toThrow(expected?: string | RegExp): void;
  }

  export interface MockedFunction<Args extends unknown[], Result> {
    (...args: Args): Result;
    mockClear(): void;
    readonly mock: { readonly calls: Args[] };
  }

  export const mock: {
    <Args extends unknown[], Result>(implementation: (...args: Args) => Result): MockedFunction<Args, Result>;
    module(name: string, factory: () => Record<string, unknown>): void;
  };

  export function describe(name: string, body: () => void): void;
  export function test(name: string, body: TestBody): void;
  export function it(name: string, body: TestBody): void;
  export function beforeEach(body: TestBody): void;
  export function afterEach(body: TestBody): void;
  export function expect(actual: unknown): Matchers;
}
