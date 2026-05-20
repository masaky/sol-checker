import { vi, describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";

vi.mock("node:child_process", () => ({
    spawnSync: vi.fn(),
}));

const mockSpawn = spawnSync as ReturnType<typeof vi.fn>;

describe("ClaudeCliProvider security", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSpawn.mockReturnValue({
            status: 0,
            stdout: "raw output",
            stderr: "",
            error: undefined,
        });
    });

    it("does not pass bypassPermissions to claude CLI", async () => {
        const { ClaudeCliProvider } = await import("../src/providers/claude-cli.js");
        const provider = new ClaudeCliProvider("/fake/.claude");
        await provider.rawCall("system", "user");

        const args = mockSpawn.mock.calls[0][1] as string[];
        expect(args).not.toContain("bypassPermissions");
    });

    it("uses permission-mode default", async () => {
        const { ClaudeCliProvider } = await import("../src/providers/claude-cli.js");
        const provider = new ClaudeCliProvider("/fake/.claude");
        await provider.rawCall("system", "user");

        const args = mockSpawn.mock.calls[0][1] as string[];
        const idx = args.indexOf("--permission-mode");
        expect(idx).toBeGreaterThan(-1);
        expect(args[idx + 1]).toBe("default");
    });
});
