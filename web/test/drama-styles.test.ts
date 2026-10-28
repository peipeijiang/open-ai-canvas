import { expect, test } from "bun:test";
import { DRAMA_STYLES, filterDramaStyles, findDramaStyle } from "@/lib/drama/drama-styles";

test("drama style ids are unique", () => {
    const ids = DRAMA_STYLES.map((style) => style.id);
    expect(new Set(ids).size).toBe(ids.length);
});

test("euro mystery style keeps its full prompt instead of the templated one", () => {
    const style = findDramaStyle("live-euro-mystery");
    expect(style?.category).toBe("live");
    expect(style?.prompt.startsWith("【项目定位】")).toBe(true);
    expect(style?.prompt).toContain("【资产与跨镜一致性】");
    expect(style?.prompt).not.toContain("题材场景：");
});

test("euro mystery style is searchable in the live category", () => {
    expect(filterDramaStyles("live", "达芬奇").map((style) => style.id)).toContain("live-euro-mystery");
    expect(filterDramaStyles("2d", "达芬奇")).toHaveLength(0);
});

test("templated styles still compile from their short fields", () => {
    const style = findDramaStyle("live-suspense");
    expect(style?.prompt).toContain("题材场景：");
});
