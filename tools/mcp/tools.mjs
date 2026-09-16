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
  '- Stripboard edits have task-shaped tools (read get_schedule first for row ids): move_row (within/between the stripboard and boneyard), reorder_rows (set the whole order), sort_rows (hierarchical: e.g. set → day/night → INT/EXT), auto_daybreaks (re-split into days), delete_all_daybreaks, add_row (insert NOTE/BREAK/DAYBREAK).',
  '- RETIMING is a single UPDATE_ROW through apply_actions: scene row `estimatedDuration` (minutes), break row `breakDuration`, and a day start time = the DAYBREAK row ABOVE the section (`daybreakCallTime`). A scene row is id-keyed; get its rowId + sceneId from get_schedule.',
  '- REPORTS DESIGNER: call get_report_registry for the block/collection/field vocabulary, list_entities kind "reports" for the design list (new projects seed templates incl. a Call Sheet), and get_report_design for one full tree. Build blocks with make_report_block, then apply_actions ADD_REPORT_DESIGN / UPDATE_REPORT_DESIGN (clone a seeded design via {cloneFromId} to start from a template). Never hand-craft block ids.',
  '- DAY READS (canonical Day Manager model — never re-derive): get_days lists every production day (date, call/first call/wrap, counts, sums, violations); get_day resolves ONE day in full (scenes + call times, cast/elements with DOOD codes, crew, locations, notes, breaks, violations). get_violations = rule breaches by day/scene; get_element_stats(category) = per-element work/finish/day-type counts; audit_script/repair_script = script↔project integrity.',
  '- Wrap related writes in one apply_actions call (atomic:true = one undo entry).',
  '- For BULK edits across many items (e.g. a description on every one of 150+ scenes), do NOT send one giant apply_actions array: the app applies each action through React, and a very large nested batch (~100+) throws "Maximum update depth exceeded". Use a LOOP of apply_actions calls of ~20-30 actions each; for bulk work set atomic:false so one oversize call cannot abort the run (losing the single-undo benefit is fine for bulk edits). Read each item from the app first (e.g. get_scene_script) so payloads carry real ids — never hand-craft ids.',
  '- Blocked over the bridge: LOAD (replaces the project + clears history) and EMPTY_TRASH (irreversible). Ask the user to do those in the UI.',
  '- Breakdowns are FOR THE SCHEDULE, not the story: tag every element in EVERY scene it appears — cast (speaking), background/extras (+rough count), stunts, practical SFX, VFX, props, vehicles, animals (+wrangler), wardrobe, hair/makeup, special equipment, and notes (permits, minors, night, weather). Catch what the script IMPLIES, not just names: "he grabs his keys and leaves" = prop + vehicle + location; a night-exterior slugline hides safety and lighting. Page counts are in eighths, never eyeballed.',
  '- Writing a scene description (the one-liner): ONE concise present-tense action line — what happens and who, in order, specific never generic ("the scene continues" or quoted dialogue is wrong). Flag what the AD must schedule (stunt, minor, night exterior, animal, SFX). Never invent elements/cast — flag uncertainty instead of guessing.',
  '- Element fields (props, wardrobe, makeup, sfx, vfx, sound, music, vehicles, stunts, backgroundActors, animalsAndWranglers, weapons, greenery, artDept, sets, custom categories) are COMMA-SEPARATED lists of SIMPLE ATOMIC names — "STATUE", never "STATUE (blood-caked)" or semicolons. `set` is single-value; description/notes/location are free text. Writing a scene element field via apply_actions AUTO-REGISTERS each new name in the Element Manager (exactly like typing it in the UI) — do NOT also send ADD_ELEMENT by hand.',
  '- Name elements with the EXACT word(s) the script uses, in the same form — "SCREAMS" not "SCREAM", "STATUE" not "BLOOD-CAKED STATUE", "WEEPING" not "TEARS". The screenplay highlighter matches an element name as a WHOLE WORD in a scene\'s action/dialogue (cast matches the character cue instead), so a name that never appears verbatim in the script is never highlighted or suggested. Prefer a single scripted word over an editorial label; a flag with no scripted noun (a stunt, an implied effect) is still valid but will not highlight.',
  '- CAST IS DIFFERENT: scene.cast holds comma-separated cast IDs (not names) that reference project.castMembers, and cast is NEVER auto-registered. Reference existing cast member ids only; to add a person, ADD_CAST_MEMBER (blank) + UPDATE_CAST_MEMBER with the name — the UI otherwise does this via its naming modal. A cast member\'s NAME should equal the character cue in the script ("CAROL") so it highlights.',
  '- Element color code (common set, not legally fixed; wardrobe/makeup/VFX/set-dressing vary per show): red cast · yellow silent extras · green atmosphere · orange stunts · blue practical SFX · purple props · pink vehicles/animals · brown sound.',
  '- Writes are refused while the project is read-only (offline cloud project).',
].join('\n');

