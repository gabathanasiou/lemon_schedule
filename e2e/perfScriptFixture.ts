import type { Project, ScriptAnnotation, ScriptBlock, ScriptDocument, ScriptScene } from '../src/types';

/**
 * Deterministic full-length screenplay fixture for the Script-tab perf harness
 * (roadmap 163). Built from a seed project's OWN cast + element names so the
 * tagging derivation (`attachedRanges` / `suggestionRanges`) does the same work
 * it does on a real imported feature script: every scene body carries names the
 * app scans for, attached fields reference cast that appears in the prose, and
 * committed annotations exercise the stored-span path.
 *
 * Same project in → same document out (mulberry32, fixed seed).
 */

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Names the occurrence scanner can actually match: `\bNAME\b` needs a word
 *  character at both ends (a leading quote is a non-word char → never matches). */
const matchable = (name: string) => /^[A-Za-z0-9]/.test(name) && /[A-Za-z0-9]$/.test(name);

const TALK_VERBS = ['answer', 'whisper', 'laugh', 'insist', 'wonder', 'admit', 'promise', 'shout'];

export function buildPerfScript(project: Project): { doc: ScriptDocument; annotations: ScriptAnnotation[] } {
  const rnd = mulberry32(0x5eed163);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length) % arr.length];

  const cast = (project.castMembers || [])
    .map(m => ({ id: String(m.id), name: (m.name || '').trim() }))
    .filter(m => m.name && matchable(m.name));

  const cats = project.breakdownElements || {};
  const elements = Object.entries(cats).flatMap(([category, list]) =>
    (category === 'set' || category === 'sequence' || category === 'unit' ? [] : list || [])
      .map(e => ({ category, name: (e.name || '').trim() }))
      .filter(e => e.name && matchable(e.name)),
  );

  const scenes: ScriptScene[] = [];
  const annotations: ScriptAnnotation[] = [];
  let annotationSeq = 0;

  const scenesInProject = project.scenes || [];
  for (let i = 0; i < scenesInProject.length; i++) {
    const live = scenesInProject[i];
    const blocks: ScriptBlock[] = [];
    const heading = `${(live.intExt || 'INT').replace(/\.$/, '')}. ${((live.set || 'LOCATION').toUpperCase())} - ${(live.dayNight || 'DAY').toUpperCase()}`;
    blocks.push(['heading', heading]);

    const description = (live.description || '').trim();
    if (description) blocks.push(['action', /[.!?]$/.test(description) ? description : `${description}.`]);

    // One element appearance (action) + one dialogue exchange per scene.
    const prop = pick(elements);
    const extra = pick(elements);
    const lead = pick(cast);

    const actionText = `They bring the ${prop.name} around as ${lead.name} crosses the room with the ${extra.name}.`;
    blocks.push(['action', actionText]);

    const dialogueText = `${lead.name}, we should take the ${extra.name} before dark.`;
    blocks.push(['character', lead.name]);
    blocks.push(['parenthetical', '(quietly)']);
    blocks.push(['dialogue', dialogueText]);
    blocks.push(['action', `${lead.name} ${pick(TALK_VERBS)} at the ${prop.name} and leaves.`]);

    // Filler paragraphs up to feature-script length — every one carries element
    // names so the occurrence scans run on realistic input volume.
    for (let k = 0; k < 5; k++) {
      const a = pick(elements);
      const b = pick(elements);
      blocks.push(['action', `The ${a.name} waits by the window; nobody touches the ${b.name} ${pick(TALK_VERBS)}ing in the corner of the room.`]);
    }
    const second = pick(elements);
    blocks.push(['character', lead.name]);
    blocks.push(['dialogue', `We leave the ${second.name} here and come back for it in the morning.`]);
    blocks.push(['transition', 'CUT TO:']);

    const sceneNumber = String(live.sceneNumber ?? i + 1);
    scenes.push({ sceneNumber, blocks });

    // Committed tag on the lead's character cue (cast is id-keyed) + a
    // name-keyed tag on the first prop occurrence in the action line.
    const cueIndex = blocks.findIndex(b => b[0] === 'character' && b[1] === lead.name);
    if (cueIndex >= 0) {
      annotations.push({
        id: `perf-tag-${++annotationSeq}`,
        sceneId: live.id,
        blockIndex: cueIndex,
        start: 0,
        end: lead.name.length,
        text: lead.name,
        category: 'cast',
        elementKey: lead.id,
      });
    }
    const propBlockIndex = blocks.findIndex(b => b[0] === 'action' && b[1] === actionText);
    const propStart = actionText.indexOf(prop.name);
    if (propBlockIndex >= 0 && propStart >= 0) {
      annotations.push({
        id: `perf-tag-${++annotationSeq}`,
        sceneId: live.id,
        blockIndex: propBlockIndex,
        start: propStart,
        end: propStart + prop.name.length,
        text: prop.name,
        category: prop.category,
        elementKey: prop.name,
      });
    }
  }

  const doc: ScriptDocument = {
    format: 'fdx',
    name: 'perf-harness-script.fdx',
    titlePage: { title: `${project.title} — PERFORMANCE SCRIPT` },
    scenes,
  };
  return { doc, annotations };
}
