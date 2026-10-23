import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelDefaultGrid } from "../src/pages/settings/model-default-grid";
import { createModelChannel, defaultConfig, filterModelsByCapability, inferModelCapability, managedAgentTextConfig, normalizeConfigSnapshot, selectableModelsByCapability, type ModelCapability } from "../src/stores/use-config-store";

test("ID-only provider catalogs share capability inference across settings and selectors", () => {
    const expected = {
        image: ["banana-2.1", "tt-image-2.5", "tt-image-2.5-flare", "tt-image-2.5-sunburst"],
        video: ["minimax-h3", "MiniMax-H3", "omni_flash-10s", "omni_flash-10s-fl", "omni-1.1", "omni-flash", "seedance-2.0-anci"],
        text: ["deepseek-flash", "deepseek-v4-pro", "MiniMax-M2.5", "gpt-4o-omni"],
        audio: ["gem-3.1-tts", "suno-v4.5", "suno-v6"],
    };
    const channel = createModelChannel({ id: "personal", models: Object.values(expected).flat() });
    const config = normalizeConfigSnapshot({ config: { ...defaultConfig, channels: [channel] } }).config;
    for (const [capability, models] of Object.entries(expected)) {
        for (const model of models) expect(inferModelCapability(model)).toBe(capability);
        expect(selectableModelsByCapability(config, capability as ModelCapability)).toEqual(models.map((model) => `personal::${model}`));
    }
});

test("saved capability overrides name fallback for encoded and raw channel models", () => {
    const channel = createModelChannel({
        id: "personal", models: ["custom-video-v2", "banana-2.1"],
        modelCosts: [
            { model: "custom-video-v2", capability: "text", billingMode: "fixed_request", unitPriceMicrocredits: 0 },
            { model: "banana-2.1", capability: "video", billingMode: "fixed_request", unitPriceMicrocredits: 0 },
        ],
    });
    expect(filterModelsByCapability(channel.models, "text", [channel])).toEqual(["custom-video-v2"]);
    expect(filterModelsByCapability(["personal::banana-2.1"], "video", [channel])).toEqual(["personal::banana-2.1"]);
});

test("the real model selection grid rebuilds options from current personal channels", () => {
    const system = createModelChannel({
        id: "agent", scope: "system", name: "Agent managed", models: ["agent-deepseek"],
        modelCosts: [{ model: "agent-deepseek", capability: "text", billingMode: "fixed_request", unitPriceMicrocredits: 0 }],
    });
    const config = normalizeConfigSnapshot({ config: { ...defaultConfig, channels: [system, createModelChannel({ id: "personal", name: "My channel", models: ["banana-2.1", "omni-flash", "deepseek-flash"] })] } }).config;
    config.models = ["deleted-system::old-video"];
    const html = renderToStaticMarkup(<ModelDefaultGrid config={config} onChange={() => {}} />);
    expect(html).toContain("banana-2.1");
    expect(html).toContain("omni-flash");
    expect(html).toContain("deepseek-flash");
    expect(html).not.toContain("old-video");
    expect(html).not.toContain("系统模型");
});

test("Agent gets an isolated managed text model while personal defaults stay personal", () => {
    const system = createModelChannel({
        id: "agent", scope: "system", models: ["agent-deepseek"],
        modelCosts: [{ model: "agent-deepseek", capability: "text", billingMode: "fixed_request", unitPriceMicrocredits: 0 }],
    });
    const personal = createModelChannel({ id: "personal", models: ["deepseek-flash"] });
    const config = normalizeConfigSnapshot({ config: { ...defaultConfig, channels: [system, personal], textModel: "personal::deepseek-flash" } }).config;
    const agent = managedAgentTextConfig(config);
    expect(config.textModel).toBe("personal::deepseek-flash");
    expect(config.agentTextModel).toBe("agent::agent-deepseek");
    expect(selectableModelsByCapability(agent, "text")).toEqual(["agent::agent-deepseek"]);
    expect(agent.textModel).toBe("agent::agent-deepseek");
});
