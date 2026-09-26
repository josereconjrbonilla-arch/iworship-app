---
STATUS: DRAFT — NOT SHIPPED. Nothing in this document is in the app yet.
PURPOSE: Copy for the Spiritual Growth feature (salvation tract → confirmation →
discipleship path → personal journal), for Jared's review before task #154
(building the feature) starts.
VOICE: General Baptist / evangelical. Written so a complete newcomer — including
someone who isn't a Christian yet — can follow it without prior church background.
HOW TO READ THIS: Wherever you see a 🔶 DECISION NEEDED callout, that's a point
where more than one faithful, common answer exists and I picked one to keep moving —
say the word if you want it changed, cut, or rewritten in a different voice. Anything
without a callout I judged as an easy/uncontroversial call per your standing
instruction.
---

# iWorship — Spiritual Growth: Draft Copy

## 0. The shape of the path

Four stages, in order:

1. **The Gospel Invitation** — a stand-alone "tract" screen. Reachable any time,
   by anyone, signed in or not (same as the Bible and About screens today).
2. **Confirmation** — a short assurance screen that appears right after someone
   responds to the invitation. Not a gate, not a quiz — just "here's what just
   happened and why you can be sure of it."
3. **Discipleship Path** — a series of short milestone lessons a new believer
   works through at their own pace, most-foundational first.
4. **Personal Journal** — a private, ongoing space tied to the path, not a fifth
   doctrine topic. See section 4.

🔶 **DECISION NEEDED — logging a decision.** Should tapping "I just prayed this"
on the invitation screen (section 1) actually write anything to the user's
account (a timestamp, a milestone-progress flag), or should it just move them to
the Confirmation screen with nothing recorded? A profession of faith is about as
sensitive/personal as app data gets — I'd default to: record it, but keep it
fully private to that user (never visible to an admin, pastor, or anyone else
unless the user separately chooses to share it, e.g. by posting in Fellowship).
Confirm that's the right default before #154 touches Firestore rules.

---

## 1. The Gospel Invitation ("Would you like to know God personally?")

**Screen title:** Would You Like to Know God Personally?

**Opening**

> Every person, everywhere, was made to know God — not just to know *about*
> Him, but to actually know Him, the way you know a friend. If that sounds
> distant or out of reach, you're not alone. Here's what the Bible says about
> why, and what God has already done about it.

**The problem**

> "For all have sinned, and come short of the glory of God." (Romans 3:23)
>
> Sin isn't only the big, obvious wrongs — it's every way, small or large,
> that we've fallen short of God's perfect standard. That includes every
> person who has ever lived. And sin carries a real cost: "For the wages of
> sin is death" (Romans 6:23) — separation from God, both now and forever.
> Left there, no amount of good behavior, religion, or effort can close that
> gap. It's a debt we owe and cannot pay.

**The solution**

> "But God commendeth his love toward us, in that, while we were yet
> sinners, Christ died for us." (Romans 5:8)
>
> That same verse in Romans 6:23 doesn't stop at the bad news: "...but the
> gift of God is eternal life through Jesus Christ our Lord." Jesus Christ —
> fully God and fully man, living the perfect life none of us could live —
> took the punishment for sin on the cross in our place, and rose from the
> dead three days later, proving He had defeated sin and death for good.
> This is a finished work. It cannot be added to.

**The response**

> "For by grace are ye saved through faith; and that not of yourselves: it
> is the gift of God: Not of works, lest any man should boast." (Ephesians
> 2:8-9)
>
> This isn't something you earn — it's something you receive. It comes by
> turning away from trying to save yourself (repentance) and trusting
> completely in what Jesus already did (faith). Not a leap in the dark: a
> decision to believe what God has already proven true.
>
> "That if thou shalt confess with thy mouth the Lord Jesus, and shalt
> believe in thine heart that God hath raised him from the dead, thou shalt
> be saved." (Romans 10:9)

**A prayer, if you're ready**

> This prayer doesn't save anyone by itself — it's simply one honest way to
> put into words what you're already trusting God for. Pray it in your own
> words if you'd rather; God is looking at your heart, not a script.
>
> *"Lord Jesus, I know I've fallen short and I can't save myself. I believe
> You died for my sin and rose again. I'm turning away from trying to earn
> this, and I'm putting my trust in You alone. Thank You for the free gift
> of eternal life. Amen."*

**Button:** I just prayed this / I've already trusted Christ →
**Secondary link:** Not ready yet — but I'd like to keep learning → (routes
to the Discipleship Path in "look around" mode, no milestone marked)

---

## 2. Confirmation ("You Can Be Sure")

Appears immediately after the invitation's primary button.

> If you just prayed that prayer — or you're trusting Christ some other way
> — welcome. Not into a club or a checklist, but into God's own family. And
> you don't have to wonder whether it "worked."

> "These things have I written unto you that believe on the name of the
> Son of God; that ye may know that ye have eternal life." (1 John 5:13)
>
> That word *know* is the point. Assurance isn't based on how you feel
> today — feelings change day to day. It's based on God's own promise, and
> God does not break His promises.

