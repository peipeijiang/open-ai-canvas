type StorageLockOperation<T> = () => Promise<T>;

const LOCK_DATABASE_PREFIX = "yingce-cross-tab-lock-v1:";
const LOCK_STORE = "mutex";
const databases = new Map<string, Promise<IDBDatabase>>();

function openLockDatabase(name: string): Promise<IDBDatabase> {
    const cached = databases.get(name);
    if (cached) return cached;
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("当前浏览器无法使用跨标签存储锁，请启用站点存储后重试"));

    const opening = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(`${LOCK_DATABASE_PREFIX}${name}`, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(LOCK_STORE);
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => {
                databases.delete(name);
                database.close();
            };
            database.onclose = () => databases.delete(name);
            resolve(database);
        };
        request.onerror = () => reject(request.error || new Error("无法打开跨标签存储锁"));
        request.onblocked = () => reject(new Error("跨标签存储锁正在更新，请关闭旧页面后重试"));
    });
    databases.set(name, opening);
    void opening.catch(() => {
        if (databases.get(name) === opening) databases.delete(name);
    });
    return opening;
}

async function requestWithIndexedDbLock<T>(name: string, operation: StorageLockOperation<T>): Promise<T> {
    const database = await openLockDatabase(name);
    return new Promise<T>((resolve, reject) => {
        // Each lock name has its own database: artifact -> asset -> canvas locks
        // may nest, and must not wait on the same IndexedDB transaction scope.
        const transaction = database.transaction(LOCK_STORE, "readwrite");
        const store = transaction.objectStore(LOCK_STORE);
        let started = false;
        let finished = false;
        let failed = false;
        let result: T;
        let failure: unknown;

        transaction.oncomplete = () => {
            if (!finished) reject(new Error("跨标签存储锁提前释放，无法确认文件提交"));
            else if (failed) reject(failure);
            else resolve(result);
        };
        transaction.onabort = () => reject(transaction.error || new Error("跨标签存储锁事务中止"));
        transaction.onerror = () => reject(transaction.error || new Error("跨标签存储锁事务失败"));

        // A pending request keeps the readwrite transaction exclusive while
        // asynchronous file/storage operations run. No timer lease can expire
        // in a background tab and admit a second writer while the first lives.
        const keepAlive = () => {
            const request = store.get(0);
            request.onsuccess = () => {
                if (!started) {
                    started = true;
                    void Promise.resolve().then(operation).then(
                        (value) => { result = value; finished = true; },
                        (error: unknown) => { failure = error; failed = true; finished = true; },
                    );
                }
                if (!finished) keepAlive();
            };
        };
        keepAlive();
    });
}

/** Use native Web Locks on HTTPS, and IndexedDB transactions on HTTP. */
export function requestCrossTabStorageLock<T>(name: string, operation: StorageLockOperation<T>, required = true): Promise<T> {
    const locks = typeof window !== "undefined" && typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks) return locks.request(name, operation);
    if (!required || typeof window === "undefined" || typeof document === "undefined") return operation();
    return requestWithIndexedDbLock(name, operation);
}
