export function requireRole(role="user"){
  return (req, res, next) => {
    const key = (req.headers["x-api-key"] || req.query.key || "").trim();
    const adminKey = process.env.ADMIN_API_KEY || "";
    const userKey  = process.env.USER_API_KEY || "";
    const isAdmin = key && key === adminKey;
    const isUser  = key && (key === userKey || key === adminKey);
    if (role === "admin" && !isAdmin) return res.status(401).json({ error:"admin key required" });
    if (role === "user"  && !isUser)  return res.status(401).json({ error:"api key required" });
    req.user = { role: isAdmin ? "admin" : "user" };
    next();
  };
}
