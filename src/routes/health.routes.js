import { Router } from "express";
const r = Router();
r.get("/", (req, res) => {
  const agents = req.locals.registry.all().map(a => ({ id:a.id, ns:a.namespace, inProcess:a.inProcess, url:a.url }));
  res.json({ ok:true, agents });
});
export default r;
