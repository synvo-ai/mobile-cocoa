import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Execute a git command in the given directory safely and return its string output.
 */
function execGitCmd(cwd, ...args) {
    try {
        // Basic verification it's a git repo
        if (!fs.existsSync(path.join(cwd, ".git"))) {
            throw new Error(`Directory is not a git repository: ${cwd}`);
        }

        const cleanArgs = args
            .filter((arg) => typeof arg === "string")
            .map((arg) => arg.trim())
            .filter((arg) => arg.length > 0);

        const result = spawnSync("git", cleanArgs, {
            cwd,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 8 * 1024 * 1024,
        });

        if (result.error) {
            throw result.error;
        }
        if (result.status !== 0) {
            const errText = result.stderr || result.stdout || "Command failed";
            throw new Error(typeof errText === "string" ? errText.trim() : "Command failed");
        }

        return (result.stdout || "").trim();
    } catch (err) {
        if (err.stdout != null || err.stderr != null) {
            console.error(`Git Command Failed: ${err.message}\nSTDOUT: ${err.stdout}\nSTDERR: ${err.stderr}`);
            throw new Error((err.stderr || err.stdout || err.message).trim());
        }
        throw new Error(err?.message || String(err));
    }
}

/**
 * Get recent git commits of the current directory.
 * @param {string} cwd - Directory path
 * @param {number} limit - Max commits to fetch
 * @returns {Array} Array of commit objects
 */
export function getGitCommits(cwd, limit = 50) {
    try {
        // Format: Hash|%h, Author|%an, Date|%cd, Message|%s
        const output = execGitCmd(
            cwd,
            "log",
            "-n",
            limit.toString(),
            "--pretty=format:%H|||%an|||%cd|||%s",
            "--date=format:%a %b %d %H:%M:%S %Y",
            "--abbrev-commit"
        );

        if (!output) return [];

        return output.split("\n").map((line) => {
            const parts = line.split("|||");
            if (parts.length < 4) return null;
            return {
                hash: parts[0],
                author: parts[1],
                date: parts[2],
                message: parts.slice(3).join("|||"), // In case message had our delimiter
            };
        }).filter(Boolean);
    } catch (err) {
        // Repo might not have any commits yet
        if (err.message.includes("does not have any commits yet")) {
            return [];
        }
        throw err;
    }
}

/**
 * Get the git tree format for a directory, annotating each file with its latest commit.
 * @param {string} cwd - Directory path
 * @param {string} dirPath - Relative path inside the repo (default "")
 */
export function getGitTree(cwd, dirPath = "") {
    const fullSearchPath = path.join(cwd, dirPath);
    if (!fs.existsSync(fullSearchPath) || !fs.statSync(fullSearchPath).isDirectory()) {
        throw new Error(`Invalid directory path: ${dirPath}`);
    }

    const entries = fs.readdirSync(fullSearchPath, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
        if (entry.name === ".git" || entry.name === ".DS_Store") continue;

        const relPath = dirPath ? path.posix.join(dirPath, entry.name) : entry.name;
        const type = entry.isDirectory() ? "folder" : "file";

        let lastCommit = null;
        try {
            const logOutput = execGitCmd(
                cwd,
                "log",
                "-n",
                "1",
                "--pretty=format:%H|||%an|||%cd|||%s",
                "--date=format:%a %b %d %H:%M:%S %Y",
                "--",
                relPath
            );
            if (logOutput) {
                const parts = logOutput.split("|||");
                if (parts.length >= 4) {
                    lastCommit = {
                        hash: parts[0],
                        author: parts[1],
                        date: parts[2],
                        message: parts.slice(3).join("|||"),
                    };
                }
            }
        } catch (_) {
            // Path might not be tracked yet
        }

        items.push({ name: entry.name, path: relPath, type, lastCommit });
    }

    // Sort folders first, then alphabetically
    return items.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

/**
 * Get the current git status (staged, unstaged, untracked files).
 * @param {string} cwd 
 */
export function getGitStatus(cwd) {
    const output = execGitCmd(cwd, "status", "--porcelain");
    const staged = [];
    const unstaged = [];
    const untracked = [];

    if (!output) return { staged, unstaged, untracked };

    const lines = output.split("\n");
    const isDir = (p) => {
        try {
            const full = path.join(cwd, p);
            return fs.existsSync(full) && fs.statSync(full).isDirectory();
        } catch {
            return false;
        }
    };

    for (const line of lines) {
        if (line.length < 4) continue;
        const xy = line.substring(0, 2);
        // Use substring(2): XY is 2 chars; path follows. substring(3) skips first path char when format is "M path" (no double space).
        const file = line.substring(2).replace(/"/g, "").trim();

        const x = xy[0];
        const y = xy[1];

        if (xy === "??") {
            untracked.push({ file, isDirectory: isDir(file) });
            continue;
        }
        if (x !== " " && x !== "?") {
            staged.push({ file, status: x, isDirectory: isDir(file) });
        }
        if (y !== " " && y !== "?") {
            unstaged.push({ file, status: y, isDirectory: isDir(file) });
        }
    }

    return { staged, unstaged, untracked };
}

/**
 * Stage files or directories.
 * @param {string} cwd 
 * @param {string|string[]} files 
 */
export function gitAdd(cwd, files) {
    const fileArray = Array.isArray(files) ? files : [files];
    if (fileArray.length === 0) return { success: true };

    const safeFiles = fileArray
        .filter((f) => typeof f === "string")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    if (safeFiles.length === 0) return { success: true };

    execGitCmd(cwd, "add", ...safeFiles);
    return { success: true };
}

/**
 * Run a git commit with a message.
 * @param {string} cwd 
 * @param {string} message 
 */
export function gitCommit(cwd, message) {
    if (!message || typeof message !== "string" || message.trim() === "") {
        throw new Error("Commit message is required.");
    }

    execGitCmd(cwd, "commit", "-m", message);
    return { success: true };
}

/**
 * Run git push.
 * @param {string} cwd 
 */
export function gitPush(cwd) {
    execGitCmd(cwd, "push");
    return { success: true };
}

/**
 * Initialize a new git repository
 * @param {string} cwd 
 */
export function gitInit(cwd) {
    try {
        execGitCmd(cwd, "init");
        return { success: true };
    } catch (err) {
        throw new Error(err.message || String(err));
    }
}
