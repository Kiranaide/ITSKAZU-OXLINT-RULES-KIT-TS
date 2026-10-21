export class KitError extends Error {
  override name = "KitError";
}

export class CancelledError extends KitError {
  override name = "CancelledError";
}

export function fail(message: string): never {
  throw new KitError(message);
}
