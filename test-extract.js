const fs = require('fs');
const filePath = '/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/.pi/agent/sessions/453498f0-b451-46f6-8ff5-e4a3f15c1aac/2026-03-01T07-48-25-829Z_453498f0-b451-46f6-8ff5-e4a3f15c1aac.jsonl';

function extractMessageContent(contentArr) {
    if (!Array.isArray(contentArr)) return "";
    return contentArr
        .filter((c) => c && (c.type === "text" || c.type === "thinking"))
        .map((c) => {
            if (c.type === "thinking" && typeof c.thinking === "string") return `<think>\n${c.thinking}\n</think>\n\n`;
            if (c.type === "text" && typeof c.text === "string") return c.text;
            return "";
        })
        .filter(Boolean)
        .join("");
}

const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
const messages = [];
let pendingAssistantContent = [];
let idx = 0;

for (const line of lines) {
    try {
        const obj = JSON.parse(line);
        if (obj.type !== "message" || !obj.message) continue;
        const m = obj.message;
        const role = m.role;
        if (role !== "user" && role !== "assistant") continue;

        const content = extractMessageContent(m.content).trim();
        if (!content) continue;

        if (role === "user") {
            if (pendingAssistantContent.length > 0) {
                messages.push({
                    id: `msg-${++idx}`,
                    role: "assistant",
                    content: pendingAssistantContent.join("\n\n").trim(),
                });
                pendingAssistantContent = [];
            }
            messages.push({ id: `msg-${++idx}`, role: "user", content });
        } else {
            pendingAssistantContent.push(content);
        }
    } catch (_) { }
}
if (pendingAssistantContent.length > 0) {
    messages.push({
        id: `msg-${++idx}`,
        role: "assistant",
        content: pendingAssistantContent.join("\n\n").trim(),
    });
}
console.log(JSON.stringify(messages, null, 2));
