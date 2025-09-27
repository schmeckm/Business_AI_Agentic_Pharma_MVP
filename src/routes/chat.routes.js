// src/routes/chat.routes.js
import { Router } from "express";
import { chatController } from "../controllers/chat.controller.js";
import { requireGoogleRole } from "../services/auth.google.js";
import { requireRole as apiKeyRole } from "../services/auth.middleware.js";

const r = Router();
const asyncHandler = (fn) => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

function selectGuard(req, res, next) {
  const auth = req.headers["authorization"] || "";
  const hasBearer = /^bearer\s+/i.test(auth);
  const guard = hasBearer ? requireGoogleRole("user") : apiKeyRole("user");
  return guard(req, res, next);
}

r.post("/", selectGuard, asyncHandler(chatController));
export default r;
