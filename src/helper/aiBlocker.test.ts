import {
    buildAiTokens,
    buildModelFromBlockedList,
    createEmptyAiModel,
    DEFAULT_AI_CONFIG,
    decideAiAction,
    tokenizeHostname,
    tokenizeText,
    updateModelForAi,
} from "./aiBlocker";

describe("aiBlocker", () => {
    it("tokenizes text and drops stop-words", () => {
        const tokens = tokenizeText("The Quick Brown Fox jumps over the lazy dog");
        expect(tokens).toEqual(expect.arrayContaining(["quick", "brown", "fox", "jumps", "lazy", "dog"]));
        expect(tokens).not.toEqual(expect.arrayContaining(["the", "over"]));
    });

    it("tokenizes hostname into source and domain tokens", () => {
        const { sourceTokens, domainTokens } = tokenizeHostname("www.xyz.co.uk");
        expect(domainTokens).toEqual(["domain:co.uk"]);
        expect(sourceTokens).toEqual(expect.arrayContaining(["source:xyz"]));
    });

    it("builds ai tokens with topic/source/domain prefixes", () => {
        const tokens = buildAiTokens("Breaking News", "Latest updates", "news.example.com");
        expect(tokens.topicTokens).toEqual(expect.arrayContaining(["topic:breaking", "topic:news", "topic:latest", "topic:updates"]));
        expect(tokens.sourceTokens).toEqual(expect.arrayContaining(["source:news", "source:example"]));
        expect(tokens.domainTokens).toEqual(["domain:example.com"]);
    });

    it("does not block when unsure", () => {
        const model = createEmptyAiModel();
        const config = { ...DEFAULT_AI_CONFIG, minExamples: 1, threshold: 1 };
        const updated = updateModelForAi("cats are great", "", "xyz.com", "block", model, config);

        const decision = decideAiAction("cats", "", "acme.com", updated, config);

        expect(decision).not.toBe("block");
    });

    it("asks when topic is strong but source is unknown", () => {
        let model = createEmptyAiModel();
        const config = { ...DEFAULT_AI_CONFIG, minExamples: 1, threshold: 1, learningRate: 1 };

        model = updateModelForAi("john doe investigation", "", "xyz.com", "block", model, config);
        model = updateModelForAi("john doe speech", "", "xyz.com", "block", model, config);

        const decision = decideAiAction("john doe interview", "", "acme.com", model, config);

        expect(decision).toBe("ask");
    });

    it("blocks only with strong positive signal", () => {
        let model = createEmptyAiModel();
        const config = { ...DEFAULT_AI_CONFIG, minExamples: 1, threshold: 1.2, learningRate: 1 };

        model = updateModelForAi("football highlights", "", "videos.example.com", "block", model, config);
        model = updateModelForAi("sports highlights", "", "videos.example.com", "block", model, config);

        const decision = decideAiAction("football highlights today", "", "videos.example.com", model, config);

        expect(decision).toBe("block");
    });

    it("does not block when topic is strong but source is negative", () => {
        let model = createEmptyAiModel();
        const config = { ...DEFAULT_AI_CONFIG, minExamples: 1, threshold: 1.2, learningRate: 1 };

        model = updateModelForAi("john doe interview", "", "xyz.com", "block", model, config);
        model = updateModelForAi("john doe interview", "", "acme.com", "allow", model, config);
        model = updateModelForAi("john doe interview", "", "acme.com", "allow", model, config);

        const decision = decideAiAction("john doe interview", "", "acme.com", model, config);

        expect(decision).toBe("allow");
    });

    it("does not decide before min examples", () => {
        let model = createEmptyAiModel();
        const config = { ...DEFAULT_AI_CONFIG, minExamples: 5, threshold: 1, learningRate: 1 };

        model = updateModelForAi("politics debate", "", "xyz.com", "block", model, config);
        model = updateModelForAi("politics debate", "", "xyz.com", "block", model, config);
        model = updateModelForAi("politics debate", "", "xyz.com", "block", model, config);

        const decision = decideAiAction("politics debate", "", "xyz.com", model, config);

        expect(decision).toBe("allow");
    });

    it("builds model from blocked list with host + text", () => {
        const config = { ...DEFAULT_AI_CONFIG, minExamples: 1, threshold: 1, learningRate: 1 };
        const model = buildModelFromBlockedList(
            [
                { name: "https://www.xyz.com", enabled: true, title: "John Doe interview", description: "Politics today" },
                { name: "acme.com", enabled: false, title: "John Doe interview", description: "Politics today" },
            ],
            config
        );

        const decision = decideAiAction("John Doe interview", "Politics today", "xyz.com", model, config);

        expect(decision).toBe("block");
    });
});
