import type { RoutingMode } from './routing-config.js';

export class RoutingConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RoutingConfigError';
  }
}

export class UnsupportedRoutingModeError extends Error {
  constructor(readonly mode: RoutingMode) {
    super(`routing mode "${mode}" is not implemented`);
    this.name = 'UnsupportedRoutingModeError';
  }
}
