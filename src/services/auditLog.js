let buffer = [];
export function audit(entry){
  buffer.push({ ts: Date.now(), ...entry });
  if (buffer.length > 500) buffer.shift();
}
export function getAudit(){ return buffer; }