> "My sheep hear my voice, and I know them, and they follow me: And I give
> unto them eternal life; and they shall never perish, neither shall any
> man pluck them out of my hand." (John 10:27-28)

**Button:** Continue to the Discipleship Path →

🔶 **DECISION NEEDED — eternal security wording.** That last verse (John
10:27-28) is doing real doctrinal work here: it's the classic Baptist basis
for **eternal security** ("once saved, always saved" — a genuine believer
cannot lose their salvation). That's a defensible, mainstream Baptist
position and matches the "general Baptist" voice you asked for, but it's
also the single most theologically load-bearing sentence in this whole
draft — some visitors' home churches teach a conditional view instead. I
wrote it as a stated confidence rather than a debate ("you don't have to
wonder"), which is the pastorally warmer choice, but I want your explicit
sign-off on taking that position in the app before it ships, since it's
the one line here that isn't "safely uncontroversial across evangelical
churches."

---

## 3. Discipleship Path — milestone lessons

Suggested order below. Each is short (readable in 2-3 minutes), written to
stand alone, and ends with a "mark as read" / journal prompt (see section
4). The task brief named the first four explicitly; I added the last three
as a natural rounding-out of a first discipleship path and marked them
clearly so you can cut any of them without it feeling incomplete.

### 3.1 Assurance of Salvation
*(Requested topic. Expands on the Confirmation screen above for anyone who
wants to revisit it later, plus handles the honest follow-up question: "but
what if I still have doubts?")*

> Doubt doesn't mean something went wrong. Even people who've walked with
> God for decades have moments of doubt — it's part of being human, not a
> sign of a failed salvation. When doubt comes, the answer isn't to try
> harder to *feel* saved. It's to go back to what God actually promised.
>
> "He that believeth on the Son hath everlasting life." (John 3:36) —
> present tense, not a someday-maybe. If you've trusted Christ, that verse
> is describing you right now. Assurance grows the more you get to know the
> God who gave you this promise — which is exactly what the rest of this
> path, and the Bible itself, is for.

### 3.2 The Security of the Believer
*(Requested topic.)*

> If salvation depended on our own effort to keep it, none of us could ever
> be sure of anything — we'd be back to earning it all over again, one day
> at a time. But salvation was never our doing to begin with (Ephesians
> 2:8-9, above), so it isn't ours to lose by failing.
>
> "I give unto them eternal life; and they shall never perish." (John
> 10:28) Being kept secure doesn't mean sin stops mattering — it still
> grieves God and still has real consequences in this life. It means a true
> believer's standing with God rests on Christ's finished work, not on a
> daily performance review. That's not a license to stop caring how you
> live — the next few topics are about exactly that — it's the secure
> foundation that makes real growth possible instead of anxious.

### 3.3 Water Baptism
*(Requested topic.)*

> Baptism doesn't save anyone — it's a public picture of something that
> already happened on the inside. Going under the water pictures Christ's
> death and burial; coming back up pictures His resurrection, and your own
> new life in Him (Romans 6:4).
>
> "Then they that gladly received his word were baptized." (Acts 2:41) —
> in the New Testament, baptism follows belief, not the other way around,
> and it's for believers old enough to understand what they're professing.
> If you've trusted Christ and haven't been baptized yet, it's the very
> next step: a simple, public "yes, I belong to Him now," done once, in
> front of your church family.

🔶 **DECISION NEEDED — baptism mode & age.** I wrote this as **believer's
baptism by immersion**, which is THE defining Baptist distinctive (as
opposed to infant baptism or baptism by sprinkling/pouring) — I'm confident
that's the right call for "general Baptist" and didn't flag it as a
toss-up. What I'd like your call on is whether to state a specific minimum
age or "age of accountability" language for children in your congregations,
since Philippine Baptist churches vary on how young is "old enough to
understand" — I left it deliberately general ("old enough to understand
what they're professing") rather than naming an age, so this doesn't
conflict with any specific church's practice using the app.

### 3.4 Obedience
*(Requested topic.)*

> Following Christ isn't only a one-time decision — it's a direction for
> daily life. Obedience isn't how you get saved (you already read why in
> section 3.2); it's how a saved person naturally responds to being loved
> that much.
>
> "If ye love me, keep my commandments." (John 14:15) Obedience starts
> small and ordinary: being honest when it costs you something, being
> patient with people who are hard to be patient with, saying no to what
> you know is wrong even when no one would ever find out. It's less about
> a list of rules and more about a relationship where you actually want to
> please the One who saved you.

### 3.5 Joining a Congregation
*(Requested topic.)*

> God never designed the Christian life to be lived alone. From the very
> first church, believers were expected to belong somewhere specific, not
> just "believe in general."
>
> "And they continued stedfastly in the apostles' doctrine and fellowship,
> and in breaking of bread, and in prayers." (Acts 2:42) A local
> congregation is where you're taught the Bible consistently, where other
> believers notice if you're struggling, where your own gifts get used to
> serve others, and where baptism and communion actually happen. If you
> don't have a church home yet, that's the next real step — and iWorship's
> Fellowship tab is here to support that, not replace it.

### 3.6 Christian Living
*(Requested topic — the day-to-day "how.")*

> Growing as a believer isn't complicated, even if it takes a lifetime.
> Four simple habits carry almost all of it:
>
> **Reading God's Word** — not to check a box, but because "man shall not
> live by bread alone, but by every word that proceedeth out of the mouth
> of God" (Matthew 4:4). The Bible tab in this app is built for exactly
> this.
>
> **Prayer** — simply talking to God, honestly, about everything (Philippians
> 4:6).
>
> **Worship** — both privately and gathered with others, which is the
> whole reason this app exists.
>
> **Telling others** — not as a performance, but as the natural overflow of
> something genuinely good that happened to you (see 3.8 below).
>
> None of these are graded. They're simply how a relationship with God gets
> deeper over time, the same way any relationship does — through actually
> spending time in it.

### 3.7 Christian Liberty
*(Requested topic.)*

> Not everything in the Christian life is a clear command — plenty of
> things are matters of personal conviction, culture, or wisdom, where
> Scripture gives freedom rather than a rule. This is sometimes called
> "soul liberty," and it's actually one of the oldest Baptist convictions:
> every believer answers to God directly for their own conscience, and no
> church or person can force a conviction onto someone else where the Bible
> itself hasn't spoken plainly.
>
> "Let every man be fully persuaded in his own mind." (Romans 14:5) That
> freedom comes with real responsibility, though — liberty is never an
> excuse to cause a weaker believer to stumble (Romans 14:13, 1 Corinthians
> 8:9), and it's never a loophole around what Scripture *does* say plainly.
> Where the Bible is silent, be gracious — toward others and toward
> yourself.

### 3.8 Sharing Your Faith *(suggested addition — cut freely)*

> You don't need a theology degree to tell someone what God has done for
> you — you already have everything you need: your own story, and the same
> gospel from section 1.
>
> "Come and see a man, which told me all things that ever I did: is not
> this the Christ?" (John 4:29) — one of the very first "evangelists" in
> the Bible was a brand-new believer with one afternoon of experience,
> telling her neighbors what had just happened to her. That's still the
> most natural way this spreads.

### 3.9 The Holy Spirit and the Christian *(suggested addition — cut freely)*

> The moment you trusted Christ, God didn't leave you to figure the rest
> out alone — He placed His own Spirit inside you, permanently.
>
> "In whom ye also trusted, after that ye heard the word of truth... in
> whom also after that ye believed, ye were sealed with that holy Spirit of
> promise." (Ephesians 1:13) The Spirit is who makes God's Word make sense
> to you, who convicts you when something's wrong, and who grows real
> change in you from the inside — not by your own willpower alone.

🔶 **DECISION NEEDED — how far to go on the Holy Spirit / spiritual gifts.**
I deliberately kept 3.9 to the "sealing/indwelling" basics only and said
nothing about spiritual gifts, tongues, or the charismatic-vs-cessationist
question — that's a real dividing line even among Baptist churches in the
Philippines, and it's outside what you asked me to cover. If you want this
topic to go further, tell me which direction your own church(es) using the
app would want, rather than me guessing.

---

## 4. Personal Journal

Not a doctrine topic — a private, ongoing space, unlocked once someone
starts the Discipleship Path. Two simple parts:

- **Milestone reflections** — after finishing each topic above, one short
  optional prompt tied to it (e.g., after 3.3 Baptism: *"Have you been
  baptized? If not, is there anything holding you back?"*). Freeform text,
  saved privately.
- **Open journal** — an unprompted space to write anytime, same as any
  private notes feature. Could also gently surface the day's Bible reading
  or verse as an optional prompt, reusing content the app already has.

🔶 **DECISION NEEDED — privacy & visibility.** I'm assuming journal entries
are private to the individual user by default, with no admin/pastor view,
export, or moderation of the content (unlike Fellowship posts, which are
public by design). That's the safer default for something this personal,
but confirm it before #154, since it affects the Firestore rules from day
one rather than something to patch in later.

---

## 5. Everything that needs your yes/no before building starts (#154)

1. Log a private milestone flag when someone taps "I just prayed this" —
   yes/no? (section 1)
2. Keep the eternal-security wording on the Confirmation screen as
   written, or soften/reword it? (section 2)
3. Any age/accountability language to add to the Baptism topic, or leave
   it general as drafted? (3.3)
4. Keep, cut, or rewrite the two suggested extra topics — Sharing Your
   Faith (3.8) and The Holy Spirit and the Christian (3.9)?
5. How far (if at all) to go on spiritual gifts / tongues in 3.9 — or
   confirm leaving it out entirely, as drafted.
6. Journal entries fully private, no admin visibility — confirm. (section 4)

Everything else in this draft I judged as the safe, standard evangelical
answer and proceeded on it per your standing instruction — flag anything
else that doesn't sit right and I'll rewrite it.
