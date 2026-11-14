"""Field profile: cancer cell death (hackathon MVP subfield of cancer & cell biology).

Same sources and two-layer design as cancer_cell_bio (bioRxiv frontier + the published papers
it cites), restricted to preprints that study or measure regulated cell death: apoptosis and
the BCL-2 family, death receptors, ferroptosis, necroptosis, pyroptosis and resistance to them.
"""
import re

from fields.cancer_cell_bio import (  # noqa: F401  (same sources, ids and links)
    BIORXIV_CATEGORIES, FOUNDATION_MIN_CITES, HISTORY_START, PREPRINT_PREFIXES, paper_url, ref_key, s2_id,
)

NAME = "Cancer Cell Death"
SLUG = "cell_death"
SOURCE = "biorxiv"
COVERAGE = ("bioRxiv cancer, cell biology and pharmacology preprints on regulated cell death since "
            "Nov 2024, plus the published papers they cite")
DEFAULT_PORT = 8766

_SUBFIELD = re.compile(
    r"apopto\w+|\bbcl-?2\b|\bbcl-?xl\b|\bmcl-?1\b|\bbh3\b|venetoclax|navitoclax|caspase\w*|ferropto\w+|"
    r"\bgpx4\b|necropto\w+|\bripk[13]\b|\bmlkl\b|pyropto\w+|gasdermin\w*|cell death|\bbax\b|\bbak\b|"
    r"\bpuma\b|\bnoxa\b|cuproptosis|parthanatos|anoikis", re.I)


def is_relevant(title, abstract):
    return bool(_SUBFIELD.search(f"{title} {abstract}"))


BRANCHES = [
    {"id": "bcl2", "label": "BCL-2 Family & BH3 Mimetics",
     "desc": "intrinsic apoptosis, BCL-2/BCL-XL/MCL-1, BH3-only proteins, venetoclax and other BH3 mimetics, MOMP",
     "keywords": [r"\bbcl-?2\b", r"\bbcl-?xl\b", r"\bmcl-?1\b", r"\bbh3\b", r"venetoclax|navitoclax|bh3 mimetic\w*",
                  r"\bbax\b|\bbak\b", r"\bbim\b|\bpuma\b|\bnoxa\b", r"momp|outer membrane permeabili\w+|cytochrome c"],
     "roots": []},
    {"id": "extrinsic", "label": "Death Receptors & Caspases",
     "desc": "extrinsic apoptosis: TRAIL, Fas and TNF receptors, caspase-8 and executioner caspases, IAPs and SMAC mimetics",
     "keywords": [r"\btrail\b", r"\bfas\b|cd95", r"\btnf\w*", r"death receptor\w*", r"caspase-?8|caspase-?3|caspase-?9",
                  r"\bc-?flip\b|\biaps?\b|\bxiap\b|smac"],
     "roots": []},
    {"id": "ferroptosis", "label": "Ferroptosis & Lipid Peroxidation",
     "desc": "iron-dependent lipid peroxidation death: GPX4, SLC7A11/xCT, ACSL4, FSP1, glutathione",
     "keywords": [r"ferropto\w+", r"\bgpx4\b", r"lipid peroxid\w+", r"\biron\b|ferritin\w*", r"slc7a11|\bxct\b",
                  r"\bacsl4\b|\bfsp1\b", r"glutathione|\bgsh\b"],
     "roots": []},
    {"id": "inflammatory", "label": "Necroptosis, Pyroptosis & Inflammatory Death",
     "desc": "lytic, inflammatory cell death: RIPK1/RIPK3/MLKL, gasdermins, inflammasomes, PANoptosis",
     "keywords": [r"necropto\w+", r"\bripk[13]\b|\bmlkl\b", r"pyropto\w+", r"gasdermin\w*|\bgsdm\w+",
                  r"inflammasome\w*|\bnlrp3\b|caspase-?1\b", r"panopto\w+|\bzbp1\b"],
     "roots": []},
    {"id": "stress", "label": "p53, DNA Damage & Stress-Induced Death",
     "desc": "death triggered by p53, DNA damage, chemotherapy, ER stress and oxidative stress",
     "keywords": [r"\bp53\b|\btp53\b", r"dna damage|genotoxic", r"chemotherap\w+|cisplatin|doxorubicin|etoposide",
                  r"er stress|unfolded protein|\bupr\b", r"oxidative stress|\bros\b|reactive oxygen"],
     "roots": []},
    {"id": "resistance", "label": "Resistance & Evasion of Cell Death",
     "desc": "how cancer cells evade death and become resistant: survival signaling, relapse, persister cells",
     "keywords": [r"resistan\w+", r"evasion|evade\w*", r"relaps\w+|refractory", r"persister\w*",
                  r"survival signal\w*|pro-?survival|anti-?apoptotic"],
     "roots": []},
    {"id": "immune", "label": "Immune Killing & Immunogenic Cell Death",
     "desc": "T and NK cell cytotoxicity, granzyme/perforin, immunogenic cell death, immunotherapy",
     "keywords": [r"immunogenic cell death", r"\bt cells?\b|\bnk cells?\b|cytotoxic", r"granzyme|perforin",
                  r"\bcar-?t\b|immunotherap\w+|checkpoint", r"\bdamps?\b|calreticulin|\bhmgb1\b"],
     "roots": []},
    {"id": "mito", "label": "Autophagy, Mitochondria & Metabolism",
     "desc": "autophagy and mitophagy, mitochondrial function and metabolism in the decision to die",
     "keywords": [r"autophag\w+|mitophag\w+", r"mitochondri\w+", r"metaboli\w+|glycoly\w+|oxphos", r"lysosom\w+",
                  r"cuproptosis|copper"],
     "roots": []},
    {"id": "therapy", "label": "Drug Discovery & Combination Therapy",
     "desc": "inducing death therapeutically: new compounds, degraders, synergy and combination regimens",
     "keywords": [r"combination|synerg\w+", r"inhibitor\w*", r"compound\w*|small[- ]molecule|drug discovery",
                  r"protac\w*|degrader\w*", r"repurpos\w+", r"\bin vivo\b|xenograft"],
     "roots": []},
    {"id": "methods", "label": "Methods, Screens & Models",
     "desc": "measuring cell death: CRISPR screens, imaging, single-cell profiling, organoids and computational models",
     "keywords": [r"crispr screen\w*|genome-wide", r"imaging|microscop\w+|live-cell", r"single-?cell",
                  r"organoid\w*", r"deep learning|machine learning|computational|model\w*", r"\bassay\w*"],
     "roots": []},
]

SURVEY_ROOTS = []
EXTRA_LANDMARKS = []
