import NodeCache from 'node-cache';

const cache = new NodeCache({
    stdTTL: 300, // 5 minutes default
    checkperiod: 60, // Check for expired keys every 60s
    useClones: false // Better performance, but be careful with mutating cached objects
});

/**
 * Cache middleware for GET requests
 * @param duration Cache duration in seconds (default 300s / 5min)
 * @param keyGenerator Optional custom key generator function
 */
export function cacheMiddleware(
    duration: number = 300,
    keyGenerator?: (req: any) => string
) {
    return (req: any, res: any, next: any) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        // Generate cache key — always scope by tenantId to prevent cross-tenant data leakage
        const key = keyGenerator
            ? keyGenerator(req)
            : `__express__${req.tenantId || 'anon'}:${req.originalUrl || req.url}`;

        // Check cache
        const cachedResponse = cache.get(key);

        if (cachedResponse) {
            console.log(`✅ Cache HIT: ${key}`);
            return res.json(cachedResponse);
        }

        console.log(`❌ Cache MISS: ${key}`);

        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json method to cache response
        res.json = (body: any) => {
            // Only cache successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                cache.set(key, body, duration);
                console.log(`💾 Cached: ${key} for ${duration}s`);
            }
            return originalJson(body);
        };

        next();
    };
}

/**
 * Clear cache for specific keys or patterns
 */
export function clearCache(pattern?: string) {
    if (!pattern) {
        cache.flushAll();
        console.log('🗑️ Cleared all cache');
        return;
    }

    const keys = cache.keys();
    const matchingKeys = keys.filter(key => key.includes(pattern));
    cache.del(matchingKeys);
    console.log(`🗑️ Cleared ${matchingKeys.length} cache entries matching: ${pattern}`);
}

/**
 * Get cache stats
 */
export function getCacheStats() {
    return {
        keys: cache.keys().length,
        hits: cache.getStats().hits,
        misses: cache.getStats().misses,
        ksize: cache.getStats().ksize,
        vsize: cache.getStats().vsize
    };
}

export default cache;
