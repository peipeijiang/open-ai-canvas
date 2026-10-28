import { describe, expect, test } from "bun:test";

import {
    chapterStoryboardAssets,
    chapterStoryboardCharacters,
    chapterStoryboardReplaceImpact,
    loadAllProjectAssets,
    storyboardRowsToProjectShots,
} from "@/pages/projects/detail/chapter-storyboard-production";
import type { ProjectDetail } from "@/services/api/projects";
import type { StoryboardRow } from "@/types/canvas";

describe("章节分镜写入分镜制作", () => {
    test("将分镜任务结果完整映射为镜头脚本", () => {
        const shots = storyboardRowsToProjectShots([storyboardRow()], projectDetail());

        expect(shots).toHaveLength(1);
        expect(shots[0]).toMatchObject({
            title: "镜头01",
            description: "林默推门进入雨夜的旧屋。",
            durationMs: 5000,
            revision: {
                plotDescription: "林默推门进入雨夜的旧屋。",
                dialogue: "林默：有人吗？",
                shotSize: "中景",
                cameraAngle: "平视，35mm",
                cameraMovement: "缓慢推进",
                imagePrompt: "雨夜旧屋中的林默",
                videoPrompt: "林默推门，镜头缓慢推进\n\n【角色参考】\n林默：@[asset:character-1]\n\n【场景与道具参考】\n旧信封：@[asset:prop-1]",
                continuityNotes: "林默停在门内，右手仍扶着门把",
                actionBeats: [{ description: "0-2 秒推门；2-5 秒环顾" }],
            },
        });
        expect(shots[0].assetVersionIds).toEqual(expect.arrayContaining(["asset-version-1", "asset-version-2"]));
        expect(shots[0].revision.action).toContain("表演调度：林默谨慎推门并环顾室内");
        expect(shots[0].revision.action).toContain("声音：雨声与木门摩擦声");
    });

    test("把已确认角色和本章待确认角色交给分镜任务", () => {
        const detail = projectDetail();

        expect(chapterStoryboardCharacters(detail, "chapter-1")).toEqual([
            { assetId: "character-1", versionId: "character-version-1", name: "林默", definition: { appearance: "黑色风衣" } },
            { name: "张天昊", definition: { role: "主角" } },
        ]);
        expect(chapterStoryboardAssets(detail).map((asset) => ({ id: asset.id, type: asset.type, characterVersionId: asset.characterVersionId }))).toEqual([
            { id: "character-1", type: "character", characterVersionId: "character-version-1" },
            { id: "prop-1", type: "image", characterVersionId: undefined },
        ]);
    });

    test("文字设定的场景和道具也交给分镜任务，且仍需已确认版本", () => {
        const detail = projectDetail();
        detail.assets.push(
            { id: "scene-1", title: "走廊", mediaType: "entity", category: "environment", status: "confirmed", primaryVersionId: "scene-version-1", versionCount: 1, usages: [], position: 3, updatedAt: "" },
            { id: "entity-no-version", title: "无版本设定", mediaType: "entity", category: "prop", status: "confirmed", versionCount: 0, usages: [], position: 4, updatedAt: "" },
        );

        expect(chapterStoryboardAssets(detail).map((asset) => asset.id)).toEqual(["character-1", "prop-1", "scene-1"]);
    });

    test("读取完整项目资产时逐页合并，超过页数上限时报错而不是静默截断", async () => {
        const asset = (id: string) => ({ ...projectDetail().assets[1], id });
        const pages = [[asset("a"), asset("b")], [asset("c")]];
        const loaded = await loadAllProjectAssets(async (page) => ({ assets: pages[page - 1], hasMore: page < pages.length }));
        expect(loaded.map((item) => item.id)).toEqual(["a", "b", "c"]);
        await expect(loadAllProjectAssets(async () => ({ assets: [asset("x")], hasMore: true }), 3)).rejects.toThrow("项目资产过多");
    });

    test("替换确认统计该章会被删除的关联数据", () => {
        expect(chapterStoryboardReplaceImpact(projectDetail(), "chapter-1")).toEqual({
            shotCount: 1,
            revisionCount: 1,
            referenceCount: 1,
            artifactCount: 1,
            candidateCount: 1,
        });
    });
});

