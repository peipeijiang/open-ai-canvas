import { afterEach, beforeEach, expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { requestCrossTabStorageLock } from "../src/services/cross-tab-storage-lock";

const original = new Map<string, PropertyDescriptor | undefined>();
const globals = ["window", "document", "navigator", "indexedDB"] as const;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
    for (const name of globals) original.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperties(globalThis, {
        window: { configurable: true, value: {} },
        document: { configurable: true, value: {} },
        navigator: { configurable: true, value: {} },
        indexedDB: { configurable: true, value: new IDBFactory() },
    });
});

afterEach(() => {
    for (const name of globals) {
        const descriptor = original.get(name);
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
    }
});

test("HTTPS keeps using the native browser lock", async () => {
    const names: string[] = [];
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
        locks: { request: async <T>(name: string, operation: () => Promise<T>) => { names.push(name); return operation(); } },
    } });
    expect(await requestCrossTabStorageLock("native", async () => 7, false)).toBe(7);
    expect(names).toEqual(["native"]);
});

test("HTTP contenders serialize complete async read-modify-write operations", async () => {
    let stored = 0;
    let active = 0;
    let peak = 0;
    await Promise.all(Array.from({ length: 5 }, () => requestCrossTabStorageLock("http-contenders", async () => {
        active++;
        peak = Math.max(peak, active);
        const previous = stored;
        await delay(15);
        stored = previous + 1;
        active--;
    })));
    expect(stored).toBe(5);
    expect(peak).toBe(1);
});

test("artifact, asset and canvas locks can nest without blocking one another", async () => {
    const result = await requestCrossTabStorageLock("artifact", () =>
        requestCrossTabStorageLock("asset", () =>
            requestCrossTabStorageLock("canvas", async () => { await delay(5); return "saved"; })));
    expect(result).toBe("saved");
});

test("failed operations release the HTTP lock and preserve even falsy errors", async () => {
    let caught = false;
    try {
        await requestCrossTabStorageLock("failed-write", async () => { await delay(5); throw undefined; });
    } catch (error) {
        caught = true;
        expect(error).toBeUndefined();
    }
    expect(caught).toBe(true);
    expect(await requestCrossTabStorageLock("failed-write", async () => "next write")).toBe("next write");
});

test("unavailable browser storage fails before a protected write starts", async () => {
    Reflect.deleteProperty(globalThis, "indexedDB");
    let entered = false;
    await expect(requestCrossTabStorageLock("storage-disabled", async () => { entered = true; })).rejects.toThrow("跨标签存储锁");
    expect(entered).toBe(false);
});
