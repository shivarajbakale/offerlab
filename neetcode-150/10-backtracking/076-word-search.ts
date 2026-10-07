/**
 * 79. Word Search
 * Difficulty: Medium
 * Category: Backtracking
 * LeetCode: https://leetcode.com/problems/word-search/
 *
 * Given an m x n grid of characters `board` and a string `word`, return true
 * if `word` exists in the grid. The word must be built from letters of
 * sequentially adjacent cells (horizontal or vertical neighbours), and the
 * same cell may not be used more than once.
 *
 * Example 1:
 *   Input: board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]],
 *          word = "ABCCED"
 *   Output: true
 *
 * Example 2:
 *   Input: same board, word = "SEE"
 *   Output: true
 *
 * Example 3:
 *   Input: same board, word = "ABCB"
 *   Output: false
 *
 * Constraints:
 *   1 <= m, n <= 6
 *   1 <= word.length <= 15
 *   board and word consist of upper- and lowercase English letters
 *
 * Approach: DFS backtracking from every cell
 *   From each cell, DFS matching word[i]. Temporarily mark the cell as
 *   visited (overwrite with "#") while exploring its 4 neighbours, then
 *   restore it on the way back.
 *
 * Time: O(m * n * 4^L) where L = word.length   Space: O(L) recursion
 *
 * Pattern: backtracking, grid-dfs
 * Key insight: Overwriting the current cell with "#" doubles as the visited set for this
 *   one path, and restoring it on the way back frees the cell for other paths. A mismatch
 *   on any letter prunes the whole branch at once, so most starting cells die after one
 *   comparison.
 * Real world: A word-game app (Boggle, word search puzzles) checking whether a player's
 *   traced word really exists on the letter grid without reusing a tile.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @rule cells marked '#' are exactly the current path; each is restored on the way back
// @why Returns true if `word` can be traced through neighboring cells of the grid.
// @goal can "{word}" be spelled by walking between neighbouring cells, using each cell at most once?
export function exist(board: string[][], word: string): boolean {
  // @why Number of rows in the grid.
  // @phase Setup
  // @say Listing every path through the grid and comparing it to the word is hopeless: paths multiply at every step. Instead grow a path one letter at a time and abandon it the moment a cell doesn't match the next letter, so most paths die after a step or two.
  const rows = board.length;
  // @why Number of columns in the grid.
  const cols = board[0].length;

  // @why Can the rest of the word (from letter `i`) be matched starting at cell (r, c)?
  // @goal can "{word.slice(i)}", the rest of the word, be spelled starting at cell ({r}, {c})?
  const dfs = (r: number, c: number, i: number): boolean => {
    // @why Every letter matched, so the word was found.
    // @phase Match one letter, then try the four neighbours
    // @yes All {word.length} letters are matched along the path.
    // @no Letter {i + 1} of {word.length}, "{word[i]}", still has to be matched.
    // @returns true: the whole word is spelled by the path so far.
    if (i === word.length) return true;
    // @why Fail if we are off the grid or the cell holds the wrong letter (a '#' also fails here).
    // @yes {r < 0 || c < 0 || r >= rows || c >= cols ? "(" + r + ", " + c + ") is off the grid" : board[r][c] === "#" ? "(" + r + ", " + c + ") is already on this path, and a cell can't be used twice" : "(" + r + ", " + c + ") holds \"" + board[r][c] + "\", not the \"" + word[i] + "\" needed next"}. No path through here can work, so stop now instead of exploring further.
    // @no ({r}, {c}) holds "{word[i]}", which is letter {i + 1} of "{word}". Keep going from here.
    if (r < 0 || c < 0 || r >= rows || c >= cols || board[r][c] !== word[i]) {
      // @why This path can't work.
      // @returns false: this step of the path is a dead end, so the caller tries its next direction.
      return false;
    }
    // @why Remember the letter so we can put it back later.
    // @say Remember "{board[r][c]}" so the cell can be restored when this path is abandoned.
    const ch = board[r][c];
    // @why Mark the cell used so the path can't reuse it.
    // @say Mark ({r}, {c}) with '#'. No letter equals '#', so the deeper search can't step back onto it, and no separate visited set is needed.
    board[r][c] = "#"; // mark visited // @moment {word[i]} at {r},{c}
    // @why Try going down, up, right, then left; any success is enough.
    // @say {i + 1 === word.length ? "That was the last letter; one more step confirms the match." : "Look for \"" + word[i + 1] + "\" in the four neighbours: down, up, right, left. `||` stops at the first that works."}
    // @then {found ? (i + 1 === word.length ? "\"" + word[i] + "\" was the last letter, so the whole word is found." : "A neighbour spelled the rest, \"" + word.slice(i + 1) + "\", so the whole word is found.") : "No neighbour of (" + r + ", " + c + ") could continue \"" + word.slice(0, i + 1) + "\"."}
    const found =
      dfs(r + 1, c, i + 1) ||
      dfs(r - 1, c, i + 1) ||
      dfs(r, c + 1, i + 1) ||
      dfs(r, c - 1, i + 1);
    // @why Backtrack: put the letter back so other paths can use this cell.
    // @say Put "{ch}" back at ({r}, {c}). {found ? "The word is found, but the caller's board must still come back unchanged." : "A different path might still need this cell."}
    board[r][c] = ch; // restore // @ask found
    // @why Pass the result up.
    // @returns {found}: {found ? "the word continues through (" + r + ", " + c + ") to the end" : "\"" + word.slice(i) + "\" can't be spelled from (" + r + ", " + c + ")"}.
    return found;
  };

  // @why The word can start at any cell, so try them all.
  // @phase Try every cell as the start
  // @yes Row {r}: try each of its cells as the first letter.
  // @no Every cell has been tried as a start and none spelled "{word}".
  for (let r = 0; r < rows; r++) {
    // @why Go through each column of this row.
    // @yes Next start cell: ({r}, {c}).
    // @no Row {r} is exhausted.
    for (let c = 0; c < cols; c++) {
      // @why As soon as one start cell works, we are done.
      // @say Try spelling "{word}" starting at ({r}, {c}), which holds "{board[r][c]}".
      // @yes A path from ({r}, {c}) spells the whole word.
      // @no No path from ({r}, {c}) works; try the next start.
      // @returns true: one path is enough, so skip the remaining start cells.
      if (dfs(r, c, 0)) return true;
    }
  }
  // @why No starting cell worked.
  // @phase Answer
  // @returns false: every start cell and every path from it failed.
  return false;
}

test("79. Word Search", () => {
  const board = () => [
    ["A", "B", "C", "E"],
    ["S", "F", "C", "S"],
    ["A", "D", "E", "E"],
  ];
  assert.equal(exist(board(), "ABCCED"), true);
  assert.equal(exist(board(), "SEE"), true);
  assert.equal(exist(board(), "ABCB"), false);
  assert.equal(exist([["a"]], "a"), true);
  assert.equal(exist([["a", "a"]], "aaa"), false);
});
