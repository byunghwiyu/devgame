# map_nodes.csv maintenance guide

`data/csv/map_nodes.csv` is the source of truth for world node data.

## Columns
- `key`: unique node id (example: `N1_TOWN`)
- `name`: display name
- `type`: node type string (example: `TOWN`, `BATTLE`, `EVENT`, `BOSS`, `HIDDEN`)
- `description`: node description
- `next_keys`: optional legacy links, separated by `|` (not required for choice-based world select)
- `visible_level`: minimum user level required to show this world in the list
- `required_level`: minimum user level required to enter this world
- `required_item_key`: optional item key
- `bg_image_key`: optional background image key

## Level rule
- Show world when `userLevel >= visible_level`
- Allow entry when `userLevel >= required_level`
- If `visible_level` is empty, loader falls back to `required_level` then `1`
- If `required_level` is empty, loader falls back to `1`

## Rules for adding worlds
1. `key` must be unique.
2. Every key in `next_keys` must exist in the same CSV.
3. `visible_level` and `required_level` must be positive integers when provided.
4. Keep `next_keys` empty when not using graph-based movement.

## Validation behavior
`loadMapNodes()` throws detailed errors when:
- duplicate keys exist
- referenced `next_keys` do not exist
- required fields are blank
- level values are invalid

This keeps CSV-first world maintenance safe as content grows.
