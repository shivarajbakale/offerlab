// A small bounded cache helper: every chaos replay is a new key, so the cache must not grow forever.

/** Set `key`, dropping the oldest entries beyond `max`. */
export function cacheSet<K, V>(map: Map<K, V>, key: K, value: V, max = 20) {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value as K);
}
