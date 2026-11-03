declare module '*.css';

declare module '@novnc/novnc/core/rfb.js' {
  interface RfbOptions { credentials?: Record<string, string>; }
  class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: RfbOptions);
    disconnect(): void;
    sendKey(code: string, down: boolean): void;
    scaleViewport: boolean;
    resizeSession: boolean;
    viewOnly: boolean;
  }
  export default RFB;
}
