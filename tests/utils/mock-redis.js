// Mock Redis pour les tests unitaires (sans dépendance Redis)
class MockRedis {
  constructor() {
    this.data = new Map();
    this.keysCache = new Map();
    this.pubSubChannels = new Map();
  }

  // GET
  async get(key) {
    return this.data.get(key) || null;
  }

  // SET
  async set(key, value) {
    this.data.set(key, value);
    return 'OK';
  }

  // SETEX (SET with expiry)
  async setex(key, seconds, value) {
    this.set(key, value);
    // Simuler l'expiration (optionnel pour les tests)
    if (this.expiryTimers) {
      setTimeout(() => this.del(key), seconds * 1000);
    }
    return 'OK';
  }

  // HSET (Hash SET)
  async hset(key, field, value) {
    if (!this.data.has(key)) {
      this.data.set(key, new Map());
    }
    const hash = this.data.get(key);
    if (hash instanceof Map) {
      hash.set(field, value);
      return 1;
    }
    return 0;
  }

  // HGET (Hash GET)
  async hget(key, field) {
    const hash = this.data.get(key);
    if (hash instanceof Map) {
      return hash.get(field) || null;
    }
    return null;
  }

  // HGETALL
  async hgetall(key) {
    const hash = this.data.get(key);
    if (hash instanceof Map) {
      const result = {};
      for (const [k, v] of hash.entries()) {
        result[k] = v;
      }
      return result;
    }
    return {};
  }

  // DEL
  async del(...keys) {
    let count = 0;
    for (const key of keys) {
      if (this.data.has(key)) {
        this.data.delete(key);
        count++;
      }
    }
    return count;
  }

  // KEYS (pattern matching)
  async keys(pattern) {
    const regex = new RegExp(
      pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
    );
    const matches = [];
    for (const key of this.data.keys()) {
      if (regex.test(key)) {
        matches.push(key);
      }
    }
    return matches;
  }

  // EXISTS
  async exists(key) {
    return this.data.has(key) ? 1 : 0;
  }

  // TTL
  async ttl(key) {
    return -1; // Pas d'expiration dans le mock
  }

  // PING
  async ping() {
    return 'PONG';
  }

  // FLUSHDB
  async flushDb() {
    this.data.clear();
    return 'OK';
  }

  // SADD (Set ADD)
  async sadd(key, ...members) {
    if (!this.data.has(key)) {
      this.data.set(key, new Set());
    }
    const set = this.data.get(key);
    if (set instanceof Set) {
      let count = 0;
      for (const member of members) {
        if (!set.has(member)) {
          set.add(member);
          count++;
        }
      }
      return count;
    }
    return 0;
  }

  // SMEMBERS
  async smembers(key) {
    const set = this.data.get(key);
    if (set instanceof Set) {
      return Array.from(set);
    }
    return [];
  }

  // SCARD
  async scard(key) {
    const set = this.data.get(key);
    if (set instanceof Set) {
      return set.size;
    }
    return 0;
  }

  // INCR
  async incr(key) {
    const current = parseInt(this.data.get(key) || '0', 10);
    const newValue = current + 1;
    this.data.set(key, newValue.toString());
    return newValue;
  }

  // DECR
  async decr(key) {
    const current = parseInt(this.data.get(key) || '0', 10);
    const newValue = current - 1;
    this.data.set(key, newValue.toString());
    return newValue;
  }

  // LPUSH
  async lpush(key, ...values) {
    if (!this.data.has(key)) {
      this.data.set(key, []);
    }
    const list = this.data.get(key);
    if (Array.isArray(list)) {
      for (const value of values) {
        list.unshift(value);
      }
      return list.length;
    }
    return 0;
  }

  // RPOP
  async rpop(key) {
    const list = this.data.get(key);
    if (Array.isArray(list) && list.length > 0) {
      return list.pop();
    }
    return null;
  }

  // LRANGE
  async lrange(key, start, stop) {
    const list = this.data.get(key);
    if (Array.isArray(list)) {
      const actualStart = start < 0 ? Math.max(0, list.length + start) : start;
      const actualStop = stop < 0 ? Math.max(0, list.length + stop) : stop;
      return list.slice(actualStart, actualStop + 1);
    }
    return [];
  }

  // LLEN
  async llen(key) {
    const list = this.data.get(key);
    if (Array.isArray(list)) {
      return list.length;
    }
    return 0;
  }

  // Publish/Subscribe (simplifié)
  async publish(channel, message) {
    const subscribers = this.pubSubChannels.get(channel) || [];
    return subscribers.length;
  }

  async subscribe(channel, callback) {
    if (!this.pubSubChannels.has(channel)) {
      this.pubSubChannels.set(channel, []);
    }
    this.pubSubChannels.get(channel).push(callback);
  }

  // Quit
  async quit() {
    return 'OK';
  }

  // Clear all data (pour les tests)
  clear() {
    this.data.clear();
    this.pubSubChannels.clear();
  }
}

module.exports = MockRedis;
