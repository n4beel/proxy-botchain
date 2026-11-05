# Proxy

> Vote yourself, or hand your vote to someone. Every delegation is traceable and single-hop.

## Archetype
- **AV · Delegation tree**
- Ground `#6B1F7B` · Surface `#491554` · Ink `#FBEAFF` · Accent `#FFD166`
- Typography: Josefin Sans (headings), Mukta (UI text), Lekton (addresses, tallies, counts)

## WCAG Contrast Measurements
- Ink (`#FBEAFF`) on Ground (`#6B1F7B`): **8.7:1** (AAA)
- Ink (`#FBEAFF`) on Surface (`#491554`): **12.1:1** (AAA)
- Muted (`#CAA5D2`) on Surface (`#491554`): **6.5:1** (AA)
- Accent Ink (`#2A0A33`) on Accent (`#FFD166`): **12.2:1** (AAA)
- Menu Text (`#FBEAFF`) on Menu BG (`#491554`): **12.1:1** (AAA)
- Menu Muted (`#AD8CB4`) on Menu BG (`#491554`): **4.7:1** (AA)

## What it is
A poll where you can lend your vote. The creator specifies a question with 2 to 6 options and a duration between 1 hour and 90 days. Each wallet has one vote. You either vote for an option, or delegate your vote to another wallet that has not delegated. When you delegate, your vote follows theirs: it counts for whatever option they vote for, and is added the moment they do. You can take your vote back at any time while the poll is open. Delegation is strictly one hop: someone holding delegated votes cannot delegate onward.

## Verification
- Unit & Invariant tests: 18 forge tests passing (including invariant handler with 128,000 calls).
- Mutation check: 25 of 25 mutants killed (0 survivors).
- Integration tests: Anvil port 8663, verifying against pure reference model `applyAction`.
- Local stack: `node scripts/local-stack.mjs` (port 8763).
