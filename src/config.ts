import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import toml from "toml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SolCheckerConfig {
    llm: {
        provider: string;
        api_key: string;
        model: string;
    };
    output: {
        format: string;
        color: boolean;
    };
    verify: {
        enabled: boolean;
        model: string;
        skip_info: boolean;
        line_tolerance: number;
    };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: SolCheckerConfig = {
    llm: {
        provider: "claude",
        api_key: "",
        model: "claude-sonnet-4-20250514",
    },
    output: {
        format: "markdown",
        color: true,
    },
    verify: { enabled: true, model: "", skip_info: true, line_tolerance: 10 },
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function getConfigDir(homeDir?: string): string {
    const home = homeDir ?? os.homedir();
    return path.join(home, ".sol-checker");
}

export function getConfigPath(homeDir?: string): string {
    return path.join(getConfigDir(homeDir), "config.toml");
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export function loadConfig(homeDir?: string): SolCheckerConfig {
    const configPath = getConfigPath(homeDir);

    if (!fs.existsSync(configPath)) {
        return { ...DEFAULT_CONFIG };
    }

    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = toml.parse(raw);

    return {
        llm: {
            provider: parsed.llm?.provider ?? DEFAULT_CONFIG.llm.provider,
            api_key: parsed.llm?.api_key ?? DEFAULT_CONFIG.llm.api_key,
            model: parsed.llm?.model ?? DEFAULT_CONFIG.llm.model,
        },
        output: {
            format: parsed.output?.format ?? DEFAULT_CONFIG.output.format,
            color: parsed.output?.color ?? DEFAULT_CONFIG.output.color,
        },
        verify: {
            enabled: parsed.verify?.enabled ?? DEFAULT_CONFIG.verify.enabled,
            model: parsed.verify?.model ?? DEFAULT_CONFIG.verify.model,
            skip_info: parsed.verify?.skip_info ?? DEFAULT_CONFIG.verify.skip_info,
            line_tolerance: parsed.verify?.line_tolerance ?? DEFAULT_CONFIG.verify.line_tolerance,
        },
    };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function configToToml(config: SolCheckerConfig): string {
    return `[llm]
provider = "${config.llm.provider}"
api_key = "${config.llm.api_key}"
model = "${config.llm.model}"

[output]
format = "${config.output.format}"
color = ${config.output.color}

[verify]
enabled = ${config.verify.enabled}
model = "${config.verify.model}"
skip_info = ${config.verify.skip_info}
line_tolerance = ${config.verify.line_tolerance}
`;
}

export function initConfig(homeDir?: string): { created: boolean; path: string } {
    const configDir = getConfigDir(homeDir);
    const configPath = getConfigPath(homeDir);

    if (fs.existsSync(configPath)) {
        return { created: false, path: configPath };
    }

    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, configToToml(DEFAULT_CONFIG), "utf-8");

    return { created: true, path: configPath };
}
