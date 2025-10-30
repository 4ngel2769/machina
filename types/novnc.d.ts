declare module '@novnc/novnc/lib/rfb' {
  export interface RFBOptions {
    shared?: boolean;
    credentials?: {
      username?: string;
      password?: string;
      target?: string;
    };
    repeaterID?: string;
    wsProtocols?: string[];
  }

  export interface RFBEvent {
    detail?: unknown;
  }

  export default class RFB {
    constructor(target: HTMLElement, url: string, options?: RFBOptions);

    // Properties
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    dragViewport: boolean;
    showDotCursor: boolean;
    viewOnly: boolean;
    focusOnClick: boolean;
    background: string;
    qualityLevel: number;
    compressionLevel: number;

    // Methods
    disconnect(): void;
    sendCredentials(credentials: { username?: string; password?: string; target?: string }): void;
    sendKey(keysym: number, code: string, down?: boolean): void;
    sendCtrlAltDel(): void;
    machineShutdown(): void;
    machineReboot(): void;
    machineReset(): void;
    clipboardPasteFrom(text: string): void;
    focus(): void;
    blur(): void;

    // Event listeners
    addEventListener(
      type: 'connect' | 'disconnect' | 'credentialsrequired' | 'securityfailure' | 'clipboard' | 'bell' | 'desktopname' | 'capabilities',
      listener: (event: RFBEvent) => void
    ): void;
    removeEventListener(
      type: 'connect' | 'disconnect' | 'credentialsrequired' | 'securityfailure' | 'clipboard' | 'bell' | 'desktopname' | 'capabilities',
      listener: (event: RFBEvent) => void
    ): void;
  }
}

// Also support .js extension
declare module '@novnc/novnc/lib/rfb.js' {
  export { default, RFBOptions, RFBEvent } from '@novnc/novnc/lib/rfb';
}
