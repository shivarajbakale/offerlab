/**
 * 02. Replication and Consensus
 * Level: Staff
 * Group: Flashcards
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { flashcards } from "../index.ts";
import { unknownLinks } from "../links.ts";

const P = "sd-05-replication";
const LEADER = `${P}/017-leader-follower-replication`;
const QUORUM = `${P}/018-quorum-read-write`;
const CLOCKS = `${P}/019-vector-clocks`;
const ELECTION = `${P}/020-raft-leader-election`;
const LOG = `${P}/021-raft-log-replication`;
const GOSSIP = `${P}/022-gossip-failure-detection`;
const LEASES = `${P}/023-leases-and-fencing-tokens`;

export const deck = flashcards("Replication and consensus", [
  {
    front: "With asynchronous leader-follower replication, what can a failover lose?",
    back: "Every write the leader acknowledged but had not yet sent to the follower that is promoted. The client was told \"saved\", and the write is gone.",
    link: LEADER,
  },
  {
    front: "A user saves a profile, reloads, and sees the old one. Why, and what is the usual fix?",
    back: "The reload read from a replica that had not caught up (replication lag). Fix with **read-your-writes**: send a user's reads to the leader for a short time after their own write, or to a replica known to have reached that write's position.",
    link: LEADER,
  },
  {
    front: "What does semi-synchronous replication promise?",
    back: "A write is acknowledged only after at least one follower has received it, so a failover to that follower loses nothing acknowledged. The price is a round trip to a follower on every write. If no follower answers, MySQL waits up to a timeout (10 s by default) and then quietly falls back to asynchronous replication, so the guarantee can lapse exactly when things go wrong. Alert on that fallback.",
    link: LEADER,
  },
  {
    front: "N replicas, writes wait for W acks, reads for R replies. What condition makes every read see the latest acknowledged write?",
    back: "**R + W > N**: any R replicas and any W replicas share at least one, so a read always hears from someone holding the latest acknowledged write, and the version number tells which reply that is. This holds for strict quorums; a sloppy quorum that writes to stand-in nodes breaks the guarantee.",
    link: QUORUM,
  },
  {
    front: "N = 3, W = 2, R = 2. How many replicas can be down while reads and writes both work?",
    back: "**One.** Two remain, enough for W = 2 and R = 2, and 2 + 2 > 3 still guarantees overlap.",
    link: QUORUM,
  },
  {
    front: "What is read repair?",
    back: "When a quorum read sees some replicas answer with an older version, it sends them the newest value, so copies converge without a separate background process.",
    link: QUORUM,
  },
  {
    front: "Why is \"last write wins\" by timestamp dangerous?",
    back: "It trusts clocks. A node whose clock runs a few hundred ms ahead makes its writes win over later ones, and the losing writes vanish silently.",
    link: CLOCKS,
  },
  {
    front: "What can a vector clock tell you that a single counter or timestamp cannot?",
    back: "Whether two versions are **concurrent**: neither saw the other. Then neither may overwrite the other; the store keeps both (siblings) and the application merges them.",
    link: CLOCKS,
  },
  {
    front: "How do you compare two vector clocks A and B?",
    back: "A happened before B if every entry of A is ≤ the same entry of B and at least one is smaller. If each has an entry larger than the other's, they are concurrent.",
    link: CLOCKS,
  },
  {
    front: "A cluster of 2f + 1 nodes running Raft tolerates how many failures?",
    back: "**f.** A majority (f + 1) must remain to elect a leader and commit entries. 3 nodes tolerate 1 failure, 5 tolerate 2.",
    link: ELECTION,
  },
  {
    front: "Why run 3 or 5 consensus nodes, never 4?",
    back: "4 nodes need a majority of 3, so they tolerate only 1 failure, the same as 3 nodes, with one more machine to pay for and one more vote to wait on.",
    link: ELECTION,
  },
  {
    front: "What is a term in Raft, and why does every message carry it?",
    back: "A numbered period with at most one leader. A node that sees a higher term steps down and adopts it, so a deposed leader that comes back is recognised as stale at once.",
    link: ELECTION,
  },
  {
    front: "Why are Raft election timeouts randomized?",
    back: "If every follower timed out together, they would all stand as candidates, split the vote, and repeat forever. Random timeouts (say 150-300 ms) let one node start first and usually win.",
    link: ELECTION,
  },
  {
    front: "Why must a Raft node save its vote to disk before answering?",
    back: "A node that crashes and restarts must not vote twice in the same term; with two votes, two candidates could each reach a majority and two leaders could win one term.",
    link: ELECTION,
  },
  {
    front: "When is a Raft log entry committed?",
    back: "When the leader of its term has stored it on a **majority** of nodes. From then on it survives any failure the cluster can tolerate, because every future leader must hold it.",
    link: LOG,
  },
  {
    front: "What stops a node with a stale log from becoming leader and erasing committed entries?",
    back: "The election restriction: a node votes only for a candidate whose log is at least as up to date as its own (higher last term, or the same term and at least as long). A majority holds every committed entry, so a stale node cannot gather a majority.",
    link: LOG,
  },
  {
    front: "A leader is cut off from the majority by a partition and keeps accepting writes. What happens to them?",
    back: "They never commit, because no majority stores them. The majority elects a new leader in a higher term; when the network heals, the old leader steps down and its uncommitted entries are overwritten.",
    link: LOG,
  },
  {
    front: "In SWIM-style failure detection, why probe a node indirectly through others before declaring it dead?",
    back: "A failed direct ping may be one bad link, not a dead node. Asking k other members to ping it separates \"the node is down\" from \"my path to it is broken\" and avoids false alarms.",
    link: GOSSIP,
  },
  {
    front: "Why does gossip spread membership news to n nodes in O(log n) rounds?",
    back: "Each round, every node that knows tells a few random others, so the number who know roughly doubles each round, like an epidemic. No node talks to everyone.",
    link: GOSSIP,
  },
  {
    front: "A worker holds a lease, pauses for 30 s in garbage collection, wakes and writes. Its lease expired and another worker took over. What prevents corruption?",
    back: "A **fencing token**: each new lease comes with a larger number, every write carries it, and the storage rejects any write whose token is lower than one it has already seen.",
    link: LEASES,
  },
  {
    front: "Why use a lease (a lock with an expiry) rather than a plain lock?",
    back: "A holder that crashes never releases a plain lock, so everyone waits forever. A lease expires on its own, so the system recovers; fencing tokens handle a holder that is merely slow.",
    link: LEASES,
  },
  {
    front: "CAP in one sentence, and what PACELC adds",
    back: "During a network **P**artition a replicated system must give up either **C**onsistency (linearizability) or **A**vailability. PACELC adds: **E**lse, in normal running, it trades **L**atency against **C**onsistency, which is the choice you make every day.",
    link: QUORUM,
  },
]);

test("every card has both sides and links to a real problem", () => {
  assert.ok(deck.cards.length >= 20);
  assert.deepEqual(unknownLinks(deck), []);
  // The deck covers every replication primitive, 017 to 023.
  assert.deepEqual([...new Set(deck.cards.map((c) => c.link))].sort(), [LEADER, QUORUM, CLOCKS, ELECTION, LOG, GOSSIP, LEASES]);
});

test("the arithmetic on the cards", () => {
  const tolerated = (n: number) => n - (Math.floor(n / 2) + 1);
  assert.deepEqual([3, 4, 5].map(tolerated), [1, 1, 2], "4 nodes tolerate no more failures than 3");
  // N = 3, W = 2, R = 2 overlaps, and survives one replica down.
  const [n, w, r] = [3, 2, 2];
  assert.ok(r + w > n && n - 1 >= Math.max(w, r));
});
