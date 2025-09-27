import * as mar from "./mar.agent.js";
import * as cmo from "./cmo.agent.js";
const modules = { mar, cmo };
export const getModule = (ns) => modules[ns];
