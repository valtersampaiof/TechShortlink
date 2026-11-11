// Cache LRU (Least Recently Used). Um Map do JS lembra a ordem de inserção,
// então a primeira chave do Map é sempre a menos usada recentemente.
export class LruCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key); // remove e reinsere para virar o "mais recente"
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      this.map.delete(this.map.keys().next().value); // expulsa o mais antigo
    }
  }
}
