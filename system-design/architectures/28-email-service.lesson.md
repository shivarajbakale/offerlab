# Email service

## What it is

- **What it is:** The service other services call to send emails like password resets, receipts and sign-in codes. It queues each email and hands it to an outside email provider such as Amazon SES, SendGrid or Mailgun.
- **What makes it hard:** When the provider has a bad minute, every consumer waits on it and email stops while callers see no errors. Timeouts and retries keep a sick provider busy with work we abandoned and send the same email twice, because a timeout means "I don't know", not "no".
- **Building blocks it uses:** a queue of outgoing email with consumers, a [circuit breaker](#/sd-04-traffic/016-circuit-breaker) on each provider, a retry budget ([retry storms and retry budgets](#/sd-microservices/04-retry-storms-and-retry-budgets)), and [load balancing](#/sd-04-traffic/014-load-balancing) by least connections with health checks across two providers.
- **Where you'll meet it:** "Design an email service" or "Design a notification system" in interviews, which this app's [notification system](#/sd-architectures/07-notification-system) also covers. Amazon SES documents a per-account maximum send rate, and SPF and DKIM are the DNS records receivers check before trusting mail from a new provider.

## Words we'll use

- **Email provider** — a company that delivers email for us (Amazon SES, SendGrid, Mailgun). We call its API with the message, and it answers "accepted" once it has taken responsibility for delivering it. Here that takes about 200 ms.
- **Queue** — a list of jobs waiting to be done. Our API puts each email on the **outbox** queue and answers at once. A **consumer** is a worker that takes a job off the queue and does it: here, hands the email to the provider and waits for "accepted".
- **Backlog** — jobs waiting on the queue. The **oldest wait** is the age of the job that has waited longest: how late the latest-running email is.
- **Hang** — the provider still answers, but very slowly. Here every send takes 5 s instead of 200 ms for 5 seconds.
- **Timeout** — how long we wait for one attempt before giving up on it. Giving up does not stop the provider: it may still accept and deliver the message.
- **Retry** — trying the same send again after a failure or timeout. A **retry budget** caps retries at a share of first attempts (here 10% over the last 10 s).
- **Duplicate** — the same email arriving twice: we timed out, retried, and the first attempt had in fact gone through.
- **Circuit breaker** — a switch in the caller. After many failures in a short window it **opens**: calls fail at once without being sent. After a pause it lets a few trial calls through, and closes if they succeed (primitive 016).
- **Visibility timeout** — when a consumer takes a job, the queue hides it from other consumers; if the job is not acknowledged (deleted) in time, or the consumer hands it back, it becomes visible again. Here a failed job comes back after 1 second.
- **Health check** — a load balancer asking each server "are you up?" every second, and sending nothing to one that is not.
- **Least connections** — a load balancer rule: send each request to the server with the fewest requests in flight.

## The world we're in

- Other services send us 500 "send this email" requests a second: password resets, receipts, sign-in codes.
- Callers only need "accepted". The email itself should reach the provider within a second or two; a sign-in code that is a minute late is useless.
- The provider accepts a message in about 200 ms and lets us have 400 sends in flight. So on a normal day 500 × 0.2 s = about 100 sends are in flight.
- We run 400 consumers. A consumer costs almost nothing, because it spends its time waiting.
- Providers have bad minutes. In this lesson, the provider hangs from 5 s to 10 s: each send takes 5 s.
- Case study 07 already showed why sending inside the request is wrong. Here we start from a queue and ask what a consumer should do when the provider is sick.

## The goal

Keep email flowing through a provider's bad minutes, do not make the provider's trouble worse, and do not send the same email twice.

## The naive attempt

"Queue the email; a consumer calls the provider and waits for its answer."

On a normal day this is fine. The API answers callers in about 45 ms. About 100 of the 400 consumers are busy, and almost nothing waits on the queue. It costs about $1.78 an hour.
[▶ One provider on a normal day](play:one provider: 500@t=8)

Then the provider hangs. Each send now takes 5 s, so a consumer finishes one email per 5 s instead of five a second. Within a second all 400 consumers are waiting on it. They can move 400 / 5 s = 80 emails a second, and 500 arrive. Callers notice nothing: the API still answers "accepted". But the backlog reaches about 2,100 emails and the oldest has waited about 4.3 s. Every sign-in code sent in those seconds is late. After the provider recovers it takes about 5 more seconds to catch up.
[▶ Broken: one provider hangs, email stops](play:broken: one provider hangs@t=9)

This run is kind to the naive design in one way: the hang ends after 5 s and every send completes. A real hung connection with no timeout can wait for minutes, and every consumer waits with it.

## Building it up

**1. Add timeouts and retries, and watch them backfire.** The obvious fix: give up on a send after 1 s (five times its normal time) and try again, up to 3 times. Consumers are no longer stuck for 5 s. But look at what happens. A consumer that gives up at once starts its next send, so about 400 calls a second keep reaching a provider that can now finish only 80. The provider does not know we gave up. It keeps working on every abandoned send, and its own queue grows to about 1,300 sends. When it recovers it must first work through that pile. So recovery is *slower* than with no timeout: the backlog peaks near 3,800 emails, the oldest waits almost 10 s (an email queued early in the hang fails every try and keeps coming back, and a retry does not reset its age), and catching up takes until about 17 s.

Worse, the provider finished about 2,800 sends after we had stopped waiting for them. Each of those emails was delivered, and we did not know, so we sent it again. A timeout is not a "no". It is "I don't know".
[▶ Broken: timeouts and retries bury the provider](play:broken: timeouts and retries@t=9)

**2. A retry budget is not enough here.** A budget caps retries at 10% of first attempts. It works: retries fall from about 290 a second to about 100. But the calls do not fall, because each consumer that cannot retry simply takes the next job and calls anyway. Behind a queue, the load on the provider is set by how many consumers call it, not by how many retries each one makes. The provider's queue still passes 1,400, and over 2,800 sends still finish after we gave up.
[▶ Broken: a retry budget alone](play:broken: a retry budget alone@t=9)
Budgets matter most where every retry is extra traffic on top of new requests, such as a chain of services each retrying (primitive 015). Keep it, but it is not the fix for this problem.

**3. Stop calling: a circuit breaker.** Give each sender machine a breaker on the provider. Once half of its last 2 s of sends (at least 20) failed or timed out, it opens. For 2 s every send fails at once, without being sent, and the job goes back on the queue for 1 s (the visibility timeout). Then it lets 5 trial sends through: if all succeed it closes; if any fails it opens again.

Within about 2 s of the hang, the breakers are open more than 95% of the time and fewer than 20 calls a second reach the provider. The provider's own queue never passes 300, so it is not still working through our abandoned sends when it recovers. The jobs keep bouncing (over 1,000 quick failures a second), but each costs a consumer a few milliseconds; consumers are under 10% busy. Sends finished after we gave up fall to under 800, from about 2,800. The queue is empty by 16 s, a second sooner. But the oldest email still waits about 9.5 s: an email queued as the hang began bounces until the breaker closes, and every bounce keeps its age. The breaker protects the provider, not the email.
[▶ The breaker during the hang](play:breaker: within@t=9)
[▶ The breaker after the provider recovers](play:breaker: within@t=14)

A real queue lets the consumer choose how long a failed job hides (SQS calls this changing the message's visibility), so the wait can grow with each failure. This simulator uses a fixed 1 s.

**4. Send through a second provider.** The breaker stops us making things worse, but email still waits for the provider to recover. The real fix is a second provider. In a real sender this is a breaker per provider: when A's breaker is open, send through B. This simulator's breaker can skip a call but not redirect it, so here the switch is a load balancer over both providers that sends each email to the one with fewer sends in flight, and stops using one that fails its health check. The idea is the same: notice A is sick, and send through B.

When A hangs, sends to A pile up in flight, so new sends go to B. The oldest email waits under 0.4 s, nothing is left waiting after A recovers, under 350 sends finish after we gave up, and the breaker never needs to open. The switch adds about $0.03 an hour; the real price is the second provider's contract.
[▶ Two providers, A hangs](play:two providers: provider A hangs@t=9)

When A stops answering altogether (its machine is down), sends to it fail at once until the next health check, under a second later. Each failed send is retried once, and the retry lands on B. No email has to go back on the queue at all.
[▶ Two providers, A down](play:two providers: provider A goes down@t=6)

## Why it works now

The queue keeps callers safe from the provider. The question was what consumers should do when it is sick. Waiting stalls all email. Timing out and retrying keeps a sick provider busy with work we will never collect, and risks duplicates.
[▶ Broken: timeouts and retries](play:broken: timeouts and retries@t=12)
The breaker stops calling, so the provider has room to recover and the queue holds the mail. A second provider means the mail does not have to wait at all.
[▶ Two providers](play:two providers: provider A hangs@t=12)

## What it costs

- A second provider: a second contract, a second integration, and a second set of sending domains to set up (SPF and DKIM records, so receivers trust our mail from it). Mail that suddenly comes from a new sending IP can land in spam; senders keep both providers in use so both reputations stay warm.
- The breaker turns "slow" into "late": while it is open, email waits on the queue. You need an alert on the oldest wait, not just the error count.
- Duplicates are reduced, not removed. A send that times out may have gone through. Most email APIs take no idempotency key, so the provider cannot drop our retry for us. Record each message's id once the provider accepts it, so a redelivered job that finds the id skips the send; the remaining duplicates are the sends that timed out, and you choose a timeout long enough to keep them rare.
- The simulator's second provider is as fast as the first. In real life the backup is often slower or more expensive, which is fine for a few bad minutes.

## Staff notes

- Alert on the oldest email's age, per kind of email. "Sign-in codes are 30 s late" is an incident; "the newsletter is 30 min late" may not be.
- Keep urgent mail (sign-in codes, password resets) on its own queue and consumers, ahead of bulk mail. A 2-million-recipient newsletter must not sit in front of a password reset.
- Expire what is too late to matter: a sign-in code that is 10 minutes old should be dropped, not sent.
- Providers cap our sending rate (SES has a per-account maximum send rate). Size consumers to stay under it, or you turn their limit into errors.
- After all retries, park the job in a dead-letter queue, and look at it. Bounces and complaints come back later from the provider as events; feed them into a suppression list so you stop mailing addresses that bounce.

## Check yourself

- **Q:** The provider hangs and the API's callers see no errors at all. What is wrong?
  A: Every consumer is waiting on the provider, so email has stopped: 2,100 emails wait and the oldest is over 4 s old. Only the queue's oldest wait shows it. [▶ Show it](play:broken: one provider hangs@t=9)
- **Q:** Timeouts free the consumers. Why did recovery get slower, not faster?
  A: The provider kept working on every send we abandoned, and consumers kept sending new ones. Its own queue grew to about 1,300, and it had to finish those first. [▶ Show it](play:broken: timeouts and retries@t=10)
- **Q:** Why did a retry budget not reduce the load on the provider?
  A: Behind a queue, consumers that cannot retry take the next job and call anyway. The number of consumers sets the load, not the retries. [▶ Show it](play:broken: a retry budget alone@t=9)
- **Q:** What does the breaker buy, if the email still waits?
  A: It stops calls to the sick provider, so it is not buried when it recovers, and far fewer sends finish after we gave up (fewer duplicates). [▶ Show it](play:breaker: within@t=9)
- **Q:** What keeps email flowing during the hang?
  A: A second provider. New sends go to the one with fewer sends in flight, so the oldest email waits under 0.4 s. [▶ Show it](play:two providers: provider A hangs@t=9)
