"""Field profile: cancer and cell biology.

Two layers, because biology preprints mostly cite journal papers (only ~5-10% of a
cancer preprint's references are other preprints):
  frontier     bioRxiv preprints in the categories below, polled through the day
  foundations  published papers the preprints cite (at least FOUNDATION_MIN_CITES
               times), fetched with abstracts from Semantic Scholar
Papers are identified by lower-case DOI.
"""
NAME = "Cancer & Cell Biology"
SLUG = "cancer_cell_bio"
SOURCE = "biorxiv"
COVERAGE = "bioRxiv cancer biology, cell biology and pharmacology preprints since Nov 2024, plus the published papers they cite"
DEFAULT_PORT = 8766

BIORXIV_CATEGORIES = ["cancer biology", "cell biology", "pharmacology and toxicology"]
HISTORY_START = "2024-11-01"
FOUNDATION_MIN_CITES = 2

PREPRINT_PREFIXES = ("10.1101/", "10.64898/")   # bioRxiv's DOI prefixes (old, new)


def paper_url(pid):
    if pid.startswith(PREPRINT_PREFIXES):
        return f"https://www.biorxiv.org/content/{pid}"
    return f"https://doi.org/{pid}"


def s2_id(pid):
    return f"DOI:{pid}"


def ref_key(external_ids):
    doi = (external_ids or {}).get("DOI")
    return doi.lower() if doi else None


def is_relevant(title, abstract):
    """Everything in the chosen bioRxiv categories is in scope."""
    return True


