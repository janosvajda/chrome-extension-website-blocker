const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const builtDirectory = path.join(projectRoot, 'built');
const releaseDirectory = path.join(projectRoot, 'release');
const packageJson = require(path.join(projectRoot, 'package.json'));
const manifestPath = path.join(builtDirectory, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
    throw new Error('Missing built/manifest.json. Run the production build first.');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.manifest_version !== 3) {
    throw new Error('Chrome Web Store packages must use Manifest V3.');
}
if (manifest.version !== packageJson.version) {
    throw new Error(`Version mismatch: package.json=${packageJson.version}, manifest=${manifest.version}.`);
}
const allowedPermissions = new Set(['storage', 'tabs', 'activeTab', 'contextMenus', 'scripting']);
const unexpectedPermission = (manifest.permissions || []).find((permission) => !allowedPermissions.has(permission));
if (unexpectedPermission) {
    throw new Error(`Review unexpected manifest permission before publishing: ${unexpectedPermission}`);
}
if (Array.isArray(manifest.host_permissions) && manifest.host_permissions.length > 0) {
    throw new Error('This extension should not require persistent host permissions.');
}

const requiredFiles = [
    'manifest.json',
    'background.js',
    'options.html',
    'options.js',
    'popup.html',
    'popup.js',
    'warning.html',
    'content.js',
];
requiredFiles.forEach((file) => {
    if (!fs.existsSync(path.join(builtDirectory, file))) {
        throw new Error(`Production package is missing ${file}.`);
    }
});

const packagedFiles = listFiles(builtDirectory);
const forbiddenFile = packagedFiles.find((file) =>
    file.endsWith('.map') || file.startsWith('.') || file.includes('/.')
);
if (forbiddenFile) {
    throw new Error(`Refusing to package development or hidden file: ${forbiddenFile}`);
}
const forbiddenCodePatterns = [
    ['eval()', /\beval\s*\(/],
    ['new Function()', /\bnew\s+Function\s*\(/],
    ['importScripts()', /\bimportScripts\s*\(/],
    ['fetch()', /\bfetch\s*\(/],
    ['XMLHttpRequest', /\bXMLHttpRequest\b/],
    ['WebSocket', /\bWebSocket\b/],
    ['source map reference', /sourceMappingURL/],
];
packagedFiles.filter((file) => file.endsWith('.js')).forEach((file) => {
    const source = fs.readFileSync(path.join(builtDirectory, file), 'utf8');
    const forbiddenPattern = forbiddenCodePatterns.find(([, pattern]) => pattern.test(source));
    if (forbiddenPattern) {
        throw new Error(`Review ${forbiddenPattern[0]} in production file ${file} before publishing.`);
    }
});

fs.mkdirSync(releaseDirectory, {recursive: true});
const archiveName = `tiny-website-blocker-${manifest.version}.zip`;
const archivePath = path.join(releaseDirectory, archiveName);
fs.readdirSync(releaseDirectory)
    .filter((file) => /^tiny-website-blocker-\d+(?:\.\d+){2,3}\.zip$/.test(file) && file !== archiveName)
    .forEach((file) => fs.rmSync(path.join(releaseDirectory, file), {force: true}));
fs.rmSync(archivePath, {force: true});

const zip = spawnSync('zip', ['-X', '-q', '-r', archivePath, '.'], {
    cwd: builtDirectory,
    encoding: 'utf8',
});
if (zip.error) {
    throw new Error(`Could not run zip: ${zip.error.message}`);
}
if (zip.status !== 0) {
    throw new Error(`zip failed: ${zip.stderr || zip.stdout}`);
}

const size = fs.statSync(archivePath).size;
if (size === 0) {
    throw new Error('Created archive is empty.');
}

console.log(`Chrome Web Store package: ${path.relative(projectRoot, archivePath)}`);
console.log(`Files: ${packagedFiles.length}; size: ${Math.ceil(size / 1024)} KiB`);

function listFiles(directory, relativeDirectory = '') {
    return fs.readdirSync(path.join(directory, relativeDirectory), {withFileTypes: true})
        .flatMap((entry) => {
            const relativePath = path.join(relativeDirectory, entry.name);
            return entry.isDirectory() ? listFiles(directory, relativePath) : [relativePath];
        })
        .sort();
}
