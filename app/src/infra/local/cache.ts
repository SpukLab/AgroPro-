import { surkaraDb } from "./db";

export async function putEntityCache<T>(
  key: string,
  entityType: string,
  entityId: string,
  payload: T,
  revision = 1
): Promise<void> {
  await surkaraDb.entityCache.put({
    key,
    entityType,
    entityId,
    revision,
    payload,
    updatedAt: new Date().toISOString()
  });
}

export async function getEntityCache<T>(key: string): Promise<T | undefined> {
  const record = await surkaraDb.entityCache.get(key);
  return record?.payload as T | undefined;
}
