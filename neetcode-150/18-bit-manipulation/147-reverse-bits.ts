/**
 * 190. Reverse Bits
 * Difficulty: Easy
 * Category: Bit Manipulation
 * LeetCode: https://leetcode.com/problems/reverse-bits/
 *
 * Reverse the bits of a given 32-bit unsigned integer and return the result
 * as an unsigned integer.
 *
 * Example 1:
 *   Input:  n = 43261596    (00000010100101000001111010011100)
 *   Output: 964176192       (00111001011110000010100101000000)
 *
 * Example 2:
 *   Input:  n = 4294967293  (11111111111111111111111111111101)
 *   Output: 3221225471      (10111111111111111111111111111111)
 *
 * Constraints:
 *   The input is a 32-bit unsigned integer.
 *
 * Approach: Bit-by-bit shift
 *   For each of the 32 positions i, read bit i of n ((n >>> i) & 1) and place
 *   it at position 31 - i of the result.
 *   JS note: bitwise ops produce 32-bit SIGNED ints, so setting bit 31 makes
 *   the result negative. `>>> 0` reinterprets it as unsigned; we also use
 *   `>>>` (logical shift) when reading bits so the sign bit is not smeared.
 *
 * Time: O(1) (32 iterations)   Space: O(1)
 *
 * Pattern: bit-manipulation
 * Key insight: Read bit i with an unsigned shift and place it at bit 31 - i. In JS, >>> 0
 *   at the end reinterprets the signed 32-bit result as unsigned.
 * Real world: FFT implementations reorder samples by bit-reversed index, and network code
 *   reverses bit order when converting between LSB-first and MSB-first wire formats.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule after step i, result's bits 31 down to 31-i are n's bits 0 up to i, mirrored
// @why Returns the number you get by reading the 32 bits of `n` backwards.
// @goal what number do you get by reading the 32 bits of {n} backwards?
export function reverseBits(n: number): number {
  // @why The reversed value is built up here, starting with all zeros.
  // @phase Setup
  // @say Converting to a binary string, reversing it and parsing it back works but builds strings. Instead, copy each bit straight to its mirror slot: bit i goes to bit 31 − i, so 32 reads and 32 writes, with no extra memory.
  let result = 0;
  // @why Go through all 32 bit positions.
  // @phase Copy each bit to its mirror position
  // @yes Bit {i} is next. {i === 0 ? "Nothing is placed yet." : i === 1 ? "Bit 0 is already mirrored into the top slot." : "Bits 0.." + (i - 1) + " are already mirrored into the top " + i + " slots."}
  // @no All 32 bits have been copied to their mirror positions.
  for (let i = 0; i < 32; i++) {
    // @why Shift bit `i` down to the end and mask with 1 to read just that bit.
    // @say Shift {n} right by {i} so bit {i} lands in the lowest slot, then AND with 1 to drop everything else: bit {i} is {(n >>> i) & 1}.
    const bit = (n >>> i) & 1; // @ask bit
    // @why Put that bit at the mirror position (31 - i) and merge it in with OR.
    // @say {bit ? "Set bit " + (31 - i) + " of the result: bit " + i + " is the " + (i + 1) + (i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th") + " from the right, so it becomes the " + (i + 1) + (i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th") + " from the left." : "Bit " + i + " is 0, so bit " + (31 - i) + " of the result stays 0. ORing in a 0 changes nothing."}
    result |= bit << (31 - i); // @ask result>>>0
  }
  // @why JS bit operations give a signed number; `>>> 0` turns it back into an unsigned one.
  // @phase Answer
  // @returns {result >>> 0}: JavaScript's bit operators read bit 31 as a sign{result < 0 ? ", so the raw value " + result + " looks negative" : ""}. `>>> 0` reads the same 32 bits as an unsigned number.
  return result >>> 0; // convert signed 32-bit to unsigned
}

test("190. Reverse Bits", () => {
  assert.equal(reverseBits(43261596), 964176192);
  assert.equal(reverseBits(4294967293), 3221225471);
  assert.equal(reverseBits(0), 0);
  assert.equal(reverseBits(1), 2147483648); // low bit moves to bit 31
});
