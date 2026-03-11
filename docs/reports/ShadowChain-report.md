# Sol-Checker Report
**File:** /Users/rosemary/projects/gen-art/shadow-chain/contracts/ShadowChain.sol
**Date:** 2026-03-11
**Provider:** claude (claude-sonnet-4-20250514)

## Summary
| Severity | Count |
|----------|-------|
| HIGH | 1 |
| MEDIUM | 2 |
| LOW | 2 |
| INFO | 1 |

## Findings

### [HIGH] Unrestricted Minting
**Line:** 51
**Description:** The mint() function has no access control, rate limiting, or maximum supply cap, allowing anyone to mint unlimited tokens for free
**Impact:** Attackers can mint unlimited tokens, potentially causing inflation, gas exhaustion, or disrupting the intended tokenomics
**Fix:** Add access control (onlyOwner), implement a maximum supply cap, or add minting fees/conditions

### [MEDIUM] Integer Overflow in totalSupply
**Line:** 52
**Description:** The totalSupply increment is marked as unchecked, which could theoretically overflow if 2^256-1 tokens are minted
**Impact:** If totalSupply overflows, it would wrap to 0, potentially causing token ID collisions and breaking contract state
**Fix:** Remove the unchecked block or add a reasonable maximum supply check before incrementing

### [MEDIUM] Potential Token ID Collision
**Line:** 54
**Description:** If totalSupply overflows and wraps to a lower value, _mint could attempt to mint tokens with IDs that already exist
**Impact:** Could cause minting to fail or overwrite existing token ownership, leading to loss of tokens or unauthorized transfers
**Fix:** Add checks to ensure token IDs are unique and haven't been minted before, or implement proper overflow protection

### [LOW] Missing Input Validation in Admin Functions
**Line:** 38
**Description:** The setSVG and setScript functions don't validate that the input data is non-empty before storing via SSTORE2
**Impact:** Owner could accidentally set empty content, potentially breaking tokenHTML functionality or wasting gas
**Fix:** Add require statements to check that svgContent.length > 0 and scriptContent.length > 0

### [LOW] Unused Parameter in tokenHTML
**Line:** 59
**Description:** The tokenHTML function accepts a uint256 parameter that is not used in the function body
**Impact:** No direct security impact, but could indicate incomplete implementation or confusion for developers
**Fix:** Either use the token ID parameter to customize HTML per token, or remove it if not needed

### [INFO] No Transfer Restrictions
**Description:** The contract inherits standard ERC721 transfer functionality without any restrictions or hooks
**Impact:** No direct security impact, but may not align with intended use case if transfers should be restricted
**Fix:** Consider overriding transfer functions if transfer restrictions are needed for the shadow boxing concept
