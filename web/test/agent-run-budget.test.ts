import { describe, expect, it } from "bun:test";
import { agentRunBudget } from "../src/lib/canvas/agent-run-budget";

describe("Agent generation budget", () => {
    it("maps zero values to explicit safe defaults for older backends", () => {
        expect(agentRunBudget({ maxCredits: 200, maxGenerationTasks: 0, maxVideoSeconds: 0, permissionMode: "request_approval" })).toEqual({ maxCredits: 200, maxGenerationTasks: 20, maxVideoSeconds: 600, maxSteps: 64 });
    });

    it("keeps explicit positive limits", () => {
        expect(agentRunBudget({ maxCredits: 200, maxGenerationTasks: 3, maxVideoSeconds: 42, permissionMode: "auto" })).toEqual({ maxCredits: 200, maxGenerationTasks: 3, maxVideoSeconds: 42, maxSteps: 64 });
    });

    it("forces zero generation limits in read-only mode", () => {
        expect(agentRunBudget({ maxCredits: 200, maxGenerationTasks: 3, maxVideoSeconds: 42, permissionMode: "read_only" })).toEqual({ maxCredits: 200, maxGenerationTasks: 0, maxVideoSeconds: 0, maxSteps: 64 });
    });
});
