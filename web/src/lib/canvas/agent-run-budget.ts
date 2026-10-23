import type { AgentPermissionMode, CreateAgentRunInput } from "@/services/api/agent";

export const DEFAULT_AGENT_MAX_GENERATION_TASKS = 20;
export const DEFAULT_AGENT_MAX_VIDEO_SECONDS = 600;
export const DEFAULT_AGENT_MAX_STEPS = 64;

/**
 * 旧后端会把缺省上限补成 0，Agent 会把它误解为“禁止生成”。
 * 因此普通运行总是发送明确的正数安全额度；只读模式才发送 0。
 */
export function agentRunBudget(input: {
    maxCredits?: number;
    maxGenerationTasks: number;
    maxVideoSeconds: number;
    permissionMode: AgentPermissionMode;
}): NonNullable<CreateAgentRunInput["budget"]> {
    const budget: NonNullable<CreateAgentRunInput["budget"]> = { maxSteps: DEFAULT_AGENT_MAX_STEPS };
    if (Number.isFinite(input.maxCredits) && Number(input.maxCredits) > 0) budget.maxCredits = Number(input.maxCredits);
    if (input.permissionMode === "read_only") return { ...budget, maxGenerationTasks: 0, maxVideoSeconds: 0 };
    budget.maxGenerationTasks = Number.isFinite(input.maxGenerationTasks) && input.maxGenerationTasks > 0 ? Math.floor(input.maxGenerationTasks) : DEFAULT_AGENT_MAX_GENERATION_TASKS;
    budget.maxVideoSeconds = Number.isFinite(input.maxVideoSeconds) && input.maxVideoSeconds > 0 ? Math.floor(input.maxVideoSeconds) : DEFAULT_AGENT_MAX_VIDEO_SECONDS;
    return budget;
}
