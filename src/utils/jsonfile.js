import fs from 'fs';

export function readJson(path){
  let s = fs.readFileSync(path, 'utf8');
  // UTF-8 BOM entfernen, falls vorhanden
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return JSON.parse(s);
}

export function writeJson(path, data){
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}
