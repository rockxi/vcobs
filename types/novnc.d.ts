declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: { credentials?: Record<string, string> });
    scaleViewport: boolean;
    clipViewport: boolean;
    _isSupportedSecurityType(type: number): boolean;
    disconnect(): void;
    sendCredentials(credentials: { password?: string; username?: string; target?: string }): void;
  }
}