const READ = { readOnlyHint: true };
const WRITE = { destructiveHint: true };

export const TOOL_DEFS = [
  {
    name: 'get_project',
    title: 'Get open project',
    description:
      'Read the currently open project (title, scenes, schedule/calendar versions, cast, crew, locations, element categories, day types, rules, designs). The retained screenplay body is excluded by default — use get_scene_script for one scene; pass includeScript:true only when the whole script is genuinely needed (large).',
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
    name: 'get_scene_script',
    title: 'Get one scene + its script body',
    description:
      "One scene's breakdown row PLUS its retained screenplay body (heading, action, dialogue blocks), matched by scene number. Use this instead of get_project(includeScript:true) — a full script can exceed the read limit. Returns null when the scene number is unknown.",
    inputSchema: {
      type: 'object',
      properties: { sceneNumber: { type: 'string', description: 'Scene number as shown in the breakdown, e.g. "23A".' } },
      required: ['sceneNumber'],
      additionalProperties: false,
    },
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
    name: 'get_days',
    title: 'List production days',
    description:
      'Every production day in the stripboard: chrono day, date, section label, call time / first call / wrap, scene + cast + element counts, scene locations, master location, day note, section sums (minutes, pages, end time) and a violation count. Dates come from the ACTIVE calendar version. Use get_day for one day in full.',
    inputSchema: { type: 'object', properties: { versionId: { type: 'string', description: 'Schedule version id (default: active).' } }, additionalProperties: false },
    annotations: READ,
  },
  {
    name: 'get_day',
    title: 'Get one resolved production day',
    description:
      'ONE day fully resolved (the Day Manager read model): scenes with computed call times, cast + elements with DOOD codes, crew, locations, notes, breaks, rule violations and section sums. Select by sectionIndex (raw), chronoDay (1-based production day) or date (YYYY-MM-DD). Returns null when not found.',
    inputSchema: {
      type: 'object',
      properties: {
        versionId: { type: 'string' },
        sectionIndex: { type: 'number', description: 'Raw section index.' },
        chronoDay: { type: 'number', description: '1-based production day (Day 1 = 1).' },
        date: { type: 'string', description: 'YYYY-MM-DD.' },
      },
      additionalProperties: false,
    },
    annotations: READ,
  },
  {
    name: 'get_violations',
    title: 'Get rules violations',
    description: 'Rule violations across the schedule: total, per day (chrono/date/label) and per scene. Empty when the project has no rules.',
    inputSchema: { type: 'object', properties: { versionId: { type: 'string' } }, additionalProperties: false },
    annotations: READ,
  },
  {
    name: 'get_element_stats',
    title: 'Get element day stats',
    description:
      "Per-element day statistics for a category (cast, props, wardrobe, …): first/finish date, work days, total days (work + attached) and day-type counts. This is what the Element Manager / DOODs use.",
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string', description: "Element category key, e.g. 'cast', 'props'." } },
      required: ['category'],
      additionalProperties: false,
    },
    annotations: READ,
  },
  {
    name: 'audit_script',
    title: 'Audit the script map',
    description: 'Project ↔ scriptDocument integrity report: duplicate scene numbers, orphan/dangling screenplay bodies, scenes missing rows. Read-only — use repair_script to fix.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
  },
  {
    name: 'repair_script',
    title: 'Repair the script map',
    description: 'Renumber/prune/re-link the script map to restore project↔scriptDocument integrity (one undo entry). Review audit_script first.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: WRITE,
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
          enum: ['cast', 'crew', 'locations', 'categories', 'day_types', 'element_categories', 'rules', 'reports'],
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
      'The one mutation path (same Action union the UI dispatches). Pass an array; atomic:true (default) wraps it in one undo entry. Returns {applied} (plus elementsRegistered when a scene edit introduced new Element Manager entries). LOAD and EMPTY_TRASH are refused — ask the user to use the UI for those. For BULK edits, call this several times with ~20-30 actions each (atomic:false) instead of one huge array — very large batches throw "Maximum update depth exceeded". Writing scene element fields auto-registers new names in the Element Manager; CAST is the exception (id-keyed, never auto-created — reference existing cast ids).',
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
    name: 'move_row',
    title: 'Move rows on the stripboard',
    description:
      'Move one or more rows to a position on the stripboard or in the boneyard (both directions) — the drag-and-drop equivalent. Position with beforeRowId, afterRowId, or toIndex (0-based, among the target container). Omit all three to append. The pinned Day 1 daybreak never moves. Returns {applied,rowCount}. Use this for boneyard ↔ stripboard moves.',
    inputSchema: {
      type: 'object',
      properties: {
        versionId: { type: 'string', description: 'Schedule version id (default: active).' },
        rowIds: { type: 'array', items: { type: 'string' }, description: 'Row ids to move (relative order preserved).' },
        toContainer: { type: 'string', enum: ['stripboard', 'boneyard'], description: "Target container (default: the anchor row's, else stripboard)." },
        beforeRowId: { type: 'string', description: 'Insert before this row.' },
        afterRowId: { type: 'string', description: 'Insert after this row.' },
        toIndex: { type: 'number', description: "0-based index among the target container's rows." },
      },
      required: ['rowIds'],
      additionalProperties: false,
    },
    annotations: WRITE,
  },
  {
    name: 'reorder_rows',
    title: 'Set the stripboard order',
    description:
      'Set a schedule version’s stripboard order explicitly: orderedRowIds must be a permutation of its current stripboard rows (daybreaks included). Boneyard rows keep their relative order after it; the pinned Day 1 daybreak is forced first. Get row ids from get_schedule. Use move_row for a surgical move; this is the whole-board variant.',
    inputSchema: {
      type: 'object',
      properties: {
        versionId: { type: 'string', description: 'Schedule version id (default: active).' },
        orderedRowIds: { type: 'array', items: { type: 'string' }, description: 'Full stripboard order (all rows incl. daybreaks).' },
      },
      required: ['orderedRowIds'],
      additionalProperties: false,
    },
    annotations: WRITE,
  },
  {
    name: 'sort_rows',
    title: 'Hierarchically sort the stripboard',
    description:
      'Sort scene rows by an ordered list of criteria (the toolbar Sort) — e.g. [{key:"set"},{key:"day_night"},{key:"int_ext"}] groups by set, then day/night, then INT/EXT. Built-ins: scene_number, script_day, page_count, duration, int_ext, day_night; any scene field or custom category also works. DESTRUCTIVE like the UI: drops existing daybreaks and their day details.',
    inputSchema: {
      type: 'object',
      properties: {
        versionId: { type: 'string', description: 'Schedule version id (default: active).' },
        criteria: {
          type: 'array',
          description: 'Ordered criteria — the first is primary, the rest break ties.',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] },
            },
            required: ['key'],
            additionalProperties: false,
          },
        },
        customOrders: { type: 'object', description: 'Explicit value order per criterion, e.g. { int_ext: ["INT","EXT","INT/EXT"] }.' },
        removeDaybreaks: { type: 'boolean', description: 'Drop existing non-pinned daybreaks first (default true).' },
      },
      required: ['criteria'],
      additionalProperties: false,
    },
    annotations: WRITE,
  },
  {
    name: 'auto_daybreaks',
    title: 'Auto day breaks',
    description:
      'Split the stripboard into production days by running time (mode:"duration", threshold in minutes) or page count (mode:"pages", threshold in pages). DESTRUCTIVE like the toolbar action: it drops every existing daybreak and re-splits the board; notesAction/breaksAction decide where displaced NOTE/BREAK rows go (default "boneyard").',
    inputSchema: {
      type: 'object',
      properties: {
        versionId: { type: 'string', description: 'Schedule version id (default: active).' },
        mode: { type: 'string', enum: ['duration', 'pages'] },
        threshold: { type: 'number', description: 'Minutes (duration mode) or pages (pages mode).' },
        notesAction: { type: 'string', enum: ['boneyard', 'delete'], description: 'Default boneyard.' },
        breaksAction: { type: 'string', enum: ['boneyard', 'delete'], description: 'Default boneyard.' },
      },
      required: ['mode', 'threshold'],
      additionalProperties: false,
    },
    annotations: WRITE,
  },
  {
    name: 'delete_all_daybreaks',
    title: 'Delete all day breaks',
    description:
      'Remove every non-pinned daybreak from the stripboard (the toolbar Delete All). Day details on those breaks are discarded. Undoable.',
    inputSchema: {
      type: 'object',
      properties: { versionId: { type: 'string', description: 'Schedule version id (default: active).' } },
      additionalProperties: false,
    },
    annotations: WRITE,
  },
  {
    name: 'add_row',
    title: 'Insert a stripboard row',
    description:
      'Insert a NOTE, BREAK or DAYBREAK row at a position on the stripboard or boneyard (the context menu’s add-row). Position with beforeRowId/afterRowId/toIndex; omit to append. The row id is generated for you. NOTE fields: noteText, noteColor, noteTextColor, estimatedDuration. BREAK: breakLabel, breakDuration, isTimed.',
    inputSchema: {
      type: 'object',
      properties: {
        versionId: { type: 'string', description: 'Schedule version id (default: active).' },
        row: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['NOTE', 'BREAK', 'DAYBREAK'] },
            noteText: { type: 'string' },
            noteColor: { type: 'string' },
            noteTextColor: { type: 'string' },
            estimatedDuration: { type: 'number' },
            breakLabel: { type: 'string' },
            breakDuration: { type: 'number' },
            isTimed: { type: 'boolean' },
            daybreakLabel: { type: 'string' },
            daybreakCallTime: { type: 'string' },
          },
          required: ['type'],
          additionalProperties: false,
        },
        container: { type: 'string', enum: ['stripboard', 'boneyard'] },
        beforeRowId: { type: 'string' },
        afterRowId: { type: 'string' },
        toIndex: { type: 'number' },
      },
      required: ['row'],
      additionalProperties: false,
    },
    annotations: WRITE,
  },
  {
    name: 'get_report_registry',
    title: 'Reports Designer vocabulary',
    description:
      'The Reports-Designer builder dictionary: every collection (key/label, whether it is contextual-child-only, scoped, or a typed-parent child), the field registry (key/label/group/scope + multiValue/dayList/link flags), and the block types. Call this before composing a report design so field and collection keys are never guessed.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
  },
  {
    name: 'get_report_design',
    title: 'Get one report design',
    description:
      "One report design's full block tree (blocks + header/footer + page). Designs are seeded on new projects — including a Call Sheet template — so read one and clone it via apply_actions ADD_REPORT_DESIGN { cloneFromId } rather than building from scratch. Get ids from list_entities kind 'reports'.",
    inputSchema: {
      type: 'object',
      properties: { reportId: { type: 'string', description: 'Report design id.' } },
      required: ['reportId'],
      additionalProperties: false,
    },
    annotations: READ,
  },
  {
    name: 'make_report_block',
    title: 'Build a valid report block',
    description:
      'Return a complete ReportBlock (correct defaults for the type) to merge into a design. Use get_report_registry for block types + field/collection keys. Build blocks with this, then apply_actions ADD_REPORT_DESIGN / UPDATE_REPORT_DESIGN with the tree — never hand-craft ids.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['text', 'field', 'repeat', 'table', 'columns', 'ribbon', 'pageBreak', 'spacer', 'image', 'map', 'link', 'callSheetEdit', 'relative', 'callTimes', 'crewTable'],
        },
        block: { type: 'object', description: 'Partial ReportBlock fields merged over the type defaults (e.g. {text,field,collection,category,children,columns}).' },
      },
      required: ['type'],
      additionalProperties: false,
    },
    annotations: READ,
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
    case 'get_scene_script': {
      requireApp(ctx);
      if (typeof args.sceneNumber !== 'string' || !args.sceneNumber.trim()) {
        throw new Error('get_scene_script requires a non-empty sceneNumber.');
      }
      return await ctx.callApp('getSceneScript', { sceneNumber: args.sceneNumber });
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
        case 'reports':
          return {
            kind,
            activeReportId: project.activeReportId ?? null,
            designs: (project.reportDesigns ?? []).map((d) => ({
              id: d.id,
              name: d.name,
              page: d.page,
              blockCount: (d.blocks ?? []).length,
              hasHeader: !!d.header?.length,
              hasFooter: !!d.footer?.length,
            })),
            textStyles: project.reportTextStyles ?? [],
          };
        default:
          throw new Error(`Unknown entity kind '${kind}' — expected cast|crew|locations|categories|day_types|element_categories|rules|reports.`);
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
    case 'move_row': {
      requireApp(ctx);
      if (!Array.isArray(args.rowIds) || args.rowIds.length === 0) {
        throw new Error('move_row requires a non-empty rowIds array.');
      }
      return await ctx.callApp('moveRows', {
        versionId: args.versionId ?? null,
        rowIds: args.rowIds,
        toContainer: args.toContainer,
        beforeRowId: args.beforeRowId ?? null,
        afterRowId: args.afterRowId ?? null,
        toIndex: args.toIndex ?? null,
      });
    }
    case 'reorder_rows': {
      requireApp(ctx);
      if (!Array.isArray(args.orderedRowIds) || args.orderedRowIds.length === 0) {
        throw new Error('reorder_rows requires a non-empty orderedRowIds array.');
      }
      return await ctx.callApp('reorderRows', {
        versionId: args.versionId ?? null,
        orderedRowIds: args.orderedRowIds,
      });
    }
    case 'sort_rows': {
      requireApp(ctx);
      if (!Array.isArray(args.criteria) || args.criteria.length === 0) {
        throw new Error('sort_rows requires a non-empty criteria array of {key, direction?}.');
      }
      return await ctx.callApp('sortRows', {
        versionId: args.versionId ?? null,
        criteria: args.criteria,
        customOrders: args.customOrders,
        removeDaybreaks: args.removeDaybreaks,
      });
    }
    case 'auto_daybreaks': {
      requireApp(ctx);
      if (args.mode !== 'duration' && args.mode !== 'pages') {
        throw new Error('auto_daybreaks requires mode "duration" or "pages".');
      }
      if (typeof args.threshold !== 'number' || !(args.threshold > 0)) {
        throw new Error('auto_daybreaks requires a positive numeric threshold.');
      }
      return await ctx.callApp('autoDaybreaks', {
        versionId: args.versionId ?? null,
        mode: args.mode,
        threshold: args.threshold,
        notesAction: args.notesAction,
        breaksAction: args.breaksAction,
      });
    }
    case 'delete_all_daybreaks': {
      requireApp(ctx);
      return await ctx.callApp('deleteAllDaybreaks', { versionId: args.versionId ?? null });
    }
    case 'add_row': {
      requireApp(ctx);
      if (!args.row || typeof args.row.type !== 'string') {
        throw new Error('add_row requires a row object with a type (NOTE|BREAK|DAYBREAK).');
      }
      return await ctx.callApp('insertRow', {
        versionId: args.versionId ?? null,
        row: args.row,
        container: args.container,
        beforeRowId: args.beforeRowId ?? null,
        afterRowId: args.afterRowId ?? null,
        toIndex: args.toIndex ?? null,
      });
    }
    case 'get_report_registry': {
      requireApp(ctx);
      return await ctx.callApp('getReportRegistry');
    }
    case 'get_days': {
      requireApp(ctx);
      return await ctx.callApp('getDays', { versionId: args.versionId ?? null });
    }
    case 'get_day': {
      requireApp(ctx);
      if (args.sectionIndex == null && args.chronoDay == null && !args.date) {
        throw new Error('get_day needs one of sectionIndex, chronoDay or date.');
      }
      return await ctx.callApp('getDay', {
        versionId: args.versionId ?? null,
        sectionIndex: args.sectionIndex,
        chronoDay: args.chronoDay,
        date: args.date,
      });
    }
    case 'get_violations': {
      requireApp(ctx);
      return await ctx.callApp('getViolations', { versionId: args.versionId ?? null });
    }
    case 'get_element_stats': {
      requireApp(ctx);
      if (typeof args.category !== 'string' || !args.category.trim()) {
        throw new Error("get_element_stats requires a category key (e.g. 'cast').");
      }
      return await ctx.callApp('getElementStats', { category: args.category });
    }
    case 'audit_script': {
      requireApp(ctx);
      return await ctx.callApp('auditScript');
    }
    case 'repair_script': {
      requireApp(ctx);
      return await ctx.callApp('repairScript');
    }
    case 'get_report_design': {
      requireApp(ctx);
      if (typeof args.reportId !== 'string' || !args.reportId.trim()) {
        throw new Error('get_report_design requires a reportId. Get ids from list_entities kind "reports".');
      }
      return await ctx.callApp('getReportDesign', { reportId: args.reportId });
    }
    case 'make_report_block': {
      requireApp(ctx);
      if (typeof args.type !== 'string' || !args.type.trim()) {
        throw new Error('make_report_block requires a block type (see get_report_registry).');
      }
      return await ctx.callApp('makeReportBlock', { ...(args.block || {}), type: args.type });
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
        try {
          status.history = await ctx.callApp('historyDepth');
        } catch (err) {
          status.historyError = err instanceof Error ? err.message : String(err);
        }
      }
      return status;
    }
    default:
      throw new Error(`Unknown tool '${name}'.`);
  }
}
