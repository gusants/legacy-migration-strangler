import { decideRoute } from './decide-route.js';
import type { RoutePlanner } from './route-planner.js';

export const pureRoutePlanner: RoutePlanner = {
  plan: async (message, config) => decideRoute(message, config),
};
