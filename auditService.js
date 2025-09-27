import fs from "fs";
import path from "path";

const logFile = path.join(process.cwd(), "audit_log.json");

export function saveAuditLog({ user, role, action, input, result, response, phase }) {
  const entry = {
    timestamp: new Date().toISOString(),
    user,
    role,
    action,
    input,
    systemResult: result || {},
    aiResponse: response || "",
    phase: phase || "Unknown"
  };

  try {
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf8");
    console.log("✅ Audit log saved:", entry.timestamp, action);
  } catch (err) {
    console.error("❌ Error writing audit log:", err.message);
  }
}
