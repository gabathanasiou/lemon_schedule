/**
 * MCP tool surface for the lemon_schedule agent bridge (stage 1).
 *
 * Reads are resources/nouns; writes route through the app's ONE mutation path
 * (the `apply_actions` → `Action` union → reducer). Tool payload shapes come
 * from `actionSchema.mjs` (derived from source), never hand-duplicated here.
 */
import { buildSchema } from './actionSchema.mjs';

export const HELPER_VERSION = '1.0.0';

export const CONVENTIONS = [
  'Conventions (read before writing):',
  '- Scenes live in project.scenes; every scene MUST have a matching SCENE row (ADD_SCENE creates it — never add a row by hand for a new scene).',
  '- Cast is referenced BY ID inside scene.cast (comma-separated ids). All other categories are referenced BY NAME.',
  '- Stripboard order is ScheduleVersion.rows; sections are DAYBREAK rows. The daybreak ABOVE a section owns its base call time (daybreakCallTime) + day properties (daybreakMeta). Day 1 is the pinned daybreak (pinned:true, never move/delete).',
  '- Calendar data (nonShootDates, productionStart, prepStart, postEnd, weeklyDaysOff) lives in CalendarVersion and is written ONLY via UPDATE_CALENDAR_VERSION — never UPDATE_VERSION.',
  '- The active calendar version drives computed section dates/call times in get_schedule; report it alongside any schedule reasoning.',
  '- Wrap related writes in one apply_actions call (atomic:true = one undo entry).',
  '- Blocked over the bridge: LOAD (replaces the project + clears history) and EMPTY_TRASH (irreversible). Ask the user to do those in the UI.',
  '- Writes are refused while the project is read-only (offline cloud project).',
].join('\n');

const READ = { readOnlyHint: true };
const WRITE = { destructiveHint: true };

