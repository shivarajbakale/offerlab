# API gateway and BFF

## What it is

- **What it is:** An API gateway is a server in the data center that every client request passes through first. It routes requests, checks who the user is, applies rate limits, and can combine several services' answers into one. A BFF (backend for frontend) is a gateway built for one kind of client.
- **The problem it solves:** A phone app that calls five services to build one screen pays the slow mobile network five times, and every service is exposed to the internet. A gateway makes those calls next to the services, so the app pays the distance once, and gives one place to stop abuse.
- **Reach for it when:** Clients are on slow or distant networks, one screen needs data from several services, you want sign-in checks and per-user rate limits in one place, or web and mobile clients need differently shaped answers.
- **Not the right tool when:** One client talks to one service: a load balancer is enough. Business rules belong in the services, not the gateway. If many clients need flexible shapes, a GraphQL server can take the aggregation job. The rate limiting itself is in [token and leaky bucket](#/sd-04-traffic/012-token-and-leaky-bucket).
- **Where you'll meet it:** Sam Newman's article "Backends For Frontends"; Netflix's Zuul gateway; Amazon API Gateway, Kong and Envoy-based gateways; "Design the backend for a mobile app" interviews.

## Words we'll use

- **Client** — the program the user runs: here a phone app. It talks to our services over the internet.
- **Round trip** — the time for a request to reach a machine and its answer to come back, not counting the work done there. From a phone on a mobile network to our data center here: 50 ms each way, so 100 ms. From another continent: 150 ms each way, 300 ms.
- **Chatty client** — a client that makes many small requests to build one screen.
- **API gateway** — one server (in practice, several copies) that every client request goes through first. It sits in the data center next to the services, and does the jobs every request needs: routing to the right service, checking who the user is, rate limits.
- **Aggregation** — the gateway making several calls to services and combining the answers into one response.
- **BFF (backend for frontend)** — a gateway built for one kind of client (the iOS app, the web site), returning exactly what that client's screens need, in the shape they need.
- **Rate limit** — a cap on how many requests one user may send in a time. Here a **token bucket** per user: 5 requests a second on average, bursts of up to 10. Over it, the gateway answers **429** (too many requests) at once.
- **Fallback** — what a caller does when a call fails or is too slow: here, carry on without that part and return a **degraded** answer.
- **Health check** — the load balancer asking each server "are you alive?" on a timer (here every second) and sending traffic only to those that answered.
- **Single point of failure** — one component whose failure takes the whole system down.

## The world we're in

- The app's home screen shows five things, each from its own service: the user's **profile**, products from the **catalog**, the **cart**, **recommendations** and **reviews**.
- 300 home screens a second, from 5,000 users. Each service answers in 1-2 ms of work, except Catalog, which takes 10 ms; Catalog's two machines can do about 800 a second.
- Users are on mobile networks: 50 ms each way from the data center. One in five is on another continent, 150 ms each way.
- The app gives up on a screen after 3 s.

## The goal

Load a screen in about one round trip for every user, near or far, and keep one misbehaving user or one optional service from breaking everyone's screens.

## The naive attempt

"Each service has a public API. The app calls them one after another and builds the screen."

Each call crosses the mobile network: a 100 ms round trip, five times. A screen takes about 515 ms, and almost none of that is work: Catalog, the busiest service, is about 37% busy.
[▶ Five round trips: about half a second per screen](play:direct: about@t=3)

For a user on another continent each round trip is 300 ms, so a screen takes about 1.5 seconds. Nothing is overloaded. The distance is paid five times.
[▶ Broken: 1.5 s per screen from far away](play:broken: direct calls@t=3)

There are other costs: five services exposed to the internet, each doing its own sign-in checks; five requests' worth of battery and radio time per screen; and the app's code tied to how the backend happens to be split.

## Building it up

**1. Cross the far network once.** Put a gateway in the data center. The app sends one request, "home screen for user 42". The gateway makes the five calls, each 0.5 ms away, and returns one answer. A nearby user's screen takes about 122 ms, one round trip plus the work. A far user's takes about 322 ms: they still pay the distance, but once. The cost is two small gateway machines and a load balancer, about $0.37 an hour.
[▶ One round trip per screen: ~122 ms near, ~322 ms far](play:gateway: one round@t=3)

**2. Shape the answer for the client.** Because the gateway knows the home screen, it can return just the fields that screen shows, in one response. A gateway built for one client type is a BFF. A web page and a phone app usually want different things, so each gets its own BFF, owned by the team that builds that client.

**3. A front door is a place to stop abuse.** Ten users start scraping the catalog: 1,200 screens a second on top of the normal 300. The gateway passes all of it on. Catalog fills to 100%, requests queue, and about 45% of normal users' screens fail; the rest wait about half a second.
[▶ Broken: a scraper fills Catalog; normal users fail](play:broken: gateway with@t=5)

Every request passes through the gateway, so that is the place to limit it. (Here the limit sits on the gateway tier's load balancer, the front door; many gateways enforce it themselves.) With a per-user limit of 5 screens a second (bursts of 10), each scraper gets 5 a second through and the rest are answered 429 at once, before they cost a service anything. About 96% of the scraper's requests are turned away, Catalog drops to about 43% busy, and normal users see no errors and ~122 ms screens.
[▶ The rate limit turns the scraper away](play:guarded: the rate@t=5)

**4. Decide which parts the screen can live without.** The gateway calls five services, and so far every one of them must answer. At 3 s Recommendations goes down, and every home screen fails, though the profile, products and cart are all fine.
[▶ Broken: Recommendations down, every screen fails](play:broken: gateway — Rec@t=5)

Recommendations and reviews are nice to have. The gateway gives those two calls a 100 ms timeout and a fallback: on failure, leave that section out. The same outage now degrades every screen (no recommendations section) and fails none.
[▶ Recommendations down, screens still load](play:guarded: Recommendations@t=5)

**5. Do not let the front door become the single point of failure.** Every request now goes through the gateway, so it must never be down as a whole. Run several copies across failure zones, keep them stateless, and keep enough spare. Here there are three. At 3.4 s one dies. The load balancer only checks every second, so until 4 s it keeps sending a third of the screens to the dead machine, and about a third fail. After that, two machines carry everything with room to spare, and errors stop by 4.4 s, once the far users' error replies (150 ms each way) still travelling back have arrived.
[▶ One of three gateway machines dies](play:guarded: one gateway@t=4)

## Why it works now

Over a far network, latency is paid per round trip, not per byte of work. Five calls from the phone pay the distance five times.
[▶ Broken: five far round trips, 1.5 s](play:broken: direct calls@t=5)
The gateway moves the fan-out to where a call costs half a millisecond, so every user pays the far network once. And because every request passes through it, it is the natural place to stop abuse and to decide which parts of a screen are optional.
[▶ One round trip, near and far](play:gateway: one round@t=5)

## What it costs

- **One more hop and more machines.** The gateway adds a little latency and about $0.37 an hour here; it is worth it when it saves round trips over a slow network.
- **A component on every request's path.** If the gateway tier is down, everything is. It must be replicated, deployed carefully (one region or a small share of traffic first) and kept simple.
- **A place logic piles up.** Teams are tempted to put business rules in the gateway because it is easy to change. Then it becomes a monolith that every team must deploy. Keep business rules in the services.
- **Duplicated code across BFFs.** Each client's BFF repeats some aggregation. That is the price of letting each client team move on its own.
- **Simplifications here.** Many real proxies retry a refused connection on another machine, so a stopped (not hung) gateway machine costs fewer errors than shown here; requests already in flight on it still fail. The app's calls run one after another. An app could send independent calls in parallel, which helps, but steps that need an earlier answer still pay one round trip each. The simulator does not model connection setup (a TLS handshake adds round trips on a new connection), which makes direct calls look better than they are.

## Staff notes

- Count round trips over the slowest network, not services. One screen, one request is a good target for mobile.
- The gateway's jobs: routing, authentication, rate limits, aggregation and response shaping, request ids for tracing. Not its jobs: business rules, data ownership.
- For every call the gateway makes, decide: is the screen useless without it (fail), or worse without it (timeout and fallback)? Set the timeout from the screen's latency budget.
- Rate limit per user or per API key at the edge, before the request reaches anything expensive. A limit per gateway machine alone lets a scraper spread across machines. Per-user limits do not stop scrapers that rotate accounts or IP addresses; that needs bot detection on top.
- One shared gateway for all clients means one bad deploy breaks every client. A BFF per client type limits the blast radius, at the cost of more to run.
- GraphQL is one way to let clients ask for exactly the fields a screen needs from one endpoint; it does the aggregation job, and needs the same limits on how much one query may cost.

## Check yourself

- **Q:** Nothing is overloaded, yet a far user's screen takes 1.5 s. Why?
  A: The app makes five calls in a row, and each pays a 300 ms round trip over the far network. [▶ Show it](play:broken: direct calls@t=3)
- **Q:** What does the gateway change for that far user?
  A: The app makes one call; the five calls happen 0.5 ms away in the data center, so the user pays the distance once: about 322 ms. [▶ Show it](play:gateway: one round@t=3)
- **Q:** A scraper sends 1,200 screens a second. Why do normal users' screens fail, and what stops it?
  A: The gateway passes everything on, so Catalog fills up. A per-user rate limit at the gateway turns the scraper away with 429s before it reaches Catalog. [▶ Show it](play:guarded: the rate@t=5)
- **Q:** Recommendations is down. How does one design fail every screen and the other fail none?
  A: The second gives that call a timeout and a fallback, so the gateway leaves the section out instead of failing the screen. [▶ Show it](play:guarded: Recommendations@t=5)
- **Q:** One of three gateway machines dies. Why do about a third of screens fail for a while, and why does it stop?
  A: The load balancer keeps sending it traffic until its next health check; after that the two healthy machines carry everything. [▶ Show it](play:guarded: one gateway@t=4)
