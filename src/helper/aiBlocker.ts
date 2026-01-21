export type AiModel = {
    weights: Record<string, number>;
    bias: number;
    positiveExamples: number;
    negativeExamples: number;
    updatedAt: number;
};

export type AiConfig = {
    enabled: boolean;
    threshold: number;
    learningRate: number;
    minExamples: number;
    maxWeight: number;
};

export type AiDecision = "allow" | "ask" | "block";

type TokenSummary = {
    positiveSum: number;
    negativeSum: number;
    positiveCount: number;
};

// Common words and boilerplate tokens that add little signal for blocking decisions.
const STOP_TOKENS = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "your",
    "you",
    "are",
    "was",
    "were",
    "have",
    "has",
    "had",
    "will",
    "would",
    "could",
    "should",
    "about",
    "into",
    "over",
    "under",
    "what",
    "when",
    "where",
    "which",
    "while",
    "then",
    "than",
    "https",
    "http",
    "www",
    "com",
    "net",
    "org",
]);

const MIN_TOKEN_LENGTH = 3;

export const DEFAULT_AI_CONFIG: AiConfig = {
    enabled: true,
    threshold: 1.6,
    learningRate: 0.6,
    minExamples: 5,
    maxWeight: 5,
};

// Starts with no learned weights and a zero bias (kept at zero by design).
export function createEmptyAiModel(): AiModel {
    return {
        weights: {},
        bias: 0,
        positiveExamples: 0,
        negativeExamples: 0,
        updatedAt: Date.now(),
    };
}

// Guards against malformed persisted data; returns null if shape is wrong.
export function normalizeAiModel(input: unknown): AiModel | null {
    if (!input || typeof input !== "object") {
        return null;
    }
    const model = input as Partial<AiModel>;
    if (!model.weights || typeof model.weights !== "object") {
        return null;
    }
    return {
        weights: model.weights as Record<string, number>,
        bias: typeof model.bias === "number" ? model.bias : 0,
        positiveExamples: typeof model.positiveExamples === "number" ? model.positiveExamples : 0,
        negativeExamples: typeof model.negativeExamples === "number" ? model.negativeExamples : 0,
        updatedAt: typeof model.updatedAt === "number" ? model.updatedAt : Date.now(),
    };
}

// Merge partial config with defaults to keep behavior stable across versions.
export function mergeAiConfig(input: unknown): AiConfig {
    if (!input || typeof input !== "object") {
        return { ...DEFAULT_AI_CONFIG };
    }
    const partial = input as Partial<AiConfig>;
    return {
        enabled: typeof partial.enabled === "boolean" ? partial.enabled : DEFAULT_AI_CONFIG.enabled,
        threshold: typeof partial.threshold === "number" ? partial.threshold : DEFAULT_AI_CONFIG.threshold,
        learningRate: typeof partial.learningRate === "number" ? partial.learningRate : DEFAULT_AI_CONFIG.learningRate,
        minExamples: typeof partial.minExamples === "number" ? partial.minExamples : DEFAULT_AI_CONFIG.minExamples,
        maxWeight: typeof partial.maxWeight === "number" ? partial.maxWeight : DEFAULT_AI_CONFIG.maxWeight,
    };
}

// Tokenize natural language into lowercase word tokens with basic stop-word filtering.
export function tokenizeText(text: string): string[] {
    const normalized = text.trim().toLowerCase();
    if (!normalized) {
        return [];
    }
    const rawTokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
    const tokens = new Set<string>();

    rawTokens.forEach((token) => {
        if (token.length < MIN_TOKEN_LENGTH || STOP_TOKENS.has(token)) {
            return;
        }
        tokens.add(token);
    });

    return Array.from(tokens);
}

// Tokenize a hostname into source-related tokens (domain labels and base domain).
export function tokenizeHostname(hostname: string): { sourceTokens: string[]; domainTokens: string[] } {
    const normalized = hostname.trim().toLowerCase().replace(/^www\./, "");
    if (!normalized) {
        return { sourceTokens: [], domainTokens: [] };
    }
    const labels = normalized.split(".").filter(Boolean);
    const baseDomain = labels.length >= 2 ? labels.slice(-2).join(".") : normalized;
    const tokens = new Set<string>();

    labels.forEach((label) => {
        const cleanLabel = label.replace(/[^a-z0-9-]/g, "");
        if (cleanLabel.length < MIN_TOKEN_LENGTH || STOP_TOKENS.has(cleanLabel)) {
            return;
        }
        tokens.add(cleanLabel);
        cleanLabel.split("-").forEach((part) => {
            if (part.length >= MIN_TOKEN_LENGTH && !STOP_TOKENS.has(part)) {
                tokens.add(part);
            }
        });
    });

    const sourceTokens = Array.from(tokens).map((token) => `source:${token}`);
    const domainTokens = baseDomain ? [`domain:${baseDomain}`] : [];
    return { sourceTokens, domainTokens };
}

// Build topic + source tokens for scoring or training.
export function buildAiTokens(
    title: string,
    description: string,
    hostname: string
): { topicTokens: string[]; sourceTokens: string[]; domainTokens: string[]; allTokens: string[] } {
    const topicTokens = tokenizeText(buildTextForAi(title, description)).map((token) => `topic:${token}`);
    const { sourceTokens, domainTokens } = tokenizeHostname(hostname);
    const allTokens = [...topicTokens, ...sourceTokens, ...domainTokens];
    return { topicTokens, sourceTokens, domainTokens, allTokens };
}

