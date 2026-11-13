// @novnc/novnc ships plain JS with no types. The package's "exports" map only
// exposes its root, so this is the bare-specifier form we import in the app.
declare module '@novnc/novnc' {
  export default class RFB {
    constructor(
      target: HTMLElement,
      url: string,
      options?: {
        shared?: boolean;
        credentials?: { username?: string; password?: string; target?: string };
        repeaterID?: string;
        wsProtocols?: string[];
      },
    );
    scaleViewport: boolean;
    resizeSession: boolean;
    viewOnly: boolean;
    background: string;
    disconnect(): void;
    sendCredentials(credentials: { username?: string; password?: string }): void;
    sendKey(keysym: number, code: string | null, down?: boolean): void;
    focus(): void;
    addEventListener(type: string, listener: (e: Event) => void): void;
    removeEventListener(type: string, listener: (e: Event) => void): void;
  }
}
