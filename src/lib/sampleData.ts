import type { Project } from "./types";

// Sample project, modelled on the Venetoclax / BCL-2 example in the Branchly
// overview. Swap this out later for data coming from a database or the AI.

export const sampleProject: Project = {
  title: "Venetoclax / BCL-2 Hypothesis Validation",
  nodes: [
    {
      id: "root",
      parentId: null,
      kind: "root",
      status: "untested",
      title:
        "Venetoclax kills CLL cells because BCL-2 marks a venetoclax-sensitive cell state and venetoclax binding to BCL-2 directly triggers apoptosis in those cells.",
      evidence: [
        {
          text: "Venetoclax (ABT-199) is a potent, selective BCL-2 inhibitor that kills CLL cells while sparing platelets.",
          citation: "Souers et al., 2013, Nature Medicine",
        },
        {
          text: "CLL cells depend on BCL-2 to hold back the pro-death protein BIM.",
          citation: "Del Gaizo Moore et al., 2007, J. Clin. Invest.",
        },
        {
          text: "Venetoclax produced high response rates in patients with relapsed CLL.",
          citation: "Roberts et al., 2016, NEJM",
        },
      ],
    },

    // ── Branch 1: what must be true ─────────────────────────────────────────
    {
      id: "h1",
      parentId: "root",
      kind: "hypothesis",
      status: "untested",
      lens: "What must be true",
      confidence: 0.85,
      title:
        "BCL-2 dependence is associated with the CLL cells that are sensitive to venetoclax.",
      rationale:
        "If BCL-2 marks the sensitive cell state, sensitivity should track how strongly cells depend on BCL-2. This is a necessary condition of the parent idea.",
      evidence: [
        {
          text: "Mitochondrial priming measured by BH3 profiling correlates with clinical response to chemotherapy.",
          citation: "Ni Chonghaile et al., 2011, Science",
        },
      ],
    },
    {
      id: "h1a",
      parentId: "h1",
      kind: "hypothesis",
      status: "supported",
      lens: "What must be true",
      confidence: 0.8,
      title:
        "Patients whose CLL cells show high mitochondrial priming (measured by BIM BH3 peptide) achieve deeper clinical responses to venetoclax than patients with low priming.",
      rationale:
        "BH3 profiling directly measures how close cells are to the apoptotic threshold, a readout of BCL-2 dependence.",
      evidence: [
        {
          text: "BH3 profiling identifies cancers that are 'primed for death' and likely to respond to BH3 mimetics.",
          citation: "Letai, 2008, Nature Reviews Cancer",
        },
      ],
    },
    {
      id: "e1a",
      parentId: "h1a",
      kind: "experiment",
      status: "supported",
      confidence: 0.75,
      title: "BH3 profiling of patient-derived CLL cells",
      rationale:
        "Comparing priming with each patient's real response tests the claim directly in human samples.",
      goal: "Check whether higher priming predicts deeper response to venetoclax.",
      steps: [
        "Collect CLL cells from 40 patients before treatment",
        "Run BIM BH3 profiling on each sample",
        "Match priming scores to clinical response at 12 months",
      ],
      expectedResult:
        "Patients with deeper responses have higher BIM-induced mitochondrial depolarization.",
      evidence: [],
      result: {
        notes:
          "Complete responders had a median priming of 68% vs 31% in partial responders (p < 0.01).",
        files: ["bh3_profiling_cohort.csv", "priming_vs_response.png"],
        interpretation:
          "The result is in line with the expected pattern: higher priming went with deeper response. This supports the idea that BCL-2 dependence marks sensitive cells. Still unclear: whether priming adds information beyond standard risk markers.",
        outcome: "supported",
        recordedAt: "2026-08-14",
      },
    },
    {
      id: "h1b",
      parentId: "h1",
      kind: "hypothesis",
      status: "contradicted",
      lens: "What else could explain it",
      confidence: 0.55,
      title:
        "Standard ex vivo cell viability LC50 values do not predict in vivo clinical response, while BH3 profiling does.",
      rationale:
        "If BH3 profiling captures something specific about BCL-2 dependence, a generic viability assay should do worse at predicting response.",
      evidence: [
        {
          text: "Short-term viability assays often fail to capture the dynamics of apoptosis in patients.",
          citation: "Montero & Letai, 2018, Cell Death & Differentiation",
        },
      ],
    },
    {
      id: "e1b",
      parentId: "h1b",
      kind: "experiment",
      status: "contradicted",
      confidence: 0.6,
      title: "In vitro 24h cytotoxicity (LC50) vs clinical response",
      rationale:
        "Head-to-head comparison of the two assays on the same patient samples.",
      goal: "Compare how well LC50 and BH3 priming predict clinical response.",
      steps: [
        "Treat each patient sample with a venetoclax dose range for 24 h",
        "Calculate the LC50 for each sample",
        "Correlate LC50 and BH3 priming with clinical response",
      ],
      expectedResult:
        "BH3 priming correlates with response; LC50 does not.",
      evidence: [],
      result: {
        notes:
          "LC50 predicted clinical response about as well as BH3 priming (r = 0.71 vs r = 0.68).",
        files: ["lc50_vs_response.xlsx"],
        interpretation:
          "This goes against the hypothesis: the generic viability assay was as predictive as BH3 profiling. Rather than a failure, this is a clue. Both assays may be reading the same underlying BCL-2 dependence. I've suggested three new ideas below.",
        outcome: "contradicted",
        recordedAt: "2026-08-21",
      },
    },
    {
      id: "s1",
      parentId: "e1b",
      kind: "suggestion",
      status: "untested",
      lens: "What else could explain it",
      confidence: 0.7,
      title:
        "LC50 and BH3 priming both read out the same underlying BCL-2 dependence, so either can predict response.",
      rationale:
        "The two assays agreed closely. If they measure the same thing, that strengthens (rather than weakens) the parent idea that BCL-2 dependence marks sensitive cells.",
      evidence: [
        {
          text: "Venetoclax sensitivity in vitro closely tracks BCL-2:BIM complex levels.",
          citation: "Del Gaizo Moore et al., 2007, J. Clin. Invest.",
        },
      ],
      proposedExperiment: {
        title: "LC50 and BH3 priming after BCL-2 knockdown",
        goal: "Test whether both readouts shift together when BCL-2 dependence is reduced.",
        steps: [
          "Knock down BCL-2 in primary CLL cells",
          "Measure LC50 and BH3 priming before and after",
          "Compare the size of the change in both readouts",
        ],
        expectedResult:
          "Both LC50 and priming shift by a similar amount after knockdown.",
      },
    },
    {
      id: "s2",
      parentId: "e1b",
      kind: "suggestion",
      status: "untested",
      lens: "When might it not hold",
      confidence: 0.5,
      title:
        "A 24 h window only captures early apoptosis; the difference between assays appears at 72 h.",
      rationale:
        "Timing can hide real differences. Slower-dying cells may only separate the two assays at later time points.",
      evidence: [],
      proposedExperiment: {
        title: "Repeat LC50 at 24 h, 48 h and 72 h",
        goal: "See if LC50 loses predictive power at later time points.",
        steps: [
          "Run the same dose range on the same samples",
          "Measure viability at 24, 48 and 72 h",
          "Re-run the correlation with clinical response at each time",
        ],
        expectedResult:
          "LC50 correlation with response drops at 72 h while BH3 priming stays stable.",
      },
    },
    {
      id: "s3",
      parentId: "e1b",
      kind: "suggestion",
      status: "untested",
      lens: "What else could explain it",
      confidence: 0.4,
      title:
        "The cohort lacked low-priming patients, so the two assays could not be told apart.",
      rationale:
        "If almost every sample was highly primed, both assays would look predictive simply because there was little variation to separate.",
      evidence: [],
      proposedExperiment: {
        title: "Enrich the cohort for low-priming samples",
        goal: "Check whether the assays diverge once low-priming patients are included.",
        steps: [
          "Add 15 samples from patients with known low priming",
          "Run both assays on the expanded cohort",
          "Compare correlations with clinical response",
        ],
        expectedResult:
          "In the expanded cohort, BH3 priming predicts response better than LC50.",
      },
    },

    // ── Branch 2: direct mechanism ──────────────────────────────────────────
    {
      id: "h2",
      parentId: "root",
      kind: "hypothesis",
      status: "untested",
      lens: "What could cause it",
      confidence: 0.92,
      title:
        "Venetoclax acts directly through BCL-2 binding, not indirectly through TP53 or other apoptotic pathways.",
      rationale:
        "The parent idea claims binding to BCL-2 directly triggers death. That needs ruling out the main indirect route: TP53-driven apoptosis.",
      evidence: [
        {
          text: "Venetoclax binds the BH3 groove of BCL-2 with sub-nanomolar affinity.",
          citation: "Souers et al., 2013, Nature Medicine",
        },
      ],
    },
    {
      id: "h2a",
      parentId: "h2",
      kind: "hypothesis",
      status: "untested",
      lens: "What must be true",
      confidence: 0.85,
      title:
        "Venetoclax sensitivity in CLL is preserved in cells lacking functional TP53 (del(17p) or TP53 mutation).",
      rationale:
        "If the drug works directly through BCL-2, losing TP53 should not protect the cells.",
      evidence: [
        {
          text: "Venetoclax induces rapid apoptosis of CLL cells in patients via a TP53-independent mechanism.",
          citation: "Anderson et al., 2016, Blood",
        },
        {
          text: "Venetoclax was active in relapsed CLL with 17p deletion.",
          citation: "Stilgenbauer et al., 2016, Lancet Oncology",
        },
      ],
    },
    {
      id: "e2a",
      parentId: "h2a",
      kind: "experiment",
      status: "planned",
      confidence: 0.8,
      title: "TP53 dependency assay (primary, mouse, CRISPR-KO RS4;11)",
      rationale:
        "Removing TP53 in a clean genetic background isolates its contribution.",
      goal: "Test whether venetoclax kills cells equally with and without TP53.",
      steps: [
        "Knock out TP53 in RS4;11 cells with CRISPR",
        "Treat wild-type and knockout cells with venetoclax",
        "Repeat in primary del(17p) CLL samples",
      ],
      expectedResult:
        "Similar killing in TP53-knockout and wild-type cells.",
      evidence: [],
    },

    // ── Branch 3: how the cells die ─────────────────────────────────────────
    {
      id: "h3",
      parentId: "root",
      kind: "hypothesis",
      status: "untested",
      lens: "What could cause it",
      confidence: 0.75,
      title:
        "Once venetoclax binds BCL-2-dependent cells, those cells die through the mitochondrial apoptosis pathway.",
      rationale:
        "BCL-2 controls mitochondrial apoptosis, so this is the expected route of death if the mechanism is direct.",
      evidence: [
        {
          text: "BCL-2 family proteins govern mitochondrial outer membrane permeabilization.",
          citation: "Czabotar et al., 2014, Nat. Rev. Mol. Cell Biol.",
        },
      ],
    },
    {
      id: "h3a",
      parentId: "h3",
      kind: "hypothesis",
      status: "untested",
      lens: "What must be true",
      confidence: 0.7,
      title:
        "Venetoclax-treated CLL cells show phosphatidylserine exposure within 6–24 hours of in vivo dosing, consistent with rapid apoptosis.",
      rationale:
        "Direct mitochondrial apoptosis is fast. Early apoptotic markers should appear within hours, not days.",
      evidence: [
        {
          text: "Rapid onset apoptosis observed within 8 hours of the first venetoclax dose.",
          citation: "Anderson et al., 2016, Blood",
        },
      ],
    },
    {
      id: "e3a",
      parentId: "h3a",
      kind: "experiment",
      status: "planned",
      confidence: 0.7,
      title: "In vivo apoptosis time-course (single-dose pharmacodynamic study)",
      rationale: "Measures the timing of cell death in patients directly.",
      goal: "Measure when apoptotic markers appear after one dose.",
      steps: [
        "Take blood samples at 0, 6, 12 and 24 h after the first dose",
        "Stain CLL cells for Annexin V",
        "Plot % apoptotic cells over time",
      ],
      expectedResult: "Clear rise in Annexin V+ cells by 6–24 h.",
      evidence: [],
    },

    // ── Branch 4: alternative explanation ───────────────────────────────────
    {
      id: "h4",
      parentId: "root",
      kind: "hypothesis",
      status: "untested",
      lens: "What else could explain it",
      confidence: 0.6,
      title:
        "The pattern is not explained only by general cytotoxicity or unrelated factors.",
      rationale:
        "Rules out the simplest competing explanation: that venetoclax is just generally toxic.",
      evidence: [],
    },
    {
      id: "h4a",
      parentId: "h4",
      kind: "hypothesis",
      status: "untested",
      lens: "What must be true",
      confidence: 0.65,
      title:
        "Venetoclax-induced CLL cell death is blocked by pan-caspase inhibitor qVD.OPh, confirming a caspase-dependent apoptotic mechanism.",
      rationale:
        "General toxicity would kill cells regardless of caspases; apoptosis would not.",
      evidence: [],
    },
    {
      id: "e4a",
      parentId: "h4a",
      kind: "experiment",
      status: "planned",
      confidence: 0.65,
      title: "Pan-caspase inhibition (qVD.OPh) rescue assay",
      rationale: "A standard way to tell apoptosis apart from other cell death.",
      goal: "Check whether blocking caspases prevents venetoclax-induced death.",
      steps: [
        "Pre-treat CLL cells with qVD.OPh for 1 h",
        "Add venetoclax at the LC50 dose",
        "Measure viability after 24 h",
      ],
      expectedResult: "qVD.OPh largely rescues the cells from venetoclax.",
      evidence: [],
    },
  ],
};
