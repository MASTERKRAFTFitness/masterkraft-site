// Equipment SUBCATEGORY pages — one level below lib/categories.ts.
//
// WHY THESE EXIST. A ProductSubGroup has always been expressible on the site as
// `?sub=` on its category page, and that page canonicalises every facet away
// (see its generateMetadata: sort, sub, min and max reorder the same products,
// so only `page` earns a URL). That is right for a FILTER and wrong for a
// TOPIC. "Plyometric boxes" and "squat racks" are not a way of looking at Body
// Weight and Rigs & Racks — they are what a buyer searches for, and the site
// had no URL to answer with.
//
// THE OLD STORE DID. WordPress nested subcategories as
// /equipment/<category>/<sub>, and those URLs still rank: Semrush found
// /equipment/body-weight/gymnastics at position 44-45 for "wooden gymnastic
// rings" and "wooden gym rings", 160 searches a month between them and both
// climbing, while the URL itself answered 404 from the cutover until 15
// September and a redirect to a collapsing facet after it. The structure is not
// a new idea; it is one this domain has already been given credit for.
//
// A HAND-WRITTEN LIST, NOT EVERY SUBGROUP. `npm run report:subgroups` counts 57
// subgroups, 31 of them with three cards or more, and building all 57 from the
// ERP automatically is how a catalogue grows fifty thin pages that list products
// their category page already lists. That is the definition of a doorway page.
// So a subgroup gets a URL when somebody has written a reason for it to exist,
// which is what `about` is, and not before. Adding one is an edit here.
//
// WHAT IS DELIBERATELY LEFT OUT. Apparel's Unisex / Male / Woman qualify on
// count and are merchandising facets rather than topics — nobody searches for
// them — so they stay as filters. Packages' Dumbbells, Kettlebells, Wall Balls
// and Dead Balls duplicate names that Mixed Implements owns with far more
// behind them; two pages competing for one query is the duplication these pages
// exist to remove. See the "One subgroup, two categories" section of
// reports/subgroup-pages.md, which lists every such collision.
//
// SLUGS ARE HAND-WRITTEN, for the reason lib/categories.ts gives: a taxonomy
// changing is not a reason to break an inbound link. Each is set to what
// `slugify` currently produces for the ERP name, so `?sub=` and the page agree
// on one spelling, and it stays put if somebody renames the subgroup in
// Unleashed.
//
// MEMBERSHIP IS STILL THE ERP'S. `erpSubgroup` matches ProductSubGroup exactly;
// nothing here decides what is in a subcategory, only that the subcategory has a
// page. Re-file a product in Unleashed and it moves, with no deploy.
//
// NO COPY HERE STATES A SPEC THE SYSTEM CANNOT CHECK — no weights, dimensions,
// gauges, load ratings or warranty terms. This is the rule lib/product-copy.ts
// is held to, for the same reason: a confident invented figure is the kind of
// wrong a customer discovers on delivery. subcategories.test.ts enforces it.

export type Subcategory = {
  /** The category slug this sits under, from lib/categories.ts. */
  category: string;
  /** URL segment: /equipment/<category>/<slug>. */
  slug: string;
  /** Unleashed ProductSubGroup, spelled exactly as the ERP spells it. */
  erpSubgroup: string;
  /** The H1. */
  label: string;
  /** The line under the H1 — a subtitle, not a summary. */
  blurb: string;
  /** The meta description. Written for a search result with no page around it. */
  meta: string;
  /**
   * The `<title>`, where the label is too short to be one.
   *
   * Fifteen of these pages are a single noun — "Barbells", "Dumbbells",
   * "Gymnastics" — which the template in app/layout.tsx turns into twenty-odd
   * characters where a search result shows about sixty. It is the same fault
   * the Opinly audit raised against thirty-five other pages on 2026-09-16, on
   * pages it had not crawled yet: these only went live on 15 September.
   *
   * Drawn from `blurb` and `meta` below rather than invented, so it is held to
   * the same no-unverifiable-specs rule as the rest of this file. Unset where
   * the label already fills the line.
   */
  seoTitle?: string;
  /** Long-form copy, rendered under the grid. Plain HTML. */
  about: string;
};

