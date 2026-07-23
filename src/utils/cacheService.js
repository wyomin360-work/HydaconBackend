const redis = require("../config/redis");

const localCache = new Map();

/**
 * Retrieve value by key from cache.
 * Falls back to local in-memory Map if Redis is not available.
 * 
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function get(key) {
  try {
    if (redis && redis.status === "ready") {
      return await redis.get(key);
    }
  } catch (err) {
    // Suppress error and fall back to local memory
  }
  return localCache.get(key) || null;
}

/**
 * Increment key value in cache.
 * Falls back to local in-memory Map if Redis is not available.
 * 
 * @param {string} key
 * @returns {Promise<number>} The updated incremented value
 */
async function incr(key) {
  try {
    if (redis && redis.status === "ready") {
      return await redis.incr(key);
    }
  } catch (err) {
    // Suppress error and fall back to local memory
  }
  const val = (parseInt(localCache.get(key) || 0)) + 1;
  localCache.set(key, val.toString());
  return val;
}

/**
 * Set value by key in cache.
 * Falls back to local in-memory Map if Redis is not available.
 * 
 * @param {string} key
 * @param {string|number} value
 * @returns {Promise<void>}
 */
async function set(key, value) {
  try {
    if (redis && redis.status === "ready") {
      await redis.set(key, value.toString());
      return;
    }
  } catch (err) {
    // Suppress error
  }
  localCache.set(key, value.toString());
}

/**
 * Retrieve key value, or initialize it from database callback on cache miss.
 * 
 * @param {string} key
 * @param {Function} dbQueryCallback
 * @returns {Promise<number>} The cached or initialized value
 */
async function getOrInitialize(key, dbQueryCallback) {
  const cachedVal = await get(key);
  if (cachedVal !== null) {
    return parseInt(cachedVal, 10);
  }
  const dbVal = await dbQueryCallback();
  await set(key, dbVal);
  return dbVal;
}

module.exports = {
  get,
  set,
  incr,
  getOrInitialize,
  _localCache: localCache, // Exposed for test resetting
};