# ---- Curated top-level branches -------------------------------------------
# keywords: regexes used to seed each branch (weak supervision)
# roots:    landmark paper ids (DOIs); empty -> the branch's most built-on papers are shown
BRANCHES = [
    {
        "id": "death",
        "label": "Cell Death & Apoptosis",
        "desc": "apoptosis, BCL-2 family, caspases, ferroptosis, necroptosis, pyroptosis and other regulated cell death",
        "keywords": [r"apopto\w+", r"\bbcl-?2\b", r"\bbcl-?xl\b", r"\bmcl-?1\b", r"\bbh3\b", r"caspase",
                     r"ferropto\w+", r"necropto\w+", r"pyropto\w+", r"cell death", r"venetoclax", r"\bbax\b|\bbak\b"],
        "roots": [],
    },
    {
        "id": "cycle",
        "label": "Cell Cycle, DNA Damage & Genome Stability",
        "desc": "cell cycle control, mitosis, checkpoints, DNA damage response and repair, replication stress",
        "keywords": [r"cell cycle", r"mitos\w+|mitotic", r"\bcdk\d*\b", r"checkpoint kinase|\bchk1\b|\batr\b|\batm\b",
                     r"dna damage", r"dna repair", r"replication stress", r"\bparp\w*", r"homologous recombination",
                     r"chromosom\w+ instability", r"telomer\w+", r"aneuploid\w+"],
        "roots": [],
    },
    {
        "id": "signaling",
        "label": "Signaling Pathways",
        "desc": "kinase signaling, RAS/MAPK, PI3K/AKT/mTOR, Wnt, Notch, Hippo/YAP, TGF-beta, NF-kB, receptor tyrosine kinases",
        "keywords": [r"\bkras\b|\bnras\b|\bras\b", r"\bmapk\b|\berk\b|\bmek\b", r"\bpi3k\b|\bakt\b|\bmtor\w*",
                     r"\bwnt\b|beta-catenin|β-catenin", r"\bnotch\b", r"\bhippo\b|\byap\b|\btaz\b", r"tgf-?β|tgf-?beta",
                     r"nf-?κb|nf-?kb", r"\begfr\b|\bher2\b|receptor tyrosine kinase", r"phosphorylat\w+", r"signal(l)?ing pathway"],
        "roots": [],
    },
    {
        "id": "immune",
        "label": "Tumor Microenvironment & Immunology",
        "desc": "tumor immune microenvironment, T cells, macrophages, immunotherapy, checkpoint blockade, CAR-T, stroma",
        "keywords": [r"tumou?r microenvironment", r"\bt cells?\b|\bcd8\b|\bcd4\b", r"macrophage\w*", r"immun\w+",
                     r"\bpd-?1\b|\bpd-?l1\b|checkpoint (blockade|inhibitor)", r"\bcar-?t\b|chimeric antigen",
                     r"cytokine\w*", r"fibroblast\w*|\bcaf\b|stroma\w*", r"\bnk cells?\b", r"antigen"],
        "roots": [],
    },
    {
        "id": "metastasis",
        "label": "Metastasis, Invasion & EMT",
        "desc": "metastatic spread, invasion and migration, epithelial-mesenchymal transition, extracellular matrix",
        "keywords": [r"metasta\w+", r"invasi\w+", r"cell migration|\bmigrat\w+", r"\bemt\b|epithelial[- ]mesenchymal",
                     r"extracellular matrix|\becm\b", r"circulating tumou?r cells?", r"dissemina\w+"],
        "roots": [],
    },
    {
        "id": "genomics",
        "label": "Cancer Genomics, Evolution & Heterogeneity",
        "desc": "somatic mutations, clonal evolution, tumor heterogeneity, copy number, driver genes, cancer genome sequencing",
        "keywords": [r"somatic mutation\w*|mutational", r"clonal\w*|subclon\w+", r"tumou?r evolution|evolutionar\w+",
                     r"heterogene\w+", r"copy number", r"driver (gene|mutation)\w*", r"whole[- ]genome|whole[- ]exome",
                     r"pan-?cancer", r"\btp53\b|\bp53\b"],
        "roots": [],
    },
    {
        "id": "therapy",
        "label": "Drug Response, Resistance & Targeted Therapy",
        "desc": "targeted therapies, drug sensitivity and resistance mechanisms, combination therapy, synthetic lethality",
        "keywords": [r"resistan\w+", r"targeted therap\w+", r"inhibitor\w*", r"sensitivity|sensitiz\w+",
                     r"chemotherap\w+|cisplatin|paclitaxel|doxorubicin", r"combination therap\w+|synerg\w+",
                     r"synthetic lethal\w*", r"\bpdx\b|patient-derived xenograft"],
        "roots": [],
    },
    {
        "id": "metabolism",
        "label": "Cancer & Cell Metabolism",
        "desc": "glycolysis, mitochondrial metabolism, lipids, amino acids, redox and hypoxia in cells and tumors",
        "keywords": [r"metaboli\w+", r"glycoly\w+|warburg", r"mitochondri\w+|oxphos|oxidative phosphorylation",
                     r"lipid\w*|fatty acid", r"glutamin\w+|amino acid", r"\bnad\+?\b|redox|\bros\b|reactive oxygen",
                     r"hypoxi\w+|\bhif-?1"],
        "roots": [],
    },
    {
        "id": "regulation",
        "label": "Epigenetics, Transcription & RNA",
        "desc": "chromatin and DNA methylation, histone modifications, enhancers, transcription factors, RNA processing",
        "keywords": [r"epigene\w+", r"chromatin", r"dna methylation|methylat\w+", r"histone", r"enhancer\w*",
                     r"transcription factor\w*|transcriptional", r"splic\w+", r"lncrna|microrna|mirna|non-?coding",
                     r"\bm6a\b|rna-binding"],
        "roots": [],
    },
    {
        "id": "organelles",
        "label": "Cytoskeleton, Trafficking & Organelles",
        "desc": "cytoskeleton, membrane trafficking, organelles, autophagy, protein quality control and ubiquitin signaling",
        "keywords": [r"cytoskelet\w+|\bactin\b|microtubul\w+", r"traffick\w+|endocyt\w+|exocyt\w+|vesicle\w*",
                     r"golgi|endoplasmic reticulum|\ber stress\b", r"lysosom\w+", r"autophag\w+|mitophag\w+",
                     r"organelle\w*|cilia|cilium", r"ubiquitin\w*|proteasom\w+|proteostasis"],
        "roots": [],
    },
    {
        "id": "stem",
        "label": "Stem Cells, Differentiation & Development",
        "desc": "stem cells, differentiation and lineage, organoids, development, senescence and aging",
        "keywords": [r"stem cells?|stemness", r"differentiat\w+", r"organoid\w*", r"\bdevelopment(al)?\b|embryo\w*",
                     r"lineage", r"pluripoten\w+|\bipsc\w*", r"senescen\w+", r"\baging\b|ageing", r"regenerat\w+"],
        "roots": [],
    },
    {
        "id": "methods",
        "label": "Methods: Omics, Imaging & Screens",
        "desc": "single-cell and spatial omics, proteomics, imaging and microscopy, CRISPR screens, computational tools",
        "keywords": [r"single-?cell|scrna-?seq", r"spatial (transcriptom|omic)\w*", r"proteom\w+|mass spectrometr\w+",
                     r"microscop\w+|imaging", r"crispr screen\w*|genome-wide screen", r"\bpipeline\b|software|\btool\b",
                     r"deep learning|machine learning|computational", r"\bassay\b|protocol"],
        "roots": [],
    },
    {
        "id": "pharm",
        "label": "Pharmacology, Toxicology & Drug Discovery",
        "desc": "drug discovery, compound screening, pharmacokinetics, toxicity and safety, drug repurposing",
        "keywords": [r"pharmacokineti\w+|pharmacodynami\w+", r"toxic\w+", r"drug discovery|drug repurpos\w+",
                     r"compound\w*|small[- ]molecule", r"high-throughput screen\w*", r"\bdose\b|dose-dependent",
                     r"hepatotox\w+|cardiotox\w+|nephrotox\w+"],
        "roots": [],
    },
]

SURVEY_ROOTS = []
EXTRA_LANDMARKS = []
