# Architecture & Design Decisions: Proxy

## 1. Single-Hop Delegation Rule
- **Decision**: A wallet cannot delegate if it holds delegations (`HoldsDelegations`), nor can it delegate to a wallet that has already delegated (`TargetDelegated`).
- **Rationale**: Multi-hop delegation graphs require cycle detection or deep DAG graph traversal that either causes unbounded gas loops or double counting issues. By restricting delegation strictly to single-hop within an individual poll, every delegation is `O(1)` gas and immediately traceable.

## 2. Dynamic Take-Back Accounting (Reclaim)
- **Decision**: When a wallet delegates:
  - If the delegate has already voted, `_tally[opt] += 1` immediately.
  - If the delegate has not voted yet, `_received[delegate] += 1`.
  When a delegator calls `reclaim()`:
  - If the delegate has already voted, `_tally[delegate's option] -= 1`.
  - If the delegate has not voted yet, `_received[delegate] -= 1`.
- **Rationale**: Maintains the invariant that `sum(tallies) + sum(received) == (voted wallets) + (currently delegating wallets)` at all times. A delegator can change their mind or vote themselves as long as the poll is open.

## 3. Identifiers and Event Naming
- **Decision**: Event `Delegated(uint256 indexed id, address indexed from, address indexed to, bool counted)` is paired with custom error `AlreadyDelegated(address to)` to prevent Solc identifier shadowing collisions between errors and events.

## 4. Mutation Testing Results
- 25 of 25 mutants killed (100% kill rate) with 0 survivors.