export const subcategories: Subcategory[] = [
  // ---- Strength -----------------------------------------------------------
  {
    category: "strength",
    slug: "chest-and-shoulder-machines",
    erpSubgroup: "Chest & Shoulder Machines",
    label: "Chest & Shoulder Machines",
    blurb: "Press, fly and shoulder stations, plate-loaded and selectorised.",
    meta:
      "Commercial chest and shoulder machines for gyms: chest press, incline press, pec fly and shoulder press stations, plate-loaded or selectorised.",
    about:
      "<p>Chest and shoulder work is where a gym floor gets busiest, and where the queue forms if the selection is thin. This range covers the presses and the fly stations in both loading types, so a fitout can put a plate-loaded press next to a selectorised one and let members choose rather than wait.</p>" +
      "<p>The plate-loaded frames suit strength-focused floors and clubs that already hold plate inventory. The selectorised stations suit mixed memberships, induction programmes and anyone who wants a seat, a pin and no setup. Most commercial floors end up with both.</p>" +
      "<p>Every frame is available in the MasterKraft finish range, and every one can be branded for a club or franchise fitout. Tell us the floor area and the member profile and we will lay the mix out for you.</p>",
  },
  {
    category: "strength",
    slug: "lower-body-machines",
    erpSubgroup: "Lower Body Machines",
    label: "Lower Body Machines",
    blurb: "Leg press, hack squat, extension, curl and hip stations.",
    meta:
      "Commercial lower body machines: leg press, hack squat, leg extension, seated and lying curl, abduction and hip thrust stations for gym fitouts.",
    about:
      "<p>Lower body stations carry the heaviest loads in the building and take the most abuse, which is why the frames here are built around commercial-duty bearings and guide systems rather than scaled-up home equipment.</p>" +
      "<p>The range runs from the compound stations a strength floor is planned around — leg press, hack squat, the squat-lunge frames — through to the isolation work that fills out a circuit: extension, seated and lying curl, abduction and adduction. Hip thrust appears in both a plate-loaded and a selectorised version, which are different machines rather than two names for one.</p>" +
      "<p>Lower body equipment is also the heaviest to install. Delivery and placement are quoted with the equipment, not after it.</p>",
  },
  {
    category: "strength",
    slug: "back-machines",
    erpSubgroup: "Back Machines",
    seoTitle: "Back Machines | Rows, Pulldowns & Pull-Up Assist",
    label: "Back Machines",
    blurb: "Rows, pulldowns and pull-up assist stations.",
    meta:
      "Commercial back machines for gyms: lat pulldown, seated row, high row, low row and iso-lateral pulling stations in plate-loaded and selectorised builds.",
    about:
      "<p>Pulling stations are the half of the floor that gets planned last and used constantly. The range here covers the vertical pull — lat pulldown and its iso-lateral equivalents — and the horizontal pull, from seated cable rows to plate-loaded high and low row frames.</p>" +
      "<p>Iso-lateral frames matter more here than anywhere else on the floor. Pulling is where a strength imbalance shows first, and independent arms let a member work each side without the stronger one carrying the movement.</p>" +
      "<p>If you are replacing a single row station, tell us what it sits between. Back machines have long approach paths and the mistake to avoid is a frame that cannot be loaded because the one beside it is in the way.</p>",
  },
  {
    category: "strength",
    slug: "bicep-and-tricep-machines",
    erpSubgroup: "Bicep & Tricep Machines",
    label: "Bicep & Tricep Machines",
    blurb: "Preacher curl, dip and extension stations.",
    meta:
      "Commercial arm machines for gyms: preacher curl, biceps curl, triceps extension and dip stations, plate-loaded and selectorised.",
    about:
      "<p>Arm stations are the ones members return to between compound sets, so they earn their floor space through turnover rather than through load. A preacher bench and a triceps station in the right place will be busy all evening.</p>" +
      "<p>The range covers seated curl and preacher frames, triceps extension and dip assist, in both loading types. Selectorised units suit a circuit where members move quickly and nobody wants to strip plates; plate-loaded frames suit a strength floor that already has plates within reach.</p>" +
      "<p>These are also the easiest stations to add to a floor that is already laid out, because they need the least approach space of anything in the strength range.</p>",
  },
  {
    category: "strength",
    slug: "abdominal-machines",
    erpSubgroup: "Abdominal Machines",
    label: "Abdominal Machines",
    blurb: "Crunch, rotation and back extension stations.",
    meta:
      "Commercial abdominal and core machines for gyms: seated crunch, rotary torso, back extension and hyperextension stations built for constant use.",
    about:
      "<p>Core stations sit in the part of a gym that people use unsupervised, often at the end of a session, which puts a premium on equipment that is obvious to get into and hard to set up wrongly.</p>" +
      "<p>The range covers seated crunch and rotation frames alongside the hyperextension and back extension benches that a strength floor needs for posterior chain work. The extension frames double as accessory stations for lifters, so they rarely sit idle.</p>" +
      "<p>Pair these with the mats and core training equipment under Body Weight if you are building a dedicated core area rather than adding a single station.</p>",
  },
  {
    category: "strength",
    slug: "cable-machines",
    erpSubgroup: "Cable Machines",
    seoTitle: "Cable Machines | Functional Trainers & Pulleys",
    label: "Cable Machines",
    blurb: "Functional trainers, dual pulleys and multi-stations.",
    meta:
      "Commercial cable machines: dual adjustable pulleys, functional trainers and multi-station units for gyms, studios and small-footprint fitouts.",
    about:
      "<p>A cable station is the most flexible square metre in a gym. One frame covers pressing, pulling, rotation and every cable accessory movement a trainer wants to programme, which is why it is usually the first machine into a studio and the last one an operator would remove.</p>" +
      "<p>The range runs from dual adjustable pulleys and functional trainers through to multi-stations that give several members their own station on one footprint. Multi-stations are the answer where floor area is the constraint rather than budget.</p>" +
      "<p>Cable equipment needs a considered ceiling height and a clear working envelope in front of it. Send us the room and we will tell you what fits before you order.</p>",
  },
  {
    category: "strength",
    slug: "weight-benches",
    erpSubgroup: "Weight Benches",
    seoTitle: "Weight Benches | Flat, Incline & Adjustable",
    label: "Weight Benches",
    blurb: "Flat, incline, decline and adjustable benches.",
    meta:
      "Commercial gym benches: flat, incline, decline, adjustable and utility benches built for constant use in clubs, studios and strength floors.",
    about:
      "<p>Benches are the highest-turnover item on any strength floor and the one most often bought too light. A commercial bench is judged on frame rigidity under a loaded lifter, on pad density that survives daily use, and on whether it can be dragged across a floor several times a day without loosening.</p>" +
      "<p>The range covers fixed flat, incline and decline benches as well as adjustable and utility frames for clubs that need one bench to do several jobs. Fixed benches are steadier and cheaper per station; adjustable benches buy flexibility where space is short.</p>" +
      "<p>Benches are usually ordered alongside racks. If you are fitting both, order them together so the bench height and the rack's J-hook range are matched rather than discovered.</p>",
  },

  // ---- Weightlifting ------------------------------------------------------
  {
    category: "weightlifting",
    slug: "barbells",
    erpSubgroup: "Barbells",
    seoTitle: "Barbells | Olympic, Powerlifting & Fixed Bars",
    label: "Barbells",
    blurb: "Olympic, powerlifting, fixed and specialty bars.",
    meta:
      "Commercial barbells for gyms: Olympic and powerlifting bars, fixed rubber and urethane barbell sets, EZ curl and specialty bars, in full ranges.",
    about:
      "<p>A barbell is the piece of equipment a gym is judged on fastest. Knurl, spin and finish are what a lifter notices in the first rep, and they are the difference between a bar that stays on the floor for a decade and one that is replaced in two years.</p>" +
      "<p>The range covers Olympic bars for general floors, powerlifting bars for strength clubs, and the specialty bars — trap, safety squat, EZ curl — that a well-equipped floor keeps in ones and twos. Fixed barbells are here as complete ranges in both rubber and urethane, so a club can buy a full set that racks together and matches.</p>" +
      "<p>Fixed bar sets need their storage planned at the same time. The racks are under Equipment Storage, and a set ordered without one ends up on the floor.</p>",
  },
  {
    category: "weightlifting",
    slug: "weight-plates",
    erpSubgroup: "Weight Plates",
    seoTitle: "Weight Plates | Bumper, Urethane & Competition",
    label: "Weight Plates",
    blurb: "Bumper, rubber, urethane and competition plates.",
    meta:
      "Commercial weight plates: bumper, rubber-coated, urethane and competition plates in full weight ranges for gym fitouts and strength floors.",
    about:
      "<p>Plates are bought by the tonne and chosen on how they behave when dropped. Bumper plates are for platforms and Olympic lifting, where the plate has to take a drop from overhead and not destroy the floor underneath it. Rubber and urethane plates suit general floors, where the priority is a plate that survives being racked, dropped a short distance, and handled all day.</p>" +
      "<p>The range runs the full weight sequence in each type, so a club can buy a consistent set rather than assembling one from what was available. Colour-coded competition plates are here for platforms that host lifting.</p>" +
      "<p>Plate storage is not an afterthought — loose plates are the most common trip hazard in a gym. Plan the trees and racks under Equipment Storage into the same order.</p>",
  },
  {
    category: "weightlifting",
    slug: "weightlifting-accessories",
    erpSubgroup: "Weightlifting Accessories",
    label: "Weightlifting Accessories",
    blurb: "Collars, belts, straps and platform hardware.",
    meta:
      "Weightlifting accessories for commercial gyms: barbell collars, lifting belts, straps, chalk storage and the small hardware a strength floor runs on.",
    about:
      "<p>Accessories are what make a strength floor usable rather than merely equipped. Collars that actually hold, somewhere for chalk to live, and belts available at the platform are the details members notice even when they could not name them.</p>" +
      "<p>The range covers barbell collars, lifting belts and straps, and the hardware that goes with a platform. These are consumable items in a commercial setting — collars in particular disappear — so they are worth ordering in depth rather than in ones.</p>" +
      "<p>If you are fitting a lifting area from scratch, order the accessories with the bars and plates. They are the cheapest part of the order and the part whose absence is noticed first.</p>",
  },

  // ---- Rigs & Racks -------------------------------------------------------
  {
    category: "rigs-racks",
    slug: "squat-and-power-racks",
    erpSubgroup: "Squat & Power Racks",
    label: "Squat & Power Racks",
    blurb: "Squat stands, half racks, power racks and rigs.",
    meta:
      "Commercial squat and power racks for gyms: squat stands, half racks, full power racks and multi-station rigs, with attachments and custom branding.",
    about:
      "<p>The rack is the anchor of a strength floor: it sets the layout, it decides how many people can lift at once, and it is the hardest thing to move once the rubber is down. Getting the type right at the planning stage matters more than any other equipment decision in the room.</p>" +
      "<p>Squat stands suit tight floors and studios. Half racks give storage and a pull-up bar without a full footprint. Power racks give the safety of full-length uprights for unsupervised lifting. Rigs put several stations on one structure and are the efficient answer once you need more than about three.</p>" +
      "<p>Racks are built to be branded, and a rig is usually the piece a club puts its own name on. Attachments are listed separately so a rack can be specified with exactly the arms, bars and storage it needs.</p>",
  },
  {
    category: "rigs-racks",
    slug: "attachments",
    erpSubgroup: "Attachments",
    label: "Rack Attachments",
    blurb: "Arms, bars, storage and add-ons for racks and rigs.",
    meta:
      "Attachments for commercial racks and rigs: spotter arms, dip bars, landmines, storage horns, pull-up bars and the add-ons that extend a rack's use.",
    about:
      "<p>An attachment is the cheapest way to add a station. A rack that already occupies the floor can gain a dip station, a landmine, a set of spotter arms or plate storage without taking another square metre, which is why a well-specified rig usually carries more attachments than the operator originally planned.</p>" +
      "<p>The range covers safety and spotting hardware, pressing and pulling add-ons, and the storage horns that keep plates off the floor beside the rack.</p>" +
      "<p>Attachments are not universal. Upright profile and hole spacing decide what fits, so tell us the rack you are fitting to — or order both together — rather than matching by eye.</p>",
  },

  // ---- Cardio -------------------------------------------------------------
  {
    category: "cardio",
    slug: "bikes",
    erpSubgroup: "Bikes",
    seoTitle: "Exercise Bikes | Air, Magnetic & Studio Bikes",
    label: "Exercise Bikes",
    blurb: "Air, magnetic and studio bikes.",
    meta:
      "Commercial exercise bikes for gyms and studios: air bikes, magnetic resistance bikes and indoor cycling bikes built for continuous class use.",
    about:
      "<p>Bikes divide by what they are for. An air bike is a conditioning tool — resistance rises with effort, so it punishes hard intervals and suits functional floors and circuit classes. A magnetic bike gives a set, repeatable resistance, which is what a rehabilitation or general cardio floor wants. A studio bike is built around a class: flywheel feel, quick adjustment, and a frame that survives being set up by a different rider every hour.</p>" +
      "<p>Class use is the harder duty by a distance. A bike on a studio floor is ridden hard, adjusted constantly and cleaned daily, and the frames here are chosen for that rather than for a home gym's duty cycle.</p>" +
      "<p>Tell us the class format and we will tell you which of the three you actually want.</p>",
  },
  {
    category: "cardio",
    slug: "rowers",
    erpSubgroup: "Rowers",
    seoTitle: "Rowing Machines | Air & Water Rowers for Gyms",
    label: "Rowing Machines",
    blurb: "Air and water rowers for studios and gym floors.",
    meta:
      "Commercial rowing machines for gyms and studios: air and water resistance rowers built for class use, conditioning circuits and continuous duty.",
    about:
      "<p>The rower is the most-programmed machine in group training, which makes duty cycle the whole question. A rower in a class format is used in short, hard bursts by a new person every few minutes, and the parts that fail are the seat rollers, the handle and the chain or strap — not the frame.</p>" +
      "<p>Air rowers give resistance proportional to effort and are the standard for conditioning and competition formats. Water rowers give a smoother catch and a quieter room, which matters in a studio where a coach has to be heard.</p>" +
      "<p>Rowers are usually bought in rows of several. Order the floor protection with them: a bank of rowers on bare concrete is loud and moves.</p>",
  },
  {
    category: "cardio",
    slug: "ski-trainer",
    erpSubgroup: "Ski Trainer",
    seoTitle: "Ski Trainers | Upper-Body Conditioning Machines",
    label: "Ski Trainers",
    blurb: "Upper-body conditioning machines.",
    meta:
      "Commercial ski trainers for gyms and functional floors: upright upper-body conditioning machines for class formats and interval training.",
    about:
      "<p>A ski trainer covers the movement no other cardio machine does — standing, double-pole, upper body and trunk — which is why functional floors keep them beside the rowers and bikes rather than instead of them.</p>" +
      "<p>They also take up very little floor, since the working envelope is vertical. Where a rower needs a long lane, a ski trainer needs a spot and clear space overhead, so they suit floors that have run out of length but not area.</p>" +
      "<p>They are most often bought in pairs or banks for class formats. If that is the plan, check the mounting option: a wall or rig-mounted unit frees the floor entirely.</p>",
  },

  // ---- Mixed Implements ---------------------------------------------------
  {
    category: "mixed-implements",
    slug: "dumbbells",
    erpSubgroup: "Dumbbells",
    seoTitle: "Dumbbells | Rubber Hex, Urethane & Studio Sets",
    label: "Dumbbells",
    blurb: "Rubber hex, urethane and studio dumbbell ranges.",
    meta:
      "Commercial dumbbells for gyms: rubber hex, urethane and studio ranges in full weight sets, with matching racks for club and studio fitouts.",
    about:
      "<p>Dumbbells are bought as a range, not as a product. A commercial floor needs the whole sequence, in matching finish, with enough of the light and middle weights that a class or a busy evening does not strip the rack.</p>" +
      "<p>Rubber hex is the workhorse: it does not roll, it survives being dropped, and it is the most forgiving of a floor that gets used hard. Urethane costs more and holds its appearance far longer, which is why it tends to go into premium clubs and anywhere the dumbbell rack is visible from reception. Studio sets suit class formats where the weights are light, handled constantly and stored in a small space.</p>" +
      "<p>Order the rack with the set. A dumbbell range without its storage is a floor hazard on day one — the racks are under Equipment Storage.</p>",
  },
  {
    category: "mixed-implements",
    slug: "kettlebells",
    erpSubgroup: "Kettlebells",
    seoTitle: "Kettlebells | Cast, Competition & Coated",
    label: "Kettlebells",
    blurb: "Cast, competition and coated kettlebell ranges.",
    meta:
      "Commercial kettlebells for gyms and studios: cast iron, competition and coated ranges in full weight sequences, with storage to match.",
    about:
      "<p>Kettlebells split into two families and mixing them without meaning to is the common mistake. Cast and coated bells grow in size as they grow in weight, which is what most gym floors and class formats want. Competition bells keep one shell size across the whole range, so the handle and the body feel identical from the lightest to the heaviest — which is what a lifter training technique needs, and what a club running certifications should buy.</p>" +
      "<p>Coatings decide how they behave on your floor and in your hands. A coated bell is kinder to flooring and to chalked hands; bare cast is the traditional feel and the cheaper option.</p>" +
      "<p>Buy the full sequence rather than the popular weights. A range with gaps in it gets used around the gaps.</p>",
  },
  {
    category: "mixed-implements",
    slug: "dead-balls",
    erpSubgroup: "Dead Balls",
    seoTitle: "Dead Balls | Non-Bouncing Slam & Carry Balls",
    label: "Dead Balls",
    blurb: "Non-bouncing slam and carry balls.",
    meta:
      "Commercial dead balls and slam balls for functional gyms: non-bouncing balls for slams, carries and throws, in full weight ranges.",
    about:
      "<p>A dead ball does not bounce, and that is the whole point of it. It can be slammed from overhead, dropped, thrown and carried without coming back at the person who threw it or at anyone nearby, which is what makes it safe to programme in a room full of people.</p>" +
      "<p>They are among the hardest-used items in functional training, so the seam and the shell are what to judge. A dead ball that splits is a mess and a write-off rather than a repair.</p>" +
      "<p>They suit turf lanes and sled tracks more than rubber flooring, since carries and throws want a surface with some give. The turf is under Flooring.</p>",
  },
  {
    category: "mixed-implements",
    slug: "wall-balls",
    erpSubgroup: "Wall Balls",
    seoTitle: "Wall Balls | Soft-Shell Balls for Throws",
    label: "Wall Balls",
    blurb: "Soft-shell balls for throws and targets.",
    meta:
      "Commercial wall balls for functional gyms and class formats: soft-shell medicine balls for wall throws, in the standard weight range.",
    about:
      "<p>A wall ball is a soft, oversized medicine ball built to be thrown at a target and caught repeatedly. The shell has to absorb the catch without hurting hands and without hardening over a season of daily use — which is where cheap ones fail, usually by going lumpy rather than by bursting.</p>" +
      "<p>They are bought in quantity, because a class format needs one per person and the standard weights get used far harder than the outliers.</p>" +
      "<p>Plan the target line with them. A rig with target brackets, or a marked wall, turns a scattered group of throwers into a lane that a coach can supervise.</p>",
  },
  {
    category: "mixed-implements",
    slug: "group-fitness",
    erpSubgroup: "Group Fitness",
    label: "Group Fitness Equipment",
    blurb: "Steps, bars, tubes and studio class kit.",
    meta:
      "Group fitness equipment for studios and clubs: steps, weighted bars, body pump sets, tubing and the class kit a timetabled studio runs on.",
    about:
      "<p>Group fitness equipment is bought by the class, not by the piece. Whatever is on the timetable needs enough sets for a full room, in weights that suit the least experienced person in it, and it all has to stack away between sessions.</p>" +
      "<p>The range covers steps, weighted bars and sets, tubing and the small kit that class formats are built around. Storage is part of the specification rather than an accessory: a studio that cannot be cleared in five minutes cannot run back-to-back classes.</p>" +
      "<p>Tell us the formats on your timetable and the room size and we will work out the quantities, which is usually the part that gets underestimated.</p>",
  },

  // ---- Body Weight --------------------------------------------------------
  {
    category: "body-weight",
    slug: "plyometric-boxes",
    erpSubgroup: "Plyometric Boxes",
    label: "Plyometric Boxes",
    blurb: "Foam, timber and steel jump boxes.",
    meta:
      "Commercial plyometric boxes for gyms: foam, timber and steel jump boxes in stackable and multi-height forms for class and functional training.",
    about:
      "<p>Box choice is a safety decision before it is anything else. A foam box will not open a shin when a jump is missed, which is why it has become the default for class formats and general membership floors. Timber and steel boxes are more stable under step-ups, carries and heavier athletes, and they take a beating for longer.</p>" +
      "<p>Multi-height boxes give three heights in one unit by turning them over, which is the efficient answer where storage is short or where a class needs several heights at once.</p>" +
      "<p>Boxes get stacked and dragged all day. If they will live in a class studio, plan where they stack — a stack in a walkway is the most common avoidable hazard in a functional room.</p>",
  },
  {
    category: "body-weight",
    slug: "resistance-and-power-bands",
    erpSubgroup: "Resistance & Power Bands",
    label: "Resistance & Power Bands",
    blurb: "Loop bands, power bands and tubing.",
    meta:
      "Resistance and power bands for commercial gyms: loop bands, heavy power bands and tubing for warm-ups, assistance work and accommodating resistance.",
    about:
      "<p>Bands do three unrelated jobs and it is worth knowing which one you are buying for. Light loop bands are warm-up and activation kit, used in quantity by classes and physiotherapy. Heavy power bands are for assisted pull-ups and accommodating resistance on the rack. Tubing with handles is general resistance work for studio and rehabilitation settings.</p>" +
      "<p>They are consumables. Bands are the item most often walked out of a gym and they perish with use and sunlight, so they are worth ordering in depth and replacing on a schedule rather than when one snaps.</p>" +
      "<p>Where they will be used on a rack, check the anchor points at the same time — the attachments are under Rigs &amp; Racks.</p>",
  },
  {
    category: "body-weight",
    slug: "speed-and-agility",
    erpSubgroup: "Speed & Agility",
    seoTitle: "Speed & Agility | Ladders, Hurdles, Cones & Sleds",
    label: "Speed & Agility",
    blurb: "Ladders, hurdles, cones, sleds and markers.",
    meta:
      "Speed and agility equipment for gyms and sports clubs: agility ladders, hurdles, cones, markers and sled work for conditioning and team training.",
    about:
      "<p>Speed and agility kit is the cheapest equipment in a gym and the most likely to define what a functional floor can actually programme. A turf lane with ladders, hurdles and markers gives a coach a dozen formats that a room of machines cannot.</p>" +
      "<p>The range covers ladders and hurdles for footwork, cones and markers for layout, and the drag and push work a conditioning session is built around.</p>" +
      "<p>All of it wants a surface. If you are building a lane rather than buying loose kit, the turf and sled tracks are under Flooring and should be ordered together — the surface decides what the kit can do.</p>",
  },
  {
    category: "body-weight",
    slug: "core-training",
    erpSubgroup: "Core Training",
    seoTitle: "Core Training | Ab Wheels, Mats & Core Benches",
    label: "Core Training",
    blurb: "Ab wheels, mats, benches and core kit.",
    meta:
      "Core training equipment for commercial gyms: ab wheels, mats, core benches and the accessories a stretching and core area is built from.",
    about:
      "<p>Most gyms end up with a core and stretching area whether they planned one or not, because members create it in whatever corner has floor space. Equipping it deliberately is cheap and it keeps that activity out of the walkways.</p>" +
      "<p>The range covers the small kit a core area runs on — wheels, mats and the benches that support extension and flexion work.</p>" +
      "<p>The one thing to plan is floor. A core area is used at ground level, so it wants a surface people are willing to lie on and enough of it that two members are not in each other's way. Matting is listed here and under Flooring.</p>",
  },
  {
    category: "body-weight",
    slug: "balance-and-stability",
    erpSubgroup: "Balance & Stability",
    label: "Balance & Stability",
    blurb: "Balance boards, domes and stability trainers.",
    meta:
      "Balance and stability equipment for gyms and clinics: balance boards, stability domes and trainers for rehabilitation, conditioning and class use.",
    about:
      "<p>Balance equipment earns its place through who uses it rather than how often. It is the bridge between rehabilitation and general training, which makes it essential kit for clubs with a physiotherapy relationship, an older membership, or a class timetable that includes anything restorative.</p>" +
      "<p>The range covers boards, domes and stability trainers. All of it is light, stackable and used at floor level, so it stores easily and suits studios that have to be cleared between sessions.</p>" +
      "<p>It pairs with the core and matting ranges rather than standing alone — a stability area with nowhere comfortable to kneel does not get used.</p>",
  },
  {
    // TWO CARDS, AND ON THE LIST ANYWAY. This is the URL the whole subcategory
    // structure was found through: /equipment/body-weight/gymnastics ranks 44-45
    // for "wooden gymnastic rings" and "wooden gym rings", 160 searches a month
    // between them and both climbing, on a URL that has answered 404 or a
    // redirect since the cutover. A page with two products and a real reason to
    // exist is not a doorway page; thin copy is what makes one. See the header.
    category: "body-weight",
    slug: "gymnastics",
    erpSubgroup: "Gymnastics",
    seoTitle: "Gymnastics | Rings, Bars & Suspension Training",
    label: "Gymnastics",
    blurb: "Rings, bars and suspension for bodyweight training.",
    meta:
      "Gymnastic equipment for commercial gyms: wooden and composite gym rings, straps and bodyweight training hardware for rigs and functional floors.",
    about:
      "<p>Gymnastic rings turn a rig into a bodyweight station that covers pulling, pressing and core in one piece of hardware costing a fraction of a machine. That ratio is why they are standard in functional gyms and increasingly common in general clubs.</p>" +
      "<p>Wooden rings are the traditional choice and the better grip, particularly with chalk; composite rings survive outdoor and high-humidity settings that would eventually spoil timber. Both hang from the same straps and buckles, so the choice is grip and setting rather than capability.</p>" +
      "<p>What matters more than the rings is what they hang from. Ring work needs clear height and a structure rated for dynamic load — check the rig or ceiling mount before ordering, and ask us if you are unsure what yours will take.</p>",
  },

  // ---- Equipment Storage --------------------------------------------------
  {
    category: "equipment-storage",
    slug: "freestanding",
    erpSubgroup: "Freestanding",
    label: "Freestanding Storage",
    blurb: "Dumbbell racks, plate trees and ball storage.",
    meta:
      "Freestanding gym storage: dumbbell racks, barbell and plate trees, kettlebell shelving and ball storage for commercial floors and studios.",
    about:
      "<p>Storage is what separates a gym floor that looks run from one that does not, and it is the line item most often cut from a fitout and regretted within a month. Loose plates and dumbbells are the most common cause of both injury claims and equipment damage.</p>" +
      "<p>Freestanding units go where the equipment is used, which is their advantage over wall-mounted storage: a dumbbell rack belongs beside the benches, not at the edge of the room. The range covers dumbbell racks, barbell and plate trees, kettlebell shelving and ball storage.</p>" +
      "<p>Buy storage with the equipment it holds, sized for the full range rather than for what is on the floor today. A rack that is already full has nowhere to put the next order.</p>",
  },
  {
    category: "equipment-storage",
    slug: "wall-mounted",
    erpSubgroup: "Wall Mounted",
    label: "Wall Mounted Storage",
    blurb: "Racks and shelving that free the floor.",
    meta:
      "Wall mounted gym storage: barbell holders, plate and accessory racks and shelving that keep equipment off the floor in tight commercial spaces.",
    about:
      "<p>Wall-mounted storage buys back the one thing a studio cannot order more of. A vertical barbell holder, a wall plate rack or a shelf of accessories takes no usable floor at all, which is why tight rooms and boutique studios use it for everything they can.</p>" +
      "<p>The range covers barbell and plate holders, accessory racks and shelving.</p>" +
      "<p>The constraint is the wall, not the rack. Loaded storage puts real force into a fixing, and a plasterboard or tilt-slab wall may need backing or a freestanding alternative instead. Check the wall build before ordering, and tell us if you are not sure what you have — the freestanding range covers the same equipment where a wall will not.</p>",
  },

  // ---- Flooring -----------------------------------------------------------
  {
    category: "flooring",
    slug: "astro-turf-sled-tracks",
    erpSubgroup: "Astro Turf/Sled Tracks",
    label: "Turf & Sled Tracks",
    blurb: "Artificial turf lanes for sleds, carries and conditioning.",
    meta:
      "Gym turf and sled tracks: artificial turf lanes for sled pushes, carries, prowler work and functional conditioning in commercial fitouts.",
    about:
      "<p>A turf lane is the single addition that turns a strength floor into a functional one. It gives sleds a surface to run on, carries and crawls somewhere to happen, and a coach a defined lane to run a class down instead of improvising around the machines.</p>" +
      "<p>Turf also changes how a room sounds and looks. It absorbs noise that rubber reflects and it visually marks the functional zone, which is why it usually ends up in the photographs of a finished fitout.</p>" +
      "<p>The lane length is the decision, not the turf. Sleds need a usable run and the mistake is fitting a lane that is too short to programme. Send us the room dimensions and we will tell you what run you can get out of it before anything is ordered.</p>",
  },
];

const BY_PATH = new Map(subcategories.map((s) => [`${s.category}/${s.slug}`, s]));

/** The subcategory at /equipment/<category>/<slug>, or none. */
export function getSubcategory(category: string, slug: string): Subcategory | undefined {
  return BY_PATH.get(`${category}/${slug}`);
}

/** Every subcategory page under a category, in the order written. */
export function subcategoriesOf(category: string): Subcategory[] {
  return subcategories.filter((s) => s.category === category);
}