export const TOOL_DEFS = [
  {
    name: 'get_project',
    title: 'Get open project',
    description:
      'Read the currently open project (title, scenes, schedule/calendar versions, cast, crew, locations, element categories, day types, rules, designs). The retained screenplay body is excluded by default — pass includeScript:true only when needed (can be large).',
    inputSchema: {
      type: 'object',
      properties: {
        includeScript: { type: 'boolean', description: 'Include scriptDocument + scriptBaseline (large).' },
      },
      additionalProperties: false,
    },
    annotations: READ,
  },
  {
    name: 'list_scenes',
    title: 'List scenes (Glide grid values)',
    description:
      'Every scene × every breakdown column, exactly as the Breakdown sheet stores it. Columns include built-ins (sceneNumber, intExt, set, dayNight, cast, …) and custom categories.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
  },
  {
    name: 'get_schedule',
    title: 'Get computed schedule',
    description:
      'Computed stripboard rows in order plus sections (daybreak label/date, chrono day, pinned, per-section sums, end time) and per-row computedCallTime. Dates/call times derive from the ACTIVE calendar version.',
    inputSchema: {
      type: 'object',
      properties: {
        versionId: { type: 'string', description: 'Schedule version id (defaults to the active one).' },
      },
      additionalProperties: false,
    },
    annotations: READ,
  },
  {
    name: 'list_entities',
    title: 'List project entities',
    description: 'Read one entity collection from the open project.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['cast', 'crew', 'locations', 'categories', 'day_types', 'element_categories', 'rules'],
          description: 'Which collection to read.',
        },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    annotations: READ,
  },
  {
    name: 'get_versions',
    title: 'List schedule + calendar versions',
    description: 'Both independent axes: schedule versions (rows) and calendar versions (production window + day statuses/events), with the active ids.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
  },
  {
    name: 'get_schema',
    title: 'Get action + entity schema',
    description:
      'Derived from source: every dispatchable store action with its payload type, every core entity interface with its fields, plus the write conventions. Call this before building apply_actions payloads so field names are never guessed.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: ['actions', 'entities', 'all'], description: 'Default all.' },
        name: { type: 'string', description: 'Return only this action type or entity interface name.' },
      },
      additionalProperties: false,
    },
    annotations: READ,
  },
  {
    name: 'apply_actions',
    title: 'Apply store actions',
    description:
      'The one mutation path (same Action union the UI dispatches). Pass an array; atomic:true (default) wraps it in one undo entry. Returns {applied}. LOAD and EMPTY_TRASH are refused — ask the user to use the UI for those.',
    inputSchema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          items: { type: 'object' },
          description: 'Action objects, e.g. {type:"ADD_SCENE", payload:{…}} — see get_schema.',
        },
        atomic: { type: 'boolean', description: 'Wrap in one undo entry (default true).' },
      },
      required: ['actions'],
      additionalProperties: false,
    },
    annotations: WRITE,
  },
  {
    name: 'make_scene',
    title: 'Build a valid blank scene',
    description:
      'Return a complete Scene with a fresh id (all required fields defaulted); override any field via partial. Use it to build ADD_SCENE / INSERT_SCENE_AT payloads instead of hand-crafting fields.',
    inputSchema: {
      type: 'object',
      properties: { partial: { type: 'object', description: 'Fields to override on the blank scene.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'undo',
    title: 'Undo',
    description: 'Step the project undo history back one entry.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { idempotentHint: false },
  },
  {
    name: 'redo',
    title: 'Redo',
    description: 'Step the project undo history forward one entry.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { idempotentHint: false },
  },
  {
    name: 'get_bridge_status',
    title: 'Get bridge status',
    description: 'Is the app connected, which project is open, is it read-only, and the app-side sync diagnostics.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
  },
];

function requireApp(ctx) {
  if (!ctx.isAppConnected()) {
    throw new Error(
      'The lemon_schedule app is not connected. Open the app and enable File → Connect agent bridge (the helper listens on 127.0.0.1 only).',
    );
  }
}

function stripScript(project) {
  const { scriptDocument, scriptBaseline, ...rest } = project;
  return rest;
}

function actionError(message) {
  return new Error(`${message} — call get_schema for the full action list and payload shapes.`);
}

/**
 * Execute one tool. `ctx` provides `callApp(method, params)` (primary mode) and
 * `isAppConnected()`. Throwing marks the tool result as an execution error.
 */
export async function callTool(name, rawArgs, ctx) {
  const args = rawArgs || {};
  switch (name) {
    case 'get_project': {
      requireApp(ctx);
      const project = await ctx.callApp('getProject');
      return args.includeScript ? project : stripScript(project);
    }
    case 'list_scenes': {
      requireApp(ctx);
      return await ctx.callApp('getSceneValues');
    }
    case 'get_schedule': {
      requireApp(ctx);
      return await ctx.callApp('getRows', { versionId: args.versionId ?? null });
    }
    case 'list_entities': {
      requireApp(ctx);
      const project = await ctx.callApp('getProject');
      const kind = args.kind;
      switch (kind) {
        case 'cast':
          return { kind, cast: project.castMembers ?? [] };
        case 'crew':
          return { kind, roles: project.crewRoles ?? [], peopleByRole: project.crew ?? {}, order: project.crewOrder ?? [] };
        case 'locations':
          return { kind, types: project.locationTypes ?? [], locations: project.locations ?? [] };
        case 'categories':
          return { kind, categories: project.customCategories ?? [], labels: project.categoryLabels ?? {}, hidden: project.hiddenCategories ?? [] };
        case 'day_types':
          return { kind, dayTypes: project.dayTypes ?? [] };
        case 'element_categories':
          return { kind, elements: project.breakdownElements ?? {}, labels: project.categoryLabels ?? {}, hidden: project.hiddenCategories ?? [] };
        case 'rules':
          return { kind, rules: project.rules ?? [] };
        default:
          throw new Error(`Unknown entity kind '${kind}' — expected cast|crew|locations|categories|day_types|element_categories|rules.`);
      }
    }
    case 'get_versions': {
      requireApp(ctx);
      const project = await ctx.callApp('getProject');
      return {
        activeVersionId: project.activeVersionId,
        activeCalendarVersionId: project.activeCalendarVersionId,
        versions: (project.versions ?? []).map((v) => ({ id: v.id, name: v.name, rowCount: (v.rows ?? []).length, updatedAt: v.updatedAt })),
        calendarVersions: (project.calendarVersions ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          productionStart: c.productionStart ?? null,
          prepStart: c.prepStart ?? null,
          postEnd: c.postEnd ?? null,
          nonShootDateCount: (c.nonShootDates ?? []).length,
          updatedAt: c.updatedAt,
        })),
      };
    }
    case 'get_schema': {
      const section = args.section || 'all';
      const schema = buildSchema();
      if (args.name) {
        const action = schema.actions.find((a) => a.type === args.name);
        if (!action) {
          const entity = schema.entities[args.name];
          if (!entity) throw actionError(`Unknown action or entity '${args.name}'`);
          return { conventions: CONVENTIONS, entity };
        }
        return { conventions: CONVENTIONS, action };
      }
      return {
        conventions: CONVENTIONS,
        actions: section === 'entities' ? undefined : schema.actions,
        entities: section === 'actions' ? undefined : schema.entities,
      };
    }
    case 'apply_actions': {
      requireApp(ctx);
      if (!Array.isArray(args.actions) || args.actions.length === 0) {
        throw new Error('apply_actions expects a non-empty `actions` array.');
      }
      return await ctx.callApp('applyActions', {
        actions: args.actions,
        atomic: args.atomic !== false,
      });
    }
    case 'make_scene': {
      requireApp(ctx);
      return await ctx.callApp('makeScene', { partial: args.partial ?? {} });
    }
    case 'undo': {
      requireApp(ctx);
      return await ctx.callApp('undo');
    }
    case 'redo': {
      requireApp(ctx);
      return await ctx.callApp('redo');
    }
    case 'get_bridge_status': {
      const connected = ctx.isAppConnected();
      const status = { helperVersion: HELPER_VERSION, appConnected: connected, app: ctx.appInfo() };
      if (connected) {
        try {
          const project = await ctx.callApp('getProject');
          status.app = { ...(status.app || {}), projectId: project.id, projectTitle: project.title };
        } catch (err) {
          status.projectError = err instanceof Error ? err.message : String(err);
        }
        try {
          status.diagnostics = await ctx.callApp('diagnostics');
        } catch (err) {
          status.diagnosticsError = err instanceof Error ? err.message : String(err);
        }
      }
      return status;
    }
    default:
      throw new Error(`Unknown tool '${name}'.`);
  }
}
