import { groupModelsByDisplayName, isDirectSystemModel, type DisplayModelGroup } from "@/lib/model-selection";
import { modelIcon, modelOptionName, PUBLIC_MODEL_CATALOG_ID, resolveModelChannel, type AiConfig } from "@/stores/use-config-store";

export type ModelPickerGroup = {
    key: string;
    label: string;
    icon: string;
    scope: string;
    kind: "product" | "channel";
    models: DisplayModelGroup[];
};

export { isDirectSystemModel } from "@/lib/model-selection";

export function modelChannelLabel(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(value));
    if (channel.scope === "system") return cost?.channelLabel?.trim() || modelOptionName(value);
    return cost?.channelLabel?.trim() || channel.name || "未命名渠道";
}

// 一级按已设置的模型展示名跨渠道聚合，空值归入未分类；二级保留独立调用与售价。
export function groupModelsForPicker(config: AiConfig, options: string[]): ModelPickerGroup[] {
    const groups = new Map<string, ModelPickerGroup>();
    for (const channel of config.channels) {
        const models = options.filter((value) => resolveModelChannel(config, value).id === channel.id);
        const directModels = models.filter((value) => isDirectSystemModel(config, value));
        const directLabel = (value: string) => channel.modelCosts?.find((item) => item.model === modelOptionName(value))?.displayName?.trim() || "未分类";
        const directLabelCounts = new Map<string, number>();
        for (const value of directModels) directLabelCounts.set(directLabel(value), (directLabelCounts.get(directLabel(value)) || 0) + 1);
        const channelVariants = directModels.length > 1 && directModels.every((value) => directLabelCounts.get(directLabel(value)) === 1);
        if (channelVariants) {
            // 同一系统渠道下彼此不重名的直连模型归为一组：左侧显示渠道名，右侧按模型区分，
            // 如 X-MiniMaxH3 的 FL/Ref、Base/Turbo 四个模型共用一个渠道。
            // 同名模型跨渠道时仍按展示名合并，保留不同渠道的价格对照。
            const key = JSON.stringify(["product-channel", channel.id]);
            groups.set(key, {
                key,
                label: channel.name?.trim() || modelChannelLabel(config, directModels[0]) || "系统模型",
                icon: modelIcon(config, directModels[0]),
                scope: "平台服务",
                kind: "product",
                models: directModels.map((value) => ({
                    key: value,
                    label: channel.modelCosts?.find((item) => item.model === modelOptionName(value))?.displayName?.trim() || modelOptionName(value),
                    models: [value],
                })),
            });
        } else {
            for (const value of directModels) {
                const label = directLabel(value);
                const key = JSON.stringify(["product", label]);
                let group = groups.get(key);
                if (!group) {
                    group = { key, label, icon: modelIcon(config, value), scope: "平台服务", kind: "product", models: [] };
                    groups.set(key, group);
                }
                group.models.push({ key: value, label: modelChannelLabel(config, value), models: [value] });
            }
        }
        const otherModels = models.filter((value) => !isDirectSystemModel(config, value));
        if (otherModels.length) {
            const key = JSON.stringify(["channel", channel.id]);
            groups.set(key, {
                key,
                label: channel.scope === "system" ? "系统模型" : channel.name || "未命名渠道",
                icon: modelIcon(config, otherModels[0]),
                scope: channel.id === PUBLIC_MODEL_CATALOG_ID ? "" : "我的模型",
                kind: "channel",
                models: groupModelsByDisplayName(config, otherModels),
            });
        }
    }
    return Array.from(groups.values());
}
