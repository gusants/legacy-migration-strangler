export class RoutingConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RoutingConfigError';
  }
}

export class DuplicateRouteQueueError extends Error {
  constructor(readonly queue: string) {
    super(`routing plan targets queue "${queue}" more than once`);
    this.name = 'DuplicateRouteQueueError';
  }
}

export class MissingPrimaryTargetError extends Error {
  constructor() {
    super('routing plan has no primary target');
    this.name = 'MissingPrimaryTargetError';
  }
}
