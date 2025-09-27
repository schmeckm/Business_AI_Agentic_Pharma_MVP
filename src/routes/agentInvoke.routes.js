// src/routes/agentInvoke.routes.js
import { Router } from "express";
import { invokeAgentController } from "../controllers/agentInvoke.controller.js";
import { requireGoogleRole } from "../services/auth.google.js";
import { requireRole as apiKeyRole } from "../services/auth.middleware.js";

const r = Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** reuse same guard logic as chat.routes (bearer vs api-key) */
function selectGuard(req, res, next) {
  const auth = req.headers["authorization"] || "";
  const hasBearer = /^bearer\s+/i.test(auth);
  const guard = hasBearer ? requireGoogleRole("user") : apiKeyRole("user");
  return guard(req, res, next);
}

r.post("/", selectGuard, asyncHandler(invokeAgentController));

export default r;
