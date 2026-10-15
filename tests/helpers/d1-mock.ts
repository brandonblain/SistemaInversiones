import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createTestD1Database(): D1Database {
  const sqlite = new Database(':memory:');
  // Habilitar foreign keys en SQLite
  sqlite.pragma('foreign_keys = ON');

  const migrationPath = join(process.cwd(), 'migrations', '0001_initial_schema.sql');
  const migrationSql = readFileSync(migrationPath, 'utf8');
  sqlite.exec(migrationSql);

  const wrapPreparedStatement = (query: string, values: unknown[] = []): D1PreparedStatement => {
    return {
      bind(...newValues: unknown[]) {
        return wrapPreparedStatement(query, newValues);
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const stmt = sqlite.prepare(query);
        const row = stmt.get(...values) as Record<string, unknown> | undefined;
        if (!row) return null;
        if (colName) return (row[colName] as T) ?? null;
        return row as T;
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        const stmt = sqlite.prepare(query);
        const results = stmt.all(...values) as T[];
        return {
          results,
          success: true,
          meta: {
            duration: 0,
            rows_read: results.length,
            rows_written: 0,
            last_row_id: 0,
            changed_db: false,
            size_after: 0,
            changes: 0
          }
        };
      },
      async run(): Promise<D1Response> {
        const stmt = sqlite.prepare(query);
        const info = stmt.run(...values);
        return {
          success: true,
          meta: {
            duration: 0,
            rows_read: 0,
            rows_written: info.changes,
            last_row_id: Number(info.lastInsertRowid),
            changed_db: info.changes > 0,
            size_after: 0,
            changes: info.changes
          }
        };
      },
      async raw<T = unknown[]>(): Promise<T[]> {
        const stmt = sqlite.prepare(query);
        return stmt.raw(true).all(...values) as T[];
      }
    } as unknown as D1PreparedStatement;
  };

  const d1Mock = {
    prepare(query: string) {
      return wrapPreparedStatement(query, []);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      for (const stmt of statements) {
        const res = await stmt.all<T>();
        results.push(res);
      }
      return results;
    },
    async exec(query: string): Promise<D1ExecResult> {
      sqlite.exec(query);
      return { count: 1, duration: 0 };
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    }
  };

  return d1Mock as unknown as D1Database;
}

export function createTestR2Bucket(): R2Bucket {
  const store = new Map<string, { data: Uint8Array; metadata: Record<string, unknown>; contentType: string }>();

  return {
    async put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions): Promise<R2Object> {
      let bytes: Uint8Array;
      if (typeof value === 'string') {
        bytes = new TextEncoder().encode(value);
      } else if (value instanceof Uint8Array) {
        bytes = value;
      } else if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value);
      } else if (ArrayBuffer.isView(value)) {
        bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      } else {
        bytes = new Uint8Array(0);
      }

      const contentType = (options?.httpMetadata as { contentType?: string })?.contentType || 'application/octet-stream';
      store.set(key, { data: bytes, metadata: options?.customMetadata || {}, contentType });

      return {
        key,
        version: '1',
        size: bytes.byteLength,
        etag: 'mock-etag',
        httpEtag: 'mock-http-etag',
        uploaded: new Date(),
        httpMetadata: { contentType },
        customMetadata: options?.customMetadata || {},
        writeHttpMetadata: () => {}
      } as unknown as R2Object;
    },
    async get(key: string): Promise<R2ObjectBody | null> {
      const item = store.get(key);
      if (!item) return null;

      return {
        key,
        version: '1',
        size: item.data.byteLength,
        etag: 'mock-etag',
        httpEtag: 'mock-http-etag',
        uploaded: new Date(),
        httpMetadata: { contentType: item.contentType },
        customMetadata: item.metadata,
        writeHttpMetadata: () => {},
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(item.data);
            controller.close();
          }
        }),
        bodyUsed: false,
        arrayBuffer: async () => item.data.buffer.slice(item.data.byteOffset, item.data.byteOffset + item.data.byteLength),
        text: async () => new TextDecoder().decode(item.data),
        json: async () => JSON.parse(new TextDecoder().decode(item.data)),
        blob: async () => new Blob([item.data])
      } as unknown as R2ObjectBody;
    },
    async delete(keys: string | string[]): Promise<void> {
      const keysArr = Array.isArray(keys) ? keys : [keys];
      for (const k of keysArr) {
        store.delete(k);
      }
    },
    async head(key: string): Promise<R2Object | null> {
      const item = store.get(key);
      if (!item) return null;
      return {
        key,
        version: '1',
        size: item.data.byteLength,
        etag: 'mock-etag',
        httpEtag: 'mock-http-etag',
        uploaded: new Date(),
        httpMetadata: { contentType: item.contentType },
        customMetadata: item.metadata,
        writeHttpMetadata: () => {}
      } as unknown as R2Object;
    },
    async list(): Promise<R2Objects> {
      const objects: R2Object[] = [];
      for (const [key, item] of store.entries()) {
        objects.push({
          key,
          version: '1',
          size: item.data.byteLength,
          etag: 'mock-etag',
          httpEtag: 'mock-http-etag',
          uploaded: new Date(),
          httpMetadata: { contentType: item.contentType },
          customMetadata: item.metadata,
          writeHttpMetadata: () => {}
        } as unknown as R2Object);
      }
      return {
        objects,
        truncated: false,
        cursor: undefined,
        delimitedPrefixes: []
      } as unknown as R2Objects;
    }
  } as unknown as R2Bucket;
}
