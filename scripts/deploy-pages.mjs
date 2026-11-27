// Publishes dist/ to the gh-pages branch (GitHub Pages serves it at /slab-or-skip/).
// Usage: npm run deploy
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const run = (cmd, args, cwd = 'dist') => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const remote = execFileSync('git', ['remote', 'get-url', 'origin']).toString().trim();
const author = execFileSync('git', ['log', '-1', '--format=%an <%ae>']).toString().trim();
writeFileSync('dist/.nojekyll', '');
run('git', ['init', '-q', '-b', 'gh-pages']);
run('git', ['add', '-A']);
run('git', ['-c', `user.name=${author.replace(/ <.*/, '')}`, '-c', `user.email=${author.replace(/.*<|>/g, '')}`, 'commit', '-q', '-m', 'Deploy']);
run('git', ['push', '-q', '--force', remote, 'gh-pages']);
console.log('Deployed dist/ to gh-pages');
