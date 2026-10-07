# Bloom filter

## What it is

- **What it is:** A small block of bits in memory that answers "have I seen this item?" with "definitely not" or "maybe". Adding an item turns on a few bits picked by hashing it (turning it into random-looking numbers); a check looks at those same bits.
- **The problem it solves:** Many lookups go to a slow disk or another server only to find the item is not there, and keeping every item in memory to rule those out costs too much. A Bloom filter rules out most missing items with about 10 bits per item, with a small, chosen rate of wrong "maybe" answers and never a wrong "no".
- **Reach for it when:** Most lookups are for things that do not exist, a wasted slow lookup now and then is fine, and memory is tight: skipping on-disk files that cannot hold a key, skipping URLs a crawler has already seen, or shielding a database from lookups of missing keys.
- **Not the right tool when:** You need exact answers, deletes, or a list of the items; use a hash set if it fits in memory. To count distinct items use [HyperLogLog](#/sd-02-probabilistic/007-hyperloglog), and to estimate how often each item appears use a [count-min sketch](#/sd-02-probabilistic/006-count-min-sketch).
- **Where you'll meet it:** LevelDB, RocksDB and Cassandra keep one per on-disk table so reads skip files that cannot hold the key; Burton Bloom's 1970 paper; and interview questions such as "Design a web crawler" or "Check whether a username is taken".

## In plain words

Imagine a sign-up page. Every time someone types a username, the app must check whether it is taken, and the full list of usernames lives in a database that is slow to ask. Most names people try are free, so most of those slow lookups find nothing. A Bloom filter is a small note kept in memory that can say "definitely not taken" for most of them, so the database is asked only when there is a real chance.

Think of a coat check that, instead of keeping a list of names, punches three holes in a card for each guest, at spots picked from the guest's name. To ask about someone, look at their three spots: if any spot has no hole, they never came. If all three have holes, they probably came, but other guests may have punched those exact spots. That "probably" is the price of keeping only a card instead of a list.

In the picture on the right, the row of numbered cells is the filter's bits: 1 is a hole punched, 0 is untouched. Above it are the question being asked and the item, with the bits that item hashes to. Those bits are outlined: solid for a bit this item just set, dashed for a bit some other item had already set, dotted for a bit that is still 0. Below the bits are the filter's answer, the reason, and what it costs if that answer is wrong. The box at the top says what just happened.

## Words we'll use

- **Item** (or key) — one piece of data we store and later ask about, such as a username or the key of a database row.
- **Bit** — a single 0 or 1. Eight bits make a byte.
- **Hash function** — a function that turns an item into a large number. The same item always gives the same number, and different items give numbers that look unrelated. Taking that number modulo m (the remainder after dividing by m) picks one of m positions.
- **m** — how many bits the filter has.
- **n** — how many items have been added.
- **k** — how many positions (bits) each item maps to, one per hash.
- **Set a bit** — make it 1. All bits start at 0.
- **False positive** — the filter says "maybe present" about an item that was never added.
- **False negative** — the filter says "absent" about an item that was added. A Bloom filter must never do this.
- **False positive rate** — the share of never-added items that get a "maybe present".
- **e** — a constant from mathematics, about 2.718. e^x means e raised to the power x. It shows up wherever a small chance is repeated many times: if each of x tries misses a given bit with chance 1 − 1/m, the bit is still 0 afterwards with chance about e^(−x/m).
- **ln** (natural logarithm) — the reverse of e^x: ln y is the power e must be raised to to give y. ln 2 ≈ 0.69 and ln 100 ≈ 4.6. A **logarithm** grows very slowly: multiplying y by 10 adds only about 2.3 to ln y.

## The world we're in

- Memory is fast and small. A disk, or another server, is big and slow: one lookup there costs hundreds to many thousands of times more than checking memory.
- Most lookups are for items that are not there. Think of a database checking each file on disk for a key that is in only one of them, or a sign-up form checking whether a username is taken.
- A wasted slow lookup now and then is fine. Saying "not there" about an item that is there is not: that is lost data.

## The goal

Answer "is this item definitely not stored?" from memory, using a few bits per item, and never answer "no" for an item that was stored.

## The naive attempt

Keeping every item in memory answers exactly, but costs as much memory as the items themselves: a million 30-byte keys is 30 MB before any overhead. So shrink it. Keep m bits. To add an item, hash it to one position and set that bit. To check an item, look at its one bit: 0 means "never added", 1 means "maybe".

"No" is always right, because nothing clears a bit. "Yes" is the trouble. Every item lands on one bit, and with 10 bits per item about one bit in ten is set, so a never-added item lands on a set bit about one time in ten. Here 20 users went into 200 bits, and a guest who was never added lands on a bit a user set.
[▶ Broken: one hash — a never-added guest gets "maybe present"](play:broken: one hash@at=maybe)
Measured over 20,000 guests on a 10,000-bit filter holding 1,000 users, about 10% get a wrong "maybe".

## Building it up

**1. Set k bits per item, not one.** Each item is hashed to k positions, and all k bits are set. The positions come from two hashes, h1 and h2: position i is (h1 + i·h2) mod m. This is called double hashing, and it works about as well as k separate hash functions. One catch: the positions repeat every m / gcd(h2, m) steps, where gcd is the greatest common divisor, the largest number that divides both. With m = 32 and h2 = 16 that is every 2 steps, so the positions alternate between just two bits; with h2 = 8, every 4 steps, which is harmless for k = 3. A repeat only matters when the cycle is shorter than k. The code keeps h2 coprime with m (no number above 1 divides both; for m = 32, that means h2 is odd), so the cycle is m long and it never happens. Here m = 32 and k = 3. apple maps to bits 13, 8 and 3.
[▶ apple's third position, 3, is computed](play:add and check@at=hash#3)
All three bits were 0, so apple sets 3 new bits.
[▶ apple has set bits 13, 8 and 3](play:add and check@at=added)
banana maps to 22, 31 and 8. Bit 8 is already set by apple, so banana sets only 2 new bits. Sharing bits is normal; it is what makes the filter small.
[▶ banana finds bit 8 already set](play:add and check@at=added#2)

**2. Check all k bits: any 0 means "no".** If the item had been added, every one of its bits would be 1, and bits are never cleared. So a single 0 is proof. grape maps to bit 19, which is 0.
[▶ grape hits a 0 and is reported absent](play:absent@at=absent)
If all k bits are 1, the answer is "maybe present". For an added item it is always this.
[▶ banana's three bits are all set](play:add and check@at=maybe)

**3. Accept false positives, and know how often.** After six fruits, 14 of the 32 bits are set. quail was never added, but its bits are 6 (set by date), 31 (set by banana and cherry) and 24 (set by elderberry). The filter cannot tell, and says "maybe".
[▶ quail: every bit was already set by other items](play:false positive@at=maybe)
Requiring k bits instead of one makes this much rarer: a never-added item now needs k set bits at once. With n items in m bits, the chance of a false positive is about (1 − e^(−kn/m))^k. More bits (m) lower it, more items (n) raise it, and k has a best value of about (m/n) × 0.69. At that k, about half of the bits end up set.

**4. Size it.** With 10 bits per item and k = 7 the formula gives about 0.8%. Here 20 users went into 200 bits: 101 bits are set, about half.
[▶ The last of 20 users is added to the 200-bit filter](play:sizing@at=added)
A never-added guest still finds a 0 quickly.
[▶ guest-1 hits a 0](play:sizing@at=absent)
Measured over 20,000 guests on a 10,000-bit filter holding 1,000 users, about 0.8% get a wrong "maybe", against about 10% with one hash and the same memory.

**5. Do not delete.** "Removing" an item by clearing its bits also clears bits other items need. Here apple and banana share bit 8. Removing banana clears bits 22, 31 and 8.
[▶ Broken: removing banana has cleared bits 22, 31 and 8](play:broken: delete@at=removed)
Now apple, which was added and never removed, finds bit 8 at 0 and is reported absent. That is a false negative, the one mistake a Bloom filter must never make.
[▶ Broken: apple is reported absent after banana's removal](play:broken: delete@at=absent)

## Why it works now

- **No false negatives.** Adding an item sets all k of its bits, and nothing sets a bit back to 0. So when an added item is checked, it finds the same k bits still set. The first scenario checks this for every item it added. [▶ banana is found](play:add and check@at=maybe)
- **"No" needs only one 0.** A check stops at the first 0 bit, so most never-added items cost one or two bit reads.
- **False positives are bounded.** They happen only when all k bits were set by other items. The sizing scenario measures the rate and asserts it is between 0.3% and 3%.

## What it costs

- **Memory:** m bits, whatever the items are. About 9.6 bits per item gives 1%, and each extra 4.8 bits per item divides the rate by about 10. A billion items at 1% is about 1.2 GB.
- **Time:** k hash positions per add or check (two real hashes with double hashing), and the bit reads land at scattered places in memory.
- **It cannot list, count or remove items.** It only answers "definitely not" or "maybe".
- **It must be sized up front.** Add more than the n it was sized for and the bits fill up: the false positive rate climbs toward 100%.

## Staff notes

- **Deletes:** a counting Bloom filter keeps a small counter at each position instead of a bit. Adding increments the k counters and removing decrements them. It costs several times the memory, and a counter that overflows breaks it. Cuckoo filters are another option that supports deletes at a similar size.
- **Growth:** a filter cannot be resized, because it no longer knows its items. Rebuild a bigger one from the source data, or add a new, larger filter beside the full one and check both.
- **Where it pays off:** an LSM-tree store (see 009) keeps its data in many sorted files on disk. A read would check each file, so each file gets a Bloom filter in memory, and the read skips every file whose filter says "no". The filter also protects a database from floods of lookups for keys that do not exist.
- **Tuning:** pick the false positive rate from the cost of a wasted lookup, then size m from n. Memory grows only with the logarithm of 1 / rate, so 0.1% costs about 1.5 times the memory of 1%.

## Check yourself

- **Q:** banana was added. Can the filter ever say it is absent, if nothing is removed?
  A: No. Its three bits were set when it was added, and bits are only ever set, never cleared. A check finds all three still 1. [▶ See it](play:add and check@at=maybe)
- **Q:** quail was never added, but all three of its bits are 1. What does the filter answer?
  A: "Maybe present". The bits do not record who set them, so the filter cannot tell that date, banana, cherry and elderberry set them, not quail. That is a false positive. [▶ See it](play:false positive@at=maybe)
- **Q:** You "remove" banana by clearing its three bits. What happens when you check apple?
  A: apple is reported absent. It shares bit 8 with banana, so clearing banana's bits cleared one of apple's. [▶ See it](play:broken: delete@at=absent)
- **Q:** Same 10 bits per item, but one hash instead of seven. More false positives, or fewer?
  A: Many more: about 10% instead of under 1%. A never-added item needs only one set bit to fool a one-hash filter. [▶ See it](play:broken: one hash@at=maybe)
- **Q:** In a filter with the best k, about what share of the bits are 1?
  A: About half. Here 101 of 200 bits are set after 20 items with k = 7. [▶ See it](play:sizing@at=added)

## When to use which

- **Bloom filter** — when most lookups are for things that are not there and a wasted slow lookup now and then is fine. Example: a database checks the filter of each file on disk and skips every file that cannot hold the key, as in an [LSM tree](#/sd-03-storage/009-lsm-tree).
- **A plain set or hash map in memory** — when the items fit in memory, or you need exact answers, deletes, or the list of items back. A few million short usernames fit easily: just keep them in a set.
- **Ask the database every time** — when lookups are rare, or most of them find something anyway. A filter only saves work on the misses.
- **Counting Bloom filter or cuckoo filter** — when items must also be removed, such as a cache that evicts keys. They cost a few times the memory.
- **[Count-min sketch](#/sd-02-probabilistic/006-count-min-sketch)** — when the question is "how often?", not "ever?".
- **[HyperLogLog](#/sd-02-probabilistic/007-hyperloglog)** — when the question is "how many different items?", not "is this one in?".
- **In an interview:** say "a Bloom filter in front of the store to skip lookups for missing keys, sized at about 10 bits per key for 1% false positives", and say that a "no" is always right while a "maybe" still goes to the store.

## Deep dive

- Burton Bloom described the structure in "Space/Time Trade-offs in Hash Coding with Allowable Errors" (1970).
- Kirsch and Mitzenmacher, "Less Hashing, Same Performance: Building a Better Bloom Filter" (2006), shows that positions h1 + i·h2 work about as well as k independent hashes.
- The formulas: with the best k = (m/n)·ln 2, the false positive rate is about 0.6185^(m/n), so m/n = 9.6 gives about 1%.
- LevelDB, RocksDB and Cassandra keep a Bloom filter per on-disk table. RocksDB lets you choose the bits per key.
