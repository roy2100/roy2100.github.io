#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projects = JSON.parse(fs.readFileSync('projects.json', 'utf8'));
let html = fs.readFileSync(path.join('src', 'index.html'), 'utf8');

html = html.replace(
  /\/\* __DATA_LOAD_START__ \*\/[\s\S]*?\/\* __DATA_LOAD_END__ \*\//,
  `render(${JSON.stringify(projects)});`
);

fs.writeFileSync('index.html', html);
console.log('Built index.html with inlined projects data');
