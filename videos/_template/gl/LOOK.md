# Look

The rules every plate follows, so different agents' plates cut together as one film. Fill this in once the treatment
is approved. The example (videos/end-of-the-decade/gl/LOOK.md) has: palette and grades per section, the type system,
the karaoke rules (unsung dim, the sung part wipes in the signal colour, done words settle), the motion rules for each
kind of character, the shared modules (`scenes/_look.ts`, `scenes/_cast.ts`, owned by the lead), the performance
budget per frame, and how to review your own renders.

## Palette and grades

## Type and karaoke

## Motion

## Shared modules

## Review loop
- Stills: `bun scripts/render.ts stills --video <slug> --only <plate> --t 12.5,14` (from gl/app), then look at them.
- Contact sheet: `bun scripts/render.ts sheet --video <slug> --only <plate> --from A --to B --n 16 --cols 4`.
- Performance: `bun scripts/render.ts perf --video <slug> --only <plate> --from A --to B`.
