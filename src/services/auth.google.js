import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const adminEmails = (process.env.ADMIN_ALLOWED_EMAILS || "").split(",").map(s=>s.trim()).filter(Boolean);
const adminDomains = (process.env.ADMIN_ALLOWED_DOMAINS || "").split(",").map(s=>s.trim()).filter(Boolean);

export async function verifyGoogleIdToken(idToken){
  const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
  return ticket.getPayload();
}

export function requireGoogleRole(role="user"){
  return async (req, res, next) => {
    try {
      const auth = req.headers["authorization"] || "";
      const m = auth.match(/^Bearer (.+)$/i);
      if (!m) return res.status(401).json({ error:"missing bearer token" });
      const idToken = m[1];
      const p = await verifyGoogleIdToken(idToken);
      if (!p?.email_verified) return res.status(401).json({ error:"email not verified" });

      let userRole = "user";
      const email = (p.email || "").toLowerCase();
      const domain = email.split("@")[1];
      if (adminEmails.includes(email) || (domain && adminDomains.includes(domain))) userRole = "admin";

      if (role === "admin" && userRole !== "admin") return res.status(403).json({ error:"admin role required" });
      req.user = { role: userRole, email, name: p.name, sub: p.sub };
      next();
    } catch (e) {
      return res.status(401).json({ error:"invalid token", detail: e.message });
    }
  };
}
