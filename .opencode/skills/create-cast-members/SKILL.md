---
name: create-cast-members
description: Add or edit cast members in Lemon Schedule the correct way over the MCP/debug bridge — cast is Board-ID keyed (numeric ids in scene.cast, names only on project.castMembers). Use when a task involves creating cast, tagging a character on a scene, changing a Board ID, or fixing a name-typed-instead-of-id mistake, via apply_actions / list_entities / get_schema.
---

# Creating Cast Members (MCP)

## The golden rule

`scene.cast` stores **comma-separated numeric Board IDs** (`"2, 17"`), never
names. `project.castMembers` stores `{ id, name }` — the name is display-only.
Typing a name into a cast field is a UI-only beginner mistake (the app shows a
naming modal and re-IDs it on save, roadmap 228); **agents must always pass
numeric ids**.

## Read before you write

1. `list_entities kind: "cast"` → `[{ id, name }]` — the existing Board IDs.
2. `list_scenes` (or `get_project`) → the raw `cast` ids each scene currently
   has (merge into that list; never replace it blindly).
3. `get_schema name: "ADD_ELEMENT"` / `"UPDATE_SCENE"` / `"UPDATE_CAST_MEMBER"`
   — payload shapes, no guessing.

## Add a new member (one atomic batch)

Pick the id first: the app uses the **first unused positive integer** (Board
IDs are sequential; reuse an existing member's id when the name already exists
— match case-insensitively and never create duplicates).

```jsonc
[
  { "type": "ADD_ELEMENT", "payload": { "category": "cast", "element": { "id": "42", "name": "MARY" } } },
  { "type": "UPDATE_SCENE", "payload": { "id": "<scene id>", "cast": "1, 42" } }
]
```

- `ADD_ELEMENT` with `category: "cast"` **upserts by id** — pass the real name
  (uppercase by convention). Never dispatch the blank-name variant
  (`name: ""`): that is the UI's naming-modal flow, not an agent path.
- Pass the whole scene (`ADD_SCENE` with `make_scene`) cast list at creation
  time when building scenes; the new row lands in the Boneyard like any add.
- Bulk work: several `apply_actions` calls of ~20-30 actions each
  (`atomic: false` between chunks), not one huge array.

## Fix a name-typed-instead-of-id member

A member whose id is **not numeric** (someone typed a name in the UI) is
repairable without touching scenes by hand — rename the id and the cascade
rewrites every `scene.cast` + script tag in the same action:

```jsonc
{ "type": "UPDATE_ELEMENT", "payload": { "category": "cast", "id": "MARY", "updates": { "id": "43", "name": "MARY" } } }
```

## Other edits

- Rename: `UPDATE_CAST_MEMBER { id, name }` — the scene fields keep the id.
- Delete: `DELETE_CAST_MEMBER` — strips the id from every scene for you; never
  edit `scene.cast` to "remove" someone.
- Board-ID change: always `UPDATE_ELEMENT` (`category: "cast"`), never
  delete + recreate — the rename is the one cascade-safe path.

## Never

- Put a name (or `"2. MARY"` display text) into `scene.cast`.
- Create a member for a name that already exists — resolve to its id first.
- Reuse an id that is already taken by a different person.
- Hand-craft `ADD_ELEMENT` cast payloads outside `get_schema`'s shape.
