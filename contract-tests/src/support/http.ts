import { TARGET_URL } from '../target.js';
import type { ChargeMessage, ChargeResult } from './contract.js';

export interface HttpResponse<T> {
  status: number;
  body: T;
}

export async function postRaw(body: string): Promise<HttpResponse<unknown>> {
  const response = await fetch(`${TARGET_URL}/charges/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return { status: response.status, body: await response.json() };
}

export async function processCharge(message: ChargeMessage): Promise<ChargeResult> {
  const response = await postRaw(JSON.stringify(message));
  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body as ChargeResult;
}
