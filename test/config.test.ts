import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
    getConfigDir,
    getConfigPath,
    loadConfig,
    initConfig,
    DEFAULT_CONFIG,
} from "../src/config.js";

describe("config", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sol-checker-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // -----------------------------------------------------------------------
    // Paths
    // -----------------------------------------------------------------------

    describe("getConfigDir", () => {
        it("should return ~/.sol-checker by default", () => {
            const dir = getConfigDir();
            expect(dir).toBe(path.join(os.homedir(), ".sol-checker"));
        });

        it("should use custom homeDir when provided", () => {
            const dir = getConfigDir(tmpDir);
            expect(dir).toBe(path.join(tmpDir, ".sol-checker"));
        });
    });

    describe("getConfigPath", () => {
        it("should return config.toml path", () => {
            const p = getConfigPath(tmpDir);
            expect(p).toBe(path.join(tmpDir, ".sol-checker", "config.toml"));
        });
    });

    // -----------------------------------------------------------------------
    // loadConfig
    // -----------------------------------------------------------------------

    describe("loadConfig", () => {
        it("should return default config when no file exists", () => {
            const config = loadConfig(tmpDir);
            expect(config).toEqual(DEFAULT_CONFIG);
        });

        it("should parse existing config.toml", () => {
            const configDir = path.join(tmpDir, ".sol-checker");
            fs.mkdirSync(configDir, { recursive: true });
            fs.writeFileSync(
                path.join(configDir, "config.toml"),
                `[llm]
provider = "openai"
api_key = "sk-test-123"
model = "gpt-4o"

[output]
format = "json"
color = false
`,
                "utf-8"
            );

            const config = loadConfig(tmpDir);
            expect(config.llm.provider).toBe("openai");
            expect(config.llm.api_key).toBe("sk-test-123");
            expect(config.llm.model).toBe("gpt-4o");
            expect(config.output.format).toBe("json");
            expect(config.output.color).toBe(false);
        });

        it("should fill missing fields with defaults", () => {
            const configDir = path.join(tmpDir, ".sol-checker");
            fs.mkdirSync(configDir, { recursive: true });
            fs.writeFileSync(
                path.join(configDir, "config.toml"),
                `[llm]
provider = "openai"
`,
                "utf-8"
            );

            const config = loadConfig(tmpDir);
            expect(config.llm.provider).toBe("openai");
            expect(config.llm.model).toBe(DEFAULT_CONFIG.llm.model);
            expect(config.output.format).toBe(DEFAULT_CONFIG.output.format);
        });
    });

    // -----------------------------------------------------------------------
    // verify config
    // -----------------------------------------------------------------------

    describe("verify config", () => {
        it("returns default verify settings when not configured", () => {
            const config = loadConfig(tmpDir);
            expect(config.verify.enabled).toBe(true);
            expect(config.verify.model).toBe("");
            expect(config.verify.skip_info).toBe(true);
            expect(config.verify.line_tolerance).toBe(10);
        });

        it("loads verify settings from TOML", () => {
            const tomlContent = `[llm]
provider = "claude"
api_key = ""
model = "claude-sonnet-4-20250514"

[output]
format = "markdown"
color = true

[verify]
enabled = false
model = "claude-opus-4-20250918"
skip_info = false
line_tolerance = 5
`;
            const configDir = path.join(tmpDir, ".sol-checker");
            fs.mkdirSync(configDir, { recursive: true });
            fs.writeFileSync(path.join(configDir, "config.toml"), tomlContent, "utf-8");
            const config = loadConfig(tmpDir);
            expect(config.verify.enabled).toBe(false);
            expect(config.verify.model).toBe("claude-opus-4-20250918");
            expect(config.verify.skip_info).toBe(false);
            expect(config.verify.line_tolerance).toBe(5);
        });
    });

    // -----------------------------------------------------------------------
    // initConfig
    // -----------------------------------------------------------------------

    describe("initConfig", () => {
        it("should create config file when it does not exist", () => {
            const result = initConfig(tmpDir);

            expect(result.created).toBe(true);
            expect(fs.existsSync(result.path)).toBe(true);

            // Verify the file is valid TOML and contains expected values
            const content = fs.readFileSync(result.path, "utf-8");
            expect(content).toContain('provider = "claude"');
            expect(content).toContain('model = "claude-sonnet-4-20250514"');
        });

        it("should not overwrite existing config", () => {
            const configDir = path.join(tmpDir, ".sol-checker");
            fs.mkdirSync(configDir, { recursive: true });
            const configPath = path.join(configDir, "config.toml");
            fs.writeFileSync(configPath, "# custom config\n", "utf-8");

            const result = initConfig(tmpDir);

            expect(result.created).toBe(false);
            const content = fs.readFileSync(configPath, "utf-8");
            expect(content).toBe("# custom config\n");
        });
    });
});
