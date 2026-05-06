
const path = require('path');
// Try to use the compiled hoyoapi
let Hoyolab;
try {
  Hoyolab = require('./node_modules/hoyoapi/dist/index.js').Hoyolab;
} catch(e) {
  console.error('hoyoapi load error:', e.message);
  process.exit(1);
}

async function main() {
  const cookie = process.env.COOKIE;
  const uid = process.env.UID;
  
  const hl = new Hoyolab({ cookie, uid });
  const zzz = hl.zzz();
  
  // Get character list
  const chars = await zzz.record.characters();
  console.log('Total chars:', chars.length);
  
  // Fetch detail for first char
  const charId = chars[0].id;
  console.log('First char:', chars[0].name_mi18n || chars[0].name, 'id:', charId);
  
  const detail = await zzz.record.character(charId);
  
  // The raw response might have equip[] with drive discs
  // Log equip and relics
  console.log('equip:', JSON.stringify(detail.equip));
  if (detail.relics) {
    console.log('relics count:', detail.relics.length);
    detail.relics.slice(0, 3).forEach(r => {
      console.log('  relic id:', r.id, 'name:', r.name, 'icon:', r.icon?.substring(0, 80));
    });
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  if (e.response) console.error('Response:', JSON.stringify(e.response).substring(0, 200));
});