function storyboardRow(): StoryboardRow {
    return {
        id: "row-1", shotNumber: 1, durationSeconds: 5,
        plotDescription: "林默推门进入雨夜的旧屋。", dialogue: "林默：有人吗？", characters: [{ characterName: "林默", characterAssetId: "character-1", characterVersionId: "character-version-1" }],
        narrativeIntent: "建立悬念", viewerPOV: "跟随林默", performanceBlocking: "林默谨慎推门并环顾室内",
        shotSize: "中景", emotion: "戒备", lightingAndAtmosphere: "冷色月光与室内暖光交界", audioEffects: "雨声与木门摩擦声",
        camera: "平视，35mm", motion: "缓慢推进", timeBeats: "0-2 秒推门；2-5 秒环顾",
        imageGenerationPrompt: "雨夜旧屋中的林默", videoMotionPrompt: "林默推门，镜头缓慢推进",
        mustHave: [], optionalDetails: [], continuityOut: "林默停在门内，右手仍扶着门把", negativePrompt: "画面文字", assetBindings: [{ nodeId: "prop-1", role: "prop", priority: 80 }],
    };
}

function projectDetail(): ProjectDetail {
    return {
        project: { id: "project-1", userId: "user-1", name: "雨夜", type: "short_drama", aspectRatio: "16:9", sourceType: "novel", description: "", stylePresetId: "urban-live-action", status: "active", revision: 1, createdAt: "", updatedAt: "" },
        units: [], canvases: [], canvasUnitLinks: [], assetFolders: [], workflows: [],
        assets: [
            { id: "character-1", title: "林默", mediaType: "image", category: "character", status: "ready", primaryVersionId: "asset-version-1", versionCount: 1, usages: [], position: 0, updatedAt: "", character: { versionId: "character-version-1", version: 1, definition: { appearance: "黑色风衣" }, representations: [], visualStatus: "ready", voiceStatus: "missing" } },
            { id: "prop-1", title: "旧信封", mediaType: "image", category: "prop", status: "ready", primaryVersionId: "asset-version-2", versionCount: 1, usages: [], position: 1, previewText: "泛黄的旧信封", updatedAt: "" },
            { id: "draft-prop", title: "未完成道具", mediaType: "image", category: "prop", status: "draft", versionCount: 0, usages: [], position: 2, updatedAt: "" },
        ],
        shots: [{ id: "shot-1", projectId: "project-1", unitId: "chapter-1", currentRevisionId: "revision-1", title: "SC.01", description: "旧分镜", position: 0, durationMs: 3000, status: "draft", createdAt: "", updatedAt: "" }],
        shotRevisions: [{ id: "revision-1", shotId: "shot-1", version: 1, plotDescription: "旧分镜", action: "", dialogue: "", shotSize: "", cameraAngle: "", cameraMovement: "", durationMs: 3000, imagePrompt: "", videoPrompt: "", negativePrompt: "", continuityNotes: "", actionBeatsJson: "[]", createdAt: "" }],
        shotArtifacts: [{ id: "artifact-1", projectId: "project-1", unitId: "chapter-1", shotId: "shot-1", type: "storyboard", version: 1, status: "ready", selected: true, metadataJson: "{}", createdAt: "", updatedAt: "" }],
        shotReferences: [{ id: "reference-1", shotId: "shot-1", assetVersionId: "asset-version-1", role: "reference", status: "linked", createdAt: "" }],
        assetCandidates: [
            { id: "candidate-1", projectId: "project-1", unitId: "chapter-1", shotId: "shot-1", name: "雨伞", category: "prop", status: "pending_confirmation", detailsJson: "{}", createdAt: "", updatedAt: "" },
            { id: "candidate-character-1", projectId: "project-1", unitId: "chapter-1", name: "张天昊", category: "character", status: "pending_confirmation", detailsJson: JSON.stringify({ role: "主角" }), createdAt: "", updatedAt: "" },
            { id: "candidate-character-other", projectId: "project-1", unitId: "chapter-2", name: "另一章角色", category: "character", status: "pending_confirmation", detailsJson: "{}", createdAt: "", updatedAt: "" },
        ],
    };
}
