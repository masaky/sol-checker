# Sol-Checker Report
**File:** /Users/rosemary/projects/gen-art/on-chain-esc-game/contracts/src/OnChainEscape.sol
**Date:** 2026-03-11
**Provider:** claude (claude-sonnet-4-20250514)

## Summary
| Severity | Count |
|----------|-------|
| HIGH | 1 |
| MEDIUM | 1 |
| LOW | 2 |
| INFO | 1 |

## Findings

### [HIGH] Global State Manipulation
**Description:** All state variables (isDoorOpen, hasKey, lightsOn) are global and can be modified by any address. Multiple users can interact with the same contract instance, leading to race conditions and state corruption.
**Impact:** Any user can affect the game state for all other users. One user picking up the key or opening the door affects the experience for everyone else using the same contract.
**Fix:** Use a mapping to track individual player states: mapping(address => PlayerState) where PlayerState is a struct containing isDoorOpen, hasKey, and lightsOn for each player.

### [MEDIUM] Missing Access Control
**Description:** All functions (toggleLight, pickUpKey, openDoor) are public with no access restrictions, allowing any address to call them and modify the game state.
**Impact:** Malicious actors can grief other players by manipulating the shared game state, turning off lights, taking keys, or opening doors.
**Fix:** Implement per-player state tracking so each address has their own game instance, or add proper access control mechanisms.

### [LOW] No Reset Mechanism
**Description:** Once the game reaches certain states (hasKey = true, isDoorOpen = true), there is no way to reset the game state back to the initial conditions.
**Impact:** The contract becomes less useful over time as the game can only be 'completed' once and cannot be restarted for new players or replay.
**Fix:** Add a reset function that allows players to restart their individual game state, or implement automatic reset logic.

### [LOW] State Inconsistency Potential
**Line:** 45
**Description:** The pickUpKey function sets hasKey to true but doesn't prevent the key from being visible in the render function if the door is later opened by another transaction.
**Impact:** Minor visual inconsistency in the game state representation, potentially confusing users about the actual game state.
**Fix:** Ensure render function logic properly reflects all possible state combinations and their visual representations.

### [INFO] Missing Events
**Description:** No events are emitted when game state changes occur (light toggle, key pickup, door opening), making it difficult to track game progress off-chain.
**Impact:** Reduced observability and difficulty in building user interfaces or analytics around the game.
**Fix:** Add events for each state change: event LightToggled(address player, bool lightsOn), event KeyPickedUp(address player), event DoorOpened(address player).
