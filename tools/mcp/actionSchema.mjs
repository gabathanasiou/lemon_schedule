/**
 * Action/entity schema introspection for the lemon MCP helper.
 *
 * DERIVED, never hand-maintained: parses the canonical `Action` union in
 * `src/store/reducer.ts` (plus the `ACTION_TYPES` runtime mirror) and the core
 * entity interfaces in `src/types.ts` with the TypeScript parser (parse-only —
 * no type-checking, no program, no DOM). A new action or field shows up here
 * automatically.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

/** Core entity interfaces surfaced to agents (matched against `src/types.ts`). */
export const ENTITY_NAMES = [
  'Scene',
  'ScheduleRow',
  'ScheduleVersion',
  'CalendarVersion',
  'CastMember',
  'ProjectElement',
  'CustomCategoryDef',
  'CrewRole',
  'CrewPerson',
  'ProjectLocation',
  'DayTypeDef',
  'NonShootDate',
  'RibbonDesign',
  'ColorRule',
  'ProductionInfo',
  'ScriptDocument',
  'ReportDesign',
  'ReportBlock',
  'ReportTextStyle',
  'ReportTableColumn',
  'ReportColumn',
  'ReportCustomRow',
  'ReportTableRow',
];

const CACHE_TTL_MS = 2000;

export function parseSource(text, fileName = 'source.ts') {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function literalText(node) {
  if (!node) return null;
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return node.literal.text;
  return null;
}

/** `export type Action = { type: 'X'; payload: P } | …` → [{ type, payloadType }] */
export function parseActionUnion(sourceFile) {
  const actions = [];
  sourceFile.forEachChild((node) => {
    if (!ts.isTypeAliasDeclaration(node) || node.name.text !== 'Action') return;
    if (!ts.isUnionTypeNode(node.type)) return;
    for (const member of node.type.types) {
      if (!ts.isTypeLiteralNode(member)) continue;
      let type = null;
      let payloadType = null;
      for (const prop of member.members) {
        if (!ts.isPropertySignature(prop) || !prop.name) continue;
        const name = prop.name.getText(sourceFile);
        if (name === 'type') type = literalText(prop.type);
        else if (name === 'payload') payloadType = prop.type ? prop.type.getText(sourceFile) : 'unknown';
      }
      if (type) actions.push({ type, payloadType });
    }
  });
  return actions;
}

/** `export const ACTION_TYPES = new Set([...])` → string[] (runtime mirror). */
export function parseActionTypesMirror(sourceFile) {
  let types = null;
  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== 'ACTION_TYPES') continue;
      if (!decl.initializer || !ts.isNewExpression(decl.initializer)) continue;
      const arg = decl.initializer.arguments?.[0];
      if (!arg || !ts.isArrayLiteralExpression(arg)) continue;
      types = arg.elements.filter(ts.isStringLiteral).map((el) => el.text);
    }
  });
  return types;
}

/** Parse one interface (or `type X = { … }`) into a shallow field list. */
export function parseEntity(sourceFile, name) {
  let result = null;
  sourceFile.forEachChild((node) => {
    let members = null;
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) members = node.members;
    else if (ts.isTypeAliasDeclaration(node) && node.name.text === name && ts.isTypeLiteralNode(node.type)) {
      members = node.type.members;
    }
    if (!members) return;
    const fields = [];
    for (const member of members) {
      if (!ts.isPropertySignature(member) || !member.name) continue;
      fields.push({
        name: member.name.getText(sourceFile).replace(/^['"]|['"]$/g, ''),
        optional: !!member.questionToken,
        type: member.type ? member.type.getText(sourceFile) : 'unknown',
      });
    }
    result = { name, fields };
  });
  return result;
}

function compareUnionAndMirror(unionTypes, mirror) {
  const mirrorSet = new Set(mirror || []);
  const unionSet = new Set(unionTypes);
  return {
    unionCount: unionTypes.length,
    mirrorCount: mirror ? mirror.length : 0,
    missingInMirror: unionTypes.filter((t) => !mirrorSet.has(t)),
    extraInMirror: (mirror || []).filter((t) => !unionSet.has(t)),
  };
}

let cache = null;

/** Committed snapshot shipped by the npm package (installed packages have no
 *  `src/` to parse). Regenerate with `npm run mcp:schema`; the unit test keeps
 *  it in sync with the source. */
export const ACTION_SCHEMA_JSON_PATH = path.join(HERE, 'action-schema.json');

/** Full derived schema; cached briefly so tool calls don't re-parse per call.
 *  Parses the repo sources when present, otherwise loads the committed JSON. */
export function buildSchema({ root = REPO_ROOT, force = false } = {}) {
  if (cache && !force && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const reducerPath = path.join(root, 'src/store/reducer.ts');
  const typesPath = path.join(root, 'src/types.ts');
  let value;
  if (fs.existsSync(reducerPath) && fs.existsSync(typesPath)) {
    const reducerSf = parseSource(fs.readFileSync(reducerPath, 'utf8'), 'reducer.ts');
    const typesSf = parseSource(fs.readFileSync(typesPath, 'utf8'), 'types.ts');
    const actions = parseActionUnion(reducerSf).map((a) => ({
      type: a.type,
      payload: a.payloadType,
    }));
    const entities = {};
    for (const name of ENTITY_NAMES) {
      const entity = parseEntity(typesSf, name);
      if (entity) entities[name] = entity;
    }
    value = {
      version: 1,
      actions,
      entities,
      consistency: compareUnionAndMirror(actions.map((a) => a.type), parseActionTypesMirror(reducerSf)),
    };
  } else if (fs.existsSync(ACTION_SCHEMA_JSON_PATH)) {
    value = JSON.parse(fs.readFileSync(ACTION_SCHEMA_JSON_PATH, 'utf8'));
  } else {
    throw new Error('Cannot derive the action schema: no src/ sources and no action-schema.json.');
  }
  cache = { at: Date.now(), value };
  return value;
}
