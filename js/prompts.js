/**
 * ============================================================================
 * RADIA — CATALYST QUESTION & CONTEXTUAL PARTNER INSIGHT ENGINE (js/prompts.js)
 * ----------------------------------------------------------------------------
 *  • 54 curated non-polarizing conversation catalysts across 3 categories:
 *      1. Human Experience & Vulnerability
 *      2. Observational & Physical Context
 *      3. Curiosity & Perspectives
 *  • Deterministic MurmurHash3 -> Mulberry32 PRNG so both colliding devices
 *    display the exact same prompt simultaneously without a central server.
 *  • Contextual Partner Insight Generator: produces thoughtful, non-judgmental
 *    reciprocal insights matched to the exact prompt & location spot for
 *    single-device testing and constellation node seeding.
 *
 *  Public singleton: window.RadiaPrompts
 * ============================================================================
 */

(function () {
  'use strict';

  const CATEGORIES = {
    VULNERABILITY: 'Human Experience & Vulnerability',
    OBSERVATIONAL: 'Observational & Physical Context',
    CURIOSITY: 'Curiosity & Perspectives'
  };

  const CATEGORY_LABELS = {
    [CATEGORIES.VULNERABILITY]: 'Human Catalyst',
    [CATEGORIES.OBSERVATIONAL]: 'Observational Catalyst',
    [CATEGORIES.CURIOSITY]: 'Curiosity Catalyst'
  };

  const CATEGORY_ACCENTS = {
    [CATEGORIES.VULNERABILITY]: 'emerald',
    [CATEGORIES.OBSERVATIONAL]: 'amber',
    [CATEGORIES.CURIOSITY]: 'cyan'
  };

  const PROMPTS = [
    /* CATEGORY 1 — HUMAN EXPERIENCE & VULNERABILITY (18) */
    {
      id: 'v-01', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.2, env: 'GENERAL',
      text: "What is a belief you held five years ago that you've completely abandoned?",
      followUp: "What was the quiet moment it started to shift?",
      samplePartnerInsights: [
        "Hearing how we both outgrew the need to have a rigid 10-year plan made me realize growth is mostly subtraction.",
        "I used to equate busyness with worth—talking about this reminded me how freeing it is to let old identities go."
      ]
    },
    {
      id: 'v-02', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.2, env: 'GENERAL',
      text: "What is a small, ordinary compliment someone gave you that you still remember?",
      followUp: "Why do you think that one stuck when others didn't?",
      samplePartnerInsights: [
        "We remember compliments about how we make people feel far longer than compliments about what we achieve.",
        "It struck me how a ten-second kindness from a stranger can anchor someone for years."
      ]
    },
    {
      id: 'v-03', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.1, env: 'GENERAL',
      text: "What is something you're currently overthinking more than it deserves?",
      followUp: "What would change if you just let it resolve itself?",
      samplePartnerInsights: [
        "Saying my worry out loud in the open air immediately shrank it to a manageable size.",
        "Almost everything we overthink is an attempt to control a future conversation before it happens."
      ]
    },
    {
      id: 'v-04', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "When was the last time you felt genuinely out of your depth — and chose to stay anyway?",
      followUp: "Did it change how you size up risk now?",
      samplePartnerInsights: [
        "Courage rarely feels heroic in the moment; it mostly feels like staying curious for five more minutes.",
        "Being a beginner in public is uncomfortable, but it's the only way our world actually expands."
      ]
    },
    {
      id: 'v-05', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "What is a boundary you set recently that made your life noticeably quieter?",
      followUp: "Was it hard to hold the first few times?",
      samplePartnerInsights: [
        "Leaving my phone out of reach for the first hour of the morning gave me back my own thoughts.",
        "A good boundary isn't a wall against others—it's a clearing where you can actually show up present."
      ]
    },
    {
      id: 'v-06', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What do people usually assume about you within the first minute that's just wrong?",
      followUp: "What part of you do they never see coming?",
      samplePartnerInsights: [
        "Quietness is so often misread as distance when it's actually just deep observation.",
        "Everyone carries a hidden enthusiasm you'd never guess just by passing them on the sidewalk."
      ]
    },
    {
      id: 'v-07', category: CATEGORIES.VULNERABILITY, depth: 3, weight: 0.9, env: 'GENERAL',
      text: "What is a detour or failure you're now quietly grateful happened?",
      followUp: "Where do you think you'd be if it had gone 'right'?",
      samplePartnerInsights: [
        "The doors that closed on us both ended up redirecting us toward people we never would have met otherwise.",
        "Looking back, my favorite chapters all started as plans that fell apart."
      ]
    },
    {
      id: 'v-08', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What habit have you tried to build over and over that simply refuses to stick?",
      followUp: "Do you actually want it, or just like the version of you who has it?",
      samplePartnerInsights: [
        "Realizing the difference between wanting a habit and wanting an aesthetic lifted a huge weight off.",
        "Maybe consistency works better when it's tied to joy instead of self-correction."
      ]
    },
    {
      id: 'v-09', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "When did you last change your mind in the middle of a conversation?",
      followUp: "What did that person do that made it feel safe to shift?",
      samplePartnerInsights: [
        "People change their minds when they aren't being cornered—curiosity disarms defensiveness every time.",
        "Listening without waiting to win is the rarest superpower in modern life."
      ]
    },
    {
      id: 'v-10', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 1.1, env: 'GENERAL',
      text: "What advice do you give freely to others but struggle to follow yourself?",
      followUp: "Where does the resistance actually live?",
      samplePartnerInsights: [
        "We offer grace so easily to friends while holding ourselves to an impossible courtroom standard.",
        "Sometimes we teach the exact lesson we're still trying to learn."
      ]
    },
    {
      id: 'v-11', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 0.9, env: 'GENERAL',
      text: "What's an expectation you feel placed on you that you never agreed to?",
      followUp: "How do you navigate around it day to day?",
      samplePartnerInsights: [
        "Stepping out of unspoken scripts takes practice, especially when the script looks like 'success'.",
        "You don't owe anyone consistency with a version of yourself from three years ago."
      ]
    },
    {
      id: 'v-12', category: CATEGORIES.VULNERABILITY, depth: 3, weight: 0.8, env: 'GENERAL',
      text: "What's something you forgave that was genuinely difficult to put down?",
      followUp: "Did it change the relationship, or only change you?",
      samplePartnerInsights: [
        "Forgiveness is mostly deciding not to carry a heavy stone in your own backpack anymore.",
        "Peace comes when you stop needing the past to have been different."
      ]
    },
    {
      id: 'v-13', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What were you afraid of as a kid that turned out to be completely irrelevant?",
      followUp: "What took its place?",
      samplePartnerInsights: [
        "Childhood fears were monsters in the dark; adult fears are mostly imaginary audiences.",
        "Laughing about old fears makes today's worries look a lot less permanent."
      ]
    },
    {
      id: 'v-14', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.2, env: 'GENERAL',
      text: "What activity makes you lose track of time completely?",
      followUp: "When did you last actually make room for it?",
      samplePartnerInsights: [
        "Flow state happens whenever our hands or feet are moving and our phone is in another room.",
        "We don't find time for what restores us—we have to carve it out deliberately."
      ]
    },
    {
      id: 'v-15', category: CATEGORIES.VULNERABILITY, depth: 2, weight: 0.9, env: 'GENERAL',
      text: "What's a hard truth someone told you that you hated at the time and appreciate now?",
      followUp: "What made you trust them enough to hear it eventually?",
      samplePartnerInsights: [
        "Honesty only lands when you know the other person genuinely wants you to thrive.",
        "The feedback that stings a little usually points straight to where we're ready to grow."
      ]
    },
    {
      id: 'v-16', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What part of your daily routine quietly drains you without you noticing?",
      followUp: "What's the smallest change that would remove it?",
      samplePartnerInsights: [
        "Micro-scrolling between tasks steals the quiet pauses our brain needs to synthesize life.",
        "Replacing ten minutes of screen noise with a walk outside changes the entire afternoon."
      ]
    },
    {
      id: 'v-17', category: CATEGORIES.VULNERABILITY, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What's a quality you admire in someone close to you?",
      followUp: "Have you ever tried to grow that same thing in yourself?",
      samplePartnerInsights: [
        "What we admire in others is usually a dormant seed of what we're capable of becoming.",
        "Warmth and unhurried presence are habits anyone can practice."
      ]
    },
    {
      id: 'v-18', category: CATEGORIES.VULNERABILITY, depth: 3, weight: 0.8, env: 'GENERAL',
      text: "If you could send one sentence back to yourself five years ago, what would you deliberately leave out?",
      followUp: "Why does that part need to be lived instead of warned about?",
      samplePartnerInsights: [
        "Spoiling the surprise would rob our younger selves of the resilience earned along the way.",
        "Uncertainty is what makes discovery meaningful."
      ]
    },

    /* CATEGORY 2 — OBSERVATIONAL & PHYSICAL CONTEXT (18) */
    {
      id: 'o-01', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 1.3, env: 'GENERAL',
      text: "Look around us right now. What is one thing here that won't exist in 50 years?",
      followUp: "What do you think replaces it?",
      samplePartnerInsights: [
        "Notice how trees and benches endure for centuries while every piece of tech around us is temporary.",
        "Looking at this street through a 50-year lens makes the present moment feel like living history."
      ]
    },
    {
      id: 'o-02', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.2, env: 'GENERAL',
      text: "Without checking your phone — what sound is happening right now that you'd been filtering out?",
      followUp: "Does noticing it change how this place feels?",
      samplePartnerInsights: [
        "Stopping to listen together tuned us into wind in the leaves and footsteps we'd completely tuned out.",
        "Shared silence for five seconds makes a busy plaza feel strangely peaceful."
      ]
    },
    {
      id: 'o-03', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 1.0, env: 'URBAN',
      text: "If someone from 200 years ago stood exactly where we are, what would startle them first?",
      followUp: "Would they call this an upgrade?",
      samplePartnerInsights: [
        "They'd be amazed that hundreds of people walk past each other staring at glowing glass rectangles.",
        "Having a real face-to-face conversation here felt like reclaiming something timeless."
      ]
    },
    {
      id: 'o-04', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 1.1, env: 'GENERAL',
      text: "Look at the people moving past us. What do you think most of them are thinking about?",
      followUp: "How often are we running the exact same loop?",
      samplePartnerInsights: [
        "Realizing everyone passing by has an inner world as complex as ours—what they call 'sonder'—builds instant empathy.",
        "Breaking out of our private mental loop to say hello changes the whole energy of a sidewalk."
      ]
    },
    {
      id: 'o-05', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.9, env: 'URBAN',
      text: "What's a design detail in places like this that almost nobody consciously notices?",
      followUp: "How does it quietly steer how people behave?",
      samplePartnerInsights: [
        "Where cities place shade, water, and curved seating determines whether strangers linger or rush.",
        "Architecture silently scripts our social lives until we choose to pause."
      ]
    },
    {
      id: 'o-06', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 0.9, env: 'GENERAL',
      text: "If you had to hide something small within sight of us for 24 hours, where would you put it?",
      followUp: "Plain sight, or genuinely hidden?",
      samplePartnerInsights: [
        "Looking at our immediate radius like a treasure map made us notice textures we'd walked past a hundred times.",
        "Playfulness turns an ordinary street corner into a shared secret."
      ]
    },
    {
      id: 'o-07', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.0, env: 'OUTDOOR',
      text: "What natural thing around us right now feels most resilient here?",
      followUp: "How is it adapting to the city around it?",
      samplePartnerInsights: [
        "Roots finding their way through stone is a quiet masterclass in persistence.",
        "Even in dense urban sprawl, nature is constantly weaving itself back in."
      ]
    },
    {
      id: 'o-08', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.8, env: 'GENERAL',
      text: "If we had to finish this whole conversation without words, how would you get your point across?",
      followUp: "What's the most honest non-verbal signal humans have?",
      samplePartnerInsights: [
        "Half of human warmth is carried in eye contact and unhurried posture before a word is spoken.",
        "A genuine nod of recognition cuts across every barrier."
      ]
    },
    {
      id: 'o-09', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "Of the materials around us — stone, foliage, wood, glass — which one do you feel calmest near?",
      followUp: "Any idea why that one?",
      samplePartnerInsights: [
        "We gravitate toward materials that age gracefully and show the warmth of time.",
        "Standing near trees and natural stone noticeably slows our breathing."
      ]
    },
    {
      id: 'o-10', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "Look at the light where we're standing. How is it shaping the mood of this conversation?",
      followUp: "Do you talk differently in daylight versus at twilight?",
      samplePartnerInsights: [
        "Warm angled light makes people naturally more reflective and unguarded.",
        "Paying attention to the light anchors you immediately in the present."
      ]
    },
    {
      id: 'o-11', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "Point to one object you can see that took thousands of strangers to make.",
      followUp: "Does tracing that chain make the object feel heavier?",
      samplePartnerInsights: [
        "Every brick and lamppost around us is a silent collaboration of thousands of human hands.",
        "We are never actually disconnected from humanity, even when we feel alone."
      ]
    },
    {
      id: 'o-12', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 0.9, env: 'GENERAL',
      text: "If you had to paint this exact scene, which color would you reach for most?",
      followUp: "Is that the color of the objects, or of the feeling?",
      samplePartnerInsights: [
        "Seeing a place through color turns a commute into a canvas.",
        "We both picked warm emerald and gold—the mood of a place matters more than its geometry."
      ]
    },
    {
      id: 'o-13', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.9, env: 'CAMPUS',
      text: "Can you spot a path here that people made by habit rather than by design?",
      followUp: "Why do humans always carve their own route?",
      samplePartnerInsights: [
        "Desire paths in parks show where human intuition diverges from rigid blueprints.",
        "Real connection is a desire path across the rigid grid of modern routine."
      ]
    },
    {
      id: 'o-14', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.9, env: 'URBAN',
      text: "If every screen on this block went dark for an hour, what happens in the first ten minutes?",
      followUp: "Do people look up and talk?",
      samplePartnerInsights: [
        "Whenever the digital layer pauses, neighborhood camaraderie wakes up within minutes.",
        "We don't need an outage to choose to look up and greet the person beside us."
      ]
    },
    {
      id: 'o-15', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What's the oldest physical thing you can see from where we're standing?",
      followUp: "What was happening here when it first showed up?",
      samplePartnerInsights: [
        "Old trees and cornerstones remind us we're brief stewards of the places we walk through.",
        "Connecting to local history makes a neighborhood feel like home."
      ]
    },
    {
      id: 'o-16', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.9, env: 'GENERAL',
      text: "If you sat in this exact spot for an hour with no phone, what rhythm would you start to notice?",
      followUp: "How long before stillness turns into fascination?",
      samplePartnerInsights: [
        "Every plaza has a tide—rushes, lulls, and small human stories unfolding in plain sight.",
        "Stillness isn't empty; it's full of details we usually outrun."
      ]
    },
    {
      id: 'o-17', category: CATEGORIES.OBSERVATIONAL, depth: 2, weight: 0.8, env: 'URBAN',
      text: "What makes a public space feel genuinely welcoming versus merely functional?",
      followUp: "Where is your favorite place in this city to just exist?",
      samplePartnerInsights: [
        "Places feel alive when people feel invited to stay without buying anything.",
        "Third places are the lungs of a healthy community."
      ]
    },
    {
      id: 'o-18', category: CATEGORIES.OBSERVATIONAL, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What's something about this specific spot that you'd miss if it disappeared tomorrow?",
      followUp: "Would anyone else even notice it was gone?",
      samplePartnerInsights: [
        "Gratitude for ordinary corners of our daily walk turns routine into ritual.",
        "Sharing what we love about a place makes both people see it with fresh eyes."
      ]
    },

    /* CATEGORY 3 — CURIOSITY & PERSPECTIVES (18) */
    {
      id: 'c-01', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.3, env: 'GENERAL',
      text: "What's something most people call a luxury that you consider a genuine necessity?",
      followUp: "Where did that standard come from for you?",
      samplePartnerInsights: [
        "Unscheduled time to wander and think isn't a luxury—it's how we stay human.",
        "Fresh air and unhurried conversation cost nothing yet feel like the rarest wealth."
      ]
    },
    {
      id: 'c-02', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.2, env: 'GENERAL',
      text: "If you could instantly master one craft but could never earn money from it, what would you pick?",
      followUp: "Would you share it, or keep it entirely yours?",
      samplePartnerInsights: [
        "Removing money from the question reveals what our soul actually finds beautiful.",
        "Doing something purely for the love of craft is the ultimate antidote to burnout."
      ]
    },
    {
      id: 'c-03', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What tiny everyday ritual brings you disproportionately high joy?",
      followUp: "How did that ritual start?",
      samplePartnerInsights: [
        "Big happiness is rare, but micro-joys—morning coffee on steps, evening walks—are available daily.",
        "Paying attention to small delights compounds over a whole year."
      ]
    },
    {
      id: 'c-04', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "What idea genuinely shifted your worldview the first time you understood it?",
      followUp: "Has it changed how you approach people since?",
      samplePartnerInsights: [
        "Once you see that everyone is doing the best they can with the map they were given, judgment softens into curiosity.",
        "A single new mental model can reframe years of past experience."
      ]
    },
    {
      id: 'c-05', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "If every person alive could experience one piece of art, music, or nature once, what would you choose?",
      followUp: "What feeling does it unlock?",
      samplePartnerInsights: [
        "Awe is the fastest equalizer—standing under stars or hearing great music dissolves our ego.",
        "Recommendations from a real conversation carry ten times the weight of an algorithm."
      ]
    },
    {
      id: 'c-06', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "What obsolete habit or tool do you secretly wish we'd bring back?",
      followUp: "What useful friction did convenience delete?",
      samplePartnerInsights: [
        "When everything becomes frictionless, nothing leaves a lasting texture in memory.",
        "Handwritten notes and serendipitous street encounters had a warmth we're now intentionally rebuilding."
      ]
    },
    {
      id: 'c-07', category: CATEGORIES.CURIOSITY, depth: 2, weight: 0.9, env: 'GENERAL',
      text: "What's considered totally normal today that future generations will find baffling?",
      followUp: "What are we already starting to outgrow?",
      samplePartnerInsights: [
        "Trading real-world community for endless algorithmic feeds will look like a brief historical fever.",
        "We're at the beginning of a massive return to tangible, local life."
      ]
    },
    {
      id: 'c-08', category: CATEGORIES.CURIOSITY, depth: 3, weight: 0.9, env: 'GENERAL',
      text: "If you were guaranteed one completely true answer to any question, what would you ask?",
      followUp: "Would you still want it if the answer surprised you?",
      samplePartnerInsights: [
        "The questions a person asks tell you far more about their heart than their answers do.",
        "Some mysteries are meant to be lived with rather than solved."
      ]
    },
    {
      id: 'c-09', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What subject do you know almost nothing about but find endlessly fascinating?",
      followUp: "What draws you to it?",
      samplePartnerInsights: [
        "Enthusiasm is contagious—listening to someone light up about a niche curiosity is pure joy.",
        "There is no age limit on picking up a completely new fascination."
      ]
    },
    {
      id: 'c-10', category: CATEGORIES.CURIOSITY, depth: 3, weight: 0.8, env: 'GENERAL',
      text: "Do you think people are more driven by the search for peace or the search for meaning?",
      followUp: "Which one is steering you in this season of life?",
      samplePartnerInsights: [
        "Peace and meaning aren't opposites—peace is the soil, and meaning is what grows from it.",
        "Recognizing which season you're in saves you from chasing the wrong goal."
      ]
    },
    {
      id: 'c-11', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.2, env: 'GENERAL',
      text: "What's the most interesting rabbit hole you've gone down recently?",
      followUp: "What pulled you in so deeply?",
      samplePartnerInsights: [
        "Every stranger is a walking library of something you haven't discovered yet.",
        "Genuine curiosity makes five minutes feel like a mini documentary."
      ]
    },
    {
      id: 'c-12', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "If you could witness any ten minutes of history as an invisible observer, which ten?",
      followUp: "What detail would you look for first?",
      samplePartnerInsights: [
        "We're always drawn to moments where ordinary people did something quietly extraordinary.",
        "Right now is also a slice of history someone in the future will wish they could witness."
      ]
    },
    {
      id: 'c-13', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What tradition from your upbringing did you only later realize was unique?",
      followUp: "Would you carry it forward?",
      samplePartnerInsights: [
        "Our quirks and family traditions are where culture actually lives.",
        "We get to curate our own traditions as adults."
      ]
    },
    {
      id: 'c-14', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "What's your subtle green flag that tells you someone is genuinely grounded?",
      followUp: "How quickly can you usually sense it?",
      samplePartnerInsights: [
        "How someone treats interruptions and silence reveals how grounded they are inside.",
        "Kindness without an agenda is immediately recognizable."
      ]
    },
    {
      id: 'c-15', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.1, env: 'GENERAL',
      text: "What do you do purely for the process, where the outcome genuinely doesn't matter?",
      followUp: "How does it feel to do something with zero audience?",
      samplePartnerInsights: [
        "Doing things without posting or measuring them protects their magic.",
        "Play is anything we do where the process is the whole reward."
      ]
    },
    {
      id: 'c-16', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "If every vocation carried identical status and comfort, how would you spend your days?",
      followUp: "How can you bring 10% of that into this week?",
      samplePartnerInsights: [
        "Most people want to build, teach, cultivate, or connect when status anxiety is removed.",
        "We don't have to wait for someday to bring 10% of our ideal life into this week."
      ]
    },
    {
      id: 'c-17', category: CATEGORIES.CURIOSITY, depth: 1, weight: 1.0, env: 'GENERAL',
      text: "What do you find genuinely fascinating that most people overlook?",
      followUp: "What are you seeing in it that others miss?",
      samplePartnerInsights: [
        "Nothing is boring once you look closely enough at how it works.",
        "Borrowing someone else's lens for three minutes permanently expands your own."
      ]
    },
    {
      id: 'c-18', category: CATEGORIES.CURIOSITY, depth: 2, weight: 1.0, env: 'GENERAL',
      text: "What is one human skill that can only be learned face-to-face?",
      followUp: "How did this conversation feel compared to texting?",
      samplePartnerInsights: [
        "Shared presence, timing, and mutual empathy simply cannot be simulated on a feed.",
        "Stepping into a 40-foot circle with a neighbor reminds you how good real dialogue feels."
      ]
    }
  ];

  const REFLECTION_PROMPTS = [
    "shifted how I view my daily pace",
    "reminded me that strangers share similar questions",
    "made me notice the space around us differently",
    "sparked an unexpected perspective on growth",
    "felt grounding and unhurried",
    "showed how quickly real dialogue builds trust"
  ];

  function murmur3(input) {
    const str = String(input);
    let h1 = 0xdeadbeef;
    for (let i = 0; i < str.length; i++) {
      let k1 = str.charCodeAt(i);
      k1 = Math.imul(k1, 0xcc9e2d51);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, 0x1b873593);
      h1 ^= k1;
      h1 = (h1 << 13) | (h1 >>> 19);
      h1 = Math.imul(h1, 5) + 0xe6546b64;
    }
    h1 ^= str.length;
    h1 ^= h1 >>> 16;
    h1 = Math.imul(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;
    return h1 >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weightedPick(pool, rng) {
    let total = 0;
    for (let i = 0; i < pool.length; i++) {
      total += typeof pool[i].weight === 'number' ? pool[i].weight : 1;
    }
    let roll = rng() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= typeof pool[i].weight === 'number' ? pool[i].weight : 1;
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  const RadiaPromptEngine = {
    CATEGORIES,
    CATEGORY_LABELS,
    CATEGORY_ACCENTS,
    PROMPTS,
    REFLECTION_PROMPTS,

    getSynchronizedPrompt(sharedSeed, options) {
      const opts = options || {};
      if (sharedSeed === undefined || sharedSeed === null || sharedSeed === '') {
        sharedSeed = 'radia-fallback-' + Math.floor(Date.now() / 60000);
      }

      const variant = Number.isFinite(opts.variant) ? Math.max(0, Math.floor(opts.variant)) : 0;
      const seedKey = `radia-catalyst:${sharedSeed}:v${variant}`;
      const seedHash = murmur3(seedKey);
      const rng = mulberry32(seedHash);

      let pool = PROMPTS.slice();
      if (opts.category) {
        const filtered = pool.filter((p) => p.category === opts.category);
        if (filtered.length) pool = filtered;
      }
      if (Number.isFinite(opts.maxDepth)) {
        const capped = pool.filter((p) => p.depth <= opts.maxDepth);
        if (capped.length) pool = capped;
      }
      if (opts.env && opts.env !== 'GENERAL') {
        pool = pool.map((p) =>
          p.env === opts.env ? Object.assign({}, p, { weight: (p.weight || 1) * 2.2 }) : p
        );
      }

      const chosen = weightedPick(pool, rng);
      return this._hydrate(chosen, seedHash, variant, pool.length);
    },

    getRandomPrompt(options) {
      return this.getSynchronizedPrompt('local-' + Date.now() + '-' + Math.random(), options);
    },

    getPromptById(id) {
      const found = PROMPTS.find((p) => p.id === id);
      return found ? this._hydrate(found, murmur3(id), 0, PROMPTS.length) : null;
    },

    getReflectionPrompts(sessionSeed, count) {
      const n = Math.max(1, Math.min(count || 4, REFLECTION_PROMPTS.length));
      const rng = mulberry32(murmur3('radia-reflect:' + (sessionSeed || Date.now())));
      const pool = REFLECTION_PROMPTS.slice();
      const picked = [];
      while (picked.length < n && pool.length) {
        const idx = Math.floor(rng() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
      }
      return picked;
    },

    /**
     * Generates a thoughtful, non-judgmental reciprocal insight from the conversation partner
     * tied directly to the active Catalyst Prompt and Location Spot.
     */
    getPartnerInsightForPrompt(promptObj, partnerName, spotName) {
      const p = promptObj ? PROMPTS.find((item) => item.id === promptObj.id || item.text === promptObj.text) : null;
      const pool = (p && p.samplePartnerInsights && p.samplePartnerInsights.length)
        ? p.samplePartnerInsights
        : [
            "Stepping out of routine to reflect on this question in person reminded me how much wisdom lives right in our neighborhood.",
            "I didn't realize how much I needed a real, unhurried conversation today until we started talking."
          ];
      const idx = Math.floor(Math.random() * pool.length);
      return pool[idx];
    },

    _hydrate(prompt, seedHash, variant, poolSize) {
      return {
        id: prompt.id,
        category: prompt.category,
        categoryLabel: CATEGORY_LABELS[prompt.category] || 'Catalyst',
        accent: CATEGORY_ACCENTS[prompt.category] || 'emerald',
        depth: prompt.depth,
        env: prompt.env,
        text: prompt.text,
        promptText: prompt.text,
        followUp: prompt.followUp || null,
        samplePartnerInsights: prompt.samplePartnerInsights || [],
        synchronizedSeed: seedHash,
        variant: variant,
        poolSize: poolSize,
        libraryVersion: '2.0.0'
      };
    }
  };

  window.RadiaPrompts = RadiaPromptEngine;
})();