// Full score with bias (bias is always zero with current training logic).
export function scoreText(text: string, model: AiModel): number {
    const tokens = tokenizeText(text);
    if (tokens.length === 0) {
        return model.bias;
    }
    return tokens.reduce((score, token) => score + (model.weights[token] || 0), model.bias);
}

// Score without bias to avoid any global “block everything” tendency.
export function scoreTextTokens(text: string, model: AiModel): number {
    const tokens = tokenizeText(text);
    if (tokens.length === 0) {
        return 0;
    }
    return tokens.reduce((score, token) => score + (model.weights[token] || 0), 0);
}

// Conservative decision: only block if topic and source are both strong signals.
export function decideAiAction(
    title: string,
    description: string,
    hostname: string,
    model: AiModel,
    config: AiConfig
): AiDecision {
    if (!config.enabled) {
        return "allow";
    }
    const totalExamples = model.positiveExamples + model.negativeExamples;
    if (totalExamples < config.minExamples) {
        return "allow";
    }
    const { topicTokens, sourceTokens, domainTokens } = buildAiTokens(title, description, hostname);
    const sourceAll = [...sourceTokens, ...domainTokens];
    if (topicTokens.length === 0 || sourceAll.length === 0) {
        return "allow";
    }
    const topicSummary = summarizeTokenWeights(topicTokens, model);
    const sourceSummary = summarizeTokenWeights(sourceAll, model);

    const topicStrong = isConfidentSignal(topicSummary, config.threshold, 2);
    const sourceStrong = isConfidentSignal(sourceSummary, config.threshold * 0.8, 1);
    const sourceNegative = isNegativeSignal(sourceSummary, config.threshold);

    if (topicStrong && sourceStrong) {
        return "block";
    }
    if (topicStrong && !sourceStrong && !sourceNegative) {
        return "ask";
    }
    return "allow";
}

// Online update: push token weights toward block/allow with a bounded step.
export function updateModelForTokens(
    tokens: string[],
    label: "block" | "allow",
    model: AiModel,
    config: AiConfig
): AiModel {
    if (tokens.length === 0) {
        return model;
    }

    const delta = config.learningRate * (label === "block" ? 1 : -1);
    const nextWeights: Record<string, number> = { ...model.weights };
    tokens.forEach((token) => {
        const current = nextWeights[token] || 0;
        nextWeights[token] = clamp(current + delta, -config.maxWeight, config.maxWeight);
    });

    return {
        weights: nextWeights,
        bias: model.bias,
        positiveExamples: model.positiveExamples + (label === "block" ? 1 : 0),
        negativeExamples: model.negativeExamples + (label === "allow" ? 1 : 0),
        updatedAt: Date.now(),
    };
}

// Convenience wrapper for training from title/description + hostname.
export function updateModelForAi(
    title: string,
    description: string,
    hostname: string,
    label: "block" | "allow",
    model: AiModel,
    config: AiConfig
): AiModel {
    const { allTokens } = buildAiTokens(title, description, hostname);
    return updateModelForTokens(allTokens, label, model, config);
}

// Build an initial model from stored blocked items (title/description).
export function buildModelFromBlockedList(
    blockedList: Array<{ enabled?: boolean; title?: string; description?: string; name?: string }>,
    config: AiConfig
): AiModel {
    let model = createEmptyAiModel();
    const seen = new Set<string>();
    (blockedList || []).forEach((entry) => {
        if (!entry || !entry.enabled) {
            return;
        }
        const text = buildTextForAi(entry.title, entry.description);
        const hostname = extractHostname(entry.name || "");
        if (!text || !hostname || seen.has(`${text}|${hostname}`)) {
            return;
        }
        seen.add(`${text}|${hostname}`);
        model = updateModelForAi(entry.title || "", entry.description || "", hostname, "block", model, config);
    });
    return model;
}

// Combine title + description into one text field for training/scoring.
export function buildTextForAi(title?: string, description?: string): string {
    return [title || "", description || ""].join(" ").trim();
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

// Summarize token weights to measure confidence and opposing signals.
function summarizeTokenWeights(tokens: string[], model: AiModel): TokenSummary {
    let positiveSum = 0;
    let negativeSum = 0;
    let positiveCount = 0;
    tokens.forEach((token) => {
        const weight = model.weights[token] || 0;
        if (weight > 0) {
            positiveSum += weight;
            positiveCount += 1;
        } else if (weight < 0) {
            negativeSum += Math.abs(weight);
        }
    });
    return { positiveSum, negativeSum, positiveCount };
}

function isConfidentSignal(summary: TokenSummary, threshold: number, minPositiveTokens: number): boolean {
    if (summary.positiveCount < minPositiveTokens) {
        return false;
    }
    return summary.positiveSum >= threshold && summary.positiveSum >= summary.negativeSum * 2;
}

function isNegativeSignal(summary: TokenSummary, threshold: number): boolean {
    if (summary.negativeSum <= 0) {
        return false;
    }
    return summary.negativeSum >= threshold && summary.negativeSum >= summary.positiveSum * 2;
}

function extractHostname(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
        return "";
    }
    try {
        return new URL(trimmed).hostname.replace(/^www\./, "");
    } catch {
        try {
            return new URL(`https://${trimmed}`).hostname.replace(/^www\./, "");
        } catch {
            return trimmed.replace(/^www\./, "");
        }
    }
}
