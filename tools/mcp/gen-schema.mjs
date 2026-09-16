#!/usr/bin/env node
/**
 * Regenerate `action-schema.json` — the derived action/entity schema the
 * published MCP package ships (the installed package has no `src/` to parse).
 * `npm run mcp:schema`. The unit test asserts the committed file stays in sync
 * with the source, so this only needs running when the Action union or the
 * core entity interfaces change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSchema } from './actionSchema.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'action-schema.json');
const schema = buildSchema({ force: true });
fs.writeFileSync(OUT, `${JSON.stringify(schema, null, 2)}\n`);
console.log(`wrote tools/mcp/action-schema.json (${schema.actions.length} actions, ${Object.keys(schema.entities).length} entities)`);
