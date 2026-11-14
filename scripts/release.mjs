// Prépare une nouvelle version : node scripts/release.mjs 0.2.0 "Notes de version"
// Met à jour package.json et version.json ; il reste à faire git commit, git tag v0.2.0 et git push --tags.
import { readFileSync, writeFileSync } from 'node:fs';
const [v, notes = ''] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Usage : node scripts/release.mjs X.Y.Z "notes"'); process.exit(1); }
const pkg = JSON.parse(readFileSync('package.json', 'utf8')); pkg.version = v;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
const vj = JSON.parse(readFileSync('version.json', 'utf8')); vj.version = v; if (notes) vj.notes = notes;
writeFileSync('version.json', JSON.stringify(vj, null, 2) + '\n');
console.log(`Version ${v} prête. Ensuite :\n  git commit -am "Version ${v}"\n  git tag v${v}\n  git push && git push --tags`);
